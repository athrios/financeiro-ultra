import {
  computeIndicatorPositions,
  type IndicatorPosition,
  type LedgerEntry,
  type LedgerEntryType,
} from "@/domain/compensation";
import { toReferenceDate, type ReferenceMonth } from "@/domain/competencies";
import { parseMoney } from "@/domain/shared/money";
import type { AppSupabaseClient } from "@/lib/supabase/types";

/**
 * Posições dos indicadores até a competência informada, derivadas da view
 * financial_ledger. Base para a futura tela de compensação.
 */
export async function getIndicatorPositions(
  supabase: AppSupabaseClient,
  reference: ReferenceMonth,
): Promise<IndicatorPosition[]> {
  const referenceDate = toReferenceDate(reference);

  const { data, error } = await supabase
    .from("financial_ledger")
    .select("competency_id, reference_month, indicator_id, entry_type, amount::text")
    .lte("reference_month", referenceDate);

  if (error) {
    throw new Error(`Falha ao carregar o ledger: ${error.message}`);
  }

  const entries: LedgerEntry[] = data.map((row) => {
    if (!row.competency_id || !row.reference_month || !row.indicator_id || !row.entry_type || !row.amount) {
      throw new Error("Lançamento do ledger incompleto.");
    }
    return {
      competencyId: row.competency_id,
      referenceMonth: row.reference_month,
      indicatorId: row.indicator_id,
      entryType: row.entry_type as LedgerEntryType,
      amount: parseMoney(row.amount),
    };
  });

  return computeIndicatorPositions(entries, referenceDate);
}
