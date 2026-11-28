"use client";

import { CircleAlert, Loader2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useRef, useState, startTransition } from "react";

import { EditableTextList } from "@/components/form/editable-text-list";
import { FieldError } from "@/components/form/field-error";
import { FormMessage } from "@/components/auth/form-message";
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
import { activeValues, itemsFromSaved, itemsSignature, type EditableItem } from "@/domain/cadastros/editable-list";
import { PARTNER_ALIASES_LIMIT } from "@/domain/cadastros/limits";

import { savePartnerAction, type PartnerFormState } from "../actions";

export interface PartnerFormInitial {
  id: string;
  name: string;
  active: boolean;
  /** Token de concorrência: devolvido tal como veio (texto, com microssegundos). */
  updatedAt: string;
  aliases: ReadonlyArray<{ id: string; value: string; active: boolean }>;
}

interface PartnerFormProps {
  /** Ausente = sócio novo. */
  initial?: PartnerFormInitial;
  /** Para onde "Cancelar" volta (a lista ou o detalhe). */
  cancelHref: string;
}

const IDLE: PartnerFormState = { status: "idle" };

const ALIAS_OPTIONS = { limit: PARTNER_ALIASES_LIMIT };

/**
 * Formulário único de nome e apelidos do sócio, com um só "Salvar" (UI 5.2; salvamento atômico:
 * `save_partner` grava tudo ou nada). Tudo é controlado, para o que foi digitado sobreviver a um erro
 * do servidor (o React reinicia campos não controlados depois de uma ação de formulário).
 *
 * Conflito de edição (UI 8.1): quando outra pessoa salvou antes, o servidor recusa e nada é
 * sobrescrito; "Carregar versão atual" pede os dados novos à página (`router.refresh()`), troca os
 * campos pelos valores atuais e mostra o que a pessoa tinha digitado, para ela refazer a alteração.
 */
