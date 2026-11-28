import "server-only";

import type { DatabaseErrorContext } from "@/lib/cadastro-errors";
import { toAppError, type ActionError, fail } from "@/lib/errors";
import { getRequestLogger } from "@/server/request-context";

/** Falha de uma Server Action de cadastro, pronta para a tela (serializável, sem `cause`). */
export interface ActionFailure {
  error: ActionError;
  /** Para o erro inesperado: o correlation id que está no log do servidor ("Código de suporte"). */
  supportCode: string | null;
}

/**
 * O que do erro original vai ao log técnico (SEG-CAD-01): só `code`, `hint` e `message`. O `details` e
 * o resto do objeto do banco (PostgREST) ficam de fora: nos cadastros eles carregam dono, documento,
 * chave Pix e conta ("Key (...)=(...) already exists", "Failing row contains (...)"). O logger ainda
 * redige CPF, CNPJ e e-mail que apareçam dentro do `message`.
 */
export function describeCause(cause: unknown): Record<string, string> | undefined {
  if (cause === null || cause === undefined) return undefined;
  if (typeof cause === "string") return { message: cause };
  if (typeof cause !== "object") return undefined;

  const source = cause as { code?: unknown; hint?: unknown; message?: unknown };
  const result: Record<string, string> = {};
  for (const key of ["code", "hint", "message"] as const) {
    const value = source[key];
    if (typeof value === "string" && value !== "") result[key] = value;
  }
  return result;
}

/**
 * Converte qualquer erro lançado pela camada de servidor em algo que a tela pode receber:
 * `code`, `message` (sempre da tabela fixa em pt-BR), `field`, `hint` e `details`. O `cause` (mensagem
 * do banco, que pode citar tabela, coluna ou valor) NUNCA sai daqui; só vai ao log, e só quando o
 * erro é inesperado. O resultado passa por `fail()`, que copia só os campos conhecidos.
 */
export async function toActionFailure(
  error: unknown,
  operation: string,
  correlationId: string | null,
  context?: DatabaseErrorContext,
): Promise<ActionFailure> {
  const appError = toAppError(error, context);
  const unexpected = appError.code === "UNEXPECTED";

  if (unexpected) {
    try {
      const logger = await getRequestLogger();
      logger.error("cadastros.action_failed", { operation, code: appError.code, cause: describeCause(appError.cause) });
    } catch {
      // O log nunca derruba a resposta ao usuário.
    }
  }

  return { error: fail(appError).error, supportCode: unexpected ? correlationId : null };
}
