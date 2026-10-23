/** Configuração dos testes de integração, lida do ambiente (veja vitest.e2e.config.mts). */

export interface E2eEnv {
  baseUrl: string;
  supabaseUrl: string;
  /** Interface do Mailpit do Supabase local (e-mails de convite e recuperação). */
  mailpitUrl: string;
  publishableKey: string;
  /** Senha dos usuários fictícios criados por `npm run seed:dev` (DEV_SEED_PASSWORD). */
  password: string;
}

/** Usuários fictícios do seed:dev (RAT-D019), um por situação de acesso. */
export const USERS = {
  admin: "admin@example.com",
  operator: "operador@example.com",
  viewer: "visualizador@example.com",
  partner: "socio@example.com",
  noRole: "semvinculo@example.com",
} as const;

export type UserKey = keyof typeof USERS;

export function isLocalUrl(value: string): boolean {
  try {
    return ["127.0.0.1", "localhost"].includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

export function e2eEnv(): E2eEnv {
  const required = (name: string): string => {
    const value = process.env[name]?.trim();
    if (!value) {
      throw new Error(
        `Defina ${name} no ambiente ou no .env.local. Para DEV_SEED_PASSWORD use a mesma senha do npm run seed:dev.`,
      );
    }
    return value;
  };
  return {
    baseUrl: (process.env.E2E_BASE_URL?.trim() || "http://127.0.0.1:3001").replace(/\/+$/, ""),
    supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, ""),
    mailpitUrl: (process.env.E2E_MAILPIT_URL?.trim() || "http://127.0.0.1:54324").replace(/\/+$/, ""),
    publishableKey: required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    password: required("DEV_SEED_PASSWORD"),
  };
}
