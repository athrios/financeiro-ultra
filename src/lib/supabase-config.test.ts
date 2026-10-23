import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Conferências estáticas de supabase/config.toml (sem dependência de TOML: leitura por seção).
 * Registram decisões de segurança que não podem regredir sem aviso.
 */
const config = readFileSync(join(process.cwd(), "supabase", "config.toml"), "utf8").replace(/\r\n/g, "\n");

/** Linhas de uma seção `[nome]`, sem comentários. */
function section(name: string): string[] {
  const lines = config.split("\n");
  const start = lines.findIndex((line) => line.trim() === `[${name}]`);
  if (start === -1) return [];
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s*\[/.test(line)) break;
    if (!line.trim().startsWith("#")) body.push(line);
  }
  return body;
}

function arrayValue(lines: string[], key: string): string[] {
  const line = lines.find((item) => new RegExp(`^\\s*${key}\\s*=`).test(item));
  if (!line) return [];
  return [...line.matchAll(/"([^"]*)"/g)].map((match) => match[1]);
}

function scalarValue(lines: string[], key: string): string | undefined {
  const line = lines.find((item) => new RegExp(`^\\s*${key}\\s*=`).test(item));
  return line?.split("=")[1]?.trim();
}

describe("supabase/config.toml", () => {
  it("o schema private não é exposto na API (SEG-E45-10)", () => {
    const api = section("api");
    const schemas = arrayValue(api, "schemas");
    const searchPath = arrayValue(api, "extra_search_path");
    expect(schemas.length).toBeGreaterThan(0);
    expect(schemas).toContain("public");
    expect(schemas).not.toContain("private");
    expect(searchPath).not.toContain("private");
  });

  it("troca de senha exige sessão recente e o aviso por e-mail fica desligado (SEG-E45-01, RAT-D020)", () => {
    expect(scalarValue(section("auth.email"), "secure_password_change")).toBe("true");
    const notification = section("auth.email.notification.password_changed");
    expect(scalarValue(notification, "enabled")).toBe("false");
  });

  it("o auto-cadastro continua desligado", () => {
    expect(scalarValue(section("auth"), "enable_signup")).toBe("false");
  });
});
