import { describe, expect, it } from "vitest";

import {
  computeConfirmationChanges,
  describeErrorSummary,
  describeMoneyReading,
  describePartnerPreview,
  duplicateDocumentText,
  duplicateReasonLabel,
  duplicateScopeSignature,
  listChangedValues,
  listFieldErrors,
  needsConfirmation,
  ownerLinkLabel,
  readClientSaveForm,
  readClientSetActiveForm,
  reformatMoneyText,
  sanitizeMoneyText,
  validateClientLocally,
  validateDocumentField,
  validateMoneyField,
} from "./client-form";

function formOf(entries: Array<[string, string]>): FormData {
  const form = new FormData();
  for (const [key, value] of entries) form.append(key, value);
  return form;
}

describe("readClientSaveForm", () => {
  it("lê os campos e junta tipo e valor de cada apelido, na ordem", () => {
    const raw = readClientSaveForm(
      formOf([
        ["id", "c0000000-0000-4000-8000-000000000001"],
        ["legalName", "  Cliente Modelo Ltda "],
        ["tradeName", ""],
        ["documentType", "CNPJ"],
        ["document", "99.999.999/0002-72"],
        ["monthlyValue", "1.234,56"],
        ["notes", ""],
        ["partnerIds", "p1"],
        ["partnerIds", "p2"],
        ["aliasType", "NAME"],
        ["aliasValue", "Modelo"],
        ["aliasType", "DOCUMENT"],
        ["aliasValue", "000.000.004-34"],
        ["expectedUpdatedAt", "2026-11-25T14:03:11.123456+00:00"],
        ["acknowledgedDuplicateIds", "d1"],
        ["reason", "Troca de sócio"],
      ]),
    );
    expect(raw).toMatchObject({
      id: "c0000000-0000-4000-8000-000000000001",
      legalName: "  Cliente Modelo Ltda ",
      documentType: "CNPJ",
      document: "99.999.999/0002-72",
      monthlyValue: "1.234,56",
      partnerIds: ["p1", "p2"],
      aliases: [
        { type: "NAME", value: "Modelo" },
        { type: "DOCUMENT", value: "000.000.004-34" },
      ],
      expectedUpdatedAt: "2026-11-25T14:03:11.123456+00:00",
      acknowledgedDuplicateIds: ["d1"],
      reason: "Troca de sócio",
    });
  });

  it("campos ausentes viram valores seguros; tipo vazio = sem tipo", () => {
    const raw = readClientSaveForm(formOf([]));
    expect(raw).toMatchObject({
      id: null,
      legalName: "",
      documentType: null,
      document: null,
      monthlyValue: "",
      partnerIds: [],
      aliases: [],
      expectedUpdatedAt: null,
      acknowledgedDuplicateIds: [],
      reason: null,
    });
    expect(readClientSaveForm(formOf([["documentType", ""]])).documentType).toBeNull();
  });

  it("apelidos com tipos e valores de tamanhos diferentes: lista ausente (o esquema recusa)", () => {
    const raw = readClientSaveForm(formOf([["aliasType", "NAME"], ["aliasType", "NAME"], ["aliasValue", "Só um"]]));
    expect(raw.aliases).toBeUndefined();
  });

  it("campo que não é texto (arquivo) vira ausente", () => {
    const form = new FormData();
    form.append("legalName", new Blob(["x"]), "x.txt");
    expect(readClientSaveForm(form).legalName).toBe("");
  });
});

describe("resumo de erros", () => {
  it("títulos do resumo (UI 4.1.9)", () => {
    expect(describeErrorSummary(0, "Mensagem geral.")).toBe("Mensagem geral.");
    expect(describeErrorSummary(1, "x")).toBe("Não foi possível salvar. Corrija o campo destacado.");
    expect(describeErrorSummary(3, "x")).toBe("Não foi possível salvar. Corrija os 3 campos destacados.");
  });

  it("lista os erros na ordem do formulário, com o rótulo do campo", () => {
    expect(listFieldErrors({ partnerIds: "C", legalName: "A", monthlyValue: "B" })).toEqual([
      { field: "legalName", label: "Nome ou razão social", message: "A" },
      { field: "monthlyValue", label: "Mensalidade padrão", message: "B" },
      { field: "partnerIds", label: "Sócios do cliente", message: "C" },
    ]);
  });
});

