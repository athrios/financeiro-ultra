"use client";

import { useEffect, useId, useRef, useState } from "react";

import { FieldError } from "@/components/form/field-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addItem,
  isAtLimit,
  reactivateItem,
  removeItem,
  type AddItemOptions,
  type EditableItem,
} from "@/domain/cadastros/editable-list";
import { LIMIT_REACHED_HINT } from "@/domain/cadastros/limits";

interface EditableTextListProps {
  /** Legenda do grupo ("Apelidos"). */
  legend: string;
  /** Ajuda abaixo da legenda. */
  help: string;
  /** Substantivo no singular, minúsculo ("apelido"): entra nos nomes acessíveis e nos anúncios. */
  noun: string;
  /** Rótulo do campo de inclusão ("Novo apelido"). */
  addLabel: string;
  items: readonly EditableItem[];
  onItemsChange: (items: EditableItem[]) => void;
  /** Gera a chave de um item novo (contador do formulário). */
  makeKey: () => string;
  /** Nome do campo enviado (um por item ativo). */
  fieldName?: string;
  /** Erro vindo do servidor para a lista (apelido repetido, em branco...). */
  error?: string | null;
  /** Ações extras ao lado do erro (por exemplo, o link "Abrir sócio"). */
  errorAction?: React.ReactNode;
  disabled?: boolean;
  /** Substantivo feminino ("chave Pix", "forma do nome"): "adicionada", "Nenhuma ... cadastrada". */
  feminine?: boolean;
  /** Comparação e mensagens próprias da lista (variações e chaves Pix têm frases da UI 7.2). */
  addOptions?: AddItemOptions;
}

/**
 * Lista editável de textos (UI 4.1.6 e 9.2 `EditableList`), usada nos apelidos do sócio e, no recebedor,
 * nas formas do nome e nas chaves Pix: itens
 * ativos com "Remover" (novo) ou "Inativar" (já salvo), linha de inclusão com "Adicionar", e os
 * inativos recolhidos com "Reativar". Nada é gravado aqui: o estado vai ao servidor junto com o
 * formulário, que envia só os itens ativos (um campo `aliases` por item).
 *
 * Enter no campo de inclusão ADICIONA e não envia o formulário. Ao adicionar, o foco volta ao campo;
 * ao remover ou inativar, vai ao próximo item (ou ao campo, se era o último). Os anúncios são
 * `role="status"` (polite). A lógica de lista é de `domain/cadastros/editable-list`.
 *
 * Linha do limite (RAT-D026, 17.7): um parágrafo `-limite`, sempre presente abaixo da linha de inclusão,
 * que troca de texto ("Até 2 apelidos ativos." / "No máximo 2 apelidos. Para adicionar ou reativar, ...")
 * e nunca mostra as duas frases. Só o erro de Enter no teto a esconde (a frase aparece uma vez só).
 */
