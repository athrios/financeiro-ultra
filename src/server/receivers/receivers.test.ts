import { describe, expect, it } from "vitest";

import { receiverSaveSchema, receiverSetActiveSchema } from "@/domain/cadastros/schemas";

import { createFakeSupabase, dbError, fail, ok } from "../../../tests/unit-support/fake-supabase";
import {
  getReceiverDetail,
  listReceiversByPartner,
  saveReceiver,
  setReceiverActive,
  toRpcIdentifiers,
} from "./receivers";

const PARTNER_A = "a0000000-0000-4000-8000-000000000001";
const RECEIVER_ID = "d2000000-0000-4000-8000-000000000001";
const CORRELATION = "c0000000-0000-4000-8000-0000000000ff";
const VERSION = "2026-11-25T14:03:11.123456+00:00";

const identifierRows = [
  { id: "i3", identifier_type: "BANK_ACCOUNT", value: null, bank_name: "Banco Semente", branch: "0002", account_number: "65432-1", active: true, created_at: "2026-11-01T10:00:03+00:00" },
  { id: "i1", identifier_type: "NAME_VARIANT", value: "S. Exemplo A", bank_name: null, branch: null, account_number: null, active: true, created_at: "2026-11-01T10:00:01+00:00" },
  { id: "i2", identifier_type: "PIX_KEY", value: "semente.a@example.com", bank_name: null, branch: null, account_number: null, active: true, created_at: "2026-11-01T10:00:02+00:00" },
  { id: "i4", identifier_type: "PIX_KEY", value: "antiga@example.com", bank_name: null, branch: null, account_number: null, active: false, created_at: "2026-11-01T10:00:04+00:00" },
];

describe("listReceiversByPartner", () => {
  const fake = () =>
    createFakeSupabase({
      tables: {
        receivers: () =>
          ok([
            { id: RECEIVER_ID, partner_id: PARTNER_A, holder_name: "Sócio Exemplo A", active: true, updated_at: VERSION, receiver_identifiers: identifierRows },
          ]),
      },
    });

  it("resume só os identificadores ATIVOS (variações, chaves Pix, contas)", async () => {
    const [receiver] = await listReceiversByPartner(fake().client, PARTNER_A, "ALL");
    expect(receiver).toEqual({
      id: RECEIVER_ID,
      partnerId: PARTNER_A,
      holderName: "Sócio Exemplo A",
      active: true,
      updatedAt: VERSION,
      nameVariantCount: 1,
      pixKeys: ["semente.a@example.com"],
      accounts: [{ bankName: "Banco Semente", branch: "0002", accountNumber: "65432-1" }],
    });
  });

  it("filtra por sócio e situação no banco; id inválido não chega ao banco", async () => {
    const active = fake();
    await listReceiversByPartner(active.client, PARTNER_A);
    expect(active.stepsOf(active.queries[0], "eq")).toEqual([["partner_id", PARTNER_A], ["active", true]]);

    const inactive = fake();
    await listReceiversByPartner(inactive.client, PARTNER_A, "INACTIVE");
    expect(inactive.stepsOf(inactive.queries[0], "eq")).toEqual([["partner_id", PARTNER_A], ["active", false]]);

    const bad = fake();
    expect(await listReceiversByPartner(bad.client, "x")).toEqual([]);
    expect(bad.queries).toEqual([]);
  });
});

describe("getReceiverDetail", () => {
  it("traz todos os identificadores, ativos e inativos, na ordem de cadastro, com os valores como digitados", async () => {
    const fake = createFakeSupabase({
      tables: {
        receivers: () =>
          ok({
            id: RECEIVER_ID, partner_id: PARTNER_A, holder_name: "Sócio Exemplo A", active: true,
            created_at: "2026-11-01T10:00:00.000001+00:00", updated_at: VERSION,
            partners: { id: PARTNER_A, name: "Sócio Exemplo A", active: true },
            receiver_identifiers: identifierRows,
          }),
      },
    });
    const detail = await getReceiverDetail(fake.client, RECEIVER_ID);
    expect(detail).toMatchObject({
      id: RECEIVER_ID, partnerId: PARTNER_A, partnerName: "Sócio Exemplo A", partnerActive: true,
      holderName: "Sócio Exemplo A", createdAt: "2026-11-01T10:00:00.000001+00:00", updatedAt: VERSION,
    });
    expect(detail!.identifiers).toEqual([
      { id: "i1", active: true, type: "NAME_VARIANT", value: "S. Exemplo A" },
      { id: "i2", active: true, type: "PIX_KEY", value: "semente.a@example.com" },
      { id: "i3", active: true, type: "BANK_ACCOUNT", bankName: "Banco Semente", branch: "0002", accountNumber: "65432-1" },
      { id: "i4", active: false, type: "PIX_KEY", value: "antiga@example.com" },
    ]);
  });

  it("devolve null para id inválido ou escondido pelo RLS", async () => {
    const fake = createFakeSupabase({ tables: { receivers: () => ok(null) } });
    expect(await getReceiverDetail(fake.client, "xxx")).toBeNull();
    expect(fake.queries).toEqual([]);
    expect(await getReceiverDetail(fake.client, RECEIVER_ID)).toBeNull();
  });
});

