/**
 * Seed de DESENVOLVIMENTO (Supabase local).
 *
 *   npm run db:reset   # migrations + supabase/seed.sql (dados estruturais)
 *   npm run seed:dev   # usuários, competências, recebimentos e liquidação
 *
 * Usa a chave secreta apenas para criar usuários no Auth e vincular perfis.
 * Todo o resto roda autenticado como ADMIN_FINANCEIRO, pelas mesmas RPCs,
 * políticas RLS e serviços de domínio usados pela aplicação.
 */
import { createClient } from "@supabase/supabase-js";

import { balanceDirection, ledgerImbalance } from "@/domain/compensation";
import { formatReferenceMonth, toReferenceDate, type ReferenceMonth } from "@/domain/competencies";
import { cents, toMoneyString } from "@/domain/shared/money";
import { formatCurrency } from "@/lib/format";
import type { AppSupabaseClient, DbEnums } from "@/lib/supabase/types";
import { getCompetencyOverview, openCompetency } from "@/server/competencies";
import { getIndicatorPositions } from "@/server/ledger";
import { confirmReceipt } from "@/server/receipts";
import type { Database } from "@/types/database.types";

// Senha só do Supabase LOCAL. Sobrescreva com DEV_SEED_PASSWORD em .env.local.
const DEV_PASSWORD = process.env.DEV_SEED_PASSWORD || "ultra-dev-2026";

const INDICATORS = {
  clara: "a0000000-0000-4000-8000-000000000001",
  bruno: "a0000000-0000-4000-8000-000000000002",
  alice: "a0000000-0000-4000-8000-000000000003",
} as const;

const COMPANIES = {
  padaria: "c0000000-0000-4000-8000-000000000001",
  mercado: "c0000000-0000-4000-8000-000000000002",
  clinica: "c0000000-0000-4000-8000-000000000003",
  autoPecas: "c0000000-0000-4000-8000-000000000004",
  construtora: "c0000000-0000-4000-8000-000000000005",
  studio: "c0000000-0000-4000-8000-000000000006",
  techNova: "c0000000-0000-4000-8000-000000000007",
} as const;

