import { Badge } from "@/components/ui/badge";
import type { IndicatorRef } from "@/domain/competencies";

export function IndicatorBadges({ indicators }: { indicators: IndicatorRef[] }) {
  if (indicators.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {indicators.map((indicator) => (
        <Badge key={indicator.indicatorId} variant="outline">
          {indicator.name}
        </Badge>
      ))}
    </div>
  );
}
