import { Badge } from "@/components/ui/badge";
import type { CompanyPaymentStatus } from "@/domain/competencies";

const STATUS_DISPLAY: Record<
  CompanyPaymentStatus,
  { label: string; variant: "secondary" | "outline" | "default" | "destructive" }
> = {
  PAID: { label: "Pago", variant: "secondary" },
  PENDING: { label: "Pendente", variant: "outline" },
  PARTIAL: { label: "Parcial", variant: "default" },
  REVIEW: { label: "Revisão", variant: "destructive" },
};

export function CompanyStatusBadge({ status }: { status: CompanyPaymentStatus }) {
  const { label, variant } = STATUS_DISPLAY[status];
  return <Badge variant={variant}>{label}</Badge>;
}
