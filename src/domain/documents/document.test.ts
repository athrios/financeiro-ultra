import { describe, expect, it } from "vitest";

import {
  DOCUMENT_MESSAGES,
  describeDocument,
  documentTypeOf,
  formatCnpj,
  formatCpf,
  formatDocument,
  isValidCnpj,
  isValidCpf,
  isValidDocument,
  normalizeDocument,
  parseDocumentInput,
} from "./document";

/**
 * Vetores compartilhados com o pgTAP (modelagem 12.3 e supabase/tests/database/07_cad_documents.test.sql).
 * Mesma ordem e mesmos números do teste do banco: se um dos lados mudar, o outro precisa mudar junto.
 * Todos fictícios (RAT-D019); `12.ABC.345/01DE-35` é o exemplo oficial da Receita/Serpro (P-IMPL-01).
 */
const SHARED_VECTORS: ReadonlyArray<{ n: number; input: string; valid: boolean; note: string }> = [
  { n: 1, input: "12.ABC.345/01DE-35", valid: true, note: "exemplo da nota técnica" },
  { n: 2, input: "zz0teste000100", valid: true, note: "minúsculas" },
  { n: 3, input: "ZZ0TESTE000282", valid: true, note: "" },
  { n: 4, input: "ZZ0TESTE000101", valid: false, note: "DV errado" },
  { n: 5, input: "ZZ0TESTE0001A0", valid: false, note: "letra na posição do DV" },
  { n: 6, input: "ZZ0TESTE00010", valid: false, note: "13 caracteres" },
  { n: 7, input: "ÁZ0TESTE000100", valid: false, note: "caractere fora de 0-9A-Z" },
  { n: 8, input: "99.999.999/0001-91", valid: true, note: "CNPJ numérico" },
  { n: 9, input: "00000000000000", valid: false, note: "repetidos" },
  { n: 10, input: "AAAAAAAAAAAAAA", valid: false, note: "repetidos" },
  { n: 11, input: "000.000.001-91", valid: true, note: "CPF" },
  { n: 12, input: "00000000272", valid: true, note: "CPF" },
  { n: 13, input: "10000000957", valid: true, note: "CPF" },
  { n: 14, input: "00000000192", valid: false, note: "CPF com DV errado" },
  { n: 15, input: "11111111111", valid: false, note: "CPF repetidos" },
  { n: 16, input: "ZZ0TESTE000363", valid: true, note: "" },
  { n: 17, input: "ZZ0TESTE000444", valid: true, note: "" },
  { n: 18, input: "EX0A1B2C000119", valid: true, note: "" },
  { n: 19, input: "", valid: false, note: "vazio" },
  { n: 20, input: "123456789012345", valid: false, note: "15 caracteres" },
];

describe("normalizeDocument (vetores 12.3)", () => {
  it.each([
    ["12.ABC.345/01DE-35", "12ABC34501DE35"],
    ["zz0teste000100", "ZZ0TESTE000100"],
    ["99.999.999/0001-91", "99999999000191"],
    ["000.000.001-91", "00000000191"],
    ["  000 000 001 91  ", "00000000191"],
  ])("%s vira %s", (input, expected) => {
    expect(normalizeDocument(input)).toBe(expected);
  });

  it("vazio, nulo e só formatação viram null", () => {
    for (const input of ["", " ./- ", "   ", null, undefined]) {
      expect(normalizeDocument(input)).toBeNull();
    }
  });

  it("caractere estranho não é descartado em silêncio: o documento fica inválido", () => {
    expect(normalizeDocument("ÁZ0TESTE000100")).toBe("ÁZ0TESTE000100");
    expect(normalizeDocument("123,456,789-09")).toBe("123,456,78909");
    expect(isValidDocument(normalizeDocument("ÁZ0TESTE000100"))).toBe(false);
  });
});

