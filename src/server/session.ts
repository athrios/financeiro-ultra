import "server-only";

import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { loadSession, type SessionState } from "./auth";

/**
 * Sessão e perfil da requisição atual. `cache` do React memoiza por renderização: o layout
 * e a página compartilham a mesma consulta, sem repetir o acesso ao banco.
 *
 * Com Cache Components a sessão só existe em tempo de requisição: quem chama precisa estar
 * atrás de uma fronteira <Suspense> (o layout de `(app)` já faz isso).
 */
export const getSession = cache(async (): Promise<SessionState> => {
  const supabase = await createSupabaseServerClient();
  return loadSession(supabase);
});

/**
 * Nome do sócio vinculado ao perfil, para o rótulo "Administrador · Sócio Alfa".
 * Nunca é chamada para o papel Sócio (2.7.3: não mostra o nome do sócio vinculado).
 * Qualquer falha devolve null: o rótulo apenas fica sem o nome.
 */
export const getPartnerName = cache(async (partnerId: string): Promise<string | null> => {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.from("partners").select("name").eq("id", partnerId).maybeSingle();
    return data?.name ?? null;
  } catch {
    return null;
  }
});
