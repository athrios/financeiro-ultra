import { beforeAll, describe, expect, it } from "vitest";

import {
  CLIENTS_PATH,
  PARTNERS_PATH,
  cadSessions,
  callAction,
  clientFields,
  createPartner,
  errorOf,
  flashOf,
  idAfter,
  randomCnpj,
  randomCpf,
  receiverFields,
  runSuffix,
  type CadRole,
} from "./support/cadastros";
import type { Session } from "./support/http";
import { getPage } from "./support/pages";

/**
 * CAD-001 · E10 (aplicação), por HTTP e sem navegador: texto com NUL (QA-CAD-05), tipo de documento
 * em português (QA-CAD-06) e teto de itens das listas (QA-CAD-07, hoje regra de negócio RAT-D026).
 * Dados fictícios com sufixo único.
 *
 * Os números do teto são os de `src/domain/cadastros/limits.ts` (RAT-D026): 2 apelidos por sócio; 2 nomes
 * e 2 documentos (CPF e CNPJ juntos) por cliente; 30 formas do nome, 10 chaves Pix e 10 contas por
 * recebedor. O banco é a autoridade (`private.cad_list_limit`); estes testes provam a recusa na ação. Se
 * os números mudarem lá, ajuste aqui.
 */

const run = runSuffix();
const NUL = "\u0000";
const INVALID_TEXT = "O texto tem um caractere inválido.";
const NEW_CLIENT = `${CLIENTS_PATH}/novo`;
const NEW_PARTNER = `${PARTNERS_PATH}/novo`;

let sessions: Record<CadRole, Session>;
let admin: Session;
let partnerId = "";

beforeAll(async () => {
  sessions = cadSessions();
  admin = sessions.admin;
  partnerId = await createPartner(admin, `Sócio Limites ${run}`);
});

const names = (count: number, prefix: string) => Array.from({ length: count }, (_, index) => `${prefix} ${run} ${index + 1}`);

