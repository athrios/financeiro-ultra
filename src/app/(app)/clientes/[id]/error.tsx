"use client";

import { ErrorPanel } from "@/components/shell/error-panel";

// Erro de leitura do detalhe do cliente (UI 4.2).
export default function ClientError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <ErrorPanel
      error={error}
      retry={retry}
      title="Não foi possível carregar este cliente."
      description="Tente novamente em instantes."
    />
  );
}
