import { beforeAll, describe, expect, it } from "vitest";

import {
  CLIENTS_PATH,
  MISSING_ID,
  PARTNERS_PATH,
  SEED,
  cadSessions,
  callAction,
  clientFields,
  createClient,
  createPartner,
  errorOf,
  flashOf,
  idAfter,
  isForbidden,
  randomCnpj,
  randomCpf,
  runSuffix,
  setClientActive,
  setPartnerActive,
  versionAt,
  type CadRole,
} from "./support/cadastros";
import { CookieJar, type Session } from "./support/http";
import { getPage } from "./support/pages";

/**
 * CAD-001 · Clientes, por HTTP e sem navegador (E7 parte 2). Cobre CA-01/CA-05/CA-06/CA-07/CA-10
 * (pela interface), CA-16, CA-18, CA-19 e CA-20: acesso por papel, Server Actions permitidas ×
 * negadas, criar e editar, documento repetido, aviso de nome parecido com confirmação, sócios
 * indicados (1/n), conflito de versão, inativar e reativar (inclusive sem sócio, que é bloqueado).
 *
 * O banco semeado só cresce: os clientes e sócios criados aqui levam um sufixo único, os sócios do
 * seed não recebem cliente novo e as listas são sempre filtradas pelo sufixo (ou pelo nome do seed).
 */

const run = runSuffix();
const NEW = `${CLIENTS_PATH}/novo`;
const MODEL = SEED.clientModel;
/** Frases exatas das recusas (domínio e Server Actions): trocar a frase deve quebrar o teste. */
const NO_PARTNER = "Escolha pelo menos um sócio. Todo cliente ativo precisa de um.";
const NO_VERSION = "Não foi possível identificar a versão do cadastro. Atualize a página e tente novamente.";
const NOT_AVAILABLE = "Este cadastro não está mais disponível.";
const INACTIVE_SEED = SEED.clientInactive;

let sessions: Record<CadRole, Session>;
let admin: Session;
let partnerX = "";
let partnerY = "";
let partnerZ = "";
let partnerInactive = "";

const listAt = (session: Session, query: string) => getPage(session.jar, `${CLIENTS_PATH}?${query}`);
const q = (value: string) => `q=${encodeURIComponent(value)}`;
/** Clientes listados (uma ligação por linha). A busca repete o texto digitado na página, então ele não prova ausência. */
const clientIds = (page: { html: string }) => [...new Set([...page.html.matchAll(/href="\/clientes\/([0-9a-f-]{36})"/g)].map((match) => match[1]))];

beforeAll(async () => {
  sessions = cadSessions();
  admin = sessions.admin;
  partnerX = await createPartner(admin, `Sócio Cli X ${run}`);
  partnerY = await createPartner(admin, `Sócio Cli Y ${run}`);
  partnerZ = await createPartner(admin, `Sócio Cli Z ${run}`);
  partnerInactive = await createPartner(admin, `Sócio Cli Inativo ${run}`);
  expect(flashOf(await setPartnerActive(admin, partnerInactive, false))).toBe("inativado");
});

