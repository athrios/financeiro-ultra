import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy, buildSecurityHeaders, originOf } from "./security-headers";

const SUPABASE = "https://projeto-exemplo.supabase.co/rest/v1";

const prod = { supabaseUrl: SUPABASE, isDevelopment: false, isProductionEnv: true };
const local = { supabaseUrl: "http://127.0.0.1:54321", isDevelopment: false, isProductionEnv: false };
const dev = { supabaseUrl: "http://127.0.0.1:54321", isDevelopment: true, isProductionEnv: false };

function directive(csp: string, name: string): string[] {
  const entry = csp.split("; ").find((part) => part.startsWith(`${name} `) || part === name);
  return entry ? entry.split(" ").slice(1) : [];
}

describe("originOf", () => {
  it("reduz a URL à origem e rejeita valores inválidos", () => {
    expect(originOf(SUPABASE)).toBe("https://projeto-exemplo.supabase.co");
    expect(originOf("http://127.0.0.1:54321")).toBe("http://127.0.0.1:54321");
    expect(originOf(undefined)).toBeNull();
    expect(originOf("não é url")).toBeNull();
    expect(originOf("javascript:alert(1)")).toBeNull();
  });
});

describe("Content-Security-Policy", () => {
  it("restringe fontes, objetos, base, formulários e quem pode embutir o site", () => {
    const csp = buildContentSecurityPolicy(prod);
    expect(directive(csp, "default-src")).toEqual(["'self'"]);
    expect(directive(csp, "object-src")).toEqual(["'none'"]);
    expect(directive(csp, "base-uri")).toEqual(["'self'"]);
    expect(directive(csp, "form-action")).toEqual(["'self'"]);
    expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
  });

  it("libera conexão apenas ao próprio site e ao Supabase configurado", () => {
    expect(directive(buildContentSecurityPolicy(prod), "connect-src")).toEqual([
      "'self'",
      "https://projeto-exemplo.supabase.co",
    ]);
    expect(directive(buildContentSecurityPolicy(local), "connect-src")).toEqual(["'self'", "http://127.0.0.1:54321"]);
  });

  it("não deixa a URL do Supabase inválida abrir o connect-src", () => {
    const csp = buildContentSecurityPolicy({ ...prod, supabaseUrl: "javascript:alert(1)" });
    expect(directive(csp, "connect-src")).toEqual(["'self'"]);
    expect(csp).not.toContain("javascript:");
  });

  it("não usa curinga amplo nem 'unsafe-eval' em produção", () => {
    const csp = buildContentSecurityPolicy(prod);
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toMatch(/\s\*[\s;]|\s\*$|https:\s|https:$/);
    expect(directive(csp, "script-src")).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it("'unsafe-eval' e WebSocket só no desenvolvimento", () => {
    const csp = buildContentSecurityPolicy(dev);
    expect(directive(csp, "script-src")).toContain("'unsafe-eval'");
    expect(directive(csp, "connect-src")).toContain("ws:");
    expect(buildContentSecurityPolicy(local)).not.toContain("'unsafe-eval'");
  });

  it("upgrade-insecure-requests apenas com APP_ENV=production", () => {
    expect(buildContentSecurityPolicy(prod)).toContain("upgrade-insecure-requests");
    expect(buildContentSecurityPolicy(local)).not.toContain("upgrade-insecure-requests");
  });
});

describe("buildSecurityHeaders", () => {
  const byKey = (entries: ReturnType<typeof buildSecurityHeaders>) =>
    Object.fromEntries(entries.map((entry) => [entry.key, entry.value]));

  it("sempre envia CSP, nosniff, Referrer-Policy e proteção contra frames", () => {
    for (const input of [prod, local, dev]) {
      const headers = byKey(buildSecurityHeaders(input));
      expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
      expect(headers["X-Content-Type-Options"]).toBe("nosniff");
      expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
      expect(headers["X-Frame-Options"]).toBe("DENY");
    }
  });

  it("HSTS somente em produção", () => {
    expect(byKey(buildSecurityHeaders(prod))["Strict-Transport-Security"]).toBe("max-age=31536000");
    expect(byKey(buildSecurityHeaders(local))["Strict-Transport-Security"]).toBeUndefined();
    expect(byKey(buildSecurityHeaders(dev))["Strict-Transport-Security"]).toBeUndefined();
  });

  it("não repete cabeçalhos", () => {
    const keys = buildSecurityHeaders(prod).map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
