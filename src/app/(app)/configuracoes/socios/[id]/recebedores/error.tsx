"use client";

import { ErrorPanel } from "@/components/shell/error-panel";

// Erro de leitura do recebedor (UI 7.3): a lista de recebedores do detalhe do sócio usa o erro do sócio.
export default function ReceiverError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <ErrorPanel
      error={error}
      retry={retry}
      title="Não foi possível carregar este recebedor."
      description="Tente novamente em instantes."
    />
  );
}
