"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { activeNavHref, type NavSection } from "@/lib/navigation";
import { cn } from "@/lib/utils";

import { NAV_ICONS } from "./nav-icons";

interface SidebarNavProps {
  sections: readonly NavSection[];
  /** Chamado ao acionar um link (o painel móvel fecha o menu). */
  onNavigate?: () => void;
}

/**
 * Menu de módulos (03-ui-ux.md, 2.3). Item ativo com `aria-current="page"`, fundo de
 * acento, peso 600 e barra de 3 px à esquerda (a marca não depende só de cor). Módulos
 * ainda não liberados mostram o selo textual "Em breve" e continuam sendo links.
 */
export function SidebarNav({ sections, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const activeHref = activeNavHref(pathname);

  return (
    <nav aria-label="Principal" className="flex-1 overflow-y-auto px-3 py-4">
      {sections.map((section) => (
        <div key={section.id} className="mb-5 last:mb-0">
          {section.label && (
            <p aria-hidden="true" className="px-3 pb-1 text-[0.7rem] font-semibold tracking-wider text-muted-foreground uppercase">
              {section.label}
            </p>
          )}
          <ul aria-label={section.label ?? undefined} className="grid gap-0.5">
            {section.items.map((item) => {
              const Icon = NAV_ICONS[item.icon];
              const isActive = item.href === activeHref;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    onClick={onNavigate}
                    className={cn(
                      "relative flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-sidebar-foreground outline-none hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-ring lg:min-h-9",
                      isActive &&
                        "bg-sidebar-accent font-semibold before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-primary",
                    )}
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 leading-tight">{item.label}</span>
                    {!item.available && (
                      <Badge variant="outline" className="shrink-0 font-normal">
                        Em breve
                      </Badge>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
