import type { AppSupabaseClient } from "@/lib/supabase/types";

/**
 * Cliente Supabase falso para testes de unidade da camada de servidor (sem rede, sem banco).
 *
 * - `supabase.rpc(nome, args)` registra a chamada e devolve o que `handlers.rpc[nome]` produz;
 * - `supabase.from(tabela)....` aceita qualquer encadeamento (select, eq, order, range...), registra
 *   cada passo e, ao ser aguardado (ou ao chamar `maybeSingle`/`single`), devolve o que
 *   `handlers.tables[tabela]` produz a partir da consulta registrada.
 *
 * Os formatos de dados são os do PostgREST (snake_case, `updated_at` em texto), que foram conferidos
 * contra o banco local na E4. Isto NÃO substitui a verificação contra o banco: só prova que o código
 * monta as chamadas certas e traduz as respostas e os erros.
 */

export interface FakeError {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

export interface FakeResult {
  data: unknown;
  error: FakeError | null;
  count?: number | null;
}

export interface RecordedQuery {
  table: string;
  /** Passos do encadeamento, em ordem: [método, argumentos]. */
  steps: Array<[string, unknown[]]>;
}

export interface RecordedRpc {
  name: string;
  args: Record<string, unknown>;
}

export interface FakeHandlers {
  rpc?: Record<string, (args: Record<string, unknown>) => FakeResult>;
  tables?: Record<string, (query: RecordedQuery) => FakeResult>;
}

export interface FakeSupabase {
  client: AppSupabaseClient;
  rpcCalls: RecordedRpc[];
  queries: RecordedQuery[];
  /** Passos de uma consulta, por nome do método (ex.: `stepsOf(query, "eq")`). */
  stepsOf(query: RecordedQuery, method: string): unknown[][];
}

export function ok(data: unknown): FakeResult {
  return { data, error: null };
}

export function fail(error: FakeError): FakeResult {
  return { data: null, error };
}

export function createFakeSupabase(handlers: FakeHandlers = {}): FakeSupabase {
  const rpcCalls: RecordedRpc[] = [];
  const queries: RecordedQuery[] = [];

  const builder = (query: RecordedQuery, resolve: () => FakeResult): unknown =>
    new Proxy(
      {},
      {
        get(_target, property) {
          if (property === "then") {
            return (onFulfilled: (value: FakeResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
              Promise.resolve(resolve()).then(onFulfilled, onRejected);
          }
          return (...args: unknown[]) => {
            query.steps.push([String(property), args]);
            return builder(query, resolve);
          };
        },
      },
    );

  const client = {
    rpc(name: string, args: Record<string, unknown> = {}) {
      rpcCalls.push({ name, args });
      const handler = handlers.rpc?.[name];
      const result = handler ? handler(args) : fail({ code: "PGRST202", message: `rpc ${name} sem handler no teste` });
      return Promise.resolve(result);
    },
    from(table: string) {
      const query: RecordedQuery = { table, steps: [] };
      queries.push(query);
      return builder(query, () => {
        const handler = handlers.tables?.[table];
        return handler ? handler(query) : fail({ code: "PGRST205", message: `tabela ${table} sem handler no teste` });
      });
    },
  };

  return {
    client: client as unknown as AppSupabaseClient,
    rpcCalls,
    queries,
    stepsOf: (query, method) => query.steps.filter(([name]) => name === method).map(([, args]) => args),
  };
}

/** Erro como o PostgREST entrega: `code` = SQLSTATE, `hint` = chave, `details` = DETAIL (JSON em texto). */
export function dbError(code: string, hint: string | null, detail?: unknown, message = "mensagem do banco"): FakeError {
  return {
    code,
    hint,
    message,
    details: detail === undefined ? null : typeof detail === "string" ? detail : JSON.stringify(detail),
  };
}
