import { describe, expect, it } from "vitest";

import {
  buildClientSaveSchema,
  clientSaveSchema,
  clientSetActiveSchema,
  fieldErrorsFromZod,
  findAccountProblems,
  pageToOffset,
  partnerSaveSchema,
  partnerSetActiveSchema,
  receiverSaveSchema,
  receiverSetActiveSchema,
  searchAliasesSchema,
  searchClientsSchema,
  updatedAtTextSchema,
  VERSION_MESSAGE,
} from "./schemas";

const PARTNER_A = "a0000000-0000-4000-8000-000000000001";
const PARTNER_B = "a0000000-0000-4000-8000-000000000002";
const CLIENT_ID = "c0000000-0000-4000-8000-000000000001";
const RECEIVER_ID = "e0000000-0000-4000-8000-000000000001";
const VERSION = "2026-11-25T14:03:11.123456+00:00";

function errorsOf(result: { success: boolean; error?: Parameters<typeof fieldErrorsFromZod>[0] }) {
  if (result.success || !result.error) throw new Error("esperava falha de validação");
  return fieldErrorsFromZod(result.error);
}

describe("updated_at como texto (6.2 e F-03)", () => {
  it("aceita o formato do PostgREST e devolve o texto intacto, com microssegundos", () => {
    for (const value of [VERSION, "2026-11-25T14:03:11+00:00", "2026-11-25T14:03:11.1Z", "2026-11-25 14:03:11.123456+00"]) {
      expect(updatedAtTextSchema.parse(value)).toBe(value);
    }
  });

  it("recusa Date, número e texto fora do formato (nunca converte)", () => {
    expect(updatedAtTextSchema.safeParse(new Date()).success).toBe(false);
    expect(updatedAtTextSchema.safeParse(1764079391123).success).toBe(false);
    expect(updatedAtTextSchema.safeParse("ontem").success).toBe(false);
    expect(updatedAtTextSchema.safeParse("").success).toBe(false);
  });

  it("a edição de sócio mantém os 6 dígitos de microssegundo", () => {
    const parsed = partnerSaveSchema.parse({ id: PARTNER_A, name: "Sócio Exemplo A", aliases: [], expectedUpdatedAt: VERSION });
    expect(parsed.expectedUpdatedAt).toBe(VERSION);
    expect(typeof parsed.expectedUpdatedAt).toBe("string");
  });
});

