import {
  calculateDistribution,
  type DistributionInput,
  type DistributionResult,
} from "@/domain/distribution";
import { isConfirmed, requiresReview, type ReceiptStatus } from "@/domain/receipts";
import { sumCents, type Cents } from "@/domain/shared/money";

import { deriveCompanyPaymentStatus, type CompanyPaymentStatus } from "./company-payment-status";

export interface OverviewCompany {
  companyId: string;
  name: string;
  normalizedCnpj: string;
  /** Snapshot da competência (não o valor atual da empresa). */
  expectedAmount: Cents;
  distribution: DistributionInput;
}

export interface OverviewReceipt {
  companyId: string | null;
  amount: Cents;
  status: ReceiptStatus;
  receivingIndicatorId: string | null;
  receivingIndicatorName: string | null;
}

export interface IndicatorRef {
  indicatorId: string;
  name: string;
}

export interface CompetencyCompanyRow {
  companyId: string;
  name: string;
  normalizedCnpj: string;
  expectedAmount: Cents;
  receivedAmount: Cents;
  /** Indicadores que receberam financeiramente (recebimentos confirmados). */
  receivers: IndicatorRef[];
  /** Indicadores econômicos, na mesma ordem dos percentuais da distribuição. */
  indicators: IndicatorRef[];
  distribution: DistributionResult;
  status: CompanyPaymentStatus;
}

const nameCollator = new Intl.Collator("pt-BR", { sensitivity: "base" });

/**
 * Monta as linhas da carteira de uma competência a partir dos dados brutos.
 * Toda regra (valor recebido, status, distribuição) é decidida aqui, no
 * domínio; os componentes apenas exibem o resultado.
 *
 * A coluna de distribuição reflete a configuração ATUAL da empresa (a que
 * seria aplicada numa nova confirmação). O que já foi confirmado está
 * congelado em receipt_allocations.
 */
export function buildCompetencyOverview(
  companies: readonly OverviewCompany[],
  receipts: readonly OverviewReceipt[],
): CompetencyCompanyRow[] {
  const receiptsByCompany = new Map<string, OverviewReceipt[]>();
  for (const receipt of receipts) {
    if (!receipt.companyId) continue;
    const list = receiptsByCompany.get(receipt.companyId) ?? [];
    list.push(receipt);
    receiptsByCompany.set(receipt.companyId, list);
  }

  return companies
    .map((company) => {
      const companyReceipts = receiptsByCompany.get(company.companyId) ?? [];
      const confirmed = companyReceipts.filter((receipt) => isConfirmed(receipt.status));
      const receivedAmount = sumCents(confirmed.map((receipt) => receipt.amount));
      const distribution = calculateDistribution(company.distribution);

      return {
        companyId: company.companyId,
        name: company.name,
        normalizedCnpj: company.normalizedCnpj,
        expectedAmount: company.expectedAmount,
        receivedAmount,
        receivers: distinctReceivers(confirmed),
        indicators: distribution.ok
          ? distribution.shares.map(({ indicatorId, name }) => ({ indicatorId, name }))
          : company.distribution.indicators
              .map(({ indicatorId, name }) => ({ indicatorId, name }))
              .sort((a, b) => nameCollator.compare(a.name, b.name)),
        distribution,
        status: deriveCompanyPaymentStatus({
          expected: company.expectedAmount,
          received: receivedAmount,
          hasReceiptsAwaitingReview: companyReceipts.some((receipt) => requiresReview(receipt.status)),
        }),
      };
    })
    .sort((a, b) => nameCollator.compare(a.name, b.name));
}

function distinctReceivers(receipts: readonly OverviewReceipt[]): IndicatorRef[] {
  const receivers = new Map<string, IndicatorRef>();
  for (const receipt of receipts) {
    if (receipt.receivingIndicatorId && !receivers.has(receipt.receivingIndicatorId)) {
      receivers.set(receipt.receivingIndicatorId, {
        indicatorId: receipt.receivingIndicatorId,
        name: receipt.receivingIndicatorName ?? "—",
      });
    }
  }
  return [...receivers.values()].sort((a, b) => nameCollator.compare(a.name, b.name));
}
