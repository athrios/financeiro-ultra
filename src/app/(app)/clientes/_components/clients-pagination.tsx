import { ListPagination } from "@/components/form/list-pagination";
import { clientsListHref, type ClientListHrefInput, type PageSize } from "@/domain/cadastros/client-view";

interface ClientsPaginationProps {
  /** Filtros da página atual, sem página nem tamanho. */
  filters: Omit<ClientListHrefInput, "page" | "pageSize">;
  page: number;
  pageSize: PageSize;
  shown: number;
  total: number;
}

/** Paginação da lista de clientes (UI 3.1 item 6): a mesma de `ListPagination`, com o endereço dos clientes. */
export function ClientsPagination({ filters, page, pageSize, shown, total }: ClientsPaginationProps) {
  return (
    <ListPagination
      hrefFor={(nextPage, size) => clientsListHref({ ...filters, page: nextPage, pageSize: size })}
      page={page}
      pageSize={pageSize}
      shown={shown}
      total={total}
    />
  );
}