export function PartnerForm({ initial, cancelHref }: PartnerFormProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(savePartnerAction, IDLE);

  const [name, setName] = useState(initial?.name ?? "");
  const [items, setItems] = useState<EditableItem[]>(() => itemsFromSaved(initial?.aliases ?? []));
  const keyCounter = useRef(0);

  // Linha de base do "alterado?" e da versão: a dos dados que abriram o formulário.
  const [base, setBase] = useState({
    updatedAt: initial?.updatedAt ?? null,
    name: initial?.name ?? "",
    signature: itemsSignature(itemsFromSaved(initial?.aliases ?? [])),
  });
  const [reloading, setReloading] = useState<{ name: string; aliases: string[] } | null>(null);
  const [typedBefore, setTypedBefore] = useState<{ name: string; aliases: string[] } | null>(null);
  const [dismissedState, setDismissedState] = useState<PartnerFormState | null>(null);
  const [announcement, setAnnouncement] = useState("");

  // "Carregar versão atual": a página devolveu dados novos (a versão mudou). Ajuste de estado durante
  // a renderização, o padrão do React para derivar estado de uma prop que mudou.
  if (reloading && initial && initial.updatedAt !== base.updatedAt) {
    const fresh = itemsFromSaved(initial.aliases);
    setBase({ updatedAt: initial.updatedAt, name: initial.name, signature: itemsSignature(fresh) });
    setName(initial.name);
    setItems(fresh);
    setTypedBefore(reloading);
    setReloading(null);
    setDismissedState(state);
    setAnnouncement("Dados atualizados. Confira e refaça a sua alteração.");
  }

  const visibleState = state === dismissedState ? IDLE : state;
  const error = visibleState.status === "error" ? visibleState : null;
  const isStale = error?.error.hint === "STALE_VERSION";

  const dirty = name !== base.name || itemsSignature(items) !== base.signature;

  // Aviso do navegador ao fechar a aba com alterações não salvas (UI 4.1.9; não vale para a navegação interna).
  useEffect(() => {
    if (!dirty || pending) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);

  // Depois de um erro, o foco vai ao resumo (vários erros ou erro geral) ou ao campo (um só).
  const summaryRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const conflictRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status !== "error" || state === dismissedState) return;
    if (state.error.hint === "STALE_VERSION") conflictRef.current?.focus();
    else summaryRef.current?.focus();
  }, [state, dismissedState]);

  const [discardOpen, setDiscardOpen] = useState(false);

  const nameId = useId();
  const nameHelpId = `${nameId}-ajuda`;
  const nameErrorId = `${nameId}-erro`;
  const nameError = error?.fieldErrors.name ?? null;
  const aliasesError = error?.fieldErrors.aliases ?? null;

  const fieldMessages = Object.values(error?.fieldErrors ?? {}).filter(Boolean);
  const takenOwner =
    error?.error.details?.hint === "PARTNER_NAME_TAKEN" && error.error.details.owner.kind === "partner"
      ? error.error.details.owner
      : null;
  const ownerLink = takenOwner ? (
    <Link
      href={`/configuracoes/socios/${takenOwner.id}`}
      className="inline-flex min-h-11 w-fit items-center rounded-sm text-sm underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring md:min-h-8"
    >
      {takenOwner.active ? "Abrir sócio" : "Abrir sócio inativo"}
    </Link>
  ) : null;

  function loadCurrentVersion() {
    setReloading({ name, aliases: activeValues(items) });
    startTransition(() => router.refresh());
  }

  function cancel() {
    if (dirty) setDiscardOpen(true);
    else router.push(cancelHref);
  }

  const isEdit = initial !== undefined;
  const submitLabel = isEdit ? "Salvar alterações" : "Salvar sócio";

  return (
    <>
      <form action={formAction} noValidate className="grid max-w-2xl gap-6">
        {initial && <input type="hidden" name="id" value={initial.id} />}
        {initial && <input type="hidden" name="expectedUpdatedAt" value={initial.updatedAt} />}

        {initial && !initial.active && (
          <FormMessage tone="info">
            Sócio inativo. Você pode corrigir o nome e os apelidos, mas só poderá indicá-lo em clientes depois de
            reativá-lo.
          </FormMessage>
        )}

        {error && isStale && (
          <div
            ref={conflictRef}
            tabIndex={-1}
            className="outline-none focus-visible:ring-3 focus-visible:ring-ring"
          >
            <Alert variant="warning" role="alert">
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>Este cadastro foi alterado por outra pessoa</AlertTitle>
              <AlertDescription>
                <p>{error.error.message}</p>
                <p>Carregue a versão atual e refaça a sua alteração.</p>
                <Button
                  type="button"
                  disabled={reloading !== null}
                  onClick={loadCurrentVersion}
                  className="mt-3 h-11 md:h-9"
                >
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
              <AlertTitle>
                {fieldMessages.length === 0
                  ? error.error.message
                  : fieldMessages.length === 1
                    ? "Não foi possível salvar. Corrija o campo destacado."
                    : `Não foi possível salvar. Corrija os ${fieldMessages.length} campos destacados.`}
              </AlertTitle>
              {fieldMessages.length > 1 && (
                <AlertDescription>
                  <ul className="list-disc pl-4">
                    {error.fieldErrors.name && (
                      <li>
                        <a href={`#${nameId}`} className="underline underline-offset-3">
                          Nome do sócio: {error.fieldErrors.name}
                        </a>
                      </li>
                    )}
                    {error.fieldErrors.aliases && <li>Apelidos: {error.fieldErrors.aliases}</li>}
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
              <div>
                <dt className="text-xs text-muted-foreground">Nome do sócio</dt>
                <dd className="break-words">{typedBefore.name || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Apelidos</dt>
                <dd className="break-words">{typedBefore.aliases.length > 0 ? typedBefore.aliases.join(", ") : "—"}</dd>
              </div>
            </dl>
          </details>
        )}

        <div className="grid gap-2">
          <Label htmlFor={nameId}>
            Nome do sócio <span aria-hidden="true">*</span>
          </Label>
          <Input
            ref={nameRef}
            id={nameId}
            name="name"
            value={name}
            required
            aria-required="true"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={[nameHelpId, nameError ? nameErrorId : null].filter(Boolean).join(" ")}
            autoComplete="off"
            disabled={pending}
            onChange={(event) => setName(event.target.value)}
            className="h-11 md:h-9"
            autoFocus={!isEdit}
          />
          <p id={nameHelpId} className="text-xs text-muted-foreground">
            Como o sócio aparece no sistema.
          </p>
          {nameError && (
            <div className="grid gap-1">
              <FieldError id={nameErrorId}>{nameError}</FieldError>
              {error?.error.field === "name" && ownerLink}
            </div>
          )}
        </div>

        <EditableTextList
          legend="Apelidos"
          help="Outros nomes com que este sócio aparece nos comprovantes. O nome do cadastro já é usado e não precisa ser repetido."
          noun="apelido"
          addLabel="Novo apelido"
          addOptions={ALIAS_OPTIONS}
          items={items}
          onItemsChange={setItems}
          makeKey={() => `novo-${++keyCounter.current}`}
          error={aliasesError}
          errorAction={error?.error.field === "aliases" ? ownerLink : null}
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