describe("acesso às páginas de cliente (matriz do plano, seção 6)", () => {
  it("sem sessão, todas as páginas redirecionam ao login", async () => {
    for (const path of [CLIENTS_PATH, NEW, `${CLIENTS_PATH}/${MODEL}`, `${CLIENTS_PATH}/${MODEL}/editar`]) {
      const page = await getPage(new CookieJar(), path);
      expect(page.status, path).toBe(307);
      expect(page.location, path).toMatch(/^\/login/);
    }
  });

  it.each(["admin", "operator", "viewer"] as const)("%s lê a lista e o detalhe; 'Novo cliente' e os botões só para o Administrador", async (role) => {
    const isAdmin = role === "admin";
    const list = await listAt(sessions[role], q("Cliente Modelo"));
    expect(list.status).toBe(200);
    expect(list.text).toContain("Cliente Modelo Ltda");
    expect(list.text).toContain("R$ 1.500,00");
    expect(list.text).toContain("2 sócios");
    expect(/Novo cliente/.test(list.text)).toBe(isAdmin);

    const detail = await getPage(sessions[role].jar, `${CLIENTS_PATH}/${MODEL}`);
    expect(detail.status).toBe(200);
    expect(detail.text).toContain("Cliente Modelo Ltda");
    expect(detail.text).toContain("Sócio Exemplo A");
    expect(detail.text).toContain("Sócio Exemplo B");
    expect(detail.text).toContain("divisão igual: 1/2");
    expect(detail.html.includes(`${CLIENTS_PATH}/${MODEL}/editar`)).toBe(isAdmin);
    expect(/Inativar cliente/.test(detail.text)).toBe(isAdmin);
  });

  it.each(["operator", "viewer"] as const)("%s recebe 'Sem permissão' em /novo e /editar, sem formulário", async (role) => {
    for (const path of [NEW, `${CLIENTS_PATH}/${MODEL}/editar`]) {
      const page = await getPage(sessions[role].jar, path);
      expect(page.text, `${role} ${path}`).toContain("Sem permissão");
      expect(page.html, `${role} ${path}`).not.toContain('name="legalName"');
    }
  });

  it("Sócio não vê cliente nem formulário (só a tela de acesso ainda não disponível)", async () => {
    for (const path of [CLIENTS_PATH, NEW, `${CLIENTS_PATH}/${MODEL}`, `${CLIENTS_PATH}/${MODEL}/editar`]) {
      const page = await getPage(sessions.partner.jar, path);
      expect(page.text, path).toContain("Acesso de sócio ainda não disponível");
      expect(page.text, path).not.toContain("Cliente Modelo Ltda");
      expect(page.html, path).not.toContain('name="legalName"');
    }
  });

  it("Administrador abre o formulário de novo (só sócios ativos como escolha) e o de edição com a versão", async () => {
    const form = await getPage(admin.jar, NEW);
    expect(form.html).toContain('name="legalName"');
    expect(form.html).toContain('name="monthlyValue"');
    expect(form.text).toContain("Sem documento");
    expect(form.html).toContain(`value="${partnerX}"`);
    expect(form.html).not.toContain(`value="${partnerInactive}"`);

    const edit = await getPage(admin.jar, `${CLIENTS_PATH}/${MODEL}/editar`);
    expect(edit.html).toContain("Cliente Modelo Ltda");
    expect(edit.html).toContain('name="expectedUpdatedAt"');
  });

  it("cliente inativo: o Operador vê a faixa e a orientação; o Administrador, 'Reativar cliente'", async () => {
    const asOperator = await getPage(sessions.operator.jar, `${CLIENTS_PATH}/${INACTIVE_SEED}`);
    expect(asOperator.text).toContain("Cliente inativo");
    expect(asOperator.text).toContain("Peça a um Administrador");
    expect(asOperator.text).not.toContain("Reativar cliente");
    const asAdmin = await getPage(admin.jar, `${CLIENTS_PATH}/${INACTIVE_SEED}`);
    expect(asAdmin.text).toContain("Cliente inativo");
    expect(asAdmin.text).toContain("Reativar cliente");
  });

  it("cliente inexistente ou com id inválido: 'Registro não encontrado' (detalhe e edição)", async () => {
    for (const path of [`${CLIENTS_PATH}/${MISSING_ID}`, `${CLIENTS_PATH}/nao-e-uuid`, `${CLIENTS_PATH}/${MISSING_ID}/editar`]) {
      const page = await getPage(admin.jar, path);
      expect(page.html, path).toContain("Registro não encontrado");
    }
  });
});

