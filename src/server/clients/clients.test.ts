import { describe, expect, it } from "vitest";

import { buildClientSaveSchema, clientSaveSchema, clientSetActiveSchema, searchAliasesSchema, searchClientsSchema } from "@/domain/cadastros/schemas";

import { createFakeSupabase, dbError, fail, ok } from "../../../tests/unit-support/fake-supabase";
import { getClientActiveState, getClientDetail, listActivePartnerNamesByClient, saveClient, searchAliases, searchClients, setClientActive } from "./clients";

const PARTNER_A = "a0000000-0000-4000-8000-000000000001";
const PARTNER_B = "a0000000-0000-4000-8000-000000000002";
const CLIENT_ID = "d4000000-0000-4000-8000-000000000001";
const OTHER_CLIENT = "d4000000-0000-4000-8000-000000000002";
const CORRELATION = "c0000000-0000-4000-8000-0000000000ff";
const VERSION = "2026-11-25T14:03:11.123456+00:00";

const listRow = (overrides: Record<string, unknown> = {}) => ({
  id: CLIENT_ID,
  legal_name: "Cliente Modelo Ltda",
  trade_name: null,
  document: "12ABC34501DE35",
  document_type: "CNPJ",
  default_monthly_value: "1500.00",
  active: true,
  partner_count: 2,
  updated_at: VERSION,
  total_count: 7,
  ...overrides,
});

describe("searchClients", () => {
  it("mapeia a lista; mensalidade segue como TEXTO; total vem da primeira linha", async () => {
    const fake = createFakeSupabase({ rpc: { search_clients: () => ok([listRow(), listRow({ id: OTHER_CLIENT, document: null, document_type: null, default_monthly_value: "350.00", total_count: 7 })]) } });
    const page = await searchClients(fake.client, searchClientsSchema.parse({ query: " modelo ", status: "ALL", limit: 25, offset: 0 }));
    expect(page.total).toBe(7);
    expect(page.items[0]).toEqual({
      id: CLIENT_ID, legalName: "Cliente Modelo Ltda", tradeName: null, document: "12ABC34501DE35", documentType: "CNPJ",
      monthlyValue: "1500.00", active: true, partnerCount: 2, updatedAt: VERSION,
    });
    expect(page.items[1]).toMatchObject({ document: null, documentType: null, monthlyValue: "350.00" });
    expect(typeof page.items[0].monthlyValue).toBe("string");
    expect(fake.rpcCalls[0]).toEqual({
      name: "search_clients",
      args: { p_query: "modelo", p_status: "ALL", p_limit: 25, p_offset: 0 },
    });
  });

  it("filtro por sócio vai como p_partner_id; vazio ou ausente não envia nada", async () => {
    const fake = createFakeSupabase({ rpc: { search_clients: () => ok([]) } });
    await searchClients(fake.client, searchClientsSchema.parse({ status: "ALL", partnerId: PARTNER_A }));
    expect(fake.rpcCalls[0].args).toMatchObject({ p_status: "ALL", p_partner_id: PARTNER_A });
    await searchClients(fake.client, searchClientsSchema.parse({ partnerId: null }));
    expect(fake.rpcCalls[1].args).not.toHaveProperty("p_partner_id", PARTNER_A);
    expect((fake.rpcCalls[1].args as Record<string, unknown>).p_partner_id).toBeUndefined();
  });

  it("sócio que não é UUID é recusado antes de ir ao banco", () => {
    expect(searchClientsSchema.safeParse({ partnerId: "nao-e-uuid" }).success).toBe(false);
  });

  it("busca sem texto omite p_query; filtros padrão", async () => {
    const fake = createFakeSupabase({ rpc: { search_clients: () => ok([]) } });
    await searchClients(fake.client, searchClientsSchema.parse({}));
    expect(fake.rpcCalls[0].args).toEqual({ p_query: undefined, p_status: "ACTIVE", p_limit: 25, p_offset: 0 });
  });

  it("sem linhas: total 0 na primeira página, null além do fim (D-IMPL-20)", async () => {
    const fake = createFakeSupabase({ rpc: { search_clients: () => ok([]) } });
    expect((await searchClients(fake.client, searchClientsSchema.parse({ offset: 0 }))).total).toBe(0);
    expect((await searchClients(fake.client, searchClientsSchema.parse({ offset: 50 }))).total).toBeNull();
  });

  it("total_count que chega como texto de bigint vira número", async () => {
    const fake = createFakeSupabase({ rpc: { search_clients: () => ok([listRow({ total_count: "42" })]) } });
    expect((await searchClients(fake.client, searchClientsSchema.parse({}))).total).toBe(42);
  });

  it("INVALID_FILTER do banco vira erro de validação com o campo", async () => {
    const fake = createFakeSupabase({ rpc: { search_clients: () => fail(dbError("22023", "INVALID_FILTER", { field: "limit" })) } });
    await expect(searchClients(fake.client, searchClientsSchema.parse({}))).rejects.toMatchObject({
      code: "VALIDATION",
      hint: "INVALID_FILTER",
      field: "limit",
    });
  });

  it("papel sem acesso: o banco devolve lista vazia e a leitura não quebra", async () => {
    const fake = createFakeSupabase({ rpc: { search_clients: () => ok([]) } });
    expect(await searchClients(fake.client, searchClientsSchema.parse({}))).toMatchObject({ items: [], total: 0 });
  });
});

