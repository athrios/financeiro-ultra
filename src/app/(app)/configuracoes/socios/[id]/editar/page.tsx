import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Breadcrumbs } from "@/components/form/breadcrumbs";
import { guardPage } from "@/components/shell/page-guard";
import { PageHeader } from "@/components/shell/page-header";
import { ContentSkeleton } from "@/components/shell/skeletons";
import { partnerDetailHref } from "@/domain/cadastros/partner-view";
import { getPartnerDetail } from "@/server/partners/partners";

import { PartnerForm } from "../../_components/partner-form";

export const metadata: Metadata = {
  title: "Editar sócio",
};

type Params = Promise<{ id: string }>;

const HREF = "/configuracoes/socios";

/**
 * Editar sócio (UI 5.2): mesmo formulário do cadastro, com a versão lida aqui (`updatedAt`, em texto)
 * para a ação recusar a gravação se outra pessoa salvou antes. Só o Administrador.
 */
export default function EditPartnerPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <EditPartnerContent params={params} />
    </Suspense>
  );
}

async function EditPartnerContent({ params }: { params: Params }) {
  const guard = await guardPage(HREF);
  if (!guard.allowed) return guard.node;

  const { id } = await params;
  const partner = await getPartnerDetail(guard.supabase, id);
  if (!partner) notFound();

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Sócios", href: HREF },
          { label: partner.name, href: partnerDetailHref(id) },
          { label: "Editar" },
        ]}
      />
      <PageHeader title="Editar sócio" description={partner.name} />
      <PartnerForm
        initial={{
          id: partner.id,
          name: partner.name,
          active: partner.active,
          updatedAt: partner.updatedAt,
          aliases: partner.aliases,
        }}
        cancelHref={partnerDetailHref(id)}
      />
    </>
  );
}
