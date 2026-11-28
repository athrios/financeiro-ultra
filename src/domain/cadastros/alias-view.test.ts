import { describe, expect, it } from "vitest";

import {
  ALIASES_HREF,
  ALIAS_KIND_LABELS,
  ALIAS_KIND_OPTIONS,
  aliasesEmptyKind,
  aliasesListHref,
  describeAliasCount,
  describeAliasOwner,
  describeAliasText,
  hasAliasFilters,
  parseAliasListParams,
  parseKindParam,
} from "./alias-view";
import { ALIAS_KINDS } from "./schemas";

const PARTNER = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";

describe("tipos (UI 5.4)", () => {
  it("rotula os cinco tipos como a UI manda", () => {
    expect(ALIAS_KIND_LABELS).toEqual({
      PARTNER_ALIAS: "Apelido de sócio",
      CLIENT_ALIAS: "Apelido de cliente",
      NAME_VARIANT: "Variação do nome",
      PIX_KEY: "Chave Pix",
      BANK_ACCOUNT: "Conta bancária",
    });
  });

  it("o filtro Tipo tem Todos e os cinco tipos, com a ordem e os textos da UI", () => {
    expect(ALIAS_KIND_OPTIONS.map((option) => option.label)).toEqual([
      "Todos",
      "Apelido de sócio",
      "Apelido de cliente",
      "Variação do nome de recebedor",
      "Chave Pix",
      "Conta bancária",
    ]);
    expect(ALIAS_KIND_OPTIONS[0].value).toBe("");
    expect(new Set(ALIAS_KIND_OPTIONS.map((option) => option.value)).size).toBe(ALIAS_KINDS.length + 1);
  });

  it("todo valor de opção volta ao mesmo tipo pela URL; o resto vira 'sem filtro'", () => {
    for (const option of ALIAS_KIND_OPTIONS.slice(1)) expect(parseKindParam(option.value)).not.toBeNull();
    expect(ALIAS_KINDS.map((kind) => parseKindParam(aliasesListHref({ kind }).split("tipo=")[1]))).toEqual([...ALIAS_KINDS]);
    expect(parseKindParam(undefined)).toBeNull();
    expect(parseKindParam("")).toBeNull();
    expect(parseKindParam("PIX_KEY")).toBeNull();
    expect(parseKindParam("constructor")).toBeNull();
    expect(parseKindParam(["pix", "conta"])).toBe("PIX_KEY");
  });
});

describe("parseAliasListParams", () => {
  it("sem parâmetros: padrão Ativos, página 1, 25 por página", () => {
    expect(parseAliasListParams({})).toEqual({ query: "", kind: null, status: "ACTIVE", page: 1, pageSize: 25 });
  });

  it("lê busca (aparada), tipo, situação, página e tamanho", () => {
    expect(parseAliasListParams({ q: "  maria  ", tipo: "pix", status: "todos", pagina: "3", por: "50" })).toEqual({
      query: "maria",
      kind: "PIX_KEY",
      status: "ALL",
      page: 3,
      pageSize: 50,
    });
    expect(parseAliasListParams({ status: "inativos" }).status).toBe("INACTIVE");
  });

  it("a URL é entrada não confiável: valores estranhos caem no padrão", () => {
    const parsed = parseAliasListParams({ tipo: "xxx", status: "ALL", pagina: "-2", por: "7" });
    expect(parsed).toMatchObject({ kind: null, status: "ACTIVE", page: 1, pageSize: 25 });
    expect(parseAliasListParams({ pagina: "0" }).page).toBe(1);
    expect(parseAliasListParams({ pagina: "9999999999" }).page).toBe(1);
    expect(parseAliasListParams({ pagina: "999999" }).page).toBe(100_000);
    expect(parseAliasListParams({ por: "100" }).pageSize).toBe(100);
  });

  it("usa o primeiro valor quando o parâmetro vem repetido e limita a busca a 200 caracteres", () => {
    expect(parseAliasListParams({ q: ["a", "b"] }).query).toBe("a");
    expect(parseAliasListParams({ q: "x".repeat(500) }).query).toHaveLength(200);
  });
});

