import { describe, expect, it } from "vitest";

import { cents, parseMoney } from "@/domain/shared/money";

import { balanceDirection, computeIndicatorPositions, ledgerImbalance, type LedgerEntry } from "./ledger";

const SEP = "2026-09-01";
const OCT = "2026-10-01";

function entry(referenceMonth: string, indicatorId: string, entryType: LedgerEntry["entryType"], amount: string): LedgerEntry {
  return { competencyId: referenceMonth, referenceMonth, indicatorId, entryType, amount: parseMoney(amount) };
}

// Recebimento de R$ 1.000 recebido por Clara, distribuído 50/25/25.
const septemberReceipt: LedgerEntry[] = [
  entry(SEP, "clara", "ECONOMIC_RIGHT", "500.00"),
  entry(SEP, "bruno", "ECONOMIC_RIGHT", "250.00"),
  entry(SEP, "alice", "ECONOMIC_RIGHT", "250.00"),
  entry(SEP, "clara", "DIRECT_RECEIPT", "-1000.00"),
];

function byIndicator(entries: LedgerEntry[], month: string) {
  return Object.fromEntries(computeIndicatorPositions(entries, month).map((p) => [p.indicatorId, p]));
}

describe("computeIndicatorPositions", () => {
  it("saldo da competência = direito econômico − recebido diretamente", () => {
    const positions = byIndicator(septemberReceipt, SEP);
    expect(positions.clara.economicRight).toBe(parseMoney("500"));
    expect(positions.clara.directlyReceived).toBe(parseMoney("1000"));
    expect(positions.clara.competencyBalance).toBe(parseMoney("-500"));
    expect(positions.bruno.competencyBalance).toBe(parseMoney("250"));
    expect(positions.alice.competencyBalance).toBe(parseMoney("250"));
    expect(balanceDirection(positions.clara.competencyBalance)).toBe("PAY");
    expect(balanceDirection(positions.bruno.competencyBalance)).toBe("RECEIVE");
  });

  it("a soma dos saldos da competência é zero", () => {
    const positions = computeIndicatorPositions(septemberReceipt, SEP);
    expect(ledgerImbalance(positions)).toEqual({ competencyBalance: 0, currentBalance: 0 });
  });

  it("liquidação parcial reduz o saldo e o restante é levado adiante", () => {
    const entries = [
      ...septemberReceipt,
      // Clara transferiu R$ 250 para Bruno
      entry(SEP, "clara", "SETTLEMENT_PAID", "250.00"),
      entry(SEP, "bruno", "SETTLEMENT_RECEIVED", "-250.00"),
    ];

    const september = byIndicator(entries, SEP);
    expect(september.clara.currentBalance).toBe(parseMoney("-250"));
    expect(september.bruno.currentBalance).toBe(0);
    expect(september.alice.currentBalance).toBe(parseMoney("250"));
    expect(balanceDirection(september.bruno.currentBalance)).toBe("SETTLED");

    // Outubro sem movimento: o saldo acumulado anterior é o saldo atual.
    const october = byIndicator(entries, OCT);
    expect(october.clara.previousBalance).toBe(parseMoney("-250"));
    expect(october.clara.competencyBalance).toBe(0);
    expect(october.clara.currentBalance).toBe(parseMoney("-250"));
    expect(october.alice.currentBalance).toBe(parseMoney("250"));
    expect(ledgerImbalance(Object.values(october)).currentBalance).toBe(cents(0));
  });

  it("ignora competências posteriores à consultada", () => {
    const positions = byIndicator([...septemberReceipt, entry(OCT, "bruno", "ECONOMIC_RIGHT", "10.00")], SEP);
    expect(positions.bruno.currentBalance).toBe(parseMoney("250"));
  });
});
