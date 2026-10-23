import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";

import { CORRELATION_HEADER, isValidCorrelationId } from "@/lib/correlation";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";
import type { Database } from "@/types/database.types";

import { supabaseCookieOptions } from "./cookie-options";
import type { AppSupabaseClient } from "./types";

/**
 * Cliente Supabase para Server Components, Server Actions e Route Handlers.
 * Usa a sessão do usuário (cookies): todas as consultas passam pelo RLS.
 * Criar um novo cliente por requisição.
 *
 * Repassa o correlation id da requisição (gerado pelo proxy) no cabeçalho
 * `x-correlation-id`; o banco o grava em audit_logs.correlation_id (02, 3.2 e 12.4).
 */
export async function createSupabaseServerClient(): Promise<AppSupabaseClient> {
  // O cliente do Supabase lê o relógio (Date.now) ao ler a sessão. Com Cache Components, isso não
  // pode acontecer durante a pré-renderização do "App Shell"; connection() marca o trecho como
  // dependente da requisição real e evita o erro "unstable value Date.now()" a cada página.
  await connection();
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);

  const correlationId = requestHeaders.get(CORRELATION_HEADER);

  return createServerClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    cookieOptions: supabaseCookieOptions(),
    global: isValidCorrelationId(correlationId) ? { headers: { [CORRELATION_HEADER]: correlationId } } : undefined,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components não podem gravar cookies; o proxy renova a sessão.
        }
      },
    },
  });
}
