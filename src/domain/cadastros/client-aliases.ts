/**
 * Lista editável de apelidos do CLIENTE (UI 4.1.6): cada item tem tipo, "Nome" (texto) ou documento
 * (CPF ou CNPJ de quem paga em nome do cliente, plano R-A08). Pura e sem React.
 *
 * Mesma anatomia da lista de apelidos do sócio (`editable-list.ts`): o estado é o ESTADO FINAL que
 * vai ao salvar; item novo some com "Remover", item salvo só fica inativo ("Inativar"), e texto igual
 * a um item inativo o reativa. A diferença é o tipo: o apelido-documento compara pelo documento
 * canônico (com ou sem pontuação, é o mesmo), e o de nome, por `normalizeAlias`. O banco é a
 * autoridade da unicidade; aqui só a mensagem imediata.
 */

import { describeDocument, formatDocument, normalizeDocument, parseDocumentInput, type DocumentType } from "@/domain/documents/document";

import { DUPLICATE_ITEM_MESSAGE, EMPTY_ITEM_MESSAGE } from "./editable-list";
import { countDistinctKeys } from "./identifier-keys";
import { CLIENT_ALIAS_LIMITS, INVALID_TEXT_MESSAGE, type ClientAliasGroup } from "./limits";
import { hasNul, normalizeAlias } from "./text";

/** Mesmo limite de `schemas.ts` (não importado aqui para não levar o `zod` ao navegador). */
const MAX_ALIAS_LENGTH = 200;

/** Tipo gravado no banco. */
export type ClientAliasType = "NAME" | "DOCUMENT";

/** Tipo escolhido no seletor "Tipo" (a tela distingue CPF e CNPJ só para a máscara e a validação). */
export type ClientAliasKind = "NAME" | DocumentType;

export const CLIENT_ALIAS_KIND_LABELS: Readonly<Record<ClientAliasKind, string>> = {
  NAME: "Nome",
  CPF: "CPF",
  CNPJ: "CNPJ",
};

export interface ClientAliasItem {
  /** Chave estável só da tela (React). */
  key: string;
  /** Id do registro salvo; `null` = ainda não salvo. */
  id: string | null;
  type: ClientAliasType;
  /** Nome como digitado, ou o documento já formatado ("000.000.004-34"). É o que vai ao servidor. */
  value: string;
  active: boolean;
}

export type AddClientAliasResult =
  | { ok: true; items: ClientAliasItem[]; kind: "added" | "reactivated"; item: ClientAliasItem }
  /** `atLimit`: a recusa é a do teto do tipo (a tela troca a linha do limite pelo erro, sem comparar texto). */
  | { ok: false; message: string; atLimit?: true };

/** Grupo de contagem do apelido: nome (`NAME`) ou documento (`DOCUMENT`, CPF e CNPJ juntos). */
export function clientAliasGroupOf(kind: ClientAliasKind | ClientAliasType): ClientAliasGroup {
  return kind === "NAME" ? "NAME" : "DOCUMENT";
}

/**
 * Quantos apelidos ATIVOS o grupo tem (RAT-D026): só os ativos, distintos pela chave de comparação, e só
 * os do grupo (nome e documento contam à parte; CPF e CNPJ contam juntos).
 */
export function countActiveClientAliases(items: readonly ClientAliasItem[], group: ClientAliasGroup): number {
  return countDistinctKeys(
    items.filter((item) => item.active && item.type === group),
    clientAliasKey,
  );
}

/** O grupo já tem o máximo de ativos? Incluir e reativar apelidos desse grupo passam a ser recusados. */
export function isClientAliasGroupFull(items: readonly ClientAliasItem[], group: ClientAliasGroup): boolean {
  return countActiveClientAliases(items, group) >= CLIENT_ALIAS_LIMITS[group].max;
}

/** Itens a partir do que veio do banco (`displayValue` do documento já vem formatado). */
export function clientAliasItemsFromSaved(
  saved: ReadonlyArray<{ id: string; type: ClientAliasType; displayValue: string; active: boolean }>,
): ClientAliasItem[] {
  return saved.map((alias) => ({
    key: `saved-${alias.id}`,
    id: alias.id,
    type: alias.type,
    value: alias.displayValue,
    active: alias.active,
  }));
}

