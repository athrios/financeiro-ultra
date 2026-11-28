import "server-only";

import type { PartnerSaveInput, PartnerSetActiveInput, RowStatus } from "@/domain/cadastros/schemas";
import { normalizeAlias } from "@/domain/cadastros/text";
import { mapDatabaseError } from "@/lib/errors";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import {
  fetchAllRows,
  isUuidText,
  nullable,
  optional,
  unwrap,
  unwrapMaybe,
  unwrapRows,
} from "@/server/cadastros/helpers";
import type { CadastroContext, TextItem, WriteResult } from "@/server/cadastros/types";

// -----------------------------------------------------------------------------------------------
// Leitura (cliente da sessão: o RLS decide quem vê o quê)
// -----------------------------------------------------------------------------------------------

export interface PartnerListItem {
  id: string;
  name: string;
  active: boolean;
  /** Token de concorrência, em texto. */
  updatedAt: string;
  /** Clientes (ativos e inativos) que indicam o sócio com indicação ativa. */
  activeClientCount: number;
  inactiveClientCount: number;
  activeReceiverCount: number;
  inactiveReceiverCount: number;
}

export interface ListPartnersOptions {
  status?: RowStatus;
  /** Busca por nome ou apelido (sem acento, maiúscula ou pontuação). */
  query?: string | null;
}

/**
 * Lista de Configurações > Sócios (só Administrador, UI 5.1). As contagens de clientes e de
 * recebedores são derivadas da leitura (a UI permite cortá-las, U-C10). Operador e Visualizador não
 * leem recebedores nem apelidos de sócio, então para eles essas contagens e a busca por apelido
 * ficam vazias: a tela é do Administrador.
 */
export async function listPartners(
  supabase: AppSupabaseClient,
  options: ListPartnersOptions = {},
): Promise<PartnerListItem[]> {
  const status = options.status ?? "ACTIVE";

  let partnersQuery = supabase
    .from("partners")
    .select("id, name, active, updated_at, partner_aliases(alias, active)")
    .order("normalized_name")
    .order("id");
  if (status === "ACTIVE") partnersQuery = partnersQuery.eq("active", true);
  if (status === "INACTIVE") partnersQuery = partnersQuery.eq("active", false);
  const partners = unwrapRows(await partnersQuery);

  const [indications, receivers] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase
        .from("client_partners")
        .select("id, partner_id, clients!inner(active)")
        .eq("active", true)
        .order("id")
        .range(from, to),
    ),
    fetchAllRows((from, to) => supabase.from("receivers").select("id, partner_id, active").order("id").range(from, to)),
  ]);

  type Counts = Pick<
    PartnerListItem,
    "activeClientCount" | "inactiveClientCount" | "activeReceiverCount" | "inactiveReceiverCount"
  >;
  const counts = new Map<string, Counts>();
  const countsOf = (partnerId: string): Counts => {
    let entry = counts.get(partnerId);
    if (!entry) {
      entry = { activeClientCount: 0, inactiveClientCount: 0, activeReceiverCount: 0, inactiveReceiverCount: 0 };
      counts.set(partnerId, entry);
    }
    return entry;
  };
  for (const row of indications) {
    countsOf(row.partner_id)[row.clients.active ? "activeClientCount" : "inactiveClientCount"] += 1;
  }
  for (const row of receivers) {
    countsOf(row.partner_id)[row.active ? "activeReceiverCount" : "inactiveReceiverCount"] += 1;
  }

  const needle = normalizeAlias(options.query);
  return partners
    .filter((partner) => {
      if (!needle) return true;
      if (normalizeAlias(partner.name).includes(needle)) return true;
      return partner.partner_aliases.some((alias) => alias.active && normalizeAlias(alias.alias).includes(needle));
    })
    .map((partner) => ({
      id: partner.id,
      name: partner.name,
      active: partner.active,
      updatedAt: partner.updated_at,
      ...countsOf(partner.id),
    }));
}

export interface PartnerOption {
  id: string;
  name: string;
}

