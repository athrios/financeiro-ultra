import { CircleCheck, CirclePause } from "lucide-react";

import { Badge } from "@/components/ui/badge";

/**
 * Situação do cadastro (UI 9.2 `StatusBadge`): "Ativo" ou "Inativo", sempre com ícone e texto
 * (a cor nunca é o único meio, UXC-43).
 */
export function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge variant="success">
      <CircleCheck aria-hidden="true" />
      Ativo
    </Badge>
  ) : (
    <Badge variant="outline">
      <CirclePause aria-hidden="true" />
      Inativo
    </Badge>
  );
}
