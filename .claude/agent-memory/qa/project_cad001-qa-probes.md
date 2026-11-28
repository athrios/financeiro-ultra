---
name: cad001-qa-probes
description: Como rodar sondagens HTTP ad hoc contra o next start local no QA da CAD-001 (tsx, .mts, helpers e2e) e armadilhas do ambiente
metadata:
  type: project
---

Sondagens ad hoc de QA ficam no scratchpad como `.mts`, rodadas com `npx tsx --env-file=.env.local <arquivo>` e `DEV_SEED_PASSWORD` no ambiente (a mesma usada no `seed:dev`).

**Why:** `tests/e2e/support/cadastros.ts` importa `vitest` (`inject`) e não carrega fora do runner; `http.ts` e `pages.ts` carregam. Imports absolutos no Windows precisam de `file:///C:/...` e extensão `.ts`. Top-level await exige `.mts`.

Armadilhas extras: `run.sh` (semeia com senha nova e roda o `.mts`) faz `cd` para o repo, então passe o caminho do roteiro absoluto (`$(pwd -W)/x.mts`). Heredoc longo no Bash falha com aspas misturadas e `python -` travou: crie arquivos com a ferramenta Write. `audit_logs` usa `kind`/`action`/`entity_id` (EVENT em `action`). O papel `authenticated` tem `statement_timeout=8s`; o tempo de listas grandes depende do total de apelidos já gravados. Busca de documento é por prefixo; chave Pix de e-mail não ignora pontuação.

Cada chamada do Bash é um shell novo: `export DEV_SEED_PASSWORD=...` não sobrevive à chamada seguinte. Rode seed, e2e (powershell.exe herda o env) e sondagens na MESMA chamada, ou o setup do e2e falha com "Defina DEV_SEED_PASSWORD". Heredoc com `cat >>` de texto longo em português também falhou: escreva com Write no scratchpad e anexe com `cat`. Reseed muda a senha sem derrubar o `next start`.

Logo após `supabase db reset` o `seed:dev` pode falhar com "Processing this request timed out" (Auth reiniciando): espere ~1 min ou repita. O primeiro `npm test` depois do `build` pode estourar 5 s em `equal-split.test.ts` (cache frio, FND): repita. O e2e completo leva 5 a 8 min; rode tudo (seed, `next start`, e2e, sondagens) num `run.sh` em segundo plano com `cygpath -m` para o caminho dos `.mts`, e acompanhe um arquivo de status.

Retomada de instância morta: antes de rodar, olhe `<scratchpad>/cad-001/qa/` (r4*.mts, `lib.mts` com `act`/`version`, `run.sh`, `*.status`) e `netstat`/CommandLine da porta 3001: o `next start` órfão pode ser da instância anterior. Reuse os scripts (releia e rode de novo, não confie só nos logs) e não mate o servidor se a regra do orquestrador só permite encerrar o que você subiu. Não use `&` dentro de comando `run_in_background` (o subshell morre); grave um `.sh` com Write e rode `bash`. Heredoc com aspas/apóstrofos em português falha: use Write e `cat >>`. `signIn` aceita as chaves `admin`, `operator`, `viewer`, `partner`.

Modelo de rodada completa (rodada 4b): um `qa/r4b.sh` no scratchpad encadeia lint, typecheck, `npm test` (powershell), build, bundle, db reset, pgTAP (cerca de 25 s), seed com `openssl rand`, `npm run start` em segundo plano, `npm run test:e2e` e a sondagem HTML (`r4bhtml.mts`), com `r4b.status` como acompanhamento (até `FIM-TUDO`); a rodada toda leva cerca de 10 min. O reporter do e2e não imprime o tempo por teste. Estado de tela do React (Enter, remover, aria-invalid) não aparece no HTML servido: só o passo do navegador prova.

**How to apply:** importe `signIn`/`fetchWithRetry` de `http.ts` e `getPage` de `pages.ts`; reimplemente `callAction` lendo `.next/server/server-reference-manifest.json` (id da Server Action pelo `exportedName`). Matar o `next start` pela porta 3001 com `taskkill //PID <pid> //T //F`. `npm test` e `npm run test:e2e` devem rodar via `powershell.exe` com `C:\` maiúsculo. `supabase test db` passa de 3 min: roda em segundo plano.

Gotcha da senha (rodada 4d): `openssl rand -base64 18 | tr -d '/+=\n'` no Git Bash do Windows deixa um `\r` na senha. O seed grava com o CR, o `signIn` por API funciona, mas o login pelo formulario (`loginByForm`) devolve 200 e derruba 7 testes de `acesso.e2e`. Use `openssl rand -hex 12` (mais sufixo) ou `tr -d '\r\n'`. Nao e bug do app. O `afterAll` de `acesso.e2e` (30 s) estourou uma vez no e2e completo e passou na reexecucao do arquivo.
