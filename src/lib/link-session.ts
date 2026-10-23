/**
 * Sessão aberta por link de convite ou de recuperação (SEG-E45-01).
 *
 * /definir-senha não pede a senha atual: quem chega ali já provou o e-mail pelo link. Por isso só
 * uma sessão cujo claim `amr` registra um método de link/código de e-mail, com horário recente, pode
 * definir a senha. Uma sessão aberta por senha (computador destravado, cookie roubado) não pode.
 *
 * Verificado no Auth local (GoTrue do Supabase CLI 2.120): verifyOtp type=invite e type=recovery
 * gravam amr = [{ method: "otp", timestamp }]. Os nomes "invite" e "recovery" também são aceitos
 * porque outras versões do GoTrue os usam. A sessão por senha grava "password" e é recusada.
 *
 * Função pura: recebe os claims já verificados (getClaims) e o relógio.
 */

/** Métodos de `amr` que indicam sessão aberta por link/código de e-mail (convite ou recuperação). */
export const LINK_AMR_METHODS = ["otp", "invite", "recovery"] as const;

/** Janela em que o link ainda autoriza definir a senha. */
export const LINK_SESSION_MAX_AGE_SECONDS = 15 * 60;

/** Tolerância para relógios levemente fora de sincronia. */
const CLOCK_SKEW_SECONDS = 60;

export function isRecentLinkSession(
  claims: { amr?: unknown } | null | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  maxAgeSeconds: number = LINK_SESSION_MAX_AGE_SECONDS,
): boolean {
  const amr = claims?.amr;
  if (!Array.isArray(amr)) return false;
  return amr.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    if (typeof method !== "string" || !(LINK_AMR_METHODS as readonly string[]).includes(method)) return false;
    if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return false;
    const age = nowSeconds - timestamp;
    return age >= -CLOCK_SKEW_SECONDS && age <= maxAgeSeconds;
  });
}
