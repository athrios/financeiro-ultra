import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { findNavItemByHref } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { decideAccess } from "@/server/authorization";
import { getSession } from "@/server/session";

import { ForbiddenState } from "./access-states";
import { EmptyState } from "./empty-state";
import { NAV_ICONS } from "./nav-icons";
import { PageHeader } from "./page-header";

/**
 * Página-placeholder de um módulo (03-ui-ux.md, 2.8). Antes de mostrar qualquer coisa,
 * confere se o papel pode abrir a área (UX): sem permissão, o estado 2.7.4 aparece no lugar
 * do conteúdo. Os estados de acesso global (sem perfil ativo, Sócio) já foram resolvidos pelo
 * layout; a autorização real dos dados é do RLS, quando os módulos existirem.
 */
export async function ModulePage({ href }: { href: string }) {
  const item = findNavItemByHref(href);
  if (!item) throw new Error(`Módulo sem item de navegação: ${href}`);

  const session = await getSession();
  const decision = decideAccess(session, href);
  if (decision.kind === "forbidden") return <ForbiddenState role={decision.role} />;
  if (decision.kind !== "allowed") return null;

  return (
    <>
      <PageHeader title={item.label} description={item.description} />
      <EmptyState
        icon={NAV_ICONS[item.icon]}
        title="Módulo ainda não disponível"
        action={
          <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "h-11 md:h-9")}>
            Voltar ao Dashboard
          </Link>
        }
      >
        <p>Esta área será liberada em uma próxima etapa do Financeiro Ultra.</p>
      </EmptyState>
    </>
  );
}
