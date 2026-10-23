import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { getServerEnv } from "@/lib/env.server";

/**
 * Aviso de ambiente (03-ui-ux.md, 2.2): fora de produção, deixa claro que os dados são de
 * teste. Em produção (APP_ENV=production) não aparece.
 */
export function EnvironmentBanner() {
  if (getServerEnv().appEnv === "production") return null;

  return (
    <Alert variant="warning" role="status" className="rounded-none border-x-0 border-t-0 px-4 py-2">
      <TriangleAlert aria-hidden="true" />
      <AlertDescription>Ambiente de testes — use apenas dados fictícios.</AlertDescription>
    </Alert>
  );
}
