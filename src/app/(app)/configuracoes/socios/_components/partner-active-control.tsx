"use client";

import { CircleAlert, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";

import { ConfirmActionDialog, NoticeDialog } from "@/components/form/confirm-dialog";
import { StatusBadge } from "@/components/form/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  CASCADE_NOTE,
  LINKED_LOGIN_DIALOG_NOTE,
  REACTIVATE_DESCRIPTION,
  blockedDescription,
  blockedHowTo,
  cascadeDescription,
  partnerActionLabel,
  partnerActiveVariant,
  partnerClientsHref,
  partnerDialogTitle,
  partnerPendingLabel,
  partnerUnexpectedMessage,
  plainInactivateDescription,
} from "@/domain/cadastros/partner-view";
import { cn } from "@/lib/utils";
import type { PartnerBlockingClient, PartnerReceiverRef } from "@/server/partners/partners";

import { setPartnerActiveAction, type PartnerActiveState } from "../actions";

interface PartnerActiveControlProps {
  partner: { id: string; name: string; active: boolean; updatedAt: string };
  /** Clientes que indicam o sócio (consulta 11.2), todos, com a marca "Único sócio". */
  clients: readonly PartnerBlockingClient[];
  /** Recebedores ativos do sócio (consulta 11.3). */
  receivers: readonly PartnerReceiverRef[];
  /** Há login vinculado (consulta 11.7)? Só entra na cascata. */
  hasLinkedLogin: boolean;
}

const IDLE: PartnerActiveState = { status: "idle" };

/**
 * Botão e diálogos de inativar e reativar sócio (UI 6.1 e 6.2). A PÁGINA decide a variante com os
 * dados que leu: bloqueio (qualquer cliente, ativo ou inativo), cascata (recebedores ativos), simples
 * e reativação. O servidor confere de novo ao confirmar: se a lista de clientes mudou, o diálogo vira
 * o bloqueio com a lista nova; se a de recebedores mudou, continua na cascata com a lista nova e pede
 * a confirmação de novo. Sucesso redireciona ao detalhe (a página remonta este componente, fechado,
 * porque a `key` leva a versão do sócio).
 */
