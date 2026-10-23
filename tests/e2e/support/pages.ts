import { e2eEnv } from "./env";
import { CookieJar, fetchWithRetry } from "./http";

/**
 * Cliente de páginas SEM navegador (E8, no lugar do Playwright): faz GET, lê os formulários do
 * HTML e envia exatamente o que um navegador sem JavaScript enviaria (campos ocultos incluídos,
 * como o identificador da Server Action). É o aprimoramento progressivo do Next em uso.
 */

export interface PageResult {
  status: number;
  location: string | null;
  html: string;
  /** Texto aproximado do que a pessoa vê (sem tags nem comentários do React). */
  text: string;
  /** Texto do HTML mais o payload RSC (self.__next_f), onde fica o estado de uma Server Action. */
  all: string;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Texto visível aproximado de um HTML. */
export function visibleText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<script[\s\S]*?<\/script>/g, " ")
      .replace(/<style[\s\S]*?<\/style>/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  );
}

async function request(jar: CookieJar, method: string, path: string, body?: FormData): Promise<PageResult> {
  const { baseUrl } = e2eEnv();
  const headers: Record<string, string> = {};
  const cookie = jar.header();
  if (cookie) headers.cookie = cookie;
  // Server Actions só aceitam envio com origem igual à do servidor.
  if (method === "POST") headers.origin = baseUrl;
  const response = await fetchWithRetry(path.startsWith("http") ? path : `${baseUrl}${path}`, {
    method,
    headers,
    body,
    redirect: "manual",
  });
  jar.ingest(response);
  const html = await response.text();
  return {
    status: response.status,
    location: response.headers.get("location"),
    html,
    text: visibleText(html),
    all: `${visibleText(html)} ${html}`,
  };
}

export function getPage(jar: CookieJar, path: string): Promise<PageResult> {
  return request(jar, "GET", path);
}

/** GET seguindo redirecionamentos (no máximo `max`). Devolve a resposta final. */
export async function followPage(jar: CookieJar, path: string, max = 6): Promise<PageResult & { hops: string[] }> {
  const hops: string[] = [];
  let result = await request(jar, "GET", path);
  while (result.location && hops.length < max) {
    hops.push(result.location);
    result = await request(jar, "GET", result.location);
  }
  return { ...result, hops };
}

/**
 * Abre `path`, escolhe o formulário cujo HTML contém `formContains` (padrão: o primeiro),
 * preenche `fields` por cima dos campos ocultos e envia ao mesmo endereço.
 */
export async function submitForm(
  jar: CookieJar,
  path: string,
  fields: Record<string, string>,
  formContains?: string,
): Promise<PageResult> {
  const page = await request(jar, "GET", path);
  const forms = [...page.html.matchAll(/<form\b[\s\S]*?<\/form>/g)].map((match) => match[0]);
  const form = (formContains ? forms.find((candidate) => candidate.includes(formContains)) : undefined) ?? forms[0];
  if (!form) throw new Error(`Sem formulário em ${path} (status ${page.status}).`);

  const data = new FormData();
  for (const match of form.matchAll(/<input\b[^>]*type="hidden"[^>]*>/g)) {
    const name = /name="([^"]*)"/.exec(match[0])?.[1];
    const value = /value="([^"]*)"/.exec(match[0])?.[1] ?? "";
    if (name && !(decodeEntities(name) in fields)) data.append(decodeEntities(name), decodeEntities(value));
  }
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return request(jar, "POST", path, data);
}

/** Entra pelo formulário de /login (a Server Action de verdade). */
export function loginByForm(jar: CookieJar, email: string, password: string, next?: string): Promise<PageResult> {
  const path = next ? `/login?next=${encodeURIComponent(next)}` : "/login";
  // O HTML de streaming traz o campo "next" duas vezes (o do fallback e o definitivo); o navegador
  // descarta o fallback ao hidratar. Aqui o valor definitivo é enviado explicitamente.
  const fields: Record<string, string> = { email, password };
  if (next !== undefined) fields.next = next;
  return submitForm(jar, path, fields, 'name="password"');
}

/** Sai pelo botão "Sair" do shell (ou da tela "Sem acesso ativo"). */
export function logoutByForm(jar: CookieJar): Promise<PageResult> {
  return submitForm(jar, "/", {}, "Sair");
}
