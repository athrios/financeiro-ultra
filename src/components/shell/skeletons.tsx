import { Skeleton } from "@/components/ui/skeleton";
import { Brand } from "./brand";

/**
 * Esqueleto da área de conteúdo (03-ui-ux.md, 4.1): o shell permanece. Só aparece depois de
 * ~300 ms (`delayed-appear`), para não piscar em respostas rápidas (UX-22). O pulso só roda
 * com movimento permitido (`motion-safe`, no Skeleton).
 */
export function ContentSkeleton() {
  return (
    <div className="delayed-appear" aria-busy="true">
      <p role="status" className="sr-only">
        Carregando…
      </p>
      <Skeleton className="mb-2 h-8 w-56 max-w-full" />
      <Skeleton className="mb-6 h-4 w-80 max-w-full" />
      <Skeleton className="h-48 w-full max-w-2xl" />
    </div>
  );
}

/**
 * Enquanto a sessão e o perfil carregam (antes de saber qual shell mostrar): barra com a marca
 * e o mesmo esqueleto atrasado. Evita um salto de layout para o shell completo.
 */
export function ShellFallback() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 shrink-0 items-center border-b bg-background px-4">
        <Brand />
      </header>
      <main className="flex-1 bg-muted/30 p-4 md:p-6">
        <ContentSkeleton />
      </main>
    </div>
  );
}
