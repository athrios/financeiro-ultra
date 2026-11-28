import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Breadcrumbs } from "@/components/form/breadcrumbs";
import { guardPage } from "@/components/shell/page-guard";
import { PageHeader } from "@/components/shell/page-header";
import { ContentSkeleton } from "@/components/shell/skeletons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { partnerDetailHref } from "@/domain/cadastros/partner-view";
import { RECEIVER_PARTNER_INACTIVE_BLOCK } from "@/domain/cadastros/receiver-view";
import { cn } from "@/lib/utils";
import { getPartnerDetail } from "@/server/partners/partners";

import { ReceiverForm } from "../_components/receiver-form";

export const metadata: Metadata = {
  title: "Novo recebedor",
};

type Params = Promise<{ id: string }>;

const HREF = "/configuracoes/socios";

/**
 * Novo recebedor (UI 7, rota R1). O sócio dono vem da rota e não muda depois. Sócio inativo não recebe
 * recebedor novo: a página mostra o bloqueio no lugar do formulário. Só o Administrador.
 */
export default function NewReceiverPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <NewReceiverContent params={params} />
    </Suspense>
  );
}

async function NewReceiverContent({ params }: { params: Params }) {
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
          { label: "Novo recebedor" },
        ]}
      />
      <PageHeader title="Novo recebedor" description={partner.name} />
      {partner.active ? (
        <ReceiverForm
          partner={{ id: partner.id, name: partner.name, active: partner.active }}
          cancelHref={partnerDetailHref(id)}
        />
      ) : (
        <div className="grid max-w-2xl gap-4">
          <Alert variant="info" role="status">
            <AlertDescription>{RECEIVER_PARTNER_INACTIVE_BLOCK}</AlertDescription>
          </Alert>
          <div>
            <Link href={partnerDetailHref(id)} className={cn(buttonVariants(), "h-11 md:h-9")}>
              Ir para o sócio
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
