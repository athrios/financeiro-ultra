import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * Opções dos cookies de sessão do Supabase, em um só lugar para o cliente do servidor
 * (server.ts) e o proxy (proxy.ts) não divergirem (SEG-E45-04).
 *
 *  - httpOnly: o app não usa createBrowserClient; o JavaScript do navegador nunca precisa
 *    ler os tokens. Um XSS futuro não os leria.
 *  - sameSite lax: o link do e-mail (GET de navegação) precisa levar a sessão.
 *  - secure: em tudo que não é local (staging/produção são HTTPS). No local o cookie Secure
 *    quebraria o login em http://127.0.0.1.
 *
 * Lê só APP_ENV (sem server-only) porque o proxy também usa. Valor ausente ou vazio vale
 * como local, igual ao padrão de src/lib/env.ts.
 */
export function supabaseCookieOptions(appEnv: string | undefined = process.env.APP_ENV): CookieOptionsWithName {
  const env = appEnv?.trim() || "local";
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: env !== "local",
  };
}