describe("isValidDocument: os 20 vetores compartilhados com o pgTAP", () => {
  it.each(SHARED_VECTORS)("vetor $n ($input): $valid $note", ({ input, valid }) => {
    expect(isValidDocument(normalizeDocument(input))).toBe(valid);
  });

  it("cobre exatamente os 20 vetores do arquivo 07", () => {
    expect(SHARED_VECTORS).toHaveLength(20);
    expect(SHARED_VECTORS.map((vector) => vector.n)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });
});

describe("isValidCnpj", () => {
  it("o exemplo oficial alfanumérico é válido e o cálculo novo valida o numérico", () => {
    expect(isValidCnpj("12ABC34501DE35")).toBe(true);
    expect(isValidCnpj("99999999000191")).toBe(true);
  });

  it("espera o canônico: minúsculas, máscara e nulo são recusados", () => {
    expect(isValidCnpj("12abc34501de35")).toBe(false);
    expect(isValidCnpj("12.ABC.345/01DE-35")).toBe(false);
    expect(isValidCnpj(null)).toBe(false);
    expect(isValidCnpj(undefined)).toBe(false);
  });

  it("resto menor que 2 vira DV 0, no primeiro e no segundo dígito", () => {
    // Fictícios, gerados pelo algoritmo e conferidos contra private.is_valid_cnpj no banco local.
    expect(isValidCnpj("EX0TESTE000200")).toBe(true); // DV1: resto 0 -> 0
    expect(isValidCnpj("EX0TESTE000120")).toBe(true); // DV2: resto 1 -> 0
    expect(isValidCnpj("EX0TESTE000210")).toBe(false);
  });

  it("recusa DV errado em qualquer um dos dois dígitos e DV com letra", () => {
    expect(isValidCnpj("12ABC34501DE45")).toBe(false); // DV2 errado
    expect(isValidCnpj("12ABC34501DE30")).toBe(false); // DV2 errado
    expect(isValidCnpj("12ABC34501DE25")).toBe(false); // DV1 errado
    expect(isValidCnpj("12ABC34501DEA5")).toBe(false); // letra no DV
  });
});

describe("isValidCpf", () => {
  it("aceita CPF válido e recusa DV errado, letra, repetidos, nulo e tamanho errado", () => {
    expect(isValidCpf("00000000191")).toBe(true);
    expect(isValidCpf("00000000192")).toBe(false);
    expect(isValidCpf("0000000019A")).toBe(false);
    expect(isValidCpf("11111111111")).toBe(false);
    expect(isValidCpf("0000000019")).toBe(false);
    expect(isValidCpf(null)).toBe(false);
  });

  it("DV com resultado 10 vira 0, no primeiro e no segundo dígito (modelagem 3.2)", () => {
    // Fictícios, gerados pelo algoritmo e conferidos contra private.is_valid_cpf no banco local.
    expect(isValidCpf("00000000604")).toBe(true); // DV1: (soma * 10) % 11 = 10 -> 0
    expect(isValidCpf("00000001830")).toBe(true); // DV2: (soma * 10) % 11 = 10 -> 0
    expect(isValidCpf("00000000614")).toBe(false);
  });
});

describe("isValidDocument e documentTypeOf", () => {
  it("só 11 (CPF) e 14 (CNPJ) caracteres valem; outros tamanhos e nulo, não", () => {
    expect(isValidDocument("1234567890")).toBe(false);
    expect(isValidDocument(null)).toBe(false);
    expect(isValidDocument(undefined)).toBe(false);
  });

  it("deduz o tipo pelo tamanho, sem conferir o DV", () => {
    expect(documentTypeOf("00000000191")).toBe("CPF");
    expect(documentTypeOf("12ABC34501DE35")).toBe("CNPJ");
    expect(documentTypeOf("00000000192")).toBe("CPF");
    expect(documentTypeOf("123")).toBeNull();
    expect(documentTypeOf(null)).toBeNull();
  });
});

describe("formatação para exibição", () => {
  it("formata CPF, CNPJ numérico e CNPJ alfanumérico", () => {
    expect(formatCpf("00000000191")).toBe("000.000.001-91");
    expect(formatCnpj("99999999000191")).toBe("99.999.999/0001-91");
    expect(formatCnpj("12ABC34501DE35")).toBe("12.ABC.345/01DE-35");
  });

  it("formatDocument escolhe pelo tamanho e devolve como veio o que não reconhece", () => {
    expect(formatDocument("00000000191")).toBe("000.000.001-91");
    expect(formatDocument("12ABC34501DE35")).toBe("12.ABC.345/01DE-35");
    expect(formatDocument("123")).toBe("123");
    expect(formatDocument(null)).toBe("");
  });

  it("ida e volta: formatar e normalizar devolve o canônico", () => {
    for (const canonical of ["00000000191", "12ABC34501DE35", "99999999000191"]) {
      expect(normalizeDocument(formatDocument(canonical))).toBe(canonical);
    }
  });

  it("describeDocument escreve o tipo e o número (UI 4.2) ou 'Sem documento'", () => {
    expect(describeDocument("00000000191")).toBe("CPF 000.000.001-91");
    expect(describeDocument("12ABC34501DE35")).toBe("CNPJ 12.ABC.345/01DE-35");
    expect(describeDocument(null)).toBe("Sem documento");
    expect(describeDocument("")).toBe("Sem documento");
  });
});

describe("parseDocumentInput: mensagens da UI 4.1.2", () => {
  it("campo vazio é válido (documento opcional)", () => {
    expect(parseDocumentInput("")).toEqual({ ok: true, canonical: null, type: null });
    expect(parseDocumentInput("  ./- ", "CPF")).toEqual({ ok: true, canonical: null, type: null });
    expect(parseDocumentInput(null)).toEqual({ ok: true, canonical: null, type: null });
  });

  it("CPF e CNPJ válidos devolvem o canônico e o tipo", () => {
    expect(parseDocumentInput("000.000.001-91", "CPF")).toEqual({ ok: true, canonical: "00000000191", type: "CPF" });
    expect(parseDocumentInput("12.abc.345/01de-35", "CNPJ")).toEqual({
      ok: true,
      canonical: "12ABC34501DE35",
      type: "CNPJ",
    });
    expect(parseDocumentInput("00000000191")).toMatchObject({ ok: true, type: "CPF" });
    expect(parseDocumentInput("12ABC34501DE35")).toMatchObject({ ok: true, type: "CNPJ" });
  });

  it("CPF incompleto ou com DV errado", () => {
    expect(parseDocumentInput("000.000.001-9", "CPF")).toMatchObject({
      ok: false,
      reason: "INCOMPLETE",
      message: "O CPF precisa ter 11 números.",
    });
    expect(parseDocumentInput("00000000192", "CPF")).toMatchObject({
      ok: false,
      reason: "INVALID",
      message: "CPF inválido. Confira os números.",
    });
    expect(parseDocumentInput("11111111111", "CPF")).toMatchObject({ ok: false, reason: "INVALID" });
  });

  it("CPF com letra conta como incompleto (o campo só aceita números)", () => {
    expect(parseDocumentInput("0000000019A", "CPF")).toMatchObject({ ok: false, reason: "INCOMPLETE" });
  });

  it("CNPJ incompleto ou com DV errado", () => {
    expect(parseDocumentInput("ZZ0TESTE00010", "CNPJ")).toMatchObject({
      ok: false,
      reason: "INCOMPLETE",
      message: "O CNPJ precisa ter 14 caracteres, entre números e letras.",
    });
    expect(parseDocumentInput("ZZ0TESTE000101", "CNPJ")).toMatchObject({
      ok: false,
      reason: "INVALID",
      message: "CNPJ inválido. Confira os números e as letras.",
    });
    expect(parseDocumentInput("ZZ0TESTE0001A0", "CNPJ")).toMatchObject({ ok: false, reason: "INVALID" });
    expect(parseDocumentInput("ÁZ0TESTE000100", "CNPJ")).toMatchObject({ ok: false, reason: "INVALID" });
  });

  it("o tipo escolhido manda: um CPF digitado no campo de CNPJ é incompleto para CNPJ", () => {
    expect(parseDocumentInput("000.000.001-91", "CNPJ")).toMatchObject({ ok: false, reason: "INCOMPLETE", type: "CNPJ" });
  });

  it("sem tipo escolhido e com tamanho que não é de CPF nem de CNPJ", () => {
    expect(parseDocumentInput("12345")).toEqual({
      ok: false,
      reason: "INCOMPLETE",
      type: null,
      message: DOCUMENT_MESSAGES.unknownLength,
    });
  });
});
