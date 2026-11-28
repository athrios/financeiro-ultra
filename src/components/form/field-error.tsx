import { CircleAlert } from "lucide-react";

/** Erro de campo: texto + ícone (a cor nunca é o único meio), ligado por aria-describedby. */
export function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm text-danger-foreground">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
