"use client";

import "./globals.css";

import { ErrorPanel } from "@/components/shell/error-panel";

// Substitui o layout raiz quando ele próprio falha: define html/body e importa os estilos.
// Sem shell, com a marca em texto e a mesma mensagem de 4.3. `metadata` não é permitido em
// componentes de cliente; o <title> é um elemento do React.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-muted/40">
        <title>Algo deu errado · Financeiro Ultra</title>
        <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-8">
          <p className="flex items-center gap-2">
            <span aria-hidden="true" className="grid size-8 place-items-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground">
              FU
            </span>
            <span className="text-base font-semibold tracking-tight">Financeiro Ultra</span>
          </p>
          <ErrorPanel error={error} retry={retry} showDashboardLink={false} />
        </main>
      </body>
    </html>
  );
}
