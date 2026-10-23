/**
 * Quais rotas o proxy deixa passar sem sessão (03-ui-ux.md, 2.1 e 4.8; P-11). Puro e testável.
 *
 * Qualquer outro caminho sem sessão vai ao /login, inclusive URL inexistente: um visitante
 * anônimo não precisa aprender quais endereços existem (4.8).
 */

/**
 * Rotas públicas: /login e /recuperar-senha, e /auth/confirm (cria a sessão a partir do
 * link do e-mail).
 */
export const PUBLIC_PATHS = ["/login", "/recuperar-senha", "/auth/confirm"] as const;

/**
 * Rotas que o proxy deixa passar sem sessão, mas que NÃO são públicas: a própria página
 * verifica a sessão e mostra "Sessão expirada" com o botão "Solicitar novo link"
 * (03-ui-ux.md, 2.5.2 e UX-11). A Server Action também revalida. Divergência registrada em
 * 04-implementacao.md (D-E5-03): 4.8 chama /definir-senha de "não pública".
 */
export const SESSION_CHECKED_BY_PAGE = ["/definir-senha"] as const;

/**
 * Rotas públicas que quem JÁ tem sessão não precisa ver: voltam ao início.
 * /auth/confirm fica de fora de propósito: o aceite de convite e a recuperação de senha
 * precisam funcionar mesmo com outra sessão aberta no navegador.
 */
export const REDIRECT_WHEN_AUTHENTICATED = ["/login", "/recuperar-senha"] as const;

export function matchesPath(pathname: string, paths: readonly string[]): boolean {
  return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function isPublicPath(pathname: string): boolean {
  return matchesPath(pathname, PUBLIC_PATHS);
}

/** O proxy não redireciona ao /login nestas rotas (públicas ou com verificação própria). */
export function skipsLoginRedirect(pathname: string): boolean {
  return isPublicPath(pathname) || matchesPath(pathname, SESSION_CHECKED_BY_PAGE);
}

/** Com sessão aberta, estas rotas voltam ao início. */
export function redirectsWhenAuthenticated(pathname: string): boolean {
  return matchesPath(pathname, REDIRECT_WHEN_AUTHENTICATED);
}
