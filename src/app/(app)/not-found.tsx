import { FileSearch } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shell/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Registro ou segmento inexistente dentro do shell (03-ui-ux.md, 4.8 caso a): a página chamou
 * `notFound()`. O texto cobre também o registro que o RLS esconde, sem revelar a existência.
 */
export default function AppNotFound() {
  return (
    <EmptyState
      icon={FileSearch}
      title="Registro não encontrado"
      headingLevel="h1"
      className="mx-auto max-w-md"
      action={
        <Link href="/" className={cn(buttonVariants(), "h-11 md:h-9")}>
          Voltar ao Dashboard
        </Link>
      }
    >
      <p>O registro não existe ou o conteúdo não está disponível para você.</p>
    </EmptyState>
  );
}
