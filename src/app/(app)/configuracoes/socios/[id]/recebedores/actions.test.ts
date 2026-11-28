import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, dbError, fail, ok } from "../../../../../../../tests/unit-support/fake-supabase";

// Fronteiras do Next e da sessão: trocadas por duplos. O cliente Supabase é o falso de tests/unit-support.
class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT ${url}`);
  }
}

const revalidatePath = vi.fn();
const redirect = vi.fn((url: string) => {
  throw new RedirectSignal(url);
});
const authorizeAdmin = vi.fn();
const loggerError = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidatePath(path) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));
vi.mock("@/server/cadastros/authorize", () => ({ authorizeAdmin: () => authorizeAdmin() }));
vi.mock("@/server/request-context", () => ({
  getRequestLogger: async () => ({ error: loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import {
  saveReceiverAction,
  setReceiverActiveAction,
  type ReceiverActiveState,
  type ReceiverFormState,
} from "./actions";

const PARTNER = "a0000000-0000-4000-8000-000000000001";
const RECEIVER = "d2000000-0000-4000-8000-000000000001";
const OWNER_RECEIVER = "d2000000-0000-4000-8000-000000000002";
const CORRELATION = "d0000000-0000-4000-8000-0000000000ff";
const VERSION = "2026-11-25T14:03:11.123456+00:00";
const NEW_VERSION = "2026-11-25T14:10:00.654321+00:00";

const IDLE_FORM: ReceiverFormState = { status: "idle" };
const IDLE_ACTIVE: ReceiverActiveState = { status: "idle" };

function formOf(entries: Array<[string, string]>): FormData {
  const form = new FormData();
  for (const [key, value] of entries) form.append(key, value);
  return form;
}

type Fake = ReturnType<typeof createFakeSupabase>;

function allowAdmin(fake: Fake) {
  authorizeAdmin.mockResolvedValue({
    kind: "ok",
    userId: "u-1",
    ctx: { supabase: fake.client, correlationId: CORRELATION },
  });
}

/** Executa a ação e devolve o estado ou o destino do `redirect`. */
async function run<T>(action: () => Promise<T>): Promise<{ state: T | null; redirectedTo: string | null }> {
  try {
    return { state: await action(), redirectedTo: null };
  } catch (error) {
    if (error instanceof RedirectSignal) return { state: null, redirectedTo: error.url };
    throw error;
  }
}

function receiverRow(overrides: Partial<{ active: boolean; partner_active: boolean }> = {}) {
  return {
    id: RECEIVER,
    partner_id: PARTNER,
    holder_name: "Titular Fictício A",
    active: overrides.active ?? true,
    created_at: "2026-11-01T10:00:00+00:00",
    updated_at: VERSION,
    partners: { id: PARTNER, name: "Sócio Exemplo A", active: overrides.partner_active ?? true },
    receiver_identifiers: [],
  };
}

function writeRow(overrides: Partial<{ active: boolean }> = {}) {
  return {
    id: RECEIVER,
    partner_id: PARTNER,
    holder_name: "Titular Fictício A",
    active: true,
    updated_at: NEW_VERSION,
    ...overrides,
  };
}

const OWNER = {
  kind: "receiver",
  id: OWNER_RECEIVER,
  name: "Titular Fictício B",
  partner_id: "a0000000-0000-4000-8000-000000000002",
  partner_name: "Sócio Exemplo B",
  active: true,
};

beforeEach(() => {
  revalidatePath.mockClear();
  redirect.mockClear();
  authorizeAdmin.mockReset();
  loggerError.mockClear();
});

describe("saveReceiverAction", () => {
  const createForm = (extra: Array<[string, string]> = []) =>
    formOf([
      ["partnerId", PARTNER],
      ["holderName", "  Titular Fictício A  "],
      ["variants", "S. Alfa"],
      ["pixKeys", "alfa@example.com"],
      ["pixKeys", "23999990000"],
      ["accountBank", "Banco Exemplo"],
      ["accountBranch", "0001"],
      ["accountNumber", "12345-6"],
      ...extra,
    ]);

  it("sem sessão: leva ao login com o aviso e não chama o banco", async () => {
    const fake = createFakeSupabase();
    authorizeAdmin.mockResolvedValue({ kind: "unauthenticated" });
    const { redirectedTo } = await run(() => saveReceiverAction(IDLE_FORM, createForm()));
    expect(redirectedTo).toBe("/login?aviso=sessao-expirada");
    expect(fake.rpcCalls).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("sem permissão (não Administrador): nega, sem chamar o banco nem revalidar", async () => {
    const fake = createFakeSupabase();
    authorizeAdmin.mockResolvedValue({
      kind: "forbidden",
      error: { code: "FORBIDDEN", message: "Você não tem permissão para fazer esta alteração.", hint: "ADMIN_REQUIRED" },
    });
    const { state, redirectedTo } = await run(() => saveReceiverAction(IDLE_FORM, createForm()));
    expect(redirectedTo).toBeNull();
    expect(state).toMatchObject({ status: "error", error: { code: "FORBIDDEN" } });
    expect(fake.rpcCalls).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("titular vazio: erro no campo, sem chamar o banco", async () => {
    const fake = createFakeSupabase();
    allowAdmin(fake);
    const { state } = await run(() => saveReceiverAction(IDLE_FORM, formOf([["partnerId", PARTNER], ["holderName", "   "]])));
    expect(state).toMatchObject({
      status: "error",
      error: { code: "VALIDATION", message: "Informe o nome do titular." },
      fieldErrors: { holderName: "Informe o nome do titular." },
    });
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("titular acima de 200 caracteres e novo sem sócio", async () => {
    const fake = createFakeSupabase();
    allowAdmin(fake);
    const long = await run(() => saveReceiverAction(IDLE_FORM, formOf([["partnerId", PARTNER], ["holderName", "x".repeat(201)]])));
    expect(long.state).toMatchObject({ fieldErrors: { holderName: "O nome do titular pode ter no máximo 200 caracteres." } });
    const noPartner = await run(() => saveReceiverAction(IDLE_FORM, formOf([["holderName", "Titular"]])));
    expect(noPartner.state).toMatchObject({ status: "error", error: { code: "VALIDATION", message: "Escolha o sócio do recebedor." } });
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("conta incompleta, caracteres inválidos e chave longa vão à lista certa", async () => {
    const fake = createFakeSupabase();
    allowAdmin(fake);
    const incomplete = await run(() =>
      saveReceiverAction(
        IDLE_FORM,
        formOf([["partnerId", PARTNER], ["holderName", "T"], ["accountBank", "Banco Exemplo"], ["accountBranch", ""], ["accountNumber", ""]]),
      ),
    );
    expect(incomplete.state).toMatchObject({
      status: "error",
      fieldErrors: { accounts: "Preencha banco, agência e conta, ou apague os campos." },
    });

    const chars = await run(() =>
      saveReceiverAction(
        IDLE_FORM,
        formOf([["partnerId", PARTNER], ["holderName", "T"], ["accountBank", "B"], ["accountBranch", "00A1"], ["accountNumber", "123"]]),
      ),
    );
    expect(chars.state).toMatchObject({ fieldErrors: { accounts: "Use só números, hífen e a letra X." } });

    const longPix = await run(() =>
      saveReceiverAction(IDLE_FORM, formOf([["partnerId", PARTNER], ["holderName", "T"], ["pixKeys", "k".repeat(101)]])),
    );
    expect(longPix.state).toMatchObject({ fieldErrors: { pixKeys: "A chave Pix pode ter no máximo 100 caracteres." } });
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("novo: monta os identificadores por tipo, chama save_receiver e leva ao sócio com 'Recebedor cadastrado'", async () => {
    const fake = createFakeSupabase({ rpc: { save_receiver: () => ok(writeRow()) } });
    allowAdmin(fake);
    const { state, redirectedTo } = await run(() => saveReceiverAction(IDLE_FORM, createForm()));
    expect(state).toBeNull();
    expect(redirectedTo).toBe(`/configuracoes/socios/${PARTNER}?aviso=recebedor-criado`);
    expect(fake.rpcCalls).toHaveLength(1);
    expect(fake.rpcCalls[0].name).toBe("save_receiver");
    expect(fake.rpcCalls[0].args).toMatchObject({
      p_receiver_id: null,
      p_partner_id: PARTNER,
      p_holder_name: "Titular Fictício A",
      p_correlation_id: CORRELATION,
      p_identifiers: [
        { type: "NAME_VARIANT", value: "S. Alfa" },
        { type: "PIX_KEY", value: "alfa@example.com" },
        { type: "PIX_KEY", value: "23999990000" },
        { type: "BANK_ACCOUNT", bank_name: "Banco Exemplo", branch: "0001", account_number: "12345-6" },
      ],
    });
    // revalida ANTES de redirecionar
    expect(revalidatePath).toHaveBeenCalledWith(`/configuracoes/socios/${PARTNER}`);
    expect(Math.max(...revalidatePath.mock.invocationCallOrder)).toBeLessThan(redirect.mock.invocationCallOrder[0]);
  });

  it("sem identificadores: a lista vazia vai ao banco como '[]' (nunca nula)", async () => {
    const fake = createFakeSupabase({ rpc: { save_receiver: () => ok(writeRow()) } });
    allowAdmin(fake);
    await run(() => saveReceiverAction(IDLE_FORM, formOf([["partnerId", PARTNER], ["holderName", "Titular Fictício A"]])));
    expect(fake.rpcCalls[0].args.p_identifiers).toEqual([]);
  });

  it("editar: envia o id e a versão lida (texto, com microssegundos) e avisa 'Alterações salvas'", async () => {
    const fake = createFakeSupabase({ rpc: { save_receiver: () => ok(writeRow()) } });
    allowAdmin(fake);
    const { redirectedTo } = await run(() =>
      saveReceiverAction(IDLE_FORM, createForm([["id", RECEIVER], ["expectedUpdatedAt", VERSION]])),
    );
    expect(redirectedTo).toBe(`/configuracoes/socios/${PARTNER}?aviso=recebedor-salvo`);
    expect(fake.rpcCalls[0].args).toMatchObject({ p_receiver_id: RECEIVER, p_expected_updated_at: VERSION });
  });

  it("editar sem a versão: recusa antes do banco", async () => {
    const fake = createFakeSupabase();
    allowAdmin(fake);
    const { state } = await run(() => saveReceiverAction(IDLE_FORM, createForm([["id", RECEIVER]])));
    expect(state).toMatchObject({ status: "error", error: { code: "VALIDATION" } });
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("o destino do redirecionamento vem do banco, não do formulário", async () => {
    const other = "a0000000-0000-4000-8000-0000000000aa";
    const fake = createFakeSupabase({ rpc: { save_receiver: () => ok(writeRow()) } });
    allowAdmin(fake);
    const form = formOf([["partnerId", other], ["id", RECEIVER], ["expectedUpdatedAt", VERSION], ["holderName", "Titular Fictício A"]]);
    const { redirectedTo } = await run(() => saveReceiverAction(IDLE_FORM, form));
    expect(redirectedTo).toBe(`/configuracoes/socios/${PARTNER}?aviso=recebedor-salvo`);
  });

  it("conflito de edição: STALE_VERSION com a versão atual, nada redireciona", async () => {
    const fake = createFakeSupabase({
      rpc: { save_receiver: () => fail(dbError("P0001", "STALE_VERSION", { current_updated_at: NEW_VERSION })) },
    });
    allowAdmin(fake);
    const { state, redirectedTo } = await run(() =>
      saveReceiverAction(IDLE_FORM, createForm([["id", RECEIVER], ["expectedUpdatedAt", VERSION]])),
    );
    expect(redirectedTo).toBeNull();
    expect(state).toMatchObject({
      status: "error",
      error: {
        code: "CONFLICT",
        hint: "STALE_VERSION",
        message: "Este recebedor foi alterado enquanto você editava. Suas alterações não foram salvas.",
        details: { hint: "STALE_VERSION", currentUpdatedAt: NEW_VERSION },
      },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    ["PIX_KEY", "pixKeys", "Esta chave Pix já está cadastrada no recebedor Titular Fictício B, do sócio Sócio Exemplo B."],
    ["BANK_ACCOUNT", "accounts", "Esta conta já está cadastrada no recebedor Titular Fictício B, do sócio Sócio Exemplo B."],
    ["NAME_VARIANT", "variants", "Esta forma do nome já está cadastrada no recebedor Titular Fictício B, do sócio Sócio Exemplo B."],
  ] as const)("%s repetido em outro recebedor: a frase da UI 7.2 vai à lista %s", async (type, field, message) => {
    const fake = createFakeSupabase({
      rpc: { save_receiver: () => fail(dbError("23505", "IDENTIFIER_TAKEN", { field: "identifiers", identifier_type: type, value: "x", owner: OWNER })) },
    });
    allowAdmin(fake);
    const { state } = await run(() => saveReceiverAction(IDLE_FORM, createForm()));
    expect(state).toMatchObject({
      status: "error",
      error: { code: "CONFLICT", hint: "IDENTIFIER_TAKEN", message, details: { owner: { id: OWNER_RECEIVER, partnerName: "Sócio Exemplo B" } } },
      fieldErrors: { [field]: message },
    });
  });

  it("forma do nome igual ao nome de OUTRO sócio: frase da UI 7.2 na lista de formas do nome", async () => {
    const owner = { kind: "partner", id: "a0000000-0000-4000-8000-000000000002", name: "Sócio Exemplo B", active: true, via: "NAME" };
    const fake = createFakeSupabase({
      rpc: { save_receiver: () => fail(dbError("23505", "PARTNER_NAME_TAKEN", { field: "identifiers", value: "socio b", owner })) },
    });
    allowAdmin(fake);
    const { state } = await run(() => saveReceiverAction(IDLE_FORM, createForm()));
    expect(state).toMatchObject({
      fieldErrors: { variants: "Este nome já é usado pelo sócio Sócio Exemplo B. Use um nome que identifique só este recebedor." },
    });
  });

  it("sócio inativo: erro geral (sem campo), com o nome do sócio", async () => {
    const fake = createFakeSupabase({
      rpc: { save_receiver: () => fail(dbError("P0001", "PARTNER_INACTIVE", { partners: [{ id: PARTNER, name: "Sócio Exemplo A" }] })) },
    });
    allowAdmin(fake);
    const { state } = await run(() => saveReceiverAction(IDLE_FORM, createForm()));
    expect(state).toMatchObject({
      status: "error",
      error: { code: "RULE_VIOLATION", hint: "PARTNER_INACTIVE" },
      fieldErrors: {},
    });
  });

  it("erro inesperado: mensagem geral, código de suporte e nenhum 'cause' na resposta", async () => {
    const fake = createFakeSupabase({
      rpc: { save_receiver: () => fail({ code: "XX000", message: "relation receivers: segredo interno" }) },
    });
    allowAdmin(fake);
    const { state } = await run(() => saveReceiverAction(IDLE_FORM, createForm()));
    expect(state).toMatchObject({ status: "error", error: { code: "UNEXPECTED" }, supportCode: CORRELATION });
    const text = JSON.stringify(state);
    expect(text).not.toContain("segredo interno");
    expect(text).not.toContain("cause");
    expect(loggerError).toHaveBeenCalledTimes(1);
  });

  it("não envia documento nem campo extra do titular (RAT-D023)", async () => {
    const fake = createFakeSupabase({ rpc: { save_receiver: () => ok(writeRow()) } });
    allowAdmin(fake);
    await run(() => saveReceiverAction(IDLE_FORM, createForm([["document", "00000000604"], ["holderDocument", "00000000604"]])));
    expect(JSON.stringify(fake.rpcCalls[0].args)).not.toContain("00000000604");
  });
});

describe("setReceiverActiveAction", () => {
  const form = (active: "true" | "false", extra: Array<[string, string]> = []) =>
    formOf([["id", RECEIVER], ["active", active], ["expectedUpdatedAt", VERSION], ...extra]);

  it("sem sessão leva ao login; sem permissão nega; nada chama o banco", async () => {
    const fake = createFakeSupabase();
    authorizeAdmin.mockResolvedValue({ kind: "unauthenticated" });
    const anon = await run(() => setReceiverActiveAction(IDLE_ACTIVE, form("false")));
    expect(anon.redirectedTo).toBe("/login?aviso=sessao-expirada");

    authorizeAdmin.mockResolvedValue({
      kind: "forbidden",
      error: { code: "FORBIDDEN", message: "Você não tem permissão para fazer esta alteração.", hint: "ADMIN_REQUIRED" },
    });
    const denied = await run(() => setReceiverActiveAction(IDLE_ACTIVE, form("false")));
    expect(denied.state).toMatchObject({ status: "error", error: { code: "FORBIDDEN" } });
    expect(fake.rpcCalls).toHaveLength(0);
    expect(fake.queries).toHaveLength(0);
  });

  it("entrada inválida (id, ação ou versão): recusa antes do banco", async () => {
    const fake = createFakeSupabase();
    allowAdmin(fake);
    const bad = [
      formOf([["id", "não-é-uuid"], ["active", "false"], ["expectedUpdatedAt", VERSION]]),
      formOf([["id", RECEIVER], ["active", "talvez"], ["expectedUpdatedAt", VERSION]]),
      formOf([["id", RECEIVER], ["active", "false"]]),
    ];
    for (const entry of bad) {
      const { state } = await run(() => setReceiverActiveAction(IDLE_ACTIVE, entry));
      expect(state).toMatchObject({ status: "error", error: { code: "VALIDATION" } });
    }
    expect(fake.queries).toHaveLength(0);
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("inativar: chama set_receiver_active com a versão e o motivo; o destino é o sócio lido do banco", async () => {
    const fake = createFakeSupabase({
      tables: { receivers: () => ok(receiverRow()) },
      rpc: { set_receiver_active: () => ok(writeRow({ active: false })) },
    });
    allowAdmin(fake);
    const { redirectedTo } = await run(() => setReceiverActiveAction(IDLE_ACTIVE, form("false", [["reason", "  duplicado  "]])));
    expect(redirectedTo).toBe(`/configuracoes/socios/${PARTNER}?aviso=recebedor-inativado`);
    expect(fake.rpcCalls[0]).toMatchObject({
      name: "set_receiver_active",
      args: { p_receiver_id: RECEIVER, p_active: false, p_expected_updated_at: VERSION, p_reason: "duplicado", p_correlation_id: CORRELATION },
    });
    expect(Math.max(...revalidatePath.mock.invocationCallOrder)).toBeLessThan(redirect.mock.invocationCallOrder[0]);
  });

  it("sem motivo, a ação não é bloqueada (RAT-D021)", async () => {
    const fake = createFakeSupabase({
      tables: { receivers: () => ok(receiverRow()) },
      rpc: { set_receiver_active: () => ok(writeRow({ active: false })) },
    });
    allowAdmin(fake);
    const { redirectedTo } = await run(() => setReceiverActiveAction(IDLE_ACTIVE, form("false")));
    expect(redirectedTo).toContain("recebedor-inativado");
    expect(fake.rpcCalls[0].args.p_reason).toBeUndefined();
  });

  it("reativar: avisa 'Recebedor reativado'", async () => {
    const fake = createFakeSupabase({
      tables: { receivers: () => ok(receiverRow({ active: false })) },
      rpc: { set_receiver_active: () => ok(writeRow({ active: true })) },
    });
    allowAdmin(fake);
    const { redirectedTo } = await run(() => setReceiverActiveAction(IDLE_ACTIVE, form("true")));
    expect(redirectedTo).toBe(`/configuracoes/socios/${PARTNER}?aviso=recebedor-reativado`);
    expect(fake.rpcCalls[0].args).toMatchObject({ p_active: true });
  });

  it("já estava na situação pedida: não escreve e atualiza a tela com o aviso (UI 8.3)", async () => {
    const inactive = createFakeSupabase({ tables: { receivers: () => ok(receiverRow({ active: false })) } });
    allowAdmin(inactive);
    const a = await run(() => setReceiverActiveAction(IDLE_ACTIVE, form("false")));
    expect(a.redirectedTo).toBe(`/configuracoes/socios/${PARTNER}?aviso=recebedor-ja-inativo`);
    expect(inactive.rpcCalls).toHaveLength(0);

    const active = createFakeSupabase({ tables: { receivers: () => ok(receiverRow()) } });
    allowAdmin(active);
    const b = await run(() => setReceiverActiveAction(IDLE_ACTIVE, form("true")));
    expect(b.redirectedTo).toBe(`/configuracoes/socios/${PARTNER}?aviso=recebedor-ja-ativo`);
    expect(active.rpcCalls).toHaveLength(0);
  });

  it("recebedor que não existe ou o RLS esconde: 'Este cadastro não está mais disponível.'", async () => {
    const fake = createFakeSupabase({ tables: { receivers: () => ok(null) } });
    allowAdmin(fake);
    const { state } = await run(() => setReceiverActiveAction(IDLE_ACTIVE, form("false")));
    expect(state).toMatchObject({
      status: "error",
      error: { code: "NOT_FOUND", message: "Este cadastro não está mais disponível." },
    });
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("reativar com o sócio inativo: erro PARTNER_INACTIVE com o nome (a tela vira o bloqueio da UI 6.5 B)", async () => {
    const fake = createFakeSupabase({
      tables: { receivers: () => ok(receiverRow({ active: false, partner_active: false })) },
      rpc: {
        set_receiver_active: () =>
          fail(dbError("P0001", "PARTNER_INACTIVE", { partners: [{ id: PARTNER, name: "Sócio Exemplo A" }] })),
      },
    });
    allowAdmin(fake);
    const { state, redirectedTo } = await run(() => setReceiverActiveAction(IDLE_ACTIVE, form("true")));
    expect(redirectedTo).toBeNull();
    expect(state).toMatchObject({
      status: "error",
      error: { hint: "PARTNER_INACTIVE", details: { partners: [{ id: PARTNER, name: "Sócio Exemplo A" }] } },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("versão antiga: STALE_VERSION e nada redireciona", async () => {
    const fake = createFakeSupabase({
      tables: { receivers: () => ok(receiverRow()) },
      rpc: { set_receiver_active: () => fail(dbError("P0001", "STALE_VERSION", { current_updated_at: NEW_VERSION })) },
    });
    allowAdmin(fake);
    const { state, redirectedTo } = await run(() => setReceiverActiveAction(IDLE_ACTIVE, form("false")));
    expect(redirectedTo).toBeNull();
    expect(state).toMatchObject({
      status: "error",
      error: { code: "CONFLICT", hint: "STALE_VERSION", message: "Este recebedor foi alterado por outra pessoa. A inativação não foi feita. Atualize a tela e tente de novo." },
    });
  });

  it("erro inesperado: sem 'cause', com código de suporte", async () => {
    const fake = createFakeSupabase({
      tables: { receivers: () => ok(receiverRow()) },
      rpc: { set_receiver_active: () => fail({ code: "XX000", message: "detalhe interno do banco" }) },
    });
    allowAdmin(fake);
    const { state } = await run(() => setReceiverActiveAction(IDLE_ACTIVE, form("false")));
    expect(state).toMatchObject({ status: "error", error: { code: "UNEXPECTED" }, supportCode: CORRELATION });
    expect(JSON.stringify(state)).not.toContain("detalhe interno");
    expect(loggerError).toHaveBeenCalledTimes(1);
  });
});
