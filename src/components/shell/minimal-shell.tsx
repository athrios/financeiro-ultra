import type { ReactNode } from "react";

import { Brand } from "./brand";
import { EnvironmentBanner } from "./environment-banner";
import { SkipLink } from "./skip-link";
import { UserBlock } from "./user-block";

interface MinimalShellProps {
  displayName: string | null;
  roleText: string | null;
  children: ReactNode;
}

/**
 * Shell mínimo dos estados de acesso (03-ui-ux.md, 2.7): barra superior com a marca,
 * SEM menu de módulos e sem nenhuma consulta a dado de negócio. O bloco do usuário (com
 * o botão "Sair") fica abaixo do cartão de estado.
 */
export function MinimalShell({ displayName, roleText, children }: MinimalShellProps) {
  return (
    <div className="flex min-h-svh flex-col">
      <SkipLink />
      <header className="flex h-14 shrink-0 items-center border-b bg-background px-4">
        <Brand />
      </header>
      <EnvironmentBanner />
      <main id="conteudo" tabIndex={-1} className="flex-1 bg-muted/30 p-4 outline-none md:p-6">
        {children}
        <div className="mx-auto mt-4 w-full max-w-md rounded-xl border bg-card">
          <UserBlock displayName={displayName} roleText={roleText} />
        </div>
      </main>
    </div>
  );
}
