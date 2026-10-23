"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ErrorPanelProps {
  /** Erro recebido do error boundary. Só o `digest` é mostrado; nunca a mensagem nem a stack. */
  error: unknown;
  retry: () => void;
  /** Mostra o link "Voltar ao Dashboard" (dentro do shell). */
  showDashboardLink?: boolean;
  /** Nível do título: h1 por padrão (o painel é a página). */
  headingLevel?: "h1" | "h2";
}

function supportCode(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "digest" in error) {
    const digest = (error as { digest?: unknown }).digest;
    if (typeof digest === "string" && digest !== "") return digest;
  }
  return null;
}

/**
 * Erro inesperado de página (03-ui-ux.md, 4.3): texto neutro, "Tentar novamente" e o "Código
 * de suporte" (digest do Next, que é o que o log do servidor registra). Nunca mostra mensagem
 * técnica, stack, SQLSTATE nem nome de tabela.
 */
export function ErrorPanel({ error, retry, showDashboardLink = true, headingLevel = "h1" }: ErrorPanelProps) {
  const code = supportCode(error);
  const Heading = headingLevel;

  return (
    <Card className="mx-auto w-full max-w-md" role="alert">
      <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
        <span aria-hidden="true" className="grid size-12 place-items-center rounded-full border border-danger-border bg-danger text-danger-foreground">
          <TriangleAlert className="size-6" />
        </span>
        <Heading className="text-xl font-semibold">Algo deu errado</Heading>
        <p className="text-sm text-muted-foreground">Não foi possível exibir esta página. Tente novamente.</p>
        {code && (
          <p className="text-xs text-muted-foreground">
            Código de suporte: <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground select-all">{code}</code>
          </p>
        )}
        <div className="mt-2 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          <Button type="button" onClick={() => retry()} className="h-11 sm:h-9">
            Tentar novamente
          </Button>
          {showDashboardLink && (
            <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "h-11 sm:h-9")}>
              Voltar ao Dashboard
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
