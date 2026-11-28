import { beforeAll, describe, expect, it } from "vitest";

import { CLIENTS_PATH, cadSessions, createClient, createPartner, runSuffix } from "./support/cadastros";
import type { Session } from "./support/http";
import { getPage } from "./support/pages";

/**
 * CAD-001 · lista de Clientes com massa maior que uma página (E10, testes permanentes; CA-19, UXC-13),
 * por HTTP e sem navegador: paginação com mais de 25 itens, `por=50`, página além do fim, ordem sem
 * repetido nem faltante, e busca por nome fantasia e por apelido pela PÁGINA (não só pela função
 * `search_clients`, que o pgTAP já cobre).
 *
 * São criados 27 clientes com um prefixo único da execução e um sócio novo (os sócios do seed não
 * recebem cliente novo). A lista é sempre filtrada pelo prefixo, então o crescimento do banco não
 * interfere. Tudo fictício (RAT-D019).
 */

const run = runSuffix();
const TOTAL = 27;
const PAGE_SIZE = 25;
const PREFIX = `Lote ${run}`;

let admin: Session;
/** Ids na ordem esperada da lista (nome com número de dois dígitos, ordem alfabética = ordem de criação). */
const created: string[] = [];

const pad = (index: number) => String(index).padStart(2, "0");
const listAt = (query: string) => getPage(admin.jar, `${CLIENTS_PATH}?${query}`);
const q = (value: string) => `q=${encodeURIComponent(value)}`;
/** Clientes listados na página (uma ligação por linha), na ordem em que aparecem. */
const clientIds = (page: { html: string }) => [...new Set([...page.html.matchAll(/href="\/clientes\/([0-9a-f-]{36})"/g)].map((match) => match[1]))];
const decode = (value: string) => value.replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"');

beforeAll(async () => {
  admin = cadSessions().admin;
  const partnerId = await createPartner(admin, `Sócio Lote ${run}`);
  for (let index = 1; index <= TOTAL; index += 1) {
    created.push(
      await createClient(admin, {
        name: `${PREFIX} ${pad(index)}`,
        trade: `Fantasia ${run} ${pad(index)}`,
        partnerIds: [partnerId],
        aliases: [["NAME", `Apelido Lote ${run} ${pad(index)}`]],
      }),
    );
  }
}, 120_000);

describe("paginação com mais de 25 clientes (CA-19)", () => {
  it("a primeira página mostra '1–25 de 27' e 25 linhas, com 'Próxima' e sem 'Anterior' ativo", async () => {
    const page = await listAt(q(PREFIX));
    expect(page.status).toBe(200);
    expect(page.text).toContain(`1–${PAGE_SIZE} de ${TOTAL}`);
    expect(clientIds(page)).toEqual(created.slice(0, PAGE_SIZE));
    expect(page.html).toMatch(/rel="next"/);
    expect(page.html).not.toMatch(/rel="prev"/);
  });

  it("a segunda página mostra '26–27 de 27' e os dois últimos, com 'Anterior' e sem 'Próxima' ativa", async () => {
    const page = await listAt(`${q(PREFIX)}&pagina=2`);
    expect(page.status).toBe(200);
    expect(page.text).toContain(`${PAGE_SIZE + 1}–${TOTAL} de ${TOTAL}`);
    expect(clientIds(page)).toEqual(created.slice(PAGE_SIZE));
    expect(page.html).toMatch(/rel="prev"/);
    expect(page.html).not.toMatch(/rel="next"/);
  });

  it("as duas páginas juntas têm todos os clientes, na ordem do nome, sem repetido nem faltante", async () => {
    const first = clientIds(await listAt(q(PREFIX)));
    const second = clientIds(await listAt(`${q(PREFIX)}&pagina=2`));
    const all = [...first, ...second];
    expect(all).toHaveLength(TOTAL);
    expect(new Set(all).size).toBe(TOTAL);
    expect(all).toEqual(created);
  });

  it("por=50 mostra os 27 numa página só, sem 'Próxima' nem 'Anterior' ativas", async () => {
    const page = await listAt(`${q(PREFIX)}&por=50`);
    expect(page.status).toBe(200);
    expect(page.text).toContain(`1–${TOTAL} de ${TOTAL}`);
    expect(clientIds(page)).toEqual(created);
    expect(page.html).not.toMatch(/rel="next"/);
    expect(page.html).not.toMatch(/rel="prev"/);
  });

  it("página além do fim volta ao começo da mesma lista (mantém a busca) e mostra '1–25 de 27'", async () => {
    const beyond = await listAt(`${q(PREFIX)}&pagina=3`);
    expect(beyond.html).toContain("__next-page-redirect");
    const target = /NEXT_REDIRECT;replace;([^;]+);307/.exec(beyond.html)?.[1];
    expect(target, "destino do redirecionamento").toBeTruthy();
    const url = new URL(decode(target ?? ""), "http://x");
    expect(url.pathname).toBe(CLIENTS_PATH);
    expect(url.searchParams.get("q")).toBe(PREFIX);
    expect(url.searchParams.has("pagina")).toBe(false);
    const landed = await getPage(admin.jar, `${url.pathname}${url.search}`);
    expect(landed.text).toContain(`1–${PAGE_SIZE} de ${TOTAL}`);
    expect(clientIds(landed)).toEqual(created.slice(0, PAGE_SIZE));
  });

  it("com por=50, a página 2 já é além do fim e também volta ao começo", async () => {
    const beyond = await listAt(`${q(PREFIX)}&por=50&pagina=2`);
    expect(beyond.html).toContain("__next-page-redirect");
    expect(beyond.html).toContain("NEXT_REDIRECT;replace;/clientes?");
  });
});

describe("busca pela página: nome fantasia e apelido (CA-19)", () => {
  it("o nome fantasia acha o cliente certo e só ele", async () => {
    const page = await listAt(q(`Fantasia ${run} 07`));
    expect(page.status).toBe(200);
    expect(clientIds(page)).toEqual([created[6]]);
    expect(page.text).toMatch(/1 cliente encontrado/);
    expect(page.text).toContain(`${PREFIX} 07`);
  });

  it("o nome fantasia sem acento e em maiúsculas acha o mesmo cliente", async () => {
    const page = await listAt(q(`FANTASIA ${run.toUpperCase()} 21`));
    expect(clientIds(page)).toEqual([created[20]]);
  });

  it("o apelido acha o cliente certo e só ele, mesmo sem o nome aparecer na busca", async () => {
    const page = await listAt(q(`Apelido Lote ${run} 13`));
    expect(page.status).toBe(200);
    expect(clientIds(page)).toEqual([created[12]]);
    expect(page.text).toMatch(/1 cliente encontrado/);
    expect(page.text).toContain(`${PREFIX} 13`);
  });

  it("o trecho comum do nome fantasia acha os 27, e o do apelido também (a busca por trecho funciona pela página)", async () => {
    const byTrade = await listAt(`${q(`Fantasia ${run}`)}&por=50`);
    expect(clientIds(byTrade)).toEqual(created);
    const byAlias = await listAt(`${q(`Apelido Lote ${run}`)}&por=50`);
    expect(clientIds(byAlias)).toEqual(created);
  });

  it("busca que não bate com nada mostra o estado vazio e nenhuma linha", async () => {
    const page = await listAt(q(`Fantasia ${run} 99`));
    expect(clientIds(page)).toHaveLength(0);
    expect(page.text).toContain("Nenhum cliente encontrado");
  });
});
