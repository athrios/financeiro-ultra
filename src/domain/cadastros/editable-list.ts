/**
 * Lógica da lista editável de textos (apelidos de sócio, e depois de cliente, variações, chaves),
 * UI 4.1.6 e 9.2 (`EditableList`). Pura e sem React: a tela só liga os botões a estas funções.
 *
 * O estado é o ESTADO FINAL que será enviado ao salvar (o banco recebe só os itens ativos e
 * decide o que incluir, manter, reativar ou inativar). Nada é gravado ao adicionar.
 *
 *  - item novo (`id === null`): "Remover" o descarta;
 *  - item já salvo: "Inativar" só o marca como inativo (nunca some da lista: o banco guarda);
 *  - texto igual (sem acento, maiúscula ou pontuação) a um item INATIVO reativa o item, em vez de
 *    criar outro, como o banco faz (reativa a linha inativa mais recente).
 *
 * A comparação usa `normalizeAlias`, espelho APROXIMADO do banco, só para a mensagem imediata:
 * a unicidade de verdade é do banco.
 */

import { normalizeAlias } from "./text";

export interface EditableItem {
  /** Chave estável só da tela (React). */
  key: string;
  /** Id do registro salvo; `null` = ainda não salvo. */
  id: string | null;
  value: string;
  active: boolean;
}

export const EMPTY_ITEM_MESSAGE = "Digite o apelido antes de adicionar.";
export const DUPLICATE_ITEM_MESSAGE = "Este apelido já está na lista.";

/** Ajustes por lista: forma de comparar o texto e mensagens (UI 7.2 tem frases próprias por lista). */
export interface AddItemOptions {
  /** Como comparar dois textos (padrão: `normalizeAlias`). Vazio depois de normalizar = em branco. */
  normalize?: (value: string) => string;
  emptyMessage?: string;
  duplicateMessage?: string;
  /** Teto de itens ATIVOS (RAT-D026, `limits.ts`) e a frase para quando chegou nele. */
  limit?: ListLimit;
}

export interface ListLimit {
  max: number;
  message: string;
  /** Ajuda antes do teto ("Até 2 apelidos ativos."), derivada do mesmo número (`listLimitHelp`). */
  help?: string;
}

/** A lista já tem o máximo de itens ativos? Adicionar e reativar passam a ser recusados. */
export function isAtLimit(items: ReadonlyArray<{ active: boolean }>, limit: Pick<ListLimit, "max"> | undefined): boolean {
  return limit !== undefined && items.filter((item) => item.active).length >= limit.max;
}

export type AddResult =
  | { ok: true; items: EditableItem[]; kind: "added" | "reactivated"; value: string }
  /** `atLimit`: a recusa é a do teto (a tela troca a linha do limite pelo erro, sem comparar texto). */
  | { ok: false; message: string; atLimit?: true };

/** Itens a partir do que veio do banco (ativos e inativos). */
export function itemsFromSaved(saved: ReadonlyArray<{ id: string; value: string; active: boolean }>): EditableItem[] {
  return saved.map((item) => ({ key: `saved-${item.id}`, id: item.id, value: item.value, active: item.active }));
}

/** Adiciona um item novo (ou reativa o inativo com o mesmo texto). */
export function addItem(
  items: readonly EditableItem[],
  rawText: string,
  newKey: string,
  options: AddItemOptions = {},
): AddResult {
  const normalize = options.normalize ?? normalizeAlias;
  const value = rawText.trim();
  const normalized = normalize(value);
  if (value === "" || normalized === "") return { ok: false, message: options.emptyMessage ?? EMPTY_ITEM_MESSAGE };

  if (items.some((item) => item.active && normalize(item.value) === normalized)) {
    return { ok: false, message: options.duplicateMessage ?? DUPLICATE_ITEM_MESSAGE };
  }

  // Item novo e reativação aumentam os ativos: os dois param no teto.
  if (options.limit && isAtLimit(items, options.limit)) return { ok: false, message: options.limit.message, atLimit: true };

  const inactive = items.find((item) => !item.active && normalize(item.value) === normalized);
  if (inactive) {
    return {
      ok: true,
      kind: "reactivated",
      value: inactive.value,
      items: items.map((item) => (item.key === inactive.key ? { ...item, active: true } : item)),
    };
  }

  return { ok: true, kind: "added", value, items: [...items, { key: newKey, id: null, value, active: true }] };
}

/** "Remover" (item novo some) ou "Inativar" (item salvo fica inativo). */
export function removeItem(items: readonly EditableItem[], key: string): EditableItem[] {
  return items.flatMap((item) => {
    if (item.key !== key) return [item];
    return item.id === null ? [] : [{ ...item, active: false }];
  });
}

/**
 * "Reativar" um item inativo. Reativar aumenta os ativos: com `limit` e a lista no teto (RAT-D026), a
 * reativação é RECUSADA e a lista volta como estava (a tela já desabilita o botão; isto cobre a corrida).
 */
export function reactivateItem(items: readonly EditableItem[], key: string, limit?: Pick<ListLimit, "max">): EditableItem[] {
  const target = items.find((item) => item.key === key);
  if (!target || target.active || isAtLimit(items, limit)) return [...items];
  return items.map((item) => (item.key === key ? { ...item, active: true } : item));
}

/** Os textos que vão ao servidor: o estado final dos itens ativos, na ordem da lista. */
export function activeValues(items: readonly EditableItem[]): string[] {
  return items.filter((item) => item.active).map((item) => item.value);
}

/** Assinatura do estado, para saber se o formulário mudou (aviso de alterações não salvas). */
export function itemsSignature(items: readonly EditableItem[]): string {
  return JSON.stringify(items.map((item) => [item.id, item.value, item.active]));
}
