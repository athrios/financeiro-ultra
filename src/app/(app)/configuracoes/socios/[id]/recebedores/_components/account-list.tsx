"use client";

import { useEffect, useId, useRef, useState } from "react";

import { FieldError } from "@/components/form/field-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isAtLimit } from "@/domain/cadastros/editable-list";
import { BANK_ACCOUNTS_LIMIT, LIMIT_REACHED_HINT } from "@/domain/cadastros/limits";
import {
  addAccount,
  describeAccount,
  reactivateAccount,
  removeAccount,
  type AccountItem,
  type AccountValue,
} from "@/domain/cadastros/receiver-identifiers";

interface AccountListProps {
  items: readonly AccountItem[];
  onItemsChange: (items: AccountItem[]) => void;
  /** Gera a chave de um item novo (contador do formulário). */
  makeKey: () => string;
  /** Erro vindo do servidor para a lista. */
  error?: string | null;
  /** Ações extras ao lado do erro (por exemplo, o link "Abrir recebedor"). */
  errorAction?: React.ReactNode;
  disabled?: boolean;
}

const EMPTY_DRAFT: AccountValue = { bankName: "", branch: "", accountNumber: "" };

/**
 * Lista "Contas bancárias" do recebedor (UI 7.1 item 6): banco, agência e conta lado a lado (empilhados
 * no celular) e "Adicionar". Mesma anatomia da lista de textos: itens ativos com "Remover" (novo) ou
 * "Inativar" (já salvo), inativos recolhidos com "Reativar". Nada é gravado aqui: cada conta ATIVA vai
 * ao servidor em três campos paralelos (`accountBank`, `accountBranch`, `accountNumber`). Enter em
 * qualquer um dos três campos ADICIONA e não envia o formulário. A lógica é de `receiver-identifiers`.
 */