describe("partnerSaveSchema", () => {
  it("cadastro novo: id e versão ausentes viram null; nome e apelidos aparados", () => {
    const parsed = partnerSaveSchema.parse({ name: "  Sócio Exemplo A  ", aliases: ["  Alfa  ", "", "   "] });
    expect(parsed).toEqual({ id: null, name: "Sócio Exemplo A", aliases: ["Alfa"], expectedUpdatedAt: null, reason: null });
  });

  it("não aceita campo de documento nem de percentual (RAT-D025, RAT-D015): é ignorado", () => {
    const parsed = partnerSaveSchema.parse({ name: "Sócio Exemplo A", aliases: [], document: "00000000191", percentage: 50 });
    expect(parsed).not.toHaveProperty("document");
    expect(parsed).not.toHaveProperty("percentage");
  });

  it("nome vazio, só espaços e longo demais", () => {
    expect(errorsOf(partnerSaveSchema.safeParse({ name: "", aliases: [] })).name).toBe("Informe o nome do sócio.");
    expect(errorsOf(partnerSaveSchema.safeParse({ name: "   ", aliases: [] })).name).toBe("Informe o nome do sócio.");
    expect(errorsOf(partnerSaveSchema.safeParse({ name: "a".repeat(201), aliases: [] })).name).toBe(
      "O nome do sócio pode ter no máximo 200 caracteres.",
    );
    expect(partnerSaveSchema.safeParse({ name: "a".repeat(200), aliases: [] }).success).toBe(true);
  });

  it("a lista de apelidos é obrigatória (nulo inativaria todos)", () => {
    expect(partnerSaveSchema.safeParse({ name: "Sócio Exemplo A" }).success).toBe(false);
    expect(partnerSaveSchema.safeParse({ name: "Sócio Exemplo A", aliases: null }).success).toBe(false);
    expect(partnerSaveSchema.safeParse({ name: "Sócio Exemplo A", aliases: [] }).success).toBe(true);
  });

  it("apelido longo demais aponta o item", () => {
    const errors = errorsOf(partnerSaveSchema.safeParse({ name: "Sócio Exemplo A", aliases: ["ok", "b".repeat(201)] }));
    expect(errors["aliases.1"]).toBe("Um apelido pode ter no máximo 200 caracteres.");
  });

  it("edição exige a versão", () => {
    expect(errorsOf(partnerSaveSchema.safeParse({ id: PARTNER_A, name: "Sócio Exemplo A", aliases: [] })).expectedUpdatedAt).toBe(
      VERSION_MESSAGE,
    );
    expect(errorsOf(partnerSaveSchema.safeParse({ id: "não-é-uuid", name: "x", aliases: [], expectedUpdatedAt: VERSION })).id).toBe(
      "Identificador inválido.",
    );
  });

  it("motivo opcional: em branco vira null e nunca bloqueia; acima de 500 é recusado", () => {
    expect(partnerSaveSchema.parse({ name: "x", aliases: [], reason: "   " }).reason).toBeNull();
    expect(partnerSaveSchema.parse({ name: "x", aliases: [], reason: " Correção de grafia " }).reason).toBe("Correção de grafia");
    expect(partnerSaveSchema.parse({ name: "x", aliases: [] }).reason).toBeNull();
    expect(errorsOf(partnerSaveSchema.safeParse({ name: "x", aliases: [], reason: "r".repeat(501) })).reason).toBe(
      "O motivo pode ter no máximo 500 caracteres.",
    );
  });
});

describe("partnerSetActiveSchema", () => {
  it("inativar com a lista confirmada dos recebedores (padrão: vazia)", () => {
    const parsed = partnerSetActiveSchema.parse({ id: PARTNER_A, active: false, expectedUpdatedAt: VERSION });
    expect(parsed.confirmedReceiverIds).toEqual([]);
    expect(parsed.reason).toBeNull();
    expect(
      partnerSetActiveSchema.parse({ id: PARTNER_A, active: false, expectedUpdatedAt: VERSION, confirmedReceiverIds: [RECEIVER_ID] })
        .confirmedReceiverIds,
    ).toEqual([RECEIVER_ID]);
  });

  it("exige id, ação (booleano) e versão", () => {
    expect(partnerSetActiveSchema.safeParse({ id: PARTNER_A, expectedUpdatedAt: VERSION }).success).toBe(false);
    expect(partnerSetActiveSchema.safeParse({ id: PARTNER_A, active: "false", expectedUpdatedAt: VERSION }).success).toBe(false);
    expect(partnerSetActiveSchema.safeParse({ id: PARTNER_A, active: true }).success).toBe(false);
    expect(
      partnerSetActiveSchema.safeParse({ id: PARTNER_A, active: false, expectedUpdatedAt: VERSION, confirmedReceiverIds: ["x"] }).success,
    ).toBe(false);
  });
});

