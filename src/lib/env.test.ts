import { describe, expect, it } from "vitest";

import { assertDeployEnv, deployEnvIssues, EnvError, parsePublicEnv, parseServerEnv } from "./env";

const URL_OK = "http://127.0.0.1:54321";
const KEY_OK = "sb_publishable_chave_de_teste";

function jwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.assinatura`;
}

function issuesOf(fn: () => unknown): readonly string[] {
  try {
    fn();
  } catch (error) {
    if (error instanceof EnvError) return error.issues;
    throw error;
  }
  throw new Error("Esperava EnvError, mas nada foi lançado.");
}

describe("parsePublicEnv", () => {
  it("aceita URL e chave válidas", () => {
    expect(
      parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: URL_OK,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: KEY_OK,
      }),
    ).toEqual({ supabaseUrl: URL_OK, supabasePublishableKey: KEY_OK });
  });

  it("falha com mensagem clara quando as variáveis estão ausentes ou vazias", () => {
    const issues = issuesOf(() =>
      parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined }),
    );
    expect(issues).toHaveLength(2);
    expect(issues.join("\n")).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(issues.join("\n")).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  });

  it("rejeita URL inválida ou com protocolo diferente de http(s)", () => {
    for (const bad of ["não é url", "ftp://exemplo.test", "javascript:alert(1)"]) {
      const issues = issuesOf(() =>
        parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: bad, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: KEY_OK }),
      );
      expect(issues.join("\n")).toContain("NEXT_PUBLIC_SUPABASE_URL");
    }
  });

  it("rejeita chave secreta no lugar da chave pública", () => {
    for (const secret of ["sb_secret_abc123", jwt({ role: "service_role" })]) {
      const issues = issuesOf(() =>
        parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: URL_OK, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: secret }),
      );
      expect(issues.join("\n")).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    }
  });

  it("aceita a chave anon em formato JWT", () => {
    expect(() =>
      parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: URL_OK, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt({ role: "anon" }) }),
    ).not.toThrow();
  });

  it("não repete o valor informado na mensagem de erro", () => {
    const secret = "sb_secret_valor_que_nao_deve_vazar";
    try {
      parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: URL_OK, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: secret });
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(secret);
      return;
    }
    throw new Error("Esperava falha.");
  });
});

describe("parseServerEnv", () => {
  const base = { NEXT_PUBLIC_SUPABASE_URL: URL_OK, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: KEY_OK };

  it("usa os padrões local e info quando APP_ENV e LOG_LEVEL estão ausentes", () => {
    const env = parseServerEnv(base);
    expect(env.appEnv).toBe("local");
    expect(env.logLevel).toBe("info");
  });

  it("aceita os valores válidos de APP_ENV e LOG_LEVEL", () => {
    const env = parseServerEnv({ ...base, APP_ENV: "production", LOG_LEVEL: "warn" });
    expect(env.appEnv).toBe("production");
    expect(env.logLevel).toBe("warn");
  });

  it("rejeita APP_ENV e LOG_LEVEL fora da lista", () => {
    const issues = issuesOf(() => parseServerEnv({ ...base, APP_ENV: "prod", LOG_LEVEL: "verbose" }));
    expect(issues.join("\n")).toContain("APP_ENV");
    expect(issues.join("\n")).toContain("LOG_LEVEL");
  });

  it("acumula todos os problemas em uma única falha", () => {
    const issues = issuesOf(() => parseServerEnv({ APP_ENV: "x" }));
    expect(issues.length).toBeGreaterThanOrEqual(3);
  });

  it("permite a chave secreta somente no ambiente local (scripts de desenvolvimento)", () => {
    expect(() => parseServerEnv({ ...base, APP_ENV: "local", SUPABASE_SECRET_KEY: "sb_secret_local" })).not.toThrow();
    expect(() => parseServerEnv({ ...base, SUPABASE_SECRET_KEY: "sb_secret_local" })).not.toThrow();
  });

  it("proíbe a chave secreta em staging e production", () => {
    for (const appEnv of ["staging", "production"]) {
      const issues = issuesOf(() => parseServerEnv({ ...base, APP_ENV: appEnv, SUPABASE_SECRET_KEY: "sb_secret_x" }));
      expect(issues.join("\n")).toContain("SUPABASE_SECRET_KEY");
    }
  });

  it("ignora SUPABASE_SECRET_KEY vazia em production", () => {
    expect(() => parseServerEnv({ ...base, APP_ENV: "production", SUPABASE_SECRET_KEY: "" })).not.toThrow();
  });

  it("o resultado nunca expõe a chave secreta", () => {
    const env = parseServerEnv({ ...base, SUPABASE_SECRET_KEY: "sb_secret_local" });
    expect(JSON.stringify(env)).not.toContain("sb_secret_local");
  });
});

describe("APP_ENV explícita na hospedagem (SEG-E45-06)", () => {
  const base = { NEXT_PUBLIC_SUPABASE_URL: URL_OK, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: KEY_OK };

  it("fora da Vercel o padrão local continua valendo (npm run build e next start locais)", () => {
    expect(deployEnvIssues({})).toEqual([]);
    expect(deployEnvIssues({ NODE_ENV: "production" })).toEqual([]);
    expect(parseServerEnv(base).appEnv).toBe("local");
    expect(() => assertDeployEnv({ NODE_ENV: "production" })).not.toThrow();
  });

  it("exige APP_ENV quando VERCEL ou VERCEL_ENV existem", () => {
    for (const vercel of [{ VERCEL: "1" }, { VERCEL_ENV: "preview" }, { VERCEL: "1", VERCEL_ENV: "production" }]) {
      expect(issuesOf(() => parseServerEnv({ ...base, ...vercel })).join("\n")).toContain("APP_ENV");
      expect(issuesOf(() => parseServerEnv({ ...base, ...vercel, APP_ENV: "" })).join("\n")).toContain("APP_ENV");
      expect(issuesOf(() => assertDeployEnv(vercel)).join("\n")).toContain("APP_ENV");
    }
  });

  it("recusa APP_ENV=local com VERCEL_ENV=production", () => {
    const issues = issuesOf(() => parseServerEnv({ ...base, VERCEL: "1", VERCEL_ENV: "production", APP_ENV: "local" }));
    expect(issues.join("\n")).toContain("local");
    expect(() => assertDeployEnv({ VERCEL_ENV: "production", APP_ENV: "local" })).toThrow(EnvError);
  });

  it("aceita APP_ENV explícita na Vercel", () => {
    expect(parseServerEnv({ ...base, VERCEL: "1", VERCEL_ENV: "production", APP_ENV: "production" }).appEnv).toBe("production");
    expect(parseServerEnv({ ...base, VERCEL: "1", VERCEL_ENV: "preview", APP_ENV: "staging" }).appEnv).toBe("staging");
    expect(() => assertDeployEnv({ ...base, VERCEL: "1", VERCEL_ENV: "preview", APP_ENV: "staging" })).not.toThrow();
  });

  describe("Render (RENDER definida)", () => {
    it("exige APP_ENV", () => {
      expect(issuesOf(() => parseServerEnv({ ...base, RENDER: "true" })).join("\n")).toContain("APP_ENV");
      expect(issuesOf(() => parseServerEnv({ ...base, RENDER: "true", APP_ENV: "" })).join("\n")).toContain("APP_ENV");
      expect(issuesOf(() => assertDeployEnv({ ...base, RENDER: "true" })).join("\n")).toContain("APP_ENV");
    });

    it("recusa APP_ENV=local, sem depender de VERCEL_ENV", () => {
      const issues = issuesOf(() => parseServerEnv({ ...base, RENDER: "true", APP_ENV: "local" }));
      expect(issues.join("\n")).toContain("local");
      expect(() => assertDeployEnv({ ...base, RENDER: "true", APP_ENV: "local" })).toThrow(EnvError);
    });

    it("aceita production e staging", () => {
      expect(parseServerEnv({ ...base, RENDER: "true", APP_ENV: "production" }).appEnv).toBe("production");
      expect(parseServerEnv({ ...base, RENDER: "true", APP_ENV: "staging" }).appEnv).toBe("staging");
      expect(() => assertDeployEnv({ ...base, RENDER: "true", APP_ENV: "production" })).not.toThrow();
      expect(() => assertDeployEnv({ ...base, RENDER: "true", APP_ENV: "staging" })).not.toThrow();
    });
  });

  describe("assertDeployEnv valida as variáveis públicas na hospedagem", () => {
    it("lista as duas variáveis públicas ausentes, sem valores", () => {
      for (const host of [{ RENDER: "true" }, { VERCEL: "1" }]) {
        const message = issuesOf(() => assertDeployEnv({ ...host, APP_ENV: "production" })).join("\n");
        expect(message).toContain("NEXT_PUBLIC_SUPABASE_URL");
        expect(message).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
      }
    });

    it("junta APP_ENV ausente e variáveis públicas ausentes numa só falha", () => {
      const issues = issuesOf(() => assertDeployEnv({ RENDER: "true" }));
      expect(issues).toHaveLength(3);
    });

    it("recusa chave secreta no lugar da publishable", () => {
      const issues = issuesOf(() =>
        assertDeployEnv({ RENDER: "true", APP_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: URL_OK, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_xyz" }),
      );
      expect(issues.join("\n")).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
      expect(issues.join("\n")).not.toContain("sb_secret_xyz");
    });

    it("passa com as variáveis públicas e APP_ENV", () => {
      expect(() => assertDeployEnv({ ...base, RENDER: "true", APP_ENV: "production" })).not.toThrow();
    });

    it("fora da hospedagem não valida as públicas (build local e CI)", () => {
      expect(() => assertDeployEnv({})).not.toThrow();
      expect(() => assertDeployEnv({ NODE_ENV: "production", APP_ENV: "local" })).not.toThrow();
    });

    it("parseServerEnv não duplica as mensagens das variáveis públicas", () => {
      const issues = issuesOf(() => parseServerEnv({ RENDER: "true", APP_ENV: "production" }));
      expect(issues.filter((issue) => issue.startsWith("NEXT_PUBLIC_SUPABASE_URL"))).toHaveLength(1);
    });
  });
});
