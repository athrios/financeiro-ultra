/**
 * Lógica de tela dos identificadores do recebedor (UI 7.1 e 7.2): chaves Pix e contas bancárias, mais
 * a separação dos identificadores lidos do banco nas três listas do formulário.
 *
 * Tudo aqui serve só à resposta imediata da tela ("já está na lista", "conta incompleta"): a
 * normalização e a unicidade de verdade são do banco (`private.normalize_receiver_identifier`), que
 * repete cada conferência. As normalizações são espelho APROXIMADO. Sem Next, sem React, sem banco.
 */

import { normalizeAlias } from "./text";
import { isAtLimit, type EditableItem } from "./editable-list";
import { accountKey, normalizePixKey, type AccountValue } from "./identifier-keys";
import { BANK_ACCOUNTS_LIMIT_MESSAGE, MAX_BANK_ACCOUNTS } from "./limits";
import { findAccountProblems, type AccountProblem } from "./schemas";

// As chaves de comparação ficam em `identifier-keys.ts` (o esquema também as usa); reexportadas aqui.
export { accountKey, normalizePixKey, type AccountValue };

// -----------------------------------------------------------------------------------------------
// Conta bancária
// -----------------------------------------------------------------------------------------------

export interface AccountItem extends AccountValue {
  /** Chave estável só da tela (React). */
  key: string;
  /** Id do registro salvo; `null` = ainda não salvo. */
  id: string | null;
  active: boolean;
}

export const INCOMPLETE_ACCOUNT_DRAFT_MESSAGE = "Preencha banco, agência e conta, ou apague os campos.";
export const DUPLICATE_ACCOUNT_MESSAGE = "Esta conta já está na lista.";
export const DUPLICATE_VARIANT_MESSAGE = "Esta forma do nome já está na lista.";
export const DUPLICATE_PIX_MESSAGE = "Esta chave Pix já está na lista.";
export const EMPTY_VARIANT_MESSAGE = "Digite a forma do nome antes de adicionar.";
export const EMPTY_PIX_MESSAGE = "Digite a chave Pix antes de adicionar.";

/** "Banco {x} · Ag. {y} · Conta {z}" (UI 5.3 e 7.1). */
export function describeAccount(account: AccountValue): string {
  return `Banco ${account.bankName} · Ag. ${account.branch} · Conta ${account.accountNumber}`;
}

export function accountsFromSaved(
  saved: ReadonlyArray<AccountValue & { id: string; active: boolean }>,
): AccountItem[] {
  return saved.map((item) => ({ key: `saved-${item.id}`, ...item }));
}

export type AddAccountResult =
  | { ok: true; items: AccountItem[]; kind: "added" | "reactivated"; account: AccountValue }
  /** `atLimit`: a recusa é a do teto (a tela troca a linha do limite pelo erro, sem comparar texto). */
  | { ok: false; message: string; field: AccountProblem["field"]; atLimit?: true };

/**
 * Adiciona a conta digitada. Os três campos são necessários (conta pela metade é recusada, UI 7.1);
 * agência e conta aceitam só números, hífen e X. Conta igual a uma INATIVA a reativa (como o banco).
 */
export function addAccount(items: readonly AccountItem[], draft: AccountValue, newKey: string): AddAccountResult {
  const account: AccountValue = {
    bankName: draft.bankName.trim(),
    branch: draft.branch.trim(),
    accountNumber: draft.accountNumber.trim(),
  };

  if (account.bankName === "" && account.branch === "" && account.accountNumber === "") {
    return { ok: false, message: INCOMPLETE_ACCOUNT_DRAFT_MESSAGE, field: null };
  }
  const [problem] = findAccountProblems(account);
  if (problem) return { ok: false, message: problem.message, field: problem.field };
  if (normalizeAlias(account.bankName) === "") {
    return { ok: false, message: INCOMPLETE_ACCOUNT_DRAFT_MESSAGE, field: "bankName" };
  }

  const key = accountKey(account);
  if (items.some((item) => item.active && accountKey(item) === key)) {
    return { ok: false, message: DUPLICATE_ACCOUNT_MESSAGE, field: null };
  }
  // Conta nova e reativação aumentam as ativas: as duas param no teto (RAT-D026).
  if (isAtLimit(items, { max: MAX_BANK_ACCOUNTS })) {
    return { ok: false, message: BANK_ACCOUNTS_LIMIT_MESSAGE, field: null, atLimit: true };
  }
  const inactive = items.find((item) => !item.active && accountKey(item) === key);
  if (inactive) {
    return {
      ok: true,
      kind: "reactivated",
      account: inactive,
      items: items.map((item) => (item.key === inactive.key ? { ...item, active: true } : item)),
    };
  }
  return { ok: true, kind: "added", account, items: [...items, { key: newKey, id: null, active: true, ...account }] };
}

/** "Remover" (conta nova some) ou "Inativar" (conta salva fica inativa). */
export function removeAccount(items: readonly AccountItem[], key: string): AccountItem[] {
  return items.flatMap((item) => {
    if (item.key !== key) return [item];
    return item.id === null ? [] : [{ ...item, active: false }];
  });
}

/**
 * "Reativar" uma conta inativa. Reativar aumenta as ativas: no teto (RAT-D026) a reativação é RECUSADA e a
 * lista volta como estava (a tela já desabilita o botão; isto cobre a corrida).
 */
export function reactivateAccount(items: readonly AccountItem[], key: string): AccountItem[] {
  const target = items.find((item) => item.key === key);
  if (!target || target.active || isAtLimit(items, { max: MAX_BANK_ACCOUNTS })) return [...items];
  return items.map((item) => (item.key === key ? { ...item, active: true } : item));
}

export function activeAccounts(items: readonly AccountItem[]): AccountValue[] {
  return items
    .filter((item) => item.active)
    .map(({ bankName, branch, accountNumber }) => ({ bankName, branch, accountNumber }));
}

export function accountsSignature(items: readonly AccountItem[]): string {
  return JSON.stringify(items.map((item) => [item.id, item.bankName, item.branch, item.accountNumber, item.active]));
}

// -----------------------------------------------------------------------------------------------
// Identificadores lidos do banco -> as três listas do formulário
// -----------------------------------------------------------------------------------------------

export type SavedIdentifier =
  | { id: string; active: boolean; type: "NAME_VARIANT" | "PIX_KEY"; value: string }
  | ({ id: string; active: boolean; type: "BANK_ACCOUNT" } & AccountValue);

export interface ReceiverLists {
  variants: EditableItem[];
  pixKeys: EditableItem[];
  accounts: AccountItem[];
}

/** Separa os identificadores (ativos e inativos) por tipo, na ordem em que vieram. */
export function listsFromIdentifiers(identifiers: readonly SavedIdentifier[]): ReceiverLists {
  const lists: ReceiverLists = { variants: [], pixKeys: [], accounts: [] };
  for (const item of identifiers) {
    if (item.type === "BANK_ACCOUNT") {
      lists.accounts.push({
        key: `saved-${item.id}`,
        id: item.id,
        active: item.active,
        bankName: item.bankName,
        branch: item.branch,
        accountNumber: item.accountNumber,
      });
    } else {
      const target = item.type === "NAME_VARIANT" ? lists.variants : lists.pixKeys;
      target.push({ key: `saved-${item.id}`, id: item.id, value: item.value, active: item.active });
    }
  }
  return lists;
}
