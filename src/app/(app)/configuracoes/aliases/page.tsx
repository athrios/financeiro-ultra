import { Search, Tags } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ListPagination } from "@/components/form/list-pagination";
import { StatusFilter } from "@/components/form/status-filter";
import { EmptyState } from "@/components/shell/empty-state";
import { guardAdminPage } from "@/components/shell/page-guard";
import { PageHeader } from "@/components/shell/page-header";
import { ContentSkeleton } from "@/components/shell/skeletons";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ALIASES_DESCRIPTION,
  ALIASES_EMPTY_TEXT,
  ALIASES_EMPTY_TITLE,
  ALIASES_HREF,
  ALIASES_NO_ACTIVE_TITLE,
  ALIASES_NO_INACTIVE_TITLE,
  ALIASES_NO_RESULT_TITLE,
  ALIASES_SEARCH_HELP,
  ALIAS_KIND_OPTIONS,
  aliasesEmptyKind,
  aliasesListHref,
  describeAliasCount,
  hasAliasFilters,
  kindParamOf,
  parseAliasListParams,
  type AliasListParams,
} from "@/domain/cadastros/alias-view";
import { pageOffset } from "@/domain/cadastros/client-view";
import { statusParamOf } from "@/domain/cadastros/partner-view";
import { searchAliasesSchema } from "@/domain/cadastros/schemas";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import { searchAliases } from "@/server/clients/clients";

import { AliasesCards, AliasesTable } from "./_components/aliases-list";

