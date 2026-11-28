import { describe, expect, it } from "vitest";

import {
  CLIENTS_SEARCH_HELP,
  REACTIVATE_BLOCKED_DESCRIPTION,
  clientActionLabel,
  clientActiveVariant,
  clientDetailHref,
  clientDialogTitle,
  clientEditHref,
  clientPendingLabel,
  clientsListHref,
  clientTypeLabel,
  clientUnexpectedMessage,
  describeClientAlias,
  describeClientCount,
  describeClientDivision,
  describeDocumentLine,
  describePageRange,
  formatMonthlyValue,
  hasClientFilters,
  inactivateClientDescription,
  pageCount,
  pageOffset,
  parseClientFlash,
  parseClientListParams,
  reactivateClientDescription,
  summarizePartners,
} from "./client-view";

const PARTNER = "a0000000-0000-4000-8000-000000000001";
const NBSP = " ";

describe("ajuda da busca de clientes (T-01, QA-CAD-08)", () => {
  it("avisa que CPF e CNPJ são buscados pelo começo e mantém a regra de acento, maiúscula e pontuação", () => {
    expect(CLIENTS_SEARCH_HELP).toBe(
      "Nome, nome fantasia, apelido, ou o começo do CPF ou do CNPJ. A busca ignora acento, maiúscula e pontuação.",
    );
  });

  it("não promete busca de documento por qualquer trecho", () => {
    expect(CLIENTS_SEARCH_HELP).not.toContain("CPF, CNPJ ou apelido");
    expect(CLIENTS_SEARCH_HELP).toContain("começo do CPF");
  });
});

describe("parseClientListParams", () => {
  it("sem parâmetros: padrão (ativos, página 1, 25 por página, sem sócio)", () => {
    expect(parseClientListParams({})).toEqual({ query: "", status: "ACTIVE", partnerId: null, page: 1, pageSize: 25 });
  });

  it("lê busca, situação, sócio, página e tamanho", () => {
    expect(
      parseClientListParams({ q: "  modelo ", status: "todos", socio: PARTNER.toUpperCase(), pagina: "3", por: "50" }),
    ).toEqual({ query: "modelo", status: "ALL", partnerId: PARTNER, page: 3, pageSize: 50 });
    expect(parseClientListParams({ status: "inativos" }).status).toBe("INACTIVE");
  });

  it("valores que não servem caem no padrão (a URL é entrada não confiável)", () => {
    expect(parseClientListParams({ status: "qualquer", socio: "nao-e-uuid", pagina: "0", por: "7" })).toEqual({
      query: "", status: "ACTIVE", partnerId: null, page: 1, pageSize: 25,
    });
    expect(parseClientListParams({ pagina: "-2" }).page).toBe(1);
    expect(parseClientListParams({ pagina: "abc" }).page).toBe(1);
    expect(parseClientListParams({ pagina: "1.5" }).page).toBe(1);
    expect(parseClientListParams({ pagina: "99999999999" }).page).toBe(1);
    expect(parseClientListParams({ pagina: "999999" }).page).toBe(100_000);
    expect(parseClientListParams({ por: "100" }).pageSize).toBe(100);
  });

  it("usa o primeiro valor quando o parâmetro se repete e limita a busca a 200 caracteres", () => {
    expect(parseClientListParams({ q: ["a", "b"], socio: [PARTNER, "x"] })).toMatchObject({ query: "a", partnerId: PARTNER });
    expect(parseClientListParams({ q: "x".repeat(500) }).query).toHaveLength(200);
  });

  it("hasClientFilters: só busca, situação diferente de ativos ou sócio contam", () => {
    expect(hasClientFilters({ query: "", status: "ACTIVE", partnerId: null })).toBe(false);
    expect(hasClientFilters({ query: "a", status: "ACTIVE", partnerId: null })).toBe(true);
    expect(hasClientFilters({ query: "", status: "ALL", partnerId: null })).toBe(true);
    expect(hasClientFilters({ query: "", status: "ACTIVE", partnerId: PARTNER })).toBe(true);
  });
});

