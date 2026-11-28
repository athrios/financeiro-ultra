"use client";

import { CircleAlert, Loader2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";

import { FieldError } from "@/components/form/field-error";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  activeAliasesSignature,
  activeClientAliases,
  clientAliasItemsFromSaved,
  clientAliasesSignature,
  describeClientAliasItem,
  type ClientAliasItem,
  type ClientAliasType,
} from "@/domain/cadastros/client-aliases";
import {
  CLIENT_FORM_FIELDS,
  CLIENT_NOTES_MAX,
  NO_ACTIVE_PARTNERS_REASON,
  computeConfirmationChanges,
  describeErrorSummary,
  duplicateScopeSignature,
  listChangedValues,
  listFieldErrors,
  needsConfirmation,
  ownerLinkLabel,
  validateClientLocally,
  type ClientFormField,
  type ClientFormValues,
  type DocumentChoice,
  type PartnerChoice,
  type TypedValue,
} from "@/domain/cadastros/client-form";
import { clientDetailHref } from "@/domain/cadastros/client-view";

import { saveClientAction, type ClientFormState } from "../actions";
import { ClientAliasList } from "./client-alias-list";
import { ConfirmChangesDialog } from "./confirm-changes-dialog";
import { DocumentField } from "./document-field";
import { DuplicateWarning } from "./duplicate-warning";
import { MoneyField } from "./money-field";
import { PartnerPicker } from "./partner-picker";

export interface ClientFormInitial {
  id: string;
  legalName: string;
  tradeName: string;
  /** Rádio marcado conforme o documento gravado. */
  documentChoice: DocumentChoice;
  /** Número com máscara (vazio sem documento). */
  document: string;
  /** Documento canônico gravado, ou `null` (para saber se a edição mudou o documento). */
  documentCanonical: string | null;
  /** Mensalidade como o campo mostra ("1.500,00"). */
  monthlyValue: string;
  notes: string;
  active: boolean;
  /** Token de concorrência: devolvido tal como veio (texto, com microssegundos). */
  updatedAt: string;
  /** Sócios com indicação ativa. */
  partnerIds: string[];
  aliases: ReadonlyArray<{ id: string; type: ClientAliasType; displayValue: string; active: boolean }>;
}

interface ClientFormProps {
  /** Ausente = cliente novo. */
  initial?: ClientFormInitial;
  /** Sócios ativos (A a Z) e os inativos que ainda estão indicados. */
  partners: readonly PartnerChoice[];
  /** Para onde "Cancelar" volta (a lista ou o detalhe). */
  cancelHref: string;
}

const IDLE: ClientFormState = { status: "idle" };
const UNEXPECTED_MESSAGE = "Não foi possível salvar agora. Tente novamente em instantes.";

interface Snapshot {
  updatedAt: string | null;
  values: ClientFormValues;
  aliasSignature: string;
  documentCanonical: string | null;
}

function snapshotOf(initial: ClientFormInitial | undefined): Snapshot {
  const aliases = clientAliasItemsFromSaved(initial?.aliases ?? []);
  return {
    updatedAt: initial?.updatedAt ?? null,
    values: {
      legalName: initial?.legalName ?? "",
      tradeName: initial?.tradeName ?? "",
      choice: initial?.documentChoice ?? "NONE",
      document: initial?.document ?? "",
      monthlyValue: initial?.monthlyValue ?? "",
      notes: initial?.notes ?? "",
      partnerIds: initial?.partnerIds ?? [],
      aliases: activeClientAliases(aliases).map(describeClientAliasItem),
    },
    aliasSignature: clientAliasesSignature(aliases),
    documentCanonical: initial?.documentCanonical ?? null,
  };
}

/** Ids dos campos (alvos dos links do resumo de erros e do foco depois de um erro). */
function fieldIdsOf(baseId: string): Record<ClientFormField, string> {
  return {
    legalName: `${baseId}-nome`,
    tradeName: `${baseId}-fantasia`,
    document: `${baseId}-documento`,
    // O tipo (CPF, CNPJ, sem documento) é do mesmo grupo do número: o foco vai ao mesmo lugar.
    documentType: `${baseId}-documento`,
    monthlyValue: `${baseId}-mensalidade`,
    notes: `${baseId}-observacoes`,
    partnerIds: `${baseId}-socios`,
    aliases: `${baseId}-apelidos`,
  };
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");
}

