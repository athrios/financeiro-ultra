import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, dbError, fail, ok } from "../../../../../tests/unit-support/fake-supabase";

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

import { savePartnerAction, setPartnerActiveAction, type PartnerActiveState, type PartnerFormState } from "./actions";

const PARTNER = "a0000000-0000-4000-8000-000000000001";
const OWNER = "a0000000-0000-4000-8000-000000000002";
const RECEIVER_1 = "b0000000-0000-4000-8000-000000000001";
const RECEIVER_2 = "b0000000-0000-4000-8000-000000000002";
const CLIENT_1 = "c0000000-0000-4000-8000-000000000001";
const CLIENT_2 = "c0000000-0000-4000-8000-000000000002";
const CORRELATION = "d0000000-0000-4000-8000-0000000000ff";
const VERSION = "2026-11-25T14:03:11.123456+00:00";
const NEW_VERSION = "2026-11-25T14:10:00.654321+00:00";

const IDLE_FORM: PartnerFormState = { status: "idle" };
const IDLE_ACTIVE: PartnerActiveState = { status: "idle" };

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

function partnerRow(overrides: Partial<{ active: boolean; name: string; updated_at: string }> = {}) {
  return {
    id: PARTNER,
    name: "Sócio Exemplo A",
    active: true,
    created_at: "2026-11-01T10:00:00+00:00",
    updated_at: VERSION,
    partner_aliases: [],
    ...overrides,
  };
}

function writeRow(overrides: Partial<{ active: boolean; name: string }> = {}) {
  return { id: PARTNER, name: "Sócio Exemplo A", active: true, updated_at: NEW_VERSION, ...overrides };
}

beforeEach(() => {
  revalidatePath.mockClear();
  redirect.mockClear();
  authorizeAdmin.mockReset();
  loggerError.mockClear();
});

