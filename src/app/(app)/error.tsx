"use client";

import { ErrorPanel } from "@/components/shell/error-panel";

// Erro inesperado dentro do shell (03-ui-ux.md, 4.3). O Next 16.4 entrega `retry` (re-busca e
// re-renderiza); `reset` só limparia o estado do boundary.
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorPanel error={error} retry={retry} />;
}
