import { e2eEnv, isLocalUrl } from "./env";

/**
 * Antes de qualquer teste: confere a configuração e se o servidor e o Supabase local estão no ar.
 * Falha com uma mensagem clara em vez de uma pilha de erros de conexão.
 */
export default async function setup(): Promise<void> {
  const env = e2eEnv();
  const problems: string[] = [];

  if (!isLocalUrl(env.supabaseUrl)) {
    problems.push("NEXT_PUBLIC_SUPABASE_URL precisa apontar para o Supabase local (127.0.0.1 ou localhost).");
  }
  if (!isLocalUrl(env.baseUrl)) {
    problems.push("E2E_BASE_URL precisa apontar para um servidor local (127.0.0.1 ou localhost).");
  }

  if (!isLocalUrl(env.mailpitUrl)) {
    problems.push("E2E_MAILPIT_URL precisa apontar para o Mailpit local (127.0.0.1 ou localhost).");
  }

  const checks: Array<[string, string]> = [
    ["o Supabase local (npx supabase start)", `${env.supabaseUrl}/auth/v1/health`],
    ["o Mailpit do Supabase local", `${env.mailpitUrl}/api/v1/info`],
    ["o servidor da aplicação (npm run build && npm start)", `${env.baseUrl}/login`],
  ];
  for (const [what, url] of checks) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(5000), headers: { apikey: env.publishableKey } });
    } catch {
      problems.push(`Não consegui falar com ${what} em ${url}.`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`Ambiente dos testes de integração incompleto:\n - ${problems.join("\n - ")}`);
  }
}
