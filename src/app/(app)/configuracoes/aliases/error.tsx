"use client";

import { ErrorPanel } from "@/components/shell/error-panel";

// Erro de leitura da lista de apelidos (UI 5.4): texto da região, "Tentar novamente" e o código de suporte.
export default function AliasesError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <ErrorPanel
      error={error}
      retry={retry}
      title="Não foi possível carregar os apelidos."
      description="Tente novamente em instantes."
    />
  );
}
