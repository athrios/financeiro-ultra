import { describe, expect, it } from "vitest";

import type { DistributionInput } from "@/domain/distribution";
import { parseMoney } from "@/domain/shared/money";

import { deriveCompanyPaymentStatus } from "./company-payment-status";
import { buildCompetencyOverview, type OverviewCompany } from "./competency-overview";
import {
  addMonths,
  currentReferenceMonth,
  formatReferenceMonth,
  parseMonthParam,
  parseReferenceDate,
  toMonthParam,
  toReferenceDate,
} from "./reference-month";

describe("reference month", () => {
  it("converte entre URL, banco e rótulo", () => {
    const october = parseMonthParam("2026-10")!;
    expect(october).toEqual({ year: 2026, month: 10 });
    expect(toReferenceDate(october)).toBe("2026-10-01");
    expect(parseReferenceDate("2026-10-01")).toEqual(october);
    expect(formatReferenceMonth(october)).toBe("Outubro de 2026");
  });

  it("rejeita valores inválidos", () => {
    expect(parseMonthParam("2026-13")).toBeNull();
    expect(parseMonthParam("2026-1")).toBeNull();
    expect(parseMonthParam(undefined)).toBeNull();
    expect(parseReferenceDate("2026-10-15")).toBeNull();
  });

  it("navega entre meses atravessando o ano", () => {
    expect(toMonthParam(addMonths({ year: 2026, month: 12 }, 1))).toBe("2027-01");
    expect(toMonthParam(addMonths({ year: 2026, month: 1 }, -1))).toBe("2025-12");
  });

  it("usa o fuso de Brasília para o mês corrente", () => {
    // 01/11/2026 01:00 UTC ainda é 31/10/2026 em Brasília
    expect(currentReferenceMonth(new Date("2026-11-01T01:00:00Z"))).toEqual({ year: 2026, month: 10 });
  });
});

describe("deriveCompanyPaymentStatus", () => {
  const expected = parseMoney("500.00");

  it("Pendente quando nada foi recebido", () => {
    expect(deriveCompanyPaymentStatus({ expected, received: parseMoney("0"), hasReceiptsAwaitingReview: false })).toBe("PENDING");
  });

  it("Parcial quando recebido < esperado", () => {
    expect(deriveCompanyPaymentStatus({ expected, received: parseMoney("200"), hasReceiptsAwaitingReview: false })).toBe("PARTIAL");
  });

  it("Pago quando recebido >= esperado", () => {
    expect(deriveCompanyPaymentStatus({ expected, received: parseMoney("500"), hasReceiptsAwaitingReview: false })).toBe("PAID");
    expect(deriveCompanyPaymentStatus({ expected, received: parseMoney("650"), hasReceiptsAwaitingReview: false })).toBe("PAID");
  });

  it("Revisão tem precedência", () => {
    expect(deriveCompanyPaymentStatus({ expected, received: parseMoney("500"), hasReceiptsAwaitingReview: true })).toBe("REVIEW");
  });
});

describe("buildCompetencyOverview", () => {
  const distribution: DistributionInput = {
    mode: "EQUAL",
    useCustomDefaultPercentages: false,
    indicators: [
      { indicatorId: "w", name: "Clara", active: true, customPercentage: null, defaultPercentage: null },
      { indicatorId: "d", name: "Bruno", active: true, customPercentage: null, defaultPercentage: null },
    ],
  };
  const companies: OverviewCompany[] = [
    { companyId: "b", name: "Beta", normalizedCnpj: "2", expectedAmount: parseMoney("300"), distribution },
    { companyId: "a", name: "Alfa", normalizedCnpj: "1", expectedAmount: parseMoney("500"), distribution },
  ];

  it("soma apenas recebimentos confirmados e lista recebedores", () => {
    const rows = buildCompetencyOverview(companies, [
      { companyId: "a", amount: parseMoney("200"), status: "CONFIRMED", receivingIndicatorId: "w", receivingIndicatorName: "Clara" },
      { companyId: "a", amount: parseMoney("100"), status: "RECEIVED", receivingIndicatorId: "d", receivingIndicatorName: "Bruno" },
      { companyId: null, amount: parseMoney("999"), status: "AWAITING_COMPANY", receivingIndicatorId: null, receivingIndicatorName: null },
    ]);

    expect(rows.map((r) => r.name)).toEqual(["Alfa", "Beta"]);
    const [alfa, beta] = rows;
    expect(alfa.receivedAmount).toBe(parseMoney("200"));
    expect(alfa.receivers).toEqual([{ indicatorId: "w", name: "Clara" }]);
    expect(alfa.status).toBe("PARTIAL");
    expect(beta.receivedAmount).toBe(0);
    expect(beta.receivers).toEqual([]);
    expect(beta.status).toBe("PENDING");
  });

  it("marca Revisão quando há comprovante aguardando definição", () => {
    const [alfa] = buildCompetencyOverview(companies, [
      { companyId: "a", amount: parseMoney("500"), status: "CONFIRMED", receivingIndicatorId: "w", receivingIndicatorName: "Clara" },
      { companyId: "a", amount: parseMoney("10"), status: "READ_ERROR", receivingIndicatorId: null, receivingIndicatorName: null },
    ]);
    expect(alfa.status).toBe("REVIEW");
  });
});
