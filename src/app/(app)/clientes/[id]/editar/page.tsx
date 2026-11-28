import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Breadcrumbs } from "@/components/form/breadcrumbs";
import { guardAdminPage } from "@/components/shell/page-guard";
import { PageHeader } from "@/components/shell/page-header";
import { ContentSkeleton } from "@/components/shell/skeletons";
import type { PartnerChoice } from "@/domain/cadastros/client-form";
import { CLIENTS_HREF, clientDetailHref } from "@/domain/cadastros/client-view";
import { maskDocument } from "@/domain/documents/document-mask";
import { formatMoneyInput } from "@/domain/shared/money-input";
import { getClientDetail } from "@/server/clients/clients";
import { listActivePartnerOptions } from "@/server/partners/partners";

import { ClientForm, type ClientFormInitial } from "../../_components/client-form";

export const metadata: Metadata = {
  title: "Editar cliente",
};

type Params = Promise<{ id: string }>;

/**
 * Editar cliente (UI C4): mesmo formulário do cadastro, com a versão lida aqui (`updatedAt`, em texto)
 * para a ação recusar a gravação se outra pessoa salvou antes. Só o Administrador chega aqui; os demais
 * papéis veem "Sem permissão" (UI 2.3, 4.2 "Bloqueio por papel") antes de qualquer leitura. Id que não
 * existe ou que o RLS esconde dá "Registro não encontrado".
 */
export default function EditClientPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <EditClientContent params={params} />
    </Suspense>
  );
}

async function EditClientContent({ params }: { params: Params }) {
  const guard = await guardAdminPage(CLIENTS_HREF);
  if (!guard.allowed) return guard.node;

  const { id } = await params;
  const client = await getClientDetail(guard.supabase, id);
  if (!client) notFound();

  const activePartners = await listActivePartnerOptions(guard.supabase);

  // Sócios para marcar: os ativos e, por segurança, os inativos que ainda estão indicados (a RAT-D025
  // impede isso; se acontecer, a pessoa vê o sócio marcado, com o selo "Inativo", e só pode desmarcá-lo).
  const choices = new Map<string, PartnerChoice>(activePartners.map((partner) => [partner.id, { ...partner, active: true }]));
  for (const link of client.partners) {
    if (link.indicationActive && !choices.has(link.partnerId)) {
      choices.set(link.partnerId, { id: link.partnerId, name: link.name, active: link.partnerActive });
    }
  }
  const partners = [...choices.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.id.localeCompare(b.id));

  const initial: ClientFormInitial = {
    id: client.id,
    legalName: client.legalName,
    tradeName: client.tradeName ?? "",
    documentChoice: client.documentType ?? "NONE",
    document: client.documentType ? maskDocument(client.documentType, client.document) : "",
    documentCanonical: client.document,
    monthlyValue: formatMoneyInput(client.monthlyValue),
    notes: client.notes ?? "",
    active: client.active,
    updatedAt: client.updatedAt,
    partnerIds: client.partners.filter((link) => link.indicationActive).map((link) => link.partnerId),
    aliases: client.aliases.map((alias) => ({
      id: alias.id,
      type: alias.type,
      displayValue: alias.displayValue,
      active: alias.active,
    })),
  };

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Clientes", href: CLIENTS_HREF },
          { label: client.legalName, href: clientDetailHref(id) },
          { label: "Editar" },
        ]}
      />
      <PageHeader title="Editar cliente" description={client.legalName} />
      <ClientForm initial={initial} partners={partners} cancelHref={clientDetailHref(id)} />
    </>
  );
}
