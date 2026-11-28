import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCorrelationId } from "@/server/request-context";

import type { CadastroContext } from "./types";

/**
 * Contexto de uma requisição para as escritas dos cadastros: cliente Supabase da SESSÃO (RLS) e o
 * correlation id do `request-context`, que vai em `p_correlation_id` e liga a ação à auditoria.
 * Server Components e Server Actions chamam isto uma vez por requisição.
 */
export async function getCadastroContext(): Promise<CadastroContext> {
  const [supabase, correlationId] = await Promise.all([createSupabaseServerClient(), getCorrelationId()]);
  return { supabase, correlationId };
}
