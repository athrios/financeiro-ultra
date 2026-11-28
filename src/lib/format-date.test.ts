import { describe, expect, it } from "vitest";

import { formatDate, formatDateTime } from "./format-date";

describe("formatDate / formatDateTime (fuso America/Sao_Paulo)", () => {
  it("converte o texto do banco (UTC, microssegundos) para dd/mm/aaaa e hh:mm de Brasília", () => {
    expect(formatDate("2026-11-25T18:04:17.980158+00:00")).toBe("25/11/2026");
    expect(formatDateTime("2026-11-25T18:04:17.980158+00:00")).toBe("25/11/2026 às 15:04");
  });

  it("vira o dia pelo fuso: 02:30 UTC ainda é o dia anterior em Brasília", () => {
    expect(formatDate("2026-11-26T02:30:00+00:00")).toBe("25/11/2026");
    expect(formatDateTime("2026-11-26T02:30:00+00:00")).toBe("25/11/2026 às 23:30");
  });

  it("meia-noite aparece como 00:00 (ciclo de 24 horas)", () => {
    expect(formatDateTime("2026-11-25T03:00:00+00:00")).toBe("25/11/2026 às 00:00");
  });

  it("texto vazio ou ilegível vira vazio", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate("")).toBe("");
    expect(formatDateTime("não é data")).toBe("");
  });
});
