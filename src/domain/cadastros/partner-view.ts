/**
 * Regras de APRESENTAÇÃO das telas de sócio (UI 5 e 6): textos exatos, escolha da variante do
 * diálogo de inativação, aviso de sucesso depois do redirecionamento e filtros da URL.
 *
 * Nada aqui decide regra de negócio: o bloqueio de inativar sócio indicado em cliente e a cascata
 * dos recebedores são do banco; a tela só escolhe o diálogo certo com os dados que leu e repete a
 * conferência no servidor (o banco recusa se mudou). Sem Next, sem React, sem banco.
 */

import type { RowStatus } from "./schemas";
import { stripNul } from "./text";

// -----------------------------------------------------------------------------------------------
// Filtros da URL (`?q=&status=`)
// -----------------------------------------------------------------------------------------------

export type StatusParam = "ativos" | "inativos" | "todos";

const STATUS_BY_PARAM: Readonly<Record<StatusParam, RowStatus>> = {
  ativos: "ACTIVE",
  inativos: "INACTIVE",
  todos: "ALL",
};

/** Valor desconhecido ou ausente volta ao padrão (Ativos). */
export function parseStatusParam(raw: string | string[] | undefined): RowStatus {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value !== undefined && Object.hasOwn(STATUS_BY_PARAM, value) ? STATUS_BY_PARAM[value as StatusParam] : "ACTIVE";
}

export function statusParamOf(status: RowStatus): StatusParam {
  return status === "INACTIVE" ? "inativos" : status === "ALL" ? "todos" : "ativos";
}

/** Texto da busca: primeiro valor, aparado e limitado (a URL é entrada não confiável). */
export function parseQueryParam(raw: string | string[] | undefined, maxLength = 200): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return stripNul(value ?? "").trim().slice(0, maxLength);
}

/** Caminho da lista com os filtros (omite o que é padrão, para a URL ficar limpa). */
export function partnersListHref(filters: { q?: string; status?: RowStatus }): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status && filters.status !== "ACTIVE") params.set("status", statusParamOf(filters.status));
  const query = params.toString();
  return query ? `/configuracoes/socios?${query}` : "/configuracoes/socios";
}

// -----------------------------------------------------------------------------------------------
// Aviso de sucesso depois do redirecionamento (U-C17: mensagem persistente)
// -----------------------------------------------------------------------------------------------

export type PartnerFlashKey =
  | "criado"
  | "salvo"
  | "inativado"
  | "reativado"
  | "ja-inativo"
  | "ja-ativo"
  // Recebedor (E5b): as ações do recebedor também voltam ao detalhe do sócio.
  | "recebedor-criado"
  | "recebedor-salvo"
  | "recebedor-inativado"
  | "recebedor-reativado"
  | "recebedor-ja-inativo"
  | "recebedor-ja-ativo";

export interface PartnerFlash {
  tone: "success" | "info";
  message: string;
}

const MAX_FLASH_RECEIVERS = 10_000;

/**
 * Lê `?aviso=` e `?n=` do detalhe. Só chaves conhecidas valem (a mensagem NUNCA vem da URL): quem
 * forja o endereço só consegue mostrar um dos textos fixos.
 */
