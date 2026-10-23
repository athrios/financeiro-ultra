import { describe, expect, it } from "vitest";

import { cents, parseMoney, sumCents } from "@/domain/shared/money";
import { FULL_PERCENT, parsePercentage, sumPercentages } from "@/domain/shared/percentage";

import { allocateAmount } from "./allocate-amount";
import { apportion, tieBreakOrder } from "./apportion";
import { calculateDistribution } from "./calculate-distribution";
import type { DistributionIndicator, DistributionInput } from "./types";

const pct = parsePercentage;

function indicator(
  indicatorId: string,
  overrides: Partial<DistributionIndicator> = {},
): DistributionIndicator {
  return {
    indicatorId,
    name: indicatorId,
    active: true,
    customPercentage: null,
    defaultPercentage: null,
    ...overrides,
  };
}

const clara = (o: Partial<DistributionIndicator> = {}) =>
  indicator("clara", { name: "Clara", defaultPercentage: pct("50"), ...o });
const bruno = (o: Partial<DistributionIndicator> = {}) =>
  indicator("bruno", { name: "Bruno", defaultPercentage: pct("25"), ...o });
const alice = (o: Partial<DistributionIndicator> = {}) =>
  indicator("alice", { name: "Alice", defaultPercentage: pct("25"), ...o });

function input(overrides: Partial<DistributionInput>): DistributionInput {
  return { mode: "INHERIT", useCustomDefaultPercentages: false, indicators: [], ...overrides };
}

describe("apportion (maior resto)", () => {
  it("reparte exatamente o total", () => {
    const result = apportion(100, [
      { key: "a", weight: 1 },
      { key: "b", weight: 1 },
      { key: "c", weight: 1 },
    ], ["a", "b", "c"]);
    expect([...result.values()].reduce((s, v) => s + v, 0)).toBe(100);
    expect(result.get("a")).toBe(34);
    expect(result.get("b")).toBe(33);
  });

  it("respeita a ordem de desempate", () => {
    const result = apportion(1, [
      { key: "a", weight: 1 },
      { key: "b", weight: 1 },
    ], ["b", "a"]);
    expect(result.get("b")).toBe(1);
    expect(result.get("a")).toBe(0);
  });

  it("mantém soma exata e desvio < 1 unidade em casos aleatórios", () => {
    let seed = 42;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let run = 0; run < 500; run++) {
      const total = Math.floor(random() * 10_000_000);
      const items = Array.from({ length: 1 + Math.floor(random() * 6) }, (_, i) => ({
        key: `k${i}`,
        weight: 1 + Math.floor(random() * 1_000_000),
      }));
      const weightSum = items.reduce((s, i) => s + i.weight, 0);
      const result = apportion(total, items, items.map((i) => i.key));
      expect([...result.values()].reduce((s, v) => s + v, 0)).toBe(total);
      for (const item of items) {
        const exact = (total * item.weight) / weightSum;
        expect(Math.abs(result.get(item.key)! - exact)).toBeLessThan(1);
      }
    }
  });

  it("tieBreakOrder é determinístico por semente", () => {
    const keys = ["a", "b", "c"];
    expect(tieBreakOrder(keys, "receipt-1")).toEqual(tieBreakOrder(keys, "receipt-1"));
    expect(tieBreakOrder(keys)).toEqual(keys);
  });
});

