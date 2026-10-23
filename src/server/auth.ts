import type { AppSupabaseClient, DbEnums } from "@/lib/supabase/types";

export type UserRole = DbEnums["user_role"];

export interface ActiveProfile {
  userId: string;
  email: string | null;
  fullName: string | null;
  role: UserRole;
  indicatorId: string | null;
  indicatorName: string | null;
}

export type SessionState =
  | { status: "anonymous" }
  /** Autenticado, mas sem perfil ou com perfil inativo: nenhum acesso. */
  | { status: "no-access"; email: string | null }
  | { status: "active"; profile: ActiveProfile };

/**
 * Identifica o usuário a partir do JWT validado (getClaims) e carrega o
 * perfil. Não confiar apenas no proxy: toda página/ação chama esta função.
 */
export async function loadSession(supabase: AppSupabaseClient): Promise<SessionState> {
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims?.sub) {
    return { status: "anonymous" };
  }

  const email = typeof claims.email === "string" ? claims.email : null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, indicator_id, active, indicator:indicators ( name )")
    .eq("id", claims.sub)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao carregar o perfil: ${error.message}`);
  }
  if (!profile || !profile.active) {
    return { status: "no-access", email };
  }

  return {
    status: "active",
    profile: {
      userId: profile.id,
      email,
      fullName: profile.full_name,
      role: profile.role,
      indicatorId: profile.indicator_id,
      indicatorName: profile.indicator?.name ?? null,
    },
  };
}

export function isAdmin(profile: ActiveProfile): boolean {
  return profile.role === "ADMIN_FINANCEIRO";
}