export function parsePartnerFlash(
  rawKey: string | string[] | undefined,
  rawCount?: string | string[] | undefined,
): PartnerFlash | null {
  const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
  const countText = Array.isArray(rawCount) ? rawCount[0] : rawCount;
  const parsed = countText !== undefined && /^\d{1,5}$/.test(countText) ? Number(countText) : 0;
  const count = Math.min(parsed, MAX_FLASH_RECEIVERS);

  switch (key) {
    case "criado":
      return { tone: "success", message: "Sócio cadastrado. Agora você pode cadastrar os recebedores dele." };
    case "salvo":
      return { tone: "success", message: "Alterações salvas." };
    case "inativado":
      return { tone: "success", message: inactivatedMessage(count) };
    case "reativado":
      return { tone: "success", message: "Sócio reativado." };
    case "ja-inativo":
      return { tone: "info", message: "Este sócio já está inativo. A tela foi atualizada." };
    case "ja-ativo":
      return { tone: "info", message: "Este sócio já está ativo. A tela foi atualizada." };
    case "recebedor-criado":
      return { tone: "success", message: "Recebedor cadastrado." };
    case "recebedor-salvo":
      return { tone: "success", message: "Alterações salvas." };
    case "recebedor-inativado":
      return { tone: "success", message: "Recebedor inativado." };
    case "recebedor-reativado":
      return { tone: "success", message: "Recebedor reativado." };
    case "recebedor-ja-inativo":
      return { tone: "info", message: "Este recebedor já está inativo. A tela foi atualizada." };
    case "recebedor-ja-ativo":
      return { tone: "info", message: "Este recebedor já está ativo. A tela foi atualizada." };
    default:
      return null;
  }
}

/** UI 6.1: "Sócio inativado." / "... 1 recebedor inativado junto." / "... {n} recebedores inativados junto." */
export function inactivatedMessage(receiverCount: number): string {
  if (receiverCount <= 0) return "Sócio inativado.";
  if (receiverCount === 1) return "Sócio inativado. 1 recebedor inativado junto.";
  return `Sócio inativado. ${receiverCount} recebedores inativados junto.`;
}

/** Caminho do detalhe com o aviso (o redirecionamento da ação). */
export function partnerDetailHref(id: string, flash?: { key: PartnerFlashKey; count?: number }): string {
  const base = `/configuracoes/socios/${id}`;
  if (!flash) return base;
  const params = new URLSearchParams({ aviso: flash.key });
  if (flash.count !== undefined && flash.count > 0) params.set("n", String(flash.count));
  return `${base}?${params.toString()}`;
}

// -----------------------------------------------------------------------------------------------
// Diálogo de inativar e reativar (UI 6.1 e 6.2)
// -----------------------------------------------------------------------------------------------

export type PartnerActiveVariant =
  /** Sócio inativo: "Reativar {Nome}?" (6.2). */
  | "reactivate"
  /** Sócio em algum cliente, ativo ou inativo: bloqueio, sem confirmar (6.1 A). */
  | "blocked"
  /** Sem clientes e com recebedores ativos: cascata (6.1 B). */
  | "cascade"
  /** Sem clientes e sem recebedores ativos (6.1 C). */
  | "plain";

export function partnerActiveVariant(input: {
  active: boolean;
  clientCount: number;
  receiverCount: number;
}): PartnerActiveVariant {
  if (!input.active) return "reactivate";
  if (input.clientCount > 0) return "blocked";
  return input.receiverCount > 0 ? "cascade" : "plain";
}

/** "{Nome} ainda está indicado em {n} cliente(s), entre ativos e inativos. ..." (6.1 A). */
export function blockedDescription(name: string, clientCount: number): string {
  const where = clientCount === 1 ? "em 1 cliente" : `em ${clientCount} clientes`;
  return `${name} ainda está indicado ${where}, entre ativos e inativos. Para inativar, primeiro retire este sócio de todos eles.`;
}

export function blockedHowTo(name: string): string {
  return `Como retirar: abra o cliente, desmarque ${name} em “Sócios do cliente” e salve. Um cliente ativo precisa continuar com pelo menos um sócio. Se ${name} for o único, indique outro sócio antes.`;
}

/** "Os {n} recebedores ativos deste sócio serão inativados junto:" (6.1 B). */
export function cascadeDescription(receiverCount: number): string {
  return receiverCount === 1
    ? "O recebedor ativo deste sócio será inativado junto:"
    : `Os ${receiverCount} recebedores ativos deste sócio serão inativados junto:`;
}

export const CASCADE_NOTE =
  "Ao reativar o sócio, os recebedores continuam inativos até você reativá-los um a um. Nada é apagado: os cadastros e o histórico continuam guardados.";

