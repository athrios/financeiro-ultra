import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Breadcrumbs } from "@/components/form/breadcrumbs";
import { StatusBadge } from "@/components/form/status-badge";
import { guardPage } from "@/components/shell/page-guard";
import { PageHeader } from "@/components/shell/page-header";
import { ContentSkeleton } from "@/components/shell/skeletons";
import { partnerDetailHref } from "@/domain/cadastros/partner-view";
import { getReceiverDetail } from "@/server/receivers/receivers";

import { ReceiverActiveControl } from "../_components/receiver-active-control";
import { ReceiverForm } from "../_components/receiver-form";

export const metadata: Metadata = {
  title: "Recebedor",
};

type Params = Promise<{ id: string; receiverId: string }>;

const HREF = "/configuracoes/socios";

/**
 * Recebedor (UI 7, rota R2): abre direto no formulário, com a situação e a ação de inativar ou
 * reativar no cabeçalho. A versão lida aqui (`updatedAt`, em texto) vai ao formulário para a ação
 * recusar a gravação se outra pessoa salvou antes. Recebedor de outro sócio cai em "não encontrado".
 * Só o Administrador.
 */
export default function ReceiverPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <ReceiverContent params={params} />
    </Suspense>
  );
}

async function ReceiverContent({ params }: { params: Params }) {
  const guard = await guardPage(HREF);
  if (!guard.allowed) return guard.node;

  const { id, receiverId } = await params;
  const receiver = await getReceiverDetail(guard.supabase, receiverId);
  if (!receiver || receiver.partnerId !== id) notFound();

  const partner = { id: receiver.partnerId, name: receiver.partnerName, active: receiver.partnerActive };

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Sócios", href: HREF },
          { label: partner.name, href: partnerDetailHref(id) },
          { label: receiver.holderName },
        ]}
      />
      <PageHeader
        title={receiver.holderName}
        meta={<StatusBadge active={receiver.active} />}
        actions={
          <ReceiverActiveControl
            key={`${receiver.id}:${receiver.updatedAt}:${receiver.active}:${partner.active}`}
            receiver={{ id: receiver.id, holderName: receiver.holderName, active: receiver.active, updatedAt: receiver.updatedAt }}
            partner={partner}
          />
        }
      />
      <ReceiverForm
        partner={partner}
        initial={{
          id: receiver.id,
          holderName: receiver.holderName,
          active: receiver.active,
          updatedAt: receiver.updatedAt,
          identifiers: receiver.identifiers,
        }}
        cancelHref={partnerDetailHref(id)}
      />
    </>
  );
}