describe("lista: busca, filtros e parâmetros hostis (CA-19)", () => {
  it("busca por nome, filtro de situação e de sócio", async () => {
    const byName = await listAt(admin, q("Modelo"));
    expect(byName.text).toContain("Cliente Modelo Ltda");
    expect(byName.text).not.toContain("Comércio Fictício");

    const inactive = await listAt(admin, "status=inativos&" + q("Cliente Antigo"));
    expect(inactive.text).toContain("Cliente Antigo Ltda");
    expect(inactive.text).not.toContain("Cliente Modelo Ltda");
    const activeOnly = await listAt(admin, q("Cliente Antigo"));
    expect(activeOnly.text).not.toContain("Cliente Antigo Ltda");
    const all = await listAt(admin, "status=todos&" + q("Cliente Antigo"));
    expect(all.text).toContain("Cliente Antigo Ltda");

    const bySocio = await listAt(admin, `socio=${SEED.partnerC}&${q("Fictício")}`);
    expect(bySocio.text).toContain("Comércio Fictício Ltda");
    expect(bySocio.text).toContain("Sócio Exemplo C");
    const bySocioOther = await listAt(admin, `socio=${SEED.partnerC}&${q("Modelo")}`);
    expect(bySocioOther.text).not.toContain("Cliente Modelo Ltda");
  });

  it("busca pelo documento (com e sem pontuação) e sem resultado", async () => {
    const document = randomCnpj();
    await createClient(admin, { name: `Busca Doc ${run}`, documentType: "CNPJ", document, partnerIds: [partnerX] });
    const punctuated = await listAt(admin, q(document));
    expect(punctuated.text).toContain(`Busca Doc ${run}`);
    const plain = await listAt(admin, q(document.replace(/\D/g, "")));
    expect(plain.text).toContain(`Busca Doc ${run}`);

    const none = await listAt(admin, q(`zzz-inexistente-${run}`));
    expect(none.text).toMatch(/Nenhum cliente|Limpar filtros/);
  });

  it("parâmetros inválidos caem no padrão e a página além do fim redireciona à lista", async () => {
    const hostile = await listAt(admin, "socio=nao-uuid&status=xyz&pagina=abc&por=7&" + q("Cliente Modelo"));
    expect(hostile.status).toBe(200);
    expect(hostile.text).toContain("Cliente Modelo Ltda");
    const beyond = await listAt(admin, "pagina=99");
    expect(beyond.html).toContain("NEXT_REDIRECT;replace;/clientes;307");
    expect(beyond.html).toContain("__next-page-redirect");
  });
});

describe("Server Actions de cliente: permitido × negado (CA-16)", () => {
  const deniedName = `Negado Cliente ${run}`;

  it("sem sessão, o POST direto não grava e vai ao login", async () => {
    const result = await callAction(null, NEW, "saveClientAction", clientFields({ name: `${deniedName} anon`, partnerIds: [partnerX] }));
    expect(result.failed).toBe(false);
    expect(`${result.status} ${result.location ?? ""} ${result.text}`).toMatch(/\/login/);
  });

  it.each(["operator", "viewer", "partner"] as const)("%s: saveClientAction e setClientActiveAction são negadas", async (role) => {
    const save = await callAction(sessions[role], NEW, "saveClientAction", clientFields({ name: `${deniedName} ${role}`, partnerIds: [partnerX] }));
    expect(isForbidden(save), `${role} save: ${save.status} ${save.code}`).toBe(true);

    const version = await versionAt(admin, `${CLIENTS_PATH}/${MODEL}/editar`);
    const toggle = await callAction(sessions[role], `${CLIENTS_PATH}/${MODEL}`, "setClientActiveAction", [
      ["id", MODEL],
      ["active", "false"],
      ["expectedUpdatedAt", version],
    ]);
    expect(isForbidden(toggle), `${role} toggle: ${toggle.status} ${toggle.code}`).toBe(true);
  });

  it("nada foi gravado pelos negados; o cliente do seed segue ativo", async () => {
    const list = await listAt(admin, "status=todos&" + q(deniedName));
    expect(clientIds(list)).toHaveLength(0);
    const detail = await getPage(admin.jar, `${CLIENTS_PATH}/${MODEL}`);
    expect(detail.text).not.toContain("Cliente inativo");
  });
});

