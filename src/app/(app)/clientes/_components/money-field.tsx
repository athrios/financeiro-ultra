"use client";

import { useState } from "react";

import { FieldError } from "@/components/form/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MONTHLY_HELP, describeMoneyReading, reformatMoneyText, sanitizeMoneyText } from "@/domain/cadastros/client-form";

interface MoneyFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Ao sair do campo (a tela confere o valor depois do primeiro envio). */
  onBlur?: () => void;
  error?: string | null;
  disabled?: boolean;
}

/**
 * "Mensalidade padrão (R$) *" (UI 4.1.3). Aceita só dígitos, ponto e vírgula: a vírgula separa os
 * centavos e o ponto só vale como milhar ("1234.56" é recusado, nunca lido como centavos). Ao sair do
 * campo, o valor legível é reformatado ("1.234,56"). A linha "Valor lido: R$ 1.234,56" mostra o que
 * foi entendido; para o leitor de tela ela só é anunciada ao sair do campo (UXC-44: nada a cada tecla).
 * O valor segue como o texto digitado; o servidor o converte sem float.
 */
export function MoneyField({ id, value, onChange, onBlur, error, disabled }: MoneyFieldProps) {
  const helpId = `${id}-ajuda`;
  const errorId = `${id}-erro`;
  const readingId = `${id}-leitura`;
  const [announced, setAnnounced] = useState("");
  const reading = describeMoneyReading(value);

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>
        Mensalidade padrão (R$) <span aria-hidden="true">*</span>
      </Label>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="text-sm text-muted-foreground">
          R$
        </span>
        <Input
          id={id}
          name="monthlyValue"
          value={value}
          inputMode="decimal"
          autoComplete="off"
          required
          aria-required="true"
          aria-invalid={error ? true : undefined}
          aria-describedby={[helpId, readingId, error ? errorId : null].filter(Boolean).join(" ")}
          disabled={disabled}
          onChange={(event) => onChange(sanitizeMoneyText(event.target.value))}
          onBlur={() => {
            const formatted = reformatMoneyText(value);
            if (formatted !== value) onChange(formatted);
            setAnnounced(describeMoneyReading(formatted) ?? "");
            onBlur?.();
          }}
          className="h-11 max-w-48 text-right tabular-nums md:h-9"
        />
      </div>
      <p id={helpId} className="text-xs text-muted-foreground">
        {MONTHLY_HELP}
      </p>
      <p id={readingId} aria-hidden="true" className="min-h-5 text-sm text-muted-foreground tabular-nums">
        {reading}
      </p>
      <p role="status" className="sr-only">
        {announced}
      </p>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}
