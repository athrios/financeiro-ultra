import type { NextConfig } from "next";

import { assertDeployEnv } from "./src/lib/env";
import { buildSecurityHeaders } from "./src/lib/security-headers";

// Na hospedagem (Vercel ou Render), APP_ENV e as variáveis públicas do Supabase precisam estar
// definidas (falha rápida no início do build e na subida; SEG-E45-06).
assertDeployEnv(process.env);

const nextConfig: NextConfig = {
  /* config options here */
  // Não anuncia o framework em X-Powered-By (SEG-E45-07).
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Cabeçalhos de segurança (plano, seção 12). Avaliados na subida/build: dependem de
  // NEXT_PUBLIC_SUPABASE_URL e APP_ENV, que fazem parte da configuração do ambiente.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders({
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
          isDevelopment: process.env.NODE_ENV === "development",
          isProductionEnv: process.env.APP_ENV === "production",
        }),
      },
    ];
  },
};

export default nextConfig;
