import "server-only";

import { AppError, mapDatabaseError, type DatabaseErrorContext, type DatabaseErrorLike } from "@/lib/errors";

/**
 * Parâmetros que o banco aceita nulos mas os tipos gerados (`supabase gen types`) marcam como
 * obrigatórios: o `null` vai como JSON `null` e chega como `NULL` na função. É o único ponto de
 * conversão do tipo para os parâmetros anuláveis das funções (p_*_id novos, p_expected_updated_at
 * do cadastro novo, p_trade_name, p_notes, p_document).
 */
export function nullable<T>(value: T | null): T {
  return value as T;
}

/** Parâmetros opcionais com `default null`: ausentes quando não informados. */
export function optional<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

interface QueryResult<T> {
  data: T | null;
  error: DatabaseErrorLike | null;
}

/** Qualquer resposta do supabase-js (união de sucesso e erro) com `data` e `error`. */
interface AnyResult {
  data: unknown;
  error: DatabaseErrorLike | null;
}

/** Erro do banco -> AppError (mensagem em pt-BR, hint e details); resposta vazia vira UNEXPECTED. */
export function unwrap<R extends AnyResult>(result: R, context?: DatabaseErrorContext): NonNullable<R["data"]> {
  if (result.error) throw mapDatabaseError(result.error, context);
  if (result.data === null || result.data === undefined) {
    throw new AppError("UNEXPECTED", { cause: "Resposta vazia do banco" });
  }
  return result.data as NonNullable<R["data"]>;
}

/** Como `unwrap`, mas lista ausente vale lista vazia. */
export function unwrapRows<T>(result: QueryResult<T[]>, context?: DatabaseErrorContext): T[] {
  if (result.error) throw mapDatabaseError(result.error, context);
  return result.data ?? [];
}

/** Como `unwrap`, mas devolve `null` quando não há linha (cadastro inexistente ou escondido pelo RLS). */
export function unwrapMaybe<R extends AnyResult>(result: R, context?: DatabaseErrorContext): NonNullable<R["data"]> | null {
  if (result.error) throw mapDatabaseError(result.error, context);
  return (result.data ?? null) as NonNullable<R["data"]> | null;
}

/** Tamanho da página de leitura. Fica abaixo do `max_rows` padrão do PostgREST (1000). */
export const READ_PAGE_SIZE = 500;

/**
 * Lê TODAS as linhas de uma consulta paginando com `range`, para uma contagem ou lista nunca ser
 * truncada em silêncio pelo limite do PostgREST. A consulta precisa ter ordem estável (`order`).
 */
export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<QueryResult<T[]>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += READ_PAGE_SIZE) {
    const page = unwrapRows(await fetchPage(from, from + READ_PAGE_SIZE - 1));
    rows.push(...page);
    if (page.length < READ_PAGE_SIZE) return rows;
  }
}

const UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O texto tem o formato de um `uuid`? Id vindo da URL que não tem esse formato nunca existe: a
 * leitura devolve `null` ("Registro não encontrado") em vez de provocar erro de tipo no banco.
 */
export function isUuidText(value: string): boolean {
  return UUID_TEXT.test(value);
}
