import { randomInt } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import {
  PARTNERS_PATH,
  CLIENTS_PATH,
  cadSessions,
  callAction,
  createClient,
  createPartner,
  createReceiver,
  receiverFields,
  flashOf,
  randomCpf,
  runSuffix,
  versionAt,
  type CadRole,
} from "./support/cadastros";
import { CookieJar, type Session } from "./support/http";
import { getPage } from "./support/pages";

/**
 * CAD-001 · Apelidos (lista consolidada e somente leitura em /configuracoes/aliases), por HTTP e
 * sem navegador (E7 parte 2). Cobre CA-13/CA-14 (o que fica pesquisável), CA-20 (só o
 * Administrador) e a leitura de cada tipo: apelido de sócio, de cliente (nome e documento),
 * variação do nome de recebedor, chave Pix e conta bancária. Dados fictícios com sufixo único.
 */

const ALIASES = "/configuracoes/aliases";
const run = runSuffix();
const accountDigits = String(randomInt(1_000_000, 10_000_000));

let sessions: Record<CadRole, Session>;
let admin: Session;
let partnerId = "";
let clientId = "";
let receiverId = "";

const partnerAlias = `Apelido do Sócio ${run}`;
const clientAlias = `Apelido do Cliente ${run}`;
const clientDocAlias = randomCpf();
const variant = `Forma do Nome ${run}`;
const pix = `alias.${run}@example.com`;
const account: [string, string, string] = ["Banco Fictício", "0042", `${accountDigits}-1`];

const query = (value: string, extra = "") => `${ALIASES}?q=${encodeURIComponent(value)}${extra}`;

beforeAll(async () => {
  sessions = cadSessions();
  admin = sessions.admin;
  partnerId = await createPartner(admin, `Sócio dos Apelidos ${run}`, [partnerAlias]);
  clientId = await createClient(admin, {
    name: `Cliente dos Apelidos ${run}`,
    partnerIds: [partnerId],
    aliases: [
      ["NAME", clientAlias],
      ["DOCUMENT", clientDocAlias],
    ],
  });
  receiverId = await createReceiver(admin, partnerId, {
    holder: `Titular dos Apelidos ${run}`,
    variants: [variant],
    pixKeys: [pix],
    accounts: [account],
  });
});

describe("acesso à lista de apelidos (CA-20)", () => {
  it("sem sessão, redireciona ao login com o destino preservado", async () => {
    const page = await getPage(new CookieJar(), ALIASES);
    expect(page.status).toBe(307);
    expect(page.location).toBe(`/login?next=${encodeURIComponent(ALIASES)}`);
  });

  it.each(["operator", "viewer"] as const)("%s recebe 'Sem permissão', sem dado nem controle, com ou sem filtros, e o menu não tem Apelidos", async (role) => {
    for (const path of [ALIASES, query(run, "&tipo=pix&status=todos")]) {
      const page = await getPage(sessions[role].jar, path);
      expect(page.status, `${role} ${path}`).toBe(200);
      expect(page.text, `${role} ${path}`).toContain("Sem permissão");
      expect(page.text, `${role} ${path}`).not.toContain(pix);
      expect(page.text, `${role} ${path}`).not.toContain(partnerAlias);
      expect(page.text, `${role} ${path}`).not.toContain("Pertence a");
      expect(page.html, `${role} ${path}`).not.toContain('href="/configuracoes/aliases"');
    }
  });

  it("Sócio vê só a tela de acesso ainda não disponível", async () => {
    const page = await getPage(sessions.partner.jar, query(run));
    expect(page.text).toContain("Acesso de sócio ainda não disponível");
    expect(page.text).not.toContain(pix);
    expect(page.text).not.toContain("Pertence a");
  });

  it("Administrador vê a lista, o menu com Apelidos e nenhum botão de edição", async () => {
    const page = await getPage(admin.jar, ALIASES);
    expect(page.status).toBe(200);
    expect(page.text).toContain("Para alterar, abra o cadastro de quem é o dono.");
    for (const column of ["Texto", "Tipo", "Pertence a", "Situação"]) expect(page.text).toContain(column);
    expect(page.html).toContain('href="/configuracoes/aliases"');
    expect(page.text).not.toContain("Sem permissão");
    expect(page.html).not.toMatch(/>\s*Editar\s*</);
    expect(page.html).not.toContain("<form method=\"post\"");
    expect(page.html).not.toMatch(/SQLSTATE|partner_aliases|receiver_identifiers/);
  });
});

