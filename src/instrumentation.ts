import type { Instrumentation } from "next";

/**
 * Subida do servidor: valida as variáveis de ambiente (falha rápida e clara) e registra
 * erros de requisição no log estruturado, com o digest que a tela mostra como
 * "Código de suporte" (03-ui-ux.md, 4.3).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getServerEnv } = await import("@/lib/env.server");
    getServerEnv();
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { createLogger } = await import("@/lib/logger");
  const { getServerEnv } = await import("@/lib/env.server");
  const { CORRELATION_HEADER, isValidCorrelationId } = await import("@/lib/correlation");

  const header = request.headers[CORRELATION_HEADER];
  const candidate = Array.isArray(header) ? header[0] : header;

  // Somente o caminho (sem a query, que pode conter token de link de e-mail).
  const path = request.path.split("?")[0];

  createLogger({ level: getServerEnv().logLevel }).error("request.error", {
    correlationId: isValidCorrelationId(candidate) ? candidate : undefined,
    method: request.method,
    path,
    routePath: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource,
    error,
  });
};
