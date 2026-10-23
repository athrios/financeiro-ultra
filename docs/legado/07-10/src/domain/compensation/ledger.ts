import { addCents, cents, negateCents, sumCents, ZERO_CENTS, type Cents } from "@/domain/shared/money";

/**
 * Tipos de lançamento da view public.financial_ledger.
 * Sinal na perspectiva do indicador:
 *   positivo = aumenta o que ele tem a RECEBER
 *   negativo = aumenta o que ele tem a PAGAR
 */
export type LedgerEntryType =
  | "ECONOMIC_RIGHT" //       +  direito econômico (receipt_allocations)
  | "DIRECT_RECEIPT" //       -  dinheiro recebido diretamente
  | "SETTLEMENT_PAID" //      +  pagou a outro indicador
  | "SETTLEMENT_RECEIVED"; // -  recebeu de outro indicador

export interface LedgerEntry {
  competencyId: string;
  /** competencies.reference_month, "YYYY-MM-01" */
  referenceMonth: string;
  indicatorId: string;
  entryType: LedgerEntryType;
  /** Valor COM sinal, como na view. */
  amount: Cents;
}

export interface IndicatorPosition {
  indicatorId: string;
  /** Saldo acumulado de todas as competências anteriores. */
  previousBalance: Cents;
  /** DIREITO_ECONOMICO: soma das alocações da competência. */
  economicRight: Cents;
  /** VALOR_RECEBIDO_DIRETAMENTE: soma dos recebimentos em que foi o recebedor. */
  directlyReceived: Cents;
  /** SALDO_COMPETENCIA = DIREITO_ECONOMICO − VALOR_RECEBIDO_DIRETAMENTE. */
  competencyBalance: Cents;
  /** Liquidações da competência: pagas − recebidas. */
  settlementsNet: Cents;
  /** previousBalance + competencyBalance + settlementsNet. */
  currentBalance: Cents;
}

export type BalanceDirection = "RECEIVE" | "PAY" | "SETTLED";

/** positivo = deve receber · negativo = deve pagar · zero = equilibrado */
export function balanceDirection(balance: Cents): BalanceDirection {
  if (balance > 0) return "RECEIVE";
  if (balance < 0) return "PAY";
  return "SETTLED";
}

/**
 * Posição de cada indicador em uma competência, derivada exclusivamente do
 * ledger (nenhum saldo é armazenado):
 *
 *   saldo atual = saldo acumulado anterior
 *               + movimento da competência (direito − recebido)
 *               + liquidações realizadas na competência
 */
export function computeIndicatorPositions(
  entries: readonly LedgerEntry[],
  referenceMonth: string,
): IndicatorPosition[] {
  const positions = new Map<string, IndicatorPosition>();

  const positionOf = (indicatorId: string): IndicatorPosition => {
    let position = positions.get(indicatorId);
    if (!position) {
      position = {
        indicatorId,
        previousBalance: ZERO_CENTS,
        economicRight: ZERO_CENTS,
        directlyReceived: ZERO_CENTS,
        competencyBalance: ZERO_CENTS,
        settlementsNet: ZERO_CENTS,
        currentBalance: ZERO_CENTS,
      };
      positions.set(indicatorId, position);
    }
    return position;
  };

  for (const entry of entries) {
    if (entry.referenceMonth > referenceMonth) continue;
    const position = positionOf(entry.indicatorId);

    if (entry.referenceMonth < referenceMonth) {
      position.previousBalance = addCents(position.previousBalance, entry.amount);
      continue;
    }

    switch (entry.entryType) {
      case "ECONOMIC_RIGHT":
        position.economicRight = addCents(position.economicRight, entry.amount);
        break;
      case "DIRECT_RECEIPT":
        position.directlyReceived = addCents(position.directlyReceived, negateCents(entry.amount));
        break;
      case "SETTLEMENT_PAID":
      case "SETTLEMENT_RECEIVED":
        position.settlementsNet = addCents(position.settlementsNet, entry.amount);
        break;
    }
  }

  return [...positions.values()].map((position) => {
    const competencyBalance = cents(position.economicRight - position.directlyReceived);
    return {
      ...position,
      competencyBalance,
      currentBalance: sumCents([position.previousBalance, competencyBalance, position.settlementsNet]),
    };
  });
}

/**
 * Invariante: em qualquer competência, a soma dos saldos de todos os
 * indicadores é zero (considerando apenas recebimentos confirmados).
 * Retorna o desequilíbrio encontrado — zero quando íntegro.
 */
export function ledgerImbalance(positions: readonly IndicatorPosition[]): {
  competencyBalance: Cents;
  currentBalance: Cents;
} {
  return {
    competencyBalance: sumCents(positions.map((p) => p.competencyBalance)),
    currentBalance: sumCents(positions.map((p) => p.currentBalance)),
  };
}
