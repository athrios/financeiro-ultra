"use client";

import { Loader2 } from "lucide-react";
import { useRef, type ReactNode } from "react";

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

import { ReasonField } from "./reason-field";

interface DialogBaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Resumo do que acontece (texto corrido; listas vão em `children`). */
  description: ReactNode;
  /** Listas e notas dentro do diálogo. */
  children?: ReactNode;
  /** `Alert` de erro no topo do corpo. O foco não sai do botão (role="alert" anuncia). */
  error?: ReactNode;
}

interface ConfirmActionDialogProps extends DialogBaseProps {
  /** Ação do formulário (Server Action ligada por `useActionState`). */
  formAction: (formData: FormData) => void;
  /** Campos ocultos da ação (id, versão, lista confirmada...). */
  hiddenFields: ReactNode;
  pending: boolean;
  confirmLabel: string;
  pendingLabel: string;
  /** Texto lido pelo leitor de tela enquanto a ação roda ("Inativando, aguarde"). */
  pendingAnnouncement: string;
  reason: string;
  onReasonChange: (value: string) => void;
  cancelLabel?: string;
}

/**
 * Diálogo de confirmação de nível 2 (FND 5.1; CAD-001 UI 6 e 12.1), sobre `AlertDialog`:
 * título com verbo e objeto, resumo, lista opcional, "Motivo (opcional)" e rodapé com
 * "Cancelar" (foco inicial) e um botão de ação com rótulo específico. O botão é o primário
 * padrão, não vermelho: inativar e reativar são reversíveis e auditados.
 *
 * Esc fecha, exceto com a ação em andamento (e o clique fora nunca fecha). Erro do servidor: o
 * diálogo continua aberto, com o motivo digitado preservado.
 */
export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  error,
  formAction,
  hiddenFields,
  pending,
  confirmLabel,
  pendingLabel,
  pendingAnnouncement,
  reason,
  onReasonChange,
  cancelLabel = "Cancelar",
}: ConfirmActionDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <AlertDialogContent initialFocus={cancelRef}>
        <form action={formAction} className="flex min-h-0 flex-1 flex-col">
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogBody>
            {error}
            {children}
            <ReasonField value={reason} onChange={onReasonChange} disabled={pending} />
          </AlertDialogBody>
          {hiddenFields}
          <p role="status" className="sr-only">
            {pending ? pendingAnnouncement : ""}
          </p>
          <AlertDialogFooter>
            <Button
              ref={cancelRef}
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
              className="h-11 md:h-9"
            >
              {cancelLabel}
            </Button>
            <Button type="submit" disabled={pending} className="h-11 md:h-9">
              {pending ? (
                <>
                  <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />
                  {pendingLabel}
                </>
              ) : (
                confirmLabel
              )}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface NoticeDialogProps extends DialogBaseProps {
  /** Botões extras do rodapé (por exemplo, o link "Ver clientes deste sócio"). */
  actions?: ReactNode;
  closeLabel?: string;
}

/**
 * Diálogo de bloqueio (UI 6.1 A e 6.4 B): explica o que impede e leva à saída. Não há ação a
 * confirmar nem campo de motivo. Foco inicial em "Fechar" (Enter acidental nunca confirma nada).
 */
export function NoticeDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  error,
  actions,
  closeLabel = "Fechar",
}: NoticeDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent initialFocus={closeRef}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogBody>
          {error}
          {children}
        </AlertDialogBody>
        <AlertDialogFooter>
          <Button ref={closeRef} type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-11 md:h-9">
            {closeLabel}
          </Button>
          {actions}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
