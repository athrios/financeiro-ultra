import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { e2eEnv, USERS, type UserKey } from "./env";

/** Cookie jar mínimo: guarda nome=valor e aplica os Set-Cookie das respostas. */
export class CookieJar {
  private readonly cookies = new Map<string, string>();

  set(name: string, value: string): void {
    this.cookies.set(name, value);
  }

  header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  get(name: string): string | undefined {
    return this.cookies.get(name);
  }

  names(): string[] {
    return [...this.cookies.keys()];
  }

  /** Aplica os Set-Cookie da resposta (inclui remoção por Max-Age=0 ou data no passado). */
  ingest(response: Response): void {
    for (const line of response.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(";");
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const expired = attrs.some((attr) => {
        const [key, val = ""] = attr.trim().split("=");
        const k = key.toLowerCase();
        return (k === "max-age" && Number(val) <= 0) || (k === "expires" && Date.parse(val) < Date.now());
      });
      if (expired || value === "") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
}

export interface Session {
  user: UserKey;
  jar: CookieJar;
  accessToken: string;
}

/**
 * Entra no Supabase local com o usuário fictício e monta o cookie de sessão exatamente como o
 * app espera: o próprio @supabase/ssr grava (e fatia) o cookie. Não passa pela tela de login.
 */
export async function signIn(user: UserKey): Promise<Session> {
  const env = e2eEnv();
  const jar = new CookieJar();
  const supabase = createServerClient(env.supabaseUrl, env.publishableKey, {
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: false },
    cookies: {
      getAll: () => jar.names().map((name) => ({ name, value: "" })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email: USERS[user], password: env.password });
  if (error || !data.session) {
    throw new Error(`Não consegui entrar como ${USERS[user]}: ${error?.message ?? "sem sessão"}. A senha é a do seed:dev?`);
  }
  return { user, jar, accessToken: data.session.access_token };
}

/** Cliente Supabase com a sessão do usuário (para conferir o banco e o bucket pelo RLS dele). */
export async function dbClientFor(session: Session): Promise<SupabaseClient> {
  const env = e2eEnv();
  return createClient(env.supabaseUrl, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${session.accessToken}` } },
  });
}

export interface ApiResult<T = unknown> {
  status: number;
  contentType: string;
  /** Texto bruto da resposta (para checar que não vaza pilha). */
  text: string;
  json: T;
  headers: Headers;
}

/** Chama a aplicação (next start). Nunca segue redirecionamentos: um redirecionamento seria falha de API. */
export async function call<T = unknown>(
  method: string,
  path: string,
  options: { session?: Session | null; body?: BodyInit; headers?: Record<string, string> } = {},
): Promise<ApiResult<T>> {
  const { baseUrl } = e2eEnv();
  const headers: Record<string, string> = { ...options.headers };
  if (options.session) {
    const cookie = options.session.jar.header();
    if (cookie) headers.cookie = cookie;
  }
  const response = await fetchWithRetry(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.body,
    redirect: "manual",
  });
  options.session?.jar.ingest(response);
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // resposta que não é JSON: os testes checam o texto
  }
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    text,
    json: json as T,
    headers: response.headers,
  };
}

export interface UploadData {
  proofFileId: string;
  duplicate: boolean;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}
export type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; field?: string } };

export interface UploadOptions {
  name: string;
  type: string;
  bytes: Uint8Array;
  /** Campos extras do formulário (ex.: um sha256 falso que o servidor deve ignorar). */
  extraFields?: Record<string, string>;
}

/** POST /api/comprovantes com multipart. */
export function upload(session: Session | null, file: UploadOptions): Promise<ApiResult<Envelope<UploadData>>> {
  const form = new FormData();
  for (const [key, value] of Object.entries(file.extraFields ?? {})) form.set(key, value);
  form.set("file", new Blob([file.bytes as BlobPart], { type: file.type }), file.name);
  return call("POST", "/api/comprovantes", { session, body: form });
}

export interface UrlData {
  url: string;
  expiresInSeconds: number;
}

/** GET /api/comprovantes/{id}/url. */
export function signedUrl(session: Session | null, id: string): Promise<ApiResult<Envelope<UrlData>>> {
  return call("GET", `/api/comprovantes/${id}/url`, { session });
}

/**
 * `fetch` com uma nova tentativa quando a conexão reaproveitada já tinha sido fechada pelo
 * servidor (o keep-alive do Next é curto e alguns testes ficam parados por segundos, por exemplo
 * ao chamar a CLI do Supabase). Esse erro ocorre antes de o servidor receber o pedido; por isso
 * repetir é seguro. Qualquer outra falha sobe normalmente.
 */
export async function fetchWithRetry(input: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    const code = String((error as { cause?: { code?: unknown } }).cause?.code ?? "");
    if (!["ECONNRESET", "ECONNABORTED", "EPIPE", "UND_ERR_SOCKET"].includes(code)) throw error;
    return fetch(input, init);
  }
}
