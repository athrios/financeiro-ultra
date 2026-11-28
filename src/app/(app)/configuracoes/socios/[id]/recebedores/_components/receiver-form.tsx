"use client";

import { CircleAlert, Info, Loader2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useId, useRef, useState } from "react";

import { FormMessage } from "@/components/auth/form-message";
import { EditableTextList } from "@/components/form/editable-text-list";
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
import { activeValues, itemsSignature, type EditableItem } from "@/domain/cadastros/editable-list";
import { NAME_VARIANTS_LIMIT, PIX_KEYS_LIMIT } from "@/domain/cadastros/limits";
import { receiverFieldOfError, type ReceiverFormField } from "@/domain/cadastros/receiver-form";
import {
  DUPLICATE_PIX_MESSAGE,
  DUPLICATE_VARIANT_MESSAGE,
  EMPTY_PIX_MESSAGE,
  EMPTY_VARIANT_MESSAGE,
  accountsSignature,
  activeAccounts,
  describeAccount,
  listsFromIdentifiers,
  normalizePixKey,
  type AccountItem,
  type SavedIdentifier,
} from "@/domain/cadastros/receiver-identifiers";
import {
  RECEIVER_FIELD_LABELS,
  RECEIVER_INACTIVE_BANNER,
  RECEIVER_PRIVACY_NOTICE,
  receiverFailureSummary,
  receiverHref,
  receiverPartnerContext,
  receiverPartnerInactiveBanner,
} from "@/domain/cadastros/receiver-view";

import { saveReceiverAction, type ReceiverFormState } from "../actions";
import { AccountList } from "./account-list";

export interface ReceiverFormInitial {
  id: string;
  holderName: string;
  active: boolean;
  /** Token de concorrência: devolvido tal como veio (texto, com microssegundos). */
  updatedAt: string;
  /** Todos os identificadores, ativos e inativos. */
  identifiers: SavedIdentifier[];
}

interface ReceiverFormProps {
  /** O sócio dono: vem da rota e não muda (R-R02). */
  partner: { id: string; name: string; active: boolean };
  /** Ausente = recebedor novo. */
  initial?: ReceiverFormInitial;
  /** Para onde "Cancelar" volta (o detalhe do sócio). */
  cancelHref: string;
}

interface Typed {
  holderName: string;
  variants: string[];
  pixKeys: string[];
  accounts: string[];
}

const IDLE: ReceiverFormState = { status: "idle" };

const VARIANT_OPTIONS = {
  emptyMessage: EMPTY_VARIANT_MESSAGE,
  duplicateMessage: DUPLICATE_VARIANT_MESSAGE,
  limit: NAME_VARIANTS_LIMIT,
};
const PIX_OPTIONS = {
  normalize: normalizePixKey,
  emptyMessage: EMPTY_PIX_MESSAGE,
  duplicateMessage: DUPLICATE_PIX_MESSAGE,
  limit: PIX_KEYS_LIMIT,
};

/**
 * Formulário único do recebedor, em página (UI 7): titular, outras formas do nome, chaves Pix e
 * contas, com um só "Salvar" (`save_receiver` grava tudo ou nada). Sem CPF/CNPJ do titular (RAT-D023).
 * Tudo é controlado, para o que foi digitado sobreviver a um erro do servidor.
 *
 * Conflito de edição (UI 8.1): igual ao do sócio. "Carregar versão atual" pede os dados novos à página
 * (`router.refresh()`), troca os campos e mostra "O que você tinha digitado".
 */
