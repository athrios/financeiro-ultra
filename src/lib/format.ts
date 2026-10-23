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

/** "11222333000181" -> "11.222.333/0001-81" */
export function formatCnpj(normalizedCnpj: string): string {
  const match = /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/.exec(normalizedCnpj);
  return match ? `${match[1]}.${match[2]}.${match[3]}/${match[4]}-${match[5]}` : normalizedCnpj;
}

/** 500000 -> "50%" · 333333 -> "33,3333%" · 125000 -> "12,5%" */
export function formatPercentage(value: PercentUnits): string {
  const integerPart = Math.trunc(value / UNITS_PER_PERCENT);
  const fraction = String(value % UNITS_PER_PERCENT).padStart(4, "0").replace(/0+$/, "");
  return fraction ? `${integerPart},${fraction}%` : `${integerPart}%`;
}
