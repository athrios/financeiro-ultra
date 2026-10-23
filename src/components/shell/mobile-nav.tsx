"use client";

import { Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { NavSection } from "@/lib/navigation";

import { Brand } from "./brand";
import { SidebarNav } from "./sidebar-nav";

interface MobileNavProps {
  sections: readonly NavSection[];
  /** Bloco do usuário (renderizado no servidor) e iniciais para o botão da barra superior. */
  userBlock: ReactNode;
  initials: string;
}

/**
 * Barra superior fixa de 56 px (< 1024 px) com botão de menu, marca e botão do usuário.
 * Os dois botões abrem o mesmo painel lateral, que replica a barra lateral do desktop.
 * Foco preso enquanto aberto, Esc fecha e o foco volta ao botão que abriu.
 */
export function MobileNav({ sections, userBlock, initials }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b bg-background px-3 lg:hidden">
      <Button type="button" variant="ghost" className="size-11" aria-label="Abrir menu" onClick={() => setOpen(true)}>
        <Menu aria-hidden="true" className="size-5" />
      </Button>
      <Brand />
      <Button
        type="button"
        variant="ghost"
        className="size-11 rounded-full"
        aria-label="Abrir menu e conta"
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-secondary text-xs font-semibold">
          {initials}
        </span>
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
            <SheetTitle className="sr-only">Menu principal</SheetTitle>
            <Brand />
            <SheetClose render={<Button type="button" variant="ghost" className="size-11" aria-label="Fechar menu" />}>
              <X aria-hidden="true" className="size-5" />
            </SheetClose>
          </div>
          <SidebarNav sections={sections} onNavigate={() => setOpen(false)} />
          {userBlock}
        </SheetContent>
      </Sheet>
    </header>
  );
}
