import { CookieJar, signIn, type Session } from "./http";
import type { UserKey } from "./env";

/**
 * Sessões dos e2e da CAD-001. O `global-setup.ts` entra uma vez por papel e entrega as sessões aos
 * arquivos de teste por `provide`/`inject` do Vitest: assim a execução inteira faz poucos logins e
 * não estoura o limite do Supabase local (30 por 5 minutos).
 */

export type CadRole = Extract<UserKey, "admin" | "operator" | "viewer" | "partner">;
export const CAD_ROLES: readonly CadRole[] = ["admin", "operator", "viewer", "partner"];

export interface SerializedSession {
  user: UserKey;
  accessToken: string;
  cookies: Array<[string, string]>;
}

export type SerializedSessions = Record<CadRole, SerializedSession>;

declare module "vitest" {
  interface ProvidedContext {
    cadSessions: SerializedSessions;
  }
}

export function serializeSession(session: Session): SerializedSession {
  const cookies = session.jar.names().map((name) => [name, session.jar.get(name) ?? ""] as [string, string]);
  return { user: session.user, accessToken: session.accessToken, cookies };
}

export function restoreSessions(provided: SerializedSessions): Record<CadRole, Session> {
  const out = {} as Record<CadRole, Session>;
  for (const role of CAD_ROLES) {
    const jar = new CookieJar();
    for (const [name, value] of provided[role].cookies) jar.set(name, value);
    out[role] = { user: provided[role].user, accessToken: provided[role].accessToken, jar };
  }
  return out;
}

/** Entra com os quatro papéis (chamado só pelo global-setup). */
export async function signInAllRoles(): Promise<SerializedSessions> {
  const out = {} as SerializedSessions;
  for (const role of CAD_ROLES) out[role] = serializeSession(await signIn(role));
  return out;
}