describe("receiverSaveSchema", () => {
  const base = { partnerId: PARTNER_A, holderName: "Titular Fictício A", identifiers: [] };

  it("novo recebedor com variação, duas chaves Pix e uma conta", () => {
    const parsed = receiverSaveSchema.parse({
      ...base,
      holderName: "  Titular Fictício A ",
      identifiers: [
        { type: "NAME_VARIANT", value: " S. Alfa " },
        { type: "PIX_KEY", value: "alfa@example.com" },
        { type: "PIX_KEY", value: "+55 (23) 91234-5678" },
        { type: "BANK_ACCOUNT", bankName: "Banco Exemplo", branch: "0001", accountNumber: "12345-6" },
      ],
    });
    expect(parsed.id).toBeNull();
    expect(parsed.partnerId).toBe(PARTNER_A);
    expect(parsed.holderName).toBe("Titular Fictício A");
    expect(parsed.identifiers).toEqual([
      { type: "NAME_VARIANT", value: "S. Alfa" },
      { type: "PIX_KEY", value: "alfa@example.com" },
      { type: "PIX_KEY", value: "+55 (23) 91234-5678" },
      { type: "BANK_ACCOUNT", bankName: "Banco Exemplo", branch: "0001", accountNumber: "12345-6" },
    ]);
  });

  it("descarta itens em branco (variação, chave e conta sem nada)", () => {
    const parsed = receiverSaveSchema.parse({
      ...base,
      identifiers: [
        { type: "NAME_VARIANT", value: "  " },
        { type: "PIX_KEY", value: null },
        { type: "BANK_ACCOUNT", bankName: "", branch: " ", accountNumber: null },
        { type: "PIX_KEY", value: "alfa@example.com" },
      ],
    });
    expect(parsed.identifiers).toEqual([{ type: "PIX_KEY", value: "alfa@example.com" }]);
  });

  it("não existe tipo nem campo de documento do titular (RAT-D023, CA-13)", () => {
    expect(
      receiverSaveSchema.safeParse({ ...base, identifiers: [{ type: "DOCUMENT", value: "00000000191" }] }).success,
    ).toBe(false);
    const parsed = receiverSaveSchema.parse({ ...base, document: "00000000191", holderDocument: "00000000191" });
    expect(parsed).not.toHaveProperty("document");
    expect(parsed).not.toHaveProperty("holderDocument");
  });

  it("sócio obrigatório no novo; na edição, a versão", () => {
    expect(errorsOf(receiverSaveSchema.safeParse({ holderName: "Titular", identifiers: [] })).partnerId).toBe(
      "Escolha o sócio do recebedor.",
    );
    expect(
      errorsOf(receiverSaveSchema.safeParse({ id: RECEIVER_ID, holderName: "Titular", identifiers: [] })).expectedUpdatedAt,
    ).toBe(VERSION_MESSAGE);
    expect(
      receiverSaveSchema.safeParse({ id: RECEIVER_ID, holderName: "Titular", identifiers: [], expectedUpdatedAt: VERSION }).success,
    ).toBe(true);
  });

  it("titular vazio ou longo demais (UI 7.2)", () => {
    expect(errorsOf(receiverSaveSchema.safeParse({ ...base, holderName: "  " })).holderName).toBe("Informe o nome do titular.");
    expect(errorsOf(receiverSaveSchema.safeParse({ ...base, holderName: "t".repeat(201) })).holderName).toBe(
      "O nome do titular pode ter no máximo 200 caracteres.",
    );
  });

  it("conta incompleta (UI 7.2) e caracteres inválidos em agência e conta", () => {
    const incomplete = errorsOf(
      receiverSaveSchema.safeParse({ ...base, identifiers: [{ type: "BANK_ACCOUNT", bankName: "Banco Exemplo", branch: "", accountNumber: "123" }] }),
    );
    expect(incomplete["identifiers.0"]).toBe("Preencha banco, agência e conta, ou apague os campos.");

    const invalid = errorsOf(
      receiverSaveSchema.safeParse({
        ...base,
        identifiers: [{ type: "BANK_ACCOUNT", bankName: "Banco Exemplo", branch: "00A1", accountNumber: "12X45" }],
      }),
    );
    expect(invalid["identifiers.0.branch"]).toBe("Use só números, hífen e a letra X.");
    expect(invalid["identifiers.0.accountNumber"]).toBe("Use só números, hífen e a letra X.");
  });

  it("agência e conta aceitam separadores e X final (D-IMPL-04)", () => {
    const parsed = receiverSaveSchema.parse({
      ...base,
      identifiers: [{ type: "BANK_ACCOUNT", bankName: "Banco Exemplo", branch: "1234-x", accountNumber: "98.765-x" }],
    });
    expect(parsed.identifiers).toHaveLength(1);
  });

  it("chave Pix de 100 caracteres passa; de 101 não. Variação acima de 200 não passa", () => {
    expect(receiverSaveSchema.safeParse({ ...base, identifiers: [{ type: "PIX_KEY", value: "k".repeat(100) }] }).success).toBe(true);
    expect(errorsOf(receiverSaveSchema.safeParse({ ...base, identifiers: [{ type: "PIX_KEY", value: "k".repeat(101) }] }))["identifiers.0.value"]).toBe(
      "A chave Pix pode ter no máximo 100 caracteres.",
    );
    expect(errorsOf(receiverSaveSchema.safeParse({ ...base, identifiers: [{ type: "NAME_VARIANT", value: "v".repeat(201) }] }))["identifiers.0.value"]).toBe(
      "Uma forma do nome pode ter no máximo 200 caracteres.",
    );
  });

  it("chave Pix com formato de CPF ou CNPJ é aceita como chave Pix (RAT-D023)", () => {
    const parsed = receiverSaveSchema.parse({
      ...base,
      identifiers: [
        { type: "PIX_KEY", value: "000.000.001-91" },
        { type: "PIX_KEY", value: "12.ABC.345/01DE-35" },
      ],
    });
    expect(parsed.identifiers).toHaveLength(2);
  });

  it("a lista de identificadores é obrigatória", () => {
    expect(receiverSaveSchema.safeParse({ partnerId: PARTNER_A, holderName: "Titular" }).success).toBe(false);
  });

  it("set_active do recebedor", () => {
    expect(receiverSetActiveSchema.parse({ id: RECEIVER_ID, active: true, expectedUpdatedAt: VERSION }).reason).toBeNull();
    expect(receiverSetActiveSchema.safeParse({ id: RECEIVER_ID, expectedUpdatedAt: VERSION }).success).toBe(false);
  });
});

