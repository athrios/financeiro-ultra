"use server";

import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { classifyAuthError, isEmailSendRateLimit } from "@/server/auth-errors";
import { getRequestLogger } from "@/server/request-context";

export interface RecoveryState {
  status: "idle" | "sent" | "error";
  /** Preenchido nos estados "error" e "sent". */
  email: string;
  tone: "danger" | "warning";
  message: string | null;
  field: "email" | null;
  /** Muda a cada envio bem-sucedido; reinicia a contagem do reenvio. */
  sentCount: number;
}

const emailSchema = z.email();

const MESSAGES = {
  invalidEmail: "Informe um e-mail válido.",
  rateLimit: "Muitas solicitações. Aguarde alguns minutos e tente novamente.",
  network: "Não foi possível enviar agora. Tente novamente em instantes.",
} as const;

/**
 * Pedido de recuperação de senha (03-ui-ux.md, 2.6). A resposta é SEMPRE a mesma, exista ou
 * não a conta (sem enumeração de usuários): só limite de envios e falha de rede mudam o
 * resultado, e valem para qualquer e-mail (por isso over_email_send_rate_limit, que é por conta,
 * vira resposta de sucesso).
 */
export async function requestPasswordReset(previous: RecoveryState, formData: FormData): Promise<RecoveryState> {
  const email = String(formData.get("email") ?? "").trim();
  const logger = await getRequestLogger();

  // Depois de um envio, uma falha de reenvio mantém a confirmação na tela.
  const failureStatus = previous.status === "sent" ? "sent" : "error";

  if (!emailSchema.safeParse(email).success) {
    return { ...previous, status: failureStatus, email, tone: "danger", message: MESSAGES.invalidEmail, field: "email" };
  }

  const supabase = await createSupabaseServerClient();
  // O link do e-mail vem do template do Auth (aponta para /auth/confirm com token_hash).
  const { error } = await supabase.auth.resetPasswordForEmail(email);

  if (error) {
    const failure = classifyAuthError(error);
    logger.warn("auth.recovery_request_failed", { failure, status: error.status, code: error.code });
    // Limite de envio por conta: mesma resposta de sucesso (SEG-E45-02), senão a tela revelaria
    // que o e-mail existe. Só o limite que vale para qualquer e-mail mostra a mensagem de limite.
    if (!isEmailSendRateLimit(error) && failure === "rate-limit") {
      return { ...previous, status: failureStatus, email, tone: "warning", message: MESSAGES.rateLimit, field: null };
    }
    if (failure === "network") {
      return { ...previous, status: failureStatus, email, tone: "danger", message: MESSAGES.network, field: null };
    }
    // Qualquer outro erro do Auth não pode revelar se a conta existe: mesma resposta de sucesso.
  }

  logger.info("auth.recovery_requested");
  return { status: "sent", email, tone: "danger", message: null, field: null, sentCount: previous.sentCount + 1 };
}
