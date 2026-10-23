"use server";

import { isRecentLinkSession } from "@/lib/link-session";
import { isPasswordValid } from "@/lib/password-policy";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { classifyAuthError } from "@/server/auth-errors";
import { getRequestLogger } from "@/server/request-context";

export interface SetPasswordState {
  status: "idle" | "error" | "done" | "expired";
  /** Mensagem por campo (exibida abaixo do campo). */
  passwordError: string | null;
  confirmError: string | null;
  /** Mensagem geral (topo do formulário). */
  message: string | null;
}

const MESSAGES = {
  rules: "A senha ainda não atende às regras.",
  mismatch: "As senhas não coincidem.",
  same: "Escolha uma senha diferente da atual.",
  weak: "Esta senha é fraca demais. Escolha uma senha mais longa ou menos previsível.",
  rateLimit: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  network: "Não foi possível salvar agora. Tente novamente em instantes.",
  unexpected: "Não foi possível salvar a senha. Tente novamente em instantes.",
} as const;

const idle: SetPasswordState = { status: "idle", passwordError: null, confirmError: null, message: null };

/**
 * Define (convite) ou redefine (recuperação) a senha da sessão criada por /auth/confirm.
 *
 * - Exige sessão aberta há pouco por convite ou recuperação (claim amr; SEG-E45-01). Sessão
 *   de login com senha não define senha por aqui: devolve "expired" (tela "Solicite um novo
 *   link", UX-11). Trocar a senha logado seria outra tela, com a senha atual.
 * - A regra de senha é a mesma exibida no formulário (lib/password-policy) e é revalidada
 *   aqui: o navegador não é confiável. O Auth aplica o seu próprio mínimo por cima.
 * - Nunca registra a senha em log.
 */
export async function setPassword(_previous: SetPasswordState, formData: FormData): Promise<SetPasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const logger = await getRequestLogger();

  const passwordOk = isPasswordValid(password);
  const matches = password === confirm;
  if (!passwordOk || !matches) {
    return {
      ...idle,
      status: "error",
      passwordError: passwordOk ? null : MESSAGES.rules,
      confirmError: matches ? null : MESSAGES.mismatch,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) {
    logger.warn("auth.set_password_without_session");
    return { ...idle, status: "expired" };
  }
  if (!isRecentLinkSession(claimsData?.claims)) {
    logger.warn("auth.set_password_without_link_session", { userId });
    return { ...idle, status: "expired" };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    const failure = classifyAuthError(error);
    logger.warn("auth.set_password_failed", { failure, status: error.status, code: error.code });
    switch (failure) {
      case "session-missing":
        return { ...idle, status: "expired" };
      case "same-password":
        return { ...idle, status: "error", passwordError: MESSAGES.same };
      case "weak-password":
        return { ...idle, status: "error", passwordError: MESSAGES.weak };
      case "rate-limit":
        return { ...idle, status: "error", message: MESSAGES.rateLimit };
      case "network":
        return { ...idle, status: "error", message: MESSAGES.network };
      default:
        return { ...idle, status: "error", message: MESSAGES.unexpected };
    }
  }

  // Encerra as outras sessões da conta (SEG-E45-01): quem tinha um acesso aberto perde-o. A sessão
  // atual, aberta pelo link, continua. Falha aqui não desfaz a senha já definida: só é registrada.
  const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
  if (signOutError) logger.warn("auth.sign_out_others_failed", { userId, status: signOutError.status, code: signOutError.code });

  logger.info("auth.password_set", { userId });
  return { ...idle, status: "done" };
}
