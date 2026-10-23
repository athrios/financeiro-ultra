import { describe, expect, it } from "vitest";

import {
  APP_ERROR_CODES,
  APP_ERROR_MESSAGES,
  AppError,
  fail,
  mapDatabaseError,
  ok,
  toAppError,
} from "./errors";

describe("mapDatabaseError", () => {
  const cases: ReadonlyArray<[string, (typeof APP_ERROR_CODES)[number]]> = [
    ["23505", "CONFLICT"],
    ["23514", "VALIDATION"],
    ["42501", "FORBIDDEN"],
    ["22023", "VALIDATION"],
    ["P0001", "RULE_VIOLATION"],
    ["P0002", "NOT_FOUND"],
    ["PGRST116", "NOT_FOUND"],
    ["PGRST301", "UNAUTHENTICATED"],
  ];

  it.each(cases)("SQLSTATE %s vira %s", (sqlstate, expected) => {
    const mapped = mapDatabaseError({ code: sqlstate, message: "original" });
    expect(mapped).toBeInstanceOf(AppError);
    expect(mapped.code).toBe(expected);
  });

  it("usa mensagem fixa em pt-BR e nunca o texto do banco", () => {
    const original = 'duplicate key value violates unique constraint "partners_name_key" on public.partners';
    const mapped = mapDatabaseError({ code: "23505", message: original, details: "Key (name)=(Sócio Exemplo A)" });
    expect(mapped.message).toBe(APP_ERROR_MESSAGES.CONFLICT);
    expect(mapped.message).not.toContain("partners");
    expect(mapped.message).not.toContain("Sócio Exemplo A");
  });

  it("preserva o erro original em cause (só para log)", () => {
    const original = { code: "42501", message: "permission denied for table profiles" };
    expect(mapDatabaseError(original).cause).toBe(original);
  });

  it("erro desconhecido vira UNEXPECTED com mensagem genérica", () => {
    for (const unknown of [{ code: "XX000", message: "falha interna" }, new Error("boom"), "texto", null, undefined]) {
      const mapped = mapDatabaseError(unknown);
      expect(mapped.code).toBe("UNEXPECTED");
      expect(mapped.message).toBe(APP_ERROR_MESSAGES.UNEXPECTED);
    }
  });

  it("não reencapsula AppError", () => {
    const original = new AppError("FORBIDDEN");
    expect(mapDatabaseError(original)).toBe(original);
    expect(toAppError(original)).toBe(original);
  });

  it("todas as mensagens estão em português, sem pontos de exclamação nem jargão técnico", () => {
    for (const code of APP_ERROR_CODES) {
      const message = APP_ERROR_MESSAGES[code];
      expect(message.length).toBeGreaterThan(10);
      expect(message).not.toMatch(/!|SQLSTATE|RLS|JWT|token|stack|exception/i);
    }
  });
});

describe("AppError e resultados", () => {
  it("aceita mensagem própria e campo", () => {
    const error = new AppError("VALIDATION", { field: "email", message: "Informe um e-mail válido." });
    expect(error.message).toBe("Informe um e-mail válido.");
    expect(error.field).toBe("email");
    expect(error.name).toBe("AppError");
  });

  it("fail/ok produzem o formato discriminado do plano (seção 5)", () => {
    expect(ok(42)).toEqual({ ok: true, data: 42 });
    expect(fail(new AppError("FORBIDDEN"))).toEqual({
      ok: false,
      error: { code: "FORBIDDEN", message: APP_ERROR_MESSAGES.FORBIDDEN },
    });
    expect(fail(new AppError("VALIDATION", { field: "motivo" })).error.field).toBe("motivo");
  });

  it("o resultado de fail não carrega stack nem causa", () => {
    const result = fail(new AppError("UNEXPECTED", { cause: new Error("segredo interno") }));
    expect(JSON.stringify(result)).not.toContain("segredo interno");
    expect(JSON.stringify(result)).not.toContain("stack");
  });
});
