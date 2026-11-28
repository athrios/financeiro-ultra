/**
 * Regras de APRESENTAÇÃO das telas de cliente (UI 3 e 4.2): filtros da URL, textos exatos da lista
 * e do detalhe e aviso de sucesso depois do redirecionamento.
 *
 * Nada aqui decide regra de negócio. A divisão 1/n é só informação derivada da contagem (RAT-D015);
 * o dinheiro vem em texto decimal e vira "R$ 1.250,00" sem passar por float. Sem Next, sem React,
 * sem banco.
 */

import { describeDocument, documentTypeOf, type DocumentType } from "@/domain/documents/document";
import { parseMoney } from "@/domain/shared/money";
import { formatCurrency } from "@/lib/format";

import { describeEqualDivision, equalSharePercent } from "./division";
import { parseStatusParam, statusParamOf } from "./partner-view";
import type { RowStatus } from "./schemas";
import { stripNul } from "./text";

export const CLIENTS_HREF = "/clientes";

/**
 * Ajuda do campo "Buscar cliente" (T-01). CPF e CNPJ são buscados pelo começo do número (prefixo, em
 * `search_clients`); o texto avisa para ninguém digitar o meio ou o fim do documento (QA-CAD-08).
 */
export const CLIENTS_SEARCH_HELP =
  "Nome, nome fantasia, apelido, ou o começo do CPF ou do CNPJ. A busca ignora acento, maiúscula e pontuação.";

// -----------------------------------------------------------------------------------------------
// Filtros da URL (`?q=&status=&socio=&pagina=&por=`)
// -----------------------------------------------------------------------------------------------

export const PAGE_SIZES = [25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 25;

/** Limite de páginas aceito na URL (evita deslocamentos absurdos; o banco não tem teto próprio). */
const MAX_PAGE = 100_000;

const UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ClientListParams {
  /** Texto da busca (aparado e limitado), "" quando não há. */
  query: string;
  status: RowStatus;
  /** Id do sócio do filtro, em minúsculas, ou `null`. Valor que não é UUID é ignorado. */
  partnerId: string | null;
  /** Página, a partir de 1. */
  page: number;
  pageSize: PageSize;
}

function first(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

/** Lê os parâmetros da lista; a URL é entrada não confiável, então tudo cai num valor seguro. */
export function parseClientListParams(params: Readonly<Record<string, string | string[] | undefined>>): ClientListParams {
  const query = stripNul(first(params.q) ?? "").trim().slice(0, 200);

  const socio = (first(params.socio) ?? "").trim();
  const partnerId = UUID_TEXT.test(socio) ? socio.toLowerCase() : null;

  const pageText = first(params.pagina);
  const pageNumber = pageText !== undefined && /^\d{1,6}$/.test(pageText) ? Number(pageText) : 1;
  const page = Math.min(Math.max(pageNumber, 1), MAX_PAGE);

  const sizeText = first(params.por);
  const size = sizeText !== undefined && /^\d{1,3}$/.test(sizeText) ? Number(sizeText) : DEFAULT_PAGE_SIZE;
  const pageSize = (PAGE_SIZES as readonly number[]).includes(size) ? (size as PageSize) : DEFAULT_PAGE_SIZE;

  return { query, status: parseStatusParam(params.status), partnerId, page, pageSize };
}

/** Há busca ou filtro diferente do padrão? (mostra "Limpar filtros" e os chips). Página e tamanho não contam. */
export function hasClientFilters(params: Pick<ClientListParams, "query" | "status" | "partnerId">): boolean {
  return params.query !== "" || params.status !== "ACTIVE" || params.partnerId !== null;
}

export interface ClientListHrefInput {
  q?: string;
  status?: RowStatus;
  partnerId?: string | null;
  page?: number;
  pageSize?: PageSize;
}

/** Caminho da lista com os filtros; omite o que é padrão, para a URL ficar limpa. */
export function clientsListHref(filters: ClientListHrefInput = {}): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status && filters.status !== "ACTIVE") params.set("status", statusParamOf(filters.status));
  if (filters.partnerId) params.set("socio", filters.partnerId);
  if (filters.page && filters.page > 1) params.set("pagina", String(filters.page));
  if (filters.pageSize && filters.pageSize !== DEFAULT_PAGE_SIZE) params.set("por", String(filters.pageSize));
  const query = params.toString();
  return query ? `${CLIENTS_HREF}?${query}` : CLIENTS_HREF;
}

/** O deslocamento do banco para a página pedida. */
export function pageOffset(page: number, pageSize: number): number {
  return (Math.max(page, 1) - 1) * pageSize;
}

// -----------------------------------------------------------------------------------------------
// Resumo e paginação
// -----------------------------------------------------------------------------------------------

/**
 * Resumo do resultado (UI 3.1 item 4): "128 clientes ativos", "3 clientes encontrados". Com busca ou
 * sócio no filtro, vale "encontrados"; sem eles, a situação ("ativos", "inativos" ou nenhuma).
 */
