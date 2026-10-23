---
name: fnd001-e7-gotchas
description: Armadilhas da E7 (upload de comprovantes por route handler, corpo do Next, e2e HTTP, pgTAP com dados reais)
metadata:
  type: project
---

- Next 16 com proxy NÃO falha com corpo grande: guarda 10 MB (`proxyClientMaxBodySize`) e segue com o corpo cortado. O limite de upload precisa ser do handler (Content-Length + contagem de bytes lidos).
- `/api/*` sem sessão: o proxy redirecionava a /login; agora responde 401 JSON (`isApiPath`).
- `import "server-only"` quebra no Vitest; alias para `tests/stubs/server-only.ts` em `vitest.config.mts`.
- E2E (`npm run test:e2e`, `vitest.e2e.config.mts`, `tests/e2e/`): precisa `DEV_SEED_PASSWORD` igual ao do `seed:dev` (sem ele o seed gera senha aleatória; passe pelo ambiente do shell, `--env-file` não sobrescreve). Login no teste via `createServerClient` do @supabase/ssr com cookie jar em memória (gera o cookie certo). `profiles` não aceita UPDATE direto de authenticated: inativar usuário só por `private.set_user_access` via `npx supabase db query --local -f arquivo.sql`.
- Heredoc Bash com aspas/`\"` em TS quebrou o comando inteiro: usar a ferramenta Write.
- pgTAP que conta `proof_files`/`storage.objects` precisa filtrar pelas linhas do próprio teste (`uploaded_by`/`owner_id like 'f1000000-%'`); senão falha após o e2e deixar comprovantes no banco.
- `taskkill //PID` no Git Bash (barras duplas); `npm run build` com `next start` rodando em cima atrapalha: pare o servidor antes.

**Why:** economiza retrabalho nas etapas E8 (CI) e em futuras features de comprovante.
**How to apply:** ao mexer em `src/server/proofs`, `src/app/api`, `tests/e2e` ou pgTAP de proof_files.
