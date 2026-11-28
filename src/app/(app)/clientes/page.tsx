import { Search, Users, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { FlashAlert } from "@/components/form/flash-alert";
import { StatusFilter } from "@/components/form/status-filter";
import { EmptyState } from "@/components/shell/empty-state";
import { guardPage } from "@/components/shell/page-guard";
import { PageHeader } from "@/components/shell/page-header";
import { ContentSkeleton } from "@/components/shell/skeletons";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CLIENTS_HREF,
  CLIENTS_SEARCH_HELP,
  NEW_CLIENT_HREF,
  clientsListHref,
  describeClientCount,
  hasClientFilters,
  pageOffset,
  parseClientFlash,
  parseClientListParams,
  type ClientListParams,
} from "@/domain/cadastros/client-view";
import { statusParamOf } from "@/domain/cadastros/partner-view";
import { searchClientsSchema } from "@/domain/cadastros/schemas";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import { listActivePartnerNamesByClient, searchClients } from "@/server/clients/clients";
import { listPartnerFilterOptions, type PartnerFilterOption } from "@/server/partners/partners";

import { ClientsCards, ClientsTable } from "./_components/clients-list";
import { ClientsPagination } from "./_components/clients-pagination";

export const metadata: Metadata = {
  title: "Clientes",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const DESCRIPTION = "Cadastro de clientes, com documento, mensalidade e sócios.";
const FIELD_CLASS = "h-11 md:h-9";

/**
 * Lista de clientes (UI 3; Administrador, Operador e Visualizador). `searchParams` é dado de
 * requisição, então a leitura inteira fica atrás do <Suspense> desta página (Cache Components). Busca,
 * situação, sócio e página vivem na URL (`?q=&status=&socio=&pagina=&por=`): funcionam sem JavaScript
 * e sobrevivem ao recarregar. O papel só decide se "Novo cliente" aparece; o que cada papel lê é do RLS.
 */
export default function ClientsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <ClientsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ClientsContent({ searchParams }: { searchParams: SearchParams }) {
  const guard = await guardPage(CLIENTS_HREF);
  if (!guard.allowed) return guard.node;

  const raw = await searchParams;
  const parsed = parseClientListParams(raw);
  const flash = parseClientFlash(raw.aviso);
  const isAdmin = guard.role === "ADMINISTRATOR";

  const partners = await listPartnerFilterOptions(guard.supabase);
  // Sócio desconhecido na URL (apagado de mão ou de outro ambiente) é como não ter filtro de sócio.
  const partner = partners.find((option) => option.id === parsed.partnerId) ?? null;
  const params: ClientListParams = { ...parsed, partnerId: partner?.id ?? null };
  const filtered = hasClientFilters(params);

  const baseSearch = { query: params.query || null, partnerId: params.partnerId, limit: params.pageSize } as const;
  const page = await searchClients(
    guard.supabase,
    searchClientsSchema.parse({ ...baseSearch, status: params.status, offset: pageOffset(params.page, params.pageSize) }),
  );

  // Página além do fim (a lista encolheu ou a URL foi mexida): volta à primeira.
  if (page.items.length === 0 && params.page > 1) {
    redirect(clientsListHref({ q: params.query, status: params.status, partnerId: params.partnerId, pageSize: params.pageSize }));
  }

  const partnerNames = await listActivePartnerNamesByClient(
    guard.supabase,
    page.items.map((client) => client.id),
  );
  const rows = page.items.map((client) => ({ client, partnerNames: partnerNames.get(client.id) ?? [] }));
  const total = page.total ?? rows.length;
  const filterHref = { q: params.query, status: params.status, partnerId: params.partnerId };

  return (
    <>
      {flash && <FlashAlert tone={flash.tone} message={flash.message} dismissHref={CLIENTS_HREF} />}

      <PageHeader
        title="Clientes"
        description={DESCRIPTION}
        actions={
          isAdmin ? (
            <Link href={NEW_CLIENT_HREF} className={cn(buttonVariants(), FIELD_CLASS)}>
              Novo cliente
            </Link>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
        <form role="search" action={CLIENTS_HREF} method="get" className="flex flex-1 flex-col gap-3 md:min-w-[28rem] md:flex-row md:items-end">
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="busca-cliente">Buscar cliente</Label>
            <Input
              id="busca-cliente"
              name="q"
              type="search"
              defaultValue={params.query}
              autoComplete="off"
              aria-describedby="busca-cliente-ajuda"
              className={FIELD_CLASS}
            />
          </div>
          <div className="flex flex-col gap-2 md:w-56">
            <Label htmlFor="filtro-socio">Sócio</Label>
            <select
              id="filtro-socio"
              name="socio"
              defaultValue={params.partnerId ?? ""}
              className={cn(
                "w-full rounded-lg border border-input bg-background px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm",
                FIELD_CLASS,
              )}
            >
              <option value="">Todos os sócios</option>
              {partners.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.active ? option.name : `${option.name} (inativo)`}
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
        <p id="busca-cliente-ajuda" className="w-full text-xs text-muted-foreground md:order-last">
          {CLIENTS_SEARCH_HELP}
        </p>

        <StatusFilter
          label="Situação dos clientes"
          options={[
            { label: "Ativos", href: clientsListHref({ ...filterHref, status: "ACTIVE", pageSize: params.pageSize }), current: params.status === "ACTIVE" },
            { label: "Inativos", href: clientsListHref({ ...filterHref, status: "INACTIVE", pageSize: params.pageSize }), current: params.status === "INACTIVE" },
            { label: "Todos", href: clientsListHref({ ...filterHref, status: "ALL", pageSize: params.pageSize }), current: params.status === "ALL" },
          ]}
        />
      </div>

      {filtered && <AppliedFilters params={params} partner={partner} />}

      {rows.length === 0 ? (
        <ClientsEmpty
          params={params}
          isAdmin={isAdmin}
          hasActivePartner={partners.some((option) => option.active)}
          supabase={guard.supabase}
        />
      ) : (
        <>
          <p role="status" className="mb-2 text-sm text-muted-foreground">
            {describeClientCount(total, params)}
          </p>
          <ClientsTable rows={rows} />
          <ClientsCards rows={rows} />
          <ClientsPagination
            filters={filterHref}
            page={params.page}
            pageSize={params.pageSize}
            shown={rows.length}
            total={total}
          />
        </>
      )}
    </>
  );
}

const CHIP_CLASS = "inline-flex min-h-8 items-center gap-1 rounded-full border bg-muted px-3 py-1 text-sm";
const CHIP_REMOVE_CLASS =
  "-mr-1 inline-flex size-8 items-center justify-center rounded-full outline-none hover:bg-background focus-visible:ring-3 focus-visible:ring-ring md:size-6";

/**
 * Chips dos filtros aplicados (UI 3.1 item 3) e "Limpar filtros". O sócio aparece pelo NOME, com um
 * jeito de tirar só aquele filtro; sem este bloco o filtro por sócio vindo do detalhe do sócio ficaria
 * invisível.
 */
function AppliedFilters({ params, partner }: { params: ClientListParams; partner: PartnerFilterOption | null }) {
  const keep = { pageSize: params.pageSize };
  const statusLabel = params.status === "INACTIVE" ? "Inativos" : "Todos";
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <ul aria-label="Filtros aplicados" className="flex flex-wrap items-center gap-2">
        {params.query !== "" && (
          <li className={CHIP_CLASS}>
            <span className="break-all">Busca: {params.query}</span>
            <Link
              href={clientsListHref({ ...keep, status: params.status, partnerId: params.partnerId })}
              aria-label={`Remover o filtro Busca: ${params.query}`}
              className={CHIP_REMOVE_CLASS}
            >
              <X aria-hidden="true" className="size-4" />
            </Link>
          </li>
        )}
        {partner && (
          <li className={CHIP_CLASS}>
            <span>
              Sócio: {partner.name}
              {partner.active ? "" : " (inativo)"}
            </span>
            <Link
              href={clientsListHref({ ...keep, q: params.query, status: params.status })}
              aria-label={`Remover o filtro Sócio: ${partner.name}`}
              className={CHIP_REMOVE_CLASS}
            >
              <X aria-hidden="true" className="size-4" />
            </Link>
          </li>
        )}
        {params.status !== "ACTIVE" && (
          <li className={CHIP_CLASS}>
            <span>Situação: {statusLabel}</span>
            <Link
              href={clientsListHref({ ...keep, q: params.query, partnerId: params.partnerId })}
              aria-label={`Remover o filtro Situação: ${statusLabel}`}
              className={CHIP_REMOVE_CLASS}
            >
              <X aria-hidden="true" className="size-4" />
            </Link>
          </li>
        )}
      </ul>
      <Link
        href={CLIENTS_HREF}
        className="inline-flex min-h-11 items-center rounded-sm px-1 text-sm underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring md:min-h-8"
      >
        Limpar filtros
      </Link>
    </div>
  );
}

const ACTION_CLASS = cn(buttonVariants({ variant: "outline" }), FIELD_CLASS);

/** Estados vazios da lista (UI 3.3). */
async function ClientsEmpty({
  params,
  isAdmin,
  hasActivePartner,
  supabase,
}: {
  params: ClientListParams;
  isAdmin: boolean;
  hasActivePartner: boolean;
  supabase: AppSupabaseClient;
}) {
  const plain = params.query === "" && params.partnerId === null;

  // Só "Ativos" ou "Inativos" vazio, sem busca nem sócio: pode haver clientes na outra situação.
  let nothingAtAll = plain && params.status === "ALL";
  if (plain && params.status === "ACTIVE") {
    const any = await searchClients(supabase, searchClientsSchema.parse({ status: "ALL", limit: 1, offset: 0 }));
    nothingAtAll = (any.total ?? 0) === 0;
    if (!nothingAtAll) {
      return (
        <EmptyState
          icon={Users}
          title="Nenhum cliente ativo."
          action={
            <Link href={clientsListHref({ status: "INACTIVE", pageSize: params.pageSize })} className={ACTION_CLASS}>
              Ver inativos
            </Link>
          }
        />
      );
    }
  }

  if (plain && params.status === "INACTIVE") {
    return (
      <EmptyState
        icon={Users}
        title="Nenhum cliente inativo."
        action={
          <Link href={clientsListHref({ pageSize: params.pageSize })} className={ACTION_CLASS}>
            Ver ativos
          </Link>
        }
      />
    );
  }

  if (nothingAtAll) {
    if (!isAdmin) {
      return (
        <EmptyState icon={Users} title="Nenhum cliente cadastrado">
          <p>Peça a um Administrador para cadastrar os clientes.</p>
        </EmptyState>
      );
    }
    if (!hasActivePartner) {
      return (
        <EmptyState
          icon={Users}
          title="Cadastre um sócio antes de cadastrar clientes"
          action={
            <Link href="/configuracoes/socios/novo" className={cn(buttonVariants(), FIELD_CLASS)}>
              Ir para Sócios
            </Link>
          }
        >
          <p>Cada cliente precisa de pelo menos um sócio.</p>
        </EmptyState>
      );
    }
    return (
      <EmptyState
        icon={Users}
        title="Nenhum cliente cadastrado"
        action={
          <Link href={NEW_CLIENT_HREF} className={cn(buttonVariants(), FIELD_CLASS)}>
            Novo cliente
          </Link>
        }
      >
        <p>Cadastre o primeiro cliente para começar.</p>
      </EmptyState>
    );
  }

  // Sem resultado: se o filtro está em "Ativos", avisa dos inativos que casam (PROPOSTA da UI, cortável).
  let inactiveMatches = 0;
  if (params.status === "ACTIVE") {
    const inactive = await searchClients(
      supabase,
      searchClientsSchema.parse({ query: params.query || null, partnerId: params.partnerId, status: "INACTIVE", limit: 1, offset: 0 }),
    );
    inactiveMatches = inactive.total ?? 0;
  }

  return (
    <EmptyState
      icon={Search}
      title="Nenhum cliente encontrado"
      action={
        <>
          <Link href={CLIENTS_HREF} className={ACTION_CLASS}>
            Limpar filtros
          </Link>
          {inactiveMatches > 0 && (
            <Link
              href={clientsListHref({ q: params.query, status: "INACTIVE", partnerId: params.partnerId, pageSize: params.pageSize })}
              className={ACTION_CLASS}
            >
              Ver inativos
            </Link>
          )}
        </>
      }
    >
      <p>Nenhum cliente corresponde à busca e aos filtros aplicados.</p>
      {inactiveMatches > 0 && (
        <p className="mt-1">
          {inactiveMatches === 1
            ? "Há 1 cliente inativo com essa busca."
            : `Há ${inactiveMatches} clientes inativos com essa busca.`}
        </p>
      )}
    </EmptyState>
  );
}
