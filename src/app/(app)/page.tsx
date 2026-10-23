import { LayoutDashboard } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { decideAccess, roleLabel } from "@/server/authorization";
import { getSession } from "@/server/session";

export const metadata: Metadata = {
  title: "Dashboard",
};

/**
 * Dashboard (03-ui-ux.md, 2.8): na FND, só um estado vazio informativo. Sem números fictícios
 * e sem gráficos; nenhum dado de negócio é lido.
 */
export default async function DashboardPage() {
  const session = await getSession();
  // O layout já resolveu os estados de acesso; aqui só chega perfil ativo que não é Sócio.
  if (decideAccess(session, "/").kind !== "allowed" || session.status !== "active") return null;

  const { profile } = session;
  const name = profile.fullName ?? profile.email;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={name ? `Olá, ${name} · ${roleLabel(profile.role)}` : roleLabel(profile.role)}
      />
      <EmptyState icon={LayoutDashboard} title="Os indicadores aparecerão aqui">
        <p>
          Quando os módulos de recebimentos, apuração e compensações forem liberados, este painel mostrará o que
          exige a sua decisão.
        </p>
      </EmptyState>
    </>
  );
}