export const LINKED_LOGIN_DIALOG_NOTE =
  "O login ligado a este sócio não é alterado, mas o vínculo com este cadastro deixa de valer enquanto ele estiver inativo.";

export function plainInactivateDescription(name: string): string {
  return `${name} não está em nenhum cliente e não tem recebedores ativos. O cadastro e o histórico continuam guardados, e você pode reativá-lo depois.`;
}

export const REACTIVATE_DESCRIPTION =
  "O sócio volta a poder ser indicado em clientes e a ter recebedores. Ele não volta sozinho para os clientes de onde saiu, e os recebedores inativados continuam inativos até você reativá-los.";

/** Rótulo do botão de ação (6.6): específico, nunca "OK". */
export function partnerActionLabel(variant: Exclude<PartnerActiveVariant, "blocked">, receiverCount: number): string {
  switch (variant) {
    case "reactivate":
      return "Reativar sócio";
    case "plain":
      return "Inativar sócio";
    case "cascade":
      return receiverCount === 1 ? "Inativar sócio e 1 recebedor" : `Inativar sócio e ${receiverCount} recebedores`;
  }
}

export function partnerPendingLabel(variant: Exclude<PartnerActiveVariant, "blocked">): string {
  return variant === "reactivate" ? "Reativando…" : "Inativando…";
}

export function partnerDialogTitle(variant: PartnerActiveVariant, name: string): string {
  switch (variant) {
    case "blocked":
      return `Não é possível inativar ${name}`;
    case "reactivate":
      return `Reativar ${name}?`;
    default:
      return `Inativar ${name}?`;
  }
}

/** Falha inesperada na confirmação (6.1 e 6.2): o texto da UI, não o genérico do sistema. */
export function partnerUnexpectedMessage(activating: boolean): string {
  return activating
    ? "Não foi possível reativar o sócio agora. Tente novamente em instantes."
    : "Não foi possível inativar o sócio agora. Tente novamente em instantes.";
}

// -----------------------------------------------------------------------------------------------
// Detalhe: cartão "Clientes deste sócio" (UI 5.3 item 6)
// -----------------------------------------------------------------------------------------------

/** "{n} clientes: {a} ativos e {i} inativos." com o singular certo. */
export function describeClientCounts(active: number, inactive: number): string {
  const total = active + inactive;
  const clients = total === 1 ? "1 cliente" : `${total} clientes`;
  const act = active === 1 ? "1 ativo" : `${active} ativos`;
  const inact = inactive === 1 ? "1 inativo" : `${inactive} inativos`;
  return `${clients}: ${act} e ${inact}.`;
}

export const CLIENTS_CARD_NOTE = "Para inativar este sócio, ele precisa sair de todos os clientes, ativos e inativos.";

/** Para onde levam "Ver clientes deste sócio" e "Ver todos os clientes deste sócio" (UI 5.3 e 6.1). */
export function partnerClientsHref(partnerId: string): string {
  return `/clientes?socio=${encodeURIComponent(partnerId)}&status=todos`;
}

// -----------------------------------------------------------------------------------------------
// Lista de sócios vazia (UI 5.1 e T-23)
// -----------------------------------------------------------------------------------------------

export type PartnersEmptyKind = "NO_MATCH" | "NO_INACTIVE" | "NO_ACTIVE" | "NONE";

/**
 * Qual estado vazio mostrar. "Ativos" vazio com sócios inativos existentes é "NO_ACTIVE" ("Nenhum
 * sócio ativo." com "Ver inativos"); "NONE" ("Nenhum sócio cadastrado") só quando não há sócio nenhum.
 */
export function partnersEmptyKind(input: { status: RowStatus; query: string; hasInactive: boolean }): PartnersEmptyKind {
  if (input.query !== "") return "NO_MATCH";
  if (input.status === "INACTIVE") return "NO_INACTIVE";
  if (input.status === "ACTIVE" && input.hasInactive) return "NO_ACTIVE";
  return "NONE";
}
