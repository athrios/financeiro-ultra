import { CirclePause, Info } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

import { Breadcrumbs } from "@/components/form/breadcrumbs";
import { FlashAlert } from "@/components/form/flash-alert";
import { StatusBadge } from "@/components/form/status-badge";
import { guardPage } from "@/components/shell/page-guard";
import { PageHeader } from "@/components/shell/page-header";
import { ContentSkeleton } from "@/components/shell/skeletons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CLIENTS_CARD_NOTE,
  describeClientCounts,
  parsePartnerFlash,
  parseStatusParam,
  partnerClientsHref,
  partnerDetailHref,
} from "@/domain/cadastros/partner-view";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import {
  getPartnerDetail,
  listPartnerBlockingClients,
  partnerHasLinkedLogin,
} from "@/server/partners/partners";
import { listReceiversByPartner } from "@/server/receivers/receivers";

import { PartnerActiveControl } from "../_components/partner-active-control";
import { ReceiversCard } from "../_components/receivers-card";

export const metadata: Metadata = {
  title: "Sócio",
};

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const HREF = "/configuracoes/socios";
const MAX_LISTED_CLIENTS = 10;

/**
 * Detalhe do sócio (UI 5.3; só o Administrador). `params` e `searchParams` são dados de requisição,
 * então a leitura fica atrás do <Suspense>. A página decide qual diálogo de inativação abrir com os
 * clientes e recebedores que leu aqui; o servidor confere de novo ao confirmar.
 */
export default function PartnerPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <PartnerContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function PartnerContent({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const guard = await guardPage(HREF);
  if (!guard.allowed) return guard.node;

  const { id } = await params;
  const query = await searchParams;
  const partner = await getPartnerDetail(guard.supabase, id);
  if (!partner) notFound();

  const [clients, receivers, hasLinkedLogin] = await Promise.all([
    listPartnerBlockingClients(guard.supabase, id),
    listReceiversByPartner(guard.supabase, id, "ALL"),
    // O aviso de login vinculado é só informação: se a leitura falhar, o aviso some (U-C07).
    partnerHasLinkedLogin(guard.supabase, id).catch(() => false),
  ]);

  const activeReceivers = receivers.filter((receiver) => receiver.active);
  const receiversStatus = parseStatusParam(query.recebedores);
  const activeClientCount = clients.filter((client) => client.active).length;
  const flash = parsePartnerFlash(query.aviso, query.n);
  const activeAliases = partner.aliases.filter((alias) => alias.active);
  const inactiveAliases = partner.aliases.filter((alias) => !alias.active);

  return (
    <>
      <Breadcrumbs items={[{ label: "Sócios", href: HREF }, { label: partner.name }]} />

      {flash && <FlashAlert tone={flash.tone} message={flash.message} dismissHref={partnerDetailHref(id)} />}

      <PageHeader
        title={partner.name}
        meta={<StatusBadge active={partner.active} />}
        actions={
          <>
            <Link
              href={`/configuracoes/socios/${id}/editar`}
              className={cn(buttonVariants({ variant: "outline" }), "h-11 md:h-9")}
            >
              Editar
            </Link>
            <PartnerActiveControl
              key={`${partner.id}:${partner.updatedAt}:${partner.active}`}
              partner={{ id: partner.id, name: partner.name, active: partner.active, updatedAt: partner.updatedAt }}
              clients={clients}
              receivers={activeReceivers.map((receiver) => ({ id: receiver.id, holderName: receiver.holderName }))}
              hasLinkedLogin={hasLinkedLogin}
            />
          </>
        }
      />

      <div className="grid max-w-3xl gap-4">
        {!partner.active && (
          <Alert variant="info" role="status">
            <CirclePause aria-hidden="true" />
            <AlertDescription>
              Sócio inativo. Ele não pode ser indicado em clientes nem receber novos recebedores. Reative o sócio para
              voltar a usá-lo.
            </AlertDescription>
          </Alert>
        )}

        {hasLinkedLogin && (
          <Alert variant="info" role="status">
            <Info aria-hidden="true" />
            <AlertDescription>
              Há um login vinculado a este sócio. Inativar o sócio não altera o login, mas o vínculo com este cadastro
              deixa de valer enquanto ele estiver inativo.
            </AlertDescription>
          </Alert>
        )}

        <ReceiversCard
          partner={{ id: partner.id, name: partner.name, active: partner.active }}
          receivers={receivers}
          status={receiversStatus}
        />

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Clientes deste sócio</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {clients.length === 0 ? (
              <p>Nenhum cliente indica este sócio.</p>
            ) : (
              <>
                <p>{describeClientCounts(activeClientCount, clients.length - activeClientCount)}</p>
                <ul aria-label="Clientes deste sócio" className="grid gap-1">
                  {clients.slice(0, MAX_LISTED_CLIENTS).map((client) => (
                    <li key={client.id} className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/clientes/${client.id}`}
                        className="min-h-11 rounded-sm break-words underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring md:min-h-0"
                      >
                        {client.name}
                      </Link>
                      <StatusBadge active={client.active} />
                    </li>
                  ))}
                </ul>
                <Link
                  href={partnerClientsHref(id)}
                  className="inline-flex min-h-11 w-fit items-center rounded-sm underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring md:min-h-8"
                >
                  Ver todos os clientes deste sócio
                </Link>
              </>
            )}
            <p className="text-muted-foreground">{CLIENTS_CARD_NOTE}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Apelidos</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {activeAliases.length === 0 ? (
              <p>Nenhum apelido cadastrado.</p>
            ) : (
              <ul aria-label="Apelidos ativos" className="grid gap-1">
                {activeAliases.map((alias) => (
                  <li key={alias.id} className="break-words">
                    {alias.value}
                  </li>
                ))}
              </ul>
            )}
            {inactiveAliases.length > 0 && (
              <details className="rounded-lg border bg-background px-3 py-2">
                <summary className="min-h-8 cursor-pointer font-medium">
                  Apelidos inativos ({inactiveAliases.length})
                </summary>
                <ul aria-label="Apelidos inativos" className="mt-2 grid gap-1 text-muted-foreground">
                  {inactiveAliases.map((alias) => (
                    <li key={alias.id} className="break-words">
                      {alias.value}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Cadastrado em {formatDate(partner.createdAt)}
          <br />
          Última alteração em {formatDateTime(partner.updatedAt)}
        </p>
      </div>
    </>
  );
}