describe("criar cliente: documento e mensalidade (CA-04, CA-05, CA-10)", () => {
  it("cria com CNPJ, com CPF e sem documento; o detalhe mostra os dados, o valor e a divisão", async () => {
    const cnpj = randomCnpj();
    const company = await callAction(
      admin,
      NEW,
      "saveClientAction",
      clientFields({ name: `Cliente CNPJ E2E ${run}`, trade: `Fantasia E2E ${run}`, documentType: "CNPJ", document: cnpj, partnerIds: [partnerX, partnerY], notes: "Observação fictícia" }),
    );
    expect(flashOf(company)).toBe("criado");
    const companyId = idAfter(company.location, "/clientes");
    const detail = await getPage(admin.jar, `${CLIENTS_PATH}/${companyId}?aviso=criado`);
    expect(detail.text).toContain("Cliente cadastrado");
    expect(detail.text).toContain(cnpj);
    expect(detail.text).toContain("1.234,56");
    expect(detail.text).toContain("divisão igual: 1/2");
    expect(detail.text).toContain(`Sócio Cli X ${run}`);
    expect(detail.text).toContain(`Sócio Cli Y ${run}`);

    const cpf = randomCpf();
    const person = await createClient(admin, { name: `Pessoa E2E ${run}`, documentType: "CPF", document: cpf, partnerIds: [partnerX] });
    const personDetail = await getPage(admin.jar, `${CLIENTS_PATH}/${person}`);
    expect(personDetail.text).toContain(cpf);
    // O tipo no cabeçalho é só o do documento; "CPF" sozinho já aparece na linha "Documento",
    // então só o prefixo para leitor de tela prova que o tipo está no cabeçalho.
    expect(personDetail.text).toContain("Tipo de documento: CPF");
    expect(personDetail.text).not.toContain("Pessoa física");
    expect(detail.text).toContain("Tipo de documento: CNPJ");
    expect(detail.text).not.toContain("Empresa");

    const noDoc = await createClient(admin, { name: `Sem Documento E2E ${run}`, partnerIds: [partnerX] });
    expect(noDoc).toMatch(/^[0-9a-f-]{36}$/);
    const noDocDetail = await getPage(admin.jar, `${CLIENTS_PATH}/${noDoc}`);
    expect(noDocDetail.text).not.toContain("Tipo de documento");
  });

  it("CNPJ alfanumérico válido é aceito, e o mesmo número em minúsculas é documento repetido", async () => {
    const document = randomCnpj(true);
    const id = await createClient(admin, { name: `Alfa E2E ${run}`, documentType: "CNPJ", document, partnerIds: [partnerX] });
    const detail = await getPage(admin.jar, `${CLIENTS_PATH}/${id}`);
    expect(detail.text).toContain(document);

    const lower = await callAction(
      admin,
      NEW,
      "saveClientAction",
      clientFields({ name: `Alfa Minúscula ${run}`, documentType: "CNPJ", document: document.toLowerCase(), partnerIds: [partnerX] }),
    );
    expect(lower.failed).toBe(true);
    expect(lower.text).toContain("DOCUMENT_TAKEN");
  });

  it("documentos inválidos são recusados com VALIDATION e nada é gravado", async () => {
    const cases: Array<[string, "CPF" | "CNPJ", string]> = [
      ["CPF com dígitos repetidos", "CPF", "111.111.111-11"],
      ["CNPJ com dígito verificador errado", "CNPJ", "12.ABC.345/01DE-00"],
      ["tipo CPF sem número", "CPF", ""],
    ];
    for (const [label, documentType, document] of cases) {
      const result = await callAction(admin, NEW, "saveClientAction", clientFields({ name: `Inválido ${run}`, documentType, document, partnerIds: [partnerX] }));
      expect(result.failed, label).toBe(true);
      expect(result.code, label).toBe("VALIDATION");
      expect(result.location, label).toBeNull();
    }
    const list = await listAt(admin, "status=todos&" + q(`Inválido ${run}`));
    expect(clientIds(list)).toHaveLength(0);
  });

  it("documento repetido (de cliente ativo e de inativo) é recusado e mostra o dono", async () => {
    const cnpj = randomCnpj();
    const ownerId = await createClient(admin, { name: `Dono do CNPJ ${run}`, documentType: "CNPJ", document: cnpj, partnerIds: [partnerX] });
    const taken = await callAction(admin, NEW, "saveClientAction", clientFields({ name: `Repetido ${run}`, documentType: "CNPJ", document: cnpj, partnerIds: [partnerX] }));
    expect(taken.failed).toBe(true);
    expect(taken.text).toContain("DOCUMENT_TAKEN");
    expect(taken.text).toContain(`Dono do CNPJ ${run}`);
    expect(taken.text).toContain(ownerId);

    const cpf = randomCpf();
    const inactiveOwner = await createClient(admin, { name: `Dono do CPF ${run}`, documentType: "CPF", document: cpf, partnerIds: [partnerX] });
    expect(flashOf(await setClientActive(admin, inactiveOwner, false))).toBe("inativado");
    const takenInactive = await callAction(admin, NEW, "saveClientAction", clientFields({ name: `Repetido CPF ${run}`, documentType: "CPF", document: cpf, partnerIds: [partnerX] }));
    expect(takenInactive.failed).toBe(true);
    expect(takenInactive.text).toContain("DOCUMENT_TAKEN");
    expect(takenInactive.text).toContain(inactiveOwner);
  });

  it("mensalidade: '1.234,56' e '99' são aceitas; formatos e valores inválidos são recusados", async () => {
    for (const value of ["1.234,56", "99"]) {
      const id = await createClient(admin, { name: `Valor ${value} ${run}`, monthlyValue: value, partnerIds: [partnerX] });
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    }
    const list = await listAt(admin, q(`Valor 1.234,56 ${run}`));
    expect(list.text).toContain("1.234,56");
    for (const value of ["1234.56", "0", "0,00", "-5", "-1.234,56", "abc", ""]) {
      const result = await callAction(admin, NEW, "saveClientAction", clientFields({ name: `Valor Ruim ${run}`, monthlyValue: value, partnerIds: [partnerX] }));
      expect(result.failed, `valor "${value}"`).toBe(true);
      expect(result.code, `valor "${value}"`).toBe("VALIDATION");
      expect(result.location, `valor "${value}"`).toBeNull();
    }
    const bad = await listAt(admin, "status=todos&" + q(`Valor Ruim ${run}`));
    expect(clientIds(bad)).toHaveLength(0);
  });

  it("sócios: sem nenhum, inexistente, inativo e id inválido são recusados pelo motivo certo (código, campo e frase); nome em branco também", async () => {
    // [rótulo, sócios, nome, código, campo, frase exata]
    const attempts: Array<[string, string[], string, string, string, string]> = [
      ["sem sócio", [], `Sem Sócio ${run}`, "VALIDATION", "partnerIds", NO_PARTNER],
      ["sócio inexistente", [MISSING_ID], `Sócio Fantasma ${run}`, "NOT_FOUND", "partnerIds", "O sócio escolhido não foi encontrado. Atualize a página e escolha de novo."],
      ["id de sócio inválido", ["nao-uuid"], `Sócio Lixo ${run}`, "VALIDATION", "partnerIds", "Identificador de sócio inválido."],
      ["nome em branco", [partnerX], "   ", "VALIDATION", "legalName", "Informe o nome ou a razão social."],
    ];
    for (const [label, partnerIds, name, code, field, message] of attempts) {
      const result = await callAction(admin, NEW, "saveClientAction", clientFields({ name, partnerIds }));
      expect(result.failed, label).toBe(true);
      expect(result.location, label).toBeNull();
      const error = errorOf(result);
      expect(error?.code, label).toBe(code);
      expect(error?.message, label).toBe(message);
      expect(error?.fieldErrors[field], `${label}: erro no campo ${field}`).toBe(message);
    }
    const inactive = await callAction(admin, NEW, "saveClientAction", clientFields({ name: `Sócio Inativo ${run}`, partnerIds: [partnerInactive] }));
    expect(inactive.failed).toBe(true);
    expect(inactive.text).toContain("PARTNER_INACTIVE");
    expect(inactive.text).toContain("partnerIds");
    expect(errorOf(inactive)?.code).toBe("RULE_VIOLATION");
    expect(errorOf(inactive)?.message).toBe(`O sócio Sócio Cli Inativo ${run} foi inativado e não pode mais ser indicado. Desmarque-o ou escolha outro.`);
    expect(errorOf(inactive)?.fieldErrors.partnerIds).toBe(errorOf(inactive)?.message);
    // Nenhum destes envios gravou cliente.
    const none = await listAt(admin, "status=todos&" + q(`Sócio Inativo ${run}`));
    expect(clientIds(none)).toHaveLength(0);
  });
});