describe("listActivePartnerNamesByClient", () => {
  it("agrupa por cliente, só indicações ativas, nomes em ordem alfabética", async () => {
    const fake = createFakeSupabase({
      tables: {
        client_partners: () =>
          ok([
            { id: "i3", client_id: CLIENT_ID, partners: { name: "Sócio Exemplo B", normalized_name: "socio exemplo b" } },
            { id: "i1", client_id: CLIENT_ID, partners: { name: "Sócio Exemplo A", normalized_name: "socio exemplo a" } },
            { id: "i2", client_id: OTHER_CLIENT, partners: { name: "Sócio Exemplo B", normalized_name: "socio exemplo b" } },
          ]),
      },
    });
    const names = await listActivePartnerNamesByClient(fake.client, [CLIENT_ID, OTHER_CLIENT]);
    expect(names.get(CLIENT_ID)).toEqual(["Sócio Exemplo A", "Sócio Exemplo B"]);
    expect(names.get(OTHER_CLIENT)).toEqual(["Sócio Exemplo B"]);
    const query = fake.queries[0];
    expect(fake.stepsOf(query, "eq")).toEqual([["active", true]]);
    expect(fake.stepsOf(query, "in")).toEqual([["client_id", [CLIENT_ID, OTHER_CLIENT]]]);
  });

  it("sem ids (ou ids que não são UUID) não consulta o banco", async () => {
    const fake = createFakeSupabase();
    expect((await listActivePartnerNamesByClient(fake.client, [])).size).toBe(0);
    expect((await listActivePartnerNamesByClient(fake.client, ["nao-e-uuid"])).size).toBe(0);
    expect(fake.queries).toHaveLength(0);
  });

  it("divide em blocos de 50 clientes", async () => {
    const fake = createFakeSupabase({ tables: { client_partners: () => ok([]) } });
    const ids = Array.from({ length: 120 }, (_, index) => `d4000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
    await listActivePartnerNamesByClient(fake.client, ids);
    expect(fake.queries).toHaveLength(3);
  });
});

describe("getClientDetail", () => {
  const detailRow = {
    id: CLIENT_ID, legal_name: "Cliente Modelo Ltda", trade_name: "Modelo", document: "12ABC34501DE35", document_type: "CNPJ",
    default_monthly_value: "1500.00", notes: "Obs fictícia", active: true,
    created_at: "2026-11-01T10:00:00.000001+00:00", updated_at: VERSION,
    client_partners: [
      { id: "l2", partner_id: PARTNER_B, active: true, partners: { id: PARTNER_B, name: "Sócio Exemplo B", active: true } },
      { id: "l1", partner_id: PARTNER_A, active: true, partners: { id: PARTNER_A, name: "Sócio Exemplo A", active: true } },
      { id: "l3", partner_id: "a0000000-0000-4000-8000-000000000003", active: false, partners: { id: "a0000000-0000-4000-8000-000000000003", name: "Sócio Exemplo C", active: true } },
    ],
    client_aliases: [
      { id: "al2", alias: "00000000191", alias_type: "DOCUMENT", normalized_value: "00000000191", active: false, created_at: "2026-11-02T10:00:00+00:00" },
      { id: "al1", alias: "Mod. Semente", alias_type: "NAME", normalized_value: "mod semente", active: true, created_at: "2026-11-01T10:00:00+00:00" },
    ],
  };

  it("monta o detalhe: sócios por nome, n da divisão, apelidos formatados, mensalidade e versão em texto", async () => {
    const fake = createFakeSupabase({ tables: { clients: () => ok(detailRow) } });
    const detail = await getClientDetail(fake.client, CLIENT_ID);
    expect(detail).toMatchObject({
      id: CLIENT_ID, legalName: "Cliente Modelo Ltda", tradeName: "Modelo", document: "12ABC34501DE35", documentType: "CNPJ",
      monthlyValue: "1500.00", notes: "Obs fictícia", active: true, updatedAt: VERSION,
      createdAt: "2026-11-01T10:00:00.000001+00:00", activePartnerCount: 2,
    });
    expect(detail!.partners).toEqual([
      { partnerId: PARTNER_A, name: "Sócio Exemplo A", partnerActive: true, indicationActive: true },
      { partnerId: PARTNER_B, name: "Sócio Exemplo B", partnerActive: true, indicationActive: true },
      { partnerId: "a0000000-0000-4000-8000-000000000003", name: "Sócio Exemplo C", partnerActive: true, indicationActive: false },
    ]);
    expect(detail!.aliases).toEqual([
      { id: "al1", type: "NAME", value: "Mod. Semente", displayValue: "Mod. Semente", active: true },
      { id: "al2", type: "DOCUMENT", value: "00000000191", displayValue: "000.000.001-91", active: false },
    ]);
    expect(typeof detail!.monthlyValue).toBe("string");
  });

  it("pede a mensalidade como texto (::text), nunca como numeric", async () => {
    const fake = createFakeSupabase({ tables: { clients: () => ok(detailRow) } });
    await getClientDetail(fake.client, CLIENT_ID);
    const [select] = fake.stepsOf(fake.queries[0], "select");
    expect(String(select[0])).toContain("default_monthly_value::text");
  });

  it("cliente sem sócio (inativo): lista vazia, n = 0", async () => {
    const fake = createFakeSupabase({ tables: { clients: () => ok({ ...detailRow, active: false, client_partners: [], client_aliases: [] }) } });
    expect(await getClientDetail(fake.client, CLIENT_ID)).toMatchObject({ partners: [], activePartnerCount: 0, aliases: [], active: false });
  });

  it("id inválido ou escondido pelo RLS devolve null", async () => {
    const fake = createFakeSupabase({ tables: { clients: () => ok(null) } });
    expect(await getClientDetail(fake.client, "123")).toBeNull();
    expect(fake.queries).toEqual([]);
    expect(await getClientDetail(fake.client, CLIENT_ID)).toBeNull();
  });
});

describe("getClientActiveState", () => {
  it("lê só a situação do cliente", async () => {
    const fake = createFakeSupabase({ tables: { clients: () => ok({ id: CLIENT_ID, active: false }) } });
    expect(await getClientActiveState(fake.client, CLIENT_ID)).toEqual({ active: false });
    expect(fake.stepsOf(fake.queries[0], "eq")).toEqual([["id", CLIENT_ID]]);
  });

  it("não existe ou o RLS esconde: null; id que não é UUID: null sem consultar", async () => {
    const fake = createFakeSupabase({ tables: { clients: () => ok(null) } });
    expect(await getClientActiveState(fake.client, CLIENT_ID)).toBeNull();
    expect(await getClientActiveState(fake.client, "não-é-uuid")).toBeNull();
    expect(fake.queries).toHaveLength(1);
  });
});

describe("searchAliases", () => {
  const row = (overrides: Record<string, unknown>) => ({
    kind: "PIX_KEY", item_id: "i1", display_value: "semente.a@example.com", active: true,
    owner_kind: "RECEIVER", owner_id: "r1", owner_name: "Sócio Exemplo A", owner_active: true,
    partner_id: PARTNER_A, partner_name: "Sócio Exemplo A", total_count: 2, ...overrides,
  });

  it("mapeia os donos e ignora tipo desconhecido (nunca inventa tipo)", async () => {
    const fake = createFakeSupabase({
      rpc: {
        search_aliases: () =>
          ok([
            row({}),
            row({ kind: "CLIENT_ALIAS", item_id: "i2", display_value: "Mod. Semente", owner_kind: "CLIENT", owner_id: CLIENT_ID, owner_name: "Cliente Modelo Ltda", partner_id: null, partner_name: null }),
            row({ kind: "FUTURO", item_id: "i3" }),
          ]),
      },
    });
    const page = await searchAliases(fake.client, searchAliasesSchema.parse({ query: "semente", kind: null, status: "ALL" }));
    expect(page.total).toBe(2);
    expect(page.items.map((item) => item.kind)).toEqual(["PIX_KEY", "CLIENT_ALIAS"]);
    expect(page.items[1]).toMatchObject({ ownerKind: "CLIENT", ownerName: "Cliente Modelo Ltda", partnerId: null, partnerName: null });
    expect(fake.rpcCalls[0].args).toEqual({ p_query: "semente", p_kind: undefined, p_status: "ALL", p_limit: 50, p_offset: 0 });
  });

  it("não-Administrador: lista vazia, sem erro", async () => {
    const fake = createFakeSupabase({ rpc: { search_aliases: () => ok([]) } });
    expect(await searchAliases(fake.client, searchAliasesSchema.parse({}))).toEqual({ items: [], total: 0, limit: 50, offset: 0 });
  });
});

describe("saveClient", () => {
  const saved = { id: CLIENT_ID, legal_name: "Cliente Modelo Ltda", active: true, updated_at: "2026-11-25T14:50:00.444444+00:00", default_monthly_value: 1500 };
  const base = { legalName: "Cliente Modelo Ltda", monthlyValue: "1.500,00", partnerIds: [PARTNER_A, PARTNER_B], aliases: [] as unknown[] };

  it("cadastro novo: mensalidade em texto decimal, documento canônico, listas, confirmação e correlation id", async () => {
    const fake = createFakeSupabase({ rpc: { save_client: () => ok(saved) } });
    const input = clientSaveSchema.parse({
      ...base,
      tradeName: "Modelo",
      documentType: "CNPJ",
      document: "12.abc.345/01de-35",
      notes: "Obs",
      aliases: [{ type: "NAME", value: "Mod. Semente" }, { type: "DOCUMENT", value: "000.000.001-91" }],
      acknowledgedDuplicateIds: [OTHER_CLIENT],
      reason: "Cadastro inicial",
    });
    const result = await saveClient({ supabase: fake.client, correlationId: CORRELATION }, input);

    expect(fake.rpcCalls).toEqual([
      {
        name: "save_client",
        args: {
          p_client_id: null,
          p_legal_name: "Cliente Modelo Ltda",
          p_trade_name: "Modelo",
          p_document: "12ABC34501DE35",
          p_default_monthly_value: "1500.00",
          p_notes: "Obs",
          p_partner_ids: [PARTNER_A, PARTNER_B],
          p_aliases: [{ type: "NAME", value: "Mod. Semente" }, { type: "DOCUMENT", value: "000.000.001-91" }],
          p_expected_updated_at: null,
          p_acknowledged_duplicate_ids: [OTHER_CLIENT],
          p_reason: "Cadastro inicial",
          p_correlation_id: CORRELATION,
        },
      },
    ]);
    expect(typeof fake.rpcCalls[0].args.p_default_monthly_value).toBe("string");
    // o número do retorno (default_monthly_value: 1500) não é repassado
    expect(result).toEqual({ id: CLIENT_ID, legalName: "Cliente Modelo Ltda", active: true, updatedAt: "2026-11-25T14:50:00.444444+00:00" });
    expect(result).not.toHaveProperty("monthlyValue");
  });

  it("sem documento, fantasia e observações: vão como null; edição leva a versão em texto", async () => {
    const fake = createFakeSupabase({ rpc: { save_client: () => ok(saved) } });
    const input = clientSaveSchema.parse({ ...base, id: CLIENT_ID, expectedUpdatedAt: VERSION });
    await saveClient({ supabase: fake.client, correlationId: null }, input);
    expect(fake.rpcCalls[0].args).toMatchObject({
      p_client_id: CLIENT_ID,
      p_trade_name: null,
      p_document: null,
      p_notes: null,
      p_expected_updated_at: VERSION,
      p_acknowledged_duplicate_ids: [],
      p_reason: undefined,
      p_correlation_id: undefined,
    });
    expect(typeof fake.rpcCalls[0].args.p_expected_updated_at).toBe("string");
  });

  it("cliente inativo salvo sem sócios (R-C10) envia lista vazia", async () => {
    const fake = createFakeSupabase({ rpc: { save_client: () => ok({ ...saved, active: false }) } });
    const input = buildClientSaveSchema({ allowEmptyPartners: true }).parse({ ...base, id: CLIENT_ID, partnerIds: [], expectedUpdatedAt: VERSION });
    const result = await saveClient({ supabase: fake.client, correlationId: null }, input);
    expect(fake.rpcCalls[0].args.p_partner_ids).toEqual([]);
    expect(result.active).toBe(false);
  });

  it("DOCUMENT_TAKEN: dono com id, nome e situação, e o tipo do documento digitado na frase", async () => {
    const owner = { kind: "client", id: OTHER_CLIENT, name: "Comércio Fictício Ltda", active: false };
    const fake = createFakeSupabase({ rpc: { save_client: () => fail(dbError("23505", "DOCUMENT_TAKEN", { field: "document", owner })) } });
    const input = clientSaveSchema.parse({ ...base, documentType: "CNPJ", document: "12ABC34501DE35" });
    await expect(saveClient({ supabase: fake.client, correlationId: null }, input)).rejects.toMatchObject({
      code: "CONFLICT",
      hint: "DOCUMENT_TAKEN",
      field: "document",
      message: "Já existe um cliente inativo com este CNPJ: Comércio Fictício Ltda. Para voltar a usar este cadastro, reative-o.",
      details: { hint: "DOCUMENT_TAKEN", owner: { id: OTHER_CLIENT, name: "Comércio Fictício Ltda", active: false } },
    });
  });

  it("DOCUMENT_TAKEN com CPF e dono ativo", async () => {
    const owner = { kind: "client", id: OTHER_CLIENT, name: "Pessoa Exemplo", active: true };
    const fake = createFakeSupabase({ rpc: { save_client: () => fail(dbError("23505", "DOCUMENT_TAKEN", { field: "document", owner })) } });
    const input = clientSaveSchema.parse({ ...base, document: "000.000.001-91" });
    await expect(saveClient({ supabase: fake.client, correlationId: null }, input)).rejects.toMatchObject({
      message: "Já existe um cliente com este CPF: Pessoa Exemplo.",
    });
  });

  it("POSSIBLE_DUPLICATE devolve a lista para a tela e nada é gravado", async () => {
    const matches = [{ id: OTHER_CLIENT, name: "Cliente Modelo Ltda", document: null, document_type: null, active: true, match: "SAME_NAME" }];
    const fake = createFakeSupabase({ rpc: { save_client: () => fail(dbError("P0001", "POSSIBLE_DUPLICATE", { matches })) } });
    const input = clientSaveSchema.parse(base);
    await expect(saveClient({ supabase: fake.client, correlationId: null }, input)).rejects.toMatchObject({
      code: "RULE_VIOLATION",
      hint: "POSSIBLE_DUPLICATE",
      details: { matches: [{ id: OTHER_CLIENT, document: null, documentType: null, active: true, match: "SAME_NAME" }] },
    });
    expect(fake.queries).toEqual([]);
  });

  it("STALE_VERSION: mensagem do cliente e versão atual", async () => {
    const fake = createFakeSupabase({ rpc: { save_client: () => fail(dbError("P0001", "STALE_VERSION", { current_updated_at: "2026-11-25T16:00:00.000001+00:00" })) } });
    const input = clientSaveSchema.parse({ ...base, id: CLIENT_ID, expectedUpdatedAt: VERSION });
    await expect(saveClient({ supabase: fake.client, correlationId: null }, input)).rejects.toMatchObject({
      message: "Este cliente foi alterado enquanto você editava. Suas alterações não foram salvas.",
      details: { currentUpdatedAt: "2026-11-25T16:00:00.000001+00:00" },
    });
  });

  it("sócio inativado enquanto o formulário estava aberto, apelido repetido, valor e sócio ausente", async () => {
    const cases: Array<[ReturnType<typeof dbError>, Record<string, unknown>]> = [
      [
        dbError("P0001", "PARTNER_INACTIVE", { partners: [{ id: PARTNER_B, name: "Sócio Exemplo B" }] }),
        { field: "partnerIds", message: "O sócio Sócio Exemplo B foi inativado e não pode mais ser indicado. Desmarque-o ou escolha outro." },
      ],
      [
        dbError("23505", "ALIAS_TAKEN", { field: "aliases", value: "mod semente", owner: { kind: "client", id: OTHER_CLIENT, name: "Cliente Modelo Ltda", active: true } }),
        { field: "aliases", message: "Este apelido já pertence ao cliente Cliente Modelo Ltda." },
      ],
      [dbError("22023", "INVALID_AMOUNT", { field: "default_monthly_value" }), { field: "monthlyValue", code: "VALIDATION" }],
      [dbError("P0001", "CLIENT_WITHOUT_PARTNER", undefined), { field: "partnerIds", message: "Escolha pelo menos um sócio. Todo cliente ativo precisa de um." }],
      [dbError("P0002", "NOT_FOUND", { field: "partner_ids" }), { field: "partnerIds", code: "NOT_FOUND" }],
      [dbError("42501", "ADMIN_REQUIRED"), { code: "FORBIDDEN", message: "Você não tem permissão para fazer esta alteração." }],
    ];
    for (const [error, expected] of cases) {
      const fake = createFakeSupabase({ rpc: { save_client: () => fail(error) } });
      await expect(saveClient({ supabase: fake.client, correlationId: null }, clientSaveSchema.parse(base))).rejects.toMatchObject(expected);
    }
  });
});

describe("setClientActive", () => {
  const row = { id: CLIENT_ID, legal_name: "Cliente Modelo Ltda", active: false, updated_at: "2026-11-25T15:10:00.555555+00:00" };

  it("inativa com motivo opcional", async () => {
    const fake = createFakeSupabase({ rpc: { set_client_active: () => ok(row) } });
    const input = clientSetActiveSchema.parse({ id: CLIENT_ID, active: false, expectedUpdatedAt: VERSION, reason: "Contrato encerrado" });
    const result = await setClientActive({ supabase: fake.client, correlationId: CORRELATION }, input);
    expect(fake.rpcCalls[0]).toEqual({
      name: "set_client_active",
      args: { p_client_id: CLIENT_ID, p_active: false, p_expected_updated_at: VERSION, p_reason: "Contrato encerrado", p_correlation_id: CORRELATION },
    });
    expect(result).toEqual({ id: CLIENT_ID, legalName: "Cliente Modelo Ltda", active: false, updatedAt: "2026-11-25T15:10:00.555555+00:00" });
  });

  it("reativar sem sócio ativo usa a mensagem da UI 6.4", async () => {
    const fake = createFakeSupabase({ rpc: { set_client_active: () => fail(dbError("P0001", "CLIENT_WITHOUT_PARTNER")) } });
    const input = clientSetActiveSchema.parse({ id: CLIENT_ID, active: true, expectedUpdatedAt: VERSION });
    await expect(setClientActive({ supabase: fake.client, correlationId: null }, input)).rejects.toMatchObject({
      hint: "CLIENT_WITHOUT_PARTNER",
      message: "Este cliente não tem sócio ativo. Indique pelo menos um sócio na edição e tente reativar de novo.",
    });
  });

  it("o gatilho diferido do COMMIT (23514) recebe a mesma tradução", async () => {
    const fake = createFakeSupabase({ rpc: { set_client_active: () => fail(dbError("23514", "CLIENT_WITHOUT_PARTNER")) } });
    const input = clientSetActiveSchema.parse({ id: CLIENT_ID, active: true, expectedUpdatedAt: VERSION });
    await expect(setClientActive({ supabase: fake.client, correlationId: null }, input)).rejects.toMatchObject({ code: "RULE_VIOLATION", hint: "CLIENT_WITHOUT_PARTNER" });
  });

  it("STALE_VERSION e cliente inexistente", async () => {
    const stale = createFakeSupabase({ rpc: { set_client_active: () => fail(dbError("P0001", "STALE_VERSION", { current_updated_at: VERSION })) } });
    const input = clientSetActiveSchema.parse({ id: CLIENT_ID, active: false, expectedUpdatedAt: VERSION });
    await expect(setClientActive({ supabase: stale.client, correlationId: null }, input)).rejects.toMatchObject({ hint: "STALE_VERSION" });

    const missing = createFakeSupabase({ rpc: { set_client_active: () => fail(dbError("P0002", "NOT_FOUND")) } });
    await expect(setClientActive({ supabase: missing.client, correlationId: null }, input)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Este cadastro não está mais disponível.",
    });
  });
});
