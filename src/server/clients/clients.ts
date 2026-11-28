import "server-only";

import type {
  AliasKind,
  ClientSaveInput,
  ClientSetActiveInput,
  SearchAliasesInput,
  SearchClientsInput,
} from "@/domain/cadastros/schemas";
import { formatDocument, type DocumentType } from "@/domain/documents/document";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import { fetchAllRows, isUuidText, nullable, optional, unwrap, unwrapMaybe, unwrapRows } from "@/server/cadastros/helpers";
import type { CadastroContext, WriteResult } from "@/server/cadastros/types";

// -----------------------------------------------------------------------------------------------
// Leitura (cliente da sessão: o RLS decide; Administrador, Operador e Visualizador leem clientes)
// -----------------------------------------------------------------------------------------------

function toDocumentType(value: string | null | undefined): DocumentType | null {
  return value === "CPF" || value === "CNPJ" ? value : null;
}

export interface ClientListItem {
  id: string;
  legalName: string;
  tradeName: string | null;
  /** Documento canônico (sem máscara); use `formatDocument` para exibir. */
  document: string | null;
  documentType: DocumentType | null;
  /** Mensalidade em TEXTO decimal ("1500.00"): nunca número (o JSON do PostgREST perderia os zeros). */
  monthlyValue: string;
  active: boolean;
  /** Indicações ativas: o `n` da divisão 1/n. */
  partnerCount: number;
  /** Token de concorrência, em texto. */
  updatedAt: string;
}

export interface ClientSearchPage {
  items: ClientListItem[];
  /**
   * Total que casa com a busca. `null` quando a página pedida está além do fim (o banco não devolve
   * linhas, e portanto nenhum total — D-IMPL-20): a tela pega o total da primeira página.
   */
  total: number | null;
  limit: number;
  offset: number;
}

/**
 * Lista de clientes com busca (nome, nome fantasia, documento com ou sem pontuação e apelido) e
 * paginação no servidor — `public.search_clients`, SECURITY INVOKER: o RLS de quem chama vale.
 */
export async function searchClients(supabase: AppSupabaseClient, input: SearchClientsInput): Promise<ClientSearchPage> {
  const rows = unwrapRows(
    await supabase.rpc("search_clients", {
      p_query: optional(input.query),
      p_status: input.status,
      p_limit: input.limit,
      p_offset: input.offset,
      p_partner_id: optional(input.partnerId),
    }),
  );
  const items = rows.map((row) => ({
    id: row.id,
    legalName: row.legal_name,
    tradeName: row.trade_name ?? null,
    document: row.document ?? null,
    documentType: toDocumentType(row.document_type),
    monthlyValue: row.default_monthly_value,
    active: row.active,
    partnerCount: row.partner_count,
    updatedAt: row.updated_at,
  }));
  const total = rows.length > 0 ? Number(rows[0].total_count) : input.offset === 0 ? 0 : null;
  return { items, total, limit: input.limit, offset: input.offset };
}

/** Quantos clientes entram em cada consulta de sócios (limita o tamanho da URL do PostgREST). */
const PARTNER_NAMES_CHUNK = 50;

/**
 * Nomes dos sócios com indicação ATIVA de cada cliente da página (a lista mostra até três, UI 3.2).
 * O mapa só tem os clientes que têm sócio; a ordem é a do nome (A a Z).
 */
export async function listActivePartnerNamesByClient(
  supabase: AppSupabaseClient,
  clientIds: readonly string[],
): Promise<Map<string, string[]>> {
  const names = new Map<string, string[]>();
  const ids = clientIds.filter(isUuidText);
  for (let start = 0; start < ids.length; start += PARTNER_NAMES_CHUNK) {
    const chunk = ids.slice(start, start + PARTNER_NAMES_CHUNK);
    const rows = await fetchAllRows((from, to) =>
      supabase
        .from("client_partners")
        .select("id, client_id, partners!inner(name, normalized_name)")
        .in("client_id", chunk)
        .eq("active", true)
        .order("id")
        .range(from, to),
    );
    const sorted = [...rows].sort(
      (a, b) => a.partners.normalized_name.localeCompare(b.partners.normalized_name) || a.id.localeCompare(b.id),
    );
    for (const row of sorted) {
      const list = names.get(row.client_id) ?? [];
      list.push(row.partners.name);
      names.set(row.client_id, list);
    }
  }
  return names;
}

