import { describe, expect, it } from "vitest";

import { isPublicPath, redirectsWhenAuthenticated, skipsLoginRedirect } from "./route-access";

describe("rotas públicas do proxy (P-11)", () => {
  it("/login, /recuperar-senha e /auth/confirm são públicas", () => {
    for (const path of ["/login", "/recuperar-senha", "/auth/confirm", "/auth/confirm/"]) {
      expect(isPublicPath(path)).toBe(true);
    }
  });

  it("/definir-senha não é pública, mas o proxy a deixa passar para a página mostrar a sessão expirada", () => {
    expect(isPublicPath("/definir-senha")).toBe(false);
    expect(skipsLoginRedirect("/definir-senha")).toBe(true);
  });

  it("qualquer outro caminho sem sessão vai ao login, inclusive URL inexistente", () => {
    for (const path of ["/", "/competencias", "/configuracoes/socios", "/rota-que-nao-existe", "/auth", "/auth/outro"]) {
      expect(skipsLoginRedirect(path)).toBe(false);
    }
  });

  it("não confunde prefixos parecidos", () => {
    for (const path of ["/login-falso", "/loginx", "/recuperar-senha-x", "/auth/confirmar", "/definir-senhas"]) {
      expect(skipsLoginRedirect(path)).toBe(false);
    }
  });

  it("com sessão, /login e /recuperar-senha voltam ao início; /auth/confirm e /definir-senha seguem abertas", () => {
    expect(redirectsWhenAuthenticated("/login")).toBe(true);
    expect(redirectsWhenAuthenticated("/recuperar-senha")).toBe(true);
    expect(redirectsWhenAuthenticated("/auth/confirm")).toBe(false);
    expect(redirectsWhenAuthenticated("/definir-senha")).toBe(false);
    expect(redirectsWhenAuthenticated("/")).toBe(false);
  });
});