describe("clientsListHref", () => {
  it("omite o que é padrão", () => {
    expect(clientsListHref()).toBe("/clientes");
    expect(clientsListHref({ status: "ACTIVE", page: 1, pageSize: 25, partnerId: null, q: "" })).toBe("/clientes");
  });

  it("leva busca, situação, sócio, página e tamanho, com codificação", () => {
    expect(clientsListHref({ q: "açaí & cia", status: "ALL", partnerId: PARTNER, page: 2, pageSize: 50 })).toBe(
      `/clientes?q=a%C3%A7a%C3%AD+%26+cia&status=todos&socio=${PARTNER}&pagina=2&por=50`,
    );
    expect(clientsListHref({ status: "INACTIVE" })).toBe("/clientes?status=inativos");
  });

  it("o link do detalhe do sócio (P-E5b-03) é lido de volta como filtro por sócio e todos", () => {
    const url = new URL(`http://x/clientes?socio=${PARTNER}&status=todos`);
    const params = parseClientListParams(Object.fromEntries(url.searchParams));
    expect(params).toMatchObject({ partnerId: PARTNER, status: "ALL" });
  });
});

describe("paginação", () => {
  it("deslocamento e número de páginas", () => {
    expect(pageOffset(1, 25)).toBe(0);
    expect(pageOffset(3, 25)).toBe(50);
    expect(pageOffset(0, 25)).toBe(0);
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(25, 25)).toBe(1);
    expect(pageCount(26, 25)).toBe(2);
    expect(pageCount(128, 50)).toBe(3);
  });

  it('"1–25 de 128" com travessão', () => {
    expect(describePageRange(0, 25, 128)).toBe("1–25 de 128");
    expect(describePageRange(125, 3, 128)).toBe("126–128 de 128");
    expect(describePageRange(0, 0, 0)).toBe("0 de 0");
  });
});

describe("describeClientCount", () => {
  const none = { query: "", partnerId: null };
  it("sem filtro: pela situação, com singular", () => {
    expect(describeClientCount(128, { ...none, status: "ACTIVE" })).toBe("128 clientes ativos");
    expect(describeClientCount(1, { ...none, status: "ACTIVE" })).toBe("1 cliente ativo");
    expect(describeClientCount(2, { ...none, status: "INACTIVE" })).toBe("2 clientes inativos");
    expect(describeClientCount(1, { ...none, status: "INACTIVE" })).toBe("1 cliente inativo");
    expect(describeClientCount(5, { ...none, status: "ALL" })).toBe("5 clientes");
  });

  it("com busca ou sócio: encontrados", () => {
    expect(describeClientCount(3, { query: "a", partnerId: null, status: "ACTIVE" })).toBe("3 clientes encontrados");
    expect(describeClientCount(1, { query: "", partnerId: PARTNER, status: "ALL" })).toBe("1 cliente encontrado");
  });
});