export interface ClientPartnerItem {
  partnerId: string;
  name: string;
  partnerActive: boolean;
  /** Indicação vigente (retirar = inativa a linha; indicar de novo reativa a mesma). */
  indicationActive: boolean;
}

export interface ClientAliasItem {
  id: string;
  type: "NAME" | "DOCUMENT";
  /** Como foi digitado. */
  value: string;
  /** Para exibir: apelido de documento sai com máscara; o de nome, como digitado. */
  displayValue: string;
  active: boolean;
}

export interface ClientDetail {
  id: string;
  legalName: string;
  tradeName: string | null;
  document: string | null;
  documentType: DocumentType | null;
  /** Mensalidade em TEXTO decimal ("1500.00"). */
  monthlyValue: string;
  notes: string | null;
  active: boolean;
  createdAt: string;
  /** Token de concorrência: devolva-o tal como veio (texto, com microssegundos). */
  updatedAt: string;
  /** Todas as indicações (ativas e inativas), por nome do sócio. */
  partners: ClientPartnerItem[];
  /** `n` da divisão 1/n: as indicações ativas (cujos sócios estão ativos, I-02). */
  activePartnerCount: number;
  /** Apelidos. Operador e Visualizador só recebem os ativos (RLS, U-C16). */
  aliases: ClientAliasItem[];
}

/** Detalhe do cliente, ou `null` se não existir, não tiver formato de id ou o RLS o esconder. */
export async function getClientDetail(supabase: AppSupabaseClient, id: string): Promise<ClientDetail | null> {
  if (!isUuidText(id)) return null;
  // `default_monthly_value::text`: o PostgREST serializaria numeric como número JSON (float no JS).
  const client = unwrapMaybe(
    await supabase
      .from("clients")
      .select(
        "id, legal_name, trade_name, document, document_type, default_monthly_value::text, notes, active, created_at, updated_at, client_partners(id, partner_id, active, partners(id, name, active)), client_aliases(id, alias, alias_type, normalized_value, active, created_at)",
      )
      .eq("id", id)
      .maybeSingle(),
  );
  if (!client) return null;

  const partners = client.client_partners
    .flatMap((link) =>
      link.partners
        ? [{ partnerId: link.partner_id, name: link.partners.name, partnerActive: link.partners.active, indicationActive: link.active }]
        : [],
    )
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.partnerId.localeCompare(b.partnerId));

  const aliases = [...client.client_aliases]
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .map((alias) => ({
      id: alias.id,
      type: alias.alias_type,
      value: alias.alias,
      displayValue: alias.alias_type === "DOCUMENT" ? formatDocument(alias.normalized_value) : alias.alias,
      active: alias.active,
    }));

  return {
    id: client.id,
    legalName: client.legal_name,
    tradeName: client.trade_name,
    document: client.document,
    documentType: toDocumentType(client.document_type),
    monthlyValue: client.default_monthly_value,
    notes: client.notes,
    active: client.active,
    createdAt: client.created_at,
    updatedAt: client.updated_at,
    partners,
    activePartnerCount: partners.filter((partner) => partner.indicationActive).length,
    aliases,
  };
}

/**
 * Situação do cliente (ativo ou inativo), ou `null` se não existir, não tiver formato de id ou o RLS o
 * esconder. A ação de salvar a lê do banco (nunca do formulário) para decidir se o cliente pode ficar
 * sem sócio (R-C10: só o inativo).
 */
export async function getClientActiveState(supabase: AppSupabaseClient, id: string): Promise<{ active: boolean } | null> {
  if (!isUuidText(id)) return null;
  const row = unwrapMaybe(await supabase.from("clients").select("id, active").eq("id", id).maybeSingle());
  return row ? { active: row.active } : null;
}

export interface AliasSearchItem {
  kind: AliasKind;
  itemId: string;
  /** O texto como a tela mostra (conta bancária já vem como "banco / agência / conta"). */
  displayValue: string;
  active: boolean;
  ownerKind: "PARTNER" | "CLIENT" | "RECEIVER";
  ownerId: string;
  ownerName: string;
  ownerActive: boolean;
  partnerId: string | null;
  partnerName: string | null;
}

export interface AliasSearchPage {
  items: AliasSearchItem[];
  total: number | null;
  limit: number;
  offset: number;
}

