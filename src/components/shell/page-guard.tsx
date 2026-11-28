import type { ReactNode } from "react";

import type { UserRole } from "@/lib/roles";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { decideAccess } from "@/server/authorization";
import { getSession } from "@/server/session";

import { ForbiddenState } from "./access-states";

export type PageGuard =
  | { allowed: true; supabase: AppSupabaseClient; role: UserRole }
  /** `node` é o que a página devolve no lugar do conteúdo (estado 2.7.4); `null` quando o layout já resolveu. */
  | { allowed: false; node: ReactNode };

/**
 * Guarda de página (UX): confere, a cada requisição, se o papel pode abrir a área `href` da
 * navegação. Quem não pode vê "Sem permissão" (FND 2.7.4) em vez do conteúdo, e NENHUMA leitura
 * de dados acontece. Os estados globais (sem perfil ativo, Sócio) já foram resolvidos pelo layout.
 *
 * Não é a barreira de segurança: o RLS do banco decide o que cada papel lê, e as Server Actions
 * autorizam por conta própria.
 */
export async function guardPage(href: string): Promise<PageGuard> {
  const session = await getSession();
  const decision = decideAccess(session, href);
  if (decision.kind === "forbidden") return { allowed: false, node: <ForbiddenState role={decision.role} /> };
  if (decision.kind !== "allowed" || session.status !== "active") return { allowed: false, node: null };
  return { allowed: true, supabase: await createSupabaseServerClient(), role: session.profile.role };
}

/**
 * Como `guardPage`, mas só o Administrador passa: quem lê a área (Operador e Visualizador em
 * Clientes) e abre uma tela de escrita pela URL vê "Sem permissão" (FND 2.7.4, UI 2.3).
 */
export async function guardAdminPage(href: string): Promise<PageGuard> {
  const guard = await guardPage(href);
  if (guard.allowed && guard.role !== "ADMINISTRATOR") return { allowed: false, node: <ForbiddenState role={guard.role} /> };
  return guard;
}
