"use client";

import { Info, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { FieldError } from "@/components/form/field-error";
import { Badge } from "@/components/ui/badge";
import {
  DIVISION_FIXED_NOTE,
  NO_ACTIVE_PARTNERS_MESSAGE,
  PARTNERS_CHANGE_NOTE,
  PARTNERS_HELP,
  describePartnerPreview,
  type PartnerChoice,
} from "@/domain/cadastros/client-form";
import { cn } from "@/lib/utils";

interface PartnerPickerProps {
  /** Id do grupo (alvo do foco do resumo de erros). */
  id: string;
  /** Sócios ativos, em ordem alfabética, mais os inativos que ainda estão indicados (estado defensivo). */
  partners: readonly PartnerChoice[];
  selectedIds: readonly string[];
  onChange: (ids: string[]) => void;
  /** Cliente ativo exige sócio; o inativo pode ficar sem (R-C10). */
  clientActive: boolean;
  isEdit: boolean;
  error?: string | null;
  disabled?: boolean;
}

const LONG_LIST = 10;

/**
 * "Sócios do cliente *" (UI 4.1.4): uma caixa de marcação por sócio ATIVO, em ordem alfabética, e a
 * prévia da divisão 1/n logo abaixo, anunciada ao marcar e desmarcar. A divisão é sempre igual (RAT-D015):
 * não há percentual para editar, nenhum valor em reais por sócio e nenhuma linha "Total 100%".
 * Sócio inativo ainda indicado aparece marcado, com o selo "Inativo", e só pode ser desmarcado.
 */
export function PartnerPicker({ id, partners, selectedIds, onChange, clientActive, isEdit, error, disabled }: PartnerPickerProps) {
  const selected = new Set(selectedIds);
  const hasActivePartner = partners.some((partner) => partner.active);
  const preview = describePartnerPreview(selectedIds.length, clientActive);
  const errorId = `${id}-erro`;
  const previewId = `${id}-previa`;

  function toggle(partnerId: string, checked: boolean) {
    onChange(checked ? [...selectedIds, partnerId] : selectedIds.filter((value) => value !== partnerId));
  }

  const PreviewIcon = preview.tone === "warning" ? TriangleAlert : preview.tone === "info" ? Info : null;

  return (
    <fieldset
      id={id}
      tabIndex={-1}
      className="grid min-w-0 gap-3 outline-none"
      aria-describedby={[previewId, error ? errorId : null].filter(Boolean).join(" ")}
      aria-required={clientActive ? "true" : undefined}
    >
      <legend className="text-sm font-medium">
        Sócios do cliente {clientActive && <span aria-hidden="true">*</span>}
        {clientActive && <span className="sr-only">(obrigatório)</span>}
      </legend>
      <p className="text-sm text-muted-foreground">{PARTNERS_HELP}</p>

      {!hasActivePartner && selectedIds.length === 0 ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-warning-border bg-warning px-3 py-2 text-sm text-warning-foreground">
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
          <span>{NO_ACTIVE_PARTNERS_MESSAGE}</span>
          <Link
            href="/configuracoes/socios/novo"
            className="inline-flex min-h-11 items-center rounded-sm underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring md:min-h-0"
          >
            Cadastrar sócio
          </Link>
        </p>
      ) : (
        <ul
          aria-label="Lista de sócios"
          className={cn("grid gap-1 sm:grid-cols-2", partners.length > LONG_LIST && "max-h-72 overflow-y-auto rounded-lg border p-2")}
        >
          {partners.map((partner) => {
            const checked = selected.has(partner.id);
            // Inativo e desmarcado: não pode voltar a ser indicado (só o ativo entra).
            const blocked = !partner.active && !checked;
            return (
              <li key={partner.id}>
                <label
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm hover:bg-muted md:min-h-9",
                    "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring",
                    (disabled || blocked) && "cursor-not-allowed opacity-60",
                  )}
                >
                  <input
                    type="checkbox"
                    name="partnerIds"
                    value={partner.id}
                    checked={checked}
                    disabled={disabled || blocked}
                    onChange={(event) => toggle(partner.id, event.target.checked)}
                    className="size-5 shrink-0 accent-primary"
                  />
                  <span className="min-w-0 break-words">{partner.name}</span>
                  {!partner.active && <Badge variant="outline">Inativo</Badge>}
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <p
        id={previewId}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={cn(
          "grid gap-0.5 text-sm tabular-nums",
          preview.tone === "warning" ? "font-medium text-warning-foreground" : "text-foreground",
        )}
      >
        <span className="flex items-start gap-1.5">
          {PreviewIcon && <PreviewIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}
          <span>{preview.text}</span>
        </span>
        {preview.extra && <span>{preview.extra}</span>}
      </p>
      <p className="text-xs text-muted-foreground">{DIVISION_FIXED_NOTE}</p>
      {isEdit && <p className="text-xs text-muted-foreground">{PARTNERS_CHANGE_NOTE}</p>}

      {error && <FieldError id={errorId}>{error}</FieldError>}
    </fieldset>
  );
}
