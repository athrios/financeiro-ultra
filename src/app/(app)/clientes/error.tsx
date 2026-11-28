"use client";

import { ErrorPanel } from "@/components/shell/error-panel";

// Erro de leitura da lista de clientes (UI 3.3): texto da região, "Tentar novamente" e o código de suporte.
export default function ClientsError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <ErrorPanel
      error={error}
      retry={retry}
      title="Não foi possível carregar os clientes."
      description="Tente novamente em instantes."
    />
  );
}