export function AccountList({ items, onItemsChange, makeKey, error, errorAction, disabled }: AccountListProps) {
  const baseId = useId();
  const bankRef = useRef<HTMLInputElement>(null);
  const branchRef = useRef<HTMLInputElement>(null);
  const numberRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<AccountValue>(EMPTY_DRAFT);
  // `isLimit`: o erro é o do teto (Enter no teto). Marca no estado, não comparação de texto: só esse erro
  // esconde a linha do limite (a frase aparece uma vez só).
  const [addError, setAddError] = useState<{
    message: string;
    field: "bankName" | "branch" | "accountNumber" | null;
    isLimit: boolean;
  } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const pendingFocus = useRef<{ target: "input" } | { target: "item"; key: string } | null>(null);

  const active = items.filter((item) => item.active);
  const inactive = items.filter((item) => !item.active);
  // No teto de contas (RAT-D026): "Adicionar" e "Reativar" ficam desligados, com o motivo escrito.
  const atLimit = isAtLimit(items, BANK_ACCOUNTS_LIMIT);
  // Linha do limite (17.7.1): sempre presente, ajuda antes do teto e frase do teto depois; some só com o erro de teto.
  const limitText = atLimit ? `${BANK_ACCOUNTS_LIMIT.message} ${LIMIT_REACHED_HINT}` : BANK_ACCOUNTS_LIMIT.help;
  const limitLineShown = !addError?.isLimit;

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    if (target.target === "input") bankRef.current?.focus();
    else document.getElementById(`${baseId}-acao-${target.key}`)?.focus();
  });

  function handleAdd() {
    const result = addAccount(items, draft, makeKey());
    if (!result.ok) {
      // No teto, o erro traz a frase de saída (e a linha do limite some: a frase aparece uma vez só).
      const isLimit = result.atLimit === true;
      setAddError({
        message: isLimit ? `${result.message} ${LIMIT_REACHED_HINT}` : result.message,
        field: result.field,
        isLimit,
      });
      const target =
        result.field === "branch"
          ? branchRef.current
          : result.field === "accountNumber"
            ? numberRef.current
            : draft.bankName.trim() === ""
              ? bankRef.current
              : draft.branch.trim() === ""
                ? branchRef.current
                : numberRef.current;
      target?.focus();
      return;
    }
    onItemsChange(result.items);
    setDraft(EMPTY_DRAFT);
    setAddError(null);
    const done =
      result.kind === "reactivated"
        ? `Conta “${describeAccount(result.account)}” reativada.`
        : `Conta “${describeAccount(result.account)}” adicionada.`;
    setAnnouncement(isAtLimit(result.items, BANK_ACCOUNTS_LIMIT) ? `${done} ${BANK_ACCOUNTS_LIMIT.message}` : done);
    pendingFocus.current = { target: "input" };
  }

  function handleRemove(item: AccountItem) {
    const index = active.findIndex((candidate) => candidate.key === item.key);
    const neighbor = active[index + 1] ?? active[index - 1];
    onItemsChange(removeAccount(items, item.key));
    const done =
      item.id === null ? `Conta “${describeAccount(item)}” removida.` : `Conta “${describeAccount(item)}” inativada.`;
    // Estando no teto, tirar uma conta libera vaga: diz isso (17.7.5) e tira o erro de teto, que não vale mais (UXC-48).
    if (atLimit && addError?.isLimit) setAddError(null);
    setAnnouncement(atLimit ? `${done} Já dá para adicionar ou reativar.` : done);
    pendingFocus.current = neighbor ? { target: "item", key: neighbor.key } : { target: "input" };
  }

  function handleReactivate(item: AccountItem) {
    if (atLimit) {
      // O botão já fica desabilitado no teto; isto cobre a corrida.
      setAnnouncement(BANK_ACCOUNTS_LIMIT.message);
      return;
    }
    const next = reactivateAccount(items, item.key);
    onItemsChange(next);
    const done = `Conta “${describeAccount(item)}” reativada.`;
    setAnnouncement(isAtLimit(next, BANK_ACCOUNTS_LIMIT) ? `${done} ${BANK_ACCOUNTS_LIMIT.message}` : done);
    pendingFocus.current = { target: "item", key: item.key };
  }

  function update(field: keyof AccountValue, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    if (addError) setAddError(null);
  }

  function onEnter(event: React.KeyboardEvent<HTMLInputElement>) {
    // Enter adiciona a conta e NÃO envia o formulário (UI 4.1.6, mesma anatomia).
    if (event.key === "Enter") {
      event.preventDefault();
      handleAdd();
    }
  }

  const helpId = `${baseId}-ajuda`;
  const addErrorId = `${baseId}-erro-inclusao`;
  const limitId = `${baseId}-limite`;
  const listErrorId = `${baseId}-erro-lista`;
  // Campos de inclusão (17.7.3): com erro de inclusão, o erro vem primeiro e a linha do limite vem junto (só o erro
  // de teto a dispensa). Sem erro, antes do teto a ajuda é lida só no campo Banco; no teto, nos três campos.
  const limitRef = limitLineShown ? limitId : null;
  const describedBy = addError
    ? [addErrorId, limitRef].filter(Boolean).join(" ")
    : atLimit
      ? (limitRef ?? undefined)
      : undefined;
  const bankDescribedBy = addError || atLimit ? describedBy : (limitRef ?? undefined);
  // Erro de inclusão sem campo (teto, conta repetida) vale para a conta toda: marca os três campos (17.7.5).
  const invalidFor = (field: "bankName" | "branch" | "accountNumber") =>
    addError && (addError.field === field || addError.field === null) ? true : undefined;

  return (
    <fieldset className="grid min-w-0 gap-3" aria-describedby={[helpId, error ? listErrorId : null].filter(Boolean).join(" ")}>
      <legend className="text-sm font-medium">Contas bancárias</legend>
      <p id={helpId} className="text-sm text-muted-foreground">
        Banco, agência e conta, como aparecem no comprovante.
      </p>

      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma conta cadastrada.</p>
      ) : (
        <ul aria-label="Contas bancárias ativas" className="grid gap-2">
          {active.map((item) => (
            <li key={item.key} className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-1.5">
              <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm break-words">
                {describeAccount(item)}
                {item.id === null && <Badge variant="info">Nova</Badge>}
              </span>
              <Button
                id={`${baseId}-acao-${item.key}`}
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                aria-label={`${item.id === null ? "Remover" : "Inativar"} conta ${describeAccount(item)}`}
                onClick={() => handleRemove(item)}
                className="h-11 shrink-0 md:h-7"
              >
                {item.id === null ? "Remover" : "Inativar"}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-2">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="grid gap-1">
            <Label htmlFor={`${baseId}-banco`}>Banco</Label>
            <Input
              ref={bankRef}
              id={`${baseId}-banco`}
              value={draft.bankName}
              disabled={disabled}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={invalidFor("bankName")}
              aria-describedby={bankDescribedBy}
              onChange={(event) => update("bankName", event.target.value)}
              onKeyDown={onEnter}
              className="h-11 md:h-9"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor={`${baseId}-agencia`}>Agência</Label>
            <Input
              ref={branchRef}
              id={`${baseId}-agencia`}
              value={draft.branch}
              disabled={disabled}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-invalid={invalidFor("branch")}
              aria-describedby={describedBy}
              onChange={(event) => update("branch", event.target.value)}
              onKeyDown={onEnter}
              className="h-11 md:h-9"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor={`${baseId}-conta`}>Conta</Label>
            <Input
              ref={numberRef}
              id={`${baseId}-conta`}
              value={draft.accountNumber}
              disabled={disabled}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-invalid={invalidFor("accountNumber")}
              aria-describedby={describedBy}
              onChange={(event) => update("accountNumber", event.target.value)}
              onKeyDown={onEnter}
              className="h-11 md:h-9"
            />
          </div>
        </div>
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={disabled || atLimit}
            aria-describedby={atLimit && limitLineShown ? limitId : undefined}
            onClick={handleAdd}
            className="h-11 md:h-9"
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
          <summary className="min-h-8 cursor-pointer text-sm font-medium">Contas bancárias inativas ({inactive.length})</summary>
          <ul aria-label="Contas bancárias inativas" className="mt-2 grid gap-2">
            {inactive.map((item) => (
              <li key={item.key} className="flex items-center justify-between gap-2">
                <span className="min-w-0 text-sm break-words text-muted-foreground">{describeAccount(item)}</span>
                <Button
                  id={`${baseId}-acao-${item.key}`}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled || atLimit}
                  aria-describedby={atLimit && limitLineShown ? limitId : undefined}
                  aria-label={`Reativar conta ${describeAccount(item)}`}
                  onClick={() => handleReactivate(item)}
                  className="h-11 shrink-0 md:h-7"
                >
                  Reativar
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Três campos paralelos por conta ativa: é o estado final que o servidor recebe. */}
      {active.map((item) => (
        <span key={item.key} hidden>
          <input type="hidden" name="accountBank" value={item.bankName} />
          <input type="hidden" name="accountBranch" value={item.branch} />
          <input type="hidden" name="accountNumber" value={item.accountNumber} />
        </span>
      ))}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </fieldset>
  );
}
