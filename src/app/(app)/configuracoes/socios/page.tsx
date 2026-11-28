import { Handshake, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { StatusBadge } from "@/components/form/status-badge";
import { StatusFilter } from "@/components/form/status-filter";
import { EmptyState } from "@/components/shell/empty-state";
import { guardPage } from "@/components/shell/page-guard";
import { PageHeader } from "@/components/shell/page-header";
import { ContentSkeleton } from "@/components/shell/skeletons";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  type PartnersEmptyKind,
  parseQueryParam,
  parseStatusParam,
  partnersEmptyKind,
  partnersListHref,
  statusParamOf,
} from "@/domain/cadastros/partner-view";
import { cn } from "@/lib/utils";
import { listPartners, type PartnerListItem } from "@/server/partners/partners";

export const metadata: Metadata = {
  title: "Sócios",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const HREF = "/configuracoes/socios";

/**
 * Lista de sócios (UI 5.1; só o Administrador). `searchParams` é dado de requisição: a leitura
 * inteira fica atrás do <Suspense> desta página (Cache Components). A busca e a situação vivem na
 * URL (`?q=&status=`), então funcionam sem JavaScript e sobrevivem ao recarregar.
 */
export default function PartnersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <PartnersContent searchParams={searchParams} />
    </Suspense>
  );
}

async function PartnersContent({ searchParams }: { searchParams: SearchParams }) {
  const guard = await guardPage(HREF);
  if (!guard.allowed) return guard.node;

  const params = await searchParams;
  const query = parseQueryParam(params.q);
  const status = parseStatusParam(params.status);
  const filtered = query !== "" || status !== "ACTIVE";

  const partners = await listPartners(guard.supabase, { status, query });
  // "Ativos" vazio e sem busca: só vale dizer "cadastrado" se não houver sócio inativo (T-23).
  const hasInactive =
    partners.length === 0 && status === "ACTIVE" && query === ""
      ? (await listPartners(guard.supabase, { status: "INACTIVE" })).length > 0
      : false;

  return (
    <>
      <PageHeader
        title="Sócios"
        description="Cadastro de sócios, seus recebedores e apelidos."
        actions={
          <Link href="/configuracoes/socios/novo" className={cn(buttonVariants(), "h-11 md:h-9")}>
            Novo sócio
          </Link>
        }
      />

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end">
        <form role="search" action={HREF} method="get" className="flex flex-1 flex-col gap-2 md:max-w-md">
          <Label htmlFor="busca-socio">Buscar sócio</Label>
          <div className="flex gap-2">
            <Input
              id="busca-socio"
              name="q"
              type="search"
              defaultValue={query}
              autoComplete="off"
              aria-describedby="busca-socio-ajuda"
              className="h-11 md:h-9"
            />
            {status !== "ACTIVE" && <input type="hidden" name="status" value={statusParamOf(status)} />}
            <Button type="submit" variant="outline" className="h-11 shrink-0 md:h-9">
              <Search aria-hidden="true" />
              Buscar
            </Button>
          </div>
          <p id="busca-socio-ajuda" className="text-xs text-muted-foreground">
            Pelo nome ou por um apelido. A busca ignora acento, maiúscula e pontuação.
          </p>
        </form>

        <StatusFilter
          label="Situação dos sócios"
          options={[
            { label: "Ativos", href: partnersListHref({ q: query, status: "ACTIVE" }), current: status === "ACTIVE" },
            { label: "Inativos", href: partnersListHref({ q: query, status: "INACTIVE" }), current: status === "INACTIVE" },
            { label: "Todos", href: partnersListHref({ q: query, status: "ALL" }), current: status === "ALL" },
          ]}
        />

        {filtered && (
          <Link
            href={HREF}
            className="inline-flex min-h-11 items-center rounded-sm px-1 text-sm underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring md:min-h-8"
          >
            Limpar filtros
          </Link>
        )}
      </div>

      {partners.length === 0 ? (
        <PartnersEmpty kind={partnersEmptyKind({ status, query, hasInactive })} />
      ) : (
        <>
          <p role="status" className="mb-2 text-sm text-muted-foreground">
            {partners.length === 1 ? "1 sócio" : `${partners.length} sócios`}
          </p>
          <PartnersTable partners={partners} />
          <PartnersCards partners={partners} />
        </>
      )}
    </>
  );
}