const SEPTEMBER: ReferenceMonth = { year: 2026, month: 9 };
const OCTOBER: ReferenceMonth = { year: 2026, month: 10 };

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Defina ${name} em .env.local (veja .env.example).`);
  return value;
}

const url = env("NEXT_PUBLIC_SUPABASE_URL");
const LOCAL_HOSTNAMES = ["127.0.0.1", "localhost"];
function isLocalUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && LOCAL_HOSTNAMES.includes(parsed.hostname);
  } catch {
    return false;
  }
}
if (!isLocalUrl(url)) {
  throw new Error("seed:dev só roda contra o Supabase local (127.0.0.1 ou localhost).");
}

const service = createClient<Database>(url, env("SUPABASE_SECRET_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Dado do ramo de sucesso de uma resposta { data, error } do supabase-js. */
type SuccessData<R> = Extract<R, { error: null }> extends { data: infer D } ? D : never;

function must<R extends { data: unknown; error: { message: string } | null }>(
  result: R,
  context: string,
): SuccessData<R> {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data as SuccessData<R>;
}

/** PostgREST aceita numeric como texto: evita qualquer passagem por float. */
function numeric(value: string): number {
  return value as unknown as number;
}

async function ensureUser(
  email: string,
  fullName: string,
  role: DbEnums["user_role"],
  indicatorId: string | null,
): Promise<string> {
  const created = await service.auth.admin.createUser({
    email,
    password: DEV_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  let userId = created.data.user?.id;
  if (!userId) {
    if (created.error?.code !== "email_exists") {
      throw new Error(`Criar usuário ${email}: ${created.error?.message}`);
    }
    const list = must(await service.auth.admin.listUsers({ perPage: 1000 }), "Listar usuários");
    userId = list.users.find((user) => user.email === email)?.id;
    if (!userId) throw new Error(`Usuário ${email} não encontrado.`);
  }

  // O perfil nasce SOCIO sem indicador; papel e vínculo são definidos aqui.
  must(
    await service.from("profiles").update({ role, indicator_id: indicatorId }).eq("id", userId),
    `Configurar perfil ${email}`,
  );
  return userId;
}

async function signedInClient(email: string): Promise<AppSupabaseClient> {
  const client = createClient<Database>(url, env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  must(await client.auth.signInWithPassword({ email, password: DEV_PASSWORD }), `Login ${email}`);
  return client;
}

async function ensureCompetency(admin: AppSupabaseClient, reference: ReferenceMonth): Promise<string> {
  const existing = must(
    await admin.from("competencies").select("id").eq("reference_month", toReferenceDate(reference)).maybeSingle(),
    "Consultar competência",
  );
  if (!existing) {
    const result = await openCompetency(admin, reference);
    if (!result.ok) throw new Error(result.message);
    console.log(`  competência ${formatReferenceMonth(reference)} aberta`);
  }
  const competency = must(
    await admin.from("competencies").select("id").eq("reference_month", toReferenceDate(reference)).single(),
    "Carregar competência",
  );
  return competency.id;
}

type ReceiptInsert = Database["public"]["Tables"]["receipts"]["Insert"];

async function seedReceipts(
  admin: AppSupabaseClient,
  competencyId: string,
  receipts: (Omit<ReceiptInsert, "competency_id"> & { confirm: boolean })[],
): Promise<void> {
  const { count, error } = await admin
    .from("receipts")
    .select("id", { count: "exact", head: true })
    .eq("competency_id", competencyId);
  if (error) throw new Error(`Contar recebimentos: ${error.message}`);
  if ((count ?? 0) > 0) {
    console.log("  recebimentos já existem — mantidos");
    return;
  }

  for (const { confirm, ...receipt } of receipts) {
    const inserted = must(
      await admin.from("receipts").insert({ ...receipt, competency_id: competencyId }).select("id").single(),
      "Inserir recebimento",
    );
    if (confirm) {
      const result = await confirmReceipt(admin, inserted.id);
      if (!result.ok) throw new Error(`Confirmar recebimento: ${result.message}`);
    }
  }
  console.log(`  ${receipts.length} recebimentos (${receipts.filter((r) => r.confirm).length} confirmados)`);
}

async function main() {
  console.log("Usuários");
  const adminId = await ensureUser("admin@exemplo.test", "Administrador Financeiro", "ADMIN_FINANCEIRO", null);
  await ensureUser("clara@exemplo.test", "Clara", "SOCIO", INDICATORS.clara);
  const brunoUserId = await ensureUser("bruno@exemplo.test", "Bruno", "SOCIO", INDICATORS.bruno);
  await ensureUser("alice@exemplo.test", "Alice", "SOCIO", INDICATORS.alice);

  const admin = await signedInClient("admin@exemplo.test");

  console.log("Competências");
  const septemberId = await ensureCompetency(admin, SEPTEMBER);

  // A mensalidade da Padaria muda de R$ 500 para R$ 600 depois de setembro:
  // setembro mantém R$ 500 no snapshot, outubro nasce com R$ 600.
  must(
    await admin.from("companies").update({ default_amount: numeric("600.00") }).eq("id", COMPANIES.padaria),
    "Atualizar mensalidade",
  );
  const octoberId = await ensureCompetency(admin, OCTOBER);

  const resolveReceiver = async (name: string) =>
    must(await admin.rpc("resolve_receiver_indicator", { p_receiver_name: name }), "Resolver alias");

  console.log(`Recebimentos de ${formatReferenceMonth(SEPTEMBER)}`);
  await seedReceipts(admin, septemberId, [
    {
      // Enviado por Bruno, recebido por Clara (via alias): papéis distintos.
      company_id: COMPANIES.padaria, company_identification_method: "CNPJ",
      amount: numeric("500.00"), payment_date: "2026-09-05", uploaded_by: brunoUserId,
      extracted_receiver_name: "CONTABIL EXEMPLO LTDA.",
      receiving_indicator_id: await resolveReceiver("CONTABIL EXEMPLO LTDA."),
      receiver_identification_method: "ALIAS", status: "AWAITING_CONFIRMATION", confirm: true,
    },
    {
      company_id: COMPANIES.mercado, company_identification_method: "CNPJ",
      amount: numeric("350.00"), payment_date: "2026-09-08", uploaded_by: adminId,
      receiving_indicator_id: INDICATORS.bruno, receiver_identification_method: "MANUAL",
      status: "AWAITING_CONFIRMATION", confirm: true,
    },
    {
      company_id: COMPANIES.clinica, company_identification_method: "NAME",
      amount: numeric("900.00"), payment_date: "2026-09-10", uploaded_by: adminId,
      receiving_indicator_id: INDICATORS.alice, receiver_identification_method: "MANUAL",
      status: "AWAITING_CONFIRMATION", confirm: true,
    },
    {
      company_id: COMPANIES.autoPecas, company_identification_method: "CNPJ",
      amount: numeric("1200.00"), payment_date: "2026-09-10", uploaded_by: adminId,
      receiving_indicator_id: INDICATORS.clara, receiver_identification_method: "MANUAL",
      status: "AWAITING_CONFIRMATION", confirm: true,
    },
    {
      company_id: COMPANIES.construtora, company_identification_method: "CNPJ",
      amount: numeric("2500.00"), payment_date: "2026-09-12", uploaded_by: adminId,
      receiving_indicator_id: INDICATORS.clara, receiver_identification_method: "MANUAL",
      status: "AWAITING_CONFIRMATION", confirm: true,
    },
    {
      company_id: COMPANIES.studio, company_identification_method: "MANUAL",
      amount: numeric("280.00"), payment_date: "2026-09-15", uploaded_by: adminId,
      receiving_indicator_id: INDICATORS.alice, receiver_identification_method: "MANUAL",
      status: "AWAITING_CONFIRMATION", confirm: true,
    },
    {
      company_id: COMPANIES.techNova, company_identification_method: "CNPJ",
      amount: numeric("750.00"), payment_date: "2026-09-20", uploaded_by: adminId,
      receiving_indicator_id: INDICATORS.bruno, receiver_identification_method: "MANUAL",
      status: "AWAITING_CONFIRMATION", confirm: true,
    },
  ]);

  // Liquidação PARCIAL de setembro: quem mais deve paga metade a quem mais tem a receber.
  const existingSettlements = must(
    await admin.from("settlements").select("id").eq("competency_id", septemberId),
    "Consultar liquidações",
  );
  if (existingSettlements.length === 0) {
    const positions = await getIndicatorPositions(admin, SEPTEMBER);
    const debtor = positions.reduce((a, b) => (a.currentBalance < b.currentBalance ? a : b));
    const creditor = positions.reduce((a, b) => (a.currentBalance > b.currentBalance ? a : b));
    const half = cents(Math.floor(Math.min(-debtor.currentBalance, creditor.currentBalance) / 2));
    must(
      await admin.from("settlements").insert({
        competency_id: septemberId,
        from_indicator_id: debtor.indicatorId,
        to_indicator_id: creditor.indicatorId,
        amount: numeric(toMoneyString(half)),
        settlement_date: "2026-09-30",
        notes: "Liquidação parcial (seed de desenvolvimento)",
        created_by: adminId,
      }),
      "Registrar liquidação",
    );
    console.log(`  liquidação parcial de ${formatCurrency(half)} registrada`);
  }

  console.log(`Recebimentos de ${formatReferenceMonth(OCTOBER)}`);
  await seedReceipts(admin, octoberId, [
    {
      company_id: COMPANIES.padaria, company_identification_method: "CNPJ",
      amount: numeric("600.00"), payment_date: "2026-10-05", uploaded_by: brunoUserId,
      extracted_receiver_name: "Contabil Exemplo",
      receiving_indicator_id: await resolveReceiver("Contabil Exemplo"),
      receiver_identification_method: "ALIAS", status: "AWAITING_CONFIRMATION", confirm: true,
    },
    {
      // Pagamento parcial
      company_id: COMPANIES.mercado, company_identification_method: "CNPJ",
      amount: numeric("200.00"), payment_date: "2026-10-06", uploaded_by: adminId,
      receiving_indicator_id: INDICATORS.bruno, receiver_identification_method: "MANUAL",
      status: "AWAITING_CONFIRMATION", confirm: true,
    },
    {
      // 3 indicadores em partes iguais: R$ 100,00 não divide exato (centavo residual)
      company_id: COMPANIES.clinica, company_identification_method: "CNPJ",
      amount: numeric("900.00"), payment_date: "2026-10-06", uploaded_by: adminId,
      receiving_indicator_id: INDICATORS.alice, receiver_identification_method: "MANUAL",
      status: "AWAITING_CONFIRMATION", confirm: true,
    },
    {
      // Recebedor não identificado pelo alias -> Revisão
      company_id: COMPANIES.autoPecas, company_identification_method: "CNPJ",
      amount: numeric("1200.00"), payment_date: "2026-10-07", uploaded_by: adminId,
      extracted_receiver_name: "Fulano de Tal",
      status: "AWAITING_RECEIVER", confirm: false,
    },
    {
      company_id: COMPANIES.construtora, company_identification_method: "CNPJ",
      amount: numeric("2500.00"), payment_date: "2026-10-07", uploaded_by: adminId,
      receiving_indicator_id: INDICATORS.clara, receiver_identification_method: "MANUAL",
      status: "AWAITING_CONFIRMATION", confirm: true,
    },
    {
      company_id: COMPANIES.techNova, company_identification_method: "CNPJ",
      amount: numeric("750.00"), payment_date: "2026-10-03", uploaded_by: adminId,
      receiving_indicator_id: INDICATORS.bruno, receiver_identification_method: "MANUAL",
      status: "AWAITING_CONFIRMATION", confirm: true,
    },
    {
      // Segundo comprovante aguardando confirmação -> Revisão
      company_id: COMPANIES.techNova, company_identification_method: "CNPJ",
      amount: numeric("750.00"), payment_date: "2026-10-07", uploaded_by: adminId,
      receiving_indicator_id: INDICATORS.bruno, receiver_identification_method: "MANUAL",
      status: "AWAITING_CONFIRMATION", confirm: false,
    },
    {
      // Empresa não identificada: não aparece na tabela (sem company_id)
      amount: numeric("150.00"), payment_date: "2026-10-07", uploaded_by: adminId,
      extracted_payer_name: "Pagador Desconhecido", status: "AWAITING_COMPANY", confirm: false,
    },
  ]);

  console.log("\nVerificação");
  const names: Record<string, string> = { [INDICATORS.clara]: "Clara", [INDICATORS.bruno]: "Bruno", [INDICATORS.alice]: "Alice" };
  for (const reference of [SEPTEMBER, OCTOBER]) {
    const positions = await getIndicatorPositions(admin, reference);
    const imbalance = ledgerImbalance(positions);
    console.log(`  ${formatReferenceMonth(reference)} — soma dos saldos: competência ${formatCurrency(imbalance.competencyBalance)}, acumulado ${formatCurrency(imbalance.currentBalance)}`);
    for (const p of positions) {
      console.log(
        `    ${names[p.indicatorId].padEnd(8)} anterior ${formatCurrency(p.previousBalance).padStart(13)} | direito ${formatCurrency(p.economicRight).padStart(13)} | recebido ${formatCurrency(p.directlyReceived).padStart(13)} | liquidações ${formatCurrency(p.settlementsNet).padStart(13)} | atual ${formatCurrency(p.currentBalance).padStart(13)} (${balanceDirection(p.currentBalance)})`,
      );
    }
    if (imbalance.competencyBalance !== 0 || imbalance.currentBalance !== 0) {
      throw new Error("Ledger desequilibrado: a soma dos saldos deveria ser zero.");
    }
  }

  const alice = await signedInClient("alice@exemplo.test");
  const aliceView = await getCompetencyOverview(alice, OCTOBER);
  const adminView = await getCompetencyOverview(admin, OCTOBER);
  console.log(`  RLS: admin vê ${adminView.rows.length} empresas em outubro; Alice (SOCIO) vê ${aliceView.rows.length}`);

  console.log(`\nPronto. Senha de todos os usuários de desenvolvimento: ${DEV_PASSWORD}`);
  console.log("  admin@exemplo.test (ADMIN_FINANCEIRO) · clara@ / bruno@ / alice@exemplo.test (SOCIO)");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
