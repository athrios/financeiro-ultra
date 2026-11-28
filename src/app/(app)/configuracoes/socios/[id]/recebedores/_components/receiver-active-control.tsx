"use client";

import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";

import { ConfirmActionDialog, NoticeDialog } from "@/components/form/confirm-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { partnerDetailHref } from "@/domain/cadastros/partner-view";
import {
  DEACTIVATE_RECEIVER_DESCRIPTION,
  blockedReceiverDescription,
  reactivateReceiverDescription,
  receiverActionLabel,
  receiverActiveVariant,
  receiverDialogTitle,
  receiverPendingLabel,
  receiverUnexpectedMessage,
} from "@/domain/cadastros/receiver-view";
import { cn } from "@/lib/utils";

import { setReceiverActiveAction, type ReceiverActiveState } from "../actions";

interface ReceiverActiveControlProps {
  receiver: { id: string; holderName: string; active: boolean; updatedAt: string };
  partner: { id: string; name: string; active: boolean };
  /** Tamanho do botão: na lista de recebedores (compacto) ou no cabeçalho da página do recebedor. */
  compact?: boolean;
}

const IDLE: ReceiverActiveState = { status: "idle" };

/**
 * Botão e diálogos de inativar e reativar recebedor (UI 6.5). A PÁGINA decide a variante com o que leu:
 * reativar com o sócio dono inativo é o bloqueio (6.5 B, "Fechar" e "Ir para o sócio"); o resto é
 * confirmação com "Motivo (opcional)", que nunca bloqueia (RAT-D021). O servidor confere de novo: se o
 * sócio foi inativado enquanto o diálogo estava aberto (`PARTNER_INACTIVE`), o diálogo vira o bloqueio.
 * Sucesso redireciona ao detalhe do sócio (a página remonta este componente, fechado, porque a `key`
 * leva a versão do recebedor).
 */
export function ReceiverActiveControl({ receiver, partner, compact = false }: ReceiverActiveControlProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [state, formAction, pending] = useActionState(setReceiverActiveAction, IDLE);
  const [dismissed, setDismissed] = useState<ReceiverActiveState | null>(null);

  const error = state !== dismissed && state.status === "error" ? state : null;
  const partnerBecameInactive = error?.error.hint === "PARTNER_INACTIVE";
  const variant = receiverActiveVariant({
    active: receiver.active,
    partnerActive: partner.active && !partnerBecameInactive,
  });
  const activating = !receiver.active;
  const partnerName =
    error?.error.details?.hint === "PARTNER_INACTIVE" ? (error.error.details.partners[0]?.name ?? partner.name) : partner.name;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setReason("");
    else setDismissed(state);
  }

  function handleRefresh() {
    setOpen(false);
    setDismissed(state);
    router.refresh();
  }

  const triggerLabel = receiverActionLabel(activating ? "reactivate" : "deactivate");

  return (
    <>
      <Button
        type="button"
        variant={activating && !compact ? "default" : "outline"}
        onClick={() => handleOpenChange(true)}
        aria-label={compact ? `${triggerLabel} ${receiver.holderName}` : undefined}
        className={compact ? "h-11 md:h-8" : "h-11 md:h-9"}
      >
        {triggerLabel}
      </Button>

      {variant === "blocked" ? (
        <NoticeDialog
          open={open}
          onOpenChange={handleOpenChange}
          title={receiverDialogTitle("blocked", receiver.holderName)}
          description={blockedReceiverDescription(partnerName)}
          actions={
            <Link href={partnerDetailHref(partner.id)} className={cn(buttonVariants(), "h-11 md:h-9")}>
              Ir para o sócio
            </Link>
          }
        />
      ) : (
        <ConfirmActionDialog
          open={open}
          onOpenChange={handleOpenChange}
          title={receiverDialogTitle(variant, receiver.holderName)}
          description={variant === "reactivate" ? reactivateReceiverDescription(partner.name) : DEACTIVATE_RECEIVER_DESCRIPTION}
          error={error ? <ActionErrorAlert state={error} activating={activating} onRefresh={handleRefresh} /> : null}
          formAction={formAction}
          hiddenFields={
            <>
              <input type="hidden" name="id" value={receiver.id} />
              <input type="hidden" name="active" value={String(activating)} />
              <input type="hidden" name="expectedUpdatedAt" value={receiver.updatedAt} />
            </>
          }
          pending={pending}
          confirmLabel={receiverActionLabel(variant)}
          pendingLabel={receiverPendingLabel(variant)}
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
  state: Extract<ReceiverActiveState, { status: "error" }>;
  activating: boolean;
  onRefresh: () => void;
}) {
  const { error, supportCode } = state;
  const message = error.code === "UNEXPECTED" ? receiverUnexpectedMessage(activating) : error.message;
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