describe("linhas da lista", () => {
  it("mensalidade em R$ a partir do texto decimal", () => {
    expect(formatMonthlyValue("1250.00")).toBe(`R$${NBSP}1.250,00`);
    expect(formatMonthlyValue("10")).toBe(`R$${NBSP}10,00`);
    expect(formatMonthlyValue("0.5")).toBe(`R$${NBSP}0,50`);
    expect(formatMonthlyValue("12345678901.99")).toBe(`R$${NBSP}12.345.678.901,99`);
    expect(formatMonthlyValue("abc")).toBe("abc");
  });

  it("documento: rótulo e número formatado; sem documento", () => {
    expect(describeDocumentLine("00000000191")).toEqual({ label: "CPF", text: "000.000.001-91" });
    expect(describeDocumentLine("12ABC34501DE35")).toEqual({ label: "CNPJ", text: "12.ABC.345/01DE-35" });
    expect(describeDocumentLine(null)).toEqual({ label: null, text: "Sem documento" });
    expect(describeDocumentLine("")).toEqual({ label: null, text: "Sem documento" });
  });

  it("sócios: até três nomes e depois 'e mais k'; fração 1/n", () => {
    expect(summarizePartners(["A", "B", "C"], 3)).toEqual({ names: "A, B, C", hiddenCount: 0, allNames: "A, B, C", division: "3 sócios · 1/3 cada" });
    expect(summarizePartners(["A", "B", "C", "D", "E"], 5)).toEqual({
      names: "A, B, C e mais 2", hiddenCount: 2, allNames: "A, B, C, D, E", division: "5 sócios · 1/5 cada",
    });
    expect(summarizePartners(["A"], 1).division).toBe("1 sócio · 1/1");
    expect(summarizePartners([], 0)).toEqual({ names: "", hiddenCount: 0, allNames: "", division: "Nenhum sócio indicado" });
  });
});

describe("detalhe", () => {
  it("tipo: só CPF ou CNPJ; sem documento, nenhum", () => {
    expect(clientTypeLabel("CPF")).toBe("CPF");
    expect(clientTypeLabel("CNPJ")).toBe("CNPJ");
    expect(clientTypeLabel(null)).toBeNull();
  });

  it("divisão: a prévia da UI 4.1.4 e o caso sem sócio", () => {
    expect(describeClientDivision(3)).toBe("3 sócios · divisão igual: 1/3 para cada um (≈ 33,33%)");
    expect(describeClientDivision(2)).toBe("2 sócios · divisão igual: 1/2 para cada um (50%)");
    expect(describeClientDivision(1)).toBe("1 sócio · divisão: 1/1 (100%)");
    expect(describeClientDivision(0)).toBe("Nenhum sócio indicado.");
  });

  it("apelido: nome como digitado; documento com o tipo", () => {
    expect(describeClientAlias({ type: "NAME", displayValue: "Modelo" })).toBe("Modelo");
    expect(describeClientAlias({ type: "DOCUMENT", displayValue: "000.000.001-91" })).toBe("CPF 000.000.001-91");
    expect(describeClientAlias({ type: "DOCUMENT", displayValue: "12.ABC.345/01DE-35" })).toBe("CNPJ 12.ABC.345/01DE-35");
  });

  it("endereços do detalhe e da edição", () => {
    expect(clientDetailHref("id-1")).toBe("/clientes/id-1");
    expect(clientDetailHref("id-1", "salvo")).toBe("/clientes/id-1?aviso=salvo");
    expect(clientEditHref("id-1")).toBe("/clientes/id-1/editar");
  });
});

describe("parseClientFlash", () => {
  it("só as chaves fixas valem; o texto é sempre o da UI", () => {
    expect(parseClientFlash("criado")).toEqual({ tone: "success", message: "Cliente cadastrado." });
    expect(parseClientFlash("salvo")).toEqual({ tone: "success", message: "Alterações salvas." });
    expect(parseClientFlash("inativado")?.message).toBe("Cliente inativado.");
    expect(parseClientFlash("reativado")?.message).toBe("Cliente reativado.");
    expect(parseClientFlash("ja-inativo")).toEqual({ tone: "info", message: "Este cliente já está inativo. A tela foi atualizada." });
    expect(parseClientFlash("ja-ativo")?.tone).toBe("info");
    expect(parseClientFlash(["criado", "x"])?.message).toBe("Cliente cadastrado.");
  });

  it("chave desconhecida, ausente ou com texto forjado não mostra nada", () => {
    expect(parseClientFlash(undefined)).toBeNull();
    expect(parseClientFlash("<b>oi</b>")).toBeNull();
    expect(parseClientFlash("toString")).toBeNull();
    expect(parseClientFlash("Cliente apagado")).toBeNull();
  });
});

