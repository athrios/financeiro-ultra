import { e2eEnv } from "./env";

/**
 * Convite de usuário pela API administrativa do Supabase LOCAL, como o painel faz no ambiente
 * hospedado (a aplicação não usa a chave secreta). A chave vem do ambiente do teste
 * (E2E_SUPABASE_SECRET_KEY, ou SUPABASE_SECRET_KEY do .env.local) e nunca é lida pelo servidor da aplicação.
 */
function secretKey(): string {
  const value = (process.env.E2E_SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SECRET_KEY)?.trim();
  if (!value) {
    throw new Error(
      "Defina E2E_SUPABASE_SECRET_KEY (ou SUPABASE_SECRET_KEY no .env.local): é a SECRET_KEY de `npx supabase status -o env`, só do Supabase local.",
    );
  }
  return value;
}

async function admin(method: string, path: string, body?: unknown): Promise<Response> {
  const key = secretKey();
  return fetch(`${e2eEnv().supabaseUrl}/auth/v1${path}`, {
    method,
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
}

/** Cria o usuário e dispara o e-mail de convite (modelo do Financeiro Ultra). Devolve o id. */
export async function inviteUser(email: string): Promise<string> {
  const response = await admin("POST", "/invite", { email });
  const json = (await response.json()) as { id?: string };
  if (!response.ok || !json.id) throw new Error(`Convite falhou (${response.status}).`);
  return json.id;
}

/** Remove o usuário de teste. Falha silenciosa: o `db reset` limpa de qualquer forma. */
export async function deleteUser(id: string): Promise<void> {
  try {
    await admin("DELETE", `/admin/users/${id}`);
  } catch {
    // limpeza oportunista
  }
}
