import { z } from "zod";

/**
 * Parâmetros do link de e-mail do Supabase Auth em `/auth/confirm`:
 * `?token_hash=...&type=invite|recovery`.
 *
 * Só os tipos que a aplicação usa são aceitos (convite e recuperação). O `token_hash` é um
 * valor opaco: validamos apenas o formato (caracteres seguros e tamanho) antes de enviá-lo
 * ao Auth; quem decide se vale é o Supabase.
 */

export const AUTH_LINK_TYPES = ["invite", "recovery"] as const;
export type AuthLinkType = (typeof AUTH_LINK_TYPES)[number];

/** Modo da página /definir-senha (03-ui-ux.md, 2.5.2). */
export type PasswordMode = "convite" | "recuperacao";

const authLinkSchema = z.object({
  token_hash: z
    .string()
    .min(8)
    .max(512)
    .regex(/^[A-Za-z0-9_-]+$/),
  type: z.enum(AUTH_LINK_TYPES),
});

export interface AuthLinkParams {
  tokenHash: string;
  type: AuthLinkType;
}

export function parseAuthLink(input: { token_hash?: unknown; type?: unknown }): AuthLinkParams | null {
  const result = authLinkSchema.safeParse({ token_hash: input.token_hash, type: input.type });
  if (!result.success) return null;
  return { tokenHash: result.data.token_hash, type: result.data.type };
}

export function passwordModeFor(type: AuthLinkType): PasswordMode {
  return type === "invite" ? "convite" : "recuperacao";
}

/** Modo vindo da URL de /definir-senha; sem valor válido, usa o texto neutro de recuperação. */
export function parsePasswordMode(value: unknown): PasswordMode {
  return value === "convite" ? "convite" : "recuperacao";
}
