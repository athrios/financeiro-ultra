import { randomBytes, randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { inject } from "vitest";

import { restoreSessions, type CadRole } from "./cad-sessions";
import { e2eEnv } from "./env";
import { fetchWithRetry, type Session } from "./http";
import { getPage } from "./pages";

/**
 * Apoio dos e2e da CAD-001 (sócios, recebedores, clientes e apelidos), SEM navegador.
 *
 * - As sessões vêm do `global-setup.ts` (uma entrada por papel por execução inteira, para não
 *   estourar o limite de logins do Supabase local).
 * - Server Actions são chamadas por POST direto, exatamente como um navegador sem JavaScript as
 *   enviaria (`$ACTION_REF_1`...). Quando a ação não tem formulário no HTML (diálogo fechado), o
 *   identificador vem de `.next/server/server-reference-manifest.json`.
 * - Todo dado criado leva um sufixo único da execução (o banco semeado não permite exclusão) e é
 *   fictício (RAT-D019).
 */

export { CAD_ROLES, type CadRole } from "./cad-sessions";

/** Sessões de cada papel (cada arquivo de teste recebe a sua cópia do jar). */
export function cadSessions(): Record<CadRole, Session> {
  return restoreSessions(inject("cadSessions"));
}

// ---------------------------------------------------------------------------------------------
// Dados fictícios únicos por execução
// ---------------------------------------------------------------------------------------------

/** Sufixo curto e único da execução (letras e números). */
export function runSuffix(): string {
  return randomBytes(4).toString("hex");
}

function cpfDigit(digits: number[]): number {
  const sum = digits.reduce((acc, value, index) => acc + value * (digits.length + 1 - index), 0);
  const rest = (sum * 10) % 11;
  return rest === 10 ? 0 : rest;
}

/** CPF válido e aleatório, com pontuação. */
export function randomCpf(): string {
  const base = Array.from({ length: 9 }, () => randomInt(0, 10));
  if (new Set(base).size === 1) base[0] = (base[0] + 1) % 10;
  const digits = [...base, cpfDigit(base)];
  digits.push(cpfDigit(digits));
  const text = digits.join("");
  return `${text.slice(0, 3)}.${text.slice(3, 6)}.${text.slice(6, 9)}-${text.slice(9)}`;
}

function cnpjCheckDigits(base: string): string {
  const value = (char: string) => char.charCodeAt(0) - 48;
  const calc = (text: string) => {
    const weights = text.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = [...text].reduce((acc, char, index) => acc + value(char) * weights[index], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const first = calc(base);
  return `${first}${calc(base + first)}`;
}

/** CNPJ válido e aleatório, com pontuação; `alphanumeric` gera o formato novo (letras e números). */
export function randomCnpj(alphanumeric = false): string {
  const chars = alphanumeric ? "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789" : "0123456789";
  let base = "";
  for (let index = 0; index < 8; index += 1) base += chars[randomInt(0, chars.length)];
  base += "0001";
  const text = base + cnpjCheckDigits(base);
  return `${text.slice(0, 2)}.${text.slice(2, 5)}.${text.slice(5, 8)}/${text.slice(8, 12)}-${text.slice(12)}`;
}

// ---------------------------------------------------------------------------------------------
// Server Actions por POST direto
// ---------------------------------------------------------------------------------------------

export type Fields = Array<[string, string]>;

export interface ActionResult {
  status: number;
  location: string | null;
  text: string;
  /** A ação devolveu estado de erro (200 com `"status":"error"` no payload RSC). */
  failed: boolean;
  code: string | null;
  hint: string | null;
}

let manifestCache: Record<string, { exportedName: string }> | null = null;

/** Identificador da Server Action pelo nome exportado (manifesto do build atual). */
export function actionId(exportedName: string): string {
  if (!manifestCache) {
    const file = join(process.cwd(), ".next", "server", "server-reference-manifest.json");
    manifestCache = (JSON.parse(readFileSync(file, "utf8")) as { node: Record<string, { exportedName: string }> }).node;
  }
  const found = Object.entries(manifestCache).find(([, value]) => value.exportedName === exportedName);
  if (!found) throw new Error(`Server Action ${exportedName} não está no manifesto do build (.next). Rodou npm run build?`);
  return found[0];
}

/** `$ACTION_KEY` de qualquer formulário com `useActionState` (a ação não o valida; só ecoa no estado). */
const FALLBACK_ACTION_KEY = "k1ee6205ff93b8f51b8e354242e6cb8e6";

/** POST da Server Action como o navegador sem JS faria. `session` nulo = sem login. */
export async function callAction(
  session: Session | null,
  path: string,
  exportedName: string,
  fields: Fields,
): Promise<ActionResult> {
  const { baseUrl } = e2eEnv();
  const data = new FormData();
  data.append("$ACTION_REF_1", "");
  data.append("$ACTION_1:0", JSON.stringify({ id: actionId(exportedName), bound: "$@1" }));
  data.append("$ACTION_1:1", JSON.stringify([{ status: "idle" }]));
  data.append("$ACTION_KEY", FALLBACK_ACTION_KEY);
  for (const [name, value] of fields) data.append(name, value);

  const headers: Record<string, string> = { origin: baseUrl };
  if (session) headers.cookie = session.jar.header();
  const response = await fetchWithRetry(`${baseUrl}${path}`, { method: "POST", headers, body: data, redirect: "manual" });
  session?.jar.ingest(response);
  const text = await response.text();
  return {
    status: response.status,
    location: response.headers.get("location"),
    text,
    failed: /"status":"error"/.test(text),
    code: /"code":"([A-Z_]+)"/.exec(text)?.[1] ?? null,
    hint: /"hint":"([A-Z_]+)"/.exec(text)?.[1] ?? null,
  };
}

export interface ActionErrorInfo {
  code: string;
  message: string;
  /** Campo ao qual o erro se liga (quando a ação informa). */
  field: string | null;
  /** Erros por campo do formulário (vazio quando a ação não manda). */
  fieldErrors: Record<string, string>;
}

/** Objeto JSON que começa em `start` (uma chave), respeitando textos e chaves aninhadas. */
function jsonObjectAt(text: string, start: number): string {
  let depth = 0;
  let inString = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (char === "\\") index += 1;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}" && (depth -= 1) === 0) return text.slice(start, index + 1);
  }
  return "";
}

/**
 * Estado de erro da Server Action lido do payload RSC: `{"status":"error","error":{code,message,...},
 * "fieldErrors":{...}}`. Serve para conferir o MOTIVO da recusa (código e frase exata), não só que
 * falhou. Nulo quando a resposta não traz estado de erro.
 */
export function errorOf(result: ActionResult): ActionErrorInfo | null {
  const head = /\{"status":"error","error":/.exec(result.text);
  if (!head) return null;
  const errorStart = head.index + head[0].length;
  const errorJson = jsonObjectAt(result.text, errorStart);
  if (!errorJson) return null;
  const error = JSON.parse(errorJson) as { code?: string; message?: string; field?: string; hint?: string };
  const fieldsMatch = /^,"fieldErrors":/.exec(result.text.slice(errorStart + errorJson.length));
  const fieldsStart = fieldsMatch ? errorStart + errorJson.length + fieldsMatch[0].length : -1;
  return {
    code: error.code ?? "",
    message: error.message ?? "",
    field: error.field ?? null,
    fieldErrors: fieldsStart >= 0 ? (JSON.parse(jsonObjectAt(result.text, fieldsStart) || "{}") as Record<string, string>) : {},
  };
}

/** O Operador, o Visualizador e o Sócio são negados na própria ação (nada é gravado). */
export function isForbidden(result: ActionResult): boolean {
  return result.failed && /"code":"FORBIDDEN"/.test(result.text) && result.location === null;
}

/** Sucesso de ação com redirecionamento: 303 com `?aviso=<chave>`. */
export function flashOf(result: ActionResult): string | null {
  if (result.status !== 303 || !result.location) return null;
  return new URL(result.location, "http://x").searchParams.get("aviso");
}

export const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** Primeiro id (uuid) que segue `prefix` no caminho de `location`. */
export function idAfter(location: string | null, prefix: string): string {
  const match = new RegExp(`${prefix}/(${UUID})`).exec(location ?? "");
  return match?.[1] ?? "";
}

/** Versão (`expectedUpdatedAt`) escrita no formulário de edição aberto em `path`. */
export async function versionAt(session: Session, path: string): Promise<string> {
  const page = await getPage(session.jar, path);
  return versionIn(page.html);
}

export function versionIn(html: string): string {
  return (
    /name="expectedUpdatedAt"[^>]*value="([^"]*)"/.exec(html)?.[1] ??
    /value="([^"]*)"[^>]*name="expectedUpdatedAt"/.exec(html)?.[1] ??
    ""
  );
}

