import type { Metadata } from "next";
import { Suspense } from "react";

import { Breadcrumbs } from "@/components/form/breadcrumbs";
import { guardAdminPage } from "@/components/shell/page-guard";
import { PageHeader } from "@/components/shell/page-header";
import { ContentSkeleton } from "@/components/shell/skeletons";
import { CLIENTS_HREF } from "@/domain/cadastros/client-view";
import { listActivePartnerOptions } from "@/server/partners/partners";

import { ClientForm } from "../_components/client-form";

export const metadata: Metadata = {
  title: "Novo cliente",
};

/**
 * Novo cliente (UI C2): o formulário único de cliente, com os sócios ATIVOS para escolher. Só o
 * Administrador chega aqui; os demais papéis veem "Sem permissão" (UI 2.3) antes de qualquer leitura.
 */
export default function NewClientPage() {
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <NewClientContent />
    </Suspense>
  );
}

async function NewClientContent() {
  const guard = await guardAdminPage(CLIENTS_HREF);
  if (!guard.allowed) return guard.node;

  const partners = await listActivePartnerOptions(guard.supabase);

  return (
    <>
      <Breadcrumbs items={[{ label: "Clientes", href: CLIENTS_HREF }, { label: "Novo cliente" }]} />
      <PageHeader title="Novo cliente" />
      <ClientForm partners={partners.map((partner) => ({ ...partner, active: true }))} cancelHref={CLIENTS_HREF} />
    </>
  );
}
