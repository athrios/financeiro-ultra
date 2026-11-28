/**
 * Modelo de erros da aplicação (plano, seção 5).
 *
 * - Erros esperados chegam à interface como `{ ok: false, error: { code, message, field? } }`,
 *   sem exceção.
 * - O texto mostrado ao usuário vem SEMPRE de uma tabela fixa em português do Brasil.
 *   A mensagem original do banco (que pode citar tabela, coluna ou valor) fica só em
 *   `cause`, para o log. Nunca vai para a tela, e stack nunca vai para o usuário.
 * - Erro desconhecido vira mensagem genérica (o chamador registra no log com o correlation_id).
 */

import {
  mapCadastroError,
  type CadastroErrorDetails,
  type CadastroHint,
  type DatabaseErrorContext,
} from "./cadastro-errors";

export type { CadastroErrorDetails, CadastroHint, DatabaseErrorContext } from "./cadastro-errors";

export const APP_ERROR_CODES = [
  "VALIDATION", // dado informado não atende a uma regra (22023, 23514)
  "CONFLICT", // já existe (23505)
  "FORBIDDEN", // sem permissão (42501)
  "NOT_FOUND", // registro inexistente ou oculto pelo RLS
  "RULE_VIOLATION", // regra de negócio do banco (P0001)
  "UNAUTHENTICATED", // sem sessão válida
  "UNEXPECTED", // qualquer outro caso
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

/** Mensagens para o usuário, em pt-BR, sem jargão técnico. */
export const APP_ERROR_MESSAGES: Readonly<Record<AppErrorCode, string>> = {
  VALIDATION: "Os dados informados não são válidos. Confira os campos e tente novamente.",
  CONFLICT: "Já existe um registro com estes dados.",
  FORBIDDEN: "Você não tem permissão para realizar esta operação.",
  NOT_FOUND: "O registro não existe ou o conteúdo não está disponível para você.",
  RULE_VIOLATION: "A operação não pôde ser concluída porque contraria uma regra do sistema.",
  UNAUTHENTICATED: "Sua sessão expirou. Entre novamente para continuar.",
  UNEXPECTED: "Não foi possível concluir a operação. Tente novamente em instantes.",
};

export interface AppErrorOptions {
  /** Campo do formulário relacionado ao erro, quando houver. */
  field?: string;
  /** Mensagem própria (já em pt-BR e segura para o usuário). Padrão: a da tabela. */
  message?: string;
  /** Erro original. Só para log; nunca exibido. */
  cause?: unknown;
  /** Chave estável do erro do banco (contrato 6.3 da CAD-001), quando houver. */
  hint?: CadastroHint;
  /** Dados estruturados que a tela usa junto com a mensagem (dono do documento, lista de clientes...). */
  details?: CadastroErrorDetails;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly field?: string;
  readonly hint?: CadastroHint;
  readonly details?: CadastroErrorDetails;

  constructor(code: AppErrorCode, options: AppErrorOptions = {}) {
    super(options.message ?? APP_ERROR_MESSAGES[code], { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.field = options.field;
    this.hint = options.hint;
    this.details = options.details;
  }
}

/** Formato de erro esperado devolvido pelos casos de uso e pelas Server Actions. */
export interface ActionError {
  code: AppErrorCode;
  message: string;
  field?: string;
  /** Chave estável do erro (ex.: "STALE_VERSION", "POSSIBLE_DUPLICATE"); só quando o banco informou. */
  hint?: CadastroHint;
  /** Dados estruturados do erro, serializáveis (Server Action -> tela). */
  details?: CadastroErrorDetails;
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(error: AppError | ActionError): { ok: false; error: ActionError } {
  const { code, message, field, hint, details } = error;
  const result: ActionError = { code, message };
  if (field !== undefined) result.field = field;
  if (hint !== undefined) result.hint = hint;
  if (details !== undefined) result.details = details;
  return { ok: false, error: result };
}

/** Forma mínima de erro do PostgREST / supabase-js / driver do Postgres. */
export interface DatabaseErrorLike {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

/** SQLSTATE -> código da aplicação. */
const SQLSTATE_TO_CODE: Readonly<Record<string, AppErrorCode>> = {
  "23505": "CONFLICT", // unique_violation
  "23514": "VALIDATION", // check_violation
  "42501": "FORBIDDEN", // insufficient_privilege (inclui RLS)
  "22023": "VALIDATION", // invalid_parameter_value
  P0001: "RULE_VIOLATION", // raise_exception
  P0002: "NOT_FOUND", // no_data_found
  PGRST116: "NOT_FOUND", // PostgREST: .single() sem linha
  PGRST301: "UNAUTHENTICATED", // PostgREST: JWT inválido ou expirado
};

export function isDatabaseErrorLike(value: unknown): value is DatabaseErrorLike {
  return typeof value === "object" && value !== null && ("code" in value || "message" in value);
}

/**
 * Converte um erro do banco em AppError.
 *
 * 1. Com `hint` do contrato dos cadastros (CAD-001, 6.3) e SQLSTATE coerente, a mensagem, o campo
 *    e os dados estruturados vêm de `cadastro-errors.ts` (texto fixo em pt-BR).
 * 2. Senão, vale o mapa por SQLSTATE (comportamento original da FND), com a mensagem padrão.
 * 3. Erros desconhecidos viram UNEXPECTED (mensagem genérica).
 *
 * O original fica sempre em `cause`, só para o log. `context` é opcional: o que quem chama sabe
 * e o banco não diz (tipo do documento, nome do sócio...).
 */
export function mapDatabaseError(error: unknown, context?: DatabaseErrorContext): AppError {
  if (error instanceof AppError) return error;
  if (isDatabaseErrorLike(error)) {
    const cadastro = mapCadastroError(error, context);
    if (cadastro) {
      return new AppError(cadastro.code, {
        cause: error,
        message: cadastro.message,
        field: cadastro.field,
        hint: cadastro.hint,
        details: cadastro.details,
      });
    }
    if (typeof error.code === "string") {
      const mapped = SQLSTATE_TO_CODE[error.code];
      if (mapped) return new AppError(mapped, { cause: error });
    }
  }
  return new AppError("UNEXPECTED", { cause: error });
}

/** Qualquer valor lançado -> AppError (para o catch de borda). */
export function toAppError(error: unknown, context?: DatabaseErrorContext): AppError {
  return error instanceof AppError ? error : mapDatabaseError(error, context);
}