export function describeClientCount(total: number, filters: Pick<ClientListParams, "query" | "status" | "partnerId">): string {
  const noun = total === 1 ? "cliente" : "clientes";
  if (filters.query !== "" || filters.partnerId !== null) {
    return `${total} ${noun} ${total === 1 ? "encontrado" : "encontrados"}`;
  }
  if (filters.status === "ACTIVE") return `${total} ${noun} ${total === 1 ? "ativo" : "ativos"}`;
  if (filters.status === "INACTIVE") return `${total} ${noun} ${total === 1 ? "inativo" : "inativos"}`;
  return `${total} ${noun}`;
}

/** "1–25 de 128" (travessão, como na UI 3.1 item 6). */
export function describePageRange(offset: number, shown: number, total: number): string {
  if (shown <= 0 || total <= 0) return `0 de ${total}`;
  return `${offset + 1}–${offset + shown} de ${total}`;
}

/** Quantas páginas há para `total` itens (no mínimo 1). */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

// -----------------------------------------------------------------------------------------------
// Linhas da lista (UI 3.2 e 3.4)
// -----------------------------------------------------------------------------------------------

/** "1500.00" -> "R$ 1.500,00" (centavos inteiros, sem float). Texto ilegível volta como veio. */
export function formatMonthlyValue(text: string): string {
  try {
    return formatCurrency(parseMoney(text));
  } catch {
    return text;
  }
}

export interface DocumentLine {
  /** "CPF" ou "CNPJ"; `null` quando não há documento. */
  label: DocumentType | null;
  /** Número formatado, ou "Sem documento". */
  text: string;
}

/** Documento da lista: rótulo e número formatado; sem documento, "Sem documento" (UI 3.2). */
export function describeDocumentLine(document: string | null | undefined): DocumentLine {
  const label = documentTypeOf(document);
  if (label === null || document == null) return { label: null, text: "Sem documento" };
  return { label, text: describeDocument(document).slice(label.length + 1) };
}

const MAX_LISTED_PARTNER_NAMES = 3;

export interface PartnersSummary {
  /** Primeira linha: até três nomes, depois "e mais {k}". Vazio quando não há sócio. */
  names: string;
  /** Quantos nomes ficaram de fora (para o texto oculto do leitor de tela). */
  hiddenCount: number;
  /** Lista completa, para o leitor de tela. */
  allNames: string;
  /** Segunda linha: "3 sócios · 1/3 cada", "1 sócio · 1/1" ou "Nenhum sócio indicado". */
  division: string;
}

/** Sócios do cliente na lista (UI 3.2): nomes e a fração. `count` é o `n` do banco (indicações ativas). */
export function summarizePartners(names: readonly string[], count: number): PartnersSummary {
  const shown = names.slice(0, MAX_LISTED_PARTNER_NAMES);
  const hiddenCount = Math.max(names.length - shown.length, 0);
  const namesText = hiddenCount > 0 ? `${shown.join(", ")} e mais ${hiddenCount}` : shown.join(", ");
  let division: string;
  if (count <= 0) division = "Nenhum sócio indicado";
  else if (count === 1) division = "1 sócio · 1/1";
  else division = `${count} sócios · 1/${count} cada`;
  return { names: namesText, hiddenCount, allNames: names.join(", "), division };
}

// -----------------------------------------------------------------------------------------------
// Detalhe (UI 4.2)
// -----------------------------------------------------------------------------------------------

/** O tipo do cliente é só o tipo do documento: "CPF" ou "CNPJ"; sem documento, nenhum tipo (UI 4.2, RAT-D017). */
export function clientTypeLabel(documentType: DocumentType | null): string | null {
  if (documentType === "CPF") return "CPF";
  if (documentType === "CNPJ") return "CNPJ";
  return null;
}

/** Prévia da divisão do detalhe (a mesma da UI 4.1.4); nenhum sócio ativo: "Nenhum sócio indicado.". */
export function describeClientDivision(activePartnerCount: number): string {
  return activePartnerCount <= 0 ? "Nenhum sócio indicado." : describeEqualDivision(activePartnerCount);
}

export const DIVISION_NOTE =
  "A divisão é sempre igual entre os sócios do cliente. Trocas valem daqui em diante e não mudam o que já foi recebido.";

export const INACTIVE_CLIENT_NOTICE = "Cliente inativo. O cadastro está guardado e pode ser reativado.";
export const INACTIVE_CLIENT_ASK_ADMIN = "Peça a um Administrador para reativá-lo.";

/** Apelido do cliente no detalhe: o de nome como digitado; o de documento com o tipo ("CPF 000.000.001-91"). */
export function describeClientAlias(alias: { type: "NAME" | "DOCUMENT"; displayValue: string }): string {
  if (alias.type !== "DOCUMENT") return alias.displayValue;
  return describeDocument(alias.displayValue.replace(/[^0-9A-Za-z]/g, "").toUpperCase());
}

