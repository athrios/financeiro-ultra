import { planReceiptConfirmation, type ReceiptConfirmationError } from "@/domain/receipts";
import { parseMoney, toMoneyString } from "@/domain/shared/money";
import { toPercentageString } from "@/domain/shared/percentage";
import type { AppSupabaseClient } from "@/lib/supabase/types";

import { COMPANY_DISTRIBUTION_SELECT, toDistributionInput } from "./distribution-input";
import { getUseCustomDefaultPercentages } from "./finance-settings";

export type ConfirmReceiptResult = { ok: true } | { ok: false; message: string };

const CONFIRMATION_ERRORS: Record<ReceiptConfirmationError["code"], string> = {
  ALREADY_CONFIRMED: "O recebimento já está confirmado.",
  COMPANY_NOT_IDENTIFIED: "Identifique a empresa antes de confirmar.",
  RECEIVER_NOT_IDENTIFIED: "Identifique quem recebeu o pagamento antes de confirmar.",
  INVALID_DISTRIBUTION: "A distribuição da empresa é inválida. Revise o cadastro.",
};

/**
 * Confirma um recebimento:
 *   1. carrega recebimento, empresa, indicadores e configuração;
 *   2. o domínio decide a distribuição e calcula os valores;
 *   3. confirm_receipt verifica as invariantes e grava o snapshot
 *      (receipt_allocations) + a confirmação na mesma transação.
 */
export async function confirmReceipt(
  supabase: AppSupabaseClient,
  receiptId: string,
): Promise<ConfirmReceiptResult> {
  const { data: receipt, error: receiptError } = await supabase
    .from("receipts")
    .select("id, amount::text, status, company_id, receiving_indicator_id")
    .eq("id", receiptId)
    .maybeSingle();

  if (receiptError) {
    return { ok: false, message: receiptError.message };
  }
  if (!receipt) {
    return { ok: false, message: "Recebimento não encontrado." };
  }
  if (!receipt.company_id) {
    return { ok: false, message: CONFIRMATION_ERRORS.COMPANY_NOT_IDENTIFIED };
  }

  const [companyResult, useCustomDefaultPercentages] = await Promise.all([
    supabase.from("companies").select(COMPANY_DISTRIBUTION_SELECT).eq("id", receipt.company_id).single(),
    getUseCustomDefaultPercentages(supabase),
  ]);

  if (companyResult.error) {
    return { ok: false, message: companyResult.error.message };
  }

  const plan = planReceiptConfirmation(
    {
      id: receipt.id,
      amount: parseMoney(receipt.amount),
      status: receipt.status,
      companyId: receipt.company_id,
      receivingIndicatorId: receipt.receiving_indicator_id,
    },
    toDistributionInput(companyResult.data, useCustomDefaultPercentages),
  );

  if (!plan.ok) {
    return { ok: false, message: CONFIRMATION_ERRORS[plan.error.code] };
  }

  const { error } = await supabase.rpc("confirm_receipt", {
    p_receipt_id: receipt.id,
    p_distribution_source: plan.source,
    p_allocations: plan.allocations.map((allocation) => ({
      indicator_id: allocation.indicatorId,
      percentage: toPercentageString(allocation.percentage),
      amount: toMoneyString(allocation.amount),
    })),
  });

  return error ? { ok: false, message: error.message } : { ok: true };
}
