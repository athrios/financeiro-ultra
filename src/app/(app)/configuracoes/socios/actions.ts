"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  readPartnerSaveForm,
  readPartnerSetActiveForm,
  summarizeValidation,
} from "@/domain/cadastros/partner-form";
import { partnerDetailHref } from "@/domain/cadastros/partner-view";
import { partnerSaveSchema, partnerSetActiveSchema } from "@/domain/cadastros/schemas";
import { AppError, type ActionError } from "@/lib/errors";
import { toActionFailure } from "@/server/cadastros/action-support";
import { authorizeAdmin } from "@/server/cadastros/authorize";
import {
  getPartnerDetail,
  listPartnerBlockingClients,
  savePartner,
  setPartnerActive,
  type PartnerBlockingClient,
  type PartnerReceiverRef,
} from "@/server/partners/partners";

/**
 * Server Actions de sócio (CAD-001, E5a). Cada uma:
 *  1. autentica e autoriza DENTRO da ação (perfil ativo + Administrador; nega por padrão);
 *  2. valida a entrada com os esquemas `zod` (o `FormData` não é confiável);
 *  3. chama a camada `src/server/partners` (funções do banco; nenhuma escrita direta em tabela);
 *  4. devolve estado serializável (`ActionError` sem `cause`), nunca exceção para erro esperado;
 *  5. em sucesso, revalida e só então redireciona (`redirect` lança: nada roda depois dele).
 */

const LIST_PATH = "/configuracoes/socios";
const LOGIN_EXPIRED_PATH = "/login?aviso=sessao-expirada";

/** Campos que o formulário de sócio mostra; erro em outro campo vira mensagem geral. */
const PARTNER_FORM_FIELDS = ["name", "aliases"] as const;
export type PartnerFormField = (typeof PARTNER_FORM_FIELDS)[number];

export type PartnerFormState =
  | { status: "idle" }
  | {
      status: "error";
      error: ActionError;
      /** Mensagem por campo (abaixo do campo e no resumo do topo). */
      fieldErrors: Partial<Record<PartnerFormField, string>>;
      /** Erro inesperado: o código que está no log do servidor. */
      supportCode: string | null;
    };

export type PartnerActiveState =
  | { status: "idle" }
  | {
      status: "error";
      error: ActionError;
      supportCode: string | null;
      /** `PARTNER_HAS_CLIENTS`: a lista ATUAL de clientes (com "Único sócio"); o diálogo vira o bloqueio. */
      clients?: PartnerBlockingClient[];
      /** `RECEIVERS_CHANGED`: a lista ATUAL de recebedores ativos; o diálogo pede a confirmação de novo. */
      receivers?: PartnerReceiverRef[];
    };

function formError(
  error: ActionError,
  fieldErrors: Partial<Record<PartnerFormField, string>> = {},
  supportCode: string | null = null,
): PartnerFormState {
  return { status: "error", error, fieldErrors, supportCode };
}

function isFormField(value: string | undefined): value is PartnerFormField {
  return value !== undefined && (PARTNER_FORM_FIELDS as readonly string[]).includes(value);
}

/** Cria (sem `id`) ou edita (com `id` e a versão lida) o sócio: nome e apelidos num só envio. */
export async function savePartnerAction(_previous: PartnerFormState, formData: FormData): Promise<PartnerFormState> {
  const access = await authorizeAdmin();
  if (access.kind === "unauthenticated") redirect(LOGIN_EXPIRED_PATH);
  if (access.kind === "forbidden") return formError(access.error);

  const parsed = partnerSaveSchema.safeParse(readPartnerSaveForm(formData));
  if (!parsed.success) {
    const { fieldErrors, formMessage } = summarizeValidation(parsed.error, PARTNER_FORM_FIELDS);
    const message = formMessage ?? Object.values(fieldErrors)[0] ?? "Confira os campos e tente novamente.";
    return formError({ code: "VALIDATION", message }, fieldErrors);
  }

  let savedId: string;
  try {
    const saved = await savePartner(access.ctx, parsed.data);
    savedId = saved.id;
  } catch (error) {
    const failure = await toActionFailure(error, "partner.save", access.ctx.correlationId, { subject: "partner" });
    const fieldErrors: Partial<Record<PartnerFormField, string>> = {};
    if (isFormField(failure.error.field)) fieldErrors[failure.error.field] = failure.error.message;
    return formError(failure.error, fieldErrors, failure.supportCode);
  }

  revalidatePath(LIST_PATH);
  revalidatePath(partnerDetailHref(savedId));
  redirect(partnerDetailHref(savedId, { key: parsed.data.id === null ? "criado" : "salvo" }));
}

