import Link from "next/link";

import { cn } from "@/lib/utils";

export interface StatusFilterOption {
  label: string;
  href: string;
  current: boolean;
}

/**
 * Controle segmentado "Ativos / Inativos / Todos" (UI 9.2 `StatusFilter`): links que levam o estado
 * para a URL (funciona sem JavaScript e sobrevive ao recarregar). A opção atual tem `aria-current`
 * e fundo marcado, além do texto.
 */
export function StatusFilter({ label, options }: { label: string; options: readonly StatusFilterOption[] }) {
  return (
    <nav aria-label={label}>
      <ul className="inline-flex rounded-lg border border-input bg-background p-0.5">
        {options.map((option) => (
          <li key={option.label}>
            <Link
              href={option.href}
              replace
              aria-current={option.current ? "true" : undefined}
              className={cn(
                "inline-flex h-10 min-w-20 items-center justify-center rounded-md px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring md:h-8",
                option.current ? "bg-primary font-medium text-primary-foreground" : "text-foreground hover:bg-muted",
              )}
            >
              {option.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
