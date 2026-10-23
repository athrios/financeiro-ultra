import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { CORRELATION_HEADER, newCorrelationId } from "@/lib/correlation";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";
import { redirectsWhenAuthenticated, skipsLoginRedirect } from "@/lib/route-access";
import type { Database } from "@/types/database.types";

import { supabaseCookieOptions } from "./cookie-options";

function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token"));
}

/**
 * Executado pelo proxy em cada requisição:
 *   1. gera o correlation id da requisição (não confia no valor enviado pelo cliente);
 *   2. renova a sessão do Supabase (cookies);
 *   3. redireciona visitantes sem sessão para /login (guardando o destino e avisando
 *      "sessão expirada" quando havia um cookie de sessão vencido);
 *   4. redireciona usuários autenticados que abrem /login ou /recuperar-senha para /.
 *
 * É uma verificação otimista. A autorização real acontece no servidor (cada página e
 * ação carrega a sessão e o perfil) e no banco (RLS).
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const correlationId = newCorrelationId();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(CORRELATION_HEADER, correlationId);

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(CORRELATION_HEADER, correlationId);

  const supabase = createServerClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    cookieOptions: supabaseCookieOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        // Refaz os cabeçalhos a partir da requisição já com os cookies renovados, para que os
        // Server Components desta mesma requisição vejam a sessão nova (e não renovem de novo).
        const refreshedHeaders = new Headers(request.headers);
        refreshedHeaders.set(CORRELATION_HEADER, correlationId);
        response = NextResponse.next({ request: { headers: refreshedHeaders } });
        response.headers.set(CORRELATION_HEADER, correlationId);
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Não inserir código entre a criação do cliente e getClaims().
  const hadSessionCookie = hasSupabaseAuthCookie(request);
  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  if (!isAuthenticated && !skipsLoginRedirect(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // Guarda o destino pretendido só em navegação (GET). O valor é revalidado no login
    // (safeInternalPath): aqui é apenas o caminho interno da própria requisição.
    if (request.method === "GET" && pathname !== "/") {
      url.searchParams.set("next", `${pathname}${search}`);
    }
    if (hadSessionCookie) url.searchParams.set("aviso", "sessao-expirada");
    return redirectPreservingCookies(request, response, url, correlationId);
  }

  if (isAuthenticated && redirectsWhenAuthenticated(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return redirectPreservingCookies(request, response, url, correlationId);
  }

  return response;
}

function redirectPreservingCookies(
  request: NextRequest,
  sessionResponse: NextResponse,
  url: URL,
  correlationId: string,
): NextResponse {
  // 303 nas requisições que não são GET (Server Actions): o destino é lido com GET.
  const status = request.method === "GET" || request.method === "HEAD" ? 307 : 303;
  const redirect = NextResponse.redirect(url, status);
  redirect.headers.set(CORRELATION_HEADER, correlationId);
  sessionResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}
