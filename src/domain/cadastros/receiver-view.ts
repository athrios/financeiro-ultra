/**
 * Regras de APRESENTAÇÃO das telas de recebedor (UI 5.3, 6.5 e 7): endereços, filtro do cartão,
 * textos exatos dos diálogos e do formulário. Nada aqui decide regra de negócio: reativar com o sócio
 * inativo e a unicidade dos identificadores são do banco; a tela só antecipa o diálogo certo.
 * Sem Next, sem React, sem banco.
 */

import { statusParamOf } from "./partner-view";
import type { RowStatus } from "./schemas";

// -----------------------------------------------------------------------------------------------
// Endereços
// -----------------------------------------------------------------------------------------------

export function receiverNewHref(partnerId: string): string {
  return `/configuracoes/socios/${partnerId}/recebedores/novo`;
}

export function receiverHref(partnerId: string, receiverId: string): string {
  return `/configuracoes/socios/${partnerId}/recebedores/${receiverId}`;
}

/** Detalhe do sócio com o filtro do cartão "Recebedores" (`?recebedores=`); o padrão (Ativos) some da URL. */
export function receiversFilterHref(partnerId: string, status: RowStatus): string {
  const base = `/configuracoes/socios/${partnerId}`;
  return status === "ACTIVE" ? base : `${base}?recebedores=${statusParamOf(status)}`;
}

// -----------------------------------------------------------------------------------------------
// Cartão "Recebedores" no detalhe do sócio (UI 5.3 item 5)
// -----------------------------------------------------------------------------------------------

export const RECEIVERS_EMPTY_TITLE = "Este sócio ainda não tem recebedores.";
/** Filtro Ativos vazio, mas com recebedores inativos (T-26): o título não pode negar os inativos. */
export const RECEIVERS_NO_ACTIVE_TITLE = "Este sócio não tem recebedores ativos.";
export const RECEIVERS_EMPTY_TEXT =
  "Cadastre as contas e os nomes pelos quais este sócio recebe, para o sistema reconhecer os comprovantes.";
export const RECEIVERS_NO_INACTIVE = "Nenhum recebedor inativo.";
export const RECEIVERS_PARTNER_INACTIVE_TEXT = "Reative o sócio para cadastrar recebedores.";

/** "{k} variações do nome" (singular: "1 variação do nome"); `null` quando não há. */
export function describeVariantCount(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? "1 variação do nome" : `${count} variações do nome`;
}

/** Texto do estado vazio conforme o filtro (UI 5.3: "Nenhum recebedor inativo." no filtro Inativos). */
export function receiversEmptyMessage(
  status: RowStatus,
  hasInactive = false,
): { title: string; text: string | null } {
  if (status === "INACTIVE") return { title: RECEIVERS_NO_INACTIVE, text: null };
  const title = status === "ACTIVE" && hasInactive ? RECEIVERS_NO_ACTIVE_TITLE : RECEIVERS_EMPTY_TITLE;
  return { title, text: RECEIVERS_EMPTY_TEXT };
}

// -----------------------------------------------------------------------------------------------
// Inativar e reativar (UI 6.5)
// -----------------------------------------------------------------------------------------------

export type ReceiverActiveVariant = "deactivate" | "reactivate" | "blocked";

/** Reativar com o sócio dono inativo é bloqueio (6.5 B); o resto é confirmação simples. */
export function receiverActiveVariant(input: { active: boolean; partnerActive: boolean }): ReceiverActiveVariant {
  if (input.active) return "deactivate";
  return input.partnerActive ? "reactivate" : "blocked";
}

export function receiverDialogTitle(variant: ReceiverActiveVariant, holderName: string): string {
  switch (variant) {
    case "deactivate":
      return `Inativar o recebedor ${holderName}?`;
    case "reactivate":
      return `Reativar o recebedor ${holderName}?`;
    case "blocked":
      return `Não é possível reativar ${holderName}`;
  }
}

export const DEACTIVATE_RECEIVER_DESCRIPTION =
  "Este recebedor deixa de ser usado para reconhecer comprovantes novos. O cadastro e os recebimentos já registrados continuam como estão. Você pode reativá-lo depois.";

export function reactivateReceiverDescription(partnerName: string): string {
  return `Ele volta a ser usado para reconhecer comprovantes do sócio ${partnerName}.`;
}

export function blockedReceiverDescription(partnerName: string): string {
  return `O sócio ${partnerName} está inativo. Reative o sócio antes de reativar o recebedor.`;
}

export function receiverActionLabel(variant: Exclude<ReceiverActiveVariant, "blocked">): string {
  return variant === "reactivate" ? "Reativar recebedor" : "Inativar recebedor";
}

export function receiverPendingLabel(variant: Exclude<ReceiverActiveVariant, "blocked">): string {
  return variant === "reactivate" ? "Reativando…" : "Inativando…";
}

/** Falha inesperada na confirmação (UI 6.5; a de inativar segue o mesmo molde). */
export function receiverUnexpectedMessage(activating: boolean): string {
  return activating
    ? "Não foi possível reativar o recebedor agora. Tente novamente em instantes."
    : "Não foi possível inativar o recebedor agora. Tente novamente em instantes.";
}

// -----------------------------------------------------------------------------------------------
// Formulário (UI 7)
// -----------------------------------------------------------------------------------------------

export const RECEIVER_PRIVACY_NOTICE =
  "Guarde só o que aparece nos comprovantes. Não informe senhas, números de cartão, saldos nem extratos.";

/** Faixa de contexto (7.1): no cadastro novo só a primeira frase; na edição, as duas. */
export function receiverPartnerContext(partnerName: string, isEdit: boolean): string {
  const first = `Este recebedor pertence a ${partnerName}`;
  return isEdit
    ? `${first} e não pode mudar de sócio. Para passar a conta a outro sócio, inative este recebedor e cadastre outro.`
    : `${first} e não pode mudar de sócio.`;
}

export const RECEIVER_INACTIVE_BANNER =
  "Recebedor inativo. Você pode corrigir os dados, mas ele só volta a ser usado depois de reativado.";

export const RECEIVER_PARTNER_INACTIVE_BLOCK =
  "Não é possível cadastrar recebedor para um sócio inativo. Reative o sócio primeiro.";

export function receiverPartnerInactiveBanner(partnerName: string): string {
  return `O sócio ${partnerName} está inativo.`;
}

/** Resumo do topo (UI 7.2 "Falha geral" e 4.1.9). */
export function receiverFailureSummary(count: number): string {
  if (count <= 1) return "Não foi possível salvar. Corrija o campo destacado.";
  return `Não foi possível salvar. Corrija os ${count} campos destacados.`;
}

export const RECEIVER_FIELD_LABELS = {
  holderName: "Nome do titular",
  variants: "Outras formas do nome",
  pixKeys: "Chaves Pix",
  accounts: "Contas bancárias",
} as const;