describe("aviso de nome parecido e confirmação (CA-06)", () => {
  const base = `Padaria Fictícia ${run}`;
  let baseId = "";

  it("nome parecido sem documento: avisa com o cliente parecido e não grava; reenviar com confirmação grava", async () => {
    baseId = await createClient(admin, { name: base, partnerIds: [partnerX] });
    const similar = `padaria ficticia ${run}`;

    const warned = await callAction(admin, NEW, "saveClientAction", clientFields({ name: similar, partnerIds: [partnerX] }));
    expect(warned.failed).toBe(true);
    expect(warned.text).toContain("POSSIBLE_DUPLICATE");
    expect(warned.text).toContain(baseId);
    expect(warned.location).toBeNull();
    const unchanged = await listAt(admin, q(similar));
    expect(unchanged.text).toMatch(/1 cliente encontrado/);

    const confirmed = await callAction(admin, NEW, "saveClientAction", clientFields({ name: similar, partnerIds: [partnerX], acknowledged: [baseId] }));
    expect(flashOf(confirmed)).toBe("criado");
    const both = await listAt(admin, q(similar));
    expect(both.text).toMatch(/2 clientes encontrados/);
  });

  it("apelido igual ao nome de outro cliente: avisa (SAME_ALIAS) e grava depois da confirmação, mostrando o apelido", async () => {
    const input = { name: `Nome Distinto ${run}`, partnerIds: [partnerX], aliases: [["NAME", base]] as Array<["NAME", string]> };
    const warned = await callAction(admin, NEW, "saveClientAction", clientFields(input));
    expect(warned.failed).toBe(true);
    expect(warned.text).toContain("POSSIBLE_DUPLICATE");
    expect(warned.text).toContain("SAME_ALIAS");
    expect(warned.location).toBeNull();

    const duplicates = await listAt(admin, q(`padaria ficticia ${run}`));
    const ids = [...duplicates.html.matchAll(/\/clientes\/([0-9a-f-]{36})/g)].map((match) => match[1]);
    const confirmed = await callAction(admin, NEW, "saveClientAction", clientFields({ ...input, acknowledged: [...new Set([baseId, ...ids])] }));
    expect(flashOf(confirmed)).toBe("criado");
    const detail = await getPage(admin.jar, `${CLIENTS_PATH}/${idAfter(confirmed.location, "/clientes")}`);
    expect(detail.text).toContain(base);
    expect(detail.text).toContain("Apelidos");
  });
});

