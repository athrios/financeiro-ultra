import { AppError } from "@/lib/errors";
import type { UserRole } from "@/lib/roles";

import type { SessionState } from "../auth";

/**
 * Quem pode enviar e quem pode ler comprovantes (02-modelagem-dados.md: `private.can_operate()`
 * para enviar e `private.can_read_business()` para ler). Papel Sócio fica de fora até a
 * P-02b; usuário sem papel e inativo nunca chegam a um perfil ativo (ver `loadSession`).
 *
 * Esta checagem só dá a resposta cedo e clara. A barreira real é o RLS do banco (tabela e
 * storage), que repete a mesma regra.
 */
export const PROOF_UPLOAD_ROLES: readonly UserRole[] = ["ADMINISTRATOR", "OPERATOR"];
export const PROOF_READ_ROLES: readonly UserRole[] = ["ADMINISTRATOR", "OPERATOR", "VIEWER"];

export function canUploadProof(role: UserRole): boolean {
  return PROOF_UPLOAD_ROLES.includes(role);
}

export function canReadProof(role: UserRole): boolean {
  return PROOF_READ_ROLES.includes(role);
}

/**
 * Exige sessão com perfil ativo e papel permitido; devolve o usuário.
 * Sem sessão: UNAUTHENTICATED. Autenticado sem acesso, Sócio ou papel insuficiente: FORBIDDEN
 * (o motivo exato não é revelado).
 */
export function requireProofRole(
  session: SessionState,
  allowed: (role: UserRole) => boolean,
): { userId: string; role: UserRole } {
  if (session.status === "anonymous") throw new AppError("UNAUTHENTICATED");
  if (session.status === "no-access") throw new AppError("FORBIDDEN");
  if (!allowed(session.profile.role)) throw new AppError("FORBIDDEN");
  return { userId: session.profile.userId, role: session.profile.role };
}