export const metadata: Metadata = {
  title: "Apelidos",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const FIELD_CLASS = "h-11 md:h-9";
const ACTION_CLASS = cn(buttonVariants({ variant: "outline" }), FIELD_CLASS);

/**
 * Lista consolidada de apelidos (UI 5.4): "este texto pertence a quem?". Só leitura e só do
 * Administrador (matriz 2.3: Operador e Visualizador veem "Sem permissão", e `search_aliases` devolve
 * lista vazia a eles por RLS). `searchParams` é dado de requisição, então a leitura inteira fica atrás
 * do <Suspense> desta página (Cache Components). Busca, tipo, situação e página vivem na URL
 * (`?q=&tipo=&status=&pagina=&por=`): funcionam sem JavaScript e sobrevivem ao recarregar.
 */
export default function AliasesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <AliasesContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AliasesContent({ searchParams }: { searchParams: SearchParams }) {
  const guard = await guardAdminPage(ALIASES_HREF);
  if (!guard.allowed) return guard.node;

  const params = parseAliasListParams(await searchParams);
  const filtered = hasAliasFilters(params);
  const filters = { q: params.query, kind: params.kind, status: params.status };

  const page = await searchAliases(
    guard.supabase,
    searchAliasesSchema.parse({
      query: params.query || null,
      kind: params.kind,
      status: params.status,
      limit: params.pageSize,
      offset: pageOffset(params.page, params.pageSize),
    }),
  );

  // Página além do fim (a lista encolheu ou a URL foi mexida): volta à primeira.
  if (page.items.length === 0 && params.page > 1) {
    redirect(aliasesListHref({ ...filters, pageSize: params.pageSize }));
  }

  const total = page.total ?? page.items.length;

  return (
    <>
      <PageHeader title="Apelidos" description={ALIASES_DESCRIPTION} />

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
        <form
          role="search"
          action={ALIASES_HREF}
          method="get"
          className="flex flex-1 flex-col gap-3 md:min-w-[28rem] md:flex-row md:items-end"
        >
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="busca-apelido">Buscar texto</Label>
            <Input
              id="busca-apelido"
              name="q"
              type="search"
              defaultValue={params.query}
              autoComplete="off"
              aria-describedby="busca-apelido-ajuda"
              className={FIELD_CLASS}
            />
          </div>
          <div className="flex flex-col gap-2 md:w-64">
            <Label htmlFor="filtro-tipo">Tipo</Label>
            <select
              id="filtro-tipo"
              name="tipo"
              defaultValue={params.kind ? kindParamOf(params.kind) : ""}
              className={cn(
                "w-full rounded-lg border border-input bg-background px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm",
                FIELD_CLASS,
              )}
            >
              {ALIAS_KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {params.status !== "ACTIVE" && <input type="hidden" name="status" value={statusParamOf(params.status)} />}
          {params.pageSize !== 25 && <input type="hidden" name="por" value={params.pageSize} />}
          <Button type="submit" variant="outline" className={cn("shrink-0", FIELD_CLASS)}>
            <Search aria-hidden="true" />
            Buscar
          </Button>
        </form>
        <p id="busca-apelido-ajuda" className="w-full text-xs text-muted-foreground md:order-last">
          {ALIASES_SEARCH_HELP}
        </p>

        <StatusFilter
          label="Situação dos apelidos"
          options={[
            {
              label: "Ativos",
              href: aliasesListHref({ ...filters, status: "ACTIVE", pageSize: params.pageSize }),
              current: params.status === "ACTIVE",
            },
            {
              label: "Inativos",
              href: aliasesListHref({ ...filters, status: "INACTIVE", pageSize: params.pageSize }),
              current: params.status === "INACTIVE",
            },
            {
              label: "Todos",
              href: aliasesListHref({ ...filters, status: "ALL", pageSize: params.pageSize }),
              current: params.status === "ALL",
            },
          ]}
        />

        {filtered && (
          <Link
            href={ALIASES_HREF}
            className="inline-flex min-h-11 items-center rounded-sm px-1 text-sm underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring md:min-h-8"
          >
            Limpar filtros
          </Link>
        )}
      </div>

      {page.items.length === 0 ? (
        <AliasesEmpty params={params} supabase={guard.supabase} />
      ) : (
        <>
          <p role="status" className="mb-2 text-sm text-muted-foreground">
            {describeAliasCount(total, params)}
          </p>
          <AliasesTable items={page.items} />
          <AliasesCards items={page.items} />
          <ListPagination
            hrefFor={(nextPage, size) => aliasesListHref({ ...filters, page: nextPage, pageSize: size })}
            page={params.page}
            pageSize={params.pageSize}
            shown={page.items.length}
            total={total}
          />
        </>
      )}
    </>
  );
}

/**
 * Estados vazios (UI 5.4 e T-31). Sem busca nem tipo, pergunta ao banco se existe algum texto em qualquer
 * situação: nenhum = "Nenhum apelido cadastrado ainda."; só na outra situação = "Nenhum texto ativo." com
 * "Ver inativos" (ou "Nenhum texto inativo." com "Ver ativos"). Com busca ou tipo, é sempre "Nenhum texto
 * encontrado." com "Limpar filtros".
 */
async function AliasesEmpty({ params, supabase }: { params: AliasListParams; supabase: AppSupabaseClient }) {
  let anyExists = true;
  if (params.query === "" && params.kind === null) {
    const any = await searchAliases(supabase, searchAliasesSchema.parse({ status: "ALL", limit: 1, offset: 0 }));
    anyExists = (any.total ?? 0) > 0;
  }
  const kind = aliasesEmptyKind(params, anyExists);

  if (kind === "NONE_AT_ALL") {
    return (
      <EmptyState icon={Tags} title={ALIASES_EMPTY_TITLE}>
        <p>{ALIASES_EMPTY_TEXT}</p>
      </EmptyState>
    );
  }

  if (kind === "NO_ACTIVE" || kind === "NO_INACTIVE") {
    const toInactive = kind === "NO_ACTIVE";
    return (
      <EmptyState
        icon={Search}
        title={toInactive ? ALIASES_NO_ACTIVE_TITLE : ALIASES_NO_INACTIVE_TITLE}
        action={
          <Link
            href={aliasesListHref({ status: toInactive ? "INACTIVE" : "ACTIVE", pageSize: params.pageSize })}
            className={ACTION_CLASS}
          >
            {toInactive ? "Ver inativos" : "Ver ativos"}
          </Link>
        }
      />
    );
  }

  return (
    <EmptyState
      icon={Search}
      title={ALIASES_NO_RESULT_TITLE}
      action={
        <Link href={ALIASES_HREF} className={ACTION_CLASS}>
          Limpar filtros
        </Link>
      }
    />
  );
}
