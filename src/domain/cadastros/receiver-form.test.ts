import { describe, expect, it } from "vitest";

import {
  readReceiverSaveForm,
  readReceiverSetActiveForm,
  receiverFieldOfError,
  summarizeReceiverValidation,
} from "./receiver-form";
import { receiverSaveSchema, receiverSetActiveSchema } from "./schemas";

const PARTNER = "a0000000-0000-4000-8000-000000000001";
const RECEIVER = "d2000000-0000-4000-8000-000000000001";
const VERSION = "2026-11-25T14:03:11.123456+00:00";

function formOf(entries: Array<[string, string]>): FormData {
  const form = new FormData();
  for (const [key, value] of entries) form.append(key, value);
  return form;
}

describe("readReceiverSaveForm", () => {
  it("monta os identificadores na ordem formas do nome, chaves Pix e contas", () => {
    const raw = readReceiverSaveForm(
      formOf([
        ["partnerId", PARTNER],
        ["holderName", " Titular Fictício A "],
        ["pixKeys", "alfa@example.com"],
        ["variants", "S. Alfa"],
        ["accountBank", "Banco Exemplo"], ["accountBranch", "0001"], ["accountNumber", "12345-6"],
        ["accountBank", "Banco Beta"], ["accountBranch", "2"], ["accountNumber", "9"],
      ]),
    );
    expect(raw).toEqual({
      id: null,
      partnerId: PARTNER,
      holderName: " Titular Fictício A ",
      identifiers: [
        { type: "NAME_VARIANT", value: "S. Alfa" },
        { type: "PIX_KEY", value: "alfa@example.com" },
        { type: "BANK_ACCOUNT", bankName: "Banco Exemplo", branch: "0001", accountNumber: "12345-6" },
        { type: "BANK_ACCOUNT", bankName: "Banco Beta", branch: "2", accountNumber: "9" },
      ],
      expectedUpdatedAt: null,
      reason: null,
    });
    expect(receiverSaveSchema.safeParse(raw).success).toBe(true);
  });

  it("campos paralelos de conta com tamanhos diferentes: a conta fica incompleta e é recusada", () => {
    const raw = readReceiverSaveForm(
      formOf([
        ["partnerId", PARTNER], ["holderName", "T"],
        ["accountBank", "Banco"], ["accountBank", "Outro"], ["accountBranch", "1"], ["accountNumber", "2"],
      ]),
    );
    expect(raw.identifiers).toHaveLength(2);
    expect(receiverSaveSchema.safeParse(raw).success).toBe(false);
  });

  it("sem campo de titular: vazio (o esquema recusa); sem id: recebedor novo", () => {
    const raw = readReceiverSaveForm(formOf([["partnerId", PARTNER]]));
    expect(raw.holderName).toBe("");
    expect(raw.id).toBeNull();
    expect(receiverSaveSchema.safeParse(raw).success).toBe(false);
  });

  it("edição: id e versão passam intactos (texto, com microssegundos)", () => {
    const raw = readReceiverSaveForm(formOf([["id", RECEIVER], ["expectedUpdatedAt", VERSION], ["holderName", "T"]]));
    expect(raw).toMatchObject({ id: RECEIVER, expectedUpdatedAt: VERSION });
  });

  it("arquivo no lugar de texto vira ausente", () => {
    const form = new FormData();
    form.append("holderName", new Blob(["x"]), "x.txt");
    form.append("variants", new Blob(["x"]), "x.txt");
    const raw = readReceiverSaveForm(form);
    expect(raw.holderName).toBe("");
    expect(raw.identifiers).toEqual([]);
  });
});

describe("readReceiverSetActiveForm", () => {
  it("só 'true' e 'false' valem para a ação", () => {
    expect(readReceiverSetActiveForm(formOf([["id", RECEIVER], ["active", "true"], ["expectedUpdatedAt", VERSION]]))).toMatchObject({ active: true });
    expect(readReceiverSetActiveForm(formOf([["id", RECEIVER], ["active", "false"]]))).toMatchObject({ active: false });
    const odd = readReceiverSetActiveForm(formOf([["id", RECEIVER], ["active", "1"], ["expectedUpdatedAt", VERSION]]));
    expect(odd.active).toBeUndefined();
    expect(receiverSetActiveSchema.safeParse(odd).success).toBe(false);
  });
});

describe("summarizeReceiverValidation", () => {
  it("manda cada problema à lista do tipo do item e o resto ao resumo geral", () => {
    const raw = readReceiverSaveForm(
      formOf([
        ["holderName", ""],
        ["variants", "v".repeat(201)],
        ["pixKeys", "k".repeat(101)],
        ["accountBank", "B"], ["accountBranch", "AB"], ["accountNumber", "1"],
        ["id", RECEIVER],
      ]),
    );
    const parsed = receiverSaveSchema.safeParse(raw);
    if (parsed.success) throw new Error("esperado erro");
    const { fieldErrors, formMessage } = summarizeReceiverValidation(parsed.error, raw.identifiers);
    expect(fieldErrors).toEqual({
      holderName: "Informe o nome do titular.",
      variants: "Uma forma do nome pode ter no máximo 200 caracteres.",
      pixKeys: "A chave Pix pode ter no máximo 100 caracteres.",
      accounts: "Use só números, hífen e a letra X.",
    });
    // a versão ausente na edição não tem campo na tela
    expect(formMessage).toBe("Não foi possível identificar a versão do cadastro. Atualize a página e tente novamente.");
  });
});

describe("receiverFieldOfError", () => {
  const owner = { kind: "receiver" as const, id: "x", name: "T", active: true };
  const taken = (identifierType: "NAME_VARIANT" | "PIX_KEY" | "BANK_ACCOUNT" | null) => ({
    code: "CONFLICT" as const,
    message: "m",
    hint: "IDENTIFIER_TAKEN" as const,
    details: { hint: "IDENTIFIER_TAKEN" as const, field: "identifiers", identifierType, value: null, owner },
  });

  it("traduz o erro do banco para a lista da tela", () => {
    expect(receiverFieldOfError({ code: "VALIDATION", message: "m", field: "holderName" })).toBe("holderName");
    expect(receiverFieldOfError(taken("PIX_KEY"))).toBe("pixKeys");
    expect(receiverFieldOfError(taken("BANK_ACCOUNT"))).toBe("accounts");
    expect(receiverFieldOfError(taken("NAME_VARIANT"))).toBe("variants");
    expect(receiverFieldOfError(taken(null))).toBeNull();
    expect(receiverFieldOfError({ code: "VALIDATION", message: "m", hint: "INVALID_PIX_KEY", field: "identifiers" })).toBe("pixKeys");
    expect(receiverFieldOfError({ code: "VALIDATION", message: "m", hint: "INVALID_BRANCH", field: "identifiers" })).toBe("accounts");
    expect(receiverFieldOfError({ code: "CONFLICT", message: "m", hint: "PARTNER_NAME_TAKEN", field: "identifiers" })).toBe("variants");
    expect(receiverFieldOfError({ code: "VALIDATION", message: "m", hint: "NAME_REQUIRED", field: "identifiers" })).toBe("variants");
    expect(receiverFieldOfError({ code: "CONFLICT", message: "m", hint: "STALE_VERSION" })).toBeNull();
    expect(receiverFieldOfError({ code: "UNEXPECTED", message: "m" })).toBeNull();
  });
});