export function ReceiverForm({ partner, initial, cancelHref }: ReceiverFormProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(saveReceiverAction, IDLE);

  const [holderName, setHolderName] = useState(initial?.holderName ?? "");
  const [variants, setVariants] = useState<EditableItem[]>(() => listsFromIdentifiers(initial?.identifiers ?? []).variants);
  const [pixKeys, setPixKeys] = useState<EditableItem[]>(() => listsFromIdentifiers(initial?.identifiers ?? []).pixKeys);
  const [accounts, setAccounts] = useState<AccountItem[]>(() => listsFromIdentifiers(initial?.identifiers ?? []).accounts);
  const keyCounter = useRef(0);

  // Linha de base do "alterado?" e da versão: a dos dados que abriram o formulário.
  const [base, setBase] = useState(() => {
    const lists = listsFromIdentifiers(initial?.identifiers ?? []);
    return {
      updatedAt: initial?.updatedAt ?? null,
      holderName: initial?.holderName ?? "",
      signature: signatureOf(lists.variants, lists.pixKeys, lists.accounts),
    };
  });
  const [reloading, setReloading] = useState<Typed | null>(null);
  const [typedBefore, setTypedBefore] = useState<Typed | null>(null);
  const [dismissedState, setDismissedState] = useState<ReceiverFormState | null>(null);
  const [announcement, setAnnouncement] = useState("");

  // "Carregar versão atual": a página devolveu dados novos (a versão mudou). Ajuste de estado durante a
  // renderização, o padrão do React para derivar estado de uma prop que mudou.
  if (reloading && initial && initial.updatedAt !== base.updatedAt) {
    const fresh = listsFromIdentifiers(initial.identifiers);
    setBase({ updatedAt: initial.updatedAt, holderName: initial.holderName, signature: signatureOf(fresh.variants, fresh.pixKeys, fresh.accounts) });
    setHolderName(initial.holderName);
    setVariants(fresh.variants);
    setPixKeys(fresh.pixKeys);
    setAccounts(fresh.accounts);
    setTypedBefore(reloading);
    setReloading(null);
    setDismissedState(state);
    setAnnouncement("Dados atualizados. Confira e refaça a sua alteração.");
  }

  const visibleState = state === dismissedState ? IDLE : state;
  const error = visibleState.status === "error" ? visibleState : null;
  const isStale = error?.error.hint === "STALE_VERSION";

  const dirty = holderName !== base.holderName || signatureOf(variants, pixKeys, accounts) !== base.signature;

  // Aviso do navegador ao fechar a aba com alterações não salvas (não vale para a navegação interna).
  useEffect(() => {
    if (!dirty || pending) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);

  // Depois de um erro, o foco vai ao resumo (ou ao aviso de conflito).
  const summaryRef = useRef<HTMLDivElement>(null);
  const conflictRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status !== "error" || state === dismissedState) return;
    if (state.error.hint === "STALE_VERSION") conflictRef.current?.focus();
    else summaryRef.current?.focus();
  }, [state, dismissedState]);

  const [discardOpen, setDiscardOpen] = useState(false);

  const holderId = useId();
  const holderHelpId = `${holderId}-ajuda`;
  const holderErrorId = `${holderId}-erro`;
  const fieldErrors = error?.fieldErrors ?? {};
  const holderError = fieldErrors.holderName ?? null;
  const errorField: ReceiverFormField | null = error ? receiverFieldOfError(error.error) : null;

  const fieldEntries = (Object.entries(fieldErrors) as Array<[ReceiverFormField, string]>).filter(([, message]) => Boolean(message));
  const ownerLink = ownerLinkOf(error?.error.details);

  function loadCurrentVersion() {
    setReloading({
      holderName,
      variants: activeValues(variants),
      pixKeys: activeValues(pixKeys),
      accounts: activeAccounts(accounts).map(describeAccount),
    });
    startTransition(() => router.refresh());
  }

  function cancel() {
    if (dirty) setDiscardOpen(true);
    else router.push(cancelHref);
  }

  const isEdit = initial !== undefined;
  const submitLabel = isEdit ? "Salvar alterações" : "Salvar recebedor";
  const makeKey = () => `novo-${++keyCounter.current}`;

  return (
    <>
      <form action={formAction} noValidate className="grid max-w-2xl gap-6">
        {initial && <input type="hidden" name="id" value={initial.id} />}
        {initial && <input type="hidden" name="expectedUpdatedAt" value={initial.updatedAt} />}
        <input type="hidden" name="partnerId" value={partner.id} />

        <div className="grid gap-1 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <p>
            Sócio: <strong className="font-semibold">{partner.name}</strong>
          </p>
          <p className="text-muted-foreground">{receiverPartnerContext(partner.name, isEdit)}</p>
        </div>

        <Alert variant="info" role="note">
          <Info aria-hidden="true" />
          <AlertDescription>{RECEIVER_PRIVACY_NOTICE}</AlertDescription>
        </Alert>

        {initial && !initial.active && <FormMessage tone="info">{RECEIVER_INACTIVE_BANNER}</FormMessage>}
        {initial && !partner.active && <FormMessage tone="info">{receiverPartnerInactiveBanner(partner.name)}</FormMessage>}

        {error && isStale && (
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

        {error && !isStale && (
          <div ref={summaryRef} tabIndex={-1} className="outline-none focus-visible:ring-3 focus-visible:ring-ring">
            <Alert variant="destructive" role="alert">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>{fieldEntries.length === 0 ? error.error.message : receiverFailureSummary(fieldEntries.length)}</AlertTitle>
              {fieldEntries.length > 1 && (
                <AlertDescription>
                  <ul className="list-disc pl-4">
                    {fieldEntries.map(([field, message]) => (
                      <li key={field}>
                        {field === "holderName" ? (
                          <a href={`#${holderId}`} className="underline underline-offset-3">
                            {RECEIVER_FIELD_LABELS[field]}: {message}
                          </a>
                        ) : (
                          <>
                            {RECEIVER_FIELD_LABELS[field]}: {message}
                          </>
                        )}
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

        {typedBefore && (
          <details open className="rounded-lg border bg-background px-3 py-2 text-sm">
            <summary className="min-h-8 cursor-pointer font-medium">O que você tinha digitado</summary>
            <dl className="mt-2 grid gap-1">
              <TypedRow label="Nome do titular" values={typedBefore.holderName ? [typedBefore.holderName] : []} />
              <TypedRow label="Outras formas do nome" values={typedBefore.variants} />
              <TypedRow label="Chaves Pix" values={typedBefore.pixKeys} />
              <TypedRow label="Contas bancárias" values={typedBefore.accounts} />
            </dl>
          </details>
        )}

        <div className="grid gap-2">
          <Label htmlFor={holderId}>
            Nome do titular <span aria-hidden="true">*</span>
          </Label>
          <Input
            id={holderId}
            name="holderName"
            value={holderName}
            required
            aria-required="true"
            aria-invalid={holderError ? true : undefined}
            aria-describedby={[holderHelpId, holderError ? holderErrorId : null].filter(Boolean).join(" ")}
            autoComplete="off"
            disabled={pending}
            onChange={(event) => setHolderName(event.target.value)}
            className="h-11 md:h-9"
            autoFocus={!isEdit}
          />
          <p id={holderHelpId} className="text-xs text-muted-foreground">
            Como o nome aparece no comprovante.
          </p>
          {holderError && <FieldError id={holderErrorId}>{holderError}</FieldError>}
        </div>

        <EditableTextList
          legend="Outras formas do nome"
          help="Outras formas como o nome pode aparecer, por exemplo abreviado ou sem acento. Ex.: S. Alfa."
          noun="forma do nome"
          addLabel="Nova forma do nome"
          items={variants}
          onItemsChange={setVariants}
          makeKey={makeKey}
          fieldName="variants"
          error={fieldErrors.variants ?? null}
          errorAction={errorField === "variants" ? ownerLink : null}
          disabled={pending}
          feminine
          addOptions={VARIANT_OPTIONS}
        />

        <EditableTextList
          legend="Chaves Pix"
          help="Digite a chave exatamente como aparece no comprovante. Pode ser CPF, CNPJ, e-mail, telefone ou chave aleatória."
          noun="chave Pix"
          addLabel="Nova chave Pix"
          items={pixKeys}
          onItemsChange={setPixKeys}
          makeKey={makeKey}
          fieldName="pixKeys"
          error={fieldErrors.pixKeys ?? null}
          errorAction={errorField === "pixKeys" ? ownerLink : null}
          disabled={pending}
          feminine
          addOptions={PIX_OPTIONS}
        />

        <AccountList
          items={accounts}
          onItemsChange={setAccounts}
          makeKey={makeKey}
          error={fieldErrors.accounts ?? null}
          errorAction={errorField === "accounts" ? ownerLink : null}
          disabled={pending}
        />

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-start">
          <Button type="button" variant="outline" disabled={pending} onClick={cancel} className="h-11 md:h-9">
            Cancelar
          </Button>
          <Button type="submit" disabled={pending} className="h-11 md:h-9">
            {pending ? (
              <>
                <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />
                Salvando…
              </>
            ) : (
              submitLabel
            )}
          </Button>
        </div>

        <p role="status" className="sr-only">
          {announcement}
        </p>
      </form>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DiscardDialogContent
          onKeepEditing={() => setDiscardOpen(false)}
          onDiscard={() => {
            setDiscardOpen(false);
            router.push(cancelHref);
          }}
        />
      </AlertDialog>
    </>
  );
}

function signatureOf(variants: readonly EditableItem[], pixKeys: readonly EditableItem[], accounts: readonly AccountItem[]): string {
  return [itemsSignature(variants), itemsSignature(pixKeys), accountsSignature(accounts)].join("#");
}

function TypedRow({ label, values }: { label: string; values: readonly string[] }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words">{values.length > 0 ? values.join(", ") : "—"}</dd>
    </div>
  );
}

/** Link para quem já tem o valor repetido: "Abrir recebedor" (UI 7.2) ou "Abrir sócio" (nome de sócio). */
function ownerLinkOf(details: Extract<ReceiverFormState, { status: "error" }>["error"]["details"]) {
  if (!details) return null;
  const className =
    "inline-flex min-h-11 w-fit items-center rounded-sm text-sm underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring md:min-h-8";

  if (details.hint === "IDENTIFIER_TAKEN" && details.owner.kind === "receiver" && details.owner.partnerId) {
    return (
      <Link href={receiverHref(details.owner.partnerId, details.owner.id)} className={className}>
        Abrir recebedor
      </Link>
    );
  }
  if (details.hint === "PARTNER_NAME_TAKEN" && details.owner.kind === "partner") {
    return (
      <Link href={`/configuracoes/socios/${details.owner.id}`} className={className}>
        {details.owner.active ? "Abrir sócio" : "Abrir sócio inativo"}
      </Link>
    );
  }
  return null;
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
