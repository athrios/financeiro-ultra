import { beforeAll, describe, expect, it } from "vitest";

import {
  PARTNERS_PATH,
  SEED,
  MISSING_ID,
  cadSessions,
  callAction,
  createClient,
  createPartner,
  flashOf,
  idAfter,
  isForbidden,
  runSuffix,
  setClientActive,
  setPartnerActive,
  versionAt,
  type CadRole,
} from "./support/cadastros";
import { CookieJar, type Session } from "./support/http";
import { getPage } from "./support/pages";

/**
 * CAD-001 · Sócios, por HTTP e sem navegador (E7 parte 2). Cobre CA-01, CA-02 (inativação
 * bloqueada, na interface), CA-16 e CA-20 para a tela de sócios: acesso por papel, Server Actions
 * permitidas × negadas e os caminhos principais (criar, editar, conflito de versão, inativar,
 * reativar). O banco semeado não permite exclusão: os nomes levam um sufixo único da execução.
 */

const run = runSuffix();
let sessions: Record<CadRole, Session>;
let admin: Session;

beforeAll(() => {
  sessions = cadSessions();
  admin = sessions.admin;
});

const NOT_ADMIN: CadRole[] = ["operator", "viewer", "partner"];

describe("acesso às páginas de sócio (matriz do plano, seção 6)", () => {
  it("sem sessão, todas as páginas redirecionam ao login", async () => {
    for (const path of [
      PARTNERS_PATH,
      `${PARTNERS_PATH}/novo`,
      `${PARTNERS_PATH}/${SEED.partnerA}`,
      `${PARTNERS_PATH}/${SEED.partnerA}/editar`,
    ]) {
      const page = await getPage(new CookieJar(), path);
      expect(page.status, path).toBe(307);
      expect(page.location, path).toMatch(/^\/login/);
    }
  });

  it("Administrador vê a lista, o detalhe, o formulário de novo e o de edição", async () => {
    // A lista cresce a cada execução (não há exclusão): a busca isola os sócios do seed.
    const list = await getPage(admin.jar, `${PARTNERS_PATH}?q=${encodeURIComponent("Exemplo")}`);
    expect(list.status).toBe(200);
    expect(list.text).toContain("Sócio Exemplo A");
    expect(list.text).toContain("Sócio Exemplo B");
    expect(list.html).toContain('href="/configuracoes/socios"');

    const detail = await getPage(admin.jar, `${PARTNERS_PATH}/${SEED.partnerA}`);
    expect(detail.status).toBe(200);
    expect(detail.text).toContain("Sócio Exemplo A");
    expect(detail.text).toContain("Cliente Modelo Ltda");

    const form = await getPage(admin.jar, `${PARTNERS_PATH}/novo`);
    expect(form.html).toContain('name="name"');
    expect(form.text).not.toContain("Sem permissão");
    expect(form.text).toContain("Informe o nome e, se quiser, os apelidos do sócio.");
    expect(form.text).not.toContain("percentual");

    const edit = await getPage(admin.jar, `${PARTNERS_PATH}/${SEED.partnerA}/editar`);
    expect(edit.html).toContain('name="expectedUpdatedAt"');
    expect(edit.html).toContain('name="name"');
  });

  it.each(NOT_ADMIN)("%s não vê dado de sócio nem formulário em nenhuma página", async (role) => {
    const session = sessions[role];
    for (const path of [
      PARTNERS_PATH,
      `${PARTNERS_PATH}/novo`,
      `${PARTNERS_PATH}/${SEED.partnerA}`,
      `${PARTNERS_PATH}/${SEED.partnerA}/editar`,
    ]) {
      const page = await getPage(session.jar, path);
      expect(page.status, `${role} ${path}`).toBe(200);
      // "Sócio Exemplo A" também é o nome do usuário Sócio no cabeçalho: o dado de negócio é o outro sócio.
      expect(page.text, `${role} ${path}`).not.toContain("Sócio Exemplo B");
      expect(page.text, `${role} ${path}`).not.toContain("Cliente Modelo Ltda");
      expect(page.html, `${role} ${path}`).not.toContain('name="name"');
      expect(page.html, `${role} ${path}`).not.toContain('name="expectedUpdatedAt"');
    }
  });

  it("Sócio vê só a tela de acesso ainda não disponível, sem dado de negócio", async () => {
    const page = await getPage(sessions.partner.jar, PARTNERS_PATH);
    expect(page.text).toContain("Acesso de sócio ainda não disponível");
    expect(page.html).not.toContain('href="/configuracoes/socios"');
  });

  it.each(["operator", "viewer"] as const)("%s recebe 'Sem permissão' e o menu não tem Sócios", async (role) => {
    const page = await getPage(sessions[role].jar, PARTNERS_PATH);
    expect(page.text).toContain("Sem permissão");
    expect(page.html).not.toContain('href="/configuracoes/socios"');
  });

  it("sócio inexistente ou com id inválido: 'Registro não encontrado' para o Administrador", async () => {
    const missing = await getPage(admin.jar, `${PARTNERS_PATH}/${MISSING_ID}`);
    expect(missing.html).toContain("Registro não encontrado");
    const invalid = await getPage(admin.jar, `${PARTNERS_PATH}/nao-e-uuid`);
    expect(invalid.html).toContain("Registro não encontrado");
  });
});