export function EditableTextList({
  legend,
  help,
  noun,
  addLabel,
  items,
  onItemsChange,
  makeKey,
  fieldName = "aliases",
  error,
  errorAction,
  disabled,
  feminine = false,
  addOptions,
}: EditableTextListProps) {
  const baseId = useId();
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  // `isLimit`: o erro é o do teto (Enter no teto). Marca no estado, não comparação de texto: só esse erro
  // esconde a linha do limite (a frase do teto aparece uma vez só).
  const [addError, setAddError] = useState<{ message: string; isLimit: boolean } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // Para onde o foco vai depois da próxima renderização (campo de inclusão ou um botão da lista).
  // Ref, não estado: só é lido e limpo depois que a lista (já alterada) volta a renderizar.
  const pendingFocus = useRef<{ target: "input" } | { target: "item"; key: string } | null>(null);

  const active = items.filter((item) => item.active);
  const inactive = items.filter((item) => !item.active);
  // No teto de itens (RAT-D026): "Adicionar" e "Reativar" ficam desligados, com o motivo escrito.
  const limit = addOptions?.limit;
  const atLimit = limit !== undefined && isAtLimit(items, limit);
  // Linha do limite (17.7.1): sempre presente, ajuda antes do teto e frase do teto depois; some só com o erro de teto.
  const limitText = limit ? (atLimit ? `${limit.message} ${LIMIT_REACHED_HINT}` : (limit.help ?? null)) : null;
  const limitLineShown = limitText !== null && !addError?.isLimit;

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    if (target.target === "input") inputRef.current?.focus();
    else document.getElementById(`${baseId}-acao-${target.key}`)?.focus();
  });

  /** Particípio no gênero do substantivo ("adicionado" ou "adicionada"). */
  function past(masculine: string): string {
    return feminine ? `${masculine.slice(0, -1)}a` : masculine;
  }

  function handleAdd() {
    const result = addItem(items, draft, makeKey(), addOptions);
    if (!result.ok) {
      // No teto, o erro traz a frase de saída (e a linha do limite some: a frase aparece uma vez só).
      const isLimit = result.atLimit === true;
      setAddError({ message: isLimit ? `${result.message} ${LIMIT_REACHED_HINT}` : result.message, isLimit });
      inputRef.current?.focus();
      return;
    }
    onItemsChange(result.items);
    setDraft("");
    setAddError(null);
    const done =
      result.kind === "reactivated" ? `${Noun} “${result.value}” ${past("reativado")}.` : `${Noun} “${result.value}” ${past("adicionado")}.`;
    setAnnouncement(limit && isAtLimit(result.items, limit) ? `${done} ${limit.message}` : done);
    pendingFocus.current = { target: "input" };
  }

  function handleRemove(item: EditableItem) {
    const index = active.findIndex((candidate) => candidate.key === item.key);
    const neighbor = active[index + 1] ?? active[index - 1];
    onItemsChange(removeItem(items, item.key));
    const done =
      item.id === null ? `${Noun} “${item.value}” ${past("removido")}.` : `${Noun} “${item.value}” ${past("inativado")}.`;
    // Estando no teto, tirar um item libera vaga: diz isso (17.7.5) e tira o erro de teto, que não vale mais (UXC-48).
    if (atLimit && addError?.isLimit) setAddError(null);
    setAnnouncement(atLimit ? `${done} Já dá para adicionar ou reativar.` : done);
    pendingFocus.current = neighbor ? { target: "item", key: neighbor.key } : { target: "input" };
  }

  function handleReactivate(item: EditableItem) {
    if (atLimit) {
      // O botão já fica desabilitado no teto; isto cobre a corrida.
      setAnnouncement(limit?.message ?? "");
      return;
    }
    const next = reactivateItem(items, item.key, limit);
    onItemsChange(next);
    const done = `${Noun} “${item.value}” ${past("reativado")}.`;
    setAnnouncement(limit && isAtLimit(next, limit) ? `${done} ${limit.message}` : done);
    pendingFocus.current = { target: "item", key: item.key };
  }

  const helpId = `${baseId}-ajuda`;
  const addErrorId = `${baseId}-erro-inclusao`;
  const limitId = `${baseId}-limite`;
  const listErrorId = `${baseId}-erro-lista`;
  // Campo de inclusão (17.7.3): sempre liga à linha do limite; com erro de inclusão, o erro vem primeiro.
  // Só o erro de teto dispensa a linha (ela nem é renderizada), e o campo aponta só para o erro.
  const describedBy = addError
    ? [addErrorId, limitLineShown ? limitId : null].filter(Boolean).join(" ")
    : limitLineShown
      ? limitId
      : undefined;

  return (
    <fieldset className="grid min-w-0 gap-3" aria-describedby={[helpId, error ? listErrorId : null].filter(Boolean).join(" ")}>
      <legend className="text-sm font-medium">{legend}</legend>
      <p id={helpId} className="text-sm text-muted-foreground">
        {help}
      </p>

      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {feminine ? "Nenhuma" : "Nenhum"} {noun} {feminine ? "cadastrada" : "cadastrado"}.
        </p>
      ) : (
        <ul aria-label={`${legend} ativos`} className="grid gap-2">
          {active.map((item) => (
            <li key={item.key} className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-1.5">
              <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm break-words">
                {item.value}
                {item.id === null && <Badge variant="info">Novo</Badge>}
              </span>
              <Button
                id={`${baseId}-acao-${item.key}`}
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                aria-label={`${item.id === null ? "Remover" : "Inativar"} ${noun} ${item.value}`}
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
        <Label htmlFor={`${baseId}-novo`}>{addLabel}</Label>
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            id={`${baseId}-novo`}
            value={draft}
            disabled={disabled}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={addError ? true : undefined}
            aria-describedby={describedBy}
            onChange={(event) => {
              setDraft(event.target.value);
              if (addError) setAddError(null);
            }}
            onKeyDown={(event) => {
              // Enter adiciona o item e NÃO envia o formulário (UI 4.1.6).
              if (event.key === "Enter") {
                event.preventDefault();
                handleAdd();
              }
            }}
            className="h-11 md:h-9"
          />
          <Button
            type="button"
            variant="outline"
            disabled={disabled || atLimit}
            aria-describedby={atLimit && limitLineShown ? limitId : undefined}
            onClick={handleAdd}
            className="h-11 shrink-0 md:h-9"
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
          <summary className="min-h-8 cursor-pointer text-sm font-medium">
            {legend} inativos ({inactive.length})
          </summary>
          <ul aria-label={`${legend} inativos`} className="mt-2 grid gap-2">
            {inactive.map((item) => (
              <li key={item.key} className="flex items-center justify-between gap-2">
                <span className="min-w-0 text-sm break-words text-muted-foreground">{item.value}</span>
                <Button
                  id={`${baseId}-acao-${item.key}`}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled || atLimit}
                  aria-describedby={atLimit && limitLineShown ? limitId : undefined}
                  aria-label={`Reativar ${noun} ${item.value}`}
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

      {/* Um campo por item ativo: é o estado final que o servidor recebe. */}
      {active.map((item) => (
        <input key={item.key} type="hidden" name={fieldName} value={item.value} />
      ))}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </fieldset>
  );
}