const ALIAS_KIND_SET: ReadonlySet<string> = new Set(["PARTNER_ALIAS", "CLIENT_ALIAS", "NAME_VARIANT", "PIX_KEY", "BANK_ACCOUNT"]);
const OWNER_KIND_SET: ReadonlySet<string> = new Set(["PARTNER", "CLIENT", "RECEIVER"]);

/**
 * Lista consolidada de apelidos e identificadores — `public.search_aliases`. Só o Administrador
 * recebe linhas: para os demais papéis o banco devolve a lista vazia.
 */
export async function searchAliases(supabase: AppSupabaseClient, input: SearchAliasesInput): Promise<AliasSearchPage> {
  const rows = unwrapRows(
    await supabase.rpc("search_aliases", {
      p_query: optional(input.query),
      p_kind: optional(input.kind),
      p_status: input.status,
      p_limit: input.limit,
      p_offset: input.offset,
    }),
  );
  const items: AliasSearchItem[] = rows.flatMap((row) => {
    // Linha de um tipo que esta versão não conhece: ignorada, nunca exibida com tipo inventado.
    if (!ALIAS_KIND_SET.has(row.kind) || !OWNER_KIND_SET.has(row.owner_kind)) return [];
    return [
      {
        kind: row.kind as AliasKind,
        itemId: row.item_id,
        displayValue: row.display_value,
        active: row.active,
        ownerKind: row.owner_kind as AliasSearchItem["ownerKind"],
        ownerId: row.owner_id,
        ownerName: row.owner_name,
        ownerActive: row.owner_active,
        partnerId: row.partner_id ?? null,
        partnerName: row.partner_name ?? null,
      },
    ];
  });
  const total = rows.length > 0 ? Number(rows[0].total_count) : input.offset === 0 ? 0 : null;
  return { items, total, limit: input.limit, offset: input.offset };
}

// -----------------------------------------------------------------------------------------------
// Escrita
// -----------------------------------------------------------------------------------------------

export interface ClientWriteResult extends WriteResult {
  legalName: string;
}

/**
 * Cria ou edita o cliente (dados, documento, mensalidade, sócios e apelidos como estado final, tudo
 * ou nada) — `public.save_client`.
 *
 * - `monthlyValue` já é texto decimal ("1234.56"); o banco o converte sem float.
 * - `acknowledgedDuplicateIds` confirma o aviso de nome repetido (R-C15): sem a confirmação, o banco
 *   devolve `POSSIBLE_DUPLICATE` (AppError com `details.matches`) e não grava nada.
 * - A mensalidade devolvida pela função é número JSON e por isso NÃO é repassada: releia o detalhe
 *   (`getClientDetail`) se precisar dela.
 */
export async function saveClient(ctx: CadastroContext, input: ClientSaveInput): Promise<ClientWriteResult> {
  const row = unwrap(
    await ctx.supabase.rpc("save_client", {
      p_client_id: nullable(input.id),
      p_legal_name: input.legalName,
      p_trade_name: nullable(input.tradeName),
      p_document: nullable(input.document),
      p_default_monthly_value: input.monthlyValue,
      p_notes: nullable(input.notes),
      p_partner_ids: input.partnerIds,
      p_aliases: input.aliases,
      p_expected_updated_at: nullable(input.expectedUpdatedAt),
      p_acknowledged_duplicate_ids: input.acknowledgedDuplicateIds,
      p_reason: optional(input.reason),
      p_correlation_id: optional(ctx.correlationId),
    }),
    { subject: "client", operation: "save", documentLabel: input.documentType ?? undefined },
  );
  return { id: row.id, legalName: row.legal_name, active: row.active, updatedAt: row.updated_at };
}

/** Inativa ou reativa o cliente — `public.set_client_active` (reativar exige sócio ativo indicado). */
export async function setClientActive(ctx: CadastroContext, input: ClientSetActiveInput): Promise<ClientWriteResult> {
  const row = unwrap(
    await ctx.supabase.rpc("set_client_active", {
      p_client_id: input.id,
      p_active: input.active,
      p_expected_updated_at: input.expectedUpdatedAt,
      p_reason: optional(input.reason),
      p_correlation_id: optional(ctx.correlationId),
    }),
    { subject: "client", operation: input.active ? "activate" : "deactivate" },
  );
  return { id: row.id, legalName: row.legal_name, active: row.active, updatedAt: row.updated_at };
}