// ---------------------------------------------------------------------------------------------
// Constantes do seed (supabase/seed.sql; só nomes fictícios)
// ---------------------------------------------------------------------------------------------

export const SEED = {
  partnerA: "a0000000-0000-4000-8000-000000000001",
  partnerB: "a0000000-0000-4000-8000-000000000002",
  partnerC: "a0000000-0000-4000-8000-000000000003",
  /** Cliente Modelo Ltda: sócios A e B, ativo. */
  clientModel: "d4000000-0000-4000-8000-000000000001",
  /** Cliente Antigo Ltda: inativo e sem sócio indicado. */
  clientInactive: "d4000000-0000-4000-8000-000000000004",
} as const;

export const MISSING_ID = "00000000-0000-4000-8000-0000000000ff";

// ---------------------------------------------------------------------------------------------
// Cadastros criados pelo Administrador (preparação dos cenários)
// ---------------------------------------------------------------------------------------------

export const PARTNERS_PATH = "/configuracoes/socios";
export const CLIENTS_PATH = "/clientes";

/** Cria um sócio (com apelidos opcionais) e devolve o id; falha com o motivo se não criar. */
export async function createPartner(admin: Session, name: string, aliases: string[] = []): Promise<string> {
  const result = await callAction(admin, `${PARTNERS_PATH}/novo`, "savePartnerAction", [
    ["name", name],
    ...aliases.map((alias): [string, string] => ["aliases", alias]),
  ]);
  const id = idAfter(result.location, "/configuracoes/socios");
  if (!id) throw new Error(`Não criou o sócio "${name}": ${result.status} ${result.location ?? ""} ${result.text.slice(0, 200)}`);
  return id;
}

