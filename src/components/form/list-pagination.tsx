import Link from "next/link";

import { PAGE_SIZES, describePageRange, pageCount, type PageSize } from "@/domain/cadastros/client-view";
import { cn } from "@/lib/utils";

const NAV_BUTTON =
  "inline-flex h-11 min-w-24 items-center justify-center rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring md:h-8";
const NAV_BUTTON_OFF = "pointer-events-none text-muted-foreground opacity-60";

interface ListPaginationProps {
  /** Endereço da lista na página `page` com `pageSize` itens por página, mantendo os filtros. */
  hrefFor: (page: number, pageSize: PageSize) => string;
  page: number;
  pageSize: PageSize;
  shown: number;
  total: number;
}

/**
 * Paginação no servidor (UI 3.1 item 6 e 5.4): "1–25 de 128", "Anterior" e "Próxima", e o seletor "Por
 * página" (25, 50, 100; some no celular). Tudo são links: funciona sem JavaScript. Serve às listas de
 * clientes e de apelidos; cada uma diz como montar o endereço.
 */
export function ListPagination({ hrefFor, page, pageSize, shown, total }: ListPaginationProps) {
  const pages = pageCount(total, pageSize);
  const range = describePageRange((page - 1) * pageSize, shown, total);

  return (
    <nav aria-label="Paginação" className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
        <p role="status" className="text-center text-sm text-muted-foreground md:order-2 md:text-left">
          {range}
        </p>
        {page > 1 ? (
          <Link href={hrefFor(page - 1, pageSize)} rel="prev" className={cn(NAV_BUTTON, "md:order-1")}>
            Anterior
          </Link>
        ) : (
          <span aria-disabled="true" className={cn(NAV_BUTTON, NAV_BUTTON_OFF, "md:order-1")}>
            Anterior
          </span>
        )}
        {page < pages ? (
          <Link href={hrefFor(page + 1, pageSize)} rel="next" className={cn(NAV_BUTTON, "md:order-3")}>
            Próxima
          </Link>
        ) : (
          <span aria-disabled="true" className={cn(NAV_BUTTON, NAV_BUTTON_OFF, "md:order-3")}>
            Próxima
          </span>
        )}
      </div>

      {total > PAGE_SIZES[0] && (
        <div className="hidden items-center gap-2 text-sm md:flex">
          <span className="text-muted-foreground">Por página</span>
          <ul className="inline-flex rounded-lg border border-input bg-background p-0.5">
            {PAGE_SIZES.map((size) => (
              <li key={size}>
                <Link
                  href={hrefFor(1, size)}
                  replace
                  aria-current={size === pageSize ? "true" : undefined}
                  className={cn(
                    "inline-flex h-7 min-w-10 items-center justify-center rounded-md px-2 outline-none focus-visible:ring-3 focus-visible:ring-ring",
                    size === pageSize ? "bg-primary font-medium text-primary-foreground" : "hover:bg-muted",
                  )}
                >
                  {size}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
}
