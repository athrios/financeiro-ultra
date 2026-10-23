/**
 * Mês de referência de uma competência.
 * No banco: competencies.reference_month = primeiro dia do mês (2026-10-01).
 * Na URL:   ?competencia=2026-10
 */
export interface ReferenceMonth {
  readonly year: number;
  /** 1 a 12 */
  readonly month: number;
}

const MONTH_PARAM = /^(\d{4})-(\d{2})$/;
const ISO_FIRST_DAY = /^(\d{4})-(\d{2})-01$/;

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

function build(year: number, month: number): ReferenceMonth | null {
  if (!Number.isInteger(year) || year < 2000 || year > 2999 || month < 1 || month > 12) {
    return null;
  }
  return { year, month };
}

/** "2026-10" -> { year: 2026, month: 10 } */
export function parseMonthParam(value: string | null | undefined): ReferenceMonth | null {
  const match = value ? MONTH_PARAM.exec(value) : null;
  return match ? build(Number(match[1]), Number(match[2])) : null;
}

/** "2026-10-01" -> { year: 2026, month: 10 }. Rejeita datas que não sejam dia 1. */
export function parseReferenceDate(value: string): ReferenceMonth | null {
  const match = ISO_FIRST_DAY.exec(value);
  return match ? build(Number(match[1]), Number(match[2])) : null;
}

/** { 2026, 10 } -> "2026-10" */
export function toMonthParam(reference: ReferenceMonth): string {
  return `${reference.year}-${String(reference.month).padStart(2, "0")}`;
}

/** { 2026, 10 } -> "2026-10-01" (valor de competencies.reference_month) */
export function toReferenceDate(reference: ReferenceMonth): string {
  return `${toMonthParam(reference)}-01`;
}

export function addMonths(reference: ReferenceMonth, delta: number): ReferenceMonth {
  const zeroBased = reference.year * 12 + (reference.month - 1) + delta;
  return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 };
}

/** Mês corrente no fuso informado (padrão: horário de Brasília). */
export function currentReferenceMonth(now: Date, timeZone = "America/Sao_Paulo"): ReferenceMonth {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return { year, month };
}

/** { 2026, 10 } -> "Outubro de 2026" */
export function formatReferenceMonth(reference: ReferenceMonth): string {
  return `${MONTH_NAMES[reference.month - 1]} de ${reference.year}`;
}
