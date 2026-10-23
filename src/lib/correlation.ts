/**
 * Correlation id por requisição (plano, seção 9; 02-modelagem-dados, 3.2 e 12.4).
 *
 * O proxy GERA um UUID novo em cada requisição (nunca confia no valor enviado pelo
 * cliente, para não permitir injeção em log). O servidor o repassa ao Supabase no
 * cabeçalho `x-correlation-id`, e o banco o grava em `audit_logs.correlation_id`.
 */

export const CORRELATION_HEADER = "x-correlation-id";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidCorrelationId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function newCorrelationId(): string {
  return crypto.randomUUID();
}