describe("diálogo de inativar e reativar cliente (UI 6.3 e 6.4)", () => {
  it("a variante vem da situação e dos sócios ativos que a página leu", () => {
    expect(clientActiveVariant({ active: true, activePartnerCount: 2 })).toBe("inactivate");
    expect(clientActiveVariant({ active: false, activePartnerCount: 1 })).toBe("reactivate");
    expect(clientActiveVariant({ active: false, activePartnerCount: 0 })).toBe("blocked");
  });

  it("títulos", () => {
    expect(clientDialogTitle("inactivate", "Cliente Modelo Ltda")).toBe("Inativar Cliente Modelo Ltda?");
    expect(clientDialogTitle("reactivate", "Cliente Modelo Ltda")).toBe("Reativar Cliente Modelo Ltda?");
    expect(clientDialogTitle("blocked", "Cliente Modelo Ltda")).toBe("Não é possível reativar Cliente Modelo Ltda");
  });

  it("inativar: texto exato com os sócios indicados", () => {
    expect(inactivateClientDescription(["Sócio Exemplo A", "Sócio Exemplo B"])).toBe(
      "O cadastro continua guardado e pode ser reativado depois. Os sócios indicados (Sócio Exemplo A, Sócio Exemplo B) continuam registrados. Recebimentos já registrados não mudam.",
    );
  });

  it("inativar sem sócio na lista: omite a frase dos sócios em vez de mostrar parênteses vazios", () => {
    expect(inactivateClientDescription([])).toBe(
      "O cadastro continua guardado e pode ser reativado depois. Recebimentos já registrados não mudam.",
    );
  });

  it("reativar: contagem, nomes, fração e percentual (singular, par e dízima)", () => {
    expect(reactivateClientDescription(["Sócio Exemplo A"])).toBe(
      "O cliente volta para a lista de ativos com 1 sócio: Sócio Exemplo A. A divisão é igual: 1/1 para cada um (100%).",
    );
    expect(reactivateClientDescription(["Sócio Exemplo A", "Sócio Exemplo B"])).toBe(
      "O cliente volta para a lista de ativos com 2 sócios: Sócio Exemplo A, Sócio Exemplo B. A divisão é igual: 1/2 para cada um (50%).",
    );
    expect(reactivateClientDescription(["A", "B", "C"])).toBe(
      "O cliente volta para a lista de ativos com 3 sócios: A, B, C. A divisão é igual: 1/3 para cada um (≈ 33,33%).",
    );
  });

  it("bloqueio, rótulos e falha inesperada: textos da UI", () => {
    expect(REACTIVATE_BLOCKED_DESCRIPTION).toBe(
      "Todo cliente ativo precisa de pelo menos um sócio, e este cliente está sem sócio ativo. Indique um sócio na edição do cliente e depois reative.",
    );
    expect(clientActionLabel("inactivate")).toBe("Inativar cliente");
    expect(clientActionLabel("reactivate")).toBe("Reativar cliente");
    expect(clientPendingLabel("inactivate")).toBe("Inativando…");
    expect(clientPendingLabel("reactivate")).toBe("Reativando…");
    expect(clientUnexpectedMessage(false)).toBe("Não foi possível inativar o cliente agora. Tente novamente em instantes.");
    expect(clientUnexpectedMessage(true)).toBe("Não foi possível reativar o cliente agora. Tente novamente em instantes.");
  });

  it("avisos de sucesso: 'inativado' e 'reativado' (UI 6.3 e 6.4) e o endereço com a chave", () => {
    expect(parseClientFlash("inativado")).toEqual({ tone: "success", message: "Cliente inativado." });
    expect(parseClientFlash("reativado")).toEqual({ tone: "success", message: "Cliente reativado." });
    expect(clientDetailHref(PARTNER, "ja-ativo")).toBe(`/clientes/${PARTNER}?aviso=ja-ativo`);
  });
});