describe("documento", () => {
  it("sem documento nunca dá erro", () => {
    expect(validateDocumentField("NONE", "qualquer coisa")).toBeNull();
  });

  it("mensagens exatas da UI 4.1.2", () => {
    expect(validateDocumentField("CPF", "123")).toBe("O CPF precisa ter 11 números.");
    expect(validateDocumentField("CPF", "123.456.789-00")).toBe("CPF inválido. Confira os números.");
    expect(validateDocumentField("CNPJ", "12.345")).toBe("O CNPJ precisa ter 14 caracteres, entre números e letras.");
    expect(validateDocumentField("CNPJ", "99.999.999/0001-90")).toBe("CNPJ inválido. Confira os números e as letras.");
    expect(validateDocumentField("CPF", "")).toBe("Digite o número do CPF ou escolha “Sem documento”.");
    expect(validateDocumentField("CNPJ", "  ")).toBe("Digite o número do CNPJ ou escolha “Sem documento”.");
  });

  it("documentos válidos passam", () => {
    expect(validateDocumentField("CPF", "000.000.005-15")).toBeNull();
    expect(validateDocumentField("CNPJ", "99.999.999/0002-72")).toBeNull();
  });

  it("link do documento repetido: ativo e inativo", () => {
    expect(ownerLinkLabel({ active: true })).toBe("Abrir cliente");
    expect(ownerLinkLabel({ active: false })).toBe("Abrir cliente inativo");
  });
});

describe("mensalidade", () => {
  it("só dígitos, ponto e vírgula", () => {
    expect(sanitizeMoneyText("R$ 1.234,56")).toBe("1.234,56");
    expect(sanitizeMoneyText("12a3-4")).toBe("1234");
  });

  it("ao sair do campo, valor legível vira 1.234,56; ilegível fica como está", () => {
    expect(reformatMoneyText("1234,5")).toBe("1.234,50");
    expect(reformatMoneyText("1.234,56")).toBe("1.234,56");
    expect(reformatMoneyText("1234.56")).toBe("1234.56");
    expect(reformatMoneyText("")).toBe("");
  });

  it('"Valor lido" mostra o que foi entendido; "1234.56" não é lido', () => {
    expect(describeMoneyReading("1.234,56")?.replace(/ /g, " ")).toBe("Valor lido: R$ 1.234,56");
    expect(describeMoneyReading("1234,5")?.replace(/ /g, " ")).toBe("Valor lido: R$ 1.234,50");
    expect(describeMoneyReading("1234.56")).toBeNull();
    expect(describeMoneyReading("")).toBeNull();
  });

  it("mensagens da UI 4.1.3", () => {
    expect(validateMoneyField("")).toBe("Informe o valor da mensalidade.");
    expect(validateMoneyField("0")).toBe("O valor da mensalidade precisa ser maior que zero.");
    expect(validateMoneyField("1,234")).toBe("Use no máximo 2 casas depois da vírgula.");
    expect(validateMoneyField("1234.56")).toBe("Valor inválido. Use vírgula para os centavos. Exemplo: 1.234,56.");
    expect(validateMoneyField("1.234,56")).toBeNull();
  });
});

describe("conferência local", () => {
  const ok = { legalName: "Cliente Modelo Ltda", choice: "NONE" as const, document: "", monthlyValue: "500,00", partnerCount: 2, clientActive: true };

  it("sem problemas, nenhum erro", () => {
    expect(validateClientLocally(ok)).toEqual({});
  });

  it("junta todos os erros de uma vez", () => {
    expect(
      validateClientLocally({ ...ok, legalName: "  ", choice: "CPF", document: "", monthlyValue: "", partnerCount: 0 }),
    ).toEqual({
      legalName: "Informe o nome ou a razão social.",
      document: "Digite o número do CPF ou escolha “Sem documento”.",
      monthlyValue: "Informe o valor da mensalidade.",
      partnerIds: "Escolha pelo menos um sócio. Todo cliente ativo precisa de um.",
    });
  });

  it("cliente inativo pode ficar sem sócio", () => {
    expect(validateClientLocally({ ...ok, partnerCount: 0, clientActive: false })).toEqual({});
  });
});

describe("prévia da divisão (UI 4.1.4)", () => {
  it("textos exatos de 1 a 4 sócios", () => {
    expect(describePartnerPreview(1, true).text).toBe("1 sócio · divisão: 1/1 (100%)");
    expect(describePartnerPreview(2, true).text).toBe("2 sócios · divisão igual: 1/2 para cada um (50%)");
    expect(describePartnerPreview(3, true).text).toBe("3 sócios · divisão igual: 1/3 para cada um (≈ 33,33%)");
    expect(describePartnerPreview(4, true).text).toBe("4 sócios · divisão igual: 1/4 para cada um (25%)");
    expect(describePartnerPreview(3, true).tone).toBe("neutral");
  });

  it("nenhum sócio: aviso em cliente ativo, informativo em cliente inativo", () => {
    expect(describePartnerPreview(0, true)).toEqual({
      text: "Nenhum sócio escolhido.",
      extra: "Todo cliente ativo precisa de pelo menos um sócio.",
      tone: "warning",
    });
    expect(describePartnerPreview(0, false)).toEqual({
      text: "Nenhum sócio. Para reativar o cliente, indique pelo menos um sócio.",
      extra: null,
      tone: "info",
    });
  });

  it("não mostra valor em reais nem 'Total 100%'", () => {
    for (const count of [0, 1, 2, 3, 6]) {
      const preview = describePartnerPreview(count, true);
      expect(`${preview.text} ${preview.extra ?? ""}`).not.toMatch(/R\$|Total/);
    }
  });
});

