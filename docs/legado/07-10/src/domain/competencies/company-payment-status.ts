import type { Cents } from "@/domain/shared/money";

export type CompanyPaymentStatus = "PAID" | "PENDING" | "PARTIAL" | "REVIEW";

export interface CompanyPaymentStatusInput {
  /** Snapshot competency_companies.expected_amount. */
  expected: Cents;
  /** Soma dos recebimentos CONFIRMED da empresa na competência. */
  received: Cents;
  /** Existe comprovante da empresa aguardando definição? */
  hasReceiptsAwaitingReview: boolean;
}

/**
 * Situação da empresa na competência.
 *
 *   REVIEW   existe comprovante aguardando definição (tem precedência,
 *            pois o valor recebido ainda pode mudar)
 *   PENDING  recebido = 0
 *   PARTIAL  0 < recebido < esperado
 *   PAID     recebido >= esperado
 */
export function deriveCompanyPaymentStatus(input: CompanyPaymentStatusInput): CompanyPaymentStatus {
  if (input.hasReceiptsAwaitingReview) {
    return "REVIEW";
  }
  if (input.received <= 0) {
    return "PENDING";
  }
  if (input.received < input.expected) {
    return "PARTIAL";
  }
  return "PAID";
}
