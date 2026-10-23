import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Ações da página (no máximo uma primária visível). */
  actions?: ReactNode;
  className?: string;
}

/** Cabeçalho de página: um único h1, descrição de uma linha e ações (03-ui-ux.md, 2.2). */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-col gap-2 md:flex-row">{actions}</div>}
    </div>
  );
}
