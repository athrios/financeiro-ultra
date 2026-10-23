import { describe, expect, it } from "vitest";

import type { DistributionInput } from "@/domain/distribution";
import { parseMoney, sumCents } from "@/domain/shared/money";
import { parsePercentage } from "@/domain/shared/percentage";

import { planReceiptConfirmation, type ReceiptToConfirm } from "./plan-receipt-confirmation";
import { requiresReview } from "./receipt-status";

const distribution: DistributionInput = {
  mode: "CUSTOM",
  useCustomDefaultPercentages: false,
  indicators: [
    { indicatorId: "w", name: "Clara", active: true, customPercentage: parsePercentage("70"), defaultPercentage: null },
    { indicatorId: "c", name: "Alice", active: true, customPercentage: parsePercentage("30"), defaultPercentage: null },
  ],
};

const receipt: ReceiptToConfirm = {
  id: "r1",
  amount: parseMoney("1200.00"),
  status: "AWAITING_CONFIRMATION",
  companyId: "company",
  receivingIndicatorId: "w",
};

describe("planReceiptConfirmation", () => {
  it("gera o snapshot com valores que somam o recebimento", () => {
    const plan = planReceiptConfirmation(receipt, distribution);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.source).toBe("COMPANY_CUSTOM");
    expect(plan.allocations.map((a) => [a.indicatorId, a.amount])).toEqual([
      ["w", parseMoney("840.00")],
      ["c", parseMoney("360.00")],
    ]);
    expect(sumCents(plan.allocations.map((a) => a.amount))).toBe(receipt.amount);
  });

  it("exige empresa e recebedor identificados", () => {
    expect(planReceiptConfirmation({ ...receipt, companyId: null }, distribution)).toEqual({
      ok: false,
      error: { code: "COMPANY_NOT_IDENTIFIED" },
    });
    expect(planReceiptConfirmation({ ...receipt, receivingIndicatorId: null }, distribution)).toEqual({
      ok: false,
      error: { code: "RECEIVER_NOT_IDENTIFIED" },
    });
  });

  it("não reconfirma recebimento confirmado", () => {
    expect(planReceiptConfirmation({ ...receipt, status: "CONFIRMED" }, distribution)).toEqual({
      ok: false,
      error: { code: "ALREADY_CONFIRMED" },
    });
  });

  it("propaga distribuição inválida", () => {
    const plan = planReceiptConfirmation(receipt, { ...distribution, indicators: [] });
    expect(plan).toEqual({
      ok: false,
      error: { code: "INVALID_DISTRIBUTION", distributionError: { code: "NO_INDICATORS" } },
    });
  });
});

describe("requiresReview", () => {
  it("considera apenas os estados que aguardam definição", () => {
    expect(requiresReview("AWAITING_RECEIVER")).toBe(true);
    expect(requiresReview("AWAITING_COMPANY")).toBe(true);
    expect(requiresReview("AWAITING_CONFIRMATION")).toBe(true);
    expect(requiresReview("READ_ERROR")).toBe(true);
    expect(requiresReview("RECEIVED")).toBe(false);
    expect(requiresReview("PROCESSING")).toBe(false);
    expect(requiresReview("CONFIRMED")).toBe(false);
  });
});
