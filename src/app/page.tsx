import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AppHeader } from "@/components/app-header";
import { CompaniesTable } from "@/components/finance/companies-table";
import { CompetencySelector } from "@/components/finance/competency-selector";
import { OpenCompetencyForm } from "@/components/finance/open-competency-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  currentReferenceMonth,
  formatReferenceMonth,
  parseMonthParam,
  toMonthParam,
} from "@/domain/competencies";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdmin, loadSession, type UserRole } from "@/server/auth";
import { getCompetencyOverview } from "@/server/competencies";

const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN_FINANCEIRO: "Administrador financeiro",
  SOCIO: "Sócio",
};

/**
 * Com cacheComponents, sessão (cookies) e searchParams só existem em tempo de
 * requisição: o conteúdo dinâmico fica atrás de <Suspense>. Nada aqui usa
 * cache de servidor: a página depende do usuário e do papel.
 */
export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center p-6">
          <p className="text-sm text-muted-foreground">Carregando…</p>
        </main>
      }
    >
      <HomeContent searchParams={searchParams} />
    </Suspense>
  );
}

async function HomeContent({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
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
                Seu usuário ainda não possui um perfil ativo. Procure o administrador financeiro.
              </CardDescription>
            </CardHeader>
          </Card>
        </main>
      </>
    );
  }

  const { profile } = session;
  const { competencia } = await searchParams;
  const reference =
    parseMonthParam(Array.isArray(competencia) ? competencia[0] : competencia) ??
    currentReferenceMonth(new Date());
  const label = formatReferenceMonth(reference);
  const overview = await getCompetencyOverview(supabase, reference);

  return (
    <>
      <AppHeader
        userName={profile.fullName ?? profile.email}
        roleLabel={
          profile.indicatorName
            ? `${ROLE_LABEL[profile.role]} · ${profile.indicatorName}`
            : ROLE_LABEL[profile.role]
        }
      />
      <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <CompetencySelector reference={reference} />

        {overview.competency ? (
          <CompaniesTable competencyLabel={label} rows={overview.rows} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Recebimentos</CardTitle>
              <CardDescription>
                A competência de {label} ainda não foi aberta.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center py-6">
              {isAdmin(profile) ? (
                <OpenCompetencyForm referenceMonth={toMonthParam(reference)} label={label} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Aguardando a abertura pelo administrador financeiro.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </>
  );
}
