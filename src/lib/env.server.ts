import "server-only";

import { parseServerEnv, type ServerEnv } from "./env";

let cached: ServerEnv | undefined;

/**
 * Variáveis do servidor (APP_ENV, LOG_LEVEL) já validadas. Só no servidor.
 * Valida também a ausência da chave secreta fora do ambiente local.
 */
export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    APP_ENV: process.env.APP_ENV,
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    LOG_LEVEL: process.env.LOG_LEVEL,
    // Lida apenas para verificar que NÃO está presente fora do ambiente local. Nunca é usada.
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  });
  return cached;
}