describe("QA-CAD-05: NUL na busca e nos formulários", () => {
  const needle = `zz${run}${NUL}yy`;

  it.each([
    ["/clientes", "Nenhum cliente encontrado"],
    ["/configuracoes/aliases", "Nenhum texto encontrado."],
  ])("%s?q=...%%00... responde a página normal, sem cair no error.tsx", async (path, empty) => {
    const page = await getPage(admin.jar, `${path}?q=${encodeURIComponent(needle)}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain(empty);
    expect(page.text).not.toContain("Não foi possível carregar");
  });

  it("a lista de sócios também aceita o NUL na busca", async () => {
    const page = await getPage(admin.jar, `${PARTNERS_PATH}?q=${encodeURIComponent(needle)}`);
    expect(page.status).toBe(200);
    expect(page.text).not.toContain("Não foi possível carregar");
  });

  it("savePartnerAction com NUL no nome e no apelido: VALIDATION com a frase, nada gravado", async () => {
    for (const fields of [
      [["name", `Sócio ${run}${NUL}x`]],
      [
        ["name", `Sócio Nul ${run}`],
        ["aliases", `Apelido${NUL}x`],
      ],
      [
        ["name", `Sócio Nul ${run}`],
        ["reason", `motivo${NUL}x`],
      ],
    ] as Array<Array<[string, string]>>) {
      const result = await callAction(admin, NEW_PARTNER, "savePartnerAction", fields);
      expect(result.failed).toBe(true);
      expect(result.code).toBe("VALIDATION");
      expect(result.text).toContain(INVALID_TEXT);
      expect(result.text).not.toContain("UNEXPECTED");
      expect(result.location).toBeNull();
    }
    const list = await getPage(admin.jar, `${PARTNERS_PATH}?status=todos&q=${encodeURIComponent(`Sócio Nul ${run}`)}`);
    // A busca ecoa o texto digitado: a ausência se prova pelos links da lista (um por sócio).
    expect([...list.html.matchAll(/href="\/configuracoes\/socios\/[0-9a-f-]{36}"/g)]).toHaveLength(0);
  });

  it("saveClientAction e saveReceiverAction com NUL: VALIDATION com a frase", async () => {
    const client = await callAction(
      admin,
      NEW_CLIENT,
      "saveClientAction",
      clientFields({ name: `Cliente Nul ${run}`, notes: `obs${NUL}x`, partnerIds: [partnerId] }),
    );
    expect(client.failed).toBe(true);
    expect(client.code).toBe("VALIDATION");
    expect(client.text).toContain(INVALID_TEXT);

    const alias = await callAction(
      admin,
      NEW_CLIENT,
      "saveClientAction",
      clientFields({ name: `Cliente Nul ${run}`, partnerIds: [partnerId], aliases: [["NAME", `a${NUL}b`]] }),
    );
    expect(alias.failed).toBe(true);
    expect(alias.code).toBe("VALIDATION");
    expect(alias.text).toContain(INVALID_TEXT);

    const receiver = await callAction(
      admin,
      `${PARTNERS_PATH}/${partnerId}/recebedores/novo`,
      "saveReceiverAction",
      receiverFields(partnerId, { holder: `Titular Nul ${run}`, pixKeys: [`chave${NUL}x`] }),
    );
    expect(receiver.failed).toBe(true);
    expect(receiver.code).toBe("VALIDATION");
    expect(receiver.text).toContain(INVALID_TEXT);
  });
});

describe("QA-CAD-06: tipo de documento fora de CPF/CNPJ", () => {
  it.each(["XYZ", "cpf", "CNPJ "])("documentType %j: VALIDATION em português no campo, sem texto em inglês", async (bad) => {
    const fields = clientFields({ name: `Cliente Tipo ${run}`, document: randomCpf(), partnerIds: [partnerId] }).filter(
      ([name]) => name !== "documentType",
    );
    fields.push(["documentType", bad]);
    const result = await callAction(admin, NEW_CLIENT, "saveClientAction", fields);
    expect(result.failed).toBe(true);
    expect(result.code).toBe("VALIDATION");
    expect(result.text).toContain("Escolha CPF ou CNPJ.");
    expect(result.text).toContain('"documentType"');
    expect(result.text).not.toContain("Invalid option");
    expect(result.location).toBeNull();
  });
});

describe("RAT-D026: teto de itens (VALIDATION em vez de UNEXPECTED por tempo)", () => {
  /** A recusa certa: VALIDATION, a frase exata no campo da lista, nada gravado e nenhum erro inesperado. */
  function expectLimit(result: Awaited<ReturnType<typeof callAction>>, field: string, message: string, label: string) {
    expect(result.failed, label).toBe(true);
    expect(result.code, label).toBe("VALIDATION");
    expect(result.text, label).toContain(message);
    expect(result.text, label).not.toContain("UNEXPECTED");
    expect(result.location, label).toBeNull();
    expect(errorOf(result)?.fieldErrors[field], label).toBe(message);
  }

  const receiverPath = () => `${PARTNERS_PATH}/${partnerId}/recebedores/novo`;
  const accountsOf = (count: number, bank: string): Array<[string, string, string]> =>
    Array.from({ length: count }, (_, index): [string, string, string] => [bank, "0001", `${index + 1}`]);

  it("as telas de cadastro dizem o limite antes de bater nele (ajuda inicial, UXC-47)", async () => {
    const partnerPage = await getPage(admin.jar, NEW_PARTNER);
    expect(partnerPage.status).toBe(200);
    expect(partnerPage.text).toContain("Até 2 apelidos ativos.");

    const clientPage = await getPage(admin.jar, NEW_CLIENT);
    expect(clientPage.status).toBe(200);
    expect(clientPage.text).toContain("Até 2 nomes e 2 documentos ativos. CPF e CNPJ contam juntos.");

    const receiverPage = await getPage(admin.jar, receiverPath());
    expect(receiverPage.status).toBe(200);
    expect(receiverPage.text).toContain("Até 30 formas do nome ativas.");
    expect(receiverPage.text).toContain("Até 10 chaves Pix ativas.");
    expect(receiverPage.text).toContain("Até 10 contas ativas.");
  });

  it("sócio: 2 apelidos são gravados e 3 são recusados com 'No máximo 2 apelidos.'", async () => {
    const ok = await callAction(admin, NEW_PARTNER, "savePartnerAction", [
      ["name", `Sócio Cheio ${run}`],
      ...names(2, "Apelido").map((value): [string, string] => ["aliases", value]),
    ]);
    expect(flashOf(ok)).toBe("criado");

    const over = await callAction(admin, NEW_PARTNER, "savePartnerAction", [
      ["name", `Sócio Demais ${run}`],
      ...names(3, "ApelidoB").map((value): [string, string] => ["aliases", value]),
    ]);
    expectLimit(over, "aliases", "No máximo 2 apelidos.", "3 apelidos");
  });

  it("cliente: 2 nomes e 2 documentos são gravados (CPF e CNPJ juntos); o 3.º de cada tipo é recusado", async () => {
    const nameAliases = (count: number, prefix: string) => names(count, prefix).map((value): ["NAME", string] => ["NAME", value]);
    const created = await callAction(
      admin,
      NEW_CLIENT,
      "saveClientAction",
      clientFields({
        name: `Cliente Dois e Dois ${run}`,
        partnerIds: [partnerId],
        aliases: [...nameAliases(2, "NomeOk"), ["DOCUMENT", randomCpf()], ["DOCUMENT", randomCnpj()]],
      }),
    );
    expect(idAfter(created.location, "/clientes"), `${created.status} ${created.text.slice(0, 200)}`).not.toBe("");

    // O 3.º nome: a frase de nomes, mesmo com 2 documentos juntos ao lado.
    const thirdName = await callAction(
      admin,
      NEW_CLIENT,
      "saveClientAction",
      clientFields({
        name: `Cliente Terceiro Nome ${run}`,
        partnerIds: [partnerId],
        aliases: [...nameAliases(3, "NomeB"), ["DOCUMENT", randomCpf()]],
      }),
    );
    expectLimit(thirdName, "aliases", "No máximo 2 nomes.", "3 nomes");

    // O 3.º documento (CPF + CNPJ + CPF): a frase de documentos, mesmo com 2 nomes ao lado.
    const thirdDocument = await callAction(
      admin,
      NEW_CLIENT,
      "saveClientAction",
      clientFields({
        name: `Cliente Terceiro Documento ${run}`,
        partnerIds: [partnerId],
        aliases: [...nameAliases(2, "NomeC"), ["DOCUMENT", randomCpf()], ["DOCUMENT", randomCnpj()], ["DOCUMENT", randomCpf()]],
      }),
    );
    expectLimit(thirdDocument, "aliases", "No máximo 2 documentos.", "3 documentos");
  });

  it("recebedor: 30 formas do nome, 10 chaves Pix e 10 contas são gravadas; a 31.ª, a 11.ª e a 11.ª são recusadas", async () => {
    const ok = await callAction(
      admin,
      receiverPath(),
      "saveReceiverAction",
      receiverFields(partnerId, {
        holder: `Titular Cheio ${run}`,
        variants: names(30, "FormaOk"),
        pixKeys: names(10, "chaveok").map((value, index) => `ok${index}-${value.replace(/\s/g, "")}@example.com`),
        accounts: accountsOf(10, `Banco Cheio ${run}`),
      }),
    );
    expect(flashOf(ok), `${ok.status} ${ok.text.slice(0, 200)}`).toBe("recebedor-criado");

    const variants = await callAction(
      admin,
      receiverPath(),
      "saveReceiverAction",
      receiverFields(partnerId, { holder: `Titular Formas ${run}`, variants: names(31, "Forma") }),
    );
    expectLimit(variants, "variants", "No máximo 30 formas do nome.", "31 formas do nome");

    const pix = await callAction(
      admin,
      receiverPath(),
      "saveReceiverAction",
      receiverFields(partnerId, {
        holder: `Titular Pix ${run}`,
        pixKeys: names(11, "chave").map((value, index) => `p${index}-${value.replace(/\s/g, "")}@example.com`),
      }),
    );
    expectLimit(pix, "pixKeys", "No máximo 10 chaves Pix.", "11 chaves Pix");

    const accounts = await callAction(
      admin,
      receiverPath(),
      "saveReceiverAction",
      receiverFields(partnerId, { holder: `Titular Conta ${run}`, accounts: accountsOf(11, `Banco Demais ${run}`) }),
    );
    expectLimit(accounts, "accounts", "No máximo 10 contas.", "11 contas");
  });

  it("3.000 itens de cada lista são recusados com a frase do teto, rápido e sem UNEXPECTED", async () => {
    const started = Date.now();
    const count = 3000;
    const cases: Array<[string, () => Promise<Awaited<ReturnType<typeof callAction>>>, string, string]> = [
      [
        "apelidos do sócio",
        () =>
          callAction(admin, NEW_PARTNER, "savePartnerAction", [
            ["name", `Sócio Três Mil ${run}`],
            ...names(count, "ApelidoM").map((value): [string, string] => ["aliases", value]),
          ]),
        "aliases",
        "No máximo 2 apelidos.",
      ],
      [
        "nomes do cliente",
        () =>
          callAction(
            admin,
            NEW_CLIENT,
            "saveClientAction",
            clientFields({
              name: `Cliente Três Mil ${run}`,
              partnerIds: [partnerId],
              aliases: names(count, "NomeM").map((value): ["NAME", string] => ["NAME", value]),
            }),
          ),
        "aliases",
        "No máximo 2 nomes.",
      ],
      [
        "formas do nome",
        () =>
          callAction(
            admin,
            receiverPath(),
            "saveReceiverAction",
            receiverFields(partnerId, { holder: `Titular Três Mil ${run}`, variants: names(count, "FormaM") }),
          ),
        "variants",
        "No máximo 30 formas do nome.",
      ],
    ];
    for (const [label, send, field, message] of cases) {
      expectLimit(await send(), field, message, `${count} ${label}`);
    }
    // N-03: a prova é o código VALIDATION; o teto de tempo só pega travamento e folga para máquina ocupada.
    expect(Date.now() - started).toBeLessThan(60_000);
  }, 120_000);
});
