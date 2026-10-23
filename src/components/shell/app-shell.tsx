import type { ReactNode } from "react";

import type { NavSection } from "@/lib/navigation";

import { Brand } from "./brand";
import { EnvironmentBanner } from "./environment-banner";
import { initialsOf } from "./initials";
import { MobileNav } from "./mobile-nav";
import { SidebarNav } from "./sidebar-nav";
import { SkipLink } from "./skip-link";
import { UserBlock } from "./user-block";

interface AppShellProps {
  sections: readonly NavSection[];
  displayName: string | null;
  roleText: string | null;
  children: ReactNode;
}

/**
 * Shell completo (03-ui-ux.md, 2.2): barra lateral fixa de 272 px (17rem, D-E5-11) a partir de 1024 px;
 * abaixo disso, barra superior de 56 px com painel lateral. Marcos: header, nav, main.
 */
export function AppShell({ sections, displayName, roleText, children }: AppShellProps) {
  const userBlock = <UserBlock displayName={displayName} roleText={roleText} />;

  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <SkipLink />

      <aside className="sticky top-0 hidden h-svh flex-col border-r bg-sidebar text-sidebar-foreground lg:flex">
        <header className="flex h-14 shrink-0 items-center border-b px-4">
          <Brand />
        </header>
        <SidebarNav sections={sections} />
        {userBlock}
      </aside>

      <div className="flex min-w-0 flex-col">
        <MobileNav sections={sections} userBlock={userBlock} initials={initialsOf(displayName)} />
        <EnvironmentBanner />
        <main id="conteudo" tabIndex={-1} className="flex-1 bg-muted/30 p-4 outline-none md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
