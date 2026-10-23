import type { DistributionError, DistributionResult, DistributionRule } from "@/domain/distribution";
import { formatPercentage } from "@/lib/format";

const RULE_DESCRIPTION: Record<DistributionRule, string> = {
  COMPANY_CUSTOM: "Percentuais personalizados da empresa",
  COMPANY_EQUAL: "Divisão igualitária definida na empresa",
  INHERIT_DEFAULT_PERCENTAGE: "Percentuais padrão da carteira",
  INHERIT_EQUAL: "Padrão da carteira: divisão igualitária",
  INHERIT_EQUAL_FALLBACK:
    "Divisão igualitária: os percentuais padrão não fecham 100% para estes indicadores",
};

const ERROR_LABEL: Record<DistributionError["code"], string> = {
  NO_INDICATORS: "Sem indicadores",
  INACTIVE_INDICATOR: "Indicador inativo",
  CUSTOM_PERCENTAGE_MISSING: "Percentual ausente",
  CUSTOM_PERCENTAGES_DO_NOT_SUM_100: "Soma ≠ 100%",
};

/** Exibe o resultado do domínio de distribuição. Não calcula nada. */
export function DistributionSummary({ distribution }: { distribution: DistributionResult }) {
  if (!distribution.ok) {
    return (
      <span className="text-destructive" title="Revise o cadastro de distribuição da empresa">
        {ERROR_LABEL[distribution.error.code]}
      </span>
    );
  }

  const label =
    distribution.source === "EQUAL"
      ? "Igualitária"
      : distribution.shares.map((share) => formatPercentage(share.percentage)).join(" / ");

  return (
    <span className="tabular-nums" title={RULE_DESCRIPTION[distribution.rule]}>
      {label}
    </span>
  );
}
