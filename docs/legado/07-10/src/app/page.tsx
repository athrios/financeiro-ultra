import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AppHeader } from "@/components/app-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadSession, type UserRole } from "@/server/auth";

const ROLE_LABEL: Record<UserRole, string> = {
  ADMINISTRATOR: "Administrador",
  OPERATOR: "Operador",
  VIEWER: "Visualizador",
  PARTNER: "Sócio",
};

/**
 * Placeholder autenticado da fundação (E4): a página inicial real e o shell são
 * da E5. Nenhum dado de negócio é lido aqui.
 *
 * Com cacheComponents, a sessão (cookies) só existe em tempo de requisição: o
 * conteúdo dinâmico fica atrás de <Suspense>. Nada aqui usa cache de servidor.
 */
export default function HomePage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center p-6">
          <p className="text-sm text-muted-foreground">Carregando…</p>
        </main>
      }
    >
      <HomeContent />
    </Suspense>
  );
}

async function HomeContent() {
  const supabase = await createSupabaseServerClient();
  const session = await loadSession(supabase);

  if (session.status === "anonymous") {
    redirect("/login");
  }

  if (session.status === "no-access") {
    return (
      <>
        <AppHeader userName={session.email} />
        <main className="flex flex-1 items-start justify-center p-6">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Acesso não configurado</CardTitle>
              <CardDescription>
                Seu usuário ainda não possui acesso ativo ao sistema. Procure o Administrador.
              </CardDescription>
            </CardHeader>
          </Card>
        </main>
      </>
    );
  }

  const { profile } = session;

  return (
    <>
      <AppHeader userName={profile.fullName ?? profile.email} roleLabel={ROLE_LABEL[profile.role]} />
      <main className="flex flex-1 items-start justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Fundação em construção</CardTitle>
            <CardDescription>
              {profile.role === "PARTNER"
                ? "O acesso do sócio aos dados ainda não foi definido."
                : "Você está autenticado. As telas do sistema chegam nas próximas etapas."}
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    </>
  );
}