describe("clientSaveSchema", () => {
  const base = {
    legalName: "Cliente Modelo Ltda",
    monthlyValue: "1.500,00",
    partnerIds: [PARTNER_A, PARTNER_B],
    aliases: [],
  };

  it("cadastro completo: documento canônico, mensalidade em texto decimal, versão nula", () => {
    const parsed = clientSaveSchema.parse({
      ...base,
      tradeName: " Modelo ",
      documentType: "CNPJ",
      document: "12.abc.345/01de-35",
      notes: " Observação fictícia ",
      aliases: [
        { type: "NAME", value: " Mod. Semente " },
        { type: "DOCUMENT", value: "000.000.001-91" },
        { type: "NAME", value: " " },
      ],
      reason: " ",
    });
    expect(parsed).toEqual({
      id: null,
      legalName: "Cliente Modelo Ltda",
      tradeName: "Modelo",
      document: "12ABC34501DE35",
      documentType: "CNPJ",
      monthlyValue: "1500.00",
      notes: "Observação fictícia",
      partnerIds: [PARTNER_A, PARTNER_B],
      aliases: [
        { type: "NAME", value: "Mod. Semente" },
        { type: "DOCUMENT", value: "000.000.001-91" },
      ],
      expectedUpdatedAt: null,
      acknowledgedDuplicateIds: [],
      reason: null,
    });
  });

  it("documento é opcional: vazio, ausente ou só pontuação viram null", () => {
    for (const document of [undefined, null, "", "  ", " ./- "]) {
      const parsed = clientSaveSchema.parse({ ...base, document });
      expect(parsed.document).toBeNull();
      expect(parsed.documentType).toBeNull();
    }
  });

  it("CPF e CNPJ conferidos com as mensagens da UI 4.1.2", () => {
    expect(clientSaveSchema.parse({ ...base, documentType: "CPF", document: "000.000.001-91" }).document).toBe("00000000191");
    expect(clientSaveSchema.parse({ ...base, document: "99.999.999/0001-91" })).toMatchObject({ document: "99999999000191", documentType: "CNPJ" });
    expect(errorsOf(clientSaveSchema.safeParse({ ...base, documentType: "CPF", document: "000.000.001-9" })).document).toBe(
      "O CPF precisa ter 11 números.",
    );
    expect(errorsOf(clientSaveSchema.safeParse({ ...base, documentType: "CPF", document: "00000000192" })).document).toBe(
      "CPF inválido. Confira os números.",
    );
    expect(errorsOf(clientSaveSchema.safeParse({ ...base, documentType: "CNPJ", document: "ZZ0TESTE00010" })).document).toBe(
      "O CNPJ precisa ter 14 caracteres, entre números e letras.",
    );
    expect(errorsOf(clientSaveSchema.safeParse({ ...base, documentType: "CNPJ", document: "ZZ0TESTE000101" })).document).toBe(
      "CNPJ inválido. Confira os números e as letras.",
    );
  });

  it("tipo escolhido e campo vazio (UI 4.1.2)", () => {
    expect(errorsOf(clientSaveSchema.safeParse({ ...base, documentType: "CPF", document: "" })).document).toBe(
      "Digite o número do CPF ou escolha “Sem documento”.",
    );
    expect(errorsOf(clientSaveSchema.safeParse({ ...base, documentType: "CNPJ", document: null })).document).toBe(
      "Digite o número do CNPJ ou escolha “Sem documento”.",
    );
  });

  it("mensalidade: '1.234,56' vira '1234.56'; '1234.56' é recusado (UI 4.1.3)", () => {
    expect(clientSaveSchema.parse({ ...base, monthlyValue: "1.234,56" }).monthlyValue).toBe("1234.56");
    expect(clientSaveSchema.parse({ ...base, monthlyValue: "R$ 1.500" }).monthlyValue).toBe("1500.00");
    expect(errorsOf(clientSaveSchema.safeParse({ ...base, monthlyValue: "1234.56" })).monthlyValue).toBe(
      "Valor inválido. Use vírgula para os centavos. Exemplo: 1.234,56.",
    );
    expect(errorsOf(clientSaveSchema.safeParse({ ...base, monthlyValue: "" })).monthlyValue).toBe("Informe o valor da mensalidade.");
    expect(errorsOf(clientSaveSchema.safeParse({ ...base, monthlyValue: "0,00" })).monthlyValue).toBe(
      "O valor da mensalidade precisa ser maior que zero.",
    );
    expect(errorsOf(clientSaveSchema.safeParse({ ...base, monthlyValue: "10,505" })).monthlyValue).toBe(
      "Use no máximo 2 casas depois da vírgula.",
    );
    expect(errorsOf(clientSaveSchema.safeParse({ ...base, monthlyValue: "1.000.000.000.000,00" })).monthlyValue).toBe(
      "O valor é alto demais. Confira se digitou certo.",
    );
    expect(errorsOf(clientSaveSchema.safeParse({ ...base, monthlyValue: undefined })).monthlyValue).toBe(
      "Informe o valor da mensalidade.",
    );
  });

  it("a mensalidade nunca sai como número", () => {
    const parsed = clientSaveSchema.parse({ ...base, monthlyValue: "0,29" });
    expect(typeof parsed.monthlyValue).toBe("string");
    expect(parsed.monthlyValue).toBe("0.29");
  });

  it("nome e observações", () => {
    expect(errorsOf(clientSaveSchema.safeParse({ ...base, legalName: " " })).legalName).toBe("Informe o nome ou a razão social.");
    expect(errorsOf(clientSaveSchema.safeParse({ ...base, legalName: "n".repeat(201) })).legalName).toBe(
      "O nome ou a razão social pode ter no máximo 200 caracteres.",
    );
    expect(errorsOf(clientSaveSchema.safeParse({ ...base, tradeName: "f".repeat(201) })).tradeName).toBe(
      "O nome fantasia pode ter no máximo 200 caracteres.",
    );
    expect(errorsOf(clientSaveSchema.safeParse({ ...base, notes: "o".repeat(2001) })).notes).toBe(
      "As observações podem ter no máximo 2000 caracteres.",
    );
    expect(clientSaveSchema.safeParse({ ...base, notes: "o".repeat(2000) }).success).toBe(true);
    expect(clientSaveSchema.parse({ ...base, tradeName: "  ", notes: "" })).toMatchObject({ tradeName: null, notes: null });
  });

  it("sócios: ao menos um para cliente ativo; repetidos reduzidos; id inválido recusado", () => {
    expect(errorsOf(clientSaveSchema.safeParse({ ...base, partnerIds: [] })).partnerIds).toBe(
      "Escolha pelo menos um sócio. Todo cliente ativo precisa de um.",
    );
    expect(clientSaveSchema.parse({ ...base, partnerIds: [PARTNER_A, PARTNER_A, PARTNER_B] }).partnerIds).toEqual([PARTNER_A, PARTNER_B]);
    expect(clientSaveSchema.safeParse({ ...base, partnerIds: ["x"] }).success).toBe(false);
    expect(clientSaveSchema.safeParse({ ...base, partnerIds: undefined }).success).toBe(false);
  });

  it("cliente inativo pode ficar sem sócio (R-C10)", () => {
    const inactive = buildClientSaveSchema({ allowEmptyPartners: true });
    expect(inactive.parse({ ...base, partnerIds: [] }).partnerIds).toEqual([]);
    expect(buildClientSaveSchema().safeParse({ ...base, partnerIds: [] }).success).toBe(false);
  });

  it("apelidos: documento inválido, nome longo e lista obrigatória", () => {
    const errors = errorsOf(
      clientSaveSchema.safeParse({
        ...base,
        aliases: [
          { type: "DOCUMENT", value: "000.000.001-92" },
          { type: "NAME", value: "a".repeat(201) },
          { type: "DOCUMENT", value: "12345" },
        ],
      }),
    );
    expect(errors["aliases.0.value"]).toBe("CPF inválido. Confira os números.");
    expect(errors["aliases.1.value"]).toBe("Um apelido pode ter no máximo 200 caracteres.");
    expect(errors["aliases.2.value"]).toBe("Informe um CPF (11 números) ou um CNPJ (14 caracteres).");
    expect(clientSaveSchema.safeParse({ ...base, aliases: undefined }).success).toBe(false);
    expect(clientSaveSchema.safeParse({ ...base, aliases: [{ type: "OUTRO", value: "x" }] }).success).toBe(false);
  });

  it("edição exige a versão, em texto; confirmação de duplicados e motivo", () => {
    expect(errorsOf(clientSaveSchema.safeParse({ ...base, id: CLIENT_ID })).expectedUpdatedAt).toBe(VERSION_MESSAGE);
    const parsed = clientSaveSchema.parse({
      ...base,
      id: CLIENT_ID,
      expectedUpdatedAt: VERSION,
      acknowledgedDuplicateIds: [PARTNER_A, PARTNER_A],
      reason: "Troca de sócio",
    });
    expect(parsed.expectedUpdatedAt).toBe(VERSION);
    expect(parsed.acknowledgedDuplicateIds).toEqual([PARTNER_A]);
    expect(parsed.reason).toBe("Troca de sócio");
    expect(clientSaveSchema.safeParse({ ...base, expectedUpdatedAt: new Date() }).success).toBe(false);
  });

  it("não aceita percentual por sócio nem divisão própria (RAT-D015): campos são ignorados", () => {
    const parsed = clientSaveSchema.parse({ ...base, percentages: { [PARTNER_A]: 70 }, distributionMode: "CUSTOM" });
    expect(parsed).not.toHaveProperty("percentages");
    expect(parsed).not.toHaveProperty("distributionMode");
  });

  it("reúne os erros de documento e de mensalidade juntos", () => {
    const errors = errorsOf(clientSaveSchema.safeParse({ ...base, documentType: "CPF", document: "123", monthlyValue: "x", partnerIds: [] }));
    expect(Object.keys(errors).sort()).toEqual(["document", "monthlyValue", "partnerIds"]);
  });
});

