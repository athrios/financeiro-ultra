import { describe, expect, it } from "vitest";

import { formatCurrency } from "@/lib/format";

import { cents } from "./money";
import {
  MONEY_INPUT_MESSAGES,
  centsToDecimal,
  decimalToCents,
  formatMoneyInput,
  parseMoneyInput,
  type MoneyInputReason,
} from "./money-input";

function decimalOf(input: string): string {
  const result = parseMoneyInput(input);
  if (!result.ok) throw new Error(`esperava valor válido para "${input}": ${result.message}`);
  return result.decimal;
}

function reasonOf(input: string | null | undefined): MoneyInputReason {
  const result = parseMoneyInput(input);
  if (result.ok) throw new Error(`esperava erro para "${input}", veio ${result.decimal}`);
  return result.reason;
}

describe("parseMoneyInput: o que é aceito (UI 4.1.3)", () => {
  it.each([
    ["1.234,56", "1234.56"],
    ["1234,56", "1234.56"],
    ["1.234.567,89", "1234567.89"],
    ["10", "10.00"],
    ["10,5", "10.50"],
    ["10,50", "10.50"],
    ["0,01", "0.01"],
    ["0,50", "0.50"],
    ["1.234", "1234.00"],
    ["12.345", "12345.00"],
    ["1500", "1500.00"],
    ["007,5", "7.50"],
    ["  1.234,56  ", "1234.56"],
    ["R$ 1.234,56", "1234.56"],
    ["R$1.234,56", "1234.56"],
    ["999.999.999.999,99", "999999999999.99"],
  ])("%s vira %s", (input, expected) => {
    expect(decimalOf(input)).toBe(expected);
  });

  it("devolve também os centavos inteiros, sem float", () => {
    const result = parseMoneyInput("1.234,56");
    expect(result).toEqual({ ok: true, decimal: "1234.56", cents: 123456 });
    expect(parseMoneyInput("999.999.999.999,99")).toMatchObject({ cents: 99999999999999 });
  });

  it("não sofre erro de ponto flutuante (0,10 + 0,20 e valores grandes)", () => {
    expect(decimalOf("0,10")).toBe("0.10");
    expect(decimalOf("0,29")).toBe("0.29"); // 0.29 * 100 = 28.999999999999996 em float
    expect(decimalOf("1.234.567.890,12")).toBe("1234567890.12");
    expect(decimalOf("19,99")).toBe("19.99");
  });
});