/**
 * Inativa ou reativa o sócio. Na inativação, `confirmedReceiverIds` é a lista que o diálogo mostrou:
 * o banco a compara com a atual (`RECEIVERS_CHANGED` se mudou) e inativa os recebedores junto.
 */
export async function setPartnerActiveAction(
  _previous: PartnerActiveState,
  formData: FormData,
): Promise<PartnerActiveState> {
  const access = await authorizeAdmin();
  if (access.kind === "unauthenticated") redirect(LOGIN_EXPIRED_PATH);
  if (access.kind === "forbidden") return { status: "error", error: access.error, supportCode: null };

  const parsed = partnerSetActiveSchema.safeParse(readPartnerSetActiveForm(formData));
  if (!parsed.success) {
    const { fieldErrors, formMessage } = summarizeValidation(parsed.error, []);
    return {
      status: "error",
      error: { code: "VALIDATION", message: formMessage ?? Object.values(fieldErrors)[0] ?? "Atualize a página e tente novamente." },
      supportCode: null,
    };
  }
  const input = parsed.data;
  const operation = input.active ? "activate" : "deactivate";

  let alreadyInState = false;
  let partnerName: string | undefined;
  try {
    const current = await getPartnerDetail(access.ctx.supabase, input.id);
    if (!current) throw new AppError("NOT_FOUND", { message: "Este cadastro não está mais disponível." });
    partnerName = current.name;
    // Outra pessoa já fez a ação (UI 8.3): não mexe em nada, só atualiza a tela com o aviso.
    alreadyInState = current.active === input.active;
    if (!alreadyInState) {
      await setPartnerActive(access.ctx, input, { partnerName: current.name });
    }
  } catch (error) {
    const failure = await toActionFailure(error, `partner.${operation}`, access.ctx.correlationId, {
      subject: "partner",
      subjectName: partnerName,
      operation,
    });
    const state: PartnerActiveState = {
      status: "error",
      error: failure.error,
      supportCode: failure.supportCode,
    };
    if (failure.error.hint === "PARTNER_HAS_CLIENTS") {
      // A tela vira o bloqueio com a lista nova, já com "Único sócio" (a do erro não traz a marca).
      try {
        state.clients = await listPartnerBlockingClients(access.ctx.supabase, input.id);
      } catch {
        const fromError = failure.error.details?.hint === "PARTNER_HAS_CLIENTS" ? failure.error.details.clients : [];
        state.clients = fromError.map((client) => ({ ...client, onlyPartner: false }));
      }
    }
    if (failure.error.details?.hint === "RECEIVERS_CHANGED") {
      state.receivers = failure.error.details.receivers.map((receiver) => ({ id: receiver.id, holderName: receiver.name }));
    }
    return state;
  }

  revalidatePath(LIST_PATH);
  revalidatePath(partnerDetailHref(input.id));
  if (alreadyInState) {
    redirect(partnerDetailHref(input.id, { key: input.active ? "ja-ativo" : "ja-inativo" }));
  }
  redirect(
    input.active
      ? partnerDetailHref(input.id, { key: "reativado" })
      : partnerDetailHref(input.id, { key: "inativado", count: input.confirmedReceiverIds.length }),
  );
}
