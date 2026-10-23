import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Testes de integração e ponta a ponta por HTTP, sem navegador (E7 comprovantes; E8 acesso/CA-08).
 * A CI (.github/workflows/ci.yml) roda exatamente este comando depois de subir o Supabase local e o `next start`.
 *
 * Rodam contra um `next start` já no ar e o Supabase local, com dados fictícios do
 * `npm run seed:dev`. NÃO fazem parte de `npm test` (que não exige Supabase nem servidor):
 *
 *   npx supabase start && npm run db:reset && npm run seed:dev
 *   npm run build && npm start        # porta 3001
 *   npm run test:e2e
 *
 * Variáveis (lidas do ambiente ou do .env.local): NEXT_PUBLIC_SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, DEV_SEED_PASSWORD (a senha usada no seed:dev) e,
 * opcionalmente, E2E_BASE_URL (padrão http://127.0.0.1:3001) e E2E_MAILPIT_URL (padrão http://127.0.0.1:54324).
 * Os testes de convite também precisam da chave secreta do Supabase LOCAL (E2E_SUPABASE_SECRET_KEY ou
 * SUPABASE_SECRET_KEY do .env.local), usada só pelo processo do teste, nunca pela aplicação.
 */
try {
  // Não sobrescreve variáveis já definidas no ambiente. Sem o arquivo, segue com o ambiente.
  process.loadEnvFile(".env.local");
} catch {
  // .env.local ausente (ex.: CI que injeta as variáveis).
}

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["tests/e2e/**/*.e2e.test.ts"],
    exclude: ["node_modules/**", "docs/legado/**"],
    environment: "node",
    globalSetup: ["tests/e2e/support/global-setup.ts"],
    // Os testes compartilham o banco e o bucket: um arquivo por vez, na ordem escrita.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