/** Chave de comparação: dois apelidos com a mesma chave são o mesmo apelido. */
export function clientAliasKey(item: Pick<ClientAliasItem, "type" | "value">): string {
  return item.type === "DOCUMENT" ? `D:${normalizeDocument(item.value) ?? ""}` : `N:${normalizeAlias(item.value)}`;
}

/** Texto do item na lista e nos anúncios: o nome, ou "CPF 000.000.001-91". */
export function describeClientAliasItem(item: Pick<ClientAliasItem, "type" | "value">): string {
  return item.type === "DOCUMENT" ? describeDocument(normalizeDocument(item.value)) : item.value;
}

/** Adiciona um apelido do tipo escolhido (ou reativa o inativo igual). Mensagens da UI 4.1.6. */
export function addClientAlias(
  items: readonly ClientAliasItem[],
  kind: ClientAliasKind,
  rawText: string,
  newKey: string,
): AddClientAliasResult {
  const text = rawText.trim();
  let candidate: Pick<ClientAliasItem, "type" | "value">;

  if (kind === "NAME") {
    if (normalizeAlias(text) === "") return { ok: false, message: EMPTY_ITEM_MESSAGE };
    if (text.length > MAX_ALIAS_LENGTH) return { ok: false, message: "Um apelido pode ter no máximo 200 caracteres." };
    if (hasNul(text)) return { ok: false, message: INVALID_TEXT_MESSAGE };
    candidate = { type: "NAME", value: text };
  } else {
    const parsed = parseDocumentInput(text, kind);
    if (!parsed.ok) return { ok: false, message: parsed.message };
    if (parsed.canonical === null) return { ok: false, message: EMPTY_ITEM_MESSAGE };
    candidate = { type: "DOCUMENT", value: formatDocument(parsed.canonical) };
  }

  const key = clientAliasKey(candidate);
  if (items.some((item) => item.active && clientAliasKey(item) === key)) {
    return { ok: false, message: DUPLICATE_ITEM_MESSAGE };
  }
  // Item novo e reativação aumentam os ativos do GRUPO do item: os dois param no teto dele (RAT-D026).
  const group = clientAliasGroupOf(candidate.type);
  if (isClientAliasGroupFull(items, group)) {
    return { ok: false, message: CLIENT_ALIAS_LIMITS[group].message, atLimit: true };
  }

  const inactive = items.find((item) => !item.active && clientAliasKey(item) === key);
  if (inactive) {
    const reactivated = { ...inactive, active: true };
    return {
      ok: true,
      kind: "reactivated",
      item: reactivated,
      items: items.map((item) => (item.key === inactive.key ? reactivated : item)),
    };
  }

  const added: ClientAliasItem = { key: newKey, id: null, ...candidate, active: true };
  return { ok: true, kind: "added", item: added, items: [...items, added] };
}

/** "Remover" (item novo some) ou "Inativar" (item salvo fica inativo). */
export function removeClientAlias(items: readonly ClientAliasItem[], key: string): ClientAliasItem[] {
  return items.flatMap((item) => {
    if (item.key !== key) return [item];
    return item.id === null ? [] : [{ ...item, active: false }];
  });
}

/**
 * "Reativar" um apelido inativo. Reativar aumenta os ativos do grupo do item: com o grupo no teto
 * (RAT-D026) a reativação é RECUSADA e a lista volta como estava (a tela já desabilita o botão; isto
 * cobre a corrida).
 */
export function reactivateClientAlias(items: readonly ClientAliasItem[], key: string): ClientAliasItem[] {
  const target = items.find((item) => item.key === key);
  if (!target || target.active || isClientAliasGroupFull(items, clientAliasGroupOf(target.type))) return [...items];
  return items.map((item) => (item.key === key ? { ...item, active: true } : item));
}

export function activeClientAliases(items: readonly ClientAliasItem[]): ClientAliasItem[] {
  return items.filter((item) => item.active);
}

/** Assinatura do estado, para saber se o formulário mudou. */
export function clientAliasesSignature(items: readonly ClientAliasItem[]): string {
  return JSON.stringify(items.map((item) => [item.id, item.type, item.value, item.active]));
}

/** Assinatura só dos apelidos ATIVOS, por chave de comparação (o aviso de nome parecido depende só deles). */
export function activeAliasesSignature(items: readonly ClientAliasItem[]): string {
  return JSON.stringify(activeClientAliases(items).map((item) => clientAliasKey(item)));
}
