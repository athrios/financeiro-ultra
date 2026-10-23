import { describe, expect, it } from "vitest";

import { cents, parseMoney, sumCents, toMoneyString } from "./money";
import { FULL_PERCENT, parsePercentage, toPercentageString } from "./percentage";

describe("parseMoney", () => {
  it("converte texto decimal em centavos exatos", () => {
    expect(parseMoney("1234.56")).toBe(123456);
    expect(parseMoney("0.5")).toBe(50);
    expect(parseMoney("10")).toBe(1000);
    expect(parseMoney("0.10")).toBe(10);
    expect(parseMoney("-12.30")).toBe(-1230);
    expect(parseMoney("999999999999.99")).toBe(99999999999999);
  });

  it("não sofre erro de ponto flutuante", () => {
    // 0.1 + 0.2 !== 0.3 em float; em centavos é exato
    expect(sumCents([parseMoney("0.1"), parseMoney("0.2")])).toBe(parseMoney("0.3"));
  });

  it("rejeita mais de 2 casas decimais em vez de arredondar", () => {
    expect(() => parseMoney("1.005")).toThrow(/2 casas/);
  });

  it("rejeita formatos inválidos e valores acima de numeric(14,2)", () => {
    expect(() => parseMoney("1,50")).toThrow();
    expect(() => parseMoney("abc")).toThrow();
    expect(() => parseMoney("1000000000000.00")).toThrow(/numeric/);
  });
});

describe("toMoneyString", () => {
  it("faz o caminho inverso de parseMoney", () => {
    for (const value of ["0.00", "0.01", "1.10", "1234.56", "-5.07", "999999999999.99"]) {
      expect(toMoneyString(parseMoney(value))).toBe(value);
    }
  });

  it("rejeita centavos não inteiros", () => {
    expect(() => cents(1.5)).toThrow();
  });
});

describe("parsePercentage", () => {
  it("converte para unidades de 0,0001%", () => {
    expect(parsePercentage("100")).toBe(FULL_PERCENT);
    expect(parsePercentage("33.3333")).toBe(333333);
    expect(parsePercentage("50.0000")).toBe(500000);
    expect(parsePercentage("0.0001")).toBe(1);
  });

  it("rejeita precisão acima de numeric(7,4) e valores acima de 100%", () => {
    expect(() => parsePercentage("33.33335")).toThrow(/4 casas/);
    expect(() => parsePercentage("100.0001")).toThrow(/100%/);
    expect(() => parsePercentage("-1")).toThrow();
  });

  it("faz o caminho inverso com toPercentageString", () => {
    expect(toPercentageString(parsePercentage("33.3333"))).toBe("33.3333");
    expect(toPercentageString(parsePercentage("25"))).toBe("25.0000");
  });
});
