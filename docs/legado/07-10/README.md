# Legado de 07/10 — referência histórica

Esta pasta guarda o que foi construído a partir da especificação de 07/10/2026, antes da nova linha de base da FND-001 (RAT-D012). **É só referência histórica. Nada daqui foi, é ou deve ser aplicado ou executado.**

## Por que foi arquivado

O modelo de 07/10 usa vocabulário e regras que o Brain superou:

- "Indicador" no lugar de Sócio (RAT-D017) e percentuais por sócio e por cliente (RAT-D004 revogada; RAT-D015: a divisão é sempre 1/n);
- papéis `ADMIN_FINANCEIRO` e `SOCIO` no lugar de Administrador, Operador, Visualizador e Sócio (RAT-D011);
- competência aberta/fechada no lugar dos estados do Brain 09, recebimento sem comprovante separado e auditoria sem motivo, origem e correlação.

A decisão RAT-D012 foi refazer a base do banco uma única vez, antes do primeiro ambiente publicado, **preservando** o código antigo. Por isso os arquivos foram **movidos** (não apagados) com os mesmos caminhos relativos.

A E4 moveu o banco, o domínio e a camada de servidor; a **E5** moveu também as telas antigas (login, página inicial, `app-header`) e apagou `src/lib/supabase/env.ts` (substituído por `src/lib/env.ts`, D-E5-07). Uma conferência posterior mostrou que três arquivos não tinham cópia fiel do original de 07/10 (`page.tsx`, `login/actions.ts`, `env.ts`); as cópias do HEAD foram acrescentadas com sufixo `.original-07-10` (ou no caminho original, no caso de `env.ts`).

## Conteúdo

| Caminho aqui | Caminho original |
|---|---|
| `supabase/migrations/20261007000100` a `0700` | `supabase/migrations/` |
| `supabase/tests/database/01_integrity_and_rls.test.sql` | `supabase/tests/database/` |
| `supabase/seed.sql` | `supabase/seed.sql` |
| `src/types/database.types.ts` | `src/types/database.types.ts` |
| `scripts/seed-dev.ts` | `scripts/seed-dev.ts` |
| `src/server/{competencies,distribution-input,finance-settings,ledger,receipts}.ts` | `src/server/` |
| `src/components/finance/` | `src/components/finance/` |
| `src/app/actions/competencies.ts` | `src/app/actions/` |
| `src/domain/{distribution,compensation,competencies,receipts}/` (com os testes) | `src/domain/` |
| `src/app/{login-page.tsx,login-form.tsx,login-actions.ts,page.tsx}` (versão do placeholder da E4) | `src/app/login/{page,login-form,actions}.tsx`, `src/app/page.tsx` |
| `src/app/page.original-07-10.tsx` e `src/app/login-actions.original-07-10.ts` (versões originais de 07/10, arquivadas na rodada de correções da E4/E5) | `src/app/page.tsx` e `src/app/login/actions.ts` (HEAD) |
| `src/components/app-header.tsx` | `src/components/` |
| `src/lib/supabase/env.ts` (cópia do HEAD, arquivada na rodada de correções da E4/E5) | `src/lib/supabase/env.ts` |

`src/domain/shared` (dinheiro, percentual, maior resto e divisão igual 1/n) **não** foi arquivado: continua ativo.

## Regras

- Esta pasta está fora do `tsc` (`tsconfig.json`, `exclude`), do ESLint (`ignores`) e do Vitest (`exclude`). Os arquivos não compilam sozinhos, porque dependem de caminhos (`@/...`) e de tabelas que não existem mais.
- Nenhum `supabase db reset`, `db push` ou migration lê esta pasta. Não copie estas migrations de volta para `supabase/migrations/`.
- Reaproveitar uma ideia é permitido; reaproveitar o código exige reescrever contra o modelo vigente (`docs/features/FND-001-fundacao/02-modelagem-dados.md`).
- Os nomes e e-mails já foram substituídos por nomes fictícios na E0 (RAT-D019).
