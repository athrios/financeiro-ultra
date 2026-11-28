import { InvalidMoneyError, parseMoney, toMoneyString, type Cents } from "./money";

/**
 * Valor digitado em reais ("1.234,56") -> texto decimal exato ("1234.56"), sem float.
 *
 * Regras da UI da CAD-001 (03-ui-ux.md, 4.1.3), espelhadas só para a mensagem do campo; o banco
 * (`private.to_money` + `clients_monthly_value_positive`) é a autoridade:
 *  - a VÍRGULA separa os centavos; o PONTO só vale como separador de MILHARES (grupos de três);
 *  - "1234.56" NÃO é lido como centavos: é erro, para ninguém gravar R$ 123.456,00 achando que
 *    eram R$ 1.234,56;
 *  - vazio, zero e negativo, mais de 2 casas, formato ilegível e acima do limite são recusados.
 *
 * Também tolera o prefixo "R$" e espaços nas pontas (colar "R$ 1.234,56" funciona). Nunca usa
 * `parseFloat`, `Number` sobre o valor decimal nem divisão: tudo é texto e inteiros.
 */

export type MoneyInputReason = "EMPTY" | "NOT_POSITIVE" | "TOO_MANY_DECIMALS" | "INVALID_FORMAT" | "TOO_HIGH";

/** Mensagens exatas da UI 4.1.3. */
export const MONEY_INPUT_MESSAGES: Readonly<Record<MoneyInputReason, string>> = {
  EMPTY: "Informe o valor da mensalidade.",
  NOT_POSITIVE: "O valor da mensalidade precisa ser maior que zero.",
  TOO_MANY_DECIMALS: "Use no máximo 2 casas depois da vírgula.",
  INVALID_FORMAT: "Valor inválido. Use vírgula para os centavos. Exemplo: 1.234,56.",
  TOO_HIGH: "O valor é alto demais. Confira se digitou certo.",
};

export type MoneyInputResult =
  /** `decimal` é o texto decimal exato para o banco ("1234.56"); `cents` serve a contas internas. */
  | { ok: true; decimal: string; cents: Cents }
  | { ok: false; reason: MoneyInputReason; message: string };

/** numeric(14,2): até 12 dígitos inteiros (teto 999.999.999.999,99). */
const MAX_INTEGER_DIGITS = 12;

/**
 * Inteiro com milhares opcionais: "1", "1234" ou "1.234.567" (primeiro grupo de 1 a 3 dígitos, sem
 * zero à frente: "0.500" não é lido como 500, para ninguém trocar 0,50 por R$ 500,00).
 */
const INTEGER_PATTERN = /^(?:\d+|[1-9]\d{0,2}(?:\.\d{3})+)$/;

function failure(reason: MoneyInputReason): MoneyInputResult {
  return { ok: false, reason, message: MONEY_INPUT_MESSAGES[reason] };
}

export function parseMoneyInput(raw: string | null | undefined): MoneyInputResult {
  let text = (raw ?? "").trim();
  if (/^R\$/i.test(text)) text = text.slice(2).trim();
  if (text === "") return failure("EMPTY");

  // Sinal: "-10" é "menor que zero" (UI 4.1.3), desde que o resto seja um valor legível.
  if (text.startsWith("-")) {
    const unsigned = text.slice(1);
    if (unsigned.trimStart().startsWith("-")) return failure("INVALID_FORMAT");
    const rest = parseMoneyInput(unsigned);
    return rest.ok || rest.reason === "NOT_POSITIVE" ? failure("NOT_POSITIVE") : rest;
  }

  const parts = text.split(",");
  if (parts.length > 2) return failure("INVALID_FORMAT");
  const [integerText, fractionText] = parts;

  if (!INTEGER_PATTERN.test(integerText)) return failure("INVALID_FORMAT");
  if (fractionText !== undefined && !/^\d+$/.test(fractionText)) return failure("INVALID_FORMAT");
  if (fractionText !== undefined && fractionText.length > 2) return failure("TOO_MANY_DECIMALS");

  const integerDigits = integerText.replaceAll(".", "").replace(/^0+(?=\d)/, "");
  if (integerDigits.length > MAX_INTEGER_DIGITS) return failure("TOO_HIGH");

  const decimal = `${integerDigits}.${(fractionText ?? "").padEnd(2, "0")}`;
  let cents: Cents;
  try {
    cents = parseMoney(decimal);
  } catch (error) {
    if (error instanceof InvalidMoneyError) return failure("INVALID_FORMAT");
    throw error;
  }
  if (cents <= 0) return failure("NOT_POSITIVE");
  return { ok: true, decimal, cents };
}

/**
 * Texto decimal do banco ("1234.56", "1500.00") -> valor do campo ("1.234,56"), sem float.
 * Valor fora do formato devolve o texto como veio.
 */
export function formatMoneyInput(decimal: string): string {
  const match = /^(\d+)\.(\d{2})$/.exec(decimal.trim());
  if (!match) return decimal;
  const integerDigits = match[1].replace(/^0+(?=\d)/, "");
  return `${integerDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${match[2]}`;
}

/** Texto decimal -> centavos, ou null quando não for um valor numeric(14,2) válido. Só leitura. */
export function decimalToCents(decimal: string): Cents | null {
  try {
    return parseMoney(decimal);
  } catch (error) {
    if (error instanceof InvalidMoneyError) return null;
    throw error;
  }
}

/** Centavos -> texto decimal para enviar ao banco (reexporta `toMoneyString`, que nunca usa float). */
export function centsToDecimal(value: Cents): string {
  return toMoneyString(value);
}
