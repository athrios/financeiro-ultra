"use client";

import { Loader2, TriangleAlert } from "lucide-react";
import { useRef } from "react";

import { ReasonField } from "@/components/form/reason-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DOCUMENT_CHANGE_NOTE,
  PARTNERS_CHANGE_NOTE,
  STALE_IN_DIALOG_MESSAGE,
  confirmationTitle,
  type ClientConfirmationChanges,
} from "@/domain/cadastros/client-form";

interface ConfirmChangesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientName: string;
  changes: ClientConfirmationChanges;
  reason: string;
  onReasonChange: (value: string) => void;
  pending: boolean;
  /** Outra pessoa salvou enquanto o diálogo estava aberto (UI 8.2). */
  stale: boolean;
  onConfirm: () => void;
  /** "Recarregar dados": fecha o diálogo e recarrega o formulário, como no conflito normal. */
  onReload: () => void;
}

/**
 * Confirmação ao salvar mudança de sócios ou de documento, só na edição (UI 4.1.8). Mostra só o que
 * mudou, com antes e depois, os avisos fixos e "Motivo (opcional)" (que nunca bloqueia, RAT-D021). O
 * foco inicial é "Voltar e revisar". O botão "Confirmar e salvar" envia o formulário principal (o motivo
 * vai num campo oculto dele). Com conflito (8.2) o diálogo continua aberto, com o aviso, e só deixa
 * "Cancelar" e "Recarregar dados".
 */
export function ConfirmChangesDialog({
  open,
  onOpenChange,
  clientName,
  changes,
  reason,
  onReasonChange,
  pending,
  stale,
  onConfirm,
  onReload,
}: ConfirmChangesDialogProps) {
  const backRef = useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <AlertDialogContent initialFocus={backRef}>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmationTitle(clientName)}</AlertDialogTitle>
          <AlertDialogDescription>Confira o que vai mudar antes de salvar.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogBody>
          {stale && (
            <Alert variant="warning" role="alert">
              <TriangleAlert aria-hidden="true" />
              <AlertDescription>{STALE_IN_DIALOG_MESSAGE}</AlertDescription>
            </Alert>
          )}

          {changes.partners && (
            <div className="grid gap-1 text-sm">
              <p>
                <span className="font-medium">Sócios:</span> {changes.partners.before.join(", ") || "nenhum"} →{" "}
                {changes.partners.after.join(", ") || "nenhum"}
              </p>
              {changes.partners.division && <p>{changes.partners.division}</p>}
              <p className="text-muted-foreground">{PARTNERS_CHANGE_NOTE}</p>
            </div>
          )}

          {changes.document && (
            <div className="grid gap-1 text-sm">
              <p className="break-words">
                <span className="font-medium">Documento:</span> {changes.document.before} → {changes.document.after}
              </p>
              <p className="text-muted-foreground">{DOCUMENT_CHANGE_NOTE}</p>
            </div>
          )}

          <ReasonField value={reason} onChange={onReasonChange} disabled={pending || stale} />
        </AlertDialogBody>
        <p role="status" className="sr-only">
          {pending ? "Salvando, aguarde" : ""}
        </p>
        <AlertDialogFooter>
          {stale ? (
            <>
              <Button ref={backRef} type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-11 md:h-9">
                Cancelar
              </Button>
              <Button type="button" variant="outline" onClick={onReload} className="h-11 md:h-9">
                Recarregar dados
              </Button>
            </>
          ) : (
            <Button ref={backRef} type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)} className="h-11 md:h-9">
              Voltar e revisar
            </Button>
          )}
          <Button type="button" disabled={pending || stale} onClick={onConfirm} className="h-11 md:h-9">
            {pending ? (
              <>
                <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />
                Salvando…
              </>
            ) : (
              "Confirmar e salvar"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