export function PartnerActiveControl({ partner, clients, receivers, hasLinkedLogin }: PartnerActiveControlProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [state, formAction, pending] = useActionState(setPartnerActiveAction, IDLE);
  const [dismissed, setDismissed] = useState<PartnerActiveState | null>(null);

  const error = state !== dismissed && state.status === "error" ? state : null;
  const currentClients = error?.clients ?? clients;
  const currentReceivers = error?.receivers ?? receivers;
  const variant = partnerActiveVariant({
    active: partner.active,
    clientCount: currentClients.length,
    receiverCount: currentReceivers.length,
  });
  const openedAsVariant = partnerActiveVariant({
    active: partner.active,
    clientCount: clients.length,
    receiverCount: receivers.length,
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setReason("");
    } else {
      setDismissed(state);
      // O erro trouxe listas mais novas que as da página: atualiza a página para a próxima abertura.
      if (error?.clients || error?.receivers) router.refresh();
    }
  }

  const activating = !partner.active;
  const triggerLabel = activating ? "Reativar sócio" : "Inativar sócio";

  return (
    <>
      <Button
        type="button"
        variant={activating ? "default" : "outline"}
        onClick={() => handleOpenChange(true)}
        className="h-11 md:h-9"
      >
        {triggerLabel}
      </Button>

      {variant === "blocked" ? (
        <NoticeDialog
          open={open}
          onOpenChange={handleOpenChange}
          title={partnerDialogTitle("blocked", partner.name)}
          description={blockedDescription(partner.name, currentClients.length)}
          error={
            openedAsVariant !== "blocked" && error?.error.hint === "PARTNER_HAS_CLIENTS" ? (
              <Alert variant="warning" role="alert">
                <TriangleAlert aria-hidden="true" />
                <AlertDescription>A lista de clientes deste sócio mudou. Confira a lista atualizada.</AlertDescription>
              </Alert>
            ) : null
          }
          actions={
            <Link href={partnerClientsHref(partner.id)} className={cn(buttonVariants(), "h-11 md:h-9")}>
              Ver clientes deste sócio
            </Link>
          }
        >
          <BlockingClientsList partnerName={partner.name} clients={currentClients} />
          <p className="text-sm">{blockedHowTo(partner.name)}</p>
        </NoticeDialog>
      ) : (
        <ConfirmActionDialog
          open={open}
          onOpenChange={handleOpenChange}
          title={partnerDialogTitle(variant, partner.name)}
          description={describeConfirm(variant, partner.name, currentReceivers.length)}
          error={error ? <ActionErrorAlert state={error} activating={activating} onRefresh={() => handleRefresh()} /> : null}
          formAction={formAction}
          hiddenFields={
            <>
              <input type="hidden" name="id" value={partner.id} />
              <input type="hidden" name="active" value={String(activating)} />
              <input type="hidden" name="expectedUpdatedAt" value={partner.updatedAt} />
              {variant === "cascade" &&
                currentReceivers.map((receiver) => (
                  <input key={receiver.id} type="hidden" name="confirmedReceiverIds" value={receiver.id} />
                ))}
            </>
          }
          pending={pending}
          confirmLabel={partnerActionLabel(variant, currentReceivers.length)}
          pendingLabel={partnerPendingLabel(variant)}
          pendingAnnouncement={activating ? "Reativando, aguarde" : "Inativando, aguarde"}
          reason={reason}
          onReasonChange={setReason}
        >
          {variant === "cascade" && (
            <>
              <div role="region" aria-label="Lista de recebedores" tabIndex={0} className="max-h-64 overflow-y-auto rounded-lg border outline-none focus-visible:ring-3 focus-visible:ring-ring">
                <ul aria-label="Recebedores que serão inativados" className="grid divide-y text-sm">
                  {currentReceivers.map((receiver) => (
                    <li key={receiver.id} className="px-3 py-2 break-words">
                      {receiver.holderName}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-sm text-muted-foreground">{CASCADE_NOTE}</p>
              {hasLinkedLogin && <p className="text-sm text-muted-foreground">{LINKED_LOGIN_DIALOG_NOTE}</p>}
            </>
          )}
        </ConfirmActionDialog>
      )}
    </>
  );

  function handleRefresh() {
    setOpen(false);
    setDismissed(state);
    router.refresh();
  }
}

function describeConfirm(variant: "reactivate" | "cascade" | "plain", name: string, receiverCount: number): string {
  if (variant === "reactivate") return REACTIVATE_DESCRIPTION;
  if (variant === "cascade") return cascadeDescription(receiverCount);
  return plainInactivateDescription(name);
}

function BlockingClientsList({ partnerName, clients }: { partnerName: string; clients: readonly PartnerBlockingClient[] }) {
  return (
    <div
      role="region"
      aria-label="Lista de clientes"
      tabIndex={0}
      className="max-h-64 overflow-y-auto rounded-lg border outline-none focus-visible:ring-3 focus-visible:ring-ring"
    >
      <ul aria-label={`Clientes que indicam ${partnerName}`} className="grid divide-y text-sm">
        {clients.map((client) => (
          <li key={client.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <Link
              href={`/clientes/${client.id}`}
              className="min-h-11 min-w-0 rounded-sm break-words underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring md:min-h-0"
            >
              {client.name}
            </Link>
            <span className="flex shrink-0 items-center gap-2">
              {client.onlyPartner && (
                <Badge variant="warning">
                  <TriangleAlert aria-hidden="true" />
                  Único sócio
                </Badge>
              )}
              <StatusBadge active={client.active} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Erro do servidor dentro do diálogo: continua aberto, com o motivo preservado (UI 6). */
function ActionErrorAlert({
  state,
  activating,
  onRefresh,
}: {
  state: Extract<PartnerActiveState, { status: "error" }>;
  activating: boolean;
  onRefresh: () => void;
}) {
  const { error, supportCode } = state;
  // RECEIVERS_CHANGED é um aviso (a lista já veio atualizada); o resto é erro.
  if (error.hint === "RECEIVERS_CHANGED") {
    return (
      <Alert variant="warning" role="alert">
        <TriangleAlert aria-hidden="true" />
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }
  const message = error.code === "UNEXPECTED" ? partnerUnexpectedMessage(activating) : error.message;
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