function PartnersEmpty({ kind }: { kind: PartnersEmptyKind }) {
  if (kind === "NO_MATCH") {
    return (
      <EmptyState
        icon={Search}
        title="Nenhum sócio encontrado."
        action={
          <Link href={HREF} className={cn(buttonVariants({ variant: "outline" }), "h-11 md:h-9")}>
            Limpar filtros
          </Link>
        }
      />
    );
  }
  if (kind === "NO_INACTIVE") {
    return (
      <EmptyState
        icon={Handshake}
        title="Nenhum sócio inativo."
        action={
          <Link href={HREF} className={cn(buttonVariants({ variant: "outline" }), "h-11 md:h-9")}>
            Ver ativos
          </Link>
        }
      />
    );
  }
  if (kind === "NO_ACTIVE") {
    return (
      <EmptyState
        icon={Handshake}
        title="Nenhum sócio ativo."
        action={
          <>
            <Link
              href={partnersListHref({ status: "INACTIVE" })}
              className={cn(buttonVariants({ variant: "outline" }), "h-11 md:h-9")}
            >
              Ver inativos
            </Link>
            <Link href="/configuracoes/socios/novo" className={cn(buttonVariants(), "h-11 md:h-9")}>
              Novo sócio
            </Link>
          </>
        }
      />
    );
  }
  return (
    <EmptyState
      icon={Handshake}
      title="Nenhum sócio cadastrado"
      action={
        <Link href="/configuracoes/socios/novo" className={cn(buttonVariants(), "h-11 md:h-9")}>
          Novo sócio
        </Link>
      }
    >
      <p>Cadastre os sócios antes dos clientes: cada cliente precisa de pelo menos um sócio.</p>
    </EmptyState>
  );
}

function Counts({ active, inactive }: { active: number; inactive: number }) {
  return (
    <>
      <span>{active === 1 ? "1 ativo" : `${active} ativos`}</span>
      <span className="block text-xs text-muted-foreground">{inactive === 1 ? "1 inativo" : `${inactive} inativos`}</span>
    </>
  );
}

/** Tablet e desktop (a partir de 768 px): tabela de verdade, com cabeçalhos e legenda. */
function PartnersTable({ partners }: { partners: readonly PartnerListItem[] }) {
  return (
    <Card className="hidden py-0 md:block">
      <Table>
        <TableCaption className="sr-only">Sócios cadastrados</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col" className="pl-4">
              Sócio
            </TableHead>
            <TableHead scope="col">Clientes</TableHead>
            <TableHead scope="col">Recebedores</TableHead>
            <TableHead scope="col">Situação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {partners.map((partner) => (
            <TableRow key={partner.id}>
              <TableCell className="pl-4 whitespace-normal">
                <Link
                  href={`/configuracoes/socios/${partner.id}`}
                  className="rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring"
                >
                  {partner.name}
                </Link>
              </TableCell>
              <TableCell>
                <Counts active={partner.activeClientCount} inactive={partner.inactiveClientCount} />
              </TableCell>
              <TableCell>
                <Counts active={partner.activeReceiverCount} inactive={partner.inactiveReceiverCount} />
              </TableCell>
              <TableCell>
                <StatusBadge active={partner.active} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

/** Celular (abaixo de 768 px): lista de cartões, com a mesma informação e na mesma ordem. */
function PartnersCards({ partners }: { partners: readonly PartnerListItem[] }) {
  return (
    <ul aria-label="Sócios cadastrados" className="grid gap-3 md:hidden">
      {partners.map((partner) => (
        <li key={partner.id}>
          <Card className="gap-2 px-4">
            <div className="flex items-start justify-between gap-2">
              <Link
                href={`/configuracoes/socios/${partner.id}`}
                className="min-h-11 rounded-sm font-medium break-words underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring"
              >
                {partner.name}
              </Link>
              <StatusBadge active={partner.active} />
            </div>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Clientes</dt>
                <dd>
                  <Counts active={partner.activeClientCount} inactive={partner.inactiveClientCount} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Recebedores</dt>
                <dd>
                  <Counts active={partner.activeReceiverCount} inactive={partner.inactiveReceiverCount} />
                </dd>
              </div>
            </dl>
          </Card>
        </li>
      ))}
    </ul>
  );
}
