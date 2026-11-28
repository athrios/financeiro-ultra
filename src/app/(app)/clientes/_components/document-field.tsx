"use client";

import { Check } from "lucide-react";
import { useId, type ReactNode } from "react";

import { FieldError } from "@/components/form/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CNPJ_HELP,
  DOCUMENT_CHOICE_LABELS,
  DOCUMENT_HELP,
  type DocumentChoice,
} from "@/domain/cadastros/client-form";
import { DOCUMENT_PLACEHOLDERS, maskDocument } from "@/domain/documents/document-mask";
import { cn } from "@/lib/utils";

const CHOICES: readonly DocumentChoice[] = ["NONE", "CPF", "CNPJ"];

interface DocumentFieldProps {
  /** Id do grupo (alvo do foco quando o campo de número não existe) e base do id do campo de número. */
  id: string;
  choice: DocumentChoice;
  onChoiceChange: (choice: DocumentChoice) => void;
  value: string;
  onValueChange: (value: string) => void;
  onBlur?: () => void;
  error?: string | null;
  /** Link do cliente dono do documento repetido ("Abrir cliente"). */
  errorAction?: ReactNode;
  disabled?: boolean;
}

/**
 * "Documento do cliente" (UI 4.1.2): três opções lado a lado (Sem documento, CPF, CNPJ), com rádios
 * nativos, e o campo de número com a máscara do tipo. Trocar de tipo ESVAZIA o número, para nunca
 * cortar em silêncio um número digitado. O tipo só define máscara e validação; o servidor recebe o
 * tipo escolhido (`documentType`) e o número (`document`) e deduz o resto.
 */
export function DocumentField({
  id,
  choice,
  onChoiceChange,
  value,
  onValueChange,
  onBlur,
  error,
  errorAction,
  disabled,
}: DocumentFieldProps) {
  const radioName = useId();
  const numberId = `${id}-numero`;
  const helpId = `${id}-ajuda`;
  const numberHelpId = `${id}-numero-ajuda`;
  const errorId = `${id}-erro`;
  const type = choice === "NONE" ? null : choice;

  return (
    <fieldset id={id} tabIndex={-1} className="grid min-w-0 gap-3 outline-none" aria-describedby={helpId}>
      <legend className="text-sm font-medium">Documento do cliente</legend>
      <p id={helpId} className="text-sm text-muted-foreground">
        {DOCUMENT_HELP}
      </p>

      <div className="grid grid-cols-3 gap-2">
        {CHOICES.map((option) => {
          const selected = option === choice;
          return (
            <label
              key={option}
              className={cn(
                "relative flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2 text-sm font-medium transition-colors md:min-h-9",
                "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring",
                selected ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:bg-muted",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <input
                type="radio"
                name={radioName}
                value={option}
                checked={selected}
                disabled={disabled}
                onChange={() => onChoiceChange(option)}
                className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              />
              {selected && <Check aria-hidden="true" className="size-4" />}
              {DOCUMENT_CHOICE_LABELS[option]}
            </label>
          );
        })}
      </div>

      {/* O que o servidor recebe: o tipo escolhido (vazio = sem documento) e, se houver, o número. */}
      <input type="hidden" name="documentType" value={type ?? ""} />

      <div aria-live="polite" className="grid gap-2">
        {type && (
          <>
            <Label htmlFor={numberId}>Número do {type}</Label>
            <Input
              id={numberId}
              name="document"
              value={value}
              inputMode={type === "CPF" ? "numeric" : "text"}
              autoCapitalize={type === "CNPJ" ? "characters" : undefined}
              autoComplete="off"
              spellCheck={false}
              placeholder={DOCUMENT_PLACEHOLDERS[type]}
              disabled={disabled}
              aria-invalid={error ? true : undefined}
              aria-describedby={[type === "CNPJ" ? numberHelpId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined}
              onChange={(event) => onValueChange(maskDocument(type, event.target.value))}
              onBlur={onBlur}
              className="h-11 max-w-72 tabular-nums md:h-9"
            />
            {type === "CNPJ" && (
              <p id={numberHelpId} className="text-xs text-muted-foreground">
                {CNPJ_HELP}
              </p>
            )}
          </>
        )}
      </div>

      {error && (
        <div className="grid gap-1">
          <FieldError id={errorId}>{error}</FieldError>
          {errorAction}
        </div>
      )}
    </fieldset>
  );
}