/** Inativa ou reativa o sócio lendo a versão atual. */
export async function setPartnerActive(
  admin: Session,
  id: string,
  active: boolean,
  extra: Fields = [],
): Promise<ActionResult> {
  const version = await versionAt(admin, `${PARTNERS_PATH}/${id}/editar`);
  return callAction(admin, `${PARTNERS_PATH}/${id}`, "setPartnerActiveAction", [
    ["id", id],
    ["active", String(active)],
    ["expectedUpdatedAt", version],
    ...extra,
  ]);
}

export interface ReceiverInput {
  holder: string;
  variants?: string[];
  pixKeys?: string[];
  /** [banco, agência, conta] */
  accounts?: Array<[string, string, string]>;
}

export function receiverFields(partnerId: string, input: ReceiverInput, edit?: { id: string; version: string }): Fields {
  const fields: Fields = [];
  if (edit) fields.push(["id", edit.id], ["expectedUpdatedAt", edit.version]);
  fields.push(["partnerId", partnerId], ["holderName", input.holder]);
  for (const variant of input.variants ?? []) fields.push(["variants", variant]);
  for (const pix of input.pixKeys ?? []) fields.push(["pixKeys", pix]);
  for (const [bank, branch, number] of input.accounts ?? []) {
    fields.push(["accountBank", bank], ["accountBranch", branch], ["accountNumber", number]);
  }
  return fields;
}