describe("clientSetActiveSchema", () => {
  it("exige id, ação e versão em texto", () => {
    expect(clientSetActiveSchema.parse({ id: CLIENT_ID, active: false, expectedUpdatedAt: VERSION }).reason).toBeNull();
    expect(clientSetActiveSchema.safeParse({ id: CLIENT_ID, active: false }).success).toBe(false);
    expect(clientSetActiveSchema.safeParse({ id: CLIENT_ID, expectedUpdatedAt: VERSION }).success).toBe(false);
  });
});

describe("buscas", () => {
  it("search_clients: padrões do banco (ativos, 25, 0)", () => {
    expect(searchClientsSchema.parse({})).toEqual({ query: null, status: "ACTIVE", limit: 25, offset: 0, partnerId: null });
    expect(searchClientsSchema.parse({ query: "  modelo  ", status: "ALL", limit: 100, offset: 50 })).toEqual({
      query: "modelo",
      status: "ALL",
      limit: 100,
      offset: 50,
      partnerId: null,
    });
  });

  it("search_clients: filtro por sócio (E6a) aceita UUID, nulo ou ausente e recusa o resto", () => {
    const id = "a0000000-0000-4000-8000-000000000001";
    expect(searchClientsSchema.parse({ partnerId: id }).partnerId).toBe(id);
    expect(searchClientsSchema.parse({ partnerId: null }).partnerId).toBeNull();
    expect(searchClientsSchema.safeParse({ partnerId: "" }).success).toBe(false);
    expect(searchClientsSchema.safeParse({ partnerId: "abc" }).success).toBe(false);
  });

  it("limite e deslocamento fora da faixa do banco (INVALID_FILTER) são recusados antes", () => {
    for (const bad of [{ limit: 0 }, { limit: 101 }, { limit: 1.5 }, { offset: -1 }, { status: "TODOS" }, { query: "q".repeat(201) }]) {
      expect(searchClientsSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("search_aliases: tipo opcional e limite padrão 50", () => {
    expect(searchAliasesSchema.parse({})).toEqual({ query: null, kind: null, status: "ACTIVE", limit: 50, offset: 0 });
    expect(searchAliasesSchema.parse({ kind: "PIX_KEY" }).kind).toBe("PIX_KEY");
    expect(searchAliasesSchema.safeParse({ kind: "DOCUMENT" }).success).toBe(false);
  });

  it("pageToOffset", () => {
    expect(pageToOffset(1, 25)).toBe(0);
    expect(pageToOffset(3, 25)).toBe(50);
    expect(pageToOffset(0, 25)).toBe(0);
    expect(pageToOffset(-2, 25)).toBe(0);
    expect(pageToOffset(1.5, 25)).toBe(0);
  });
});

describe("fieldErrorsFromZod", () => {
  it("fica com a primeira mensagem de cada caminho", () => {
    const result = partnerSaveSchema.safeParse({ name: "", aliases: [] });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrorsFromZod(result.error)).toEqual({ name: "Informe o nome do sócio." });
  });
});

describe("findAccountProblems (esquema e tela dizem a mesma coisa)", () => {
  it("linha vazia não é problema; conta pela metade é um problema só, sem campo", () => {
    expect(findAccountProblems({ bankName: "", branch: "", accountNumber: "" })).toEqual([]);
    expect(findAccountProblems({ bankName: "B", branch: "", accountNumber: "1" })).toEqual([
      { field: null, message: "Preencha banco, agência e conta, ou apague os campos." },
    ]);
  });

  it("agência, conta e banco: o campo e o texto da UI 7.2", () => {
    expect(findAccountProblems({ bankName: "B", branch: "1234567", accountNumber: "1" })).toEqual([
      { field: "branch", message: "Use só números, hífen e a letra X." },
    ]);
    expect(findAccountProblems({ bankName: "B", branch: "1", accountNumber: "X1" })).toEqual([
      { field: "accountNumber", message: "Use só números, hífen e a letra X." },
    ]);
    expect(findAccountProblems({ bankName: "b".repeat(101), branch: "1", accountNumber: "1-X" })).toEqual([
      { field: "bankName", message: "O nome do banco pode ter no máximo 100 caracteres." },
    ]);
  });
});
