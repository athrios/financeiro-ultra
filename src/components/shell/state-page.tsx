import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "info" | "warning" | "danger";

const TONE_ICON_CLASS: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "border border-info-border bg-info text-info-foreground",
  warning: "border border-warning-border bg-warning text-warning-foreground",
  danger: "border border-danger-border bg-danger text-danger-foreground",
};

interface StatePageProps {
  tone: Tone;
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}

/**
 * Tela de estado de acesso (03-ui-ux.md, 2.7): cartão central `max-w-md` com ícone, título
 * (h1), texto e ações. O tom reforça o ícone, mas o estado é sempre dito em texto.
 */
export function StatePage({ tone, icon: Icon, title, children, actions }: StatePageProps) {
  return (
    <Card className="mx-auto w-full max-w-md">
      <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
        <span aria-hidden="true" className={cn("grid size-12 place-items-center rounded-full", TONE_ICON_CLASS[tone])}>
          <Icon className="size-6" />
        </span>
        <h1 className="text-xl font-semibold">{title}</h1>
        <div className="text-sm text-muted-foreground">{children}</div>
        {actions && <div className="mt-2 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">{actions}</div>}
      </CardContent>
    </Card>
  );
}