describe("computeConfirmationChanges (UI 4.1.8)", () => {
  const names: Record<string, string> = { a: "Alfa", b: "Beta", g: "Gama" };
  const nameOf = (id: string) => names[id] ?? null;
  const baseline = { partnerIds: ["a", "b"], document: null };

  it("sem mudança de sócio nem de documento: nada a confirmar", () => {
    const changes = computeConfirmationChanges(baseline, { partnerIds: ["b", "a"], choice: "NONE", documentText: "" }, nameOf);
    expect(changes).toEqual({ partners: null, document: null });
    expect(needsConfirmation(changes)).toBe(false);
  });

  it("troca de sócios: antes e depois em ordem alfabética e a nova divisão", () => {
    const changes = computeConfirmationChanges(baseline, { partnerIds: ["g", "a"], choice: "NONE", documentText: "" }, nameOf);
    expect(changes.partners).toEqual({
      before: ["Alfa", "Beta"],
      after: ["Alfa", "Gama"],
      division: "A divisão passa a ser igual entre 2 sócios: 1/2 para cada um (50%).",
    });
    expect(changes.document).toBeNull();
    expect(needsConfirmation(changes)).toBe(true);
  });

  it("três sócios usa o percentual aproximado", () => {
    const changes = computeConfirmationChanges(baseline, { partnerIds: ["a", "b", "g"], choice: "NONE", documentText: "" }, nameOf);
    expect(changes.partners?.division).toBe("A divisão passa a ser igual entre 3 sócios: 1/3 para cada um (≈ 33,33%).");
  });

  it("incluir documento: 'sem documento → CNPJ ...'", () => {
    const changes = computeConfirmationChanges(baseline, { partnerIds: ["a", "b"], choice: "CNPJ", documentText: "99.999.999/0002-72" }, nameOf);
    expect(changes.document).toEqual({ before: "sem documento", after: "CNPJ 99.999.999/0002-72" });
    expect(changes.partners).toBeNull();
  });

  it("trocar e retirar documento", () => {
    const withCpf = { partnerIds: ["a"], document: "00000000515" };
    const swapped = computeConfirmationChanges(withCpf, { partnerIds: ["a"], choice: "CNPJ", documentText: "99999999000272" }, nameOf);
    expect(swapped.document).toEqual({ before: "CPF 000.000.005-15", after: "CNPJ 99.999.999/0002-72" });
    const removed = computeConfirmationChanges(withCpf, { partnerIds: ["a"], choice: "NONE", documentText: "" }, nameOf);
    expect(removed.document).toEqual({ before: "CPF 000.000.005-15", after: "sem documento" });
  });

  it("mesmo documento com outra pontuação não é mudança", () => {
    const withCpf = { partnerIds: ["a"], document: "00000000515" };
    expect(
      computeConfirmationChanges(withCpf, { partnerIds: ["a"], choice: "CPF", documentText: "00000000515" }, nameOf).document,
    ).toBeNull();
  });

  it("número ainda incompleto aparece como digitado, com o tipo", () => {
    const changes = computeConfirmationChanges(baseline, { partnerIds: ["a", "b"], choice: "CPF", documentText: "529.98" }, nameOf);
    expect(changes.document).toEqual({ before: "sem documento", after: "CPF 529.98" });
  });

  it("sócio que não está na lista não vaza o id", () => {
    const changes = computeConfirmationChanges({ partnerIds: ["x"], document: null }, { partnerIds: ["a"], choice: "NONE", documentText: "" }, nameOf);
    expect(changes.partners?.before).toEqual(["Sócio não encontrado"]);
    expect(changes.partners?.division).toBe("A divisão passa a ser de um só sócio: 1/1 (100%).");
  });

  it("cliente inativo que fica sem sócio: sem linha de divisão", () => {
    const changes = computeConfirmationChanges(baseline, { partnerIds: [], choice: "NONE", documentText: "" }, nameOf);
    expect(changes.partners?.division).toBeNull();
  });
});