describe("editar cliente, sócios indicados e conflito de versão (CA-07, CA-18)", () => {
  const cnpj = randomCnpj();
  const name = `Editável E2E ${run}`;
  let id = "";
  const form = (partnerIds: string[], version: string, extra: Partial<Parameters<typeof clientFields>[0]> = {}) =>
    clientFields({ name, documentType: "CNPJ", document: cnpj, partnerIds, ...extra }, { id, version });
  const editPath = () => `${CLIENTS_PATH}/${id}/editar`;

  beforeAll(async () => {
    id = await createClient(admin, { name, documentType: "CNPJ", document: cnpj, partnerIds: [partnerX] });
  });

  it("indica três sócios: o detalhe mostra 1/3; depois só um: 1/1, e os retirados saem", async () => {
    const three = await callAction(admin, editPath(), "saveClientAction", form([partnerY, partnerX, partnerZ], await versionAt(admin, editPath()), { reason: "Troca fictícia" }));
    expect(flashOf(three)).toBe("salvo");
    const detailThree = await getPage(admin.jar, `${CLIENTS_PATH}/${id}`);
    expect(detailThree.text).toContain("divisão igual: 1/3");
    expect(detailThree.text).toContain("3 sócios");
    for (const letter of ["X", "Y", "Z"]) expect(detailThree.text).toContain(`Sócio Cli ${letter} ${run}`);

    const one = await callAction(admin, editPath(), "saveClientAction", form([partnerY], await versionAt(admin, editPath())));
    expect(flashOf(one)).toBe("salvo");
    const detailOne = await getPage(admin.jar, `${CLIENTS_PATH}/${id}`);
    expect(detailOne.text).toContain(`Sócio Cli Y ${run}`);
    expect(detailOne.text).toContain("divisão: 1/1");
    expect(detailOne.text).not.toContain(`Sócio Cli X ${run}`);
    expect(detailOne.text).not.toContain(`Sócio Cli Z ${run}`);
  });

  it("retirar o último sócio de cliente ativo é recusado", async () => {
    const result = await callAction(admin, editPath(), "saveClientAction", form([], await versionAt(admin, editPath())));
    expect(result.failed).toBe(true);
    expect(result.location).toBeNull();
    const error = errorOf(result);
    expect(error?.code).toBe("VALIDATION");
    expect(error?.message).toBe(NO_PARTNER);
    expect(error?.fieldErrors.partnerIds).toBe(NO_PARTNER);
    const detail = await getPage(admin.jar, `${CLIENTS_PATH}/${id}`);
    expect(detail.text).toContain(`Sócio Cli Y ${run}`);
  });

  it("versão antiga: conflito com a versão atual e nada gravado; sem versão também é recusado", async () => {
    const stale = await versionAt(admin, editPath());
    expect(flashOf(await callAction(admin, editPath(), "saveClientAction", form([partnerY], stale, { notes: "Primeira" })))).toBe("salvo");
    const conflict = await callAction(admin, editPath(), "saveClientAction", form([partnerY], stale, { notes: "Sobrescrito" }));
    expect(conflict.failed).toBe(true);
    expect(conflict.text).toContain("STALE_VERSION");
    expect(conflict.text).toContain("currentUpdatedAt");
    expect(conflict.location).toBeNull();
    const detail = await getPage(admin.jar, `${CLIENTS_PATH}/${id}`);
    expect(detail.text).toContain("Primeira");
    expect(detail.text).not.toContain("Sobrescrito");

    const noVersion = await callAction(admin, editPath(), "saveClientAction", clientFields({ name, documentType: "CNPJ", document: cnpj, partnerIds: [partnerY] }, { id, version: "" }).filter(([key]) => key !== "expectedUpdatedAt"));
    expect(noVersion.failed).toBe(true);
    expect(noVersion.location).toBeNull();
    expect(errorOf(noVersion)?.code).toBe("VALIDATION");
    expect(errorOf(noVersion)?.message).toBe(NO_VERSION);
  });

  it("edita documento e apelidos; apelido-documento igual ao documento de outro cliente é recusado", async () => {
    const newCpf = randomCpf();
    const aliasName = `Apelido Edição ${run}`;
    const edited = await callAction(
      admin,
      editPath(),
      "saveClientAction",
      clientFields({ name, documentType: "CPF", document: newCpf, partnerIds: [partnerY], aliases: [["NAME", aliasName], ["DOCUMENT", randomCpf()]] }, { id, version: await versionAt(admin, editPath()) }),
    );
    expect(flashOf(edited)).toBe("salvo");
    const detail = await getPage(admin.jar, `${CLIENTS_PATH}/${id}`);
    expect(detail.text).toContain(newCpf);
    expect(detail.text).toContain(aliasName);

    const otherCnpj = randomCnpj();
    await createClient(admin, { name: `Outro com CNPJ ${run}`, documentType: "CNPJ", document: otherCnpj, partnerIds: [partnerX] });
    const taken = await callAction(
      admin,
      editPath(),
      "saveClientAction",
      clientFields({ name, documentType: "CPF", document: newCpf, partnerIds: [partnerY], aliases: [["DOCUMENT", otherCnpj]] }, { id, version: await versionAt(admin, editPath()) }),
    );
    expect(taken.failed).toBe(true);
    expect(taken.code).toBe("CONFLICT");
  });

  it("id inexistente ou inválido na edição é recusado", async () => {
    const version = await versionAt(admin, editPath());
    const ghost = await callAction(admin, editPath(), "saveClientAction", clientFields({ name: "Fantasma", partnerIds: [partnerY] }, { id: MISSING_ID, version }));
    expect(ghost.failed).toBe(true);
    expect(ghost.text).toContain("NOT_FOUND");
    expect(errorOf(ghost)?.code).toBe("NOT_FOUND");
    expect(errorOf(ghost)?.message).toBe(NOT_AVAILABLE);
    const invalid = await callAction(admin, editPath(), "saveClientAction", clientFields({ name: "Fantasma", partnerIds: [partnerY] }, { id: "xyz", version }));
    expect(invalid.failed).toBe(true);
    expect(invalid.location).toBeNull();
    expect(errorOf(invalid)?.code).toBe("VALIDATION");
    expect(errorOf(invalid)?.message).toBe("Identificador inválido.");
  });
});

