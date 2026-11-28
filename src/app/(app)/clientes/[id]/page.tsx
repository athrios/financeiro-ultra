import { CirclePause } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";

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
  CLIENTS_HREF,
  DIVISION_NOTE,
  INACTIVE_CLIENT_ASK_ADMIN,
  INACTIVE_CLIENT_NOTICE,
  clientDetailHref,
  clientEditHref,
  clientTypeLabel,
  describeClientAlias,
  describeClientDivision,
  describeDocumentLine,
  formatMonthlyValue,
  parseClientFlash,
} from "@/domain/cadastros/client-view";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { getClientDetail } from "@/server/clients/clients";

import { ClientActiveControl } from "../_components/client-active-control";

export const metadata: Metadata = {
  title: "Cliente",
};

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Detalhe do cliente (UI 4.2): leitura para Administrador, Operador e Visualizador. Só o
 * Administrador vê as ações e os apelidos inativos; os nomes dos sócios só são link para ele (a
 * área de sócios é dele). `params` e `searchParams` são dados de requisição: a leitura fica atrás
 * do <Suspense>. O RLS decide o que cada papel lê; id que não existe ou que o RLS esconde dá
 * "Registro não encontrado".
 */
export default function ClientPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <ClientContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words">{children}</dd>
    </div>
  );
}

async function ClientContent({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const guard = await guardPage(CLIENTS_HREF);
  if (!guard.allowed) return guard.node;

  const { id } = await params;
  const query = await searchParams;
  const client = await getClientDetail(guard.supabase, id);
  if (!client) notFound();

  const isAdmin = guard.role === "ADMINISTRATOR";
  const flash = parseClientFlash(query.aviso);
  const typeLabel = clientTypeLabel(client.documentType);
  const documentLine = describeDocumentLine(client.document);
  const currentPartners = client.partners.filter((partner) => partner.indicationActive);
  const activeAliases = client.aliases.filter((alias) => alias.active);
  const inactiveAliases = client.aliases.filter((alias) => !alias.active);

  return (
    <>
      <Breadcrumbs items={[{ label: "Clientes", href: CLIENTS_HREF }, { label: client.legalName }]} />

      {flash && <FlashAlert tone={flash.tone} message={flash.message} dismissHref={clientDetailHref(id)} />}

      <PageHeader
        title={client.legalName}
        meta={
          <>
            <StatusBadge active={client.active} />
            {typeLabel && (
              <span className="text-sm text-muted-foreground">
                <span className="sr-only">Tipo de documento: </span>
                {typeLabel}
              </span>
            )}
          </>
        }
        actions={
          isAdmin ? (
            <>
              <Link href={clientEditHref(id)} className={cn(buttonVariants({ variant: "outline" }), "h-11 md:h-9")}>
                Editar
              </Link>
              <ClientActiveControl
                key={`${client.id}:${client.updatedAt}:${client.active}`}
                client={{ id: client.id, name: client.legalName, active: client.active, updatedAt: client.updatedAt }}
                partnerNames={currentPartners.filter((partner) => partner.partnerActive).map((partner) => partner.name)}
              />
            </>
          ) : undefined
        }
      />

      <div className="grid max-w-3xl gap-4">
        {!client.active && (
          <Alert variant="info" role="status">
            <CirclePause aria-hidden="true" />
            <AlertDescription>
              {INACTIVE_CLIENT_NOTICE}
              {!isAdmin && ` ${INACTIVE_CLIENT_ASK_ADMIN}`}
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Dados</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 text-sm">
              <Field label="Nome ou razão social">{client.legalName}</Field>
              <Field label="Nome fantasia">
                {client.tradeName ?? <span className="text-muted-foreground">Não informado</span>}
              </Field>
              <Field label="Documento">
                {documentLine.label === null ? (
                  <span className="text-muted-foreground">{documentLine.text}</span>
                ) : (
                  <>
                    {documentLine.label} <span className="tabular-nums">{documentLine.text}</span>
                  </>
                )}
              </Field>
              <Field label="Mensalidade padrão">
                <span className="tabular-nums">{formatMonthlyValue(client.monthlyValue)}</span>
              </Field>
              <Field label="Observações">
                {client.notes ? (
                  <span className="whitespace-pre-line">{client.notes}</span>
                ) : (
                  <span className="text-muted-foreground">Sem observações</span>
                )}
              </Field>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Sócios e divisão</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <p>{describeClientDivision(client.activePartnerCount)}</p>
            {currentPartners.length > 0 && (
              <ul aria-label="Sócios do cliente" className="grid gap-1">
                {currentPartners.map((partner) => (
                  <li key={partner.partnerId} className="break-words">
                    {isAdmin ? (
                      <Link
                        href={`/configuracoes/socios/${encodeURIComponent(partner.partnerId)}`}
                        className="inline-flex min-h-11 items-center rounded-sm underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring md:min-h-0"
                      >
                        {partner.name}
                      </Link>
                    ) : (
                      partner.name
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-muted-foreground">{DIVISION_NOTE}</p>
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
                    {describeClientAlias(alias)}
                  </li>
                ))}
              </ul>
            )}
            {isAdmin && inactiveAliases.length > 0 && (
              <details className="rounded-lg border bg-background px-3 py-2">
                <summary className="min-h-8 cursor-pointer font-medium">Apelidos inativos ({inactiveAliases.length})</summary>
                <ul aria-label="Apelidos inativos" className="mt-2 grid gap-1 text-muted-foreground">
                  {inactiveAliases.map((alias) => (
                    <li key={alias.id} className="break-words">
                      {describeClientAlias(alias)}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Cadastrado em {formatDate(client.createdAt)}
          <br />
          Última alteração em {formatDateTime(client.updatedAt)}
        </p>
      </div>
    </>
  );
}
