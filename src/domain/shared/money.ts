/**
 * Valores monetários em CENTAVOS inteiros.
 *
 * O banco armazena numeric(14,2). A aplicação nunca converte esses valores
 * para float: lê o texto decimal ("1234.56"), converte para centavos inteiros
 * (123456) e devolve texto decimal ao gravar. Somas e rateios são feitos sobre
 * inteiros, sem erro de ponto flutuante.
 */
export type Cents = number & { readonly __unit: "cents" };

const DECIMAL_PATTERN = /^(-)?(\d+)(?:\.(\d+))?$/;

/** numeric(14,2): até 12 dígitos inteiros. */
const MAX_INTEGER_DIGITS = 12;

export class InvalidMoneyError extends Error {
  constructor(value: unknown, reason: string) {
    super(`Valor monetário inválido (${String(value)}): ${reason}`);
    this.name = "InvalidMoneyError";
  }
}

export function cents(value: number): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new InvalidMoneyError(value, "centavos devem ser um inteiro seguro");
  }
  return value as Cents;
}

export const ZERO_CENTS = cents(0);

/**
 * Converte texto decimal ("1234.56", "10", "0.5") em centavos.
 * Rejeita mais de 2 casas decimais em vez de arredondar.
 */
export function parseMoney(value: string): Cents {
  const match = DECIMAL_PATTERN.exec(value.trim());
  if (!match) {
    throw new InvalidMoneyError(value, "formato esperado 0000.00");
  }

  const [, sign, integerPart, fractionPart = ""] = match;
  if (fractionPart.length > 2) {
    throw new InvalidMoneyError(value, "mais de 2 casas decimais");
  }
  const integerDigits = integerPart.replace(/^0+(?=\d)/, "");
  if (integerDigits.length > MAX_INTEGER_DIGITS) {
    throw new InvalidMoneyError(value, "excede numeric(14,2)");
  }

  const total = Number(integerDigits) * 100 + Number(fractionPart.padEnd(2, "0"));
  return cents(sign && total !== 0 ? -total : total);
}

/** 123456 -> "1234.56" (formato aceito pelo Postgres). */
export function toMoneyString(value: Cents): string {
  const negative = value < 0;
  const absolute = Math.abs(value);
  const integerPart = Math.trunc(absolute / 100);
  const fractionPart = String(absolute % 100).padStart(2, "0");
  return `${negative ? "-" : ""}${integerPart}.${fractionPart}`;
}

export function addCents(a: Cents, b: Cents): Cents {
  return cents(a + b);
}

export function subtractCents(a: Cents, b: Cents): Cents {
  return cents(a - b);
}

export function negateCents(value: Cents): Cents {
  return cents(value === 0 ? 0 : -value);
}

export function sumCents(values: Iterable<Cents>): Cents {
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return cents(total);
}