describe("inativar e reativar cliente (CA-07, CA-18)", () => {
  let id = "";

  beforeAll(async () => {
    id = await createClient(admin, { name: `Ciclo E2E ${run}`, partnerIds: [partnerX] });
  });

  it("inativa; o detalhe mostra a faixa e 'Reativar'; a lista passa de Ativos para Inativos", async () => {
    const before = await versionAt(admin, `${CLIENTS_PATH}/${id}/editar`);
    const off = await setClientActive(admin, id, false, [["reason", "Motivo fictício"]]);
    expect(flashOf(off)).toBe("inativado");
    const detail = await getPage(admin.jar, `${CLIENTS_PATH}/${id}?aviso=inativado`);
    expect(detail.text).toContain("Cliente inativado");
    expect(detail.text).toContain("Cliente inativo");
    expect(detail.text).toContain("Reativar cliente");
    const inactive = await listAt(admin, "status=inativos&" + q(`Ciclo E2E ${run}`));
    expect(inactive.text).toContain(`Ciclo E2E ${run}`);
    const active = await listAt(admin, q(`Ciclo E2E ${run}`));
    expect(active.text).not.toMatch(/1 cliente encontrado/);

    const again = await setClientActive(admin, id, false);
    expect(flashOf(again)).toBe("ja-inativo");

    const stale = await callAction(admin, `${CLIENTS_PATH}/${id}`, "setClientActiveAction", [
      ["id", id],
      ["active", "true"],
      ["expectedUpdatedAt", before],
    ]);
    expect(stale.failed).toBe(true);
    expect(stale.text).toContain("STALE_VERSION");
  });

  it("reativa; repetir é 'já ativo'", async () => {
    expect(flashOf(await setClientActive(admin, id, true))).toBe("reativado");
    expect(flashOf(await setClientActive(admin, id, true))).toBe("ja-ativo");
  });

  it("reativar cliente sem sócio ativo é bloqueado e ele segue inativo (CA-07)", async () => {
    const result = await setClientActive(admin, INACTIVE_SEED, true);
    expect(result.failed).toBe(true);
    expect(result.text).toContain("CLIENT_WITHOUT_PARTNER");
    expect(result.text).toContain("RULE_VIOLATION");
    expect(result.location).toBeNull();
    const detail = await getPage(admin.jar, `${CLIENTS_PATH}/${INACTIVE_SEED}`);
    expect(detail.text).toContain("Cliente inativo");
  });

  it("entradas inválidas: active fora de true/false, inexistente, id inválido e sem versão", async () => {
    const version = await versionAt(admin, `${CLIENTS_PATH}/${id}/editar`);
    const invalid = await callAction(admin, `${CLIENTS_PATH}/${id}`, "setClientActiveAction", [["id", id], ["active", "talvez"], ["expectedUpdatedAt", version]]);
    expect(invalid.code).toBe("VALIDATION");
    expect(errorOf(invalid)?.message).toBe("Não foi possível identificar a ação pedida. Atualize a página e tente novamente.");
    const missing = await callAction(admin, `${CLIENTS_PATH}/${id}`, "setClientActiveAction", [["id", MISSING_ID], ["active", "false"], ["expectedUpdatedAt", version]]);
    expect(missing.text).toContain("NOT_FOUND");
    expect(errorOf(missing)?.code).toBe("NOT_FOUND");
    expect(errorOf(missing)?.message).toBe(NOT_AVAILABLE);
    const notUuid = await callAction(admin, `${CLIENTS_PATH}/${id}`, "setClientActiveAction", [["id", "xyz"], ["active", "false"], ["expectedUpdatedAt", version]]);
    expect(notUuid.failed).toBe(true);
    expect(errorOf(notUuid)?.code).toBe("VALIDATION");
    expect(errorOf(notUuid)?.message).toBe("Identificador do cliente inválido.");
    const noVersion = await callAction(admin, `${CLIENTS_PATH}/${id}`, "setClientActiveAction", [["id", id], ["active", "false"]]);
    expect(noVersion.failed).toBe(true);
    expect(noVersion.location).toBeNull();
    expect(errorOf(noVersion)?.code).toBe("VALIDATION");
    expect(errorOf(noVersion)?.message).toBe(NO_VERSION);
  });
});

