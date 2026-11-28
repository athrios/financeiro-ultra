import "server-only";

import type { ReceiverIdentifierInput, ReceiverSaveInput, ReceiverSetActiveInput, RowStatus } from "@/domain/cadastros/schemas";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import { isUuidText, nullable, optional, unwrap, unwrapMaybe, unwrapRows } from "@/server/cadastros/helpers";
import type { CadastroContext, WriteResult } from "@/server/cadastros/types";

// -----------------------------------------------------------------------------------------------
// Leitura (só o Administrador lê recebedores e identificadores; para os demais o RLS devolve vazio)
// -----------------------------------------------------------------------------------------------

export interface BankAccountValue {
  bankName: string;
  branch: string;
  accountNumber: string;
}

/** Identificador do recebedor como está gravado (valores como digitados, não os normalizados). */
export type ReceiverIdentifierItem =
  | { id: string; active: boolean; type: "NAME_VARIANT" | "PIX_KEY"; value: string }
  | ({ id: string; active: boolean; type: "BANK_ACCOUNT" } & BankAccountValue);

export interface ReceiverListItem {
  id: string;
  partnerId: string;
  holderName: string;
  active: boolean;
  updatedAt: string;
  /** Só identificadores ATIVOS (UI 5.3): variações, chaves Pix e contas. */
  nameVariantCount: number;
  pixKeys: string[];
  accounts: BankAccountValue[];
}

interface IdentifierRow {
  id: string;
  identifier_type: "NAME_VARIANT" | "PIX_KEY" | "BANK_ACCOUNT";
  value: string | null;
  bank_name: string | null;
  branch: string | null;
  account_number: string | null;
  active: boolean;
  created_at: string;
}

function toIdentifierItem(row: IdentifierRow): ReceiverIdentifierItem {
  if (row.identifier_type === "BANK_ACCOUNT") {
    return {
      id: row.id,
      active: row.active,
      type: "BANK_ACCOUNT",
      bankName: row.bank_name ?? "",
      branch: row.branch ?? "",
      accountNumber: row.account_number ?? "",
    };
  }
  return { id: row.id, active: row.active, type: row.identifier_type, value: row.value ?? "" };
}

function sortIdentifiers(rows: readonly IdentifierRow[]): ReceiverIdentifierItem[] {
  return [...rows]
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .map(toIdentifierItem);
}

/** Recebedores de um sócio (UI 5.3, cartão "Recebedores"), com filtro de situação. */
export async function listReceiversByPartner(
  supabase: AppSupabaseClient,
  partnerId: string,
  status: RowStatus = "ACTIVE",
): Promise<ReceiverListItem[]> {
  if (!isUuidText(partnerId)) return [];

  let query = supabase
    .from("receivers")
    .select(
      "id, partner_id, holder_name, active, updated_at, receiver_identifiers(id, identifier_type, value, bank_name, branch, account_number, active, created_at)",
    )
    .eq("partner_id", partnerId)
    .order("normalized_holder_name")
    .order("id");
  if (status === "ACTIVE") query = query.eq("active", true);
  if (status === "INACTIVE") query = query.eq("active", false);

  return unwrapRows(await query).map((receiver) => {
    const active = sortIdentifiers(receiver.receiver_identifiers).filter((item) => item.active);
    return {
      id: receiver.id,
      partnerId: receiver.partner_id,
      holderName: receiver.holder_name,
      active: receiver.active,
      updatedAt: receiver.updated_at,
      nameVariantCount: active.filter((item) => item.type === "NAME_VARIANT").length,
      pixKeys: active.flatMap((item) => (item.type === "PIX_KEY" ? [item.value] : [])),
      accounts: active.flatMap((item) =>
        item.type === "BANK_ACCOUNT"
          ? [{ bankName: item.bankName, branch: item.branch, accountNumber: item.accountNumber }]
          : [],
      ),
    };
  });
}