describe("o que cada cadastro deixa pesquisável, com o dono certo", () => {
  it("encontra os cinco tipos pelo sufixo da execução e liga cada texto ao seu dono", async () => {
    const page = await getPage(admin.jar, query(run));
    expect(page.status).toBe(200);
    for (const text of [partnerAlias, clientAlias, variant, pix]) expect(page.text, text).toContain(text);
    for (const label of ["Apelido de sócio", "Apelido de cliente", "Variação do nome de recebedor", "Chave Pix"]) {
      expect(page.text, label).toContain(label);
    }
    expect(page.html).toContain(`href="${PARTNERS_PATH}/${partnerId}"`);
    expect(page.html).toContain(`href="${CLIENTS_PATH}/${clientId}"`);
    expect(page.html).toContain(`href="${PARTNERS_PATH}/${partnerId}/recebedores/${receiverId}"`);
    expect(page.text).toMatch(/Titular dos Apelidos .* · sócio Sócio dos Apelidos/);
  });

  it("o apelido de cliente do tipo documento e a conta bancária aparecem formatados", async () => {
    const byDocument = await getPage(admin.jar, query(clientDocAlias.replace(/\D/g, "")));
    expect(byDocument.text).toContain(clientDocAlias);
    expect(byDocument.html).toContain(`href="${CLIENTS_PATH}/${clientId}"`);

    const byAccount = await getPage(admin.jar, query(accountDigits));
    expect(byAccount.text).toMatch(/Banco Fictício · Ag\. 0042 · Conta /);
    expect(byAccount.text).toContain("Conta bancária");
    expect(byAccount.html).toContain(`href="${PARTNERS_PATH}/${partnerId}/recebedores/${receiverId}"`);
  });

  it("a busca ignora maiúscula, acento e pontuação", async () => {
    const upper = await getPage(admin.jar, query(`APELIDO DO SOCIO ${run}`.toUpperCase()));
    expect(upper.text).toContain(partnerAlias);
    const noPunctuation = await getPage(admin.jar, query(`Apelido, do Sócio! ${run}`));
    expect(noPunctuation.text).toContain(partnerAlias);
  });

  it("a chave Pix de e-mail é achada sem ponto e sem arroba (QA-CAD-01)", async () => {
    const bare = pix.replace(/[^0-9a-z]/g, "");
    const withoutPunctuation = await getPage(admin.jar, query(bare, "&tipo=pix"));
    expect(withoutPunctuation.text).toContain(pix);
    const spaced = await getPage(admin.jar, query(pix.replace(/[.@]/g, " ").toUpperCase(), "&tipo=pix"));
    expect(spaced.text).toContain(pix);
    const unrelated = await getPage(admin.jar, query(`${bare}zz`, "&tipo=pix"));
    expect(unrelated.text).not.toContain(pix);
  });

  it.each([
    ["socio", "Apelido de sócio", partnerAlias, [clientAlias, variant, pix]],
    ["cliente", "Apelido de cliente", clientAlias, [partnerAlias, variant, pix]],
    ["variacao", "Variação do nome", variant, [partnerAlias, clientAlias, pix]],
    ["pix", "Chave Pix", pix, [partnerAlias, clientAlias, variant]],
  ] as const)("filtro de tipo %s: só o tipo escolhido", async (tipo, label, present, absent) => {
    const page = await getPage(admin.jar, query(run, `&tipo=${tipo}`));
    expect(page.status).toBe(200);
    expect(page.text, label).toContain(present);
    for (const other of absent) expect(page.text, `${tipo} sem ${other}`).not.toContain(other);
  });

  it("filtro de tipo conta bancária mostra a conta e não os outros tipos", async () => {
    const page = await getPage(admin.jar, query(accountDigits, "&tipo=conta"));
    expect(page.text).toMatch(/Banco Fictício · Ag\. 0042/);
    expect(page.text).not.toContain(pix);
  });
});

