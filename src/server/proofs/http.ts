import { NextResponse } from "next/server";

import { APP_ERROR_MESSAGES, toAppError, type AppErrorCode } from "@/lib/errors";
import type { Logger } from "@/lib/logger";

import { ProofFileError } from "./proof-file";

/** Código da aplicação -> status HTTP. */
const STATUS_BY_CODE: Readonly<Record<AppErrorCode, number>> = {
  VALIDATION: 400,
  CONFLICT: 409,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RULE_VIOLATION: 422,
  UNAUTHENTICATED: 401,
  UNEXPECTED: 500,
};

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status, headers: NO_STORE });
}

/**
 * Resposta de erro: `{ ok: false, error: { code, message, field? } }`. Só o texto fixo em
 * pt-BR vai para o cliente; a causa original e a pilha ficam no log. Erro inesperado sempre
 * vira a mensagem genérica.
 */
export function jsonError(error: unknown, logger: Logger): NextResponse {
  const appError = toAppError(error);
  const status = appError instanceof ProofFileError ? appError.status : STATUS_BY_CODE[appError.code];
  const message = appError.code === "UNEXPECTED" ? APP_ERROR_MESSAGES.UNEXPECTED : appError.message;

  if (appError.code === "UNEXPECTED") {
    logger.error("proof.unexpected_error", { error: appError.cause ?? appError });
  } else {
    logger.warn("proof.request_refused", { code: appError.code, status, cause: appError.cause });
  }

  const body = {
    ok: false as const,
    error: appError.field ? { code: appError.code, message, field: appError.field } : { code: appError.code, message },
  };
  return NextResponse.json(body, { status, headers: NO_STORE });
}
