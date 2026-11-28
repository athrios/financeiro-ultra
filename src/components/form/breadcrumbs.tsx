import { ArrowLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";

export interface Crumb {
  label: string;
  /** Sem `href` = página atual (último item). */
  href?: string;
}

/**
 * Trilha de navegação (UI 9.2 `Breadcrumbs`): `nav` com lista ordenada e `aria-current="page"` no
 * último item. No celular mostra só "← {nível anterior}" (a trilha completa continua disponível ao
 * leitor de tela).
 */
export function Breadcrumbs({ items }: { items: readonly Crumb[] }) {
  const parent = [...items].reverse().find((item) => item.href);

  return (
    <nav aria-label="Você está em" className="mb-3 text-sm">
      <ol className="sr-only items-center gap-1 text-muted-foreground md:not-sr-only md:flex md:flex-wrap">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <Fragment key={`${item.label}-${index}`}>
              <li className="flex min-w-0 items-center gap-1">
                {item.href && !last ? (
                  <Link href={item.href} className="rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring">
                    {item.label}
                  </Link>
                ) : (
                  <span aria-current={last ? "page" : undefined} className={last ? "truncate font-medium text-foreground" : undefined}>
                    {item.label}
                  </span>
                )}
              </li>
              {!last && (
                <li aria-hidden="true" className="flex items-center">
                  <ChevronRight className="size-3.5" />
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
      {parent && (
        <Link
          href={parent.href!}
          className="inline-flex min-h-11 items-center gap-1 rounded-sm text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring md:hidden"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {parent.label}
        </Link>
      )}
    </nav>
  );
}