describe("hasAliasFilters e aliasesListHref", () => {
  it("só busca, tipo ou situação diferente de Ativos contam como filtro", () => {
    expect(hasAliasFilters({ query: "", kind: null, status: "ACTIVE" })).toBe(false);
    expect(hasAliasFilters({ query: "a", kind: null, status: "ACTIVE" })).toBe(true);
    expect(hasAliasFilters({ query: "", kind: "PIX_KEY", status: "ACTIVE" })).toBe(true);
    expect(hasAliasFilters({ query: "", kind: null, status: "INACTIVE" })).toBe(true);
    expect(hasAliasFilters({ query: "", kind: null, status: "ALL" })).toBe(true);
  });

  it("omite o padrão e mantém a URL limpa", () => {
    expect(aliasesListHref()).toBe(ALIASES_HREF);
    expect(aliasesListHref({ status: "ACTIVE", page: 1, pageSize: 25, kind: null, q: "" })).toBe(ALIASES_HREF);
  });

  it("monta busca, tipo, situação, página e tamanho com a codificação certa", () => {
    expect(aliasesListHref({ q: "João & Cia", kind: "BANK_ACCOUNT", status: "INACTIVE", page: 2, pageSize: 100 })).toBe(
      "/configuracoes/aliases?q=Jo%C3%A3o+%26+Cia&tipo=conta&status=inativos&pagina=2&por=100",
    );
  });

  it("o endereço montado volta idêntico pelo parser", () => {
    const input = { q: "pix", kind: "PIX_KEY", status: "ALL", page: 4, pageSize: 50 } as const;
    const url = new URL(aliasesListHref(input), "http://x");
    expect(parseAliasListParams(Object.fromEntries(url.searchParams))).toEqual({
      query: "pix",
      kind: "PIX_KEY",
      status: "ALL",
      page: 4,
      pageSize: 50,
    });
  });
});

describe("describeAliasCount", () => {
  it("com busca ou tipo, 'encontrado(s)', no singular e no plural", () => {
    expect(describeAliasCount(1, { query: "a", kind: null, status: "ACTIVE" })).toBe("1 texto encontrado");
    expect(describeAliasCount(3, { query: "", kind: "PIX_KEY", status: "ALL" })).toBe("3 textos encontrados");
  });

  it("sem busca nem tipo, a situação", () => {
    expect(describeAliasCount(12, { query: "", kind: null, status: "ACTIVE" })).toBe("12 textos ativos");
    expect(describeAliasCount(1, { query: "", kind: null, status: "INACTIVE" })).toBe("1 texto inativo");
    expect(describeAliasCount(5, { query: "", kind: null, status: "ALL" })).toBe("5 textos");
  });
});

describe("describeAliasText", () => {
  it("apelido, variação e chave Pix saem como estão (sem mexer em maiúscula nem pontuação)", () => {
    expect(describeAliasText({ kind: "PARTNER_ALIAS", displayValue: "Fulana Exemplo A." })).toBe("Fulana Exemplo A.");
    expect(describeAliasText({ kind: "PIX_KEY", displayValue: "exemplo@example.com" })).toBe("exemplo@example.com");
    expect(describeAliasText({ kind: "NAME_VARIANT", displayValue: "F. EXEMPLO" })).toBe("F. EXEMPLO");
  });

  it("conta bancária: 'Banco {x} · Ag. {y} · Conta {z}'", () => {
    expect(describeAliasText({ kind: "BANK_ACCOUNT", displayValue: "Banco Fictício / 0001 / 12345-6" })).toBe(
      "Banco Banco Fictício · Ag. 0001 · Conta 12345-6",
    );
    expect(describeAliasText({ kind: "BANK_ACCOUNT", displayValue: "Exemplo / 1234 / 99-0" })).toBe(
      "Banco Exemplo · Ag. 1234 · Conta 99-0",
    );
  });

  it("nome de banco com ' / ' dentro continua inteiro; sem três partes, o texto vai como veio", () => {
    expect(describeAliasText({ kind: "BANK_ACCOUNT", displayValue: "Banco A / B / 0001 / 777" })).toBe(
      "Banco Banco A / B · Ag. 0001 · Conta 777",
    );
    expect(describeAliasText({ kind: "BANK_ACCOUNT", displayValue: "so um texto" })).toBe("so um texto");
    expect(describeAliasText({ kind: "BANK_ACCOUNT", displayValue: "a / b" })).toBe("a / b");
  });

  it("só a conta bancária é reformatada: ' / ' em outro tipo fica", () => {
    expect(describeAliasText({ kind: "PARTNER_ALIAS", displayValue: "a / b / c" })).toBe("a / b / c");
  });
});

