import { cn } from "@/lib/utils";

/**
 * Marca (03-ui-ux.md, 0.1): monograma "FU" + nome em texto. Não existe logotipo
 * definitivo; o nome em texto foi aceito pelo responsável em 23/10/2026.
 */
export function Brand({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground"
      >
        FU
      </span>
      <span className="text-base font-semibold tracking-tight">Financeiro Ultra</span>
    </span>
  );
}
