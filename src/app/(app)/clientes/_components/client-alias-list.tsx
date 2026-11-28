"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { FieldError } from "@/components/form/field-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CLIENT_ALIAS_KIND_LABELS,
  activeClientAliases,
  addClientAlias,
  clientAliasGroupOf,
  describeClientAliasItem,
  isClientAliasGroupFull,
  reactivateClientAlias,
  removeClientAlias,
  type ClientAliasItem,
  type ClientAliasKind,
} from "@/domain/cadastros/client-aliases";
import {
  CLIENT_ALIASES_HELP,
  CLIENT_ALIAS_LIMITS,
  CLIENT_LIMIT_EXIT,
  CLIENT_REACTIVATE_NOTE,
  CLIENT_SWITCH_KIND_HINT,
  type ClientAliasGroup,
} from "@/domain/cadastros/limits";
import { DOCUMENT_PLACEHOLDERS, maskDocument } from "@/domain/documents/document-mask";

const KINDS: readonly ClientAliasKind[] = ["NAME", "CPF", "CNPJ"];

/** Plural de cada grupo, para o anúncio de "vaga liberada" ("...adicionar ou reativar nomes."). */
const GROUP_PLURAL: Readonly<Record<ClientAliasGroup, string>> = { NAME: "nomes", DOCUMENT: "documentos" };

interface ClientAliasListProps {
  /** Id do grupo (alvo do foco do resumo de erros). */
  id: string;
  items: readonly ClientAliasItem[];
  onItemsChange: (items: ClientAliasItem[]) => void;
  /** Gera a chave de um item novo (contador do formulário). */
  makeKey: () => string;
  /** Erro vindo do servidor para a lista (apelido repetido, documento de outro cliente...). */
  error?: string | null;
  /** Link do cliente dono ("Abrir cliente"). */
  errorAction?: ReactNode;
  disabled?: boolean;
}

const HELP =
  "Outros nomes ou documentos com que este cliente aparece nos comprovantes. Ajudam o sistema a reconhecer quem pagou. O nome e o documento do cadastro já são usados e não precisam ser repetidos.";

/**
 * "Apelidos" do cliente (UI 4.1.6): itens ativos com "Remover" (novo) ou "Inativar" (já salvo), linha de
 * inclusão com "Tipo" (Nome, CPF, CNPJ), "Novo apelido" e "Adicionar", e os inativos recolhidos com
 * "Reativar". Nada é gravado aqui: o estado final vai ao servidor junto com o formulário, em dois
 * campos paralelos por apelido ativo (`aliasType` e `aliasValue`).
 *
 * Enter no campo de inclusão ADICIONA e não envia o formulário. Ao adicionar, o foco volta ao campo;
 * ao remover ou inativar, vai ao próximo item (ou ao campo, se era o último). Trocar o tipo esvazia o
 * campo de inclusão (CPF e CNPJ têm máscara própria). A lógica é de `domain/cadastros/client-aliases`.
 *
 * Limite por tipo (RAT-D026, 17.7.4): "2 nomes e 2 documentos" ativos, contados à parte (CPF e CNPJ contam
 * juntos). A linha do limite acompanha o tipo escolhido; "Reativar" segue o grupo do PRÓPRIO item.
 */
