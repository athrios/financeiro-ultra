---
name: fnd001-e8-gotchas
description: Armadilhas da E8 (smoke HTTP sem navegador, CI, workflows, db query, advisors, Next keep-alive)
metadata:
  type: project
---

- E2E sem navegador: `tests/e2e/support/pages.ts` envia formulários como navegador sem JS (hidden da Server Action + `Origin`). O HTML em streaming traz o hidden `next` do login duas vezes (fallback e definitivo): enviar `next` explícito. Estado de Server Action em rota PPR só no payload RSC (`"status":"invalid"`), não no texto visível.
- Node `fetch` reaproveita conexão fechada pelo keep-alive curto do Next (ECONNRESET após testes que esperam a CLI): `fetchWithRetry` em `support/http.ts`.
- `supabase db query` aceita UMA instrução por arquivo (várias = erro "cannot insert multiple commands"); por isso o bootstrap SQL é só um `select`. Não confie em "No issues found" do advisors depois de um `db query` com várias instruções que falhou.
- Supabase local enxuto funciona: `supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,postgres-meta,realtime`. `db advisors --fail-on info` sai 1 com o `unindexed_foreign_keys` de `proof_files` (info), `--level warn --fail-on warn` sai 0.
- `npm run seed:dev` exige `.env.local` (`--env-file`); na CI usar `npx tsx scripts/seed-dev.ts` com as variáveis no ambiente (`SUPABASE_SECRET_KEY` só nesse passo).
- Heredoc Bash com texto longo/aspas quebrou ("unexpected EOF"): escrever markdown/YAML grandes com a ferramenta Write e anexar com `cat >>`. Template literal em `node -` com `\\` + quebra de linha vira continuação de linha (cuidado em YAML com `\`).
- Vercel: `git.deploymentEnabled.main=false` + deploy hook NÃO foi verificado contra a doc/conta; registrado em D-E8-07 e no checklist-e9 passo 5.

**Why:** economiza retrabalho na E9/E10 e em futuras mudanças de CI.
**How to apply:** ao mexer em `tests/e2e`, `.github/workflows`, `scripts/sql` ou no fluxo de publicação.
