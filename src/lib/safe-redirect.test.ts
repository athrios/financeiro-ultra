import { describe, expect, it } from "vitest";

import { safeInternalPath } from "./safe-redirect";

describe("safeInternalPath", () => {
  it("aceita caminhos internos e preserva a query", () => {
    expect(safeInternalPath("/")).toBe("/");
    expect(safeInternalPath("/recebimentos")).toBe("/recebimentos");
    expect(safeInternalPath("/configuracoes/socios?aba=1&x=2")).toBe("/configuracoes/socios?aba=1&x=2");
  });

  it("usa o padrão para valores ausentes ou que não são texto", () => {
    for (const value of [undefined, null, 42, {}, [], ""]) {
      expect(safeInternalPath(value)).toBe("/");
    }
    expect(safeInternalPath(undefined, { fallback: "/inicio" })).toBe("/inicio");
  });

  it.each([
    "https://evil.example/",
    "http://evil.example",
    "//evil.example",
    "//evil.example/caminho",
    "///evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "\\/evil.example",
    "/\\/evil.example",
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "evil.example",
    "recebimentos",
    "/\t/evil.example",
    "/\n/evil.example",
    "/\r/evil.example",
    "/%0a/evil.example/..",
    " //evil.example",
    "/..//evil.example",
    "/a/..//evil.example",
    "/ok\u0000",
  ])("rejeita %j", (candidate) => {
    const result = safeInternalPath(candidate);
    // O resultado, quando não é o padrão, precisa ser um caminho interno puro.
    expect(result.startsWith("/")).toBe(true);
    expect(result.startsWith("//")).toBe(false);
    expect(result).not.toContain("evil.example");
  });

  it("rejeita especificamente esquemas e hosts", () => {
    expect(safeInternalPath("https://evil.example/")).toBe("/");
    expect(safeInternalPath("//evil.example")).toBe("/");
    expect(safeInternalPath("/\\evil.example")).toBe("/");
    expect(safeInternalPath("javascript:alert(1)")).toBe("/");
  });

  it("trata caminho com %2F codificado como caminho (não como host)", () => {
    expect(safeInternalPath("/%2F%2Fevil.example")).toBe("/%2F%2Fevil.example");
  });

  it("normaliza segmentos de ponto", () => {
    expect(safeInternalPath("/a/../clientes")).toBe("/clientes");
  });

  it("rejeita textos acima do limite de tamanho", () => {
    expect(safeInternalPath(`/${"a".repeat(3000)}`)).toBe("/");
  });

  it("não devolve rotas de autenticação como destino (evita laço depois do login)", () => {
    for (const route of ["/login", "/login?next=/", "/recuperar-senha", "/auth/confirm?token_hash=x", "/definir-senha"]) {
      expect(safeInternalPath(route)).toBe("/");
    }
    expect(safeInternalPath("/login", { allowAuthRoutes: true })).toBe("/login");
  });
});