/** Sócios ATIVOS em ordem alfabética: as opções do seletor "Sócios do cliente" (UI 4.1.4). */
export async function listActivePartnerOptions(supabase: AppSupabaseClient): Promise<PartnerOption[]> {
  const rows = unwrapRows(
    await supabase.from("partners").select("id, name").eq("active", true).order("normalized_name").order("id"),
  );
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

export interface PartnerFilterOption extends PartnerOption {
  active: boolean;
}

/**
 * Todos os sócios (ativos e inativos), em ordem alfabética: as opções do filtro "Sócio" da lista de
 * clientes (UI 3.1, "(inativo)" ao lado do nome). Administrador, Operador e Visualizador leem sócios.
 */
export async function listPartnerFilterOptions(supabase: AppSupabaseClient): Promise<PartnerFilterOption[]> {
  const rows = unwrapRows(
    await supabase.from("partners").select("id, name, active").order("normalized_name").order("id"),
  );
  return rows.map((row) => ({ id: row.id, name: row.name, active: row.active }));
}

export interface PartnerDetail {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  /** Token de concorrência: devolva-o tal como veio (texto, com microssegundos). */
  updatedAt: string;
  /** Todos os apelidos (ativos e inativos). Só o Administrador os lê: para os demais papéis vem vazio. */
  aliases: TextItem[];
}

/** Detalhe do sócio, ou `null` se não existir, não tiver formato de id ou o RLS o esconder. */
export async function getPartnerDetail(supabase: AppSupabaseClient, id: string): Promise<PartnerDetail | null> {
  if (!isUuidText(id)) return null;
  const partner = unwrapMaybe(
    await supabase
      .from("partners")
      .select("id, name, active, created_at, updated_at, partner_aliases(id, alias, active, created_at)")
      .eq("id", id)
      .maybeSingle(),
  );
  if (!partner) return null;

  const aliases = [...partner.partner_aliases]
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .map((alias) => ({ id: alias.id, value: alias.alias, active: alias.active }));

  return {
    id: partner.id,
    name: partner.name,
    active: partner.active,
    createdAt: partner.created_at,
    updatedAt: partner.updated_at,
    aliases,
  };
}

export interface PartnerClientRef {
  id: string;
  name: string;
  active: boolean;
}

/**
 * Clientes (ativos primeiro, depois inativos) que indicam o sócio com indicação ATIVA: os que
 * bloqueiam a inativação (consulta 11.2, RAT-D025). A tela escolhe a variante do diálogo com isto;
 * o banco confere de novo ao confirmar.
 */
export async function listPartnerClients(supabase: AppSupabaseClient, partnerId: string): Promise<PartnerClientRef[]> {
  if (!isUuidText(partnerId)) return [];
  const rows = await fetchAllRows((from, to) =>
    supabase
      .from("client_partners")
      .select("id, clients!inner(id, legal_name, normalized_name, active)")
      .eq("partner_id", partnerId)
      .eq("active", true)
      .order("id")
      .range(from, to),
  );
  return rows
    .map((row) => row.clients)
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        a.normalized_name.localeCompare(b.normalized_name) ||
        a.id.localeCompare(b.id),
    )
    .map((client) => ({ id: client.id, name: client.legal_name, active: client.active }));
}

export interface PartnerBlockingClient extends PartnerClientRef {
  /**
   * O sócio é o ÚNICO sócio ativo deste cliente ativo: sair dele deixaria o cliente sem sócio
   * (selo "Único sócio" do diálogo de bloqueio, UI 6.1 A). Sempre `false` para cliente inativo.
   */
  onlyPartner: boolean;
}

/** Quantos clientes entram em cada consulta de contagem (limita o tamanho da URL do PostgREST). */
const SOLE_PARTNER_CHUNK = 50;

/**
 * Os clientes da consulta 11.2 (todos, ativos e inativos), cada um com a marca "Único sócio". A lista
 * é a mesma de `listPartnerClients`; a marca sai de contar as indicações ativas de cada cliente ATIVO
 * (se só há esta, o sócio é o único). A tela usa a lista para escolher o diálogo e para mostrá-la
 * inteira; o banco confere de novo ao confirmar.
 */
