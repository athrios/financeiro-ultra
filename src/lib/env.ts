import { z } from "zod";

/**
 * Variáveis de ambiente da aplicação, validadas com zod (plano, seção 10).
 *
 * Regras:
 *  - falha clara e rápida: a mensagem lista cada variável com problema, sem
 *    repetir o valor informado (pode ser um segredo);
 *  - a chave secreta do Supabase NUNCA é lida pelo runtime web. Este módulo
 *    não a expõe; fora do ambiente local, a sua mera presença é erro
 *    (R-19: Preview/Production não devem recebê-la);
 *  - a chave "publishable" não pode ser uma chave secreta (`sb_secret_...` ou
 *    JWT com role `service_role`) colocada no lugar errado.
 *
 * Este arquivo é puro (recebe a origem dos dados) para ser testável. As
 * variáveis `NEXT_PUBLIC_*` são lidas com acesso literal a `process.env` em
 * `readProcessEnv`, para o Next.js substituí-las em tempo de build.
 */

export const APP_ENVS = ["local", "staging", "production"] as const;
export type AppEnv = (typeof APP_ENVS)[number];

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type EnvSource = Readonly<Record<string, string | undefined>>;

/** "" (linha vazia no .env) vale como ausente. */
const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

function jwtRole(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))) as unknown;
    if (payload && typeof payload === "object" && "role" in payload) {
      const role = (payload as { role: unknown }).role;
      return typeof role === "string" ? role : null;
    }
  } catch {
    // Não é um JWT legível: segue como chave opaca.
  }
  return null;
}

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.preprocess(
    emptyToUndefined,
    z
      .string({ error: "ausente" })
      .refine(
        (value) => {
          try {
            const url = new URL(value);
            return url.protocol === "http:" || url.protocol === "https:";
          } catch {
            return false;
          }
        },
        { error: "precisa ser uma URL http(s) válida" },
      ),
  ),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.preprocess(
    emptyToUndefined,
    z
      .string({ error: "ausente" })
      .refine((value) => !value.startsWith("sb_secret_"), {
        error: "contém uma chave secreta; use a chave publishable",
      })
      .refine((value) => jwtRole(value) !== "service_role", {
        error: "contém a chave service_role; use a chave publishable (anon)",
      }),
  ),
});

const serverSchema = z.object({
  APP_ENV: z.preprocess(
    emptyToUndefined,
    z.enum(APP_ENVS, { error: `precisa ser um destes valores: ${APP_ENVS.join(", ")}` }).default("local"),
  ),
  LOG_LEVEL: z.preprocess(
    emptyToUndefined,
    z.enum(LOG_LEVELS, { error: `precisa ser um destes valores: ${LOG_LEVELS.join(", ")}` }).default("info"),
  ),
});

export interface PublicEnv {
  supabaseUrl: string;
  supabasePublishableKey: string;
}

export interface ServerEnv extends PublicEnv {
  appEnv: AppEnv;
  logLevel: LogLevel;
}

/** Erro de configuração: a mensagem é segura para log (não contém valores). */
export class EnvError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(
      `Configuração de ambiente inválida:\n${issues.map((issue) => ` - ${issue}`).join("\n")}\nVeja .env.example.`,
    );
    this.name = "EnvError";
    this.issues = issues;
  }
}

function collectIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join(".") || "(raiz)"}: ${issue.message}`);
}

export function parsePublicEnv(source: EnvSource): PublicEnv {
  const result = publicSchema.safeParse(source);
  if (!result.success) {
    throw new EnvError(collectIssues(result.error));
  }
  return {
    supabaseUrl: result.data.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: result.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

const isSet = (value: string | undefined) => value !== undefined && value.trim() !== "";

/**
 * APP_ENV tem padrão "local" para o desenvolvimento, mas esse padrão falharia aberto numa
 * hospedagem (sem HSTS, aceitando a chave secreta). Na Vercel (VERCEL ou VERCEL_ENV presentes) a
 * variável precisa ser explícita, e "local" é recusado em produção (SEG-E45-06).
 * Fora da Vercel (npm run build / next start locais) nada muda.
 */
export function deployEnvIssues(source: EnvSource): string[] {
  if (!isSet(source.VERCEL) && !isSet(source.VERCEL_ENV)) return [];
  const appEnv = source.APP_ENV?.trim();
  if (!isSet(appEnv)) {
    return [
      "APP_ENV: obrigatória quando a aplicação roda na Vercel (VERCEL/VERCEL_ENV); defina staging ou production",
    ];
  }
  if (appEnv === "local" && source.VERCEL_ENV?.trim() === "production") {
    return ["APP_ENV: o valor 'local' não é permitido com VERCEL_ENV=production"];
  }
  return [];
}

/** Falha rápida (next.config.ts) quando a hospedagem está sem APP_ENV explícita. */
export function assertDeployEnv(source: EnvSource): void {
  const issues = deployEnvIssues(source);
  if (issues.length > 0) throw new EnvError(issues);
}

export function parseServerEnv(source: EnvSource): ServerEnv {
  const issues: string[] = [...deployEnvIssues(source)];

  const publicResult = publicSchema.safeParse(source);
  if (!publicResult.success) issues.push(...collectIssues(publicResult.error));

  const serverResult = serverSchema.safeParse(source);
  if (!serverResult.success) issues.push(...collectIssues(serverResult.error));

  // A aplicação não usa a chave secreta. Em staging/produção ela não pode nem estar presente.
  const appEnv = serverResult.success ? serverResult.data.APP_ENV : undefined;
  const secret = source.SUPABASE_SECRET_KEY;
  if (appEnv && appEnv !== "local" && secret && secret.trim() !== "") {
    issues.push(
      "SUPABASE_SECRET_KEY: não deve existir fora do ambiente local (a aplicação web não usa a chave secreta); remova-a das variáveis do ambiente",
    );
  }

  if (issues.length > 0 || !publicResult.success || !serverResult.success) {
    throw new EnvError(issues);
  }

  return {
    supabaseUrl: publicResult.data.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: publicResult.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    appEnv: serverResult.data.APP_ENV,
    logLevel: serverResult.data.LOG_LEVEL,
  };
}

/** Acesso literal a process.env.NEXT_PUBLIC_*: o Next.js os substitui no build. */
function readPublicProcessEnv(): EnvSource {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

let cachedPublic: PublicEnv | undefined;

/** Variáveis públicas (seguro em qualquer ambiente de execução, inclusive o proxy). */
export function getPublicEnv(): PublicEnv {
  cachedPublic ??= parsePublicEnv(readPublicProcessEnv());
  return cachedPublic;
}

/** Atalhos usados pelos clientes Supabase. */
export function supabaseUrl(): string {
  return getPublicEnv().supabaseUrl;
}

export function supabasePublishableKey(): string {
  return getPublicEnv().supabasePublishableKey;
}

/** Descarta o cache (somente testes). */
export function resetEnvCacheForTests(): void {
  cachedPublic = undefined;
}
