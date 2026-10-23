export type ReceiptStatus =
  | "RECEIVED"
  | "PROCESSING"
  | "AWAITING_RECEIVER"
  | "AWAITING_COMPANY"
  | "AWAITING_CONFIRMATION"
  | "CONFIRMED"
  | "READ_ERROR";

export type ReceiverIdentificationMethod = "ALIAS" | "MANUAL" | "UNIDENTIFIED";

export type CompanyIdentificationMethod = "CNPJ" | "NAME" | "MANUAL" | "UNIDENTIFIED";

/** Comprovantes que aguardam alguma definição humana. */
const REVIEW_STATUSES: ReadonlySet<ReceiptStatus> = new Set<ReceiptStatus>([
  "AWAITING_RECEIVER",
  "AWAITING_COMPANY",
  "AWAITING_CONFIRMATION",
  "READ_ERROR",
]);

export function requiresReview(status: ReceiptStatus): boolean {
  return REVIEW_STATUSES.has(status);
}

/** Só recebimentos confirmados contam como recebidos e entram no ledger. */
export function isConfirmed(status: ReceiptStatus): boolean {
  return status === "CONFIRMED";
}