describe("savePartnerAction", () => {
  const createForm = () =>
    formOf([
      ["name", "  Sócio Exemplo A  "],
      ["aliases", "Alfa Consultoria"],
      ["aliases", "  "],
      ["aliases", "Sócio Ex. A"],
    ]);

  it("sem sessão: leva ao login com o aviso e não chama o banco", async () => {
    const fake = createFakeSupabase();
    authorizeAdmin.mockResolvedValue({ kind: "unauthenticated" });
    const { redirectedTo } = await run(() => savePartnerAction(IDLE_FORM, createForm()));
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
    const { state, redirectedTo } = await run(() => savePartnerAction(IDLE_FORM, createForm()));
    expect(redirectedTo).toBeNull();
    expect(state).toMatchObject({
      status: "error",
      error: { code: "FORBIDDEN", message: "Você não tem permissão para fazer esta alteração." },
    });
    expect(fake.rpcCalls).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("nome em branco: erro no campo, sem chamar o banco", async () => {
    const fake = createFakeSupabase();
    allowAdmin(fake);
    const { state } = await run(() => savePartnerAction(IDLE_FORM, formOf([["name", "   "]])));
    expect(state).toMatchObject({
      status: "error",
      error: { code: "VALIDATION" },
      fieldErrors: { name: "Informe o nome do sócio." },
    });
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("texto com NUL no nome e no apelido: VALIDATION com a frase no campo, sem chamar o banco (QA-CAD-05)", async () => {
    const fake = createFakeSupabase();
    allowAdmin(fake);
    const name = await run(() => savePartnerAction(IDLE_FORM, formOf([["name", "a\u0000b"]])));
    expect(name.state).toMatchObject({
      status: "error",
      error: { code: "VALIDATION" },
      fieldErrors: { name: "O texto tem um caractere inválido." },
    });
    const alias = await run(() => savePartnerAction(IDLE_FORM, formOf([["name", "Sócio"], ["aliases", "a\u0000b"]])));
    expect(alias.state).toMatchObject({
      status: "error",
      error: { code: "VALIDATION" },
      fieldErrors: { aliases: "O texto tem um caractere inválido." },
    });
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("mais de 2 apelidos: VALIDATION em 'aliases', sem chamar o banco (RAT-D026)", async () => {
    const fake = createFakeSupabase();
    allowAdmin(fake);
    const aliases = Array.from({ length: 3 }, (_, index): [string, string] => ["aliases", `Apelido ${index}`]);
    const { state } = await run(() => savePartnerAction(IDLE_FORM, formOf([["name", "Sócio"], ...aliases])));
    expect(state).toMatchObject({
      status: "error",
      error: { code: "VALIDATION" },
      fieldErrors: { aliases: "No máximo 2 apelidos." },
    });
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("edição sem a versão lida: recusa com a mensagem geral (não é erro de campo)", async () => {
    const fake = createFakeSupabase();
    allowAdmin(fake);
    const { state } = await run(() =>
      savePartnerAction(IDLE_FORM, formOf([["id", PARTNER], ["name", "Sócio Exemplo A"]])),
    );
    expect(state).toMatchObject({ status: "error", fieldErrors: {} });
    expect(fake.rpcCalls).toHaveLength(0);
    expect(state && state.status === "error" ? state.error.message : "").toContain("versão do cadastro");
  });

  it("criar com sucesso: chama save_partner, revalida e SÓ ENTÃO redireciona ao detalhe com o aviso", async () => {
    const fake = createFakeSupabase({ rpc: { save_partner: () => ok(writeRow()) } });
    allowAdmin(fake);
    const { state, redirectedTo } = await run(() => savePartnerAction(IDLE_FORM, createForm()));

    expect(state).toBeNull();
    expect(redirectedTo).toBe(`/configuracoes/socios/${PARTNER}?aviso=criado`);
    expect(fake.rpcCalls).toEqual([
      {
        name: "save_partner",
        args: {
          p_partner_id: null,
          p_name: "Sócio Exemplo A",
          p_aliases: ["Alfa Consultoria", "Sócio Ex. A"],
          p_expected_updated_at: null,
          p_reason: undefined,
          p_correlation_id: CORRELATION,
        },
      },
    ]);
    // A revalidação precisa vir antes do redirect (que lança).
    expect(revalidatePath).toHaveBeenCalledWith("/configuracoes/socios");
    expect(revalidatePath).toHaveBeenCalledWith(`/configuracoes/socios/${PARTNER}`);
    const lastRevalidate = Math.max(...revalidatePath.mock.invocationCallOrder);
    expect(lastRevalidate).toBeLessThan(redirect.mock.invocationCallOrder[0]);
  });

  it("editar com sucesso: devolve a versão lida como veio (texto) e avisa 'Alterações salvas'", async () => {
    const fake = createFakeSupabase({ rpc: { save_partner: () => ok(writeRow()) } });
    allowAdmin(fake);
    const { redirectedTo } = await run(() =>
      savePartnerAction(
        IDLE_FORM,
        formOf([["id", PARTNER], ["name", "Sócio Exemplo A"], ["expectedUpdatedAt", VERSION], ["aliases", "Alfa"]]),
      ),
    );
    expect(redirectedTo).toBe(`/configuracoes/socios/${PARTNER}?aviso=salvo`);
    expect(fake.rpcCalls[0].args).toMatchObject({ p_partner_id: PARTNER, p_expected_updated_at: VERSION });
    expect(typeof fake.rpcCalls[0].args.p_expected_updated_at).toBe("string");
  });

  it("conflito de versão: devolve STALE_VERSION com a mensagem da UI, sem redirecionar e sem sobrescrever", async () => {
    const fake = createFakeSupabase({
      rpc: { save_partner: () => fail(dbError("P0001", "STALE_VERSION", { current_updated_at: NEW_VERSION })) },
    });
    allowAdmin(fake);
    const { state, redirectedTo } = await run(() =>
      savePartnerAction(
        IDLE_FORM,
        formOf([["id", PARTNER], ["name", "Outro nome"], ["expectedUpdatedAt", VERSION]]),
      ),
    );
    expect(redirectedTo).toBeNull();
    expect(state).toMatchObject({
      status: "error",
      error: {
        code: "CONFLICT",
        hint: "STALE_VERSION",
        message: "Este sócio foi alterado enquanto você editava. Suas alterações não foram salvas.",
        details: { hint: "STALE_VERSION", currentUpdatedAt: NEW_VERSION },
      },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("nome repetido: erro no campo 'name' com o dono, sem texto do banco", async () => {
    const fake = createFakeSupabase({
      rpc: {
        save_partner: () =>
          fail(
            dbError("23505", "PARTNER_NAME_TAKEN", {
              field: "name",
              value: "Sócio Exemplo B",
              owner: { kind: "partner", id: OWNER, name: "Sócio Exemplo B", active: true, via: "NAME" },
            }),
          ),
      },
    });
    allowAdmin(fake);
    const { state } = await run(() => savePartnerAction(IDLE_FORM, formOf([["name", "Sócio Exemplo B"]])));
    expect(state).toMatchObject({
      status: "error",
      error: { code: "CONFLICT", hint: "PARTNER_NAME_TAKEN", field: "name" },
      fieldErrors: {
        name: "Já existe um sócio com este nome. Nomes que só mudam em acento, maiúscula ou pontuação contam como o mesmo.",
      },
    });
    expect(JSON.stringify(state)).toContain(OWNER);
  });

  it("apelido de outro sócio: erro no campo 'aliases'", async () => {
    const fake = createFakeSupabase({
      rpc: {
        save_partner: () =>
          fail(
            dbError("23505", "PARTNER_NAME_TAKEN", {
              field: "aliases",
              value: "Alfa",
              owner: { kind: "partner", id: OWNER, name: "Sócio Exemplo B", active: true, via: "ALIAS" },
            }),
          ),
      },
    });
    allowAdmin(fake);
    const { state } = await run(() => savePartnerAction(IDLE_FORM, formOf([["name", "Sócio Exemplo A"], ["aliases", "Alfa"]])));
    expect(state).toMatchObject({
      fieldErrors: { aliases: "Este apelido já pertence ao sócio Sócio Exemplo B." },
    });
  });

  it("erro inesperado: mensagem fixa, código de suporte = correlation id, log no servidor e NADA do banco na resposta", async () => {
    const fake = createFakeSupabase({
      rpc: { save_partner: () => fail({ code: "XX000", message: "relation \"partners\" exploded: segredo-interno" }) },
    });
    allowAdmin(fake);
    const { state } = await run(() => savePartnerAction(IDLE_FORM, formOf([["name", "Sócio Exemplo A"]])));
    expect(state).toMatchObject({
      status: "error",
      error: { code: "UNEXPECTED", message: "Não foi possível concluir a operação. Tente novamente em instantes." },
      supportCode: CORRELATION,
    });
    const serialized = JSON.stringify(state);
    expect(serialized).not.toContain("segredo-interno");
    expect(serialized).not.toContain("cause");
    expect(loggerError).toHaveBeenCalledTimes(1);
    expect(loggerError.mock.calls[0][0]).toBe("cadastros.action_failed");
  });
});

describe("setPartnerActiveAction", () => {
  const inactivateForm = (extra: Array<[string, string]> = []) =>
    formOf([["id", PARTNER], ["active", "false"], ["expectedUpdatedAt", VERSION], ...extra]);

  it("sem sessão: login; sem permissão: nega; nada chega ao banco", async () => {
    const fake = createFakeSupabase();
    authorizeAdmin.mockResolvedValue({ kind: "unauthenticated" });
    expect((await run(() => setPartnerActiveAction(IDLE_ACTIVE, inactivateForm()))).redirectedTo).toBe(
      "/login?aviso=sessao-expirada",
    );

    authorizeAdmin.mockResolvedValue({
      kind: "forbidden",
      error: { code: "FORBIDDEN", message: "Você não tem permissão para fazer esta alteração.", hint: "ADMIN_REQUIRED" },
    });
    const { state } = await run(() => setPartnerActiveAction(IDLE_ACTIVE, inactivateForm()));
    expect(state).toMatchObject({ status: "error", error: { code: "FORBIDDEN" } });
    expect(fake.rpcCalls).toHaveLength(0);
    expect(fake.queries).toHaveLength(0);
  });

  it("entrada inválida (id ruim, ação ausente): recusa sem tocar no banco", async () => {
    const fake = createFakeSupabase();
    allowAdmin(fake);
    const { state } = await run(() =>
      setPartnerActiveAction(IDLE_ACTIVE, formOf([["id", "não-uuid"], ["expectedUpdatedAt", VERSION]])),
    );
    expect(state).toMatchObject({ status: "error", error: { code: "VALIDATION" } });
    expect(fake.rpcCalls).toHaveLength(0);
    expect(fake.queries).toHaveLength(0);
  });

  it("inativar sem recebedores: chama set_partner_active com lista vazia e avisa 'Sócio inativado'", async () => {
    const fake = createFakeSupabase({
      tables: { partners: () => ok(partnerRow()) },
      rpc: { set_partner_active: () => ok(writeRow({ active: false })) },
    });
    allowAdmin(fake);
    const { redirectedTo } = await run(() =>
      setPartnerActiveAction(IDLE_ACTIVE, inactivateForm([["reason", "  Saiu da sociedade  "]])),
    );
    expect(redirectedTo).toBe(`/configuracoes/socios/${PARTNER}?aviso=inativado`);
    expect(fake.rpcCalls).toEqual([
      {
        name: "set_partner_active",
        args: {
          p_partner_id: PARTNER,
          p_active: false,
          p_expected_updated_at: VERSION,
          p_confirmed_receiver_ids: [],
          p_reason: "Saiu da sociedade",
          p_correlation_id: CORRELATION,
        },
      },
    ]);
    expect(Math.max(...revalidatePath.mock.invocationCallOrder)).toBeLessThan(redirect.mock.invocationCallOrder[0]);
  });

  it("inativar com recebedores: envia a lista confirmada e o aviso leva a contagem", async () => {
    const fake = createFakeSupabase({
      tables: { partners: () => ok(partnerRow()) },
      rpc: { set_partner_active: () => ok(writeRow({ active: false })) },
    });
    allowAdmin(fake);
    const { redirectedTo } = await run(() =>
      setPartnerActiveAction(
        IDLE_ACTIVE,
        inactivateForm([["confirmedReceiverIds", RECEIVER_1], ["confirmedReceiverIds", RECEIVER_2]]),
      ),
    );
    expect(redirectedTo).toBe(`/configuracoes/socios/${PARTNER}?aviso=inativado&n=2`);
    expect(fake.rpcCalls[0].args.p_confirmed_receiver_ids).toEqual([RECEIVER_1, RECEIVER_2]);
    // Sem motivo informado, a ação não é bloqueada (RAT-D021).
    expect(fake.rpcCalls[0].args.p_reason).toBeUndefined();
  });

  it("reativar: avisa 'Sócio reativado'", async () => {
    const fake = createFakeSupabase({
      tables: { partners: () => ok(partnerRow({ active: false })) },
      rpc: { set_partner_active: () => ok(writeRow({ active: true })) },
    });
    allowAdmin(fake);
    const { redirectedTo } = await run(() =>
      setPartnerActiveAction(IDLE_ACTIVE, formOf([["id", PARTNER], ["active", "true"], ["expectedUpdatedAt", VERSION]])),
    );
    expect(redirectedTo).toBe(`/configuracoes/socios/${PARTNER}?aviso=reativado`);
    expect(fake.rpcCalls[0].args).toMatchObject({ p_active: true });
  });

  it("já estava na situação pedida (outra pessoa fez antes): não escreve e atualiza a tela com o aviso", async () => {
    const fake = createFakeSupabase({ tables: { partners: () => ok(partnerRow({ active: false })) } });
    allowAdmin(fake);
    const { redirectedTo } = await run(() => setPartnerActiveAction(IDLE_ACTIVE, inactivateForm()));
    expect(redirectedTo).toBe(`/configuracoes/socios/${PARTNER}?aviso=ja-inativo`);
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("sócio que não existe ou o RLS esconde: 'Este cadastro não está mais disponível.'", async () => {
    const fake = createFakeSupabase({ tables: { partners: () => ok(null) } });
    allowAdmin(fake);
    const { state } = await run(() => setPartnerActiveAction(IDLE_ACTIVE, inactivateForm()));
    expect(state).toMatchObject({
      status: "error",
      error: { code: "NOT_FOUND", message: "Este cadastro não está mais disponível." },
    });
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("sócio indicado em cliente: devolve o bloqueio com a lista ATUAL e a marca 'Único sócio'", async () => {
    const fake = createFakeSupabase({
      tables: {
        partners: () => ok(partnerRow()),
        client_partners: (query) => {
          const ofPartner = fake.stepsOf(query, "eq").some(([column]) => column === "partner_id");
          return ofPartner
            ? ok([
                { id: "i1", clients: { id: CLIENT_1, legal_name: "Cliente Modelo Ltda", normalized_name: "cliente modelo ltda", active: true } },
                { id: "i2", clients: { id: CLIENT_2, legal_name: "Cliente Antigo Ltda", normalized_name: "cliente antigo ltda", active: false } },
              ])
            : ok([{ id: "i1", client_id: CLIENT_1 }]);
        },
      },
      rpc: {
        set_partner_active: () =>
          fail(
            dbError("P0001", "PARTNER_HAS_CLIENTS", {
              clients: [
                { id: CLIENT_1, name: "Cliente Modelo Ltda", active: true },
                { id: CLIENT_2, name: "Cliente Antigo Ltda", active: false },
              ],
            }),
          ),
      },
    });
    allowAdmin(fake);
    const { state, redirectedTo } = await run(() => setPartnerActiveAction(IDLE_ACTIVE, inactivateForm()));
    expect(redirectedTo).toBeNull();
    expect(state).toMatchObject({
      status: "error",
      error: {
        code: "RULE_VIOLATION",
        hint: "PARTNER_HAS_CLIENTS",
        message:
          "Sócio Exemplo A ainda está indicado em 2 clientes, entre ativos e inativos. Para inativar, primeiro retire este sócio de todos eles.",
      },
      clients: [
        { id: CLIENT_1, name: "Cliente Modelo Ltda", active: true, onlyPartner: true },
        { id: CLIENT_2, name: "Cliente Antigo Ltda", active: false, onlyPartner: false },
      ],
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("recebedores mudaram: devolve a lista atual para confirmar de novo", async () => {
    const fake = createFakeSupabase({
      tables: { partners: () => ok(partnerRow()) },
      rpc: {
        set_partner_active: () =>
          fail(dbError("P0001", "RECEIVERS_CHANGED", { receivers: [{ id: RECEIVER_2, name: "Titular Fictício B" }] })),
      },
    });
    allowAdmin(fake);
    const { state } = await run(() => setPartnerActiveAction(IDLE_ACTIVE, inactivateForm([["confirmedReceiverIds", RECEIVER_1]])));
    expect(state).toMatchObject({
      status: "error",
      error: {
        hint: "RECEIVERS_CHANGED",
        message: "A lista de recebedores deste sócio mudou. Confira a lista atualizada e confirme de novo.",
      },
      receivers: [{ id: RECEIVER_2, holderName: "Titular Fictício B" }],
    });
  });

  it("versão desatualizada na inativação: STALE_VERSION, nada gravado", async () => {
    const fake = createFakeSupabase({
      tables: { partners: () => ok(partnerRow()) },
      rpc: { set_partner_active: () => fail(dbError("P0001", "STALE_VERSION", { current_updated_at: NEW_VERSION })) },
    });
    allowAdmin(fake);
    const { state } = await run(() => setPartnerActiveAction(IDLE_ACTIVE, inactivateForm()));
    expect(state).toMatchObject({ status: "error", error: { code: "CONFLICT", hint: "STALE_VERSION" } });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("falha inesperada no banco: sem 'cause' na resposta e com código de suporte", async () => {
    const fake = createFakeSupabase({
      tables: { partners: () => ok(partnerRow()) },
      rpc: { set_partner_active: () => fail({ code: "XX000", message: "falha-interna-secreta" }) },
    });
    allowAdmin(fake);
    const { state } = await run(() => setPartnerActiveAction(IDLE_ACTIVE, inactivateForm()));
    expect(state).toMatchObject({ status: "error", error: { code: "UNEXPECTED" }, supportCode: CORRELATION });
    expect(JSON.stringify(state)).not.toContain("falha-interna-secreta");
  });
});
