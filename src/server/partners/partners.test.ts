import { describe, expect, it } from "vitest";

import { partnerSaveSchema, partnerSetActiveSchema } from "@/domain/cadastros/schemas";

import { createFakeSupabase, dbError, fail, ok } from "../../../tests/unit-support/fake-supabase";
import {
  getPartnerDetail,
  listActivePartnerOptions,
  listPartnerFilterOptions,
  listActiveReceiversOfPartner,
  listPartnerBlockingClients,
  listPartnerClients,
  listPartners,
  partnerHasLinkedLogin,
  savePartner,
  setPartnerActive,
} from "./partners";

const PARTNER_A = "a0000000-0000-4000-8000-000000000001";
const PARTNER_B = "a0000000-0000-4000-8000-000000000002";
const CORRELATION = "c0000000-0000-4000-8000-0000000000ff";
const VERSION = "2026-11-25T14:03:11.123456+00:00";

describe("listPartners", () => {
  const partnerRows = [
    {
      id: PARTNER_A, name: "Sócio Exemplo A", active: true, updated_at: VERSION,
      partner_aliases: [{ alias: "S. Exemplo A", active: true }, { alias: "Antigo Alfa", active: false }],
    },
    { id: PARTNER_B, name: "Sócio Exemplo B", active: false, updated_at: VERSION, partner_aliases: [] },
  ];

  function build() {
    return createFakeSupabase({
      tables: {
        partners: () => ok(partnerRows),
        client_partners: () =>
          ok([
            { id: "i1", partner_id: PARTNER_A, clients: { active: true } },
            { id: "i2", partner_id: PARTNER_A, clients: { active: true } },
            { id: "i3", partner_id: PARTNER_A, clients: { active: false } },
          ]),
        receivers: () =>
          ok([
            { id: "r1", partner_id: PARTNER_A, active: true },
            { id: "r2", partner_id: PARTNER_A, active: false },
            { id: "r3", partner_id: PARTNER_B, active: false },
          ]),
      },
    });
  }

  it("junta as contagens de clientes (ativos e inativos) e de recebedores; token em texto", async () => {
    const fake = build();
    const result = await listPartners(fake.client, { status: "ALL" });
    expect(result).toEqual([
      {
        id: PARTNER_A, name: "Sócio Exemplo A", active: true, updatedAt: VERSION,
        activeClientCount: 2, inactiveClientCount: 1, activeReceiverCount: 1, inactiveReceiverCount: 1,
      },
      {
        id: PARTNER_B, name: "Sócio Exemplo B", active: false, updatedAt: VERSION,
        activeClientCount: 0, inactiveClientCount: 0, activeReceiverCount: 0, inactiveReceiverCount: 1,
      },
    ]);
    expect(typeof result[0].updatedAt).toBe("string");
  });

  it("filtra a situação no banco (padrão: ativos)", async () => {
    const fake = build();
    await listPartners(fake.client);
    const partnersQuery = fake.queries.find((query) => query.table === "partners")!;
    expect(fake.stepsOf(partnersQuery, "eq")).toEqual([["active", true]]);

    const inactive = build();
    await listPartners(inactive.client, { status: "INACTIVE" });
    const inactiveQuery = inactive.queries.find((query) => query.table === "partners")!;
    expect(inactive.stepsOf(inactiveQuery, "eq")).toEqual([["active", false]]);

    const all = build();
    await listPartners(all.client, { status: "ALL" });
    expect(all.stepsOf(all.queries.find((query) => query.table === "partners")!, "eq")).toEqual([]);
  });

  it("busca por nome ou apelido ativo, sem acento, maiúscula ou pontuação", async () => {
    expect((await listPartners(build().client, { status: "ALL", query: "SOCIO exemplo b" })).map((p) => p.id)).toEqual([PARTNER_B]);
    expect((await listPartners(build().client, { status: "ALL", query: "s exemplo a" })).map((p) => p.id)).toEqual([PARTNER_A]);
    // apelido inativo não acha o sócio
    expect(await listPartners(build().client, { status: "ALL", query: "antigo alfa" })).toEqual([]);
    expect(await listPartners(build().client, { status: "ALL", query: "   " })).toHaveLength(2);
  });

  it("erro do banco vira AppError", async () => {
    const fake = createFakeSupabase({ tables: { partners: () => fail(dbError("42501", null)) } });
    await expect(listPartners(fake.client)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("leituras do sócio", () => {
  it("listActivePartnerOptions devolve só id e nome, ordenados no banco", async () => {
    const fake = createFakeSupabase({
      tables: { partners: () => ok([{ id: PARTNER_A, name: "Sócio Exemplo A" }, { id: PARTNER_B, name: "Sócio Exemplo B" }]) },
    });
    expect(await listActivePartnerOptions(fake.client)).toEqual([
      { id: PARTNER_A, name: "Sócio Exemplo A" },
      { id: PARTNER_B, name: "Sócio Exemplo B" },
    ]);
    const query = fake.queries[0];
    expect(fake.stepsOf(query, "eq")).toEqual([["active", true]]);
    expect(fake.stepsOf(query, "order").map(([column]) => column)).toEqual(["normalized_name", "id"]);
  });

  it("listPartnerFilterOptions devolve ativos e inativos (sem filtro de situação), só id, nome e situação", async () => {
    const fake = createFakeSupabase({
      tables: { partners: () => ok([{ id: PARTNER_A, name: "Sócio Exemplo A", active: true }, { id: PARTNER_B, name: "Sócio Exemplo B", active: false }]) },
    });
    expect(await listPartnerFilterOptions(fake.client)).toEqual([
      { id: PARTNER_A, name: "Sócio Exemplo A", active: true },
      { id: PARTNER_B, name: "Sócio Exemplo B", active: false },
    ]);
    expect(fake.stepsOf(fake.queries[0], "eq")).toEqual([]);
  });

  it("getPartnerDetail: apelidos por ordem de cadastro e versão em texto; id inválido não chega ao banco", async () => {
    const fake = createFakeSupabase({
      tables: {
        partners: () =>
          ok({
            id: PARTNER_A, name: "Sócio Exemplo A", active: true, created_at: "2026-11-01T10:00:00.000001+00:00", updated_at: VERSION,
            partner_aliases: [
              { id: "al-2", alias: "Segundo", active: false, created_at: "2026-11-02T10:00:00+00:00" },
              { id: "al-1", alias: "Primeiro", active: true, created_at: "2026-11-01T10:00:00+00:00" },
            ],
          }),
      },
    });
    const detail = await getPartnerDetail(fake.client, PARTNER_A);
    expect(detail).toEqual({
      id: PARTNER_A, name: "Sócio Exemplo A", active: true, createdAt: "2026-11-01T10:00:00.000001+00:00", updatedAt: VERSION,
      aliases: [{ id: "al-1", value: "Primeiro", active: true }, { id: "al-2", value: "Segundo", active: false }],
    });

    expect(await getPartnerDetail(fake.client, "não-é-uuid")).toBeNull();
    expect(fake.queries).toHaveLength(1);
  });

  it("getPartnerDetail devolve null quando o RLS esconde o sócio", async () => {
    const fake = createFakeSupabase({ tables: { partners: () => ok(null) } });
    expect(await getPartnerDetail(fake.client, PARTNER_A)).toBeNull();
  });

  it("listPartnerClients: ativos primeiro, depois por nome (consulta 11.2)", async () => {
    const fake = createFakeSupabase({
      tables: {
        client_partners: () =>
          ok([
            { id: "i1", clients: { id: "c1", legal_name: "Zeta Ltda", normalized_name: "zeta ltda", active: true } },
            { id: "i2", clients: { id: "c2", legal_name: "Antigo Ltda", normalized_name: "antigo ltda", active: false } },
            { id: "i3", clients: { id: "c3", legal_name: "Alfa Ltda", normalized_name: "alfa ltda", active: true } },
          ]),
      },
    });
    expect(await listPartnerClients(fake.client, PARTNER_A)).toEqual([
      { id: "c3", name: "Alfa Ltda", active: true },
      { id: "c1", name: "Zeta Ltda", active: true },
      { id: "c2", name: "Antigo Ltda", active: false },
    ]);
    const query = fake.queries[0];
    expect(fake.stepsOf(query, "eq")).toEqual([["partner_id", PARTNER_A], ["active", true]]);
    expect(await listPartnerClients(fake.client, "x")).toEqual([]);
  });

  it("listPartnerBlockingClients marca 'Único sócio' só no cliente ATIVO em que o sócio é a única indicação ativa", async () => {
    const fake = createFakeSupabase({
      tables: {
        client_partners: (query) => {
          const isIndicationsOfPartner = fake.stepsOf(query, "eq").some(([column]) => column === "partner_id");
          if (isIndicationsOfPartner) {
            return ok([
              { id: "i1", clients: { id: "c1", legal_name: "Solo Ltda", normalized_name: "solo ltda", active: true } },
              { id: "i2", clients: { id: "c2", legal_name: "Dupla Ltda", normalized_name: "dupla ltda", active: true } },
              { id: "i3", clients: { id: "c3", legal_name: "Antigo Ltda", normalized_name: "antigo ltda", active: false } },
            ]);
          }
          // Contagem das indicações ativas dos clientes ATIVOS: c1 só tem uma; c2 tem duas.
          return ok([
            { id: "i1", client_id: "c1" },
            { id: "i2", client_id: "c2" },
            { id: "i9", client_id: "c2" },
          ]);
        },
      },
    });
    expect(await listPartnerBlockingClients(fake.client, PARTNER_A)).toEqual([
      { id: "c2", name: "Dupla Ltda", active: true, onlyPartner: false },
      { id: "c1", name: "Solo Ltda", active: true, onlyPartner: true },
      { id: "c3", name: "Antigo Ltda", active: false, onlyPartner: false },
    ]);
    // A segunda consulta só pergunta pelos clientes ativos e só conta indicações ativas.
    const second = fake.queries[1];
    expect(fake.stepsOf(second, "in")).toEqual([["client_id", ["c2", "c1"]]]);
    expect(fake.stepsOf(second, "eq")).toEqual([["active", true]]);
  });

  it("listPartnerBlockingClients sem cliente ativo não faz a segunda consulta", async () => {
    const fake = createFakeSupabase({
      tables: {
        client_partners: () =>
          ok([{ id: "i3", clients: { id: "c3", legal_name: "Antigo Ltda", normalized_name: "antigo ltda", active: false } }]),
      },
    });
    expect(await listPartnerBlockingClients(fake.client, PARTNER_A)).toEqual([
      { id: "c3", name: "Antigo Ltda", active: false, onlyPartner: false },
    ]);
    expect(fake.queries).toHaveLength(1);
  });

  it("listActiveReceiversOfPartner (consulta 11.3)", async () => {
    const fake = createFakeSupabase({
      tables: { receivers: () => ok([{ id: "r1", holder_name: "Titular Fictício A" }]) },
    });
    expect(await listActiveReceiversOfPartner(fake.client, PARTNER_A)).toEqual([{ id: "r1", holderName: "Titular Fictício A" }]);
    expect(fake.stepsOf(fake.queries[0], "eq")).toEqual([["partner_id", PARTNER_A], ["active", true]]);
  });

  it("partnerHasLinkedLogin conta perfis do sócio (consulta 11.7)", async () => {
    const yes = createFakeSupabase({ tables: { profiles: () => ({ data: null, error: null, count: 1 }) } });
    const no = createFakeSupabase({ tables: { profiles: () => ({ data: null, error: null, count: 0 }) } });
    expect(await partnerHasLinkedLogin(yes.client, PARTNER_A)).toBe(true);
    expect(await partnerHasLinkedLogin(no.client, PARTNER_A)).toBe(false);
    expect(await partnerHasLinkedLogin(no.client, "x")).toBe(false);
  });
});

describe("savePartner", () => {
  const row = { id: PARTNER_A, name: "Sócio Exemplo A", active: true, updated_at: "2026-11-25T14:10:00.654321+00:00", created_at: VERSION, normalized_name: "socio exemplo a" };

  it("cadastro novo: id e versão nulos, apelidos como lista, correlation id junto", async () => {
    const fake = createFakeSupabase({ rpc: { save_partner: () => ok(row) } });
    const input = partnerSaveSchema.parse({ name: "Sócio Exemplo A", aliases: ["S. Exemplo A"] });
    const result = await savePartner({ supabase: fake.client, correlationId: CORRELATION }, input);

    expect(fake.rpcCalls).toEqual([
      {
        name: "save_partner",
        args: {
          p_partner_id: null,
          p_name: "Sócio Exemplo A",
          p_aliases: ["S. Exemplo A"],
          p_expected_updated_at: null,
          p_reason: undefined,
          p_correlation_id: CORRELATION,
        },
      },
    ]);
    expect(result).toEqual({ id: PARTNER_A, name: "Sócio Exemplo A", active: true, updatedAt: "2026-11-25T14:10:00.654321+00:00" });
  });

  it("edição: a versão vai como o texto recebido, sem passar por Date", async () => {
    const fake = createFakeSupabase({ rpc: { save_partner: () => ok(row) } });
    const input = partnerSaveSchema.parse({ id: PARTNER_A, name: "Sócio Exemplo A", aliases: [], expectedUpdatedAt: VERSION, reason: "Correção" });
    await savePartner({ supabase: fake.client, correlationId: null }, input);
    const args = fake.rpcCalls[0].args;
    expect(args.p_expected_updated_at).toBe(VERSION);
    expect(typeof args.p_expected_updated_at).toBe("string");
    expect(args.p_partner_id).toBe(PARTNER_A);
    expect(args.p_reason).toBe("Correção");
    expect(args.p_correlation_id).toBeUndefined();
    expect(args.p_aliases).toEqual([]);
  });

  it("traduz STALE_VERSION com a mensagem do sócio e a versão atual", async () => {
    const fake = createFakeSupabase({
      rpc: { save_partner: () => fail(dbError("P0001", "STALE_VERSION", { current_updated_at: "2026-11-25T15:00:00.000009+00:00" })) },
    });
    const input = partnerSaveSchema.parse({ id: PARTNER_A, name: "x", aliases: [], expectedUpdatedAt: VERSION });
    await expect(savePartner({ supabase: fake.client, correlationId: null }, input)).rejects.toMatchObject({
      code: "CONFLICT",
      hint: "STALE_VERSION",
      message: "Este sócio foi alterado enquanto você editava. Suas alterações não foram salvas.",
      details: { hint: "STALE_VERSION", currentUpdatedAt: "2026-11-25T15:00:00.000009+00:00" },
    });
  });

  it("traduz nome repetido com o dono (id, nome, situação)", async () => {
    const owner = { kind: "partner", id: PARTNER_B, name: "Sócio Exemplo B", active: false, via: "NAME" };
    const fake = createFakeSupabase({
      rpc: { save_partner: () => fail(dbError("23505", "PARTNER_NAME_TAKEN", { field: "name", value: "socio exemplo b", owner })) },
    });
    const input = partnerSaveSchema.parse({ name: "Sócio Exemplo B", aliases: [] });
    await expect(savePartner({ supabase: fake.client, correlationId: null }, input)).rejects.toMatchObject({
      code: "CONFLICT",
      field: "name",
      message: "Já existe um sócio inativo com este nome. Para voltar a usar este cadastro, reative-o.",
      details: { owner: { id: PARTNER_B, name: "Sócio Exemplo B", active: false } },
    });
  });
});

describe("setPartnerActive", () => {
  const row = { id: PARTNER_A, name: "Sócio Exemplo A", active: false, updated_at: "2026-11-25T14:20:00.111111+00:00" };

  it("inativar leva a lista confirmada de recebedores", async () => {
    const fake = createFakeSupabase({ rpc: { set_partner_active: () => ok(row) } });
    const input = partnerSetActiveSchema.parse({
      id: PARTNER_A, active: false, expectedUpdatedAt: VERSION, confirmedReceiverIds: ["d2000000-0000-4000-8000-000000000001"], reason: "Saiu da sociedade",
    });
    const result = await setPartnerActive({ supabase: fake.client, correlationId: CORRELATION }, input);
    expect(fake.rpcCalls[0]).toEqual({
      name: "set_partner_active",
      args: {
        p_partner_id: PARTNER_A,
        p_active: false,
        p_expected_updated_at: VERSION,
        p_confirmed_receiver_ids: ["d2000000-0000-4000-8000-000000000001"],
        p_reason: "Saiu da sociedade",
        p_correlation_id: CORRELATION,
      },
    });
    expect(result).toEqual({ id: PARTNER_A, name: "Sócio Exemplo A", active: false, updatedAt: "2026-11-25T14:20:00.111111+00:00" });
  });

  it("PARTNER_HAS_CLIENTS traz a lista e usa o nome do sócio na frase", async () => {
    const clients = [
      { id: "d4000000-0000-4000-8000-000000000001", name: "Cliente Modelo Ltda", active: true },
      { id: "d4000000-0000-4000-8000-000000000004", name: "Cliente Antigo Ltda", active: false },
    ];
    const fake = createFakeSupabase({ rpc: { set_partner_active: () => fail(dbError("P0001", "PARTNER_HAS_CLIENTS", { clients })) } });
    const input = partnerSetActiveSchema.parse({ id: PARTNER_A, active: false, expectedUpdatedAt: VERSION });
    await expect(
      setPartnerActive({ supabase: fake.client, correlationId: null }, input, { partnerName: "Sócio Exemplo A" }),
    ).rejects.toMatchObject({
      code: "RULE_VIOLATION",
      hint: "PARTNER_HAS_CLIENTS",
      message:
        "Sócio Exemplo A ainda está indicado em 2 clientes, entre ativos e inativos. Para inativar, primeiro retire este sócio de todos eles.",
      details: { hint: "PARTNER_HAS_CLIENTS", clients },
    });
  });

  it("RECEIVERS_CHANGED traz a lista atual", async () => {
    const receivers = [{ id: "d2000000-0000-4000-8000-000000000009", name: "Titular Novo" }];
    const fake = createFakeSupabase({ rpc: { set_partner_active: () => fail(dbError("P0001", "RECEIVERS_CHANGED", { receivers })) } });
    const input = partnerSetActiveSchema.parse({ id: PARTNER_A, active: false, expectedUpdatedAt: VERSION });
    await expect(setPartnerActive({ supabase: fake.client, correlationId: null }, input)).rejects.toMatchObject({
      hint: "RECEIVERS_CHANGED",
      details: { receivers },
    });
  });

  it("reativar: ação 'activate' no contexto do erro", async () => {
    const fake = createFakeSupabase({ rpc: { set_partner_active: () => ok({ ...row, active: true }) } });
    const input = partnerSetActiveSchema.parse({ id: PARTNER_A, active: true, expectedUpdatedAt: VERSION });
    expect((await setPartnerActive({ supabase: fake.client, correlationId: null }, input)).active).toBe(true);
    expect(fake.rpcCalls[0].args.p_confirmed_receiver_ids).toEqual([]);
  });

  it("nunca escreve em tabela: só funções do banco", async () => {
    const fake = createFakeSupabase({ rpc: { save_partner: () => ok({ id: PARTNER_A, name: "x", active: true, updated_at: VERSION }) } });
    await savePartner({ supabase: fake.client, correlationId: null }, partnerSaveSchema.parse({ name: "x", aliases: [] }));
    expect(fake.queries).toEqual([]);
  });
});
