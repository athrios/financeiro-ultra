/**
 * Regras de APRESENTAÇÃO da lista consolidada de Apelidos (UI 5.4; só leitura, só Administrador):
 * filtros da URL, rótulos de tipo, texto de cada linha e destino do link para o dono. Nada aqui decide
 * regra de negócio nem consulta nada: quem devolve as linhas é `search_aliases` (RLS do Administrador).
 * Sem Next, sem React, sem banco.
 */

import { DEFAULT_PAGE_SIZE, PAGE_SIZES, type PageSize } from "./client-view";
import { receiverHref } from "./receiver-view";
import { parseStatusParam, statusParamOf } from "./partner-view";
import { ALIAS_KINDS, type AliasKind, type RowStatus } from "./schemas";
import { stripNul } from "./text";

export const ALIASES_HREF = "/configuracoes/aliases";

// -----------------------------------------------------------------------------------------------
// Tipos (rótulos exatos da UI 5.4)
// -----------------------------------------------------------------------------------------------

/** Coluna "Tipo" da tabela e do cartão. */
export const ALIAS_KIND_LABELS: Readonly<Record<AliasKind, string>> = {
  PARTNER_ALIAS: "Apelido de sócio",
  CLIENT_ALIAS: "Apelido de cliente",
  NAME_VARIANT: "Variação do nome",
  PIX_KEY: "Chave Pix",
  BANK_ACCOUNT: "Conta bancária",
};

/** Valor do parâmetro `?tipo=` da URL (português, como `?status=ativos`). */
const KIND_PARAMS: Readonly<Record<AliasKind, string>> = {
  PARTNER_ALIAS: "socio",
  CLIENT_ALIAS: "cliente",
  NAME_VARIANT: "variacao",
  PIX_KEY: "pix",
  BANK_ACCOUNT: "conta",
};

export function kindParamOf(kind: AliasKind): string {
  return KIND_PARAMS[kind];
}

export interface AliasKindOption {
  /** Valor do `<option>` ("" = todos). */
  value: string;
  label: string;
}

/** Opções do filtro "Tipo" (UI 5.4: Todos · Apelido de sócio · Apelido de cliente · Variação do nome de recebedor · Chave Pix · Conta bancária). */
export const ALIAS_KIND_OPTIONS: readonly AliasKindOption[] = [
  { value: "", label: "Todos" },
  { value: KIND_PARAMS.PARTNER_ALIAS, label: "Apelido de sócio" },
  { value: KIND_PARAMS.CLIENT_ALIAS, label: "Apelido de cliente" },
  { value: KIND_PARAMS.NAME_VARIANT, label: "Variação do nome de recebedor" },
  { value: KIND_PARAMS.PIX_KEY, label: "Chave Pix" },
  { value: KIND_PARAMS.BANK_ACCOUNT, label: "Conta bancária" },
];

export function parseKindParam(raw: string | string[] | undefined): AliasKind | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined) return null;
  return ALIAS_KINDS.find((kind) => KIND_PARAMS[kind] === value) ?? null;
}

// -----------------------------------------------------------------------------------------------
// Filtros da URL (`?q=&tipo=&status=&pagina=&por=`)
// -----------------------------------------------------------------------------------------------

/** Limite de páginas aceito na URL (a mesma defesa da lista de clientes). */
const MAX_PAGE = 100_000;

export interface AliasListParams {
  /** Texto da busca (aparado e limitado), "" quando não há. */
  query: string;
  kind: AliasKind | null;
  status: RowStatus;
  /** Página, a partir de 1. */
  page: number;
  pageSize: PageSize;
}

