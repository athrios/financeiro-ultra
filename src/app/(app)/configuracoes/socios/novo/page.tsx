import type { Metadata } from "next";
import { Suspense } from "react";

import { Breadcrumbs } from "@/components/form/breadcrumbs";
import { guardPage } from "@/components/shell/page-guard";
import { PageHeader } from "@/components/shell/page-header";
import { ContentSkeleton } from "@/components/shell/skeletons";

import { PartnerForm } from "../_components/partner-form";

export const metadata: Metadata = {
  title: "Novo sócio",
};

const HREF = "/configuracoes/socios";

/** Novo sócio (UI 5.2): só o Administrador; os demais papéis veem "Sem permissão" (2.7.4). */
export default function NewPartnerPage() {
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <NewPartnerContent />
    </Suspense>
  );
}

async function NewPartnerContent() {
  const guard = await guardPage(HREF);
  if (!guard.allowed) return guard.node;

  return (
    <>
      <Breadcrumbs items={[{ label: "Sócios", href: HREF }, { label: "Novo sócio" }]} />
      <PageHeader title="Novo sócio" description="Informe o nome e, se quiser, os apelidos do sócio." />
      <PartnerForm cancelHref={HREF} />
    </>
  );
}
