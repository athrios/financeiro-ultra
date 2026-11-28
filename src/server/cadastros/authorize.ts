import "server-only";

import type { ActionError } from "@/lib/errors";
import { getSession } from "@/server/session";

import { getCadastroContext } from "./context";
import type { CadastroContext } from "./types";

export type AdminAccess =
  /** Perfil ativo e Administrador: o contexto da requisição (cliente da sessão, correlation id). */
  | { kind: "ok"; ctx: CadastroContext; userId: string }
  /** Sem sessão: a ação NÃO é dada como concluída; quem chama leva ao login (UXC-39). */
  | { kind: "unauthenticated" }
  /** Autenticado, mas sem perfil ativo ou sem o papel Administrador (negar por padrão). */
  | { kind: "forbidden"; error: ActionError };

const FORBIDDEN_MESSAGE = "Você não tem permissão para fazer esta alteração.";

/**
 * Autenticação e autorização DENTRO de cada Server Action de cadastro (plano 4.3; Next 16:
 * "Always verify authentication and authorization inside every Server Function"). A página que
 * mostra o formulário não é barreira: a ação é alcançável por POST direto.
 *
 * `getSession()` valida o JWT (`getClaims`) e lê o perfil a cada requisição: perfil inexistente,
 * sem papel ou inativo vira "forbidden"; só ADMINISTRATOR passa. É defesa e mensagem: a barreira
 * real é o banco (`private.require_admin()` dentro de cada função, que repete a conferência).
 */
export async function authorizeAdmin(): Promise<AdminAccess> {
  const session = await getSession();

  if (session.status === "anonymous") return { kind: "unauthenticated" };

  if (session.status !== "active" || session.profile.role !== "ADMINISTRATOR") {
    return { kind: "forbidden", error: { code: "FORBIDDEN", message: FORBIDDEN_MESSAGE, hint: "ADMIN_REQUIRED" } };
  }

  const ctx = await getCadastroContext();
  return { kind: "ok", ctx, userId: session.profile.userId };
}