describe("toRpcIdentifiers (formato de p_identifiers, modelagem 6.4.3)", () => {
  it("usa snake_case só nas contas e nunca inclui campo de documento", () => {
    const rpc = toRpcIdentifiers([
      { type: "NAME_VARIANT", value: "S. Alfa" },
      { type: "PIX_KEY", value: "alfa@example.com" },
      { type: "BANK_ACCOUNT", bankName: "Banco Exemplo", branch: "0001", accountNumber: "12345-6" },
    ]);
    expect(rpc).toEqual([
      { type: "NAME_VARIANT", value: "S. Alfa" },
      { type: "PIX_KEY", value: "alfa@example.com" },
      { type: "BANK_ACCOUNT", bank_name: "Banco Exemplo", branch: "0001", account_number: "12345-6" },
    ]);
    expect(JSON.stringify(rpc)).not.toMatch(/document|cpf|cnpj/i);
  });
});

describe("saveReceiver", () => {
  const row = { id: RECEIVER_ID, partner_id: PARTNER_A, holder_name: "Titular Fictício A", active: true, updated_at: "2026-11-25T14:30:00.222222+00:00" };

  it("novo: monta os parâmetros da função e devolve o novo token em texto", async () => {
    const fake = createFakeSupabase({ rpc: { save_receiver: () => ok(row) } });
    const input = receiverSaveSchema.parse({
      partnerId: PARTNER_A,
      holderName: "Titular Fictício A",
      identifiers: [{ type: "PIX_KEY", value: "alfa@example.com" }, { type: "BANK_ACCOUNT", bankName: "Banco Exemplo", branch: "0001", accountNumber: "12345-6" }],
    });
    const result = await saveReceiver({ supabase: fake.client, correlationId: CORRELATION }, input);
    expect(fake.rpcCalls[0]).toEqual({
      name: "save_receiver",
      args: {
        p_receiver_id: null,
        p_partner_id: PARTNER_A,
        p_holder_name: "Titular Fictício A",
        p_identifiers: [
          { type: "PIX_KEY", value: "alfa@example.com" },
          { type: "BANK_ACCOUNT", bank_name: "Banco Exemplo", branch: "0001", account_number: "12345-6" },
        ],
        p_expected_updated_at: null,
        p_reason: undefined,
        p_correlation_id: CORRELATION,
      },
    });
    expect(result).toEqual({ id: RECEIVER_ID, partnerId: PARTNER_A, holderName: "Titular Fictício A", active: true, updatedAt: "2026-11-25T14:30:00.222222+00:00" });
  });

  it("edição leva a versão como texto e o sócio atual", async () => {
    const fake = createFakeSupabase({ rpc: { save_receiver: () => ok(row) } });
    const input = receiverSaveSchema.parse({
      id: RECEIVER_ID, partnerId: PARTNER_A, holderName: "Titular Fictício A", identifiers: [], expectedUpdatedAt: VERSION,
    });
    await saveReceiver({ supabase: fake.client, correlationId: null }, input);
    expect(fake.rpcCalls[0].args).toMatchObject({ p_receiver_id: RECEIVER_ID, p_expected_updated_at: VERSION, p_identifiers: [] });
  });

  it("IDENTIFIER_TAKEN: dono com titular, sócio e situação", async () => {
    const owner = { kind: "receiver", id: RECEIVER_ID, name: "Titular Fictício A", partner_id: PARTNER_A, partner_name: "Sócio Exemplo A", active: true };
    const fake = createFakeSupabase({
      rpc: { save_receiver: () => fail(dbError("23505", "IDENTIFIER_TAKEN", { field: "identifiers", identifier_type: "PIX_KEY", value: "alfa@example.com", owner })) },
    });
    const input = receiverSaveSchema.parse({ partnerId: PARTNER_A, holderName: "Outro Titular", identifiers: [{ type: "PIX_KEY", value: "alfa@example.com" }] });
    await expect(saveReceiver({ supabase: fake.client, correlationId: null }, input)).rejects.toMatchObject({
      code: "CONFLICT",
      hint: "IDENTIFIER_TAKEN",
      field: "identifiers",
      message: "Esta chave Pix já está cadastrada no recebedor Titular Fictício A, do sócio Sócio Exemplo A.",
      details: { identifierType: "PIX_KEY", owner: { id: RECEIVER_ID, name: "Titular Fictício A", partnerName: "Sócio Exemplo A", active: true } },
    });
  });

  it("sócio inativo: mensagem do recebedor (UI 6.5 e 7.2)", async () => {
    const fake = createFakeSupabase({
      rpc: { save_receiver: () => fail(dbError("P0001", "PARTNER_INACTIVE", { partners: [{ id: PARTNER_A, name: "Sócio Exemplo C" }] })) },
    });
    const input = receiverSaveSchema.parse({ partnerId: PARTNER_A, holderName: "Titular", identifiers: [] });
    await expect(saveReceiver({ supabase: fake.client, correlationId: null }, input)).rejects.toMatchObject({
      message: "O sócio Sócio Exemplo C está inativo. Reative o sócio antes de cadastrar ou reativar um recebedor.",
    });
  });

  it("identificador inválido e lista fora do formato", async () => {
    const fake = createFakeSupabase({
      rpc: {
        save_receiver: (args) =>
          (args.p_identifiers as unknown[]).length === 0
            ? fail(dbError("22023", "LIST_REQUIRED", { field: "identifiers" }))
            : fail(dbError("22023", "INVALID_BRANCH", { field: "identifiers", value: "abc" })),
      },
    });
    const withItem = receiverSaveSchema.parse({ partnerId: PARTNER_A, holderName: "T", identifiers: [{ type: "BANK_ACCOUNT", bankName: "B", branch: "1", accountNumber: "1" }] });
    await expect(saveReceiver({ supabase: fake.client, correlationId: null }, withItem)).rejects.toMatchObject({
      hint: "INVALID_BRANCH",
      message: "Agência inválida. Use só números, hífen e a letra X.",
    });
    const empty = receiverSaveSchema.parse({ partnerId: PARTNER_A, holderName: "T", identifiers: [] });
    await expect(saveReceiver({ supabase: fake.client, correlationId: null }, empty)).rejects.toMatchObject({ hint: "LIST_REQUIRED", field: "identifiers" });
  });
});

