"use client";

import { ErrorPanel } from "@/components/shell/error-panel";

// Erro de leitura da lista de sócios (UI 5.1): texto da região, "Tentar novamente" e o código de suporte.
export default function PartnersError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <ErrorPanel
      error={error}
      retry={retry}
      title="Não foi possível carregar os sócios."
      description="Tente novamente em instantes."
    />
  );
}
