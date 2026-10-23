import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  addMonths,
  formatReferenceMonth,
  toMonthParam,
  type ReferenceMonth,
} from "@/domain/competencies";

export function CompetencySelector({ reference }: { reference: ReferenceMonth }) {
  const previous = addMonths(reference, -1);
  const next = addMonths(reference, 1);

  return (
    <nav aria-label="Competência" className="flex items-center gap-2">
      <Link
        href={`/?competencia=${toMonthParam(previous)}`}
        className={buttonVariants({ variant: "outline", size: "icon" })}
        aria-label={`Competência anterior: ${formatReferenceMonth(previous)}`}
      >
        <ChevronLeft />
      </Link>
      <span className="min-w-40 text-center text-sm font-medium" aria-live="polite">
        {formatReferenceMonth(reference)}
      </span>
      <Link
        href={`/?competencia=${toMonthParam(next)}`}
        className={buttonVariants({ variant: "outline", size: "icon" })}
        aria-label={`Próxima competência: ${formatReferenceMonth(next)}`}
      >
        <ChevronRight />
      </Link>
    </nav>
  );
}
