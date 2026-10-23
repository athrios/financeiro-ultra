import type { DistributionInput, DistributionMode } from "@/domain/distribution";
import { parsePercentage } from "@/domain/shared/percentage";

/**
 * Formato das linhas vindas do Supabase para montar a entrada do domínio de
 * distribuição. Percentuais chegam como texto (select com ::text) para não
 * passar por float.
 */
export interface CompanyDistributionRow {
  distribution_mode: DistributionMode;
  company_indicators: {
    indicator_id: string;
    custom_percentage: string | null;
    indicator: {
      name: string;
      active: boolean;
      default_percentage: string | null;
    } | null;
  }[];
}

/** Trecho de select reutilizado onde a distribuição é necessária. */
export const COMPANY_DISTRIBUTION_SELECT = `
  distribution_mode,
  company_indicators (
    indicator_id,
    custom_percentage::text,
    indicator:indicators ( name, active, default_percentage::text )
  )
` as const;

export function toDistributionInput(
  company: CompanyDistributionRow,
  useCustomDefaultPercentages: boolean,
): DistributionInput {
  return {
    mode: company.distribution_mode,
    useCustomDefaultPercentages,
    indicators: company.company_indicators.map((link) => {
      if (!link.indicator) {
        throw new Error(`Indicador ${link.indicator_id} não encontrado.`);
      }
      return {
        indicatorId: link.indicator_id,
        name: link.indicator.name,
        active: link.indicator.active,
        customPercentage:
          link.custom_percentage === null ? null : parsePercentage(link.custom_percentage),
        defaultPercentage:
          link.indicator.default_percentage === null
            ? null
            : parsePercentage(link.indicator.default_percentage),
      };
    }),
  };
}