describe("aviso de nome parecido (UI 4.1.7)", () => {
  it("motivos e documento", () => {
    expect(duplicateReasonLabel({ match: "SAME_NAME" })).toBe("mesmo nome");
    expect(duplicateReasonLabel({ match: "SAME_ALIAS" })).toBe("apelido igual ao nome");
    expect(duplicateDocumentText({ document: null })).toBe("Sem documento");
    expect(duplicateDocumentText({ document: "99999999000272" })).toBe("CNPJ 99.999.999/0002-72");
  });

  it("a assinatura muda com o nome (aparado) e com os apelidos", () => {
    const base = duplicateScopeSignature("Cliente Modelo", "[]");
    expect(duplicateScopeSignature("  Cliente Modelo ", "[]")).toBe(base);
    expect(duplicateScopeSignature("Cliente Modelo 2", "[]")).not.toBe(base);
    expect(duplicateScopeSignature("Cliente Modelo", '["N:modelo"]')).not.toBe(base);
  });
});

describe("listChangedValues (UI 8.1, 'O que você tinha digitado')", () => {
  const nameOf = (id: string) => ({ a: "Alfa", b: "Beta" })[id as "a" | "b"] ?? null;
  const base = {
    legalName: "Cliente Modelo Ltda",
    tradeName: "",
    choice: "NONE" as const,
    document: "",
    monthlyValue: "1.500,00",
    notes: "",
    partnerIds: ["a"],
    aliases: ["Modelo"],
  };

  it("nada mudou: lista vazia", () => {
    expect(listChangedValues(base, { ...base, legalName: "  Cliente Modelo Ltda " }, nameOf)).toEqual([]);
  });

  it("lista só o que mudou, com o texto digitado", () => {
    const current = {
      ...base,
      legalName: "Cliente Modelo SA",
      choice: "CNPJ" as const,
      document: "99.999.999/0002-72",
      monthlyValue: "1.800,00",
      partnerIds: ["b", "a"],
      aliases: ["Modelo", "CPF 000.000.005-15"],
      notes: "Obs",
    };
    expect(listChangedValues(base, current, nameOf)).toEqual([
      { label: "Nome ou razão social", text: "Cliente Modelo SA" },
      { label: "Documento", text: "CNPJ 99.999.999/0002-72" },
      { label: "Mensalidade padrão", text: "1.800,00" },
      { label: "Sócios do cliente", text: "Alfa, Beta" },
      { label: "Apelidos", text: "Modelo, CPF 000.000.005-15" },
      { label: "Observações", text: "Obs" },
    ]);
  });

  it("campo esvaziado aparece como traço", () => {
    expect(listChangedValues({ ...base, tradeName: "Modelo" }, base, nameOf)).toEqual([{ label: "Nome fantasia", text: "—" }]);
    expect(listChangedValues(base, { ...base, aliases: [] }, nameOf)).toEqual([{ label: "Apelidos", text: "—" }]);
  });
});

describe("readClientSetActiveForm", () => {
  const ID = "d4000000-0000-4000-8000-000000000001";

  it("lê id, ação, versão e motivo", () => {
    const raw = readClientSetActiveForm(
      formOf([["id", ID], ["active", "true"], ["expectedUpdatedAt", "2026-11-25T14:03:11.123456+00:00"], ["reason", "Voltou"]]),
    );
    expect(raw).toEqual({ id: ID, active: true, expectedUpdatedAt: "2026-11-25T14:03:11.123456+00:00", reason: "Voltou" });
  });

  it("'active' só vale 'true' ou 'false'; qualquer outro valor fica indefinido (o esquema recusa)", () => {
    expect(readClientSetActiveForm(formOf([["active", "false"]])).active).toBe(false);
    expect(readClientSetActiveForm(formOf([["active", "1"]])).active).toBeUndefined();
    expect(readClientSetActiveForm(formOf([["active", "TRUE"]])).active).toBeUndefined();
    expect(readClientSetActiveForm(formOf([])).active).toBeUndefined();
  });

  it("campos ausentes ou vazios: id e versão viram texto vazio (recusados), motivo vira null", () => {
    expect(readClientSetActiveForm(formOf([["reason", ""]]))).toEqual({
      id: "",
      active: undefined,
      expectedUpdatedAt: "",
      reason: null,
    });
  });

  it("campo que não é texto (arquivo) vira ausente", () => {
    const form = new FormData();
    form.append("id", new Blob(["x"]), "x.txt");
    expect(readClientSetActiveForm(form).id).toBe("");
  });
});
