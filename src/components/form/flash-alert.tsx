"use client";

import { CircleCheck, Info } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";

interface FlashAlertProps {
  tone: "success" | "info";
  message: string;
  /** Endereço da mesma página sem o aviso: "Dispensar". */
  dismissHref: string;
}

/**
 * Aviso persistente depois de salvar, inativar ou reativar (UI 4.1.9, 6 e 10; U-C17). Vem do
 * redirecionamento (`?aviso=`), é `role="status"` e tem "Dispensar". O foco vai ao título da página
 * quando o aviso aparece, para o leitor de tela ler primeiro onde a pessoa está.
 */
export function FlashAlert({ tone, message, dismissHref }: FlashAlertProps) {
  useEffect(() => {
    document.getElementById("page-title")?.focus({ preventScroll: true });
  }, [message]);

  const Icon = tone === "success" ? CircleCheck : Info;
  return (
    <Alert variant={tone} role="status" className="mb-4 items-center">
      <Icon aria-hidden="true" />
      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <span>{message}</span>
        <Link
          href={dismissHref}
          replace
          className="inline-flex min-h-11 items-center rounded-sm px-1 underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring md:min-h-8"
        >
          Dispensar
        </Link>
      </AlertDescription>
    </Alert>
  );
}
