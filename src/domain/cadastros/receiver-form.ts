/**
 * Leitura do `FormData` dos formulários de recebedor e tradução dos erros para as listas da tela.
 *
 * O `FormData` é entrada NÃO confiável (a ação é alcançável por POST direto): aqui só se separa o texto
 * de cada campo; quem valida é o esquema (`receiverSaveSchema`) e, depois, o banco. Sem Next, sem React.
 *
 * Campos do formulário:
 *  - `holderName`, `id` e `partnerId` (novo), `expectedUpdatedAt` (edição), `reason`;
 *  - `variants` e `pixKeys`: um campo por item ATIVO (o estado final);
 *  - contas: três campos paralelos, `accountBank`, `accountBranch` e `accountNumber`, um por conta ativa
 *    (o i-ésimo de cada um forma a conta i). Se faltar um, a conta chega incompleta e é recusada.
 */

import type { ZodError } from "zod";

import type { ActionError } from "@/lib/errors";

import { readField, readFieldList, type FormDataLike } from "./partner-form";
import type { ReceiverIdentifierInput } from "./schemas";

export const RECEIVER_FORM_FIELDS = ["holderName", "variants", "pixKeys", "accounts"] as const;
export type ReceiverFormField = (typeof RECEIVER_FORM_FIELDS)[number];
export type ReceiverFieldErrors = Partial<Record<ReceiverFormField, string>>;

type RawIdentifier =
  | { type: "NAME_VARIANT" | "PIX_KEY"; value: string }
  | { type: "BANK_ACCOUNT"; bankName: string; branch: string; accountNumber: string };

/** Entrada bruta de `receiverSaveSchema`. */
export function readReceiverSaveForm(form: FormDataLike) {
  const banks = readFieldList(form, "accountBank");
  const branches = readFieldList(form, "accountBranch");
  const numbers = readFieldList(form, "accountNumber");
  const accountCount = Math.max(banks.length, branches.length, numbers.length);

  const identifiers: RawIdentifier[] = [
    ...readFieldList(form, "variants").map((value): RawIdentifier => ({ type: "NAME_VARIANT", value })),
    ...readFieldList(form, "pixKeys").map((value): RawIdentifier => ({ type: "PIX_KEY", value })),
    ...Array.from({ length: accountCount }, (_, index): RawIdentifier => ({
      type: "BANK_ACCOUNT",
      bankName: banks[index] ?? "",
      branch: branches[index] ?? "",
      accountNumber: numbers[index] ?? "",
    })),
  ];

  return {
    id: readField(form, "id"),
    partnerId: readField(form, "partnerId"),
    holderName: typeof form.get("holderName") === "string" ? (form.get("holderName") as string) : "",
    identifiers,
    expectedUpdatedAt: readField(form, "expectedUpdatedAt"),
    reason: readField(form, "reason"),
  };
}

/** Entrada bruta de `receiverSetActiveSchema`. `active` só vale "true" ou "false". */
export function readReceiverSetActiveForm(form: FormDataLike) {
  const active = form.get("active");
  return {
    id: readField(form, "id") ?? "",
    active: active === "true" ? true : active === "false" ? false : undefined,
    expectedUpdatedAt: readField(form, "expectedUpdatedAt") ?? "",
    reason: readField(form, "reason"),
  };
}

function fieldOfIdentifier(type: ReceiverIdentifierInput["type"] | undefined): ReceiverFormField | null {
  switch (type) {
    case "NAME_VARIANT":
      return "variants";
    case "PIX_KEY":
      return "pixKeys";
    case "BANK_ACCOUNT":
      return "accounts";
    default:
      return null;
  }
}

export interface ReceiverValidationSummary {
  /** Primeira mensagem de cada lista ou campo do formulário. */
  fieldErrors: ReceiverFieldErrors;
  /** Primeira mensagem de um problema que a tela não mostra em campo (versão, sócio...); ou `null`. */
  formMessage: string | null;
}

/**
 * Agrupa os problemas do `zod` por campo do formulário. O problema de um item de `identifiers` vai à
 * lista do TIPO do item (o índice do problema é o da lista bruta enviada).
 */
export function summarizeReceiverValidation(
  error: ZodError,
  rawIdentifiers: ReadonlyArray<{ type: ReceiverIdentifierInput["type"] }>,
): ReceiverValidationSummary {
  const fieldErrors: ReceiverFieldErrors = {};
  let formMessage: string | null = null;

  for (const issue of error.issues) {
    const [first, second] = issue.path;
    let field: ReceiverFormField | null = null;
    if (first === "holderName") field = "holderName";
    else if (first === "identifiers") field = typeof second === "number" ? fieldOfIdentifier(rawIdentifiers[second]?.type) : null;

    if (field) {
      if (!(field in fieldErrors)) fieldErrors[field] = issue.message;
    } else if (formMessage === null) {
      formMessage = issue.message;
    }
  }
  return { fieldErrors, formMessage };
}

/**
 * A que lista ou campo do formulário pertence um erro do banco (já traduzido por `mapDatabaseError`);
 * `null` = erro geral, mostrado no resumo do topo.
 */
export function receiverFieldOfError(error: ActionError): ReceiverFormField | null {
  if (error.field === "holderName") return "holderName";

  switch (error.hint) {
    case "IDENTIFIER_TAKEN":
      return error.details?.hint === "IDENTIFIER_TAKEN" ? fieldOfIdentifier(error.details.identifierType ?? undefined) : null;
    case "INVALID_PIX_KEY":
      return "pixKeys";
    case "INVALID_BANK":
    case "INVALID_BRANCH":
    case "INVALID_ACCOUNT":
      return "accounts";
    case "LIST_LIMIT_EXCEEDED": {
      // Teto de itens (RAT-D026): a lista é a que o banco disse (o `identifier_type` coincide com a chave).
      const list = error.details?.hint === "LIST_LIMIT_EXCEEDED" ? error.details.list : null;
      return list === "NAME_VARIANT" || list === "PIX_KEY" || list === "BANK_ACCOUNT" ? fieldOfIdentifier(list) : null;
    }
    case "PARTNER_NAME_TAKEN":
      return error.field === "identifiers" ? "variants" : null;
    case "NAME_REQUIRED":
    case "NAME_TOO_LONG":
      return error.field === "identifiers" ? "variants" : null;
    default:
      return null;
  }
}
