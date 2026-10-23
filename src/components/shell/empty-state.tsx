import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  /** Ação (por exemplo, "Voltar ao Dashboard"). */
  action?: ReactNode;
  /** Nível do título: h2 quando a página já tem um h1 (padrão); h1 quando o estado é a página. */
  headingLevel?: "h1" | "h2";
  className?: string;
}

/** Estado vazio/informativo: ícone, título, texto e ação (03-ui-ux.md, 3.2). */
export function EmptyState({ icon: Icon, title, children, action, headingLevel = "h2", className }: EmptyStateProps) {
  const Heading = headingLevel;
  return (
    <Card className={cn("max-w-2xl", className)}>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <span aria-hidden="true" className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-6" />
        </span>
        <Heading className="text-lg font-semibold">{title}</Heading>
        {children && <div className="max-w-prose text-sm text-muted-foreground">{children}</div>}
        {action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
      </CardContent>
    </Card>
  );
}