/**
 * Formulário único de cliente (UI 4.1; um só "Salvar", salvamento atômico: `save_client` grava tudo ou
 * nada). Controlado, para o que foi digitado sobreviver a um erro do servidor (o React reinicia campos
 * não controlados depois de uma ação de formulário).
 *
 * Fluxos:
 *  - nome parecido (4.1.7): o servidor devolve a lista e NÃO grava; "Salvar mesmo assim" reenvia com a
 *    lista confirmada. Mudar o nome ou os apelidos depois do aviso o faz sumir;
 *  - edição que muda sócios ou documento (4.1.8): "Salvar alterações" abre o diálogo de confirmação, com
 *    "Motivo (opcional)", antes de enviar; as demais mudanças salvam direto;
 *  - conflito de edição (8.1 e 8.2): nada é sobrescrito; "Carregar versão atual" pede os dados novos à
 *    página (`router.refresh()`) e mostra "O que você tinha digitado";
 *  - alterações não salvas: "Cancelar" e os links de saída da tela pedem "Descartar as alterações?", e o
 *    navegador avisa ao fechar a aba.
 */
export function ClientForm({ initial, partners, cancelHref }: ClientFormProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(saveClientAction, IDLE);
  const formRef = useRef<HTMLFormElement>(null);
  const keyCounter = useRef(0);

  const isEdit = initial !== undefined;
  const clientActive = initial ? initial.active : true;

  const baseId = useId();
  const ids = fieldIdsOf(baseId);

  // Linha de base do "alterado?", da versão e da confirmação: a dos dados que abriram o formulário.
  const [base, setBase] = useState<Snapshot>(() => snapshotOf(initial));

  const [legalName, setLegalName] = useState(base.values.legalName);
  const [tradeName, setTradeName] = useState(base.values.tradeName);
  const [choice, setChoice] = useState<DocumentChoice>(base.values.choice);
  const [documentText, setDocumentText] = useState(base.values.document);
  const [monthlyValue, setMonthlyValue] = useState(base.values.monthlyValue);
  const [notes, setNotes] = useState(base.values.notes);
  const [partnerIds, setPartnerIds] = useState<string[]>([...base.values.partnerIds]);
  const [aliasItems, setAliasItems] = useState<ClientAliasItem[]>(() => clientAliasItemsFromSaved(initial?.aliases ?? []));
  const [reason, setReason] = useState("");

  const nameOf = (id: string) => partners.find((partner) => partner.id === id)?.name ?? null;

  const currentValues: ClientFormValues = {
    legalName,
    tradeName,
    choice,
    document: documentText,
    monthlyValue,
    notes,
    partnerIds,
    aliases: activeClientAliases(aliasItems).map(describeClientAliasItem),
  };

  // Diálogo de confirmação (4.1.8). Aberto numa resposta: só continua aberto se for conflito (8.2).
  const [dialog, setDialog] = useState<{ open: boolean; since: ClientFormState }>({ open: false, since: IDLE });

  // Conflito: "Carregar versão atual".
  const [reloading, setReloading] = useState<TypedValue[] | null>(null);
  const [typedBefore, setTypedBefore] = useState<TypedValue[] | null>(null);
  const [dismissedState, setDismissedState] = useState<ClientFormState | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // Última confirmação do diálogo 4.1.8 (a confirmação vale só para aquele conjunto de mudanças).
  const confirmedRef = useRef<string | null>(null);

  // A página devolveu dados novos (a versão mudou). Ajuste de estado durante a renderização, o padrão
  // do React para derivar estado de uma prop que mudou.
  if (reloading && initial && initial.updatedAt !== base.updatedAt) {
    const fresh = snapshotOf(initial);
    setBase(fresh);
    setLegalName(fresh.values.legalName);
    setTradeName(fresh.values.tradeName);
    setChoice(fresh.values.choice);
    setDocumentText(fresh.values.document);
    setMonthlyValue(fresh.values.monthlyValue);
    setNotes(fresh.values.notes);
    setPartnerIds([...fresh.values.partnerIds]);
    setAliasItems(clientAliasItemsFromSaved(initial.aliases));
    setReason("");
    setTypedBefore(reloading);
    setReloading(null);
    setDismissedState(state);
    setDialog({ open: false, since: state });
    setAnnouncement("Dados atualizados. Confira e refaça a sua alteração.");
  }

  const visibleState = state === dismissedState ? IDLE : state;
  const error = visibleState.status === "error" ? visibleState : null;
  const isStale = error?.error.hint === "STALE_VERSION";
  const duplicates = error?.error.details?.hint === "POSSIBLE_DUPLICATE" ? error.error.details.matches : null;
  const owner =
    error?.error.details?.hint === "DOCUMENT_TAKEN" || error?.error.details?.hint === "ALIAS_TAKEN"
      ? error.error.details.owner
      : null;

  // Aviso de nome parecido: vale só para o nome e os apelidos que foram enviados (UI 4.1.7).
  const scopeNow = duplicateScopeSignature(legalName, activeAliasesSignature(aliasItems));
  const [submittedScope, setSubmittedScope] = useState<string | null>(null);
  const duplicateVisible = duplicates !== null && submittedScope === scopeNow;

  // Erros do servidor somem do campo quando a pessoa o edita (até a próxima resposta).
  const [cleared, setCleared] = useState<{ state: ClientFormState | null; fields: ReadonlySet<ClientFormField> }>({
    state: null,
    fields: new Set(),
  });
  function touch(field: ClientFormField) {
    setCleared((previous) => ({
      state,
      fields: new Set([
        ...(previous.state === state ? previous.fields : []),
        field,
        ...(field === "document" ? (["documentType"] as const) : []),
      ]),
    }));
  }
  const serverErrors: Partial<Record<ClientFormField, string>> = {};
  if (error && !isStale && !duplicates) {
    for (const field of CLIENT_FORM_FIELDS) {
      const message = error.fieldErrors[field];
      if (message && !(cleared.state === state && cleared.fields.has(field))) serverErrors[field] = message;
    }
  }

  // Conferência ao sair do campo, depois do primeiro envio (UI 4.1 e 4.1.9).
  const [submitted, setSubmitted] = useState(false);
  const [blurred, setBlurred] = useState<ReadonlySet<ClientFormField>>(new Set());
  const markBlurred = (field: ClientFormField) => setBlurred((previous) => new Set(previous).add(field));
  const local = validateClientLocally({
    legalName,
    choice,
    document: documentText,
    monthlyValue,
    partnerCount: partnerIds.length,
    clientActive,
  });
  const errorFor = (field: ClientFormField): string | null =>
    (submitted && blurred.has(field) && (field === "legalName" || field === "document" || field === "monthlyValue")
      ? local[field]
      : undefined) ??
    serverErrors[field] ??
    // Erro do tipo de documento (só chega por envio forjado) aparece no campo de documento.
    (field === "document" ? (serverErrors.documentType ?? null) : null) ??
    null;

  const dirty =
    legalName !== base.values.legalName ||
    tradeName !== base.values.tradeName ||
    choice !== base.values.choice ||
    documentText !== base.values.document ||
    monthlyValue !== base.values.monthlyValue ||
    notes !== base.values.notes ||
    !sameIds(partnerIds, base.values.partnerIds) ||
    clientAliasesSignature(aliasItems) !== base.aliasSignature;

  // Aviso do navegador ao fechar a aba com alterações não salvas (UI 4.1.9; não vale para a navegação interna).
  useEffect(() => {
    if (!dirty || pending) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);

  const dialogOpen = dialog.open && (state === dialog.since || isStale);
  const staleInDialog = dialogOpen && isStale;

  const changes = computeConfirmationChanges(
    { partnerIds: base.values.partnerIds, document: base.documentCanonical },
    { partnerIds, choice, documentText },
    nameOf,
  );
  // A confirmação vale para estas mudanças, sobre esta versão do cadastro (carregar a versão atual a invalida).
  const changesSignature = `${base.updatedAt}|${JSON.stringify(changes)}`;

  // Depois de uma resposta com erro, o foco vai ao aviso, ao resumo (vários erros) ou ao campo (um só).
  const summaryRef = useRef<HTMLDivElement>(null);
  const conflictRef = useRef<HTMLDivElement>(null);
  const warningRef = useRef<HTMLDivElement>(null);
  const legalNameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state.status !== "error" || state === dismissedState) return;
    if (state.error.hint === "STALE_VERSION") {
      conflictRef.current?.focus();
      return;
    }
    if (state.error.hint === "POSSIBLE_DUPLICATE") {
      warningRef.current?.focus();
      return;
    }
    const fields = listFieldErrors(state.fieldErrors);
    if (fields.length === 1) {
      const id = fieldIdsOf(baseId)[fields[0].field];
      const target = document.getElementById(`${id}-numero`) ?? document.getElementById(id);
      if (target) {
        target.focus();
        return;
      }
    }
    summaryRef.current?.focus();
  }, [state, dismissedState, baseId]);

  const [discardHref, setDiscardHref] = useState<string | null>(null);

  function guardedNavigate(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (!dirty) return;
    event.preventDefault();
    setDiscardHref(href);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    setSubmitted(true);
    setSubmittedScope(scopeNow);
    // Edição que muda sócios ou documento pede a confirmação antes de enviar (4.1.8), desde que o que a
    // tela consegue conferir esteja certo: com erro à vista, o envio mostra os erros e nada é salvo.
    if (!isEdit || !needsConfirmation(changes)) return;
    if (confirmedRef.current === changesSignature) return;
    if (Object.keys(local).length > 0) return;
    event.preventDefault();
    setDialog({ open: true, since: state });
  }

  function confirmFromDialog() {
    confirmedRef.current = changesSignature;
    formRef.current?.requestSubmit();
  }

  function loadCurrentVersion() {
    setReloading(listChangedValues(base.values, currentValues, nameOf));
    setDialog({ open: false, since: state });
    startTransition(() => router.refresh());
  }

  function cancel() {
    if (dirty) setDiscardHref(cancelHref);
    else router.push(cancelHref);
  }

  const summaryItems = listFieldErrors(serverErrors);
  const summaryTitle =
    error?.error.code === "UNEXPECTED"
      ? UNEXPECTED_MESSAGE
      : describeErrorSummary(summaryItems.length, error?.error.message ?? "");

  const ownerLink = (field: ClientFormField) =>
    owner && error?.error.field === field && serverErrors[field] ? (
      <Link
        href={clientDetailHref(owner.id)}
        onClick={(event) => guardedNavigate(event, clientDetailHref(owner.id))}
        className="inline-flex min-h-11 w-fit items-center rounded-sm text-sm underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring md:min-h-8"
      >
        {ownerLinkLabel(owner)}
      </Link>
    ) : null;

  const noActivePartners = clientActive && !partners.some((partner) => partner.active) && partnerIds.length === 0;
  const blockedReasonId = `${baseId}-bloqueio`;
  const submitLabel = isEdit ? "Salvar alterações" : "Salvar cliente";
  const nameError = errorFor("legalName");
  const tradeNameError = errorFor("tradeName");
  const notesError = errorFor("notes");

  return (
    <>
      <form ref={formRef} action={formAction} onSubmit={handleSubmit} noValidate className="grid max-w-2xl gap-6">
        {initial && <input type="hidden" name="id" value={initial.id} />}
        {initial && <input type="hidden" name="expectedUpdatedAt" value={initial.updatedAt} />}
        {isEdit && <input type="hidden" name="reason" value={reason} />}
        {duplicateVisible &&
          duplicates?.map((match) => <input key={match.id} type="hidden" name="acknowledgedDuplicateIds" value={match.id} />)}

        {error && isStale && !dialogOpen && (
          <div ref={conflictRef} tabIndex={-1} className="outline-none focus-visible:ring-3 focus-visible:ring-ring">
            <Alert variant="warning" role="alert">
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>Este cadastro foi alterado por outra pessoa</AlertTitle>
              <AlertDescription>
                <p>{error.error.message}</p>
                <p>Carregue a versão atual e refaça a sua alteração.</p>
                <Button type="button" disabled={reloading !== null} onClick={loadCurrentVersion} className="mt-3 h-11 md:h-9">
                  {reloading !== null ? (
                    <>
                      <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />
                      Carregando…
                    </>
                  ) : (
                    "Carregar versão atual"
                  )}
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        )}

        {error && !isStale && !duplicates && (
          <div ref={summaryRef} tabIndex={-1} className="outline-none focus-visible:ring-3 focus-visible:ring-ring">
            <Alert variant="destructive" role="alert">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>{summaryTitle}</AlertTitle>
              {summaryItems.length > 1 && (
                <AlertDescription>
                  <ul className="list-disc pl-4">
                    {summaryItems.map((item) => (
                      <li key={item.field}>
                        <a href={`#${ids[item.field]}`} className="underline underline-offset-3">
                          {item.label}: {item.message}
                        </a>
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              )}
              {error.supportCode && (
                <AlertDescription>
                  Código de suporte: <code className="font-mono select-all">{error.supportCode}</code>
                </AlertDescription>
              )}
            </Alert>
          </div>
        )}

        {duplicateVisible && duplicates && (
          <DuplicateWarning
            matches={duplicates}
            pending={pending}
            containerRef={warningRef}
            onReview={() => legalNameRef.current?.focus()}
            onNavigate={guardedNavigate}
          />
        )}

        {typedBefore && typedBefore.length > 0 && (
          <details open className="rounded-lg border bg-background px-3 py-2 text-sm">
            <summary className="min-h-8 cursor-pointer font-medium">O que você tinha digitado</summary>
            <dl className="mt-2 grid gap-1">
              {typedBefore.map((item) => (
                <div key={item.label}>
                  <dt className="text-xs text-muted-foreground">{item.label}</dt>
                  <dd className="break-words">{item.text}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}

        <fieldset className="grid min-w-0 gap-4">
          <legend className="mb-1 text-base font-medium">Identificação</legend>

          <div className="grid gap-2">
            <Label htmlFor={ids.legalName}>
              Nome ou razão social <span aria-hidden="true">*</span>
            </Label>
            <Input
              ref={legalNameRef}
              id={ids.legalName}
              name="legalName"
              value={legalName}
              required
              aria-required="true"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={[`${ids.legalName}-ajuda`, nameError ? `${ids.legalName}-erro` : null].filter(Boolean).join(" ")}
              autoComplete="off"
              disabled={pending}
              autoFocus={!isEdit}
              onChange={(event) => {
                setLegalName(event.target.value);
                touch("legalName");
              }}
              onBlur={() => markBlurred("legalName")}
              className="h-11 md:h-9"
            />
            <p id={`${ids.legalName}-ajuda`} className="text-xs text-muted-foreground">
              Como o cliente aparece no contrato ou no comprovante.
            </p>
            {nameError && <FieldError id={`${ids.legalName}-erro`}>{nameError}</FieldError>}
          </div>

          <div className="grid gap-2">
            <Label htmlFor={ids.tradeName}>Nome fantasia</Label>
            <Input
              id={ids.tradeName}
              name="tradeName"
              value={tradeName}
              aria-invalid={tradeNameError ? true : undefined}
              aria-describedby={tradeNameError ? `${ids.tradeName}-erro` : undefined}
              autoComplete="off"
              disabled={pending}
              onChange={(event) => {
                setTradeName(event.target.value);
                touch("tradeName");
              }}
              className="h-11 md:h-9"
            />
            {tradeNameError && <FieldError id={`${ids.tradeName}-erro`}>{tradeNameError}</FieldError>}
          </div>
        </fieldset>

        <DocumentField
          id={ids.document}
          choice={choice}
          onChoiceChange={(next) => {
            // Trocar de tipo esvazia o número (nunca corta em silêncio um número digitado).
            setChoice(next);
            setDocumentText("");
            touch("document");
          }}
          value={documentText}
          onValueChange={(next) => {
            setDocumentText(next);
            touch("document");
          }}
          onBlur={() => markBlurred("document")}
          error={errorFor("document")}
          errorAction={ownerLink("document")}
          disabled={pending}
        />

        <fieldset className="grid min-w-0 gap-4">
          <legend className="mb-1 text-base font-medium">Mensalidade</legend>
          <MoneyField
            id={ids.monthlyValue}
            value={monthlyValue}
            onChange={(next) => {
              setMonthlyValue(next);
              touch("monthlyValue");
            }}
            onBlur={() => markBlurred("monthlyValue")}
            error={errorFor("monthlyValue")}
            disabled={pending}
          />
        </fieldset>

        <PartnerPicker
          id={ids.partnerIds}
          partners={partners}
          selectedIds={partnerIds}
          onChange={(next) => {
            setPartnerIds(next);
            touch("partnerIds");
          }}
          clientActive={clientActive}
          isEdit={isEdit}
          error={errorFor("partnerIds")}
          disabled={pending}
        />

        <div className="grid gap-2">
          <Label htmlFor={ids.notes}>Observações</Label>
          <Textarea
            id={ids.notes}
            name="notes"
            rows={3}
            value={notes}
            autoComplete="off"
            disabled={pending}
            aria-invalid={notesError ? true : undefined}
            aria-describedby={[`${ids.notes}-ajuda`, notesError ? `${ids.notes}-erro` : null].filter(Boolean).join(" ")}
            onChange={(event) => {
              setNotes(event.target.value);
              touch("notes");
            }}
            className="min-h-20"
          />
          <p id={`${ids.notes}-ajuda`} className="flex justify-between gap-2 text-xs text-muted-foreground">
            <span>Opcional. Anotações internas sobre o cliente.</span>
            <span aria-hidden="true" className="shrink-0 tabular-nums">
              {notes.length} de {CLIENT_NOTES_MAX}
            </span>
          </p>
          {notesError && <FieldError id={`${ids.notes}-erro`}>{notesError}</FieldError>}
        </div>

        <ClientAliasList
          id={ids.aliases}
          items={aliasItems}
          onItemsChange={(next) => {
            setAliasItems(next);
            touch("aliases");
          }}
          makeKey={() => `novo-${++keyCounter.current}`}
          error={errorFor("aliases")}
          errorAction={ownerLink("aliases")}
          disabled={pending}
        />

        <div className="grid gap-2">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-start">
            <Button type="button" variant="outline" disabled={pending} onClick={cancel} className="h-11 md:h-9">
              Cancelar
            </Button>
            {!duplicateVisible && (
              <Button
                type="submit"
                disabled={pending || noActivePartners}
                aria-describedby={noActivePartners ? blockedReasonId : undefined}
                className="h-11 md:h-9"
              >
                {pending ? (
                  <>
                    <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />
                    Salvando…
                  </>
                ) : (
                  submitLabel
                )}
              </Button>
            )}
          </div>
          {noActivePartners && (
            <p id={blockedReasonId} className="text-sm text-muted-foreground">
              {NO_ACTIVE_PARTNERS_REASON}
            </p>
          )}
        </div>

        <p role="status" className="sr-only">
          {announcement}
        </p>
      </form>

      {isEdit && (
        <ConfirmChangesDialog
          open={dialogOpen}
          onOpenChange={(open) => setDialog({ open, since: state })}
          clientName={legalName.trim() || (initial?.legalName ?? "")}
          changes={changes}
          reason={reason}
          onReasonChange={setReason}
          pending={pending}
          stale={staleInDialog}
          onConfirm={confirmFromDialog}
          onReload={loadCurrentVersion}
        />
      )}

      <AlertDialog open={discardHref !== null} onOpenChange={(open) => !open && setDiscardHref(null)}>
        <DiscardDialogContent
          onKeepEditing={() => setDiscardHref(null)}
          onDiscard={() => {
            const target = discardHref;
            setDiscardHref(null);
            if (target) router.push(target);
          }}
        />
      </AlertDialog>
    </>
  );
}

function DiscardDialogContent({ onKeepEditing, onDiscard }: { onKeepEditing: () => void; onDiscard: () => void }) {
  const keepRef = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialogContent initialFocus={keepRef}>
      <AlertDialogHeader className="pb-4">
        <AlertDialogTitle>Descartar as alterações?</AlertDialogTitle>
        <AlertDialogDescription>O que você digitou não será salvo.</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <Button ref={keepRef} type="button" onClick={onKeepEditing} className="h-11 md:h-9">
          Continuar editando
        </Button>
        <Button type="button" variant="outline" onClick={onDiscard} className="h-11 md:h-9">
          Descartar
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}