// -----------------------------------------------------------------------------------------------
// Aviso de sucesso depois do redirecionamento (U-C17)
// -----------------------------------------------------------------------------------------------

export type ClientFlashKey = "criado" | "salvo" | "inativado" | "reativado" | "ja-inativo" | "ja-ativo";

export interface ClientFlash {
  tone: "success" | "info";
  message: string;
}

/**
 * Lê `?aviso=` da lista e do detalhe. Só chaves conhecidas valem: a mensagem NUNCA vem da URL, então
 * quem forja o endereço só consegue mostrar um dos textos fixos.
 */
export function parseClientFlash(raw: string | string[] | undefined): ClientFlash | null {
  switch (first(raw)) {
    case "criado":
      return { tone: "success", message: "Cliente cadastrado." };
    case "salvo":
      return { tone: "success", message: "Alterações salvas." };
    case "inativado":
      return { tone: "success", message: "Cliente inativado." };
    case "reativado":
      return { tone: "success", message: "Cliente reativado." };
    case "ja-inativo":
      return { tone: "info", message: "Este cliente já está inativo. A tela foi atualizada." };
    case "ja-ativo":
      return { tone: "info", message: "Este cliente já está ativo. A tela foi atualizada." };
    default:
      return null;
  }
}

/** Caminho do detalhe, com o aviso quando a ação redireciona para ele. */
export function clientDetailHref(id: string, flashKey?: ClientFlashKey): string {
  const base = `${CLIENTS_HREF}/${encodeURIComponent(id)}`;
  return flashKey ? `${base}?aviso=${flashKey}` : base;
}

export function clientEditHref(id: string): string {
  return `${CLIENTS_HREF}/${encodeURIComponent(id)}/editar`;
}

export const NEW_CLIENT_HREF = `${CLIENTS_HREF}/novo`;

// -----------------------------------------------------------------------------------------------
// Diálogo de inativar e reativar cliente (UI 6.3 e 6.4)
// -----------------------------------------------------------------------------------------------

export type ClientActiveVariant =
  /** Cliente ativo: "Inativar {Nome}?" (6.3). */
  | "inactivate"
  /** Cliente inativo com pelo menos um sócio ativo: "Reativar {Nome}?" (6.4 A). */
  | "reactivate"
  /** Cliente inativo sem sócio ativo: bloqueio, sem confirmar (6.4 B). */
  | "blocked";

/**
 * Qual diálogo abrir, com os dados que a página leu. É só apresentação: quem decide é o banco
 * (`CLIENT_WITHOUT_PARTNER` ao reativar sem sócio ativo, RAT-D025).
 */
export function clientActiveVariant(input: { active: boolean; activePartnerCount: number }): ClientActiveVariant {
  if (input.active) return "inactivate";
  return input.activePartnerCount > 0 ? "reactivate" : "blocked";
}

export function clientDialogTitle(variant: ClientActiveVariant, name: string): string {
  switch (variant) {
    case "blocked":
      return `Não é possível reativar ${name}`;
    case "reactivate":
      return `Reativar ${name}?`;
    case "inactivate":
      return `Inativar ${name}?`;
  }
}

/** 6.3: "O cadastro continua guardado... Os sócios indicados ({Alfa, Beta}) continuam registrados..." */
export function inactivateClientDescription(partnerNames: readonly string[]): string {
  const partners =
    partnerNames.length > 0 ? ` Os sócios indicados (${partnerNames.join(", ")}) continuam registrados.` : "";
  return `O cadastro continua guardado e pode ser reativado depois.${partners} Recebimentos já registrados não mudam.`;
}

/** 6.4 A: "O cliente volta para a lista de ativos com {n} sócio(s): {nomes}. A divisão é igual: 1/{n}..." */
export function reactivateClientDescription(partnerNames: readonly string[]): string {
  const count = partnerNames.length;
  const noun = count === 1 ? "sócio" : "sócios";
  return `O cliente volta para a lista de ativos com ${count} ${noun}: ${partnerNames.join(", ")}. A divisão é igual: 1/${count} para cada um (${equalSharePercent(count)}).`;
}

export const REACTIVATE_BLOCKED_DESCRIPTION =
  "Todo cliente ativo precisa de pelo menos um sócio, e este cliente está sem sócio ativo. Indique um sócio na edição do cliente e depois reative.";

export function clientActionLabel(variant: Exclude<ClientActiveVariant, "blocked">): string {
  return variant === "reactivate" ? "Reativar cliente" : "Inativar cliente";
}

export function clientPendingLabel(variant: Exclude<ClientActiveVariant, "blocked">): string {
  return variant === "reactivate" ? "Reativando…" : "Inativando…";
}

/** Falha inesperada na confirmação (6.3 e 6.4): o texto da UI, não o genérico do sistema. */
export function clientUnexpectedMessage(activating: boolean): string {
  return activating
    ? "Não foi possível reativar o cliente agora. Tente novamente em instantes."
    : "Não foi possível inativar o cliente agora. Tente novamente em instantes.";
}
