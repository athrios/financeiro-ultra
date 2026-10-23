import { cents, type Cents } from "@/domain/shared/money";
import { FULL_PERCENT, sumPercentages } from "@/domain/shared/percentage";

import { apportion, tieBreakOrder } from "./apportion";
import type { AmountAllocation, DistributionShare } from "./types";

export interface AllocateAmountOptions {
  /** Chave de desempate dos centavos residuais (ex.: id do recebimento). */
  tieBreakKey?: string;
}

/**
 * Converte percentuais em valores: reparte `amount` (centavos) entre as
 * cotas pelo maior resto. A soma das parcelas é sempre exatamente `amount`.
 */
export function allocateAmount(
  amount: Cents,
  shares: readonly DistributionShare[],
  options: AllocateAmountOptions = {},
): AmountAllocation[] {
  if (amount < 0) {
    throw new RangeError("Não é possível distribuir valor negativo.");
  }
  if (shares.length === 0) {
    throw new RangeError("Distribuição sem indicadores.");
  }
  const total = sumPercentages(shares.map((share) => share.percentage));
  if (total !== FULL_PERCENT) {
    throw new RangeError(`Percentuais somam ${total} unidades; esperado ${FULL_PERCENT}.`);
  }

  const keys = shares.map((share) => share.indicatorId);
  const split = apportion(
    amount,
    shares.map((share) => ({ key: share.indicatorId, weight: share.percentage })),
    tieBreakOrder(keys, options.tieBreakKey),
  );

  return shares.map((share) => ({ ...share, amount: cents(split.get(share.indicatorId) ?? 0) }));
}
