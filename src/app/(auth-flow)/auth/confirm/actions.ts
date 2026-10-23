"use server";

import { redirect } from "next/navigation";

import { parseAuthLink, passwordModeFor } from "@/lib/auth-link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { classifyAuthError } from "@/server/auth-errors";
import { getRequestLogger } from "@/server/request-context";

export interface ConfirmState {
  /** invalid: link inválido, usado ou vencido (4.6). retry: falha passageira; o botão continua. */
  status: "idle" | "invalid" | "retry";
}

/**
 * Troca o token_hash do link do e-mail por uma sessão (plano, seção 6; 03-ui-ux.md, 2.5.1).
 *
 * É chamada pelo CLIQUE no botão da tela intermediária, nunca na abertura da página: assim,
 * verificadores de link de e-mail que abrem a URL antes da pessoa não consomem o token de
 * uso único. O destino é fixo (/definir-senha) e o modo (convite ou recuperação) vem do
 * tipo do link; não existe parâmetro de redirecionamento aberto aqui.
 */
export async function confirmAuthLink(_previous: ConfirmState, formData: FormData): Promise<ConfirmState> {
  const logger = await getRequestLogger();

  const link = parseAuthLink({ token_hash: formData.get("token_hash"), type: formData.get("type") });
  if (!link) {
    logger.warn("auth.confirm_rejected", { reason: "formato" });
    return { status: "invalid" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type });

  if (error) {
    const failure = classifyAuthError(error);
    logger.warn("auth.confirm_failed", { type: link.type, failure, status: error.status, code: error.code });
    // Falha passageira (rede ou limite) não gasta o token: a pessoa pode tentar de novo.
    if (failure === "network" || failure === "rate-limit") return { status: "retry" };
    return { status: "invalid" };
  }

  logger.info("auth.confirm_succeeded", { type: link.type });
  redirect(`/definir-senha?modo=${passwordModeFor(link.type)}`);
}
