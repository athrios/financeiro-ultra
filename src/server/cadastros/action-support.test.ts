import { beforeEach, describe, expect, it, vi } from "vitest";

import { createLogger, type LogSink } from "@/lib/logger";

const lines: string[] = [];
const sink: LogSink = (_level, line) => {
  lines.push(line);
};

vi.mock("@/server/request-context", () => ({
  getRequestLogger: async () => createLogger({ level: "info", sink }),
}));

import { describeCause, toActionFailure } from "./action-support";

// Valores fictícios (RAT-D019).
const CNPJ = "99.999.999/0002-72";
const CNPJ_BARE = "99999999000272";
const PIX_PHONE = "+5523987654321";
const PIX_RANDOM = "6f1d7a4e-0b1c-4d2e-8f3a-9b8c7d6e5f40";
const ACCOUNT = "banco exemplo|1234|56789";

beforeEach(() => {
  lines.length = 0;
});

describe("toActionFailure: log técnico sem dado de cadastro (SEG-CAD-01)", () => {
  it("erro inesperado do banco com details de CNPJ, Pix e conta: o log não os contém", async () => {
    const dbError = {
      code: "23502",
      hint: "revise a linha",
      message: "null value in column \"name\" of relation \"clients\" violates not-null constraint",
      details: `Failing row contains (${CNPJ}, ${CNPJ_BARE}, ${PIX_PHONE}, ${PIX_RANDOM}, ${ACCOUNT}).`,
    };

    const failure = await toActionFailure(dbError, "saveClient", "c0000000-0000-4000-8000-000000000001");

    expect(failure.error.code).toBe("UNEXPECTED");
    expect(failure.supportCode).toBe("c0000000-0000-4000-8000-000000000001");
    expect(lines).toHaveLength(1);
    const line = lines[0];
    for (const leaked of [CNPJ, CNPJ_BARE, PIX_PHONE, PIX_RANDOM, ACCOUNT, "Failing row", "details"]) {
      expect(line).not.toContain(leaked);
    }
    // Mantém o que ajuda o suporte: operação, código, dica e mensagem.
    const parsed = JSON.parse(line) as { event: string; operation: string; cause: Record<string, string> };
    expect(parsed).toMatchObject({ event: "cadastros.action_failed", operation: "saveClient" });
    expect(parsed.cause).toMatchObject({ code: "23502", hint: "revise a linha" });
    expect(parsed.cause.message).toContain("violates not-null constraint");
  });

  it("CNPJ dentro do message ainda sai redigido pelo logger", async () => {
    await toActionFailure({ code: "XX000", message: `valor ${CNPJ} recusado`, details: PIX_PHONE }, "saveClient", null);
    expect(lines[0]).not.toContain(CNPJ);
    expect(lines[0]).not.toContain(PIX_PHONE);
  });

  it("erro conhecido não vai ao log", async () => {
    const failure = await toActionFailure({ code: "42501", message: "permission denied" }, "saveClient", "c-1");
    expect(failure.error.code).toBe("FORBIDDEN");
    expect(lines).toHaveLength(0);
  });
});

describe("describeCause", () => {
  it("guarda só code, hint e message", () => {
    expect(describeCause({ code: "1", hint: "h", message: "m", details: "d", extra: { a: 1 } })).toEqual({ code: "1", hint: "h", message: "m" });
  });

  it("aceita Error, texto e ausência", () => {
    expect(describeCause(new Error("falhou"))).toEqual({ message: "falhou" });
    expect(describeCause("texto")).toEqual({ message: "texto" });
    expect(describeCause(undefined)).toBeUndefined();
    expect(describeCause(42)).toBeUndefined();
  });
});
