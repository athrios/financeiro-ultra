import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";

import { dbError } from "../../../tests/unit-support/fake-supabase";
import {
  READ_PAGE_SIZE,
  fetchAllRows,
  isUuidText,
  nullable,
  optional,
  unwrap,
  unwrapMaybe,
  unwrapRows,
} from "./helpers";

describe("unwrap", () => {
  it("devolve os dados quando não há erro", () => {
    expect(unwrap({ data: { id: 1 }, error: null })).toEqual({ id: 1 });
    expect(unwrapRows({ data: [1, 2], error: null })).toEqual([1, 2]);
    expect(unwrapRows({ data: null, error: null })).toEqual([]);
    expect(unwrapMaybe({ data: null, error: null })).toBeNull();
    expect(unwrapMaybe({ data: { id: 1 }, error: null })).toEqual({ id: 1 });
  });

  it("traduz o erro do banco com hint, details e contexto", () => {
    const error = dbError("P0001", "STALE_VERSION", { current_updated_at: "2026-11-25T18:00:00.000001+00:00" });
    expect(() => unwrap({ data: null, error }, { subject: "client" })).toThrow(AppError);
    try {
      unwrap({ data: null, error }, { subject: "client" });
    } catch (caught) {
      const appError = caught as AppError;
      expect(appError.hint).toBe("STALE_VERSION");
      expect(appError.message).toContain("Este cliente");
      expect(appError.details).toEqual({ hint: "STALE_VERSION", currentUpdatedAt: "2026-11-25T18:00:00.000001+00:00" });
    }
    expect(() => unwrapRows({ data: null, error })).toThrow(AppError);
    expect(() => unwrapMaybe({ data: null, error })).toThrow(AppError);
  });

  it("resposta vazia sem erro vira UNEXPECTED (nunca devolve null como se fosse sucesso)", () => {
    try {
      unwrap({ data: null, error: null });
      expect.unreachable();
    } catch (caught) {
      expect((caught as AppError).code).toBe("UNEXPECTED");
    }
  });
});

describe("nullable e optional", () => {
  it("nullable mantém o null (vai como JSON null ao banco); optional troca null por undefined (parâmetro omitido)", () => {
    expect(nullable<string>(null)).toBeNull();
    expect(nullable("x")).toBe("x");
    expect(optional(null)).toBeUndefined();
    expect(optional(undefined)).toBeUndefined();
    expect(optional("motivo")).toBe("motivo");
  });
});

describe("fetchAllRows", () => {
  it("lê todas as páginas, sem parar no limite do PostgREST", async () => {
    const total = READ_PAGE_SIZE * 2 + 3;
    const calls: Array<[number, number]> = [];
    const rows = await fetchAllRows((from, to) => {
      calls.push([from, to]);
      const size = Math.max(0, Math.min(to, total - 1) - from + 1);
      return Promise.resolve({ data: Array.from({ length: size }, (_, i) => from + i), error: null });
    });
    expect(rows).toHaveLength(total);
    expect(rows[0]).toBe(0);
    expect(rows[total - 1]).toBe(total - 1);
    expect(calls).toEqual([
      [0, READ_PAGE_SIZE - 1],
      [READ_PAGE_SIZE, READ_PAGE_SIZE * 2 - 1],
      [READ_PAGE_SIZE * 2, READ_PAGE_SIZE * 3 - 1],
    ]);
  });

  it("uma consulta que termina exatamente na página cheia pede mais uma e para na vazia", async () => {
    let calls = 0;
    const rows = await fetchAllRows((from) => {
      calls += 1;
      const size = from === 0 ? READ_PAGE_SIZE : 0;
      return Promise.resolve({ data: Array.from({ length: size }, (_, i) => i), error: null });
    });
    expect(rows).toHaveLength(READ_PAGE_SIZE);
    expect(calls).toBe(2);
  });

  it("erro numa página interrompe e é traduzido", async () => {
    await expect(
      fetchAllRows(() => Promise.resolve({ data: null, error: dbError("42501", "ADMIN_REQUIRED") })),
    ).rejects.toMatchObject({ code: "FORBIDDEN", hint: "ADMIN_REQUIRED" });
  });
});

describe("isUuidText", () => {
  it("aceita uuid e recusa o resto (id de URL inválido nunca chega ao banco)", () => {
    expect(isUuidText("a0000000-0000-4000-8000-000000000001")).toBe(true);
    expect(isUuidText("A0000000-0000-4000-8000-00000000000F")).toBe(true);
    expect(isUuidText("xxx")).toBe(false);
    expect(isUuidText("")).toBe(false);
    expect(isUuidText("a0000000-0000-4000-8000-00000000000")).toBe(false);
    expect(isUuidText("a0000000-0000-4000-8000-000000000001 ")).toBe(false);
  });
});
