"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { partnerDetailHref } from "@/domain/cadastros/partner-view";
import {
  readReceiverSaveForm,
  readReceiverSetActiveForm,
  receiverFieldOfError,
  summarizeReceiverValidation,
  type ReceiverFieldErrors,
} from "@/domain/cadastros/receiver-form";
import { receiverHref } from "@/domain/cadastros/receiver-view";
import { receiverSaveSchema, receiverSetActiveSchema } from "@/domain/cadastros/schemas";
import { AppError, type ActionError } from "@/lib/errors";
import { toActionFailure } from "@/server/cadastros/action-support";
import { authorizeAdmin } from "@/server/cadastros/authorize";
import { getReceiverDetail, saveReceiver, setReceiverActive } from "@/server/receivers/receivers";

/**
 * Server Actions de recebedor (CAD-001, E5b), no mesmo padrão das de sócio. Cada uma:
 *  1. autentica e autoriza DENTRO da ação (perfil ativo + Administrador; nega por padrão);
 *  2. valida a entrada com os esquemas `zod` (o `FormData` não é confiável);
 *  3. chama a camada `src/server/receivers` (funções do banco; nenhuma escrita direta em tabela);
 *  4. devolve estado serializável (`ActionError` sem `cause`), nunca exceção para erro esperado;
 *  5. em sucesso, revalida e só então redireciona ao detalhe do sócio (`redirect` lança).
 *
 * O sócio dono de um recebedor existente vem do BANCO, nunca do formulário: o destino do
 * redirecionamento e a conferência de "não muda de sócio" não dependem de campo enviado pelo navegador.
 */

const LIST_PATH = "/configuracoes/socios";
const LOGIN_EXPIRED_PATH = "/login?aviso=sessao-expirada";

export type ReceiverFormState =
  | { status: "idle" }
  | {
      status: "error";
      error: ActionError;
      /** Mensagem por campo ou lista (abaixo do campo e no resumo do topo). */
      fieldErrors: ReceiverFieldErrors;
      /** Erro inesperado: o código que está no log do servidor. */
      supportCode: string | null;
    };

export type ReceiverActiveState =
  | { status: "idle" }
  | { status: "error"; error: ActionError; supportCode: string | null };

function formError(
  error: ActionError,
  fieldErrors: ReceiverFieldErrors = {},
  supportCode: string | null = null,
): ReceiverFormState {
  return { status: "error", error, fieldErrors, supportCode };
}

/** Cria (sem `id`, com `partnerId`) ou edita (com `id` e a versão lida) o recebedor: titular e listas num só envio. */
export async function saveReceiverAction(
  _previous: ReceiverFormState,
  formData: FormData,
): Promise<ReceiverFormState> {
  const access = await authorizeAdmin();
  if (access.kind === "unauthenticated") redirect(LOGIN_EXPIRED_PATH);
  if (access.kind === "forbidden") return formError(access.error);

  const raw = readReceiverSaveForm(formData);
  const parsed = receiverSaveSchema.safeParse(raw);
  if (!parsed.success) {
    const { fieldErrors, formMessage } = summarizeReceiverValidation(parsed.error, raw.identifiers);
    const message = formMessage ?? Object.values(fieldErrors)[0] ?? "Confira os campos e tente novamente.";
    return formError({ code: "VALIDATION", message }, fieldErrors);
  }

  let saved: { id: string; partnerId: string };
  try {
    saved = await saveReceiver(access.ctx, parsed.data);
  } catch (error) {
    const failure = await toActionFailure(error, "receiver.save", access.ctx.correlationId, { subject: "receiver" });
    const fieldErrors: ReceiverFieldErrors = {};
    const field = receiverFieldOfError(failure.error);
    if (field) fieldErrors[field] = failure.error.message;
    return formError(failure.error, fieldErrors, failure.supportCode);
  }

  revalidatePath(LIST_PATH);
  revalidatePath(partnerDetailHref(saved.partnerId));
  revalidatePath(receiverHref(saved.partnerId, saved.id));
  redirect(partnerDetailHref(saved.partnerId, { key: parsed.data.id === null ? "recebedor-criado" : "recebedor-salvo" }));
}

/** Inativa ou reativa o recebedor (reativar exige o sócio ativo: o banco confere). */
export async function setReceiverActiveAction(
  _previous: ReceiverActiveState,
  formData: FormData,
): Promise<ReceiverActiveState> {
  const access = await authorizeAdmin();
  if (access.kind === "unauthenticated") redirect(LOGIN_EXPIRED_PATH);
  if (access.kind === "forbidden") return { status: "error", error: access.error, supportCode: null };

  const parsed = receiverSetActiveSchema.safeParse(readReceiverSetActiveForm(formData));
  if (!parsed.success) {
    return {
      status: "error",
      error: { code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Atualize a página e tente novamente." },
      supportCode: null,
    };
  }
  const input = parsed.data;
  const operation = input.active ? "activate" : "deactivate";

  let partnerId: string;
  let alreadyInState = false;
  let holderName: string | undefined;
  try {
    const current = await getReceiverDetail(access.ctx.supabase, input.id);
    if (!current) throw new AppError("NOT_FOUND", { message: "Este cadastro não está mais disponível." });
    partnerId = current.partnerId;
    holderName = current.holderName;
    // Outra pessoa já fez a ação (UI 8.3): não mexe em nada, só atualiza a tela com o aviso.
    alreadyInState = current.active === input.active;
    if (!alreadyInState) await setReceiverActive(access.ctx, input);
  } catch (error) {
    const failure = await toActionFailure(error, `receiver.${operation}`, access.ctx.correlationId, {
      subject: "receiver",
      subjectName: holderName,
      operation,
    });
    return { status: "error", error: failure.error, supportCode: failure.supportCode };
  }

  revalidatePath(LIST_PATH);
  revalidatePath(partnerDetailHref(partnerId));
  revalidatePath(receiverHref(partnerId, input.id));
  if (alreadyInState) {
    redirect(partnerDetailHref(partnerId, { key: input.active ? "recebedor-ja-ativo" : "recebedor-ja-inativo" }));
  }
  redirect(partnerDetailHref(partnerId, { key: input.active ? "recebedor-reativado" : "recebedor-inativado" }));
}