describe("setReceiverActive", () => {
  const row = { id: RECEIVER_ID, partner_id: PARTNER_A, holder_name: "Titular Fictício A", active: false, updated_at: "2026-11-25T14:40:00.333333+00:00" };

  it("inativa com motivo opcional", async () => {
    const fake = createFakeSupabase({ rpc: { set_receiver_active: () => ok(row) } });
    const input = receiverSetActiveSchema.parse({ id: RECEIVER_ID, active: false, expectedUpdatedAt: VERSION, reason: "Conta encerrada" });
    const result = await setReceiverActive({ supabase: fake.client, correlationId: CORRELATION }, input);
    expect(fake.rpcCalls[0]).toEqual({
      name: "set_receiver_active",
      args: { p_receiver_id: RECEIVER_ID, p_active: false, p_expected_updated_at: VERSION, p_reason: "Conta encerrada", p_correlation_id: CORRELATION },
    });
    expect(result.active).toBe(false);
    expect(result.updatedAt).toBe("2026-11-25T14:40:00.333333+00:00");
  });

  it("reativar com sócio inativo", async () => {
    const fake = createFakeSupabase({
      rpc: { set_receiver_active: () => fail(dbError("P0001", "PARTNER_INACTIVE", { partners: [{ id: PARTNER_A, name: "Sócio Exemplo C" }] })) },
    });
    const input = receiverSetActiveSchema.parse({ id: RECEIVER_ID, active: true, expectedUpdatedAt: VERSION });
    await expect(setReceiverActive({ supabase: fake.client, correlationId: null }, input)).rejects.toMatchObject({
      hint: "PARTNER_INACTIVE",
      details: { partners: [{ id: PARTNER_A, name: "Sócio Exemplo C" }] },
    });
  });

  it("STALE_VERSION com a mensagem do recebedor", async () => {
    const fake = createFakeSupabase({ rpc: { set_receiver_active: () => fail(dbError("P0001", "STALE_VERSION", { current_updated_at: VERSION })) } });
    const input = receiverSetActiveSchema.parse({ id: RECEIVER_ID, active: false, expectedUpdatedAt: VERSION });
    await expect(setReceiverActive({ supabase: fake.client, correlationId: null }, input)).rejects.toMatchObject({
      message: "Este recebedor foi alterado por outra pessoa. A inativação não foi feita. Atualize a tela e tente de novo.",
    });
  });
});
