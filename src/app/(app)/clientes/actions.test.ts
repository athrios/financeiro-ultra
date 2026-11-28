import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, dbError, fail, ok } from "../../../../tests/unit-support/fake-supabase";

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

import { saveClientAction, setClientActiveAction, type ClientActiveState, type ClientFormState } from "./actions";

const CLIENT = "d4000000-0000-4000-8000-000000000001";
const OTHER_CLIENT = "d4000000-0000-4000-8000-000000000002";
const PARTNER_A = "a0000000-0000-4000-8000-000000000001";
const PARTNER_B = "a0000000-0000-4000-8000-000000000002";
const CORRELATION = "d0000000-0000-4000-8000-0000000000ff";
const VERSION = "2026-11-25T14:03:11.123456+00:00";
const NEW_VERSION = "2026-11-25T14:10:00.654321+00:00";
const VALID_CNPJ = "99.999.999/0002-72";

const IDLE: ClientFormState = { status: "idle" };
const IDLE_ACTIVE: ClientActiveState = { status: "idle" };

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

function writeRow(overrides: Partial<{ active: boolean }> = {}) {
  return { id: CLIENT, legal_name: "Cliente Modelo Ltda", active: true, updated_at: NEW_VERSION, default_monthly_value: 1500, ...overrides };
}

/** Formulário de um cliente novo, completo e válido. */
function newClientForm(extra: Array<[string, string]> = []): FormData {
  return formOf([
    ["legalName", "  Cliente Modelo Ltda  "],
    ["tradeName", "Modelo"],
    ["documentType", "CNPJ"],
    ["document", VALID_CNPJ],
    ["monthlyValue", "1.500,00"],
    ["notes", "Paga no dia 10"],
    ["partnerIds", PARTNER_A],
    ["partnerIds", PARTNER_B],
    ["aliasType", "NAME"],
    ["aliasValue", "Modelo Filial"],
    ["aliasType", "DOCUMENT"],
    ["aliasValue", "000.000.005-15"],
    ...extra,
  ]);
}

function editClientForm(extra: Array<[string, string]> = []): FormData {
  return formOf([
    ["id", CLIENT],
    ["expectedUpdatedAt", VERSION],
    ["legalName", "Cliente Modelo Ltda"],
    ["documentType", ""],
    ["document", ""],
    ["monthlyValue", "1.500,00"],
    ["partnerIds", PARTNER_A],
    ...extra,
  ]);
}

function clientsTable(active: boolean | null) {
  return { clients: () => ok(active === null ? null : { id: CLIENT, active }) };
}

beforeEach(() => {
  revalidatePath.mockClear();
  redirect.mockClear();
  authorizeAdmin.mockReset();
  loggerError.mockClear();
});

