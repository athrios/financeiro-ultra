import "server-only";

import { headers } from "next/headers";

import { CORRELATION_HEADER, isValidCorrelationId } from "@/lib/correlation";
import { getServerEnv } from "@/lib/env.server";
import { createLogger, type Logger } from "@/lib/logger";

/** Correlation id da requisição atual (gerado pelo proxy), ou null fora de uma requisição. */
export async function getCorrelationId(): Promise<string | null> {
  const value = (await headers()).get(CORRELATION_HEADER);
  return isValidCorrelationId(value) ? value : null;
}

/** Logger da aplicação com o nível do ambiente. */
export function getLogger(): Logger {
  return createLogger({ level: getServerEnv().logLevel });
}

/** Logger já com o correlation id da requisição atual. */
export async function getRequestLogger(): Promise<Logger> {
  const correlationId = await getCorrelationId();
  return getLogger().child(correlationId ? { correlationId } : {});
}
