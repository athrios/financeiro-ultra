/**
 * Validação de destino de redirecionamento (anti open redirect).
 *
 * Só aceita CAMINHOS INTERNOS da própria aplicação: começam com uma única "/",
 * sem esquema, sem host, sem barra invertida, sem caracteres de controle.
 * Qualquer outro valor devolve o destino padrão.
 */

const MAX_LENGTH = 2048;
const PROBE_ORIGIN = "http://interno.invalido";

/** Rotas de autenticação: nunca são destino depois do login (evita laço). */
const AUTH_ROUTES = ["/login", "/recuperar-senha", "/auth/confirm", "/definir-senha"];

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export interface SafeRedirectOptions {
  /** Destino quando o valor é inválido. Precisa ser um caminho interno fixo. */
  fallback?: string;
  /** Permite destinos nas rotas de autenticação (padrão: não). */
  allowAuthRoutes?: boolean;
}

/**
 * Devolve `caminho + query` normalizado se `raw` for um caminho interno seguro,
 * ou `fallback` (padrão "/") caso contrário.
 */
export function safeInternalPath(raw: unknown, options: SafeRedirectOptions = {}): string {
  const fallback = options.fallback ?? "/";
  if (typeof raw !== "string") return fallback;

  const value = raw.trim();
  if (value === "" || value.length > MAX_LENGTH) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value.includes("\\") || CONTROL_CHARS.test(value)) return fallback;

  let parsed: URL;
  try {
    parsed = new URL(value, PROBE_ORIGIN);
  } catch {
    return fallback;
  }

  // O parser resolve "/\\", "/\t/" e afins para outro host: a origem precisa continuar a mesma.
  if (parsed.origin !== PROBE_ORIGIN) return fallback;
  if (parsed.pathname.startsWith("//")) return fallback;
  if (!options.allowAuthRoutes && isAuthRoute(parsed.pathname)) return fallback;

  return `${parsed.pathname}${parsed.search}`;
}
