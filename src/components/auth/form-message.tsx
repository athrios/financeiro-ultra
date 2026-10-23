import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";

export type MessageTone = "danger" | "warning" | "info" | "success";

const TONE_ICON = {
  danger: CircleAlert,
  warning: TriangleAlert,
  info: Info,
  success: CircleCheck,
} as const;

const TONE_VARIANT = {
  danger: "destructive",
  warning: "warning",
  info: "info",
  success: "success",
} as const;

/**
 * Mensagem de topo de formulário (03-ui-ux.md, 3.2 e 7.1). Ícone obrigatório (a cor nunca é
 * o único meio). Erros e avisos que pedem atenção imediata usam role="alert"; informação e
 * sucesso usam role="status".
 */
export function FormMessage({ tone, children }: { tone: MessageTone; children: ReactNode }) {
  const Icon = TONE_ICON[tone];
  const role = tone === "danger" || tone === "warning" ? "alert" : "status";
  return (
    <Alert variant={TONE_VARIANT[tone]} role={role}>
      <Icon aria-hidden="true" />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