export async function listPartnerBlockingClients(
  supabase: AppSupabaseClient,
  partnerId: string,
): Promise<PartnerBlockingClient[]> {
  const clients = await listPartnerClients(supabase, partnerId);
  const activeIds = clients.filter((client) => client.active).map((client) => client.id);

  const indicationCount = new Map<string, number>();
  for (let start = 0; start < activeIds.length; start += SOLE_PARTNER_CHUNK) {
    const chunk = activeIds.slice(start, start + SOLE_PARTNER_CHUNK);
    const rows = await fetchAllRows((from, to) =>
      supabase.from("client_partners").select("id, client_id").in("client_id", chunk).eq("active", true).order("id").range(from, to),
    );
    for (const row of rows) indicationCount.set(row.client_id, (indicationCount.get(row.client_id) ?? 0) + 1);
  }

  return clients.map((client) => ({
    ...client,
    onlyPartner: client.active && (indicationCount.get(client.id) ?? 0) === 1,
  }));
}

export interface PartnerReceiverRef {
  id: string;
  holderName: string;
}

/**
 * Recebedores ATIVOS do sócio (consulta 11.3): a lista que o diálogo de inativação mostra e que
 * volta em `confirmedReceiverIds`. Só o Administrador lê recebedores.
 */
export async function listActiveReceiversOfPartner(
  supabase: AppSupabaseClient,
  partnerId: string,
): Promise<PartnerReceiverRef[]> {
  if (!isUuidText(partnerId)) return [];
  const rows = unwrapRows(
    await supabase
      .from("receivers")
      .select("id, holder_name")
      .eq("partner_id", partnerId)
      .eq("active", true)
      .order("normalized_holder_name")
      .order("id"),
  );
  return rows.map((row) => ({ id: row.id, holderName: row.holder_name }));
}

/** Há login vinculado ao sócio? (consulta 11.7, aviso da UI 5.3.) Só o Administrador lê perfis alheios. */
export async function partnerHasLinkedLogin(supabase: AppSupabaseClient, partnerId: string): Promise<boolean> {
  if (!isUuidText(partnerId)) return false;
  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", partnerId);
  if (error) throw mapDatabaseError(error);
  return (count ?? 0) > 0;
}

// -----------------------------------------------------------------------------------------------
// Escrita (funções do banco; nenhuma escrita direta em tabela)
// -----------------------------------------------------------------------------------------------

export interface PartnerWriteResult extends WriteResult {
  name: string;
}

/** Cria ou edita o sócio (nome e apelidos como estado final, tudo ou nada) — `public.save_partner`. */
export async function savePartner(ctx: CadastroContext, input: PartnerSaveInput): Promise<PartnerWriteResult> {
  const row = unwrap(
    await ctx.supabase.rpc("save_partner", {
      p_partner_id: nullable(input.id),
      p_name: input.name,
      p_aliases: input.aliases,
      p_expected_updated_at: nullable(input.expectedUpdatedAt),
      p_reason: optional(input.reason),
      p_correlation_id: optional(ctx.correlationId),
    }),
    { subject: "partner", operation: "save" },
  );
  return { id: row.id, name: row.name, active: row.active, updatedAt: row.updated_at };
}

export interface SetPartnerActiveOptions {
  /** Nome do sócio, só para a frase de bloqueio ("{Nome} ainda está indicado em ..."). */
  partnerName?: string;
}

/**
 * Inativa ou reativa o sócio — `public.set_partner_active`. Na inativação, `confirmedReceiverIds`
 * são os recebedores ativos mostrados no diálogo; o banco os inativa junto, na mesma transação.
 */
export async function setPartnerActive(
  ctx: CadastroContext,
  input: PartnerSetActiveInput,
  options: SetPartnerActiveOptions = {},
): Promise<PartnerWriteResult> {
  const row = unwrap(
    await ctx.supabase.rpc("set_partner_active", {
      p_partner_id: input.id,
      p_active: input.active,
      p_expected_updated_at: input.expectedUpdatedAt,
      p_confirmed_receiver_ids: input.confirmedReceiverIds,
      p_reason: optional(input.reason),
      p_correlation_id: optional(ctx.correlationId),
    }),
    { subject: "partner", subjectName: options.partnerName, operation: input.active ? "activate" : "deactivate" },
  );
  return { id: row.id, name: row.name, active: row.active, updatedAt: row.updated_at };
}
