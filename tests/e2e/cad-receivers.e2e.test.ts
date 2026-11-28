import { randomInt } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import {
  MISSING_ID,
  PARTNERS_PATH,
  SEED,
  cadSessions,
  callAction,
  createPartner,
  createReceiver,
  flashOf,
  isForbidden,
  receiverFields,
  runSuffix,
  setPartnerActive,
  versionAt,
  type CadRole,
} from "./support/cadastros";
import { CookieJar, type Session } from "./support/http";
import { getPage } from "./support/pages";

/**
 * CAD-001 · Recebedores (dentro do sócio), por HTTP e sem navegador (E7 parte 2). Cobre CA-11,
 * CA-12 (cascata, na interface), CA-13 (duplicados), CA-16 e CA-20: acesso por papel, Server
 * Actions permitidas × negadas, criar, editar, conflito de versão, inativar, reativar e a cascata
 * da inativação do sócio. Dados fictícios com sufixo único da execução.
 */

const run = runSuffix();
// Chaves e contas são únicas no banco inteiro: valores novos a cada execução.
const digits = String(randomInt(1_000_000, 10_000_000));

let sessions: Record<CadRole, Session>;
let admin: Session;
let partnerId = "";
let receiverId = "";

const holder = `Titular E2E ${run}`;
const variant = `Forma E2E ${run}`;
const pix = `pix.e2e.${run}@example.com`;
const account: [string, string, string] = ["Banco Fictício", "0001", `${digits}-6`];

const newPath = () => `${PARTNERS_PATH}/${partnerId}/recebedores/novo`;
const receiverPath = (id = receiverId) => `${PARTNERS_PATH}/${partnerId}/recebedores/${id}`;
const detailPath = () => `${PARTNERS_PATH}/${partnerId}`;

beforeAll(async () => {
  sessions = cadSessions();
  admin = sessions.admin;
  partnerId = await createPartner(admin, `Sócio dos Recebedores ${run}`);
  receiverId = await createReceiver(admin, partnerId, {
    holder,
    variants: [variant],
    pixKeys: [pix],
    accounts: [account],
  });
});