describe("calculateDistribution — hierarquia", () => {
  it("CUSTOM usa os percentuais da empresa", () => {
    const result = calculateDistribution(
      input({
        mode: "CUSTOM",
        useCustomDefaultPercentages: true,
        indicators: [
          clara({ customPercentage: pct("40") }),
          bruno({ customPercentage: pct("60") }),
        ],
      }),
    );
    expect(result).toMatchObject({ ok: true, source: "COMPANY_CUSTOM", rule: "COMPANY_CUSTOM" });
    if (!result.ok) throw new Error();
    expect(result.shares.map((s) => [s.name, s.percentage])).toEqual([
      ["Bruno", pct("60")],
      ["Clara", pct("40")],
    ]);
  });

  it("CUSTOM que não soma 100% é rejeitado, nunca normalizado", () => {
    const result = calculateDistribution(
      input({
        mode: "CUSTOM",
        indicators: [
          clara({ customPercentage: pct("33.3333") }),
          bruno({ customPercentage: pct("33.3333") }),
          alice({ customPercentage: pct("33.3333") }),
        ],
      }),
    );
    expect(result).toEqual({
      ok: false,
      error: { code: "CUSTOM_PERCENTAGES_DO_NOT_SUM_100", total: pct("99.9999") },
    });
  });

  it("CUSTOM com percentual ausente é rejeitado", () => {
    const result = calculateDistribution(
      input({
        mode: "CUSTOM",
        indicators: [clara({ customPercentage: pct("100") }), bruno()],
      }),
    );
    expect(result).toEqual({
      ok: false,
      error: { code: "CUSTOM_PERCENTAGE_MISSING", indicatorIds: ["bruno"] },
    });
  });

  it("EQUAL explícito divide igualmente e ignora percentuais", () => {
    const result = calculateDistribution(
      input({
        mode: "EQUAL",
        useCustomDefaultPercentages: true,
        indicators: [clara({ customPercentage: pct("90") }), bruno(), alice()],
      }),
    );
    expect(result).toMatchObject({ ok: true, source: "EQUAL", rule: "COMPANY_EQUAL" });
    if (!result.ok) throw new Error();
    expect(sumPercentages(result.shares.map((s) => s.percentage))).toBe(FULL_PERCENT);
    expect(result.shares.map((s) => s.percentage).sort()).toEqual([333333, 333333, 333334]);
  });

  it("INHERIT com padrão desativado -> igualitária", () => {
    const result = calculateDistribution(
      input({ useCustomDefaultPercentages: false, indicators: [clara(), bruno(), alice()] }),
    );
    expect(result).toMatchObject({ ok: true, source: "EQUAL", rule: "INHERIT_EQUAL" });
  });

  it("INHERIT com padrão válido para o conjunto -> percentual padrão", () => {
    const result = calculateDistribution(
      input({ useCustomDefaultPercentages: true, indicators: [alice(), bruno(), clara()] }),
    );
    expect(result).toMatchObject({
      ok: true,
      source: "DEFAULT_PERCENTAGE",
      rule: "INHERIT_DEFAULT_PERCENTAGE",
    });
    if (!result.ok) throw new Error();
    expect(result.shares.map((s) => [s.name, s.percentage])).toEqual([
      ["Clara", pct("50")],
      ["Alice", pct("25")],
      ["Bruno", pct("25")],
    ]);
  });

  it("INHERIT com subconjunto do padrão NÃO reescala (50+25 -> igualitária)", () => {
    const result = calculateDistribution(
      input({ useCustomDefaultPercentages: true, indicators: [clara(), bruno()] }),
    );
    expect(result).toMatchObject({
      ok: true,
      source: "EQUAL",
      rule: "INHERIT_EQUAL_FALLBACK",
      fallbackReason: "DEFAULTS_DO_NOT_SUM_100",
    });
    if (!result.ok) throw new Error();
    expect(result.shares.map((s) => s.percentage)).toEqual([pct("50"), pct("50")]);
  });

  it("INHERIT com indicador sem percentual padrão -> igualitária", () => {
    const result = calculateDistribution(
      input({
        useCustomDefaultPercentages: true,
        indicators: [clara({ defaultPercentage: pct("100") }), bruno({ defaultPercentage: null })],
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      rule: "INHERIT_EQUAL_FALLBACK",
      fallbackReason: "MISSING_DEFAULT_PERCENTAGE",
    });
  });

  it("rejeita empresa sem indicadores", () => {
    expect(calculateDistribution(input({ indicators: [] }))).toEqual({
      ok: false,
      error: { code: "NO_INDICATORS" },
    });
  });

  it("rejeita indicador inativo em vez de redistribuir", () => {
    const result = calculateDistribution(
      input({ mode: "EQUAL", indicators: [clara(), bruno({ active: false })] }),
    );
    expect(result).toEqual({
      ok: false,
      error: { code: "INACTIVE_INDICATOR", indicatorIds: ["bruno"] },
    });
  });
});

describe("allocateAmount", () => {
  it("exemplo da especificação: R$ 1.000 em 50/25/25", () => {
    const result = calculateDistribution(
      input({ useCustomDefaultPercentages: true, indicators: [clara(), bruno(), alice()] }),
    );
    if (!result.ok) throw new Error();
    const allocations = allocateAmount(parseMoney("1000.00"), result.shares);
    expect(allocations.map((a) => [a.name, a.amount])).toEqual([
      ["Clara", parseMoney("500.00")],
      ["Alice", parseMoney("250.00")],
      ["Bruno", parseMoney("250.00")],
    ]);
  });

  it("a soma das parcelas é sempre exatamente o valor recebido", () => {
    const result = calculateDistribution(
      input({ mode: "EQUAL", indicators: [clara(), bruno(), alice()] }),
    );
    if (!result.ok) throw new Error();
    for (const value of ["100.00", "0.01", "0.02", "333.33", "1000.01", "999999999999.99"]) {
      const amount = parseMoney(value);
      const allocations = allocateAmount(amount, result.shares);
      expect(sumCents(allocations.map((a) => a.amount))).toBe(amount);
    }
  });

  it("centavo residual não favorece sempre o mesmo indicador", () => {
    const winners = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const receiptId = `receipt-${i}`;
      const result = calculateDistribution(
        input({ mode: "EQUAL", indicators: [clara(), bruno(), alice()] }),
        { tieBreakKey: receiptId },
      );
      if (!result.ok) throw new Error();
      const allocations = allocateAmount(cents(100), result.shares, { tieBreakKey: receiptId });
      winners.add(allocations.find((a) => a.amount === 34)!.indicatorId);
    }
    expect(winners.size).toBe(3);
  });

  it("rejeita percentuais que não somam 100%", () => {
    expect(() =>
      allocateAmount(cents(100), [{ indicatorId: "a", name: "A", percentage: pct("99") }]),
    ).toThrow();
  });
});
