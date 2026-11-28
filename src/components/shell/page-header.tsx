import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Linha logo abaixo do título (por exemplo, o selo de situação do cadastro). */
  meta?: ReactNode;
  /** Ações da página (no máximo uma primária visível). */
  actions?: ReactNode;
  className?: string;
}

/**
 * Cabeçalho de página: um único h1, descrição de uma linha e ações (03-ui-ux.md, 2.2).
 * O h1 é focável por programa (`#page-title`): depois de salvar, inativar ou recarregar, o foco
 * vai ao título (CAD-001, UI 4.1.9 e 6).
 */
export function PageHeader({ title, description, meta, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between", className)}>
      <div className="min-w-0">
        <h1 id="page-title" tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
          {title}
        </h1>
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-col gap-2 md:flex-row">{actions}</div>}
    </div>
  );
}