describe("ponta com sócios (CA-02)", () => {
  it("o detalhe do sócio leva à lista de clientes dele, e o sócio indicado segue bloqueado", async () => {
    const partnerId = await createPartner(admin, `Sócio Ponta ${run}`);
    const clientId = await createClient(admin, { name: `Cliente da Ponta ${run}`, partnerIds: [partnerId] });
    const detail = await getPage(admin.jar, `${PARTNERS_PATH}/${partnerId}`);
    expect(detail.html).toContain(`/clientes?socio=${partnerId}`);
    expect(detail.text).toMatch(/Ver (todos os )?clientes deste sócio/);

    const filtered = await getPage(admin.jar, `${CLIENTS_PATH}?socio=${partnerId}&status=todos`);
    expect(filtered.text).toContain(`Cliente da Ponta ${run}`);
    expect(filtered.text).not.toContain("Cliente Modelo Ltda");

    const blocked = await setPartnerActive(admin, partnerId, false);
    expect(blocked.failed).toBe(true);
    expect(blocked.text).toContain("PARTNER_HAS_CLIENTS");

    expect(flashOf(await setClientActive(admin, clientId, false))).toBe("inativado");
    const stillIndicated = await getPage(admin.jar, `${CLIENTS_PATH}?socio=${partnerId}&status=todos`);
    expect(stillIndicated.text).toContain(`Cliente da Ponta ${run}`);
  });
});
