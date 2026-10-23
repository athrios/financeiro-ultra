import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { NoActiveAccessState, PartnerNoScopeState } from "@/components/shell/access-states";
import { AppShell } from "@/components/shell/app-shell";
import { MinimalShell } from "@/components/shell/minimal-shell";
import { ShellFallback } from "@/components/shell/skeletons";
import { navSectionsForRole } from "@/lib/navigation";
import { getPartnerName, getSession } from "@/server/session";
import { userRoleLabel } from "@/server/authorization";

/**
 * Guarda de sessão e perfil do sistema autenticado (plano, seção 3; 03-ui-ux.md, 2.2 e 2.7).
 *
 * Com Cache Components a sessão só existe em tempo de requisição, então a leitura fica atrás
 * de <Suspense> (guia "Authentication with Cache Components"). O proxy é só a checagem
 * otimista; aqui cada renderização revalida sessão e perfil, e o RLS decide o acesso a dados.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <AppGate>{children}</AppGate>
    </Suspense>
  );
}

async function AppGate({ children }: { children: ReactNode }) {
  const session = await getSession();

  if (session.status === "anonymous") {
    redirect("/login");
  }

  // Regra única de acesso (J1): autenticado sem perfil ativo mantém a sessão e vê a tela
  // "Sem acesso ativo" no shell mínimo, qualquer que seja a rota. Sem menu de módulos e
  // sem consulta a dados de negócio.
  if (session.status === "no-access") {
    return (
      <MinimalShell displayName={session.email} roleText={null}>
        <NoActiveAccessState email={session.email} />
      </MinimalShell>
    );
  }

  const { profile } = session;

  // Papel Sócio: negar por padrão até a decisão P-02b. Sem menu, sem nome do sócio vinculado.
  if (profile.role === "PARTNER") {
    return (
      <MinimalShell displayName={profile.fullName ?? profile.email} roleText={userRoleLabel("PARTNER")}>
        <PartnerNoScopeState />
      </MinimalShell>
    );
  }

  // Administrador que também é sócio: "Administrador · Sócio Alfa". Falha ao ler o nome só
  // deixa o rótulo sem ele.
  const partnerName = profile.partnerId ? await getPartnerName(profile.partnerId) : null;

  return (
    <AppShell
      sections={navSectionsForRole(profile.role)}
      displayName={profile.fullName ?? profile.email}
      roleText={userRoleLabel(profile.role, partnerName)}
    >
      {children}
    </AppShell>
  );
}