function first(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

/** Lê os parâmetros da lista; a URL é entrada não confiável, então tudo cai num valor seguro. */
export function parseAliasListParams(params: Readonly<Record<string, string | string[] | undefined>>): AliasListParams {
  const query = stripNul(first(params.q) ?? "").trim().slice(0, 200);

  const pageText = first(params.pagina);
  const pageNumber = pageText !== undefined && /^\d{1,6}$/.test(pageText) ? Number(pageText) : 1;
  const page = Math.min(Math.max(pageNumber, 1), MAX_PAGE);

  const sizeText = first(params.por);
  const size = sizeText !== undefined && /^\d{1,3}$/.test(sizeText) ? Number(sizeText) : DEFAULT_PAGE_SIZE;
  const pageSize = (PAGE_SIZES as readonly number[]).includes(size) ? (size as PageSize) : DEFAULT_PAGE_SIZE;

  return { query, kind: parseKindParam(params.tipo), status: parseStatusParam(params.status), page, pageSize };
}

/** Há busca ou filtro diferente do padrão? (mostra "Limpar filtros"). Página e tamanho não contam. */
export function hasAliasFilters(params: Pick<AliasListParams, "query" | "kind" | "status">): boolean {
  return params.query !== "" || params.kind !== null || params.status !== "ACTIVE";
}

export interface AliasListHrefInput {
  q?: string;
  kind?: AliasKind | null;
  status?: RowStatus;
  page?: number;
  pageSize?: PageSize;
}

/** Caminho da lista com os filtros; omite o que é padrão, para a URL ficar limpa. */
export function aliasesListHref(filters: AliasListHrefInput = {}): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.kind) params.set("tipo", KIND_PARAMS[filters.kind]);
  if (filters.status && filters.status !== "ACTIVE") params.set("status", statusParamOf(filters.status));
  if (filters.page && filters.page > 1) params.set("pagina", String(filters.page));
  if (filters.pageSize && filters.pageSize !== DEFAULT_PAGE_SIZE) params.set("por", String(filters.pageSize));
  const query = params.toString();
  return query ? `${ALIASES_HREF}?${query}` : ALIASES_HREF;
}

/** Resumo do resultado: "3 textos encontrados"; sem busca nem tipo, "12 textos ativos" ou "inativos". */
export function describeAliasCount(total: number, filters: Pick<AliasListParams, "query" | "kind" | "status">): string {
  const noun = total === 1 ? "texto" : "textos";
  if (filters.query !== "" || filters.kind !== null) {
    return `${total} ${noun} ${total === 1 ? "encontrado" : "encontrados"}`;
  }
  if (filters.status === "ACTIVE") return `${total} ${noun} ${total === 1 ? "ativo" : "ativos"}`;
  if (filters.status === "INACTIVE") return `${total} ${noun} ${total === 1 ? "inativo" : "inativos"}`;
  return `${total} ${noun}`;
}

// -----------------------------------------------------------------------------------------------
// Linha da lista (UI 5.4: colunas Texto, Tipo, Pertence a, Situação)
// -----------------------------------------------------------------------------------------------

/**
 * Coluna "Texto". O banco entrega a conta bancária como "banco / agência / conta"; a tela mostra
 * "Banco {x} · Ag. {y} · Conta {z}". As duas últimas partes são agência e conta; o que sobrar à
 * esquerda é o nome do banco (que pode, ele mesmo, ter " / "). Sem as três partes, o texto vai como veio.
 */
export function describeAliasText(item: { kind: AliasKind; displayValue: string }): string {
  if (item.kind !== "BANK_ACCOUNT") return item.displayValue;
  const parts = item.displayValue.split(" / ");
  if (parts.length < 3) return item.displayValue;
  const account = parts[parts.length - 1];
  const branch = parts[parts.length - 2];
  const bank = parts.slice(0, -2).join(" / ");
  return `Banco ${bank} · Ag. ${branch} · Conta ${account}`;
}

export interface AliasOwnerSource {
  ownerKind: "PARTNER" | "CLIENT" | "RECEIVER";
  ownerId: string;
  ownerName: string;
  /** O dono (sócio, cliente ou recebedor) está ativo? Vem de `search_aliases.owner_active`. */
  ownerActive: boolean;
  partnerId: string | null;
  partnerName: string | null;
}