describe("situação, paginação e entradas hostis", () => {
  it("chave Pix retirada do recebedor sai de 'Ativos' e passa a 'Inativos'; 'Todos' mostra os dois", async () => {
    // Inativar o recebedor não inativa os identificadores dele (modelagem 5.x): o texto sai da lista ativa
    // quando é retirado do cadastro do recebedor, que o desativa em vez de apagar.
    const path = `${PARTNERS_PATH}/${partnerId}/recebedores/${receiverId}`;
    const version = await versionAt(admin, path);
    const saved = await callAction(
      admin,
      path,
      "saveReceiverAction",
      receiverFields(partnerId, { holder: `Titular dos Apelidos ${run}`, variants: [variant], accounts: [account] }, { id: receiverId, version }),
    );
    expect(flashOf(saved)).toBe("recebedor-salvo");

    const active = await getPage(admin.jar, query(run));
    expect(active.text).not.toContain(pix);
    expect(active.text).toContain(variant);
    expect(active.text).toContain(partnerAlias);

    const inactive = await getPage(admin.jar, query(run, "&status=inativos"));
    expect(inactive.text).toContain(pix);
    expect(inactive.text).not.toContain(variant);
    expect(inactive.text).not.toContain(partnerAlias);

    const all = await getPage(admin.jar, query(run, "&status=todos"));
    for (const text of [pix, variant, partnerAlias, clientAlias]) expect(all.text, text).toContain(text);
  });

  it("inativar o recebedor mantém os textos dele na lista ativa, com o dono inativo", async () => {
    const path = `${PARTNERS_PATH}/${partnerId}/recebedores/${receiverId}`;
    const off = await callAction(admin, `${PARTNERS_PATH}/${partnerId}`, "setReceiverActiveAction", [
      ["id", receiverId],
      ["active", "false"],
      ["expectedUpdatedAt", await versionAt(admin, path)],
    ]);
    expect(flashOf(off)).toBe("recebedor-inativado");
    const page = await getPage(admin.jar, query(run));
    expect(page.text).toContain(variant);
    // N-02: o aviso fica colado ao titular e o sócio vem depois, para o parêntese não parecer ser do sócio.
    expect(page.text).toMatch(/Titular dos Apelidos [^·]*\(recebedor inativo\)\s*· sócio Sócio dos Apelidos/);
  });

  it("sem resultado: estado vazio com 'Limpar filtros'", async () => {
    const page = await getPage(admin.jar, query(`zzz-inexistente-${run}`));
    expect(page.text).toContain("Nenhum texto encontrado.");
    expect(page.text).toContain("Limpar filtros");
  });

  it("parâmetros inválidos caem no padrão, curingas de LIKE não quebram e HTML digitado sai escapado", async () => {
    const hostile = await getPage(admin.jar, `${ALIASES}?tipo=XXX&status=ZZZ&pagina=abc&por=7`);
    expect(hostile.status).toBe(200);
    expect(hostile.text).toContain("Pertence a");
    expect(hostile.text).not.toContain("Não foi possível carregar");

    const wildcards = await getPage(admin.jar, `${ALIASES}?q=${encodeURIComponent("%_\\")}&tipo=pix`);
    expect(wildcards.status).toBe(200);
    expect(wildcards.text).not.toContain("Não foi possível carregar");

    const xss = await getPage(admin.jar, query("<script>alert(1)</script>"));
    expect(xss.html).not.toContain("<script>alert(1)</script>");
  });

  it("a página além do fim redireciona e 'por' aceita 100", async () => {
    const beyond = await getPage(admin.jar, `${ALIASES}?pagina=999`);
    expect(beyond.html).toMatch(/NEXT_REDIRECT/);
    const large = await getPage(admin.jar, `${ALIASES}?por=100&status=todos`);
    expect(large.text).toMatch(/1–\d+ de \d+/);
  });

  it("um apelido novo só entra pelo cadastro do dono, e a lista o mostra", async () => {
    const version = await versionAt(admin, `${PARTNERS_PATH}/${partnerId}/editar`);
    const newAlias = `Apelido Novo ${run}`;
    const saved = await callAction(admin, `${PARTNERS_PATH}/${partnerId}/editar`, "savePartnerAction", [
      ["id", partnerId],
      ["name", `Sócio dos Apelidos ${run}`],
      ["aliases", partnerAlias],
      ["aliases", newAlias],
      ["expectedUpdatedAt", version],
    ]);
    expect(flashOf(saved)).toBe("salvo");
    const page = await getPage(admin.jar, query(run));
    expect(page.text).toContain(newAlias);
    expect(page.text).toContain(partnerAlias);
  });
});
