"use client";

import { RefreshCw } from "lucide-react";
import { useActionState, useState } from "react";

import { recheckAccess, type RecheckState } from "@/app/actions/access";
import { Button } from "@/components/ui/button";

const INITIAL: RecheckState = { checks: 0 };

/**
 * "Verificar novamente" (03-ui-ux.md, 2.7.1 e 4.4): recarrega o perfil sem novo login.
 * Se o acesso foi liberado, a tela troca sozinha para o sistema; se nada mudou, um aviso
 * inline (role="status") informa, sem sumir sozinho, e pode ser dispensado.
 */
export function RecheckAccessButton({ unchangedMessage }: { unchangedMessage: string }) {
  const [state, formAction, pending] = useActionState(recheckAccess, INITIAL);
  // Guarda a última verificação que o usuário dispensou.
  const [dismissedChecks, setDismissedChecks] = useState(0);
  const showMessage = state.checks > 0 && state.checks > dismissedChecks && !pending;

  return (
    <form action={formAction} className="grid w-full gap-2">
      <Button type="submit" className="h-11 w-full md:h-9" disabled={pending}>
        <RefreshCw aria-hidden="true" className={pending ? "motion-safe:animate-spin" : undefined} />
        {pending ? "Verificando…" : "Verificar novamente"}
      </Button>
      <div role="status" className="text-sm">
        {showMessage && (
          <p className="flex items-center justify-between gap-2 rounded-lg border bg-muted px-3 py-2 text-left text-muted-foreground">
            <span>{unchangedMessage}</span>
            <button
              type="button"
              className="inline-flex min-h-8 shrink-0 items-center rounded-sm px-1 text-xs font-medium text-foreground underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring"
              onClick={() => setDismissedChecks(state.checks)}
            >
              Dispensar
            </button>
          </p>
        )}
      </div>
    </form>
  );
}