export interface AliasOwnerView {
  /** Nome do dono (sócio, cliente ou titular do recebedor); é o texto do link. */
  label: string;
  /**
   * Só no recebedor: " · sócio {Nome}", mostrado DEPOIS do aviso de inativo para que o parêntese
   * não pareça ser do sócio (N-02). `null` nos demais e quando falta o sócio.
   */
  context: string | null;
  /** "(sócio inativo)", "(recebedor inativo)" ou "(cliente inativo)" quando o dono está inativo; senão `null`. */
  inactiveNote: string | null;
  /** Detalhe do dono; `null` quando falta o sócio de um recebedor (nunca inventa endereço). */
  href: string | null;
}

/**
 * Aviso ao lado do dono inativo (SEG-CAD-08b): um texto ativo de dono inativo continua aparecendo em "Ativos"
 * e quem lê precisa saber que o dono está inativo. `search_aliases` já diferencia sócio, recebedor e cliente.
 */
const OWNER_INACTIVE_NOTES: Record<AliasOwnerSource["ownerKind"], string> = {
  PARTNER: "(sócio inativo)",
  RECEIVER: "(recebedor inativo)",
  CLIENT: "(cliente inativo)",
};

/** Coluna "Pertence a": o texto e o destino do link para o cadastro do dono. */
export function describeAliasOwner(item: AliasOwnerSource): AliasOwnerView {
  const inactiveNote = item.ownerActive ? null : OWNER_INACTIVE_NOTES[item.ownerKind];
  switch (item.ownerKind) {
    case "PARTNER":
      return { label: item.ownerName, context: null, inactiveNote, href: `/configuracoes/socios/${encodeURIComponent(item.ownerId)}` };
    case "CLIENT":
      return { label: item.ownerName, context: null, inactiveNote, href: `/clientes/${encodeURIComponent(item.ownerId)}` };
    case "RECEIVER":
      return {
        inactiveNote,
        label: item.ownerName,
        context: item.partnerName ? ` · sócio ${item.partnerName}` : null,
        href: item.partnerId ? receiverHref(encodeURIComponent(item.partnerId), encodeURIComponent(item.ownerId)) : null,
      };
  }
}

// -----------------------------------------------------------------------------------------------
// Textos fixos da página (UI 5.4)
// -----------------------------------------------------------------------------------------------

export const ALIASES_DESCRIPTION =
  "Nomes, chaves e contas usados para reconhecer quem pagou e quem recebeu. Para alterar, abra o cadastro de quem é o dono.";
export const ALIASES_SEARCH_HELP = "A busca ignora acento, maiúscula e pontuação.";
export const ALIASES_EMPTY_TITLE = "Nenhum apelido cadastrado ainda.";
export const ALIASES_EMPTY_TEXT = "Os apelidos e identificadores são cadastrados dentro de cada sócio, recebedor e cliente.";
export const ALIASES_NO_RESULT_TITLE = "Nenhum texto encontrado.";
export const ALIASES_NO_ACTIVE_TITLE = "Nenhum texto ativo.";
export const ALIASES_NO_INACTIVE_TITLE = "Nenhum texto inativo.";

export type AliasesEmptyKind = "NONE_AT_ALL" | "NO_ACTIVE" | "NO_INACTIVE" | "NO_RESULT";

/**
 * Qual estado vazio mostrar (UI 5.4 e T-31). "Nenhum texto encontrado." só com busca ou tipo (ou "Todos"
 * vazio, que não ocorre com dados); nos padrões "Ativos" e "Inativos" a frase diz a situação vazia.
 * `anyExists`: há algum texto, em qualquer situação (só é consultado sem busca nem tipo).
 */
export function aliasesEmptyKind(
  params: Pick<AliasListParams, "query" | "kind" | "status">,
  anyExists: boolean,
): AliasesEmptyKind {
  if (params.query !== "" || params.kind !== null) return "NO_RESULT";
  if (!anyExists) return "NONE_AT_ALL";
  if (params.status === "ACTIVE") return "NO_ACTIVE";
  if (params.status === "INACTIVE") return "NO_INACTIVE";
  return "NO_RESULT";
}
export const ALIASES_ERROR_TITLE = "Não foi possível carregar os apelidos.";
