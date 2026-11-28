"use client";

import { Loader2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { MouseEvent, Ref } from "react";

import { StatusBadge } from "@/components/form/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DUPLICATE_TEXT,
  DUPLICATE_TITLE,
  duplicateDocumentText,
  duplicateReasonLabel,
} from "@/domain/cadastros/client-form";
import { clientDetailHref } from "@/domain/cadastros/client-view";
import type { DuplicateMatch } from "@/lib/cadastro-errors";

interface DuplicateWarningProps {
  matches: readonly DuplicateMatch[];
  pending: boolean;
  /** Foco do aviso quando ele aparece. */
  containerRef: Ref<HTMLDivElement>;
  /** "Revisar dados" leva o foco ao campo "Nome ou razão social". */
  onReview: () => void;
  /** Clique num link de cliente: a tela pode pedir "Descartar as alterações?" antes de sair. */
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
}

/**
 * Aviso de nome parecido (UI 4.1.7): outro cliente (ativo ou inativo) com o mesmo nome, ou com
 * apelido igual a esse nome. NÃO bloqueia: não usa vermelho e oferece "Salvar mesmo assim" (botão de
 * envio do formulário, que leva a lista confirmada) e "Revisar dados". Enquanto o aviso está na tela, o
 * "Salvar cliente" comum fica oculto (quem decide isso é o formulário).
 */
export function DuplicateWarning({ matches, pending, containerRef, onReview, onNavigate }: DuplicateWarningProps) {
  return (
    <div ref={containerRef} tabIndex={-1} className="outline-none focus-visible:ring-3 focus-visible:ring-ring">
      <Alert variant="warning" role="alert">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>{DUPLICATE_TITLE}</AlertTitle>
        <AlertDescription>
          <p>{DUPLICATE_TEXT}</p>
          <ul aria-label="Clientes parecidos" className="mt-2 grid gap-2">
            {matches.map((match) => {
              const href = clientDetailHref(match.id);
              return (
                <li key={match.id} className="grid gap-1 rounded-lg border border-warning-border bg-background/60 px-3 py-2 text-foreground">
                  <span className="flex flex-wrap items-center gap-2 font-medium break-words">
                    {match.name}
                    <StatusBadge active={match.active} />
                  </span>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {duplicateDocumentText(match)} · {duplicateReasonLabel(match)}
                  </span>
                  <Link
                    href={href}
                    onClick={(event) => onNavigate(event, href)}
                    className="inline-flex min-h-11 w-fit items-center rounded-sm text-sm underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring md:min-h-8"
                  >
                    Abrir cliente
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button type="submit" disabled={pending} className="h-11 md:h-9">
              {pending ? (
                <>
                  <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />
                  Salvando…
                </>
              ) : (
                "Salvar mesmo assim"
              )}
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={onReview} className="h-11 md:h-9">
              Revisar dados
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}