/** Cria um recebedor do sócio e devolve o id. */
export async function createReceiver(admin: Session, partnerId: string, input: ReceiverInput): Promise<string> {
  const path = `${PARTNERS_PATH}/${partnerId}/recebedores/novo`;
  const result = await callAction(admin, path, "saveReceiverAction", receiverFields(partnerId, input));
  if (flashOf(result) !== "recebedor-criado") {
    throw new Error(`Não criou o recebedor "${input.holder}": ${result.status} ${result.text.slice(0, 200)}`);
  }
  const detail = await getPage(admin.jar, `${PARTNERS_PATH}/${partnerId}`);
  // O recebedor mais próximo do nome do titular no HTML (o detalhe lista todos os ativos do sócio).
  const holderIndex = detail.html.indexOf(input.holder);
  const links = [...detail.html.matchAll(new RegExp(`/recebedores/(${UUID})`, "g"))];
  const nearest = links.sort((x, y) => Math.abs((x.index ?? 0) - holderIndex) - Math.abs((y.index ?? 0) - holderIndex))[0];
  const id = holderIndex >= 0 ? (nearest?.[1] ?? "") : "";
  if (!id) throw new Error(`Criou o recebedor "${input.holder}", mas não achei o id no detalhe do sócio.`);
  return id;
}

export interface ClientInput {
  name: string;
  trade?: string;
  documentType?: "CPF" | "CNPJ";
  document?: string;
  monthlyValue?: string;
  notes?: string;
  partnerIds: string[];
  /** [tipo, valor] com tipo NAME ou DOCUMENT */
  aliases?: Array<["NAME" | "DOCUMENT", string]>;
  acknowledged?: string[];
  reason?: string;
}

export function clientFields(input: ClientInput, edit?: { id: string; version: string }): Fields {
  const fields: Fields = [];
  if (edit) fields.push(["id", edit.id]);
  fields.push(["legalName", input.name]);
  if (input.trade !== undefined) fields.push(["tradeName", input.trade]);
  if (input.documentType) fields.push(["documentType", input.documentType]);
  fields.push(["document", input.document ?? ""]);
  fields.push(["monthlyValue", input.monthlyValue ?? "1.234,56"]);
  if (input.notes !== undefined) fields.push(["notes", input.notes]);
  for (const partnerId of input.partnerIds) fields.push(["partnerIds", partnerId]);
  for (const [type, value] of input.aliases ?? []) fields.push(["aliasType", type], ["aliasValue", value]);
  if (edit) fields.push(["expectedUpdatedAt", edit.version]);
  for (const id of input.acknowledged ?? []) fields.push(["acknowledgedDuplicateIds", id]);
  if (input.reason) fields.push(["reason", input.reason]);
  return fields;
}

/** Cria um cliente e devolve o id; falha com o motivo se não criar. */
export async function createClient(admin: Session, input: ClientInput): Promise<string> {
  const result = await callAction(admin, `${CLIENTS_PATH}/novo`, "saveClientAction", clientFields(input));
  const id = idAfter(result.location, "/clientes");
  if (!id) throw new Error(`Não criou o cliente "${input.name}": ${result.status} ${result.location ?? ""} ${result.text.slice(0, 300)}`);
  return id;
}

/** Inativa ou reativa o cliente lendo a versão atual. */
export async function setClientActive(admin: Session, id: string, active: boolean, extra: Fields = []): Promise<ActionResult> {
  const version = await versionAt(admin, `${CLIENTS_PATH}/${id}/editar`);
  return callAction(admin, `${CLIENTS_PATH}/${id}`, "setClientActiveAction", [
    ["id", id],
    ["active", String(active)],
    ["expectedUpdatedAt", version],
    ...extra,
  ]);
}