export interface ReceiverDetail {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerActive: boolean;
  holderName: string;
  active: boolean;
  createdAt: string;
  /** Token de concorrência: devolva-o tal como veio (texto, com microssegundos). */
  updatedAt: string;
  /** Todos os identificadores, ativos e inativos, na ordem de cadastro. */
  identifiers: ReceiverIdentifierItem[];
}

/** Detalhe do recebedor, ou `null` se não existir, não tiver formato de id ou o RLS o esconder. */
export async function getReceiverDetail(supabase: AppSupabaseClient, id: string): Promise<ReceiverDetail | null> {
  if (!isUuidText(id)) return null;
  const receiver = unwrapMaybe(
    await supabase
      .from("receivers")
      .select(
        "id, partner_id, holder_name, active, created_at, updated_at, partners(id, name, active), receiver_identifiers(id, identifier_type, value, bank_name, branch, account_number, active, created_at)",
      )
      .eq("id", id)
      .maybeSingle(),
  );
  if (!receiver || !receiver.partners) return null;

  return {
    id: receiver.id,
    partnerId: receiver.partner_id,
    partnerName: receiver.partners.name,
    partnerActive: receiver.partners.active,
    holderName: receiver.holder_name,
    active: receiver.active,
    createdAt: receiver.created_at,
    updatedAt: receiver.updated_at,
    identifiers: sortIdentifiers(receiver.receiver_identifiers),
  };
}

// -----------------------------------------------------------------------------------------------
// Escrita
// -----------------------------------------------------------------------------------------------

export interface ReceiverWriteResult extends WriteResult {
  partnerId: string;
  holderName: string;
}

type RpcIdentifier =
  | { type: "NAME_VARIANT" | "PIX_KEY"; value: string }
  | { type: "BANK_ACCOUNT"; bank_name: string; branch: string; account_number: string };

/** Formato JSON de `p_identifiers` (modelagem 6.4.3): chaves em snake_case, só as do tipo. */
export function toRpcIdentifiers(items: readonly ReceiverIdentifierInput[]): RpcIdentifier[] {
  return items.map((item) =>
    item.type === "BANK_ACCOUNT"
      ? { type: "BANK_ACCOUNT", bank_name: item.bankName, branch: item.branch, account_number: item.accountNumber }
      : { type: item.type, value: item.value },
  );
}

/**
 * Cria ou edita o recebedor (titular e identificadores como estado final) — `public.save_receiver`.
 * O sócio dono é obrigatório no novo e não muda depois (R-R02).
 */
export async function saveReceiver(ctx: CadastroContext, input: ReceiverSaveInput): Promise<ReceiverWriteResult> {
  const row = unwrap(
    await ctx.supabase.rpc("save_receiver", {
      p_receiver_id: nullable(input.id),
      p_partner_id: nullable(input.partnerId),
      p_holder_name: input.holderName,
      p_identifiers: toRpcIdentifiers(input.identifiers),
      p_expected_updated_at: nullable(input.expectedUpdatedAt),
      p_reason: optional(input.reason),
      p_correlation_id: optional(ctx.correlationId),
    }),
    { subject: "receiver", operation: "save" },
  );
  return { id: row.id, partnerId: row.partner_id, holderName: row.holder_name, active: row.active, updatedAt: row.updated_at };
}

/** Inativa ou reativa o recebedor — `public.set_receiver_active` (reativar exige sócio ativo). */
export async function setReceiverActive(
  ctx: CadastroContext,
  input: ReceiverSetActiveInput,
): Promise<ReceiverWriteResult> {
  const row = unwrap(
    await ctx.supabase.rpc("set_receiver_active", {
      p_receiver_id: input.id,
      p_active: input.active,
      p_expected_updated_at: input.expectedUpdatedAt,
      p_reason: optional(input.reason),
      p_correlation_id: optional(ctx.correlationId),
    }),
    { subject: "receiver", operation: input.active ? "activate" : "deactivate" },
  );
  return { id: row.id, partnerId: row.partner_id, holderName: row.holder_name, active: row.active, updatedAt: row.updated_at };
}
