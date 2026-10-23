import {
  buildCompetencyOverview,
  formatReferenceMonth,
  toReferenceDate,
  type CompetencyCompanyRow,
  type ReferenceMonth,
} from "@/domain/competencies";
import { parseMoney } from "@/domain/shared/money";
import type { AppSupabaseClient, DbEnums } from "@/lib/supabase/types";

import { COMPANY_DISTRIBUTION_SELECT, toDistributionInput } from "./distribution-input";
import { getUseCustomDefaultPercentages } from "./finance-settings";

export interface CompetencyOverview {
  competency: {
    id: string;
    status: DbEnums["competency_status"];
  } | null;
  rows: CompetencyCompanyRow[];
}

/**
 * Carteira da competência: snapshot das empresas + recebimentos.
 * Consultas passam pelo RLS: um SOCIO enxerga apenas as empresas em que é
 * indicador. As regras de negócio ficam no domínio (buildCompetencyOverview).
 */
export async function getCompetencyOverview(
  supabase: AppSupabaseClient,
  reference: ReferenceMonth,
): Promise<CompetencyOverview> {
  const [competencyResult, useCustomDefaultPercentages] = await Promise.all([
    supabase
      .from("competencies")
      .select("id, status")
      .eq("reference_month", toReferenceDate(reference))
      .maybeSingle(),
    getUseCustomDefaultPercentages(supabase),
  ]);

  if (competencyResult.error) {
    throw new Error(`Falha ao carregar a competência: ${competencyResult.error.message}`);
  }
  const competency = competencyResult.data;
  if (!competency) {
    return { competency: null, rows: [] };
  }

  const [snapshotResult, receiptsResult] = await Promise.all([
    supabase
      .from("competency_companies")
      .select(
        `
        company_id,
        expected_amount::text,
        company:companies!inner (
          name,
          normalized_cnpj,
          ${COMPANY_DISTRIBUTION_SELECT}
        )
      `,
      )
      .eq("competency_id", competency.id),
    supabase
      .from("receipts")
      .select(
        "company_id, amount::text, status, receiving_indicator_id, receiving_indicator:indicators ( name )",
      )
      .eq("competency_id", competency.id),
  ]);

  if (snapshotResult.error) {
    throw new Error(`Falha ao carregar as empresas da competência: ${snapshotResult.error.message}`);
  }
  if (receiptsResult.error) {
    throw new Error(`Falha ao carregar os recebimentos: ${receiptsResult.error.message}`);
  }

  const rows = buildCompetencyOverview(
    snapshotResult.data.map((row) => ({
      companyId: row.company_id,
      name: row.company.name,
      normalizedCnpj: row.company.normalized_cnpj,
      expectedAmount: parseMoney(row.expected_amount),
      distribution: toDistributionInput(row.company, useCustomDefaultPercentages),
    })),
    receiptsResult.data.map((receipt) => ({
      companyId: receipt.company_id,
      amount: parseMoney(receipt.amount),
      status: receipt.status,
      receivingIndicatorId: receipt.receiving_indicator_id,
      receivingIndicatorName: receipt.receiving_indicator?.name ?? null,
    })),
  );

  return { competency: { id: competency.id, status: competency.status }, rows };
}

export type OpenCompetencyResult = { ok: true } | { ok: false; message: string };

/** Abre a competência e gera o snapshot das empresas ativas (RPC atômica). */
export async function openCompetency(
  supabase: AppSupabaseClient,
  reference: ReferenceMonth,
): Promise<OpenCompetencyResult> {
  const { error } = await supabase.rpc("open_competency", {
    p_reference_month: toReferenceDate(reference),
  });

  if (error) {
    return {
      ok: false,
      message:
        error.code === "23505"
          ? `A competência ${formatReferenceMonth(reference)} já está aberta.`
          : error.message,
    };
  }
  return { ok: true };
}