export function ClientAliasList({ id, items, onItemsChange, makeKey, error, errorAction, disabled }: ClientAliasListProps) {
  const baseId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<ClientAliasKind>("NAME");
  const [draft, setDraft] = useState("");
  // `isLimit`: o erro é o do teto (Enter no teto). Marca no estado, não comparação de texto: só esse erro
  // esconde a linha do limite (a frase aparece uma vez só).
  const [addError, setAddError] = useState<{ message: string; isLimit: boolean } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const pendingFocus = useRef<{ target: "input" } | { target: "item"; key: string } | null>(null);

  const active = activeClientAliases(items);
  const inactive = items.filter((item) => !item.active);
  // Grupo escolhido no seletor (G): Nome, ou Documento (CPF e CNPJ juntos). O outro grupo é O.
  const group = clientAliasGroupOf(kind);
  const otherGroup: ClientAliasGroup = group === "NAME" ? "DOCUMENT" : "NAME";
  const full: Readonly<Record<ClientAliasGroup, boolean>> = {
    NAME: isClientAliasGroupFull(items, "NAME"),
    DOCUMENT: isClientAliasGroupFull(items, "DOCUMENT"),
  };
  // No teto do grupo escolhido: "Adicionar" fica desligado, com o motivo escrito (RAT-D026).
  const atLimit = full[group];
  // Linha do limite (17.7.4): ajuda antes do teto; no teto, a frase do grupo, a saída e (só se o outro
  // grupo tem vaga) a dica de trocar o tipo. Some só com o erro de teto.
  const limitText = atLimit
    ? [CLIENT_ALIAS_LIMITS[group].message, CLIENT_LIMIT_EXIT[group], full[otherGroup] ? null : CLIENT_SWITCH_KIND_HINT[group]]
        .filter(Boolean)
        .join(" ")
    : CLIENT_ALIASES_HELP;
  const limitLineShown = !addError?.isLimit;

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    if (target.target === "input") inputRef.current?.focus();
    else document.getElementById(`${baseId}-acao-${target.key}`)?.focus();
  });

  function handleAdd() {
    const result = addClientAlias(items, kind, draft, makeKey());
    if (!result.ok) {
      // No teto, o erro traz a frase do grupo e a saída do grupo, sem a dica de trocar o tipo (a dica fica
      // só na linha), e a linha do limite some: a frase aparece uma vez só.
      const isLimit = result.atLimit === true;
      setAddError({ message: isLimit ? `${result.message} ${CLIENT_LIMIT_EXIT[group]}` : result.message, isLimit });
      inputRef.current?.focus();
      return;
    }
    onItemsChange(result.items);
    setDraft("");
    setAddError(null);
    const text = describeClientAliasItem(result.item);
    const done = result.kind === "reactivated" ? `Apelido “${text}” reativado.` : `Apelido “${text}” adicionado.`;
    const addedGroup = clientAliasGroupOf(result.item.type);
    setAnnouncement(
      isClientAliasGroupFull(result.items, addedGroup) ? `${done} ${CLIENT_ALIAS_LIMITS[addedGroup].message}` : done,
    );
    pendingFocus.current = { target: "input" };
  }

  function handleRemove(item: ClientAliasItem) {
    const index = active.findIndex((candidate) => candidate.key === item.key);
    const neighbor = active[index + 1] ?? active[index - 1];
    onItemsChange(removeClientAlias(items, item.key));
    const text = describeClientAliasItem(item);
    const done = item.id === null ? `Apelido “${text}” removido.` : `Apelido “${text}” inativado.`;
    // Estando no teto do grupo do item, tirá-lo libera vaga: diz isso, com o grupo liberado (17.7.5).
    const freed = clientAliasGroupOf(item.type);
    // O erro de teto é do grupo escolhido no seletor: só sai se a vaga liberada é a desse grupo (UXC-48).
    if (full[freed] && freed === group && addError?.isLimit) setAddError(null);
    setAnnouncement(full[freed] ? `${done} Já dá para adicionar ou reativar ${GROUP_PLURAL[freed]}.` : done);
    pendingFocus.current = neighbor ? { target: "item", key: neighbor.key } : { target: "input" };
  }

  function handleReactivate(item: ClientAliasItem) {
    const itemGroup = clientAliasGroupOf(item.type);
    if (full[itemGroup]) {
      // O botão já fica desabilitado no teto do grupo; isto cobre a corrida.
      setAnnouncement(CLIENT_ALIAS_LIMITS[itemGroup].message);
      return;
    }
    const next = reactivateClientAlias(items, item.key);
    onItemsChange(next);
    const done = `Apelido “${describeClientAliasItem(item)}” reativado.`;
    setAnnouncement(isClientAliasGroupFull(next, itemGroup) ? `${done} ${CLIENT_ALIAS_LIMITS[itemGroup].message}` : done);
    pendingFocus.current = { target: "item", key: item.key };
  }

  function changeKind(next: ClientAliasKind) {
    setKind(next);
    setDraft("");
    setAddError(null);
  }

  const helpId = `${baseId}-ajuda`;
  const addErrorId = `${baseId}-erro-inclusao`;
  const limitId = `${baseId}-limite`;
  const listErrorId = `${baseId}-erro-lista`;
  const reactivateNoteIds: Readonly<Record<ClientAliasGroup, string>> = {
    NAME: `${baseId}-limite-reativar-nome`,
    DOCUMENT: `${baseId}-limite-reativar-documento`,
  };
  // Campo de inclusão (17.7.3): sempre liga à linha do limite; com erro de inclusão, o erro vem primeiro.
  // Só o erro de teto dispensa a linha (ela nem é renderizada), e o campo aponta só para o erro.
  const describedBy = addError
    ? [addErrorId, limitLineShown ? limitId : null].filter(Boolean).join(" ")
    : limitLineShown
      ? limitId
      : undefined;
  // Grupos que têm item inativo: se estiverem cheios, ganham a nota que explica o "Reativar" desabilitado.
  const inactiveGroups = new Set(inactive.map((item) => clientAliasGroupOf(item.type)));

  return (
    <fieldset
      id={id}
      tabIndex={-1}
      className="grid min-w-0 gap-3 outline-none"
      aria-describedby={[helpId, error ? listErrorId : null].filter(Boolean).join(" ")}
    >
      <legend className="text-sm font-medium">Apelidos</legend>
      <p id={helpId} className="text-sm text-muted-foreground">
        {HELP}
      </p>

      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum apelido cadastrado.</p>
      ) : (
        <ul aria-label="Apelidos ativos" className="grid gap-2">
          {active.map((item) => {
            const text = describeClientAliasItem(item);
            return (
              <li key={item.key} className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-1.5">
                <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm break-words">
                  {text}
                  {item.id === null && <Badge variant="info">Novo</Badge>}
                </span>
                <Button
                  id={`${baseId}-acao-${item.key}`}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  aria-label={`${item.id === null ? "Remover" : "Inativar"} apelido ${text}`}
                  onClick={() => handleRemove(item)}
                  className="h-11 shrink-0 md:h-7"
                >
                  {item.id === null ? "Remover" : "Inativar"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="grid gap-2">
        <div className="grid gap-2 sm:grid-cols-[8rem_1fr_auto] sm:items-end">
          <div className="grid gap-2">
            <Label htmlFor={`${baseId}-tipo`}>Tipo</Label>
            <select
              id={`${baseId}-tipo`}
              value={kind}
              disabled={disabled}
              onChange={(event) => changeKind(event.target.value as ClientAliasKind)}
              className="h-11 w-full rounded-lg border border-input bg-background px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50 md:h-9 md:text-sm"
            >
              {KINDS.map((option) => (
                <option key={option} value={option}>
                  {CLIENT_ALIAS_KIND_LABELS[option]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${baseId}-novo`}>Novo apelido</Label>
            <Input
              ref={inputRef}
              id={`${baseId}-novo`}
              value={draft}
              disabled={disabled}
              autoComplete="off"
              autoCapitalize={kind === "CNPJ" ? "characters" : "none"}
              spellCheck={false}
              inputMode={kind === "CPF" ? "numeric" : "text"}
              placeholder={kind === "NAME" ? undefined : DOCUMENT_PLACEHOLDERS[kind]}
              aria-invalid={addError ? true : undefined}
              aria-describedby={describedBy}
              onChange={(event) => {
                const value = event.target.value;
                setDraft(kind === "NAME" ? value : maskDocument(kind, value));
                if (addError) setAddError(null);
              }}
              onKeyDown={(event) => {
                // Enter adiciona o apelido e NÃO envia o formulário (UI 4.1.6).
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleAdd();
                }
              }}
              className="h-11 md:h-9"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={disabled || atLimit}
            aria-describedby={atLimit && limitLineShown ? limitId : undefined}
            onClick={handleAdd}
            className="h-11 sm:shrink-0 md:h-9"
          >
            Adicionar
          </Button>
        </div>
        {limitLineShown && (
          <p id={limitId} className={atLimit ? "text-sm text-foreground" : "text-sm text-muted-foreground"}>
            {limitText}
          </p>
        )}
        {addError && <FieldError id={addErrorId}>{addError.message}</FieldError>}
      </div>

      {error && (
        <div className="grid gap-1">
          <FieldError id={listErrorId}>{error}</FieldError>
          {errorAction}
        </div>
      )}

      {inactive.length > 0 && (
        <details className="rounded-lg border bg-background px-3 py-2">
          <summary className="min-h-8 cursor-pointer text-sm font-medium">Apelidos inativos ({inactive.length})</summary>
          {(["NAME", "DOCUMENT"] as const).map(
            (itemGroup) =>
              full[itemGroup] &&
              inactiveGroups.has(itemGroup) && (
                <p key={itemGroup} id={reactivateNoteIds[itemGroup]} className="mt-2 text-sm text-foreground">
                  {CLIENT_REACTIVATE_NOTE[itemGroup]}
                </p>
              ),
          )}
          <ul aria-label="Apelidos inativos" className="mt-2 grid gap-2">
            {inactive.map((item) => {
              const text = describeClientAliasItem(item);
              const itemGroup = clientAliasGroupOf(item.type);
              const groupFull = full[itemGroup];
              return (
                <li key={item.key} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 text-sm break-words text-muted-foreground">{text}</span>
                  <Button
                    id={`${baseId}-acao-${item.key}`}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled || groupFull}
                    aria-describedby={groupFull ? reactivateNoteIds[itemGroup] : undefined}
                    aria-label={`Reativar apelido ${text}`}
                    onClick={() => handleReactivate(item)}
                    className="h-11 shrink-0 md:h-7"
                  >
                    Reativar
                  </Button>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {/* Um par de campos por apelido ativo: é o estado final que o servidor recebe. */}
      {active.map((item) => (
        <span key={item.key} hidden>
          <input type="hidden" name="aliasType" value={item.type} />
          <input type="hidden" name="aliasValue" value={item.value} />
        </span>
      ))}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </fieldset>
  );
}
