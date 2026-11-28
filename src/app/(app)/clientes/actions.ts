"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { clientDetailHref, CLIENTS_HREF } from "@/domain/cadastros/client-view";
import {
  CLIENT_FORM_FIELDS,
  isClientFormField,
  readClientSaveForm,
  readClientSetActiveForm,
  type ClientFormField,
} from "@/domain/cadastros/client-form";
import { summarizeValidation } from "@/domain/cadastros/partner-form";
import { buildClientSaveSchema, clientSetActiveSchema } from "@/domain/cadastros/schemas";
import { AppError, type ActionError } from "@/lib/errors";
import { toActionFailure } from "@/server/cadastros/action-support";
import { authorizeAdmin } from "@/server/cadastros/authorize";
import { getClientActiveState, saveClient, setClientActive } from "@/server/clients/clients";

/**
 * Server Action de cliente (CAD-001, E6b): criar e editar com um só envio (dados, documento,
 * mensalidade, sócios e apelidos como estado final). Como as de sócio e recebedor:
 *  1. autentica e autoriza DENTRO da ação (perfil ativo + Administrador; nega por padrão);
 *  2. valida a entrada com `zod` (o `FormData` não é confiável);
 *  3. chama `src/server/clients` (`save_client`; nenhuma escrita direta em tabela);
 *  4. devolve estado serializável (`ActionError` sem `cause`), nunca exceção para erro esperado;
 *  5. em sucesso, revalida e só então redireciona (`redirect` lança: nada roda depois dele).
 */

const LOGIN_EXPIRED_PATH = "/login?aviso=sessao-expirada";

export type ClientFormState =
  | { status: "idle" }
  | {
      status: "error";
      /**
       * `POSSIBLE_DUPLICATE`: `details.matches` é a lista do aviso de nome parecido (nada foi gravado;
       * a tela reenvia com `acknowledgedDuplicateIds`). `DOCUMENT_TAKEN` e `ALIAS_TAKEN`:
       * `details.owner` é o cliente dono, para o link "Abrir cliente".
       */
      error: ActionError;
      /** Mensagem por campo (abaixo do campo e no resumo do topo). */
      fieldErrors: Partial<Record<ClientFormField, string>>;
      /** Erro inesperado: o código que está no log do servidor. */
      supportCode: string | null;
    };

function formError(
  error: ActionError,
  fieldErrors: Partial<Record<ClientFormField, string>> = {},
  supportCode: string | null = null,
): ClientFormState {
  return { status: "error", error, fieldErrors, supportCode };
}

const NOT_AVAILABLE: ActionError = { code: "NOT_FOUND", message: "Este cadastro não está mais disponível." };

const UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cria (sem `id`) ou edita (com `id` e a versão lida) o cliente, tudo num só envio. */
export async function saveClientAction(_previous: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const access = await authorizeAdmin();
  if (access.kind === "unauthenticated") redirect(LOGIN_EXPIRED_PATH);
  if (access.kind === "forbidden") return formError(access.error);

  const raw = readClientSaveForm(formData);

  // Só o cliente INATIVO pode ficar sem sócio (R-C10). A situação vem do banco, nunca do formulário.
  let allowEmptyPartners = false;
  if (raw.id !== null && UUID_TEXT.test(raw.id)) {
    try {
      const current = await getClientActiveState(access.ctx.supabase, raw.id);
      if (!current) return formError(NOT_AVAILABLE);
      allowEmptyPartners = !current.active;
    } catch (error) {
      const failure = await toActionFailure(error, "client.save", access.ctx.correlationId, { subject: "client" });
      return formError(failure.error, {}, failure.supportCode);
    }
  }

  const parsed = buildClientSaveSchema({ allowEmptyPartners }).safeParse(raw);
  if (!parsed.success) {
    const { fieldErrors, formMessage } = summarizeValidation(parsed.error, CLIENT_FORM_FIELDS);
    const message = formMessage ?? Object.values(fieldErrors)[0] ?? "Confira os campos e tente novamente.";
    return formError({ code: "VALIDATION", message }, fieldErrors);
  }

  const isNew = parsed.data.id === null;
  let savedId: string;
  try {
    const saved = await saveClient(access.ctx, parsed.data);
    savedId = saved.id;
  } catch (error) {
    const failure = await toActionFailure(error, "client.save", access.ctx.correlationId, {
      subject: "client",
      documentLabel: parsed.data.documentType ?? undefined,
    });
    const fieldErrors: Partial<Record<ClientFormField, string>> = {};
    // `POSSIBLE_DUPLICATE` não é erro de campo: é um aviso que a tela mostra à parte.
    if (isClientFormField(failure.error.field)) fieldErrors[failure.error.field] = failure.error.message;
    return formError(failure.error, fieldErrors, failure.supportCode);
  }

  revalidatePath(CLIENTS_HREF);
  revalidatePath(clientDetailHref(savedId));
  redirect(clientDetailHref(savedId, isNew ? "criado" : "salvo"));
}

export type ClientActiveState =
  | { status: "idle" }
  | {
      status: "error";
      /** `hint: "CLIENT_WITHOUT_PARTNER"` (reativação): o diálogo vira o bloqueio com "Editar cliente". */
      error: ActionError;
      supportCode: string | null;
    };

/**
 * Inativa ou reativa o cliente (UI 6.3 e 6.4). Reativar exige sócio ativo (RAT-D025): o banco
 * recusa com `CLIENT_WITHOUT_PARTNER` e a tela mostra o bloqueio. Se o cliente já está na situação
 * pedida (outra pessoa fez antes, UI 8.3), não escreve: só atualiza a tela com o aviso.
 * O motivo é opcional (RAT-D021).
 */
export async function setClientActiveAction(_previous: ClientActiveState, formData: FormData): Promise<ClientActiveState> {
  const access = await authorizeAdmin();
  if (access.kind === "unauthenticated") redirect(LOGIN_EXPIRED_PATH);
  if (access.kind === "forbidden") return { status: "error", error: access.error, supportCode: null };

  const parsed = clientSetActiveSchema.safeParse(readClientSetActiveForm(formData));
  if (!parsed.success) {
    const { fieldErrors, formMessage } = summarizeValidation(parsed.error, []);
    return {
      status: "error",
      error: {
        code: "VALIDATION",
        message: formMessage ?? Object.values(fieldErrors)[0] ?? "Atualize a página e tente novamente.",
      },
      supportCode: null,
    };
  }
  const input = parsed.data;
  const operation = input.active ? "activate" : "deactivate";

  let alreadyInState = false;
  try {
    // A situação vem do banco, nunca do formulário.
    const current = await getClientActiveState(access.ctx.supabase, input.id);
    if (!current) throw new AppError("NOT_FOUND", { message: NOT_AVAILABLE.message });
    alreadyInState = current.active === input.active;
    if (!alreadyInState) await setClientActive(access.ctx, input);
  } catch (error) {
    const failure = await toActionFailure(error, `client.${operation}`, access.ctx.correlationId, {
      subject: "client",
      operation,
    });
    return { status: "error", error: failure.error, supportCode: failure.supportCode };
  }

  revalidatePath(CLIENTS_HREF);
  revalidatePath(clientDetailHref(input.id));
  if (alreadyInState) redirect(clientDetailHref(input.id, input.active ? "ja-ativo" : "ja-inativo"));
  redirect(clientDetailHref(input.id, input.active ? "reativado" : "inativado"));
}
