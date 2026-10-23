/**
 * Classifica erros do Supabase Auth em categorias que a interface sabe tratar. Puro: não
 * depende do SDK, só de campos conhecidos do erro (`status`, `code`, `name`).
 *
 * A mensagem original do Auth nunca é mostrada ao usuário (pode revelar se a conta existe).
 */

export interface AuthErrorLike {
  status?: number | null;
  code?: string | null;
  name?: string | null;
}

export type AuthFailure =
  | "rate-limit"
  | "network"
  | "invalid-credentials"
  | "link-invalid"
  | "weak-password"
  | "same-password"
  | "session-missing"
  | "unexpected";

const RATE_LIMIT_CODES = new Set(["over_request_rate_limit", "over_email_send_rate_limit", "over_sms_send_rate_limit"]);
const LINK_INVALID_CODES = new Set(["otp_expired", "otp_disabled", "flow_state_expired", "flow_state_not_found"]);
const SESSION_MISSING_CODES = new Set([
  "session_not_found",
  "session_expired",
  "refresh_token_not_found",
  "refresh_token_already_used",
  "bad_jwt",
  "no_authorization",
]);

/**
 * Limites de envio de e-mail do Auth. O GoTrue devolve over_email_send_rate_limit quando a conta
 * EXISTE e já recebeu um e-mail dentro de max_frequency (por usuário); para e-mail inexistente a
 * resposta é sempre 200. Mostrar esse limite na recuperação de senha revelaria que a conta existe
 * (SEG-E45-02), então o fluxo trata como envio normal (e só registra em log).
 */
export function isEmailSendRateLimit(error: AuthErrorLike | null | undefined): boolean {
  return error?.code === "over_email_send_rate_limit";
}

export function classifyAuthError(error: AuthErrorLike | null | undefined): AuthFailure {
  if (!error) return "unexpected";
  const code = error.code ?? "";
  const status = error.status ?? null;
  const name = error.name ?? "";

  if (RATE_LIMIT_CODES.has(code) || status === 429) return "rate-limit";
  if (name === "AuthSessionMissingError" || SESSION_MISSING_CODES.has(code)) return "session-missing";
  if (name === "AuthRetryableFetchError" || status === 0 || (status !== null && status >= 500)) return "network";
  if (code === "weak_password" || name === "AuthWeakPasswordError") return "weak-password";
  if (code === "same_password") return "same-password";
  if (LINK_INVALID_CODES.has(code)) return "link-invalid";
  if (code === "invalid_credentials" || status === 400) return "invalid-credentials";
  return "unexpected";
}