describe("Server Actions de sócio: permitido × negado (CA-16)", () => {
  const deniedName = `Negado Sócio ${run}`;

  it("sem sessão, o POST direto não grava e vai ao login", async () => {
    const result = await callAction(null, `${PARTNERS_PATH}/novo`, "savePartnerAction", [["name", `${deniedName} anon`]]);
    expect(result.failed).toBe(false);
    expect(`${result.status} ${result.location ?? ""} ${result.text}`).toMatch(/\/login/);
  });

  it.each(NOT_ADMIN)("%s: savePartnerAction e setPartnerActiveAction são negadas", async (role) => {
    const save = await callAction(sessions[role], `${PARTNERS_PATH}/novo`, "savePartnerAction", [
      ["name", `${deniedName} ${role}`],
    ]);
    expect(isForbidden(save), `${role} save: ${save.status} ${save.code}`).toBe(true);
    expect(save.location).toBeNull();

    const version = await versionAt(admin, `${PARTNERS_PATH}/${SEED.partnerC}/editar`);
    const toggle = await callAction(sessions[role], `${PARTNERS_PATH}/${SEED.partnerC}`, "setPartnerActiveAction", [
      ["id", SEED.partnerC],
      ["active", "false"],
      ["expectedUpdatedAt", version],
    ]);
    expect(isForbidden(toggle), `${role} toggle: ${toggle.status} ${toggle.code}`).toBe(true);
  });

  it("nada foi gravado pelos negados", async () => {
    const list = await getPage(admin.jar, `${PARTNERS_PATH}?q=${encodeURIComponent(deniedName)}&status=todos`);
    expect(list.text).not.toContain(deniedName);
    const seedC = await getPage(admin.jar, `${PARTNERS_PATH}/${SEED.partnerC}`);
    expect(seedC.text).not.toMatch(/Sócio inativado/);
  });

  it("o Administrador cria o sócio que os outros papéis não conseguiram criar", async () => {
    const id = await createPartner(admin, `${deniedName} admin`);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("criar, editar e conflito de versão (CA-01, CA-18)", () => {
  const name = `Sócio E2E ${run}`;
  const alias = `Apelido E2E ${run}`;
  let id = "";

  it("cria o sócio com um apelido: 303 com aviso e o detalhe mostra nome e apelido", async () => {
    const result = await callAction(admin, `${PARTNERS_PATH}/novo`, "savePartnerAction", [
      ["name", name],
      ["aliases", alias],
    ]);
    expect(flashOf(result)).toBe("criado");
    id = idAfter(result.location, "/configuracoes/socios");
    expect(id).toMatch(/^[0-9a-f-]{36}$/);

    const detail = await getPage(admin.jar, `${PARTNERS_PATH}/${id}?aviso=criado`);
    expect(detail.text).toContain("Sócio cadastrado");
    expect(detail.text).toContain(name);
    expect(detail.text).toContain(alias);
    expect(detail.text).not.toMatch(/CPF|CNPJ/);
  });

  it("nome repetido (sem acento e em maiúsculas) é recusado e mostra o dono", async () => {
    const result = await callAction(admin, `${PARTNERS_PATH}/novo`, "savePartnerAction", [
      ["name", name.replace("Sócio", "SOCIO").toUpperCase()],
    ]);
    expect(result.failed).toBe(true);
    expect(result.text).toContain("PARTNER_NAME_TAKEN");
    expect(result.text).toContain(id);
    expect(result.location).toBeNull();
  });

  it("nome em branco é recusado com VALIDATION", async () => {
    const result = await callAction(admin, `${PARTNERS_PATH}/novo`, "savePartnerAction", [["name", "   "]]);
    expect(result.failed).toBe(true);
    expect(result.code).toBe("VALIDATION");
  });

  it("edita com a versão atual e depois recusa a versão antiga sem sobrescrever", async () => {
    const stale = await versionAt(admin, `${PARTNERS_PATH}/${id}/editar`);
    const edited = await callAction(admin, `${PARTNERS_PATH}/${id}/editar`, "savePartnerAction", [
      ["id", id],
      ["name", `${name} Editado`],
      ["aliases", alias],
      ["expectedUpdatedAt", stale],
      ["reason", "Ajuste fictício"],
    ]);
    expect(flashOf(edited)).toBe("salvo");

    const conflict = await callAction(admin, `${PARTNERS_PATH}/${id}/editar`, "savePartnerAction", [
      ["id", id],
      ["name", `${name} Sobrescrito`],
      ["expectedUpdatedAt", stale],
    ]);
    expect(conflict.failed).toBe(true);
    expect(conflict.text).toContain("STALE_VERSION");
    expect(conflict.text).toContain("currentUpdatedAt");

    const detail = await getPage(admin.jar, `${PARTNERS_PATH}/${id}`);
    expect(detail.text).toContain(`${name} Editado`);
    expect(detail.text).not.toContain("Sobrescrito");
  });

  it("editar sem a versão é recusado", async () => {
    const result = await callAction(admin, `${PARTNERS_PATH}/${id}/editar`, "savePartnerAction", [
      ["id", id],
      ["name", `${name} Sem Versão`],
    ]);
    expect(result.failed).toBe(true);
    expect(result.location).toBeNull();
  });

  it("buscar na lista acha o sócio criado, e o filtro de situação separa ativos de inativos", async () => {
    const found = await getPage(admin.jar, `${PARTNERS_PATH}?q=${encodeURIComponent(`Sócio E2E ${run}`)}`);
    expect(found.text).toContain(`${name} Editado`);
    const inactive = await getPage(admin.jar, `${PARTNERS_PATH}?q=${encodeURIComponent(run)}&status=inativos`);
    expect(inactive.text).not.toContain(`${name} Editado`);
  });
});

describe("inativar e reativar (CA-02, CA-18)", () => {
  it("sócio indicado em cliente ativo do seed: inativação bloqueada, com a lista de clientes", async () => {
    const result = await setPartnerActive(admin, SEED.partnerA, false);
    expect(result.failed).toBe(true);
    expect(result.text).toContain("PARTNER_HAS_CLIENTS");
    expect(result.text).toContain("Cliente Modelo Ltda");
    expect(result.location).toBeNull();
    const detail = await getPage(admin.jar, `${PARTNERS_PATH}/${SEED.partnerA}`);
    expect(detail.text).not.toContain("Sócio inativado");
  });

  it("sócio indicado em cliente criado agora: bloqueado, e continua bloqueado com o cliente inativo", async () => {
    const partnerId = await createPartner(admin, `Sócio Bloqueado ${run}`);
    const clientId = await createClient(admin, { name: `Cliente do Bloqueado ${run}`, partnerIds: [partnerId] });

    const blocked = await setPartnerActive(admin, partnerId, false);
    expect(blocked.failed).toBe(true);
    expect(blocked.text).toContain("PARTNER_HAS_CLIENTS");
    expect(blocked.text).toContain(`Cliente do Bloqueado ${run}`);

    expect(flashOf(await setClientActive(admin, clientId, false))).toBe("inativado");
    const stillBlocked = await setPartnerActive(admin, partnerId, false);
    expect(stillBlocked.failed).toBe(true);
    expect(stillBlocked.text).toContain("PARTNER_HAS_CLIENTS");
  });

  it("sócio sem clientes: inativa, repetir é 'já inativo', versão antiga é conflito, reativa", async () => {
    const partnerId = await createPartner(admin, `Sócio Livre ${run}`);
    const original = await versionAt(admin, `${PARTNERS_PATH}/${partnerId}/editar`);

    const off = await setPartnerActive(admin, partnerId, false, [["reason", "Motivo fictício"]]);
    expect(flashOf(off)).toBe("inativado");
    const detailOff = await getPage(admin.jar, `${PARTNERS_PATH}/${partnerId}?aviso=inativado`);
    expect(detailOff.text).toContain("Sócio inativado");
    expect(detailOff.text).toMatch(/Reativar sócio/);

    const again = await setPartnerActive(admin, partnerId, false);
    expect(flashOf(again)).toBe("ja-inativo");

    const staleToggle = await callAction(admin, `${PARTNERS_PATH}/${partnerId}`, "setPartnerActiveAction", [
      ["id", partnerId],
      ["active", "true"],
      ["expectedUpdatedAt", original],
    ]);
    expect(staleToggle.failed).toBe(true);
    expect(staleToggle.text).toContain("STALE_VERSION");

    const inactiveList = await getPage(admin.jar, `${PARTNERS_PATH}?q=${encodeURIComponent(`Sócio Livre ${run}`)}&status=inativos`);
    expect(inactiveList.text).toContain(`Sócio Livre ${run}`);

    expect(flashOf(await setPartnerActive(admin, partnerId, true))).toBe("reativado");
    expect(flashOf(await setPartnerActive(admin, partnerId, true))).toBe("ja-ativo");
  });

  it("entradas inválidas na inativação são recusadas", async () => {
    const version = await versionAt(admin, `${PARTNERS_PATH}/${SEED.partnerC}/editar`);
    const badActive = await callAction(admin, `${PARTNERS_PATH}/${SEED.partnerC}`, "setPartnerActiveAction", [
      ["id", SEED.partnerC],
      ["active", "talvez"],
      ["expectedUpdatedAt", version],
    ]);
    expect(badActive.failed).toBe(true);
    expect(badActive.code).toBe("VALIDATION");
    const missing = await callAction(admin, `${PARTNERS_PATH}/${SEED.partnerC}`, "setPartnerActiveAction", [
      ["id", MISSING_ID],
      ["active", "false"],
      ["expectedUpdatedAt", version],
    ]);
    expect(missing.failed).toBe(true);
    expect(missing.text).toContain("NOT_FOUND");
  });
});
