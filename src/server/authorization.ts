import { findNavItemByHref, canSeeNavItem, type NavItem } from "@/lib/navigation";
import { ROLE_LABEL, type UserRole } from "@/lib/roles";

import type { ActiveProfile, NoAccessReason, SessionState } from "./auth";

/**
 * Helpers de autorização PARA A EXPERIÊNCIA DE USO (menu, estados de acesso).
 *
 * Não são a barreira de segurança: o servidor revalida em cada página/ação e o RLS do
 * banco decide de fato. Estas funções só evitam mostrar à pessoa o que ela não pode usar.
 * Sem regra financeira aqui (plano, seção 5).
 */

export function hasRole(profile: Pick<ActiveProfile, "role">, roles: readonly UserRole[]): boolean {
  return roles.includes(profile.role);
}

export function isAdministrator(profile: Pick<ActiveProfile, "role">): boolean {
  return profile.role === "ADMINISTRATOR";
}

/**
 * Papel Sócio (login dos sócios, RAT-D011): sem acesso a dados de negócio até a decisão
 * P-02b. Hoje nenhum módulo é acessível a ele.
 */
export function isPartnerWithoutScope(profile: Pick<ActiveProfile, "role">): boolean {
  return profile.role === "PARTNER";
}

/** O papel pode abrir este item de navegação? (Sócio: nunca, enquanto a P-02b estiver aberta.) */
export function canAccessNavItem(profile: Pick<ActiveProfile, "role">, item: NavItem): boolean {
  if (isPartnerWithoutScope(profile)) return false;
  return canSeeNavItem(profile.role, item);
}

/** Texto do papel para a interface. */
export function roleLabel(role: UserRole): string {
  return ROLE_LABEL[role];
}

/**
 * Rótulo do bloco do usuário (03-ui-ux.md, 2.2): "Administrador · Sócio Alfa" quando há
 * vínculo com cadastro de sócio; senão, só o papel. O nome do sócio nunca é passado para o
 * papel Sócio (2.7.3): quem chama decide se tem o nome.
 */
export function userRoleLabel(role: UserRole, partnerName?: string | null): string {
  const label = ROLE_LABEL[role];
  return partnerName ? `${label} · ${partnerName}` : label;
}

export type AccessDecision =
  | { kind: "anonymous" }
  /** Autenticado sem perfil ativo: tela 2.7.1 (regra única de acesso, J1). */
  | { kind: "no-access"; reason: NoAccessReason }
  /** Papel Sócio sem escopo definido (P-02b): tela 2.7.3. */
  | { kind: "partner-no-scope" }
  /** Perfil ativo e rota permitida. */
  | { kind: "allowed" }
  /** Perfil ativo, mas a área não é permitida ao papel: tela 2.7.4. */
  | { kind: "forbidden"; role: UserRole };

/**
 * Decisão de acesso para uma sessão e uma rota. `href` é o caminho do módulo (ex.:
 * "/competencias"); rotas fora da navegação (ex.: o Dashboard "/") usam o item "/".
 * Rota sem item de navegação é tratada como permitida a qualquer perfil ativo que não seja Sócio.
 */
export function decideAccess(session: SessionState, href: string): AccessDecision {
  if (session.status === "anonymous") return { kind: "anonymous" };
  if (session.status === "no-access") return { kind: "no-access", reason: session.reason };

  const { profile } = session;
  if (isPartnerWithoutScope(profile)) return { kind: "partner-no-scope" };

  const item = findNavItemByHref(href);
  if (item && !canAccessNavItem(profile, item)) return { kind: "forbidden", role: profile.role };
  return { kind: "allowed" };
}
