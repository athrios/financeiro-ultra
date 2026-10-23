import type { ReactNode } from "react";

import { Brand } from "@/components/shell/brand";
import { EnvironmentBanner } from "@/components/shell/environment-banner";
import { SkipLink } from "@/components/shell/skip-link";

/**
 * Moldura das telas de autenticação (03-ui-ux.md, 2.1): cartão centralizado de até 384 px
 * com a marca, sem menu de módulos. Em celular o cartão fica alinhado ao topo.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-muted/40">
      <SkipLink />
      <EnvironmentBanner />
      <main id="conteudo" tabIndex={-1} className="flex flex-1 items-start justify-center px-4 py-8 outline-none md:items-center">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex justify-center">
            <Brand />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