describe("describeAliasOwner (coluna Pertence a, UI 5.4)", () => {
  it("sócio: o nome, com link para o detalhe do sócio", () => {
    expect(
      describeAliasOwner({ ownerKind: "PARTNER", ownerId: OWNER, ownerName: "Sócio Exemplo A", partnerId: OWNER, partnerName: "Sócio Exemplo A", ownerActive: true }),
    ).toEqual({ label: "Sócio Exemplo A", context: null, inactiveNote: null, href: `/configuracoes/socios/${OWNER}` });
  });

  it("cliente: o nome, com link para o detalhe do cliente", () => {
    expect(
      describeAliasOwner({ ownerKind: "CLIENT", ownerId: OWNER, ownerName: "Cliente Exemplo Ltda", partnerId: null, partnerName: null, ownerActive: true }),
    ).toEqual({ label: "Cliente Exemplo Ltda", context: null, inactiveNote: null, href: `/clientes/${OWNER}` });
  });

  it("recebedor: '{Titular} · sócio {Nome}', com link para o recebedor dentro do sócio", () => {
    expect(
      describeAliasOwner({ ownerKind: "RECEIVER", ownerId: OWNER, ownerName: "Titular Exemplo", partnerId: PARTNER, partnerName: "Sócio Exemplo B", ownerActive: true }),
    ).toEqual({
      label: "Titular Exemplo",
      context: " · sócio Sócio Exemplo B",
      inactiveNote: null,
      href: `/configuracoes/socios/${PARTNER}/recebedores/${OWNER}`,
    });
  });

  it("recebedor sem sócio na linha: só o titular e nenhum link inventado", () => {
    expect(
      describeAliasOwner({ ownerKind: "RECEIVER", ownerId: OWNER, ownerName: "Titular Exemplo", partnerId: null, partnerName: null, ownerActive: true }),
    ).toEqual({ label: "Titular Exemplo", context: null, inactiveNote: null, href: null });
  });

  it("dono inativo: o aviso diz se é sócio, recebedor ou cliente (SEG-CAD-08b)", () => {
    const base = { ownerId: OWNER, partnerId: PARTNER, partnerName: "Sócio Exemplo B", ownerActive: false };
    expect(describeAliasOwner({ ...base, ownerKind: "PARTNER", ownerName: "Sócio Exemplo B" }).inactiveNote).toBe("(sócio inativo)");
    expect(describeAliasOwner({ ...base, ownerKind: "RECEIVER", ownerName: "Titular Exemplo" }).inactiveNote).toBe("(recebedor inativo)");
    expect(describeAliasOwner({ ...base, ownerKind: "CLIENT", ownerName: "Cliente Exemplo Ltda", partnerId: null, partnerName: null }).inactiveNote).toBe(
      "(cliente inativo)",
    );
  });

  it("dono inativo mantém o nome e o link; dono ativo não leva aviso", () => {
    const inactive = describeAliasOwner({ ownerKind: "RECEIVER", ownerId: OWNER, ownerName: "Titular Exemplo", partnerId: PARTNER, partnerName: "Sócio Exemplo B", ownerActive: false });
    expect(inactive.label).toBe("Titular Exemplo");
    // N-02: o sócio vem depois do aviso, que fica colado ao titular.
    expect(inactive.context).toBe(" · sócio Sócio Exemplo B");
    expect(inactive.inactiveNote).toBe("(recebedor inativo)");
    expect(inactive.href).toBe(`/configuracoes/socios/${PARTNER}/recebedores/${OWNER}`);
    const active = describeAliasOwner({ ownerKind: "PARTNER", ownerId: OWNER, ownerName: "Sócio Exemplo A", partnerId: OWNER, partnerName: "Sócio Exemplo A", ownerActive: true });
    expect(active.inactiveNote).toBeNull();
  });

  it("não deixa um id estranho quebrar o endereço", () => {
    const owner = describeAliasOwner({ ownerKind: "CLIENT", ownerId: "a/b?c", ownerName: "X", partnerId: null, partnerName: null, ownerActive: true });
    expect(owner.href).toBe("/clientes/a%2Fb%3Fc");
  });
});

describe("estado vazio (T-31)", () => {
  it("Ativos e Inativos vazios dizem a situação; 'encontrado' só com busca ou tipo", () => {
    expect(aliasesEmptyKind({ query: "", kind: null, status: "ACTIVE" }, true)).toBe("NO_ACTIVE");
    expect(aliasesEmptyKind({ query: "", kind: null, status: "INACTIVE" }, true)).toBe("NO_INACTIVE");
    expect(aliasesEmptyKind({ query: "", kind: null, status: "ACTIVE" }, false)).toBe("NONE_AT_ALL");
    expect(aliasesEmptyKind({ query: "", kind: null, status: "INACTIVE" }, false)).toBe("NONE_AT_ALL");
    expect(aliasesEmptyKind({ query: "x", kind: null, status: "ACTIVE" }, true)).toBe("NO_RESULT");
    expect(aliasesEmptyKind({ query: "", kind: "PIX_KEY", status: "INACTIVE" }, true)).toBe("NO_RESULT");
    expect(aliasesEmptyKind({ query: "", kind: null, status: "ALL" }, true)).toBe("NO_RESULT");
  });
});
