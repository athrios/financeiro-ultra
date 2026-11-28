"use client";

import { CircleAlert, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";

import { ConfirmActionDialog, NoticeDialog } from "@/components/form/confirm-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  REACTIVATE_BLOCKED_DESCRIPTION,
  clientActionLabel,
  clientActiveVariant,
  clientDialogTitle,
  clientEditHref,
  clientPendingLabel,
  clientUnexpectedMessage,
  inactivateClientDescription,
  reactivateClientDescription,
} from "@/domain/cadastros/client-view";
import { cn } from "@/lib/utils";

import { setClientActiveAction, type ClientActiveState } from "../actions";

interface ClientActiveControlProps {
  client: { id: string; name: string; active: boolean; updatedAt: string };
  /** Nomes dos sócios ativos indicados (a página os leu; o servidor confere de novo ao confirmar). */
  partnerNames: readonly string[];
}

const IDLE: ClientActiveState = { status: "idle" };

/**
 * Botão e diálogos de inativar e reativar cliente (UI 6.3 e 6.4). A PÁGINA decide a variante com os
 * sócios que leu: ativo -> inativar; inativo com sócio ativo -> reativar; inativo sem sócio ativo ->
 * bloqueio com "Editar cliente". O servidor confere de novo: se o último sócio saiu enquanto o
 * diálogo estava aberto (`CLIENT_WITHOUT_PARTNER`), o diálogo vira o bloqueio. Sucesso redireciona
 * ao detalhe (a página remonta este componente, fechado, porque a `key` leva a versão do cliente).
 */
export function ClientActiveControl({ client, partnerNames }: ClientActiveControlProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [state, formAction, pending] = useActionState(setClientActiveAction, IDLE);
  const [dismissed, setDismissed] = useState<ClientActiveState | null>(null);

  const error = state !== dismissed && state.status === "error" ? state : null;
  const pageVariant = clientActiveVariant({ active: client.active, activePartnerCount: partnerNames.length });
  const variant = error?.error.hint === "CLIENT_WITHOUT_PARTNER" ? "blocked" : pageVariant;
  const activating = !client.active;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setReason("");
    } else {
      setDismissed(state);
      // O servidor viu uma situação diferente da que a página leu: atualiza para a próxima abertura.
      if (variant !== pageVariant) router.refresh();
    }
  }

  function handleRefresh() {
    setOpen(false);
    setDismissed(state);
    router.refresh();
  }

  return (
    <>
      <Button
        type="button"
        variant={activating ? "default" : "outline"}
        onClick={() => handleOpenChange(true)}
        className="h-11 md:h-9"
      >
        {activating ? "Reativar cliente" : "Inativar cliente"}
      </Button>

      {variant === "blocked" ? (
        <NoticeDialog
          open={open}
          onOpenChange={handleOpenChange}
          title={clientDialogTitle("blocked", client.name)}
          description={REACTIVATE_BLOCKED_DESCRIPTION}
          error={
            error?.error.hint === "CLIENT_WITHOUT_PARTNER" ? (
              <Alert variant="warning" role="alert">
                <TriangleAlert aria-hidden="true" />
                <AlertDescription>{error.error.message}</AlertDescription>
              </Alert>
            ) : null
          }
          actions={
            <Link href={clientEditHref(client.id)} className={cn(buttonVariants(), "h-11 md:h-9")}>
              Editar cliente
            </Link>
          }
        />
      ) : (
        <ConfirmActionDialog
          open={open}
          onOpenChange={handleOpenChange}
          title={clientDialogTitle(variant, client.name)}
          description={
            variant === "reactivate" ? reactivateClientDescription(partnerNames) : inactivateClientDescription(partnerNames)
          }
          error={error ? <ActionErrorAlert state={error} activating={activating} onRefresh={handleRefresh} /> : null}
          formAction={formAction}
          hiddenFields={
            <>
              <input type="hidden" name="id" value={client.id} />
              <input type="hidden" name="active" value={String(activating)} />
              <input type="hidden" name="expectedUpdatedAt" value={client.updatedAt} />
            </>
          }
          pending={pending}
          confirmLabel={clientActionLabel(variant)}
          pendingLabel={clientPendingLabel(variant)}
          pendingAnnouncement={activating ? "Reativando, aguarde" : "Inativando, aguarde"}
          reason={reason}
          onReasonChange={setReason}
        />
      )}
    </>
  );
}

/** Erro do servidor dentro do diálogo: continua aberto, com o motivo preservado (UI 6). */
function ActionErrorAlert({
  state,
  activating,
  onRefresh,
}: {
  state: Extract<ClientActiveState, { status: "error" }>;
  activating: boolean;
  onRefresh: () => void;
}) {
  const { error, supportCode } = state;
  const message = error.code === "UNEXPECTED" ? clientUnexpectedMessage(activating) : error.message;
  const needsRefresh = error.hint === "STALE_VERSION" || error.code === "NOT_FOUND";
  return (
    <Alert variant="destructive" role="alert">
      <CircleAlert aria-hidden="true" />
      <AlertDescription>
        <p>{message}</p>
        {supportCode && (
          <p>
            Código de suporte: <code className="font-mono select-all">{supportCode}</code>
          </p>
        )}
        {needsRefresh && (
          <Button type="button" variant="outline" onClick={onRefresh} className="mt-2 h-11 md:h-9">
            Atualizar a tela
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