describe("parseMoneyInput: o que a UI manda recusar", () => {
  it("'1234.56' (ponto como decimal) é erro, nunca centavos", () => {
    expect(reasonOf("1234.56")).toBe("INVALID_FORMAT");
    expect(reasonOf("1234.5")).toBe("INVALID_FORMAT");
    expect(reasonOf("12.3")).toBe("INVALID_FORMAT");
    expect(reasonOf("0.5")).toBe("INVALID_FORMAT");
    expect(reasonOf("1.23")).toBe("INVALID_FORMAT");
    expect(reasonOf("1.2345")).toBe("INVALID_FORMAT");
  });

  it("ponto de milhar mal agrupado ou com zero à frente é erro", () => {
    expect(reasonOf("1.23,45")).toBe("INVALID_FORMAT");
    expect(reasonOf("1.2345,00")).toBe("INVALID_FORMAT");
    expect(reasonOf("12.34.567,00")).toBe("INVALID_FORMAT");
    expect(reasonOf("0.500")).toBe("INVALID_FORMAT"); // 0,50 digitado com ponto não vira R$ 500,00
    expect(reasonOf(".500")).toBe("INVALID_FORMAT");
  });

  it("vazio, só espaços e só 'R$'", () => {
    expect(reasonOf("")).toBe("EMPTY");
    expect(reasonOf("   ")).toBe("EMPTY");
    expect(reasonOf("R$")).toBe("EMPTY");
    expect(reasonOf(null)).toBe("EMPTY");
    expect(reasonOf(undefined)).toBe("EMPTY");
  });

  it("zero e negativo", () => {
    expect(reasonOf("0")).toBe("NOT_POSITIVE");
    expect(reasonOf("0,00")).toBe("NOT_POSITIVE");
    expect(reasonOf("000")).toBe("NOT_POSITIVE");
    expect(reasonOf("-1")).toBe("NOT_POSITIVE");
    expect(reasonOf("-1.234,56")).toBe("NOT_POSITIVE");
    expect(reasonOf("-0,00")).toBe("NOT_POSITIVE");
  });

  it("mais de 2 casas decimais", () => {
    expect(reasonOf("1,234")).toBe("TOO_MANY_DECIMALS");
    expect(reasonOf("10,505")).toBe("TOO_MANY_DECIMALS");
    expect(reasonOf("0,001")).toBe("TOO_MANY_DECIMALS");
    expect(reasonOf("1,5000")).toBe("TOO_MANY_DECIMALS");
  });

  it("formato ilegível", () => {
    for (const input of ["abc", "1,2,3", "1,", ",50", "R$ R$ 1", "1 234,56", "1e3", "1,5a", "--1", "1,-5", "+10", "10,5.5", "١٢٣"]) {
      expect(reasonOf(input)).toBe("INVALID_FORMAT");
    }
  });

  it("acima do limite do banco (numeric(14,2))", () => {
    expect(reasonOf("1.000.000.000.000,00")).toBe("TOO_HIGH");
    expect(reasonOf("1000000000000")).toBe("TOO_HIGH");
    expect(reasonOf("9999999999999,99")).toBe("TOO_HIGH");
  });

  it("as mensagens são exatamente as da UI 4.1.3", () => {
    expect(MONEY_INPUT_MESSAGES).toEqual({
      EMPTY: "Informe o valor da mensalidade.",
      NOT_POSITIVE: "O valor da mensalidade precisa ser maior que zero.",
      TOO_MANY_DECIMALS: "Use no máximo 2 casas depois da vírgula.",
      INVALID_FORMAT: "Valor inválido. Use vírgula para os centavos. Exemplo: 1.234,56.",
      TOO_HIGH: "O valor é alto demais. Confira se digitou certo.",
    });
    expect(parseMoneyInput("1234.56")).toMatchObject({ ok: false, message: MONEY_INPUT_MESSAGES.INVALID_FORMAT });
  });
});

describe("formatação e conversões de leitura", () => {
  it("formatMoneyInput: texto decimal do banco -> valor do campo", () => {
    expect(formatMoneyInput("1234.56")).toBe("1.234,56");
    expect(formatMoneyInput("1500.00")).toBe("1.500,00");
    expect(formatMoneyInput("0.50")).toBe("0,50");
    expect(formatMoneyInput("999999999999.99")).toBe("999.999.999.999,99");
    expect(formatMoneyInput("12.30")).toBe("12,30");
    expect(formatMoneyInput("abc")).toBe("abc");
  });

  it("o campo reformatado volta ao mesmo valor (ida e volta)", () => {
    for (const decimal of ["0.01", "12.30", "1234.56", "100000.00", "999999999999.99"]) {
      expect(decimalOf(formatMoneyInput(decimal))).toBe(decimal);
    }
  });

  it("formatCurrency (R$) sobre os centavos lidos, sem float", () => {
    const text = (value: string) => formatCurrency(decimalToCents(value) ?? cents(0)).replace(/ /g, " ");
    expect(text("1234.56")).toBe("R$ 1.234,56");
    expect(text("1500.00")).toBe("R$ 1.500,00");
    expect(text("0.01")).toBe("R$ 0,01");
  });

  it("decimalToCents devolve null para texto que não é numeric(14,2)", () => {
    expect(decimalToCents("1234.56")).toBe(123456);
    expect(decimalToCents("1.005")).toBeNull();
    expect(decimalToCents("1234,56")).toBeNull();
    expect(decimalToCents("")).toBeNull();
  });

  it("centsToDecimal é o caminho inverso", () => {
    expect(centsToDecimal(cents(123456))).toBe("1234.56");
    expect(centsToDecimal(cents(1))).toBe("0.01");
  });
});
