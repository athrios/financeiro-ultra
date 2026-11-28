/**
 * Leitura do `FormData` dos formulários de sócio e tradução dos erros do `zod` para a tela.
 *
 * O `FormData` é entrada NÃO confiável (a ação é alcançável por POST direto): aqui só se separa o
 * texto de cada campo; a validação de verdade é dos esquemas (`schemas.ts`) e, depois, do banco.
 * Campo que não é texto (arquivo) vira ausente. Sem Next, sem React.
 */

import type { ZodError } from "zod";

/** O que a ação precisa de um `FormData` (e de um objeto de teste). */
export interface FormDataLike {
  get(name: string): unknown;
  getAll(name: string): unknown[];
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Texto do campo, ou `null` quando ausente ou vazio. */
export function readField(form: FormDataLike, name: string): string | null {
  const value = text(form.get(name));
  return value === null || value === "" ? null : value;
}

/** Todos os textos de um campo repetido (ex.: um `aliases` por apelido ativo). */
export function readFieldList(form: FormDataLike, name: string): string[] {
  return form.getAll(name).flatMap((value) => (typeof value === "string" ? [value] : []));
}

/** Entrada bruta de `partnerSaveSchema`. */
export function readPartnerSaveForm(form: FormDataLike) {
  return {
    id: readField(form, "id"),
    name: text(form.get("name")) ?? "",
    aliases: readFieldList(form, "aliases"),
    expectedUpdatedAt: readField(form, "expectedUpdatedAt"),
    reason: readField(form, "reason"),
  };
}

/** Entrada bruta de `partnerSetActiveSchema`. `active` só vale "true" ou "false". */
export function readPartnerSetActiveForm(form: FormDataLike) {
  const active = text(form.get("active"));
  return {
    id: readField(form, "id") ?? "",
    active: active === "true" ? true : active === "false" ? false : undefined,
    expectedUpdatedAt: readField(form, "expectedUpdatedAt") ?? "",
    confirmedReceiverIds: readFieldList(form, "confirmedReceiverIds"),
    reason: readField(form, "reason"),
  };
}

export interface ValidationSummary {
  /** Primeira mensagem de cada campo do formulário (chave = nome do campo). */
  fieldErrors: Record<string, string>;
  /** Primeira mensagem de campo que a tela não mostra (versão, identificador...); ou `null`. */
  formMessage: string | null;
}

/**
 * Agrupa os problemas do `zod` por campo. `knownFields` são os campos que existem na tela; um
 * problema em outro campo (ex.: a versão do cadastro) vira a mensagem geral do formulário.
 */
export function summarizeValidation(error: ZodError, knownFields: readonly string[]): ValidationSummary {
  const fieldErrors: Record<string, string> = {};
  let formMessage: string | null = null;
  for (const issue of error.issues) {
    const key = typeof issue.path[0] === "string" ? issue.path[0] : "";
    if (knownFields.includes(key)) {
      if (!(key in fieldErrors)) fieldErrors[key] = issue.message;
    } else if (formMessage === null) {
      formMessage = issue.message;
    }
  }
  return { fieldErrors, formMessage };
}
