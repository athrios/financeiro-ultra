import { describe, expect, it } from "vitest";

import { DOCUMENT_PLACEHOLDERS, maskCnpj, maskCpf, maskDocument } from "./document-mask";

describe("maskCpf", () => {
  it("aplica a máscara aos poucos enquanto digita", () => {
    expect(maskCpf("")).toBe("");
    expect(maskCpf("1")).toBe("1");
    expect(maskCpf("123")).toBe("123");
    expect(maskCpf("1234")).toBe("123.4");
    expect(maskCpf("123456")).toBe("123.456");
    expect(maskCpf("1234567")).toBe("123.456.7");
    expect(maskCpf("123456789")).toBe("123.456.789");
    expect(maskCpf("1234567890")).toBe("123.456.789-0");
    expect(maskCpf("12345678900")).toBe("123.456.789-00");
  });

  it("colar com ou sem pontuação dá o mesmo resultado", () => {
    expect(maskCpf("123.456.789-00")).toBe("123.456.789-00");
    expect(maskCpf(" 123 456 789 00 ")).toBe("123.456.789-00");
  });

  it("descarta letras e símbolos e limita a 11 números", () => {
    expect(maskCpf("12a3b")).toBe("123");
    expect(maskCpf("123456789001234")).toBe("123.456.789-00");
    expect(maskCpf(null)).toBe("");
    expect(maskCpf(undefined)).toBe("");
  });
});

describe("maskCnpj", () => {
  it("aplica a máscara aos poucos", () => {
    expect(maskCnpj("1")).toBe("1");
    expect(maskCnpj("123")).toBe("12.3");
    expect(maskCnpj("12345")).toBe("12.345");
    expect(maskCnpj("123456")).toBe("12.345.6");
    expect(maskCnpj("12345678")).toBe("12.345.678");
    expect(maskCnpj("123456780")).toBe("12.345.678/0");
    expect(maskCnpj("123456780001")).toBe("12.345.678/0001");
    expect(maskCnpj("1234567800010")).toBe("12.345.678/0001-0");
    expect(maskCnpj("12345678000100")).toBe("12.345.678/0001-00");
  });

  it("aceita letras nas 12 primeiras posições e converte minúsculas em maiúsculas", () => {
    expect(maskCnpj("12abc34501de35")).toBe("12.ABC.345/01DE-35");
    expect(maskCnpj("12.ABC.345/01DE-35")).toBe("12.ABC.345/01DE-35");
  });

  it("nos dois últimos (dígitos verificadores) só números", () => {
    expect(maskCnpj("12ABC34501DEXY")).toBe("12.ABC.345/01DE");
    expect(maskCnpj("12ABC34501DE3X5")).toBe("12.ABC.345/01DE-35");
  });

  it("limita a 14 caracteres e descarta símbolos", () => {
    expect(maskCnpj("12345678000100999")).toBe("12.345.678/0001-00");
    expect(maskCnpj("!!12@@")).toBe("12");
    expect(maskCnpj(null)).toBe("");
  });
});

describe("maskDocument e exemplos", () => {
  it("escolhe a máscara pelo tipo", () => {
    expect(maskDocument("CPF", "12345678900")).toBe("123.456.789-00");
    expect(maskDocument("CNPJ", "12345678000100")).toBe("12.345.678/0001-00");
  });

  it("os exemplos dos campos são os da UI", () => {
    expect(DOCUMENT_PLACEHOLDERS.CPF).toBe("000.000.000-00");
    expect(DOCUMENT_PLACEHOLDERS.CNPJ).toBe("00.000.000/0001-00");
  });
});
