"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { FieldError } from "@/components/form/field-error";

interface PasswordFieldProps extends Omit<ComponentProps<"input">, "type" | "id" | "name"> {
  name: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  /** Texto de ajuda ou lista de regras já renderizada (ligada por aria-describedby). */
  help?: React.ReactNode;
  /** Mensagem de erro do campo. */
  error?: string | null;
}

/**
 * Campo de senha com mostrar/ocultar (03-ui-ux.md, 2.4 e 7.4): botão com nome acessível e
 * `aria-pressed`; colar é permitido; erro ligado por `aria-describedby`.
 */
export function PasswordField({ name, label, autoComplete, help, error, ...props }: PasswordFieldProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const helpId = `${id}-ajuda`;
  const errorId = `${id}-erro`;
  const describedBy = [help ? helpId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          {...props}
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="h-11 pr-12 md:h-9 md:pr-10"
          // Não há bloqueio de colar: gerenciadores de senha precisam funcionar (WCAG 3.3.8).
          autoCapitalize="none"
          spellCheck={false}
        />
        <Button
          type="button"
          variant="ghost"
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
          className="absolute top-0 right-0 size-11 md:size-9"
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </Button>
      </div>
      {help && (
        <div id={helpId} className="text-xs text-muted-foreground">
          {help}
        </div>
      )}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}