describe("acesso às páginas de recebedor (matriz do plano, seção 6)", () => {
  it("sem sessão, as páginas redirecionam ao login", async () => {
    for (const path of [newPath(), receiverPath(), detailPath()]) {
      const page = await getPage(new CookieJar(), path);
      expect(page.status, path).toBe(307);
      expect(page.location, path).toMatch(/^\/login/);
    }
  });

  it("Administrador vê o formulário de novo (sem campo de CPF/CNPJ do titular) e o de edição com a versão", async () => {
    const created = await getPage(admin.jar, newPath());
    expect(created.status).toBe(200);
    expect(created.text).toContain("Nome do titular");
    expect(created.text).toContain("Chaves Pix");
    expect(created.text).toContain("Contas bancárias");
    expect(created.html).not.toMatch(/name="(cpf|cnpj|document)/i);

    const edit = await getPage(admin.jar, receiverPath());
    expect(edit.status).toBe(200);
    expect(edit.html).toContain('name="expectedUpdatedAt"');
    expect(edit.text).toContain(holder);
    expect(edit.text).toContain("Inativar recebedor");
  });

  it("o detalhe do sócio lista o recebedor com titular, Pix e conta", async () => {
    const detail = await getPage(admin.jar, detailPath());
    expect(detail.text).toContain(holder);
    expect(detail.text).toContain(pix);
    expect(detail.text).toContain("1 variação do nome");
  });

  it.each(["operator", "viewer"] as const)("%s recebe 'Sem permissão' e não vê recebedor nem formulário", async (role) => {
    for (const path of [newPath(), receiverPath(), detailPath()]) {
      const page = await getPage(sessions[role].jar, path);
      expect(page.status, `${role} ${path}`).toBe(200);
      expect(page.text, `${role} ${path}`).toContain("Sem permissão");
      expect(page.text, `${role} ${path}`).not.toContain(holder);
      expect(page.text, `${role} ${path}`).not.toContain(pix);
      expect(page.html, `${role} ${path}`).not.toContain('name="holderName"');
    }
  });

  it("Sócio não vê recebedor nem formulário (só a tela de acesso ainda não disponível)", async () => {
    for (const path of [newPath(), receiverPath(), detailPath()]) {
      const page = await getPage(sessions.partner.jar, path);
      expect(page.text, path).toContain("Acesso de sócio ainda não disponível");
      expect(page.text, path).not.toContain(holder);
      expect(page.html, path).not.toContain('name="holderName"');
    }
  });

  it("recebedor de outro sócio na URL, inexistente ou com id inválido: 'Registro não encontrado'", async () => {
    const other = await getPage(admin.jar, `${PARTNERS_PATH}/${SEED.partnerB}/recebedores/${receiverId}`);
    expect(other.html).toContain("Registro não encontrado");
    expect(other.html).not.toContain(holder);
    const missing = await getPage(admin.jar, receiverPath(MISSING_ID));
    expect(missing.html).toContain("Registro não encontrado");
    const invalid = await getPage(admin.jar, receiverPath("nao-e-uuid"));
    expect(invalid.html).toContain("Registro não encontrado");
    expect(invalid.html).not.toMatch(/at \w+ \(/);
  });
});

describe("Server Actions de recebedor: permitido × negado (CA-16)", () => {
  it("sem sessão, o POST direto não grava e vai ao login", async () => {
    const result = await callAction(null, newPath(), "saveReceiverAction", receiverFields(partnerId, { holder: `Anônimo ${run}` }));
    expect(result.failed).toBe(false);
    expect(`${result.status} ${result.location ?? ""} ${result.text}`).toMatch(/\/login/);
  });

  it.each(["operator", "viewer", "partner"] as const)("%s: criar, editar e inativar são negados", async (role) => {
    const create = await callAction(sessions[role], newPath(), "saveReceiverAction", receiverFields(partnerId, { holder: `Negado ${role} ${run}` }));
    expect(isForbidden(create), `${role} criar: ${create.status} ${create.code}`).toBe(true);

    const version = await versionAt(admin, receiverPath());
    const edit = await callAction(
      sessions[role],
      receiverPath(),
      "saveReceiverAction",
      receiverFields(partnerId, { holder: `Hack ${role} ${run}` }, { id: receiverId, version }),
    );
    expect(isForbidden(edit), `${role} editar: ${edit.status} ${edit.code}`).toBe(true);

    const toggle = await callAction(sessions[role], detailPath(), "setReceiverActiveAction", [
      ["id", receiverId],
      ["active", "false"],
      ["expectedUpdatedAt", version],
    ]);
    expect(isForbidden(toggle), `${role} inativar: ${toggle.status} ${toggle.code}`).toBe(true);
  });

  it("nada foi gravado pelos negados: o recebedor segue ativo e com o titular original", async () => {
    const detail = await getPage(admin.jar, `${detailPath()}?recebedores=todos`);
    expect(detail.text).toContain(holder);
    expect(detail.text).not.toMatch(/Negado (operator|viewer|partner)/);
    expect(detail.text).not.toMatch(/Hack (operator|viewer|partner)/);
    const edit = await getPage(admin.jar, receiverPath());
    expect(edit.text).not.toContain("Recebedor inativo");
  });
});

describe("editar e conflito de versão (CA-18)", () => {
  it("edita com a versão atual; a versão antiga é recusada sem sobrescrever", async () => {
    const stale = await versionAt(admin, receiverPath());
    const input = { holder: `${holder} Editado`, variants: [variant], pixKeys: [pix], accounts: [account] };
    const edited = await callAction(admin, receiverPath(), "saveReceiverAction", receiverFields(partnerId, input, { id: receiverId, version: stale }));
    expect(flashOf(edited)).toBe("recebedor-salvo");

    const conflict = await callAction(
      admin,
      receiverPath(),
      "saveReceiverAction",
      receiverFields(partnerId, { ...input, holder: `${holder} Sobrescrito` }, { id: receiverId, version: stale }),
    );
    expect(conflict.failed).toBe(true);
    expect(conflict.text).toContain("STALE_VERSION");

    const fresh = await versionAt(admin, receiverPath());
    expect(fresh).not.toBe("");
    expect(fresh).not.toBe(stale);
    const detail = await getPage(admin.jar, detailPath());
    expect(detail.text).toContain(`${holder} Editado`);
    expect(detail.text).not.toContain("Sobrescrito");
  });

  it("o sócio dono não troca: editar com outro partnerId mantém o recebedor no sócio de origem", async () => {
    const version = await versionAt(admin, receiverPath());
    const result = await callAction(
      admin,
      receiverPath(),
      "saveReceiverAction",
      receiverFields(SEED.partnerB, { holder: `${holder} Editado`, variants: [variant], pixKeys: [pix], accounts: [account] }, { id: receiverId, version }),
    );
    // O banco recusa a troca (CA-11) ou ignora o campo: nos dois casos o dono não muda.
    if (!result.failed) expect(flashOf(result)).toBe("recebedor-salvo");
    const other = await getPage(admin.jar, `${PARTNERS_PATH}/${SEED.partnerB}?recebedores=todos`);
    expect(other.text).not.toContain(`${holder} Editado`);
    const original = await getPage(admin.jar, detailPath());
    expect(original.text).toContain(`${holder} Editado`);
  });
});

describe("identificadores repetidos (CA-13)", () => {
  const other = (extra: Partial<Parameters<typeof receiverFields>[1]>) =>
    receiverFields(partnerId, { holder: `Outro ${run}`, ...extra });

  it("chave Pix repetida (mesmo em maiúsculas) é recusada", async () => {
    const result = await callAction(admin, newPath(), "saveReceiverAction", other({ pixKeys: [pix.toUpperCase()] }));
    expect(result.failed).toBe(true);
    expect(result.text).toContain("Esta chave Pix já está cadastrada no recebedor");
  });

  it("conta repetida (zeros à esquerda e separadores) é recusada", async () => {
    const result = await callAction(admin, newPath(), "saveReceiverAction", other({ accounts: [[account[0], "00001", `${digits}6`]] }));
    expect(result.failed).toBe(true);
    expect(result.text).toContain("Esta conta já está cadastrada no recebedor");
  });

  it("forma do nome repetida (sem diferenciar maiúscula) é recusada", async () => {
    const result = await callAction(admin, newPath(), "saveReceiverAction", other({ variants: [variant.toLowerCase()] }));
    expect(result.failed).toBe(true);
    expect(result.text).toContain("Esta forma do nome já está cadastrada no recebedor");
  });

  it("chave Pix de recebedor de outro sócio é recusada e cita o sócio", async () => {
    const result = await callAction(admin, newPath(), "saveReceiverAction", other({ pixKeys: ["semente.a@example.com"] }));
    expect(result.failed).toBe(true);
    expect(result.text).toMatch(/Esta chave Pix já está cadastrada no recebedor .* do sócio Sócio Exemplo A/);
  });

  it("forma do nome igual ao nome de um sócio é recusada", async () => {
    const result = await callAction(admin, newPath(), "saveReceiverAction", other({ variants: ["Sócio Exemplo B"] }));
    expect(result.failed).toBe(true);
  });

  it("titular em branco e envio sem sócio nem id são recusados", async () => {
    const blank = await callAction(admin, newPath(), "saveReceiverAction", receiverFields(partnerId, { holder: "   " }));
    expect(blank.failed).toBe(true);
    expect(blank.code).toBe("VALIDATION");
    const orphan = await callAction(admin, newPath(), "saveReceiverAction", [["holderName", `Sem sócio ${run}`]]);
    expect(orphan.failed).toBe(true);
    expect(orphan.location).toBeNull();
  });
});

describe("inativar e reativar recebedor (CA-11)", () => {
  let version = "";

  it("inativa; repetir é 'já inativo'; reativar com versão antiga é conflito", async () => {
    const before = await versionAt(admin, receiverPath());
    const off = await callAction(admin, detailPath(), "setReceiverActiveAction", [
      ["id", receiverId],
      ["active", "false"],
      ["expectedUpdatedAt", before],
      ["reason", "Motivo fictício"],
    ]);
    expect(flashOf(off)).toBe("recebedor-inativado");

    const again = await callAction(admin, detailPath(), "setReceiverActiveAction", [
      ["id", receiverId],
      ["active", "false"],
      ["expectedUpdatedAt", before],
    ]);
    expect(flashOf(again)).toBe("recebedor-ja-inativo");

    const stale = await callAction(admin, detailPath(), "setReceiverActiveAction", [
      ["id", receiverId],
      ["active", "true"],
      ["expectedUpdatedAt", before],
    ]);
    expect(stale.failed).toBe(true);
    expect(stale.text).toContain("STALE_VERSION");
    version = await versionAt(admin, receiverPath());
  });

  it("os filtros da lista separam ativos, inativos e todos; a tela do inativo oferece reativar", async () => {
    const edited = `${holder} Editado`;
    const inactive = await getPage(admin.jar, `${detailPath()}?recebedores=inativos`);
    const active = await getPage(admin.jar, `${detailPath()}?recebedores=ativos`);
    const all = await getPage(admin.jar, `${detailPath()}?recebedores=todos`);
    expect(inactive.text).toContain(edited);
    expect(active.text).not.toContain(edited);
    expect(all.text).toContain(edited);

    const edit = await getPage(admin.jar, receiverPath());
    expect(edit.text).toContain("Recebedor inativo");
    expect(edit.text).toContain("Reativar recebedor");
  });

  it("reativa, e repetir é 'já ativo'", async () => {
    const on = await callAction(admin, detailPath(), "setReceiverActiveAction", [
      ["id", receiverId],
      ["active", "true"],
      ["expectedUpdatedAt", version],
    ]);
    expect(flashOf(on)).toBe("recebedor-reativado");
    const again = await callAction(admin, detailPath(), "setReceiverActiveAction", [
      ["id", receiverId],
      ["active", "true"],
      ["expectedUpdatedAt", version],
    ]);
    expect(flashOf(again)).toBe("recebedor-ja-ativo");
  });

  it("entradas inválidas: active fora de true/false e recebedor inexistente", async () => {
    const current = await versionAt(admin, receiverPath());
    const invalid = await callAction(admin, detailPath(), "setReceiverActiveAction", [
      ["id", receiverId],
      ["active", "talvez"],
      ["expectedUpdatedAt", current],
    ]);
    expect(invalid.failed).toBe(true);
    expect(invalid.code).toBe("VALIDATION");
    const missing = await callAction(admin, detailPath(), "setReceiverActiveAction", [
      ["id", MISSING_ID],
      ["active", "false"],
      ["expectedUpdatedAt", current],
    ]);
    expect(missing.failed).toBe(true);
    expect(missing.text).toContain("NOT_FOUND");
  });
});

describe("inativar o sócio com recebedores: cascata e confirmação (CA-12)", () => {
  let cascadePartner = "";
  let first = "";
  let second = "";

  beforeAll(async () => {
    cascadePartner = await createPartner(admin, `Sócio da Cascata ${run}`);
    first = await createReceiver(admin, cascadePartner, { holder: `Cascata Um ${run}`, pixKeys: [`cascata1.${run}@example.com`] });
    second = await createReceiver(admin, cascadePartner, { holder: `Cascata Dois ${run}`, pixKeys: [`cascata2.${run}@example.com`] });
  });

  it("sem confirmar a lista, ou confirmando só um dos recebedores, a inativação é recusada e nada muda", async () => {
    const none = await setPartnerActive(admin, cascadePartner, false);
    expect(none.failed).toBe(true);
    expect(none.text).toContain("RECEIVERS_CHANGED");
    const partial = await setPartnerActive(admin, cascadePartner, false, [["confirmedReceiverIds", first]]);
    expect(partial.failed).toBe(true);
    expect(partial.text).toContain("RECEIVERS_CHANGED");

    const detail = await getPage(admin.jar, `${PARTNERS_PATH}/${cascadePartner}`);
    expect(detail.text).not.toContain("Sócio inativado");
    expect(detail.text).toContain(`Cascata Um ${run}`);
    expect(detail.text).toContain(`Cascata Dois ${run}`);
  });

  it("confirmando a lista toda, o sócio e os dois recebedores são inativados juntos", async () => {
    const off = await setPartnerActive(admin, cascadePartner, false, [
      ["confirmedReceiverIds", first],
      ["confirmedReceiverIds", second],
      ["reason", "Motivo fictício"],
    ]);
    expect(flashOf(off)).toBe("inativado");
    expect(new URL(off.location ?? "", "http://x").searchParams.get("n")).toBe("2");

    const active = await getPage(admin.jar, `${PARTNERS_PATH}/${cascadePartner}?recebedores=ativos`);
    const inactive = await getPage(admin.jar, `${PARTNERS_PATH}/${cascadePartner}?recebedores=inativos`);
    expect(active.text).not.toContain(`Cascata Um ${run}`);
    expect(inactive.text).toContain(`Cascata Um ${run}`);
    expect(inactive.text).toContain(`Cascata Dois ${run}`);
  });

  it("com o sócio inativo: não se reativa recebedor nem se cria outro", async () => {
    const reactivate = await callAction(admin, `${PARTNERS_PATH}/${cascadePartner}`, "setReceiverActiveAction", [
      ["id", first],
      ["active", "true"],
      ["expectedUpdatedAt", await versionAt(admin, `${PARTNERS_PATH}/${cascadePartner}/recebedores/${first}`)],
    ]);
    expect(reactivate.failed).toBe(true);
    expect(reactivate.text).toContain("PARTNER_INACTIVE");

    const create = await callAction(
      admin,
      `${PARTNERS_PATH}/${cascadePartner}/recebedores/novo`,
      "saveReceiverAction",
      receiverFields(cascadePartner, { holder: `Novo em inativo ${run}` }),
    );
    expect(create.failed).toBe(true);

    const page = await getPage(admin.jar, `${PARTNERS_PATH}/${cascadePartner}/recebedores/novo`);
    expect(page.text).toContain("Não é possível cadastrar recebedor para um sócio inativo");
    expect(page.html).not.toContain('name="holderName"');
  });

  it("reativar o sócio não reativa os recebedores; depois cada um pode ser reativado", async () => {
    expect(flashOf(await setPartnerActive(admin, cascadePartner, true))).toBe("reativado");
    const active = await getPage(admin.jar, `${PARTNERS_PATH}/${cascadePartner}?recebedores=ativos`);
    expect(active.text).not.toContain(`Cascata Um ${run}`);
    expect(active.text).not.toContain(`Cascata Dois ${run}`);

    const on = await callAction(admin, `${PARTNERS_PATH}/${cascadePartner}`, "setReceiverActiveAction", [
      ["id", first],
      ["active", "true"],
      ["expectedUpdatedAt", await versionAt(admin, `${PARTNERS_PATH}/${cascadePartner}/recebedores/${first}`)],
    ]);
    expect(flashOf(on)).toBe("recebedor-reativado");
    const after = await getPage(admin.jar, `${PARTNERS_PATH}/${cascadePartner}?recebedores=ativos`);
    expect(after.text).toContain(`Cascata Um ${run}`);
    expect(after.text).not.toContain(`Cascata Dois ${run}`);
  });
});
