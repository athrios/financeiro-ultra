import {
  FULL_PERCENT,
  percentUnits,
  sumPercentages,
  type PercentUnits,
} from "@/domain/shared/percentage";

import { apportion, tieBreakOrder } from "./apportion";
import type {
  DefaultFallbackReason,
  DistributionIndicator,
  DistributionInput,
  DistributionResult,
  DistributionRule,
  DistributionShare,
  DistributionSource,
} from "./types";

export interface CalculateDistributionOptions {
  /**
   * Chave de desempate das sobras da divisão igualitária (ex.: id do
   * recebimento). Sem ela, o desempate segue a ordem alfabética.
   */
  tieBreakKey?: string;
}

const nameCollator = new Intl.Collator("pt-BR", { sensitivity: "base" });

/**
 * Serviço central que decide a distribuição econômica de uma empresa.
 *
 * Hierarquia:
 *   1. CUSTOM da empresa      -> custom_percentage (soma exatamente 100%)
 *   2. EQUAL explícito        -> divisão igualitária
 *   3. INHERIT
 *        a. percentual padrão válido para o conjunto -> default_percentage
 *        b. caso contrário                            -> divisão igualitária
 *
 * Nunca normaliza nem redistribui percentuais: se a regra explícita não
 * fecha 100%, o resultado é um erro (CUSTOM) ou o fallback igualitário
 * documentado (INHERIT).
 */
export function calculateDistribution(
  input: DistributionInput,
  options: CalculateDistributionOptions = {},
): DistributionResult {
  const indicators = [...input.indicators].sort(
    (a, b) => nameCollator.compare(a.name, b.name) || a.indicatorId.localeCompare(b.indicatorId),
  );

  if (indicators.length === 0) {
    return { ok: false, error: { code: "NO_INDICATORS" } };
  }

  const inactive = indicators.filter((indicator) => !indicator.active);
  if (inactive.length > 0) {
    return {
      ok: false,
      error: { code: "INACTIVE_INDICATOR", indicatorIds: inactive.map((i) => i.indicatorId) },
    };
  }

  switch (input.mode) {
    case "CUSTOM":
      return customDistribution(indicators);
    case "EQUAL":
      return equalDistribution(indicators, "COMPANY_EQUAL", options.tieBreakKey);
    case "INHERIT":
      return inheritedDistribution(indicators, input.useCustomDefaultPercentages, options.tieBreakKey);
  }
}

function customDistribution(indicators: DistributionIndicator[]): DistributionResult {
  const missing = indicators.filter((indicator) => indicator.customPercentage === null);
  if (missing.length > 0) {
    return {
      ok: false,
      error: { code: "CUSTOM_PERCENTAGE_MISSING", indicatorIds: missing.map((i) => i.indicatorId) },
    };
  }

  const shares = indicators.map((indicator) =>
    toShare(indicator, indicator.customPercentage as PercentUnits),
  );
  const total = sumPercentages(shares.map((share) => share.percentage));
  if (total !== FULL_PERCENT) {
    return { ok: false, error: { code: "CUSTOM_PERCENTAGES_DO_NOT_SUM_100", total } };
  }

  return success("COMPANY_CUSTOM", shares);
}

function inheritedDistribution(
  indicators: DistributionIndicator[],
  useCustomDefaultPercentages: boolean,
  tieBreakKey: string | undefined,
): DistributionResult {
  if (!useCustomDefaultPercentages) {
    return equalDistribution(indicators, "INHERIT_EQUAL", tieBreakKey);
  }

  const fallbackReason = defaultPercentagesProblem(indicators);
  if (fallbackReason) {
    return equalDistribution(indicators, "INHERIT_EQUAL_FALLBACK", tieBreakKey, fallbackReason);
  }

  return success(
    "INHERIT_DEFAULT_PERCENTAGE",
    indicators.map((indicator) => toShare(indicator, indicator.defaultPercentage as PercentUnits)),
  );
}

/**
 * O padrão só é válido para o conjunto se TODOS os indicadores da empresa
 * têm percentual padrão e eles somam exatamente 100%. Um subconjunto do
 * padrão (ex.: 50% + 25%) nunca é reescalado.
 */
function defaultPercentagesProblem(
  indicators: DistributionIndicator[],
): DefaultFallbackReason | undefined {
  if (indicators.some((indicator) => indicator.defaultPercentage === null)) {
    return "MISSING_DEFAULT_PERCENTAGE";
  }
  const total = sumPercentages(indicators.map((i) => i.defaultPercentage as PercentUnits));
  return total === FULL_PERCENT ? undefined : "DEFAULTS_DO_NOT_SUM_100";
}

function equalDistribution(
  indicators: DistributionIndicator[],
  rule: Extract<DistributionRule, "COMPANY_EQUAL" | "INHERIT_EQUAL" | "INHERIT_EQUAL_FALLBACK">,
  tieBreakKey: string | undefined,
  fallbackReason?: DefaultFallbackReason,
): DistributionResult {
  const keys = indicators.map((indicator) => indicator.indicatorId);
  const split = apportion(
    FULL_PERCENT,
    keys.map((key) => ({ key, weight: 1 })),
    tieBreakOrder(keys, tieBreakKey),
  );

  const shares = indicators.map((indicator) =>
    toShare(indicator, percentUnits(split.get(indicator.indicatorId) ?? 0)),
  );
  return success(rule, shares, fallbackReason);
}

const SOURCE_BY_RULE: Record<DistributionRule, DistributionSource> = {
  COMPANY_CUSTOM: "COMPANY_CUSTOM",
  COMPANY_EQUAL: "EQUAL",
  INHERIT_DEFAULT_PERCENTAGE: "DEFAULT_PERCENTAGE",
  INHERIT_EQUAL: "EQUAL",
  INHERIT_EQUAL_FALLBACK: "EQUAL",
};

function success(
  rule: DistributionRule,
  shares: DistributionShare[],
  fallbackReason?: DefaultFallbackReason,
): DistributionResult {
  const ordered = [...shares].sort(
    (a, b) => b.percentage - a.percentage || nameCollator.compare(a.name, b.name),
  );
  return {
    ok: true,
    source: SOURCE_BY_RULE[rule],
    rule,
    ...(fallbackReason ? { fallbackReason } : {}),
    shares: ordered,
  };
}

function toShare(indicator: DistributionIndicator, percentage: PercentUnits): DistributionShare {
  return { indicatorId: indicator.indicatorId, name: indicator.name, percentage };
}
