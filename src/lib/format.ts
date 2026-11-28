import { toMoneyString, type Cents } from "@/domain/shared/money";
import { UNITS_PER_PERCENT, type PercentUnits } from "@/domain/shared/percentage";

const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * 123456 -> "R$ 1.234,56".
 * Formata a partir do texto decimal exato (sem dividir por 100 em float).
 */
export function formatCurrency(value: Cents): string {
  return currencyFormatter.format(toMoneyString(value) as Intl.StringNumericLiteral);
}

/** "99999999000272" -> "99.999.999/0002-72"; aceita também o CNPJ alfanumérico ("12ABC34501DE35" -> "12.ABC.345/01DE-35"). */
export { formatCnpj, formatCpf, formatDocument } from "@/domain/documents/document";

/** 500000 -> "50%" · 333333 -> "33,3333%" · 125000 -> "12,5%" */
export function formatPercentage(value: PercentUnits): string {
  const integerPart = Math.trunc(value / UNITS_PER_PERCENT);
  const fraction = String(value % UNITS_PER_PERCENT).padStart(4, "0").replace(/0+$/, "");
  return fraction ? `${integerPart},${fraction}%` : `${integerPart}%`;
}
