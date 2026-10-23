"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { safeInternalPath } from "@/lib/safe-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { classifyAuthError } from "@/server/auth-errors";
import { getRequestLogger } from "@/server/request-context";

export interface LoginState {
  /** Mensagem exibida acima do formulário. */
  message: string | null;
  tone: "danger" | "warning";
  /** Campo a marcar com aria-invalid. */
  field: "email" | "password" | null;
  /** O e-mail digitado permanece preenchido; a senha nunca volta. */
  email: string;
}

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

const MESSAGES = {
  invalidInput: "Informe um e-mail válido e a senha.",
  invalidCredentials: "E-mail ou senha inválidos.",
  rateLimit: "Muitas tentativas de entrada. Aguarde alguns minutos e tente novamente.",
  network: "Não foi possível entrar agora. Tente novamente em instantes.",
} as const;

/**
 * Login com e-mail e senha (03-ui-ux.md, 2.4).
 *
 * Regra única de acesso (J1): credenciais válidas mantêm a sessão MESMO sem perfil ativo; a
 * tela "Sem acesso ativo" aparece depois do redirecionamento. A mensagem de falha é a mesma
 * para e-mail inexistente e senha errada (sem enumeração de usuários).
 */
export async function signIn(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const logger = await getRequestLogger();

  const parsed = credentialsSchema.safeParse({ email, password });
  if (!parsed.success) {
    const emailInvalid = !z.email().safeParse(email).success;
    return {
      message: MESSAGES.invalidInput,
      tone: "danger",
      field: emailInvalid ? "email" : "password",
      email,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    const failure = classifyAuthError(error);
    logger.warn("auth.login_failed", { failure, status: error.status, code: error.code });
    if (failure === "rate-limit") return { message: MESSAGES.rateLimit, tone: "warning", field: null, email };
    if (failure === "network") return { message: MESSAGES.network, tone: "danger", field: null, email };
    return { message: MESSAGES.invalidCredentials, tone: "danger", field: null, email };
  }

  logger.info("auth.login_succeeded");

  // O destino pretendido vem do formulário e é revalidado aqui (somente caminho interno).
  redirect(safeInternalPath(formData.get("next")));
}
