import type { UserRole } from "@/lib/roles";
import type { AppSupabaseClient } from "@/lib/supabase/types";

export type { UserRole };

export interface ActiveProfile {
  userId: string;
  email: string | null;
  fullName: string | null;
  role: UserRole;
  /** Sócio representado pelo usuário (RAT-D011). Obrigatório para PARTNER; opcional nos demais. */
  partnerId: string | null;
}

/** Por que um usuário autenticado não tem acesso (a interface só mostra um estado neutro). */
export type NoAccessReason = "no-profile" | "no-role" | "inactive";

export type SessionState =
  | { status: "anonymous" }
  /** Autenticado, mas sem perfil, sem papel atribuído ou inativo: nenhum acesso. */
  | { status: "no-access"; email: string | null; reason: NoAccessReason }
  | { status: "active"; profile: ActiveProfile };

/**
 * Identifica o usuário a partir do JWT validado (getClaims) e carrega o
 * perfil. Não confiar apenas no proxy: toda página/ação chama esta função.
 *
 * O papel vive só em `profiles.role` (nunca em app_metadata). Usuário novo nasce
 * sem papel: autentica, mas não acessa nada até receber um (procedimento auditado).
 */
export async function loadSession(supabase: AppSupabaseClient): Promise<SessionState> {
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims?.sub) {
    return { status: "anonymous" };
  }

  const email = typeof claims.email === "string" ? claims.email : null;

  // O RLS de profiles já restringe a linha ao próprio usuário (ou a qualquer, para o
  // Administrador); o filtro por id mantém a consulta do usuário corrente explícita.
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, partner_id, active")
    .eq("id", claims.sub)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao carregar o perfil: ${error.message}`);
  }
  if (!profile) {
    return { status: "no-access", email, reason: "no-profile" };
  }
  if (!profile.active) {
    return { status: "no-access", email, reason: "inactive" };
  }
  if (profile.role === null) {
    return { status: "no-access", email, reason: "no-role" };
  }

  return {
    status: "active",
    profile: {
      userId: profile.id,
      email,
      fullName: profile.full_name,
      role: profile.role,
      partnerId: profile.partner_id,
    },
  };
}
