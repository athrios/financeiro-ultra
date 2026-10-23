/**
 * Cabeçalhos de segurança HTTP (plano, seção 12). Puro e testável; usado por next.config.ts.
 *
 * CSP sem nonce, de propósito: o Next 16 com Cache Components/Partial Prerendering usa um
 * shell estático, e o guia de CSP do Next afirma que nonce exige renderização 100%
 * dinâmica e é incompatível com PPR (node_modules/next/dist/docs/01-app/02-guides/
 * content-security-policy.md). Por isso `script-src` precisa de 'unsafe-inline' (scripts
 * de inicialização do Next). Compensações: `object-src 'none'`, `base-uri 'self'`,
 * `form-action 'self'`, `frame-ancestors 'none'`, `connect-src` restrito ao próprio site e
 * ao Supabase configurado, nenhum HTML de origem externa renderizado. Alternativa futura:
 * `experimental.sri` (hash de scripts), registrada como pendência para a Segurança.
 */

export interface SecurityHeadersInput {
  /** NEXT_PUBLIC_SUPABASE_URL (usada para liberar o connect-src). */
  supabaseUrl?: string;
  /** `next dev`: exige 'unsafe-eval' (React) e WebSocket do HMR. */
  isDevelopment: boolean;
  /** APP_ENV === "production": liga HSTS e upgrade-insecure-requests. */
  isProductionEnv: boolean;
}

export interface HeaderEntry {
  key: string;
  value: string;
}

/** Origem (esquema + host + porta) de uma URL, ou null se inválida. */
export function originOf(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function buildContentSecurityPolicy(input: SecurityHeadersInput): string {
  const supabaseOrigin = originOf(input.supabaseUrl);

  const connectSrc = ["'self'"];
  if (supabaseOrigin) connectSrc.push(supabaseOrigin);
  if (input.isDevelopment) connectSrc.push("ws:", "wss:");

  const scriptSrc = ["'self'", "'unsafe-inline'"];
  if (input.isDevelopment) scriptSrc.push("'unsafe-eval'");

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    // Os componentes (Base UI) e o Next usam atributos style inline.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src ${connectSrc.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  // Em http local (next start / next dev) o upgrade quebraria os recursos.
  if (input.isProductionEnv) directives.push("upgrade-insecure-requests");

  return directives.join("; ");
}

export function buildSecurityHeaders(input: SecurityHeadersInput): HeaderEntry[] {
  const headers: HeaderEntry[] = [
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy(input) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Complemento legado do frame-ancestors para navegadores antigos.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
  if (input.isProductionEnv) {
    // Sem includeSubDomains nem preload: o domínio definitivo ainda não existe (E9).
    headers.push({ key: "Strict-Transport-Security", value: "max-age=31536000" });
  }
  return headers;
}
