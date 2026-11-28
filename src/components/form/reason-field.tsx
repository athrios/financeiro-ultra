"use client";

import { useId } from "react";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const REASON_MAX_LENGTH = 500;

interface ReasonFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Campo desabilitado enquanto a ação está em andamento. */
  disabled?: boolean;
}

/**
 * "Motivo (opcional)" das confirmações auditadas (UI 6; RAT-D021): nunca é obrigatório, sem
 * asterisco, e nunca bloqueia a confirmação. Limite de 500 caracteres com contador. Controlado, para o
 * texto digitado sobreviver a um erro do servidor (o React reinicia campos não controlados depois
 * de uma ação de formulário).
 */
export function ReasonField({ value, onChange, disabled }: ReasonFieldProps) {
  const id = useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Motivo (opcional)</Label>
      <Textarea
        id={id}
        name="reason"
        rows={3}
        maxLength={REASON_MAX_LENGTH}
        value={value}
        disabled={disabled}
        autoComplete="off"
        aria-describedby={`${id}-ajuda`}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-20"
      />
      <p id={`${id}-ajuda`} className="flex justify-between gap-2 text-xs text-muted-foreground">
        <span>Fica registrado no histórico de alterações, junto com quem fez e quando.</span>
        <span aria-hidden="true" className="shrink-0 tabular-nums">
          {value.length} de {REASON_MAX_LENGTH}
        </span>
      </p>
    </div>
  );
}
