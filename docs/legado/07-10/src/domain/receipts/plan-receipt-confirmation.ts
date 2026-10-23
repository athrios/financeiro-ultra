import {
  allocateAmount,
  calculateDistribution,
  type AmountAllocation,
  type DistributionError,
  type DistributionInput,
  type DistributionRule,
  type DistributionSource,
} from "@/domain/distribution";
import type { Cents } from "@/domain/shared/money";

import type { ReceiptStatus } from "./receipt-status";

export interface ReceiptToConfirm {
  id: string;
  amount: Cents;
  status: ReceiptStatus;
  companyId: string | null;
  receivingIndicatorId: string | null;
}

export type ReceiptConfirmationError =
  | { code: "ALREADY_CONFIRMED" }
  | { code: "COMPANY_NOT_IDENTIFIED" }
  | { code: "RECEIVER_NOT_IDENTIFIED" }
  | { code: "INVALID_DISTRIBUTION"; distributionError: DistributionError };

export type ReceiptConfirmationPlan =
  | {
      ok: true;
      source: DistributionSource;
      rule: DistributionRule;
      allocations: AmountAllocation[];
    }
  | { ok: false; error: ReceiptConfirmationError };

/**
 * Monta o snapshot da distribuição econômica de um recebimento:
 *   1. determina os indicadores beneficiários (os da empresa);
 *   2. determina a regra (hierarquia de distribuição);
 *   3. calcula os percentuais;
 *   4. calcula os valores (soma exata = valor recebido).
 * O resultado é gravado por confirm_receipt e fica imutável.
 *
 * O id do recebimento desempata sobras de arredondamento, de modo que o
 * centavo residual não favoreça sempre o mesmo indicador.
 */
export function planReceiptConfirmation(
  receipt: ReceiptToConfirm,
  distribution: DistributionInput,
): ReceiptConfirmationPlan {
  if (receipt.status === "CONFIRMED") {
    return { ok: false, error: { code: "ALREADY_CONFIRMED" } };
  }
  if (!receipt.companyId) {
    return { ok: false, error: { code: "COMPANY_NOT_IDENTIFIED" } };
  }
  if (!receipt.receivingIndicatorId) {
    return { ok: false, error: { code: "RECEIVER_NOT_IDENTIFIED" } };
  }

  const result = calculateDistribution(distribution, { tieBreakKey: receipt.id });
  if (!result.ok) {
    return { ok: false, error: { code: "INVALID_DISTRIBUTION", distributionError: result.error } };
  }

  return {
    ok: true,
    source: result.source,
    rule: result.rule,
    allocations: allocateAmount(receipt.amount, result.shares, { tieBreakKey: receipt.id }),
  };
}
