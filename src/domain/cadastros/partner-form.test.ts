import { describe, expect, it } from "vitest";

import { partnerSaveSchema, partnerSetActiveSchema } from "./schemas";
import { readField, readFieldList, readPartnerSaveForm, readPartnerSetActiveForm, summarizeValidation } from "./partner-form";

const VERSION = "2026-11-25T14:03:11.123456+00:00";

function formOf(entries: Array<[string, string | Blob]>): FormData {
  const form = new FormData();
  for (const [key, value] of entries) form.append(key, value);
  return form;
}

describe("leitura do FormData", () => {
  it("separa texto de arquivo e campo vazio de ausente", () => {
    const form = formOf([["a", ""], ["b", "x"], ["f", new Blob(["x"])]]);
    expect(readField(form, "a")).toBeNull();
    expect(readField(form, "b")).toBe("x");
    expect(readField(form, "f")).toBeNull();
    expect(readField(form, "nada")).toBeNull();
    expect(readFieldList(form, "b")).toEqual(["x"]);
    expect(readFieldList(form, "f")).toEqual([]);
  });

  it("sócio novo: sem id e sem versão; apelidos repetidos viram lista", () => {
    const raw = readPartnerSaveForm(formOf([["name", " Sócio Exemplo A "], ["aliases", "Alfa"], ["aliases", "Beta"]]));
    expect(raw).toEqual({ id: null, name: " Sócio Exemplo A ", aliases: ["Alfa", "Beta"], expectedUpdatedAt: null, reason: null });
    const parsed = partnerSaveSchema.safeParse(raw);
    expect(parsed.success && parsed.data).toMatchObject({ id: null, name: "Sócio Exemplo A", aliases: ["Alfa", "Beta"] });
  });

  it("a versão passa intacta como texto (microssegundos preservados)", () => {
    const raw = readPartnerSaveForm(
      formOf([["id", "a0000000-0000-4000-8000-000000000001"], ["name", "Sócio Exemplo A"], ["expectedUpdatedAt", VERSION]]),
    );
    const parsed = partnerSaveSchema.safeParse(raw);
    expect(parsed.success && parsed.data.expectedUpdatedAt).toBe(VERSION);
  });

  it("inativar/reativar: 'active' só vale true ou false", () => {
    const base: Array<[string, string]> = [["id", "a0000000-0000-4000-8000-000000000001"], ["expectedUpdatedAt", VERSION]];
    expect(readPartnerSetActiveForm(formOf([...base, ["active", "false"]])).active).toBe(false);
    expect(readPartnerSetActiveForm(formOf([...base, ["active", "true"]])).active).toBe(true);
    expect(readPartnerSetActiveForm(formOf([...base, ["active", "talvez"]])).active).toBeUndefined();
    expect(partnerSetActiveSchema.safeParse(readPartnerSetActiveForm(formOf(base))).success).toBe(false);
  });
});

describe("summarizeValidation", () => {
  it("agrupa a primeira mensagem por campo conhecido e manda o resto para a mensagem geral", () => {
    const parsed = partnerSaveSchema.safeParse(
      readPartnerSaveForm(formOf([["id", "a0000000-0000-4000-8000-000000000001"], ["name", ""], ["aliases", "x".repeat(201)]])),
    );
    if (parsed.success) throw new Error("esperava falha");
    const summary = summarizeValidation(parsed.error, ["name", "aliases"]);
    expect(summary.fieldErrors).toEqual({
      name: "Informe o nome do sócio.",
      aliases: "Um apelido pode ter no máximo 200 caracteres.",
    });
    expect(summary.formMessage).toContain("versão do cadastro");
  });
});
