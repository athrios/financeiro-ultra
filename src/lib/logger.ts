import { LOG_LEVELS, type LogLevel } from "./env";

/**
 * Logger estruturado mínimo (plano, 13.2): uma linha JSON por evento, sem dependência.
 *
 * Segurança (plano, seção 12): segredos, tokens, CPF e dados bancários nunca saem em log.
 *  - redação por NOME de campo (senha, token, cookie, chave, cpf, conta, agência, pix...);
 *  - redação por CONTEÚDO em qualquer texto (JWT, "Bearer ...", CPF, e-mail, chave secreta);
 *  - profundidade e tamanho limitados; referências circulares tratadas.
 *
 * Auditoria de negócio NÃO é log: ela fica no banco (RAT-D009). Isto é só o log técnico.
 */

export const REDACTED = "[REDACTED]";

const LEVEL_ORDER: Readonly<Record<LogLevel, number>> = { debug: 10, info: 20, warn: 30, error: 40 };

const MAX_DEPTH = 6;
const MAX_STRING = 2000;
const MAX_ARRAY = 50;

/** Trechos que, em qualquer posição do nome do campo, indicam segredo. */
const SENSITIVE_SUBSTRINGS = [
  "password",
  "passwd",
  "secret",
  "token",
  "authorization",
  "cookie",
  "apikey",
  "privatekey",
  "credential",
  "rawextraction",
];

/** Palavras (separadas por camelCase, _ ou -) que indicam dado pessoal ou bancário. */
const SENSITIVE_WORDS = new Set([
  "senha",
  "otp",
  "jwt",
  "session",
  "sessao",
  "cpf",
  "rg",
  "agencia",
  "agency",
  "conta",
  "account",
  "iban",
  "pix",
  "banco",
  "bank",
  "cartao",
  "card",
  "cvv",
]);

/** Campos que parecem sensíveis, mas são indicadores seguros e úteis nos logs. */
const SAFE_KEYS = new Set(["tokenhashpresent", "sessionpresent"]);

function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function isSensitiveKey(key: string): boolean {
  const plain = stripAccents(key);
  const joined = plain.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  if (joined === "" || SAFE_KEYS.has(joined)) return false;
  if (SENSITIVE_SUBSTRINGS.some((part) => joined.includes(part))) return true;
  const words = plain
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .map((word) => word.toLowerCase())
    .filter(Boolean);
  return words.some((word) => SENSITIVE_WORDS.has(word));
}

const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g;
const BEARER_PATTERN = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const SUPABASE_KEY_PATTERN = /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{6,}/g;
const CPF_FORMATTED_PATTERN = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
const CPF_BARE_PATTERN = /(?<![\d.])\d{11}(?![\d.])/g;
const EMAIL_PATTERN = /\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;
const URL_SECRET_PARAM_PATTERN = /([?&#](?:token_hash|token|access_token|refresh_token|code|apikey|key|password)=)[^&#\s]+/gi;

/** Credenciais embutidas na URL: https://usuario:senha@host (ou só https://token@host). */
const URL_CREDENTIALS_PATTERN = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/?#@]+@/gi;
/**
 * Pares "nome=valor", "nome: valor" e "\"nome\":\"valor\"" em texto livre cujo NOME indica segredo
 * (password, senha, token, secret, apikey, authorization, cookie, credential...). O valor vai até o
 * próximo espaço, vírgula, ponto e vírgula, "&" ou fecha-chave; valores entre aspas inteiros.
 */
const SECRET_PAIR_PATTERN =
  /\b([\w-]*(?:password|passwd|pwd|senha|secret|token|apikey|api[_-]?key|authorization|cookie|credential)[\w-]*)(["']?\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;&"'}\]]+)/gi;

/** Redige segredos e dados pessoais dentro de um texto livre. */
export function redactString(value: string): string {
  let text = value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[truncado]` : value;
  text = text
    .replace(URL_CREDENTIALS_PATTERN, `$1${REDACTED}@`)
    .replace(JWT_PATTERN, REDACTED)
    .replace(BEARER_PATTERN, `$1 ${REDACTED}`)
    .replace(SECRET_PAIR_PATTERN, `$1$2${REDACTED}`)
    .replace(SUPABASE_KEY_PATTERN, REDACTED)
    .replace(URL_SECRET_PARAM_PATTERN, `$1${REDACTED}`)
    .replace(CPF_FORMATTED_PATTERN, REDACTED)
    .replace(CPF_BARE_PATTERN, REDACTED)
    .replace(EMAIL_PATTERN, "$1***@$2");
  return text;
}

/** Redige recursivamente qualquer valor para ser serializado como JSON. */
export function redact(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  if (value instanceof Date) return value.toISOString();

  if (depth >= MAX_DEPTH) return "[profundidade máxima]";
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (value instanceof Error) {
    return serializeError(value, depth, seen);
  }

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY).map((item) => redact(item, depth + 1, seen));
    if (value.length > MAX_ARRAY) items.push(`[+${value.length - MAX_ARRAY} itens]`);
    return items;
  }

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = isSensitiveKey(key) ? REDACTED : redact(item, depth + 1, seen);
  }
  return output;
}

function serializeError(error: Error, depth: number, seen: WeakSet<object>): Record<string, unknown> {
  const serialized: Record<string, unknown> = {
    name: error.name,
    message: redactString(error.message),
  };
  const digest = (error as { digest?: unknown }).digest;
  if (typeof digest === "string") serialized.digest = digest;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string") serialized.code = code;
  if (error.stack) serialized.stack = redactString(error.stack);
  if (error.cause !== undefined) serialized.cause = redact(error.cause, depth + 1, seen);
  return serialized;
}

export interface LogContext {
  correlationId?: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(event: string, data?: Record<string, unknown>): void;
  info(event: string, data?: Record<string, unknown>): void;
  warn(event: string, data?: Record<string, unknown>): void;
  error(event: string, data?: Record<string, unknown>): void;
  /** Novo logger que acrescenta `context` a todos os eventos. */
  child(context: LogContext): Logger;
}

export type LogSink = (level: LogLevel, line: string) => void;

const consoleSink: LogSink = (level, line) => {
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
};

export interface LoggerOptions {
  level?: LogLevel;
  context?: LogContext;
  sink?: LogSink;
  /** Relógio injetável (testes). */
  now?: () => Date;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? "info";
  const sink = options.sink ?? consoleSink;
  const now = options.now ?? (() => new Date());
  const baseContext = options.context ?? {};

  const write = (eventLevel: LogLevel, event: string, data?: Record<string, unknown>) => {
    if (LEVEL_ORDER[eventLevel] < LEVEL_ORDER[level]) return;
    const entry = redact({ ...baseContext, ...data }) as Record<string, unknown>;
    // Campos fixos por último: dados do chamador não podem sobrescrevê-los.
    const line = JSON.stringify({
      ...entry,
      time: now().toISOString(),
      level: eventLevel,
      event: redactString(event),
    });
    sink(eventLevel, line);
  };

  return {
    debug: (event, data) => write("debug", event, data),
    info: (event, data) => write("info", event, data),
    warn: (event, data) => write("warn", event, data),
    error: (event, data) => write("error", event, data),
    child: (context) => createLogger({ ...options, context: { ...baseContext, ...context } }),
  };
}

export { LOG_LEVELS };
