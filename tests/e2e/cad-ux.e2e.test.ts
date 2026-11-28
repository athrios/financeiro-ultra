import { beforeAll, describe, expect, it } from "vitest";

import {
  CLIENTS_PATH,
  PARTNERS_PATH,
  cadSessions,
  createClient,
  createPartner,
  createReceiver,
  runSuffix,
  type CadRole,
} from "./support/cadastros";
import type { Session } from "./support/http";
import { getPage } from "./support/pages";

/**
 * CAD-001 · padrões de tela que valem em toda a CAD, por HTTP e sem navegador (E10, testes
 * permanentes): UXC-08 (links dos sócios no detalhe do cliente só para o Administrador) e UXC-46
 * (um único h1 e título "{Página} · Financeiro Ultra" em cada página). Dados fictícios com sufixo
 * único; o banco semeado não permite exclusão.
 */

const run = runSuffix();
const TITLE_SUFFIX = " · Financeiro Ultra";
/** Cada papel que lê (admin, operator, viewer); o Sócio só vê a tela de acesso, fora deste escopo. */
const ROLES = ["admin", "operator", "viewer"] as const satisfies readonly CadRole[];
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

let sessions: Record<CadRole, Session>;
let admin: Session;
let partnerP = "";
let partnerQ = "";
let clientId = "";
let receiverId = "";

beforeAll(async () => {
  sessions = cadSessions();
  admin = sessions.admin;
  partnerP = await createPartner(admin, `Sócio Ux P ${run}`);
  partnerQ = await createPartner(admin, `Sócio Ux Q ${run}`);
  clientId = await createClient(admin, { name: `Cliente Ux ${run}`, partnerIds: [partnerP, partnerQ] });
  receiverId = await createReceiver(admin, partnerP, { holder: `Titular Ux ${run}`, pixKeys: [`ux.${run}@example.com`] });
});

/** Ligações do detalhe do cliente para o detalhe de um sócio (href exato, com id). */
const partnerLinks = (html: string) => [...html.matchAll(new RegExp(`href="/configuracoes/socios/(${UUID})"`, "g"))].map((match) => match[1]);

describe("UXC-08: links dos sócios no detalhe do cliente", () => {
  it("o Administrador tem um link por sócio para /configuracoes/socios/{id}, com o nome como texto do link", async () => {
    const page = await getPage(admin.jar, `${CLIENTS_PATH}/${clientId}`);
    expect(page.status).toBe(200);
    expect(partnerLinks(page.html).sort()).toEqual([partnerP, partnerQ].sort());
    for (const [id, letter] of [
      [partnerP, "P"],
      [partnerQ, "Q"],
    ]) {
      const anchor = new RegExp(`<a[^>]*href="/configuracoes/socios/${id}"[^>]*>([^<]*)</a>`).exec(page.html);
      expect(anchor?.[1], `link do sócio ${letter}`).toBe(`Sócio Ux ${letter} ${run}`);
    }
  });

  it.each(["operator", "viewer"] as const)("%s não tem nenhum link para sócio e vê os nomes em texto simples", async (role) => {
    const page = await getPage(sessions[role].jar, `${CLIENTS_PATH}/${clientId}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain("divisão igual: 1/2");
    expect(partnerLinks(page.html)).toHaveLength(0);
    expect(page.html).not.toMatch(new RegExp(`href="[^"]*${partnerP}`));
    expect(page.html).not.toMatch(new RegExp(`href="[^"]*${partnerQ}`));
    for (const letter of ["P", "Q"]) expect(page.text).toContain(`Sócio Ux ${letter} ${run}`);
  });
});

describe("UXC-46: um h1 e título '{Página} · Financeiro Ultra'", () => {
  /** Páginas que cada papel abre (o `roles` de quem só o Administrador abre é o próprio). */
  const pages: Array<{ label: string; path: () => string; title: string; roles: readonly CadRole[] }> = [
    { label: "lista de clientes", path: () => CLIENTS_PATH, title: "Clientes", roles: ROLES },
    { label: "novo cliente", path: () => `${CLIENTS_PATH}/novo`, title: "Novo cliente", roles: ["admin"] },
    { label: "detalhe do cliente", path: () => `${CLIENTS_PATH}/${clientId}`, title: "Cliente", roles: ROLES },
    { label: "edição do cliente", path: () => `${CLIENTS_PATH}/${clientId}/editar`, title: "Editar cliente", roles: ["admin"] },
    { label: "lista de sócios", path: () => PARTNERS_PATH, title: "Sócios", roles: ["admin"] },
    { label: "novo sócio", path: () => `${PARTNERS_PATH}/novo`, title: "Novo sócio", roles: ["admin"] },
    { label: "detalhe do sócio", path: () => `${PARTNERS_PATH}/${partnerP}`, title: "Sócio", roles: ["admin"] },
    { label: "edição do sócio", path: () => `${PARTNERS_PATH}/${partnerP}/editar`, title: "Editar sócio", roles: ["admin"] },
    { label: "novo recebedor", path: () => `${PARTNERS_PATH}/${partnerP}/recebedores/novo`, title: "Novo recebedor", roles: ["admin"] },
    { label: "edição do recebedor", path: () => `${PARTNERS_PATH}/${partnerP}/recebedores/${receiverId}`, title: "Recebedor", roles: ["admin"] },
    { label: "Apelidos", path: () => "/configuracoes/aliases", title: "Apelidos", roles: ["admin"] },
  ];

  const titlesOf = (html: string) => [...html.matchAll(/<title[^>]*>([^<]*)<\/title>/g)].map((match) => match[1]);
  const h1Count = (html: string) => (html.match(/<h1[\s>]/g) ?? []).length;

  it.each(pages)("$label: exatamente um h1 e title terminado em ' · Financeiro Ultra' (papéis que abrem)", async ({ path, title, roles }) => {
    for (const role of roles) {
      const page = await getPage(sessions[role].jar, path());
      const where = `${role} ${path()}`;
      expect(page.status, where).toBe(200);
      expect(page.text, where).not.toContain("Sem permissão");
      expect(h1Count(page.html), `${where}: quantidade de h1`).toBe(1);
      const titles = titlesOf(page.html);
      expect(titles, `${where}: um único title`).toHaveLength(1);
      expect(titles[0].endsWith(TITLE_SUFFIX), `${where}: "${titles[0]}"`).toBe(true);
      expect(titles[0], where).toBe(`${title}${TITLE_SUFFIX}`);
    }
  });

  it("quem não abre a página de escrita vê 'Sem permissão', ainda com um h1 e o título padrão", async () => {
    const adminOnly = pages.filter((entry) => entry.roles.length === 1);
    for (const role of ["operator", "viewer"] as const) {
      for (const entry of adminOnly) {
        const page = await getPage(sessions[role].jar, entry.path());
        const where = `${role} ${entry.path()}`;
        expect(page.text, where).toContain("Sem permissão");
        expect(h1Count(page.html), `${where}: quantidade de h1`).toBe(1);
        const titles = titlesOf(page.html);
        expect(titles, `${where}: um único title`).toHaveLength(1);
        expect(titles[0].endsWith(TITLE_SUFFIX), `${where}: "${titles[0]}"`).toBe(true);
      }
    }
  });
});