describe("saveClientAction: autorização", () => {
  it("sem sessão: leva ao login com o aviso e não chama o banco", async () => {
    const fake = createFakeSupabase();
    authorizeAdmin.mockResolvedValue({ kind: "unauthenticated" });
    const { redirectedTo } = await run(() => saveClientAction(IDLE, newClientForm()));
    expect(redirectedTo).toBe("/login?aviso=sessao-expirada");
    expect(fake.rpcCalls).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("sem permissão (não Administrador): nega, sem tocar no banco nem revalidar", async () => {
    const fake = createFakeSupabase();
    authorizeAdmin.mockResolvedValue({
      kind: "forbidden",
      error: { code: "FORBIDDEN", message: "Você não tem permissão para fazer esta alteração.", hint: "ADMIN_REQUIRED" },
    });
    const { state, redirectedTo } = await run(() => saveClientAction(IDLE, newClientForm()));
    expect(redirectedTo).toBeNull();
    expect(state).toMatchObject({
      status: "error",
      error: { code: "FORBIDDEN", message: "Você não tem permissão para fazer esta alteração." },
    });
    expect(fake.rpcCalls).toHaveLength(0);
    expect(fake.queries).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("saveClientAction: validação", () => {
  it("campos vazios: todos os erros de uma vez, sem chamar o banco", async () => {
    const fake = createFakeSupabase();
    allowAdmin(fake);
    const { state } = await run(() => saveClientAction(IDLE, formOf([["legalName", "  "], ["documentType", "CPF"]])));
    expect(state).toMatchObject({
      status: "error",
      error: { code: "VALIDATION" },
      fieldErrors: {
        legalName: "Informe o nome ou a razão social.",
        document: "Digite o número do CPF ou escolha “Sem documento”.",
        monthlyValue: "Informe o valor da mensalidade.",
        partnerIds: "Escolha pelo menos um sócio. Todo cliente ativo precisa de um.",
      },
    });
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("mensalidade com ponto de centavos ('1234.56') é recusada: nunca vira R$ 123.456,00", async () => {
    const fake = createFakeSupabase();
    allowAdmin(fake);
    const form = newClientForm();
    form.set("monthlyValue", "1234.56");
    const { state } = await run(() => saveClientAction(IDLE, form));
    expect(state).toMatchObject({
      fieldErrors: { monthlyValue: "Valor inválido. Use vírgula para os centavos. Exemplo: 1.234,56." },
    });
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("CNPJ com dígitos errados e apelido-documento inválido: erro no campo certo", async () => {
    const fake = createFakeSupabase();
    allowAdmin(fake);
    const form = newClientForm();
    form.set("document", "99.999.999/0001-90");
    form.delete("aliasType");
    form.delete("aliasValue");
    form.append("aliasType", "DOCUMENT");
    form.append("aliasValue", "123");
    const { state } = await run(() => saveClientAction(IDLE, form));
    expect(state).toMatchObject({
      fieldErrors: {
        document: "CNPJ inválido. Confira os números e as letras.",
        aliases: "Informe um CPF (11 números) ou um CNPJ (14 caracteres).",
      },
    });
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("apelidos com tipos e valores de tamanhos diferentes: lista inválida, sem tocar no banco", async () => {
    const fake = createFakeSupabase();
    allowAdmin(fake);
    const form = newClientForm();
    form.append("aliasType", "NAME");
    const { state } = await run(() => saveClientAction(IDLE, form));
    expect(state).toMatchObject({ status: "error", fieldErrors: { aliases: "Lista de apelidos inválida." } });
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("edição sem a versão lida: mensagem geral, não erro de campo", async () => {
    const fake = createFakeSupabase({ tables: clientsTable(true) });
    allowAdmin(fake);
    const form = editClientForm();
    form.delete("expectedUpdatedAt");
    const { state } = await run(() => saveClientAction(IDLE, form));
    expect(state).toMatchObject({ status: "error", fieldErrors: {} });
    expect(state && state.status === "error" ? state.error.message : "").toContain("versão do cadastro");
    expect(fake.rpcCalls).toHaveLength(0);
  });
});

describe("saveClientAction: criar", () => {
  it("chama save_client com o estado final, revalida e SÓ ENTÃO redireciona ao detalhe com 'criado'", async () => {
    const fake = createFakeSupabase({ rpc: { save_client: () => ok(writeRow()) } });
    allowAdmin(fake);
    const { state, redirectedTo } = await run(() => saveClientAction(IDLE, newClientForm()));

    expect(state).toBeNull();
    expect(redirectedTo).toBe(`/clientes/${CLIENT}?aviso=criado`);
    expect(fake.rpcCalls).toEqual([
      {
        name: "save_client",
        args: {
          p_client_id: null,
          p_legal_name: "Cliente Modelo Ltda",
          p_trade_name: "Modelo",
          p_document: "99999999000272",
          p_default_monthly_value: "1500.00",
          p_notes: "Paga no dia 10",
          p_partner_ids: [PARTNER_A, PARTNER_B],
          p_aliases: [
            { type: "NAME", value: "Modelo Filial" },
            { type: "DOCUMENT", value: "000.000.005-15" },
          ],
          p_expected_updated_at: null,
          p_acknowledged_duplicate_ids: [],
          p_reason: undefined,
          p_correlation_id: CORRELATION,
        },
      },
    ]);
    // cliente novo: nenhuma leitura de situação
    expect(fake.queries).toHaveLength(0);
    expect(revalidatePath).toHaveBeenCalledWith("/clientes");
    expect(revalidatePath).toHaveBeenCalledWith(`/clientes/${CLIENT}`);
    const lastRevalidate = Math.max(...revalidatePath.mock.invocationCallOrder);
    expect(lastRevalidate).toBeLessThan(redirect.mock.invocationCallOrder[0]);
  });

  it("sem documento, fantasia, observações e apelidos: vão como null e listas vazias", async () => {
    const fake = createFakeSupabase({ rpc: { save_client: () => ok(writeRow()) } });
    allowAdmin(fake);
    const form = formOf([
      ["legalName", "Cliente Modelo Ltda"],
      ["documentType", ""],
      ["document", ""],
      ["monthlyValue", "350,5"],
      ["partnerIds", PARTNER_A],
    ]);
    await run(() => saveClientAction(IDLE, form));
    expect(fake.rpcCalls[0].args).toMatchObject({
      p_trade_name: null,
      p_document: null,
      p_default_monthly_value: "350.50",
      p_notes: null,
      p_aliases: [],
    });
  });
});

describe("saveClientAction: editar", () => {
  it("leva a versão lida como veio (texto) e o motivo; avisa 'Alterações salvas'", async () => {
    const fake = createFakeSupabase({ tables: clientsTable(true), rpc: { save_client: () => ok(writeRow()) } });
    allowAdmin(fake);
    const { redirectedTo } = await run(() => saveClientAction(IDLE, editClientForm([["reason", "  Troca de sócio  "]])));

    expect(redirectedTo).toBe(`/clientes/${CLIENT}?aviso=salvo`);
    expect(fake.rpcCalls[0].args).toMatchObject({
      p_client_id: CLIENT,
      p_expected_updated_at: VERSION,
      p_reason: "Troca de sócio",
    });
    expect(typeof fake.rpcCalls[0].args.p_expected_updated_at).toBe("string");
  });

  it("sem motivo, salva normalmente (RAT-D021)", async () => {
    const fake = createFakeSupabase({ tables: clientsTable(true), rpc: { save_client: () => ok(writeRow()) } });
    allowAdmin(fake);
    const { redirectedTo } = await run(() => saveClientAction(IDLE, editClientForm()));
    expect(redirectedTo).toBe(`/clientes/${CLIENT}?aviso=salvo`);
    expect(fake.rpcCalls[0].args.p_reason).toBeUndefined();
  });

  it("cliente ativo sem sócio é recusado antes do banco", async () => {
    const fake = createFakeSupabase({ tables: clientsTable(true) });
    allowAdmin(fake);
    const form = editClientForm();
    form.delete("partnerIds");
    const { state } = await run(() => saveClientAction(IDLE, form));
    expect(state).toMatchObject({
      fieldErrors: { partnerIds: "Escolha pelo menos um sócio. Todo cliente ativo precisa de um." },
    });
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("cliente INATIVO (lido do banco) pode ser salvo sem sócio: allowEmptyPartners", async () => {
    const fake = createFakeSupabase({ tables: clientsTable(false), rpc: { save_client: () => ok(writeRow({ active: false })) } });
    allowAdmin(fake);
    const form = editClientForm();
    form.delete("partnerIds");
    const { redirectedTo } = await run(() => saveClientAction(IDLE, form));
    expect(redirectedTo).toBe(`/clientes/${CLIENT}?aviso=salvo`);
    expect(fake.rpcCalls[0].args.p_partner_ids).toEqual([]);
  });

  it("a situação do cliente nunca vem do formulário: campo 'active' forjado não libera sócio vazio", async () => {
    const fake = createFakeSupabase({ tables: clientsTable(true) });
    allowAdmin(fake);
    const form = editClientForm([["active", "false"], ["clientActive", "false"]]);
    form.delete("partnerIds");
    const { state } = await run(() => saveClientAction(IDLE, form));
    expect(state).toMatchObject({ fieldErrors: { partnerIds: expect.any(String) } });
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("cliente que não existe ou o RLS esconde: 'Este cadastro não está mais disponível.'", async () => {
    const fake = createFakeSupabase({ tables: clientsTable(null) });
    allowAdmin(fake);
    const { state } = await run(() => saveClientAction(IDLE, editClientForm()));
    expect(state).toMatchObject({
      status: "error",
      error: { code: "NOT_FOUND", message: "Este cadastro não está mais disponível." },
    });
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("tipo de documento fora de CPF/CNPJ: frase em português no campo documentType, sem texto do zod (QA-CAD-06)", async () => {
    for (const bad of ["XYZ", "cpf"]) {
      const fake = createFakeSupabase();
      allowAdmin(fake);
      const form = newClientForm();
      form.set("documentType", bad);
      form.set("document", "000.000.001-91");
      const { state } = await run(() => saveClientAction(IDLE, form));
      expect(state).toMatchObject({
        status: "error",
        error: { code: "VALIDATION", message: "Escolha CPF ou CNPJ." },
        fieldErrors: { documentType: "Escolha CPF ou CNPJ." },
      });
      expect(JSON.stringify(state)).not.toContain("Invalid option");
      expect(fake.rpcCalls).toHaveLength(0);
    }
  });

  it("texto com NUL: VALIDATION no campo, sem chamar o banco (QA-CAD-05)", async () => {
    const fake = createFakeSupabase();
    allowAdmin(fake);
    const form = newClientForm();
    form.set("notes", "a\u0000b");
    const { state } = await run(() => saveClientAction(IDLE, form));
    expect(state).toMatchObject({
      status: "error",
      error: { code: "VALIDATION" },
      fieldErrors: { notes: "O texto tem um caractere inválido." },
    });
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("mais de 2 nomes: VALIDATION em 'aliases', sem chamar o banco (RAT-D026)", async () => {
    const fake = createFakeSupabase();
    allowAdmin(fake);
    const aliases = Array.from({ length: 3 }, (_, index): [string, string] => ["aliasValue", `Nome ${index}`]);
    const types = aliases.map((): [string, string] => ["aliasType", "NAME"]);
    const { state } = await run(() => saveClientAction(IDLE, newClientForm([...types, ...aliases])));
    expect(state).toMatchObject({
      status: "error",
      error: { code: "VALIDATION" },
      fieldErrors: { aliases: "No máximo 2 nomes." },
    });
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("mais de 2 documentos: VALIDATION em 'aliases' com a frase dos documentos (RAT-D026)", async () => {
    const fake = createFakeSupabase();
    allowAdmin(fake);
    const docs: Array<[string, string]> = [
      ["aliasValue", "000.000.001-91"],
      ["aliasValue", "00000000272"],
      ["aliasValue", "ZZ0TESTE000100"],
    ];
    const types = docs.map((): [string, string] => ["aliasType", "DOCUMENT"]);
    const { state } = await run(() => saveClientAction(IDLE, newClientForm([...types, ...docs])));
    expect(state).toMatchObject({
      status: "error",
      error: { code: "VALIDATION" },
      fieldErrors: { aliases: "No máximo 2 documentos." },
    });
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("id que não é UUID: validação recusa, sem consultar o banco", async () => {
    const fake = createFakeSupabase();
    allowAdmin(fake);
    const form = editClientForm();
    form.set("id", "não-uuid");
    const { state } = await run(() => saveClientAction(IDLE, form));
    expect(state).toMatchObject({ status: "error", error: { code: "VALIDATION" } });
    expect(fake.queries).toHaveLength(0);
    expect(fake.rpcCalls).toHaveLength(0);
  });
});

describe("saveClientAction: nome parecido (POSSIBLE_DUPLICATE)", () => {
  const matches = [
    { id: OTHER_CLIENT, name: "Cliente Modelo Ltda", document: "99999999000272", document_type: "CNPJ", active: true, match: "SAME_NAME" },
    { id: "d4000000-0000-4000-8000-000000000003", name: "Modelo Filial", document: null, document_type: null, active: false, match: "SAME_ALIAS" },
  ];

  it("sem confirmação: devolve a lista para o aviso, não grava, não revalida nem redireciona", async () => {
    const fake = createFakeSupabase({ rpc: { save_client: () => fail(dbError("P0001", "POSSIBLE_DUPLICATE", { matches })) } });
    allowAdmin(fake);
    const { state, redirectedTo } = await run(() => saveClientAction(IDLE, newClientForm()));

    expect(redirectedTo).toBeNull();
    expect(state).toMatchObject({
      status: "error",
      error: {
        code: "RULE_VIOLATION",
        hint: "POSSIBLE_DUPLICATE",
        details: {
          hint: "POSSIBLE_DUPLICATE",
          matches: [
            { id: OTHER_CLIENT, name: "Cliente Modelo Ltda", document: "99999999000272", active: true, match: "SAME_NAME" },
            { name: "Modelo Filial", document: null, active: false, match: "SAME_ALIAS" },
          ],
        },
      },
      fieldErrors: {},
    });
    expect(fake.rpcCalls[0].args.p_acknowledged_duplicate_ids).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("com a lista confirmada: reenvia acknowledgedDuplicateIds ao banco (sem repetidos) e salva", async () => {
    const fake = createFakeSupabase({ rpc: { save_client: () => ok(writeRow()) } });
    allowAdmin(fake);
    const { redirectedTo } = await run(() =>
      saveClientAction(
        IDLE,
        newClientForm([
          ["acknowledgedDuplicateIds", OTHER_CLIENT],
          ["acknowledgedDuplicateIds", OTHER_CLIENT],
          ["acknowledgedDuplicateIds", "d4000000-0000-4000-8000-000000000003"],
        ]),
      ),
    );
    expect(redirectedTo).toBe(`/clientes/${CLIENT}?aviso=criado`);
    expect(fake.rpcCalls[0].args.p_acknowledged_duplicate_ids).toEqual([OTHER_CLIENT, "d4000000-0000-4000-8000-000000000003"]);
  });

  it("id de confirmação que não é UUID é recusado antes do banco", async () => {
    const fake = createFakeSupabase();
    allowAdmin(fake);
    const { state } = await run(() => saveClientAction(IDLE, newClientForm([["acknowledgedDuplicateIds", "x"]])));
    expect(state).toMatchObject({ status: "error", error: { code: "VALIDATION" } });
    expect(fake.rpcCalls).toHaveLength(0);
  });
});

describe("saveClientAction: documento e apelido repetidos", () => {
  it("DOCUMENT_TAKEN (cliente inativo): erro no campo 'document' e dono com id, nome e situação", async () => {
    const owner = { kind: "client", id: OTHER_CLIENT, name: "Comércio Fictício Ltda", active: false };
    const fake = createFakeSupabase({
      rpc: { save_client: () => fail(dbError("23505", "DOCUMENT_TAKEN", { field: "document", value: "99999999000272", owner })) },
    });
    allowAdmin(fake);
    const { state, redirectedTo } = await run(() => saveClientAction(IDLE, newClientForm()));

    expect(redirectedTo).toBeNull();
    expect(state).toMatchObject({
      status: "error",
      error: { code: "CONFLICT", hint: "DOCUMENT_TAKEN", field: "document", details: { hint: "DOCUMENT_TAKEN", owner } },
      fieldErrors: {
        document:
          "Já existe um cliente inativo com este CNPJ: Comércio Fictício Ltda. Para voltar a usar este cadastro, reative-o.",
      },
    });
  });

  it("DOCUMENT_TAKEN (cliente ativo): frase sem a parte de reativar", async () => {
    const owner = { kind: "client", id: OTHER_CLIENT, name: "Comércio Fictício Ltda", active: true };
    const fake = createFakeSupabase({
      rpc: { save_client: () => fail(dbError("23505", "DOCUMENT_TAKEN", { field: "document", owner })) },
    });
    allowAdmin(fake);
    const { state } = await run(() => saveClientAction(IDLE, newClientForm()));
    expect(state).toMatchObject({ fieldErrors: { document: "Já existe um cliente com este CNPJ: Comércio Fictício Ltda." } });
  });

  it("apelido-documento igual ao documento de outro cliente: erro em 'aliases'", async () => {
    const owner = { kind: "client", id: OTHER_CLIENT, name: "Comércio Fictício Ltda", active: true };
    const fake = createFakeSupabase({
      rpc: { save_client: () => fail(dbError("23505", "DOCUMENT_TAKEN", { field: "aliases", value: "00000000515", owner })) },
    });
    allowAdmin(fake);
    const { state } = await run(() => saveClientAction(IDLE, newClientForm()));
    expect(state).toMatchObject({
      fieldErrors: { aliases: "Este documento já é o documento do cliente Comércio Fictício Ltda." },
    });
  });

  it("ALIAS_TAKEN: erro em 'aliases' com o dono", async () => {
    const owner = { kind: "client", id: OTHER_CLIENT, name: "Comércio Fictício Ltda", active: true };
    const fake = createFakeSupabase({
      rpc: { save_client: () => fail(dbError("23505", "ALIAS_TAKEN", { field: "aliases", value: "Modelo Filial", owner })) },
    });
    allowAdmin(fake);
    const { state } = await run(() => saveClientAction(IDLE, newClientForm()));
    expect(state).toMatchObject({
      error: { hint: "ALIAS_TAKEN", details: { owner } },
      fieldErrors: { aliases: "Este apelido já pertence ao cliente Comércio Fictício Ltda." },
    });
  });
});

describe("saveClientAction: sócio inativado e conflito", () => {
  it("sócio inativado enquanto preenchia: erro em 'partnerIds' com o nome", async () => {
    const fake = createFakeSupabase({
      rpc: { save_client: () => fail(dbError("P0001", "PARTNER_INACTIVE", { partners: [{ id: PARTNER_A, name: "Sócio Exemplo A" }] })) },
    });
    allowAdmin(fake);
    const { state } = await run(() => saveClientAction(IDLE, newClientForm()));
    expect(state).toMatchObject({
      fieldErrors: {
        partnerIds: "O sócio Sócio Exemplo A foi inativado e não pode mais ser indicado. Desmarque-o ou escolha outro.",
      },
    });
  });

  it("conflito de versão: STALE_VERSION com a mensagem da UI e a versão atual; nada é sobrescrito", async () => {
    const fake = createFakeSupabase({
      tables: clientsTable(true),
      rpc: { save_client: () => fail(dbError("P0001", "STALE_VERSION", { current_updated_at: NEW_VERSION })) },
    });
    allowAdmin(fake);
    const { state, redirectedTo } = await run(() => saveClientAction(IDLE, editClientForm()));
    expect(redirectedTo).toBeNull();
    expect(state).toMatchObject({
      status: "error",
      error: {
        code: "CONFLICT",
        hint: "STALE_VERSION",
        message: "Este cliente foi alterado enquanto você editava. Suas alterações não foram salvas.",
        details: { hint: "STALE_VERSION", currentUpdatedAt: NEW_VERSION },
      },
      fieldErrors: {},
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("saveClientAction: erro inesperado", () => {
  it("mensagem fixa, código de suporte = correlation id, log no servidor e NADA do banco na resposta", async () => {
    const fake = createFakeSupabase({
      rpc: { save_client: () => fail({ code: "XX000", message: 'relation "clients" exploded: segredo-interno' }) },
    });
    allowAdmin(fake);
    const { state } = await run(() => saveClientAction(IDLE, newClientForm()));
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
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("falha ao ler a situação do cliente (edição): mesmo tratamento, sem vazar o texto do banco", async () => {
    const fake = createFakeSupabase({ tables: { clients: () => fail({ code: "XX000", message: "segredo-interno" }) } });
    allowAdmin(fake);
    const { state } = await run(() => saveClientAction(IDLE, editClientForm()));
    expect(state).toMatchObject({ status: "error", error: { code: "UNEXPECTED" }, supportCode: CORRELATION });
    expect(JSON.stringify(state)).not.toContain("segredo-interno");
    expect(fake.rpcCalls).toHaveLength(0);
  });
});

describe("setClientActiveAction", () => {
  const form = (extra: Array<[string, string]> = [], active = false) =>
    formOf([["id", CLIENT], ["active", String(active)], ["expectedUpdatedAt", VERSION], ...extra]);

  it("sem sessão: leva ao login com o aviso e não chama o banco", async () => {
    const fake = createFakeSupabase();
    authorizeAdmin.mockResolvedValue({ kind: "unauthenticated" });
    const { redirectedTo } = await run(() => setClientActiveAction(IDLE_ACTIVE, form()));
    expect(redirectedTo).toBe("/login?aviso=sessao-expirada");
    expect(fake.rpcCalls).toHaveLength(0);
    expect(fake.queries).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("sem permissão (não Administrador): nega, sem tocar no banco nem revalidar", async () => {
    const fake = createFakeSupabase();
    authorizeAdmin.mockResolvedValue({
      kind: "forbidden",
      error: { code: "FORBIDDEN", message: "Você não tem permissão para fazer esta alteração.", hint: "ADMIN_REQUIRED" },
    });
    const { state, redirectedTo } = await run(() => setClientActiveAction(IDLE_ACTIVE, form()));
    expect(redirectedTo).toBeNull();
    expect(state).toMatchObject({ status: "error", error: { code: "FORBIDDEN" }, supportCode: null });
    expect(fake.rpcCalls).toHaveLength(0);
    expect(fake.queries).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("entrada inválida (id, ação ou versão): recusa antes do banco", async () => {
    const fake = createFakeSupabase();
    allowAdmin(fake);
    const cases: FormData[] = [
      formOf([["id", "nao-e-uuid"], ["active", "false"], ["expectedUpdatedAt", VERSION]]),
      formOf([["id", CLIENT], ["active", "talvez"], ["expectedUpdatedAt", VERSION]]),
      formOf([["id", CLIENT], ["active", "false"]]),
    ];
    for (const entry of cases) {
      const { state } = await run(() => setClientActiveAction(IDLE_ACTIVE, entry));
      expect(state).toMatchObject({ status: "error", error: { code: "VALIDATION" } });
    }
    expect(fake.rpcCalls).toHaveLength(0);
    expect(fake.queries).toHaveLength(0);
  });

  it("inativar: chama set_client_active com a versão lida, revalida e SÓ ENTÃO redireciona com 'inativado'", async () => {
    const fake = createFakeSupabase({
      tables: clientsTable(true),
      rpc: { set_client_active: () => ok(writeRow({ active: false })) },
    });
    allowAdmin(fake);
    const order: string[] = [];
    revalidatePath.mockImplementation(() => order.push("revalidate"));
    redirect.mockImplementationOnce((url: string) => {
      order.push("redirect");
      throw new RedirectSignal(url);
    });
    const { redirectedTo } = await run(() =>
      setClientActiveAction(IDLE_ACTIVE, form([["reason", "  Contrato encerrado  "]])),
    );
    revalidatePath.mockReset();
    expect(redirectedTo).toBe(`/clientes/${CLIENT}?aviso=inativado`);
    expect(order).toEqual(["revalidate", "revalidate", "redirect"]);
    expect(fake.rpcCalls).toHaveLength(1);
    expect(fake.rpcCalls[0]).toMatchObject({
      name: "set_client_active",
      args: {
        p_client_id: CLIENT,
        p_active: false,
        p_expected_updated_at: VERSION,
        p_reason: "Contrato encerrado",
        p_correlation_id: CORRELATION,
      },
    });
  });

  it("revalida a lista e o detalhe do cliente", async () => {
    const fake = createFakeSupabase({
      tables: clientsTable(true),
      rpc: { set_client_active: () => ok(writeRow({ active: false })) },
    });
    allowAdmin(fake);
    await run(() => setClientActiveAction(IDLE_ACTIVE, form()));
    expect(revalidatePath).toHaveBeenCalledWith("/clientes");
    expect(revalidatePath).toHaveBeenCalledWith(`/clientes/${CLIENT}`);
  });

  it("sem motivo, conclui normalmente (RAT-D021): p_reason não vai", async () => {
    const fake = createFakeSupabase({
      tables: clientsTable(true),
      rpc: { set_client_active: () => ok(writeRow({ active: false })) },
    });
    allowAdmin(fake);
    const { redirectedTo } = await run(() => setClientActiveAction(IDLE_ACTIVE, form()));
    expect(redirectedTo).toBe(`/clientes/${CLIENT}?aviso=inativado`);
    expect(fake.rpcCalls[0].args.p_reason).toBeUndefined();
  });

  it("reativar: avisa 'reativado' e manda p_active true", async () => {
    const fake = createFakeSupabase({
      tables: clientsTable(false),
      rpc: { set_client_active: () => ok(writeRow({ active: true })) },
    });
    allowAdmin(fake);
    const { redirectedTo } = await run(() => setClientActiveAction(IDLE_ACTIVE, form([], true)));
    expect(redirectedTo).toBe(`/clientes/${CLIENT}?aviso=reativado`);
    expect(fake.rpcCalls[0].args).toMatchObject({ p_active: true });
  });

  it("já estava na situação pedida (outra pessoa fez antes): não escreve e atualiza a tela com o aviso", async () => {
    const inactive = createFakeSupabase({ tables: clientsTable(false) });
    allowAdmin(inactive);
    const first = await run(() => setClientActiveAction(IDLE_ACTIVE, form()));
    expect(first.redirectedTo).toBe(`/clientes/${CLIENT}?aviso=ja-inativo`);
    expect(inactive.rpcCalls).toHaveLength(0);

    const active = createFakeSupabase({ tables: clientsTable(true) });
    allowAdmin(active);
    const second = await run(() => setClientActiveAction(IDLE_ACTIVE, form([], true)));
    expect(second.redirectedTo).toBe(`/clientes/${CLIENT}?aviso=ja-ativo`);
    expect(active.rpcCalls).toHaveLength(0);
  });

  it("a situação vem do banco, não do formulário: campo 'clientActive' forjado não pula a escrita", async () => {
    const fake = createFakeSupabase({
      tables: clientsTable(true),
      rpc: { set_client_active: () => ok(writeRow({ active: false })) },
    });
    allowAdmin(fake);
    const { redirectedTo } = await run(() => setClientActiveAction(IDLE_ACTIVE, form([["clientActive", "false"]])));
    expect(redirectedTo).toBe(`/clientes/${CLIENT}?aviso=inativado`);
    expect(fake.rpcCalls).toHaveLength(1);
  });

  it("reativar sem sócio ativo (CLIENT_WITHOUT_PARTNER): o estado leva a chave do bloqueio e a mensagem da UI", async () => {
    const fake = createFakeSupabase({
      tables: clientsTable(false),
      rpc: { set_client_active: () => fail(dbError("P0001", "CLIENT_WITHOUT_PARTNER")) },
    });
    allowAdmin(fake);
    const { state, redirectedTo } = await run(() => setClientActiveAction(IDLE_ACTIVE, form([], true)));
    expect(redirectedTo).toBeNull();
    expect(state).toMatchObject({
      status: "error",
      error: {
        code: "RULE_VIOLATION",
        hint: "CLIENT_WITHOUT_PARTNER",
        message: "Este cliente não tem sócio ativo. Indique pelo menos um sócio na edição e tente reativar de novo.",
      },
      supportCode: null,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("conflito de versão: STALE_VERSION com a versão atual; nada é sobrescrito", async () => {
    const fake = createFakeSupabase({
      tables: clientsTable(true),
      rpc: { set_client_active: () => fail(dbError("P0001", "STALE_VERSION", { current_updated_at: NEW_VERSION })) },
    });
    allowAdmin(fake);
    const { state, redirectedTo } = await run(() => setClientActiveAction(IDLE_ACTIVE, form()));
    expect(redirectedTo).toBeNull();
    expect(state).toMatchObject({
      status: "error",
      error: { code: "CONFLICT", hint: "STALE_VERSION", details: { hint: "STALE_VERSION", currentUpdatedAt: NEW_VERSION } },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("cliente que não existe ou o RLS esconde: 'Este cadastro não está mais disponível.', sem escrever", async () => {
    const fake = createFakeSupabase({ tables: clientsTable(null) });
    allowAdmin(fake);
    const { state } = await run(() => setClientActiveAction(IDLE_ACTIVE, form()));
    expect(state).toMatchObject({
      status: "error",
      error: { code: "NOT_FOUND", message: "Este cadastro não está mais disponível." },
    });
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("NOT_FOUND vindo do banco (apagado entre a leitura e a escrita): mesma mensagem", async () => {
    const fake = createFakeSupabase({
      tables: clientsTable(true),
      rpc: { set_client_active: () => fail(dbError("P0002", "NOT_FOUND")) },
    });
    allowAdmin(fake);
    const { state } = await run(() => setClientActiveAction(IDLE_ACTIVE, form()));
    expect(state).toMatchObject({
      status: "error",
      error: { code: "NOT_FOUND", message: "Este cadastro não está mais disponível." },
    });
  });

  it("erro inesperado: mensagem fixa, código de suporte = correlation id, log no servidor e NADA do banco (sem cause)", async () => {
    const fake = createFakeSupabase({
      tables: clientsTable(true),
      rpc: { set_client_active: () => fail({ code: "XX000", message: 'relation "clients" exploded: segredo-interno' }) },
    });
    allowAdmin(fake);
    const { state } = await run(() => setClientActiveAction(IDLE_ACTIVE, form()));
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
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("falha ao ler a situação do cliente: mesmo tratamento, sem escrever", async () => {
    const fake = createFakeSupabase({ tables: { clients: () => fail({ code: "XX000", message: "segredo-interno" }) } });
    allowAdmin(fake);
    const { state } = await run(() => setClientActiveAction(IDLE_ACTIVE, form()));
    expect(state).toMatchObject({ status: "error", error: { code: "UNEXPECTED" }, supportCode: CORRELATION });
    expect(JSON.stringify(state)).not.toContain("segredo-interno");
    expect(fake.rpcCalls).toHaveLength(0);
  });
});
