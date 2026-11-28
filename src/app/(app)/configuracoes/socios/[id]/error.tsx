"use client";

import { ErrorPanel } from "@/components/shell/error-panel";

// Erro de leitura do detalhe ou da edição do sócio (UI 5.3).
export default function PartnerError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <ErrorPanel
      error={error}
      retry={retry}
      title="Não foi possível carregar este sócio."
      description="Tente novamente em instantes."
    />
  );
}
