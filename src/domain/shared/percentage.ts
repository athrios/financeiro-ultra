/**
 * Percentuais em UNIDADES de 0,0001% — a mesma escala de numeric(7,4).
 *
 *   100%      = 1_000_000 unidades
 *   33,3333%  =   333_333 unidades
 *
 * Toda aritmética de percentual é inteira; o texto decimal só aparece na
 * fronteira com o banco ("33.3333") e na formatação para a interface.
 */
export type PercentUnits = number & { readonly __unit: "percent-units" };

/** Unidades por 1%. */
export const UNITS_PER_PERCENT = 10_000;

const DECIMAL_PATTERN = /^(\d+)(?:\.(\d+))?$/;

export class InvalidPercentageError extends Error {
  constructor(value: unknown, reason: string) {
    super(`Percentual inválido (${String(value)}): ${reason}`);
    this.name = "InvalidPercentageError";
  }
}

export function percentUnits(value: number): PercentUnits {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new InvalidPercentageError(value, "unidades devem ser inteiro não negativo");
  }
  return value as PercentUnits;
}

export const ZERO_PERCENT = percentUnits(0);
export const FULL_PERCENT = percentUnits(100 * UNITS_PER_PERCENT);

/**
 * "33.3333" -> 333333. Rejeita mais de 4 casas decimais em vez de arredondar
 * (percentuais nunca são normalizados silenciosamente).
 */
export function parsePercentage(value: string): PercentUnits {
  const match = DECIMAL_PATTERN.exec(value.trim());
  if (!match) {
    throw new InvalidPercentageError(value, "formato esperado 0.0000");
  }
  const [, integerPart, fractionPart = ""] = match;
  if (fractionPart.length > 4) {
    throw new InvalidPercentageError(value, "mais de 4 casas decimais");
  }
  const units = Number(integerPart) * UNITS_PER_PERCENT + Number(fractionPart.padEnd(4, "0"));
  if (units > FULL_PERCENT) {
    throw new InvalidPercentageError(value, "acima de 100%");
  }
  return percentUnits(units);
}

/** 333333 -> "33.3333" (formato aceito pelo Postgres). */
export function toPercentageString(value: PercentUnits): string {
  const integerPart = Math.trunc(value / UNITS_PER_PERCENT);
  const fractionPart = String(value % UNITS_PER_PERCENT).padStart(4, "0");
  return `${integerPart}.${fractionPart}`;
}

export function sumPercentages(values: Iterable<PercentUnits>): PercentUnits {
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return percentUnits(total);
}
