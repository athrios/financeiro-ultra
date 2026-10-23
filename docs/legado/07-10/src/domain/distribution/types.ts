import type { Cents } from "@/domain/shared/money";
import type { PercentUnits } from "@/domain/shared/percentage";

export type DistributionMode = "INHERIT" | "EQUAL" | "CUSTOM";

/** Valores de receipt_allocations.distribution_source. */
export type DistributionSource = "EQUAL" | "DEFAULT_PERCENTAGE" | "COMPANY_CUSTOM";

/**
 * Caminho percorrido na hierarquia de distribuição:
 *
 *   CUSTOM da empresa                     -> COMPANY_CUSTOM
 *   EQUAL explícito da empresa            -> COMPANY_EQUAL
 *   INHERIT + percentual padrão válido    -> INHERIT_DEFAULT_PERCENTAGE
 *   INHERIT + padrão desativado           -> INHERIT_EQUAL
 *   INHERIT + padrão inválido p/ o grupo  -> INHERIT_EQUAL_FALLBACK
 */
export type DistributionRule =
  | "COMPANY_CUSTOM"
  | "COMPANY_EQUAL"
  | "INHERIT_DEFAULT_PERCENTAGE"
  | "INHERIT_EQUAL"
  | "INHERIT_EQUAL_FALLBACK";

/** Por que o percentual padrão não serviu para o conjunto de indicadores. */
export type DefaultFallbackReason = "MISSING_DEFAULT_PERCENTAGE" | "DEFAULTS_DO_NOT_SUM_100";

export interface DistributionIndicator {
  indicatorId: string;
  name: string;
  active: boolean;
  /** company_indicators.custom_percentage (relevante apenas em CUSTOM). */
  customPercentage: PercentUnits | null;
  /** indicators.default_percentage. */
  defaultPercentage: PercentUnits | null;
}

export interface DistributionInput {
  mode: DistributionMode;
  /** finance_settings.use_custom_default_percentages */
  useCustomDefaultPercentages: boolean;
  /** Indicadores econômicos vinculados à empresa. */
  indicators: readonly DistributionIndicator[];
}

export interface DistributionShare {
  indicatorId: string;
  name: string;
  percentage: PercentUnits;
}

export type DistributionError =
  | { code: "NO_INDICATORS" }
  | { code: "INACTIVE_INDICATOR"; indicatorIds: string[] }
  | { code: "CUSTOM_PERCENTAGE_MISSING"; indicatorIds: string[] }
  | { code: "CUSTOM_PERCENTAGES_DO_NOT_SUM_100"; total: PercentUnits };

export type DistributionResult =
  | {
      ok: true;
      source: DistributionSource;
      rule: DistributionRule;
      fallbackReason?: DefaultFallbackReason;
      /** Ordenadas por percentual (desc) e nome. Soma sempre 100%. */
      shares: DistributionShare[];
    }
  | { ok: false; error: DistributionError };

export interface AmountAllocation extends DistributionShare {
  amount: Cents;
}
