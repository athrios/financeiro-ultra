import { describe, expect, it } from "vitest";

import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH, evaluatePassword, isPasswordValid } from "./password-policy";

describe("política de senha", () => {
  it("exige o comprimento mínimo", () => {
    expect(isPasswordValid("a".repeat(PASSWORD_MIN_LENGTH - 1))).toBe(false);
    expect(isPasswordValid("a".repeat(PASSWORD_MIN_LENGTH))).toBe(true);
  });

  it("aceita frase longa, com espaços e acentos, sem exigir combinação de caracteres", () => {
    expect(isPasswordValid("minha frase secreta de teste")).toBe(true);
    expect(isPasswordValid("aaaaaaaaaaaa")).toBe(true);
  });

  it("rejeita senha formada só por espaços", () => {
    expect(isPasswordValid(" ".repeat(20))).toBe(false);
    expect(evaluatePassword(" ".repeat(20)).find((rule) => rule.id === "not-blank")?.met).toBe(false);
  });

  it("respeita o limite do bcrypt (72 bytes)", () => {
    expect(isPasswordValid("a".repeat(PASSWORD_MAX_BYTES))).toBe(true);
    expect(isPasswordValid("a".repeat(PASSWORD_MAX_BYTES + 1))).toBe(false);
    // 40 letras acentuadas = 80 bytes em UTF-8.
    expect(isPasswordValid("é".repeat(40))).toBe(false);
  });

  it("devolve o estado de cada regra para a interface exibir antes do erro", () => {
    const rules = evaluatePassword("curta");
    expect(rules.map((rule) => rule.id)).toEqual(["min-length", "max-length", "not-blank"]);
    expect(rules.map((rule) => rule.met)).toEqual([false, true, true]);
    expect(rules.every((rule) => rule.label.length > 0)).toBe(true);
  });
});
