# FND-001 — Fundação · Registro de implementação

| Campo | Valor |
|---|---|
| Feature | FND-001 — Fundação |
| Agente | `desenvolvedor` |
| Data | 22/10/2026 |
| Plano | `01-plano.md` (revisão 5, aprovado em 22/10/2026) |
| Escopo desta execução | E0 passos 1 a 3 e E6 (primitiva de divisão 1/n). Git (passo 4) e GitHub (passo 5) **fora** desta execução |
| Status | **Validada após a rodada 2 (22/10/2026).** `qa`: APROVADO COM RESSALVAS (build, lint, typecheck e testes verdes; ressalvas só documentais e itens adiados para E4/E5). `seguranca`: não bloqueia o primeiro commit nem o envio ao repositório privado; varredura de segredos sem achados. O build, antes vermelho, foi corrigido na rodada 2. Os relatórios finais de segurança e QA da FND continuam sendo os artefatos 05 e 06 (E8b/E10) |

## E0 — Higiene e segurança imediata

### Passo 1 — Next 16.4.2 e triagem do `npm audit`

Estado confirmado (`npm ls next eslint-config-next shadcn`): `next@16.4.2`, `eslint-config-next@16.4.2`, `shadcn@4.21.4` em `devDependencies`. Nada refeito. `npm audit fix --force` **não** foi executado.

**Triagem do `npm audit` (22/10/2026)**

| Execução | Resultado |
|---|---|
| `npm audit --omit=dev` (runtime / produção) | **0 vulnerabilidades** |
| `npm audit` (completo) | **9 altas**, 0 críticas, 0 moderadas (antes: 11 achados, com 1 crítico e RCE/DoS no `next` 16.4.0, corrigidos pela 16.4.2) |

Os 9 achados são uma única cadeia, originada em `braces@3.0.3` (GHSA-vfj7-8cjw-p6xm, negação de serviço por exaustão de pilha com padrões profundamente aninhados). Caminho: `braces` ← `micromatch` ← `fast-glob` ← {`@next/eslint-plugin-next` ← `eslint-config-next`; `@shadcn/registry`; `@ts-morph/common` ← `ts-morph`} ← `shadcn`.

| Pacote | Severidade | Runtime ou desenvolvimento | Observação |
|---|---|---|---|
| `braces`, `micromatch`, `fast-glob` | Alta | Desenvolvimento (transitivos) | Só afetam quem expande globs de entrada não confiável |
| `@shadcn/registry`, `@ts-morph/common`, `ts-morph`, `shadcn` | Alta | Desenvolvimento (CLI `shadcn`, só usado manualmente para adicionar componentes) | Não entram no bundle nem no deploy |
| `@next/eslint-plugin-next`, `eslint-config-next` | Alta | Desenvolvimento (lint) | Globs sobre os arquivos do próprio projeto |

**Ação recomendada:** aceitar o risco residual por ora e registrá-lo (impacto restrito a DoS local em ferramenta de desenvolvimento/CI, com entrada confiável; nenhum pacote atinge produção). Reavaliar a cada atualização de `shadcn` e `eslint-config-next` (a correção virá com `braces`/`micromatch` atualizados na cadeia). **Não aplicar** a correção sugerida pelo `npm audit` (`--force`): ela propõe *rebaixar* `shadcn` para 1.0.0 e `eslint-config-next` para 14.2.35, o que é regressão e quebra o projeto. Considerar `overrides` para `braces` somente se a Segurança exigir, e com aprovação (mudança de dependência).

### Passo 2 — Nomes fictícios (RAT-D019)

Os nomes de sócios, da empresa e os e-mails herdados da especificação de 07/10 foram substituídos por nomes fictícios: sócios **Alice, Bruno e Clara** (um deles com sobrenome "Exemplo"), empresa **"Contabil Exemplo Ltda."** e e-mails `@exemplo.test`. A troca preservou a ordem alfabética relativa dos nomes, então nenhuma expectativa de ordenação dos testes mudou. Identificadores em código foram trocados de forma consistente. Percentuais, UUIDs e valores não mudaram, e nenhum teste foi removido nem enfraquecido. (Em atenção ao SEG-01, este registro não reproduz os nomes originais. A lista de termos verificados fica fora do repositório.)

Arquivos: `supabase/seed.sql`, `scripts/seed-dev.ts`, `supabase/tests/database/01_integrity_and_rls.test.sql`, comentário de exemplo em `supabase/migrations/20261007000100_foundation.sql` (linha 112, apenas comentário; nenhuma lógica alterada), `src/domain/compensation/ledger.test.ts`, `src/domain/competencies/competencies.test.ts`, `src/domain/distribution/distribution.test.ts`, `src/domain/receipts/receipts.test.ts`.

Verificação: uma busca pelos nomes originais e pelo domínio de e-mail antigo em `supabase/`, `scripts/` e `src/` (exceto a interface, tratada na E5) devolve zero ocorrências.

**Fora de escopo, mantido (E5):** `src/app/layout.tsx`, `src/app/login/page.tsx` e `src/components/app-header.tsx` ainda exibem "Ultra Contabilidade" na interface. A senha de desenvolvimento em `scripts/seed-dev.ts` (`DEV_PASSWORD`) é local e não foi alterada.

### Passo 3 — README e CLAUDE.md

- `README.md` real, em pt-BR: requisitos (Node 22, Docker), instalação, `.env.local` a partir de `npx supabase status -o env` (nomes `API_URL`, `PUBLISHABLE_KEY`, `SECRET_KEY` conferidos na saída real; cita `.env.example`), scripts npm, porta 3000 ocupada, links para o Brain e para `docs/features/FND-001-fundacao/`. Nenhuma senha escrita (o `seed:dev` imprime as credenciais locais).
- `CLAUDE.md` criado (não existia), mesclando `.claude/docs/CLAUDE-ORQUESTRACAO.md`, com apontamento para `AGENTS.md` (regra do Next 16, via `@AGENTS.md`), Brain (`00-MOC.md`, `11-Decisoes.md`) e plano. Acrescentei um resumo das decisões vigentes que afetam o código; ele só repete o que está em `11-Decisoes.md`.
- `.gitignore`: já continha `/.acessos/` (linha 44) e `.env*` com exceção de `.env.example`. Confirmado, nenhuma alteração necessária. A pasta `.acessos/` não foi lida nem tocada.

## E6 — Primitiva de divisão igual 1/n

| Requisito (plano 7.3 / RAT-D015) | Arquivo | Teste | Resultado |
|---|---|---|---|
| Dividir centavos igualmente entre n chaves pela fração exata (pesos 1/1/1), centavo residual por maior resto com desempate determinístico por chave (ex.: id do recebimento) | `src/domain/shared/equal-split.ts` (`splitEqually`) | `equal-split.test.ts`: R$ 1.000,00/3 = 333,34 + 333,33 + 333,33; /2 e /4 sem resíduo; R$ 0,01/3; valor zero; 1 sócio; determinismo e independência da ordem das chaves | Passou |
| Valor alto sem o desvio do código atual | idem | R$ 100.000,00/3 (diferença máx. 1 centavo); R$ 20.000,00/3 | Passou |
| Centavo residual varia entre recebimentos | idem | 300 ids de recebimento: os 3 sócios recebem o centavo extra, cada um > 40 vezes (esperado 100) | Passou |
| Casos aleatórios determinísticos (semente fixa, sem dependências) | idem | 2.000 casos (mulberry32, semente 20261022), n de 1 a 6, valores até numeric(14,2): soma exata, diferença máx. 1 centavo, cada parcela entre piso e teto de total/n | Passou |
| Percentuais de exibição 1/n somando exatamente 100% em unidades de 0,0001% | idem (`equalDisplayPercentages`) | 2 → 50%; 3 → 33,3334/33,3333/33,3333; 4 → 25%; n de 1 a 60 somam 1.000.000 unidades com diferença máx. 1 | Passou |
| Entradas inválidas (sem sócios, sócios repetidos, valor negativo) | idem | `rejeita entradas inválidas` | Passou |
| Mover o maior resto para `shared` sem mudar comportamento | `src/domain/shared/apportion.ts` (conteúdo original, sem alteração); `src/domain/distribution/apportion.ts` virou re-exportação (`export * from "../shared/apportion"`) | `distribution.test.ts` (existente) inalterado em lógica + teste de identidade das funções | Passou |

Não há percentuais armazenados nem parâmetro de percentual por sócio na API. A primitiva **não** foi ligada à interface nem ao código antigo; nenhum módulo antigo foi movido (E5). Sem dependências novas (`fast-check` não foi usado).

## Comandos executados e resultados reais

| Comando | Resultado |
|---|---|
| `npm ls next eslint-config-next shadcn` | next 16.4.2, eslint-config-next 16.4.2, shadcn 4.21.4 |
| `npm audit` / `npm audit --omit=dev` | 9 altas (todas dev) / 0 |
| `npm run lint` | Sem erros nem avisos |
| `npm run typecheck` | Passou (`next typegen && tsc --noEmit`) |
| `npm test` (`vitest run`) | **6 arquivos, 63 testes passando** (46 anteriores + 17 novos) |
| `npm run build` | **FALHOU** na entrega original (ver abaixo); corrigido na rodada 2 (seção "Correções pós-validação (rodada 2)") |
| `npm run db:start` | OK (Docker disponível) |
| `npm run db:reset` | OK: 7 migrations + `seed.sql` com os nomes fictícios |
| `npm run seed:dev` | OK: 2 competências, 15 recebimentos, ledger fechando em R$ 0,00; RLS: admin vê 7 empresas, Alice (SOCIO) vê 5 |
| `npm run db:test` | **46/46 passando** (PASS) |
| `npm run db:stop` | OK |

## Correções pós-validação (rodada 2)

| Achado | Correção | Evidência |
|---|---|---|
| QA T04 / SEG-06 — `npm run build` falhava no prerender de `/` (sessão e `searchParams` lidos fora de `<Suspense>` com `cacheComponents: true`) | Em `src/app/page.tsx`, `HomePage` virou componente síncrono que renderiza `<Suspense fallback>` (texto simples "Carregando…") em volta de `HomeContent`, que concentra a leitura de sessão, o `searchParams` e as consultas. Padrão de `migrating-to-cache-components.md` (seção `cookies`, `headers` e `searchParams`). Nenhum `use cache`, `cacheLife` ou equivalente; `cacheComponents` segue ligado; o conteúdo visível não mudou além do fallback. `/login` não precisou de mudança. Nota: o `redirect("/login")` para anônimo agora ocorre dentro do `Suspense` (a navegação continua a mesma; só o mecanismo de redirecionamento durante o streaming é o do Next). | `npm run build` passou; rotas: `/` parcial (Partial Prerender), `/_not-found` e `/login` estáticas. `grep -rn "use cache\|cacheLife" src` sem ocorrências. |
| SEG-03 — checagem de URL local por regex sem âncora; senha de dev fixa | `scripts/seed-dev.ts`: `new URL(url).hostname` comparado à lista exata `["127.0.0.1", "localhost"]` (protocolo http/https; URL inválida é recusada). Senha lida de `DEV_SEED_PASSWORD` (`.env.local`), com o padrão anterior mantido quando a variável está ausente ou vazia. README documenta a variável (sem a senha); `.env.example` ganhou `DEV_SEED_PASSWORD=` vazio. | Execução manual com `NEXT_PUBLIC_SUPABASE_URL=http://localhost.exemplo.test` e com `http://localhost:54321@evil.test`: ambas recusadas ("seed:dev só roda contra o Supabase local"). |
| SEG-02 — padrões ausentes no `.gitignore` | Acrescentados `.claude/settings.local.json`, `*.key`, `*.p12`, `*.pfx`, `*.dump`, `*.sql.gz`, `*.bak`. `!.env.example` continua como última regra. | Leitura do arquivo. `git check-ignore` não foi executado (git proibido nesta etapa); fica para o passo 4 da E0. Exportações (`*.csv`, `*.xlsx`) e comprovantes (`*.pdf`) não foram incluídos por não constarem do escopo solicitado. |
| QA (baixa) — comentário de `tieBreakOrder` dizia "indicador" (RAT-D017) | `src/domain/shared/apportion.ts`: "indicador" trocado por "sócio" no comentário. Nenhum código alterado. | `grep -n indicador src/domain/shared/apportion.ts` sem ocorrências. |
| SEG-01 — nomes reais neste documento | Já corrigido pelo orquestrador; apenas conferido. | Varredura neste arquivo com a lista local de termos proibidos: 0 ocorrências. |

### Resultados reais (após as correções)

| Comando | Resultado |
|---|---|
| `npm run lint` | Sem erros nem avisos (exit 0) |
| `npm run typecheck` | Passou (exit 0) |
| `npm test` | 6 arquivos, 63 testes passando (exit 0) |
| `npm run build` | **Passou** (exit 0), Next.js 16.4.2, Cache Components e Partial Prefetching ativos |

### Observações e não reabertos

- `supabase/seed.sql` e `scripts/seed-dev.ts` ainda usam o esquema legado (percentuais por sócio, papel "Indicador", modos INHERIT/EQUAL), em contradição com RAT-D015/RAT-D004; a substituição é da nova linha de base do banco (E1+/E4). Não alterado aqui.
- Textos "Ultra Contabilidade" na interface seguem para a E5 (SEG-07); `src/app/page.tsx` ainda usa vocabulário legado (`indicatorName`, papel SOCIO) até a E5.
- SEG-05: ao ligar a primitiva ao fluxo (P-17), usar apenas id gerado no servidor como `tieBreakKey` e trocar o desempate por `localeCompare` por comparação ordinal. Não tratado agora (fora do escopo).
- Esta rodada **não** declara aprovação: aguarda nova revisão de Segurança e QA.

## Divergências e bloqueios

1. ~~**`npm run build` falha**~~ — **resolvido na rodada 2** (ver "Correções pós-validação (rodada 2)"); registro original mantido abaixo como histórico. No prerender da rota `/`: "Route "/": Next.js encountered uncached or runtime data during prerendering" (`cookies()`/`searchParams` acessados fora de `<Suspense>`). `next.config.ts` tem `cacheComponents: true` e `partialPrefetching: true`, e `src/app/page.tsx` (tela antiga) lê sessão e `searchParams` no topo, sem `Suspense`. Nenhum arquivo de `src/app` foi alterado por mim, então a causa não é esta execução. **Não verifiquei** se o build também falhava com `next` 16.4.0 (não há git para comparar); a causa é estrutural (código da tela antiga × `cacheComponents`), não de versão do patch. O plano (E0) espera "build e testes verdes". Não corrigi por estar fora do escopo definido (a tela antiga é substituída na E5). **Decisão necessária do responsável/orquestrador:** (a) corrigir agora, de forma mínima, na tela antiga (envolver o conteúdo dinâmico em `<Suspense>` ou usar o mecanismo documentado em `node_modules/next/dist/docs/01-app/02-guides/migrating-to-cache-components.md`); ou (b) aceitar build vermelho até a E5. Recomendo (a), antes do `git init`, para o primeiro commit já sair com build verde.
2. O plano (seção 1.1) cita 11 achados no audit; o estado atual é 9 altas, todas de desenvolvimento (efeito esperado da 16.4.2). O plano 1.1 não precisa de correção, mas o registro acima é o vigente.
3. Textos "Ultra Contabilidade" permanecem na interface (E5), fora do escopo desta execução.

## Pendências

- **Passo 4 da E0** (`git init` + primeiro commit): liberado pela validação da rodada 2; executado pelo orquestrador, com `git check-ignore` de `.acessos/` e `.env*` antes do commit.
- **Passo 5 da E0** (envio ao GitHub privado): repositório `athrios/financeiro-ultra`, confirmado como privado em 22/10/2026.
- Triagem do `npm audit` pode ser reaberta pela Segurança (opção `overrides`).
- Troca dos textos de interface com "Ultra Contabilidade" (E5).
- Ligação da primitiva `splitEqually` ao fluxo de recebimentos e registro do resíduo na alocação ficam para as features posteriores e dependem da modelagem de dados (P-17).
- Arquivos temporários: nenhum foi criado fora do projeto.

## Handoff

- **`seguranca`:** revisar (1) a triagem do `npm audit` e o risco residual aceito; (2) `README.md`/`CLAUDE.md` (ausência de segredos; `.acessos/` e `.env*` ignorados); (3) a troca de dados de seed e e-mails; (4) `equal-split.ts` (validações de entrada).
- **`qa`:** validar a regra 1/n contra RAT-D015 (2 → 50%, 3 → 33,33…%, 4 → 25%; R$ 1.000,00/3 = 333,34 + 333,33 + 333,33; R$ 100.000,00/3), reexecutar `lint`, `typecheck`, `test`, `db:reset`, `seed:dev` e `db:test`, e registrar o resultado do `build`.
- Handoff concluído: Segurança e QA revalidaram após a rodada 2 (ver Status).

## E4 — Nova linha de base do banco

| Campo | Valor |
|---|---|
| Data | 23/10/2026 |
| Agente | `desenvolvedor` |
| Plano | `01-plano.md` (revisão 7) |
| Modelagem | `02-modelagem-dados.md` (revisão 3, seções 3, 6, 7 e 12) |
| Branch | `fnd-001/e4-e5` (git operado pelo orquestrador; nenhum comando git de escrita foi executado nesta etapa) |
| Estado | **Implementada e verificada localmente.** Retomada de uma execução pausada: os itens 1 a 6 já estavam no disco e foram conferidos contra o `02`; os itens 7 a 10 foram feitos agora. **Não declara aprovação**: aguarda `seguranca` e `qa` |

### Banco e migrations

Cinco migrations novas em `supabase/migrations/`, aplicadas **somente no banco local** (`supabase db reset`). Nada foi aplicado em remoto e nenhum projeto Supabase, Vercel ou GitHub foi criado ou alterado.

| Migration | Conteúdo (seção do `02`) |
|---|---|
| `20261023000100_base.sql` | Schema `private`, enums, `set_updated_at`, `normalize_alias`, `prevent_mutation`, `to_money`, `prevent_truncate` (3.1) |
| `20261023000200_audit.sql` | `audit_logs` (seq, `clock_timestamp()`, `tx_id`, tipo, origem, correlação, ator, rótulo), `set_audit_context`, `audit_insert`, `audit_row_change`, `audit_event`, `require_audit_reason`, imutabilidade e `TRUNCATE` bloqueado, índices (3.2) |
| `20261023000300_access.sql` | `partners` mínima, `profiles` (`role` anulável, `partner_id`, `active`), `handle_new_user` (perfil sem papel; preserva e restaura o contexto, I-10b), funções de autorização, guardas de INSERT e UPDATE, trava do último Administrador, RLS, `bootstrap_first_admin`, `set_user_access` (3.3, 6) |
| `20261023000400_proof_files.sql` | `proof_files`, guardas, `register_proof_file`, `complete_proof_file_upload`, bucket privado `proofs` (4 MiB; pdf, jpeg, png), políticas em `storage.objects` (3.5) |
| `20261023000500_privileges.sql` | Revoga tudo e concede por lista explícita; `alter default privileges`; `service_role` sem escrita em `profiles` e `audit_logs` (3.6) |

### Arquivamento (itens 1 a 3)

41 arquivos **movidos** (não apagados) para `docs/legado/07-10/`, com os mesmos caminhos relativos e um `README.md` ("referência histórica, nunca aplicada nem executada"): 7 migrations, `01_integrity_and_rls.test.sql`, `supabase/seed.sql`, `src/types/database.types.ts`, `scripts/seed-dev.ts`, `src/server/{competencies,distribution-input,finance-settings,ledger,receipts}.ts`, `src/components/finance/` (6 arquivos), `src/app/actions/competencies.ts` e `src/domain/{distribution,compensation,competencies,receipts}/` (com testes). Conferência: `supabase/migrations` lista só as 5 novas e `docs/legado/07-10/supabase/migrations` tem as 7 antigas. `src/domain/shared` ficou ativo (money, percentage, apportion, equal-split e testes).

`tsconfig.json` (`exclude`), `eslint.config.mjs` (`globalIgnores`) e `vitest.config.mts` (`exclude`) ignoram `docs/legado/**`. Prova: `lint`, `typecheck` e `npm test` passam. O `npm test` caiu de 63 para 28 testes porque os 35 testes dos módulos arquivados saíram do caminho ativo; nenhum teste ativo foi removido ou enfraquecido. Nada ativo importa o arquivado (`grep` em `src/` e `scripts/`; `tsc` limpo).

### Rastreabilidade: requisito -> arquivo -> teste -> resultado

| Requisito | Arquivo | Teste (pgTAP, `supabase/tests/database/`) | Resultado |
|---|---|---|---|
| RLS em 100% das tabelas de `public`; `anon` sem tabela, sequência nem função (I-01, CA-05) | `0300`, `0400`, `0500` | `01_catalog` | Passou (34 testes) |
| Sem float, real ou double; sem objetos de 07/10; sem percentual armazenado; toda tabela auditada com `id uuid` (I-17, I-37, CA-11, CA-16, 3.4) | todas | `01_catalog` | Passou. Sanidade: com uma tabela de teste sem RLS e com coluna `real`, 2 testes falharam como esperado; a tabela foi removida e o conjunto voltou a passar |
| `bootstrap_first_admin` e `set_user_access` negados a `authenticated`, `anon` e `service_role`; bucket privado | `0300`, `0400` | `01_catalog` | Passou |
| Matriz de papéis (Administrador, Operador, Visualizador, Sócio, sem papel, inativo): leitura de `partners`, `profiles` (próprio e alheio), `audit_logs`, `proof_files`; escrita negada; Sócio sem acesso a dados (I-06, CA-06, CA-08) | `0300`, `0400`, `0500` | `02_roles_matrix` | Passou (44) |
| Perfil novo sem papel; `PARTNER` exige sócio; um login por sócio; motivo obrigatório (UPDATE e INSERT); `service_role` sem escrita; cascata do Auth; nunca zero Administradores ativos (I-03 a I-05, I-07, I-08, R-D20) | `0300`, `0500` | `03_profiles` | Passou (29) |
| Bootstrap: placeholder e e-mail inexistente rejeitados; idempotente (`ALREADY_ADMIN` sem nova auditoria); só o primeiro; `CREATE`, `UPDATE` e `EVENT BOOTSTRAP_ADMIN` com mesmo `tx_id`, origem `SCRIPT`, motivo e rótulo (CA-15) | `0300` | `04_bootstrap` | Passou (28) |
| Auditoria append-only (`UPDATE`, `DELETE`, `TRUNCATE` bloqueados), `INSERT` direto negado, horário do servidor, `seq`, diff só das colunas alteradas, `raw_extraction` omitido, origem `DIRECT`; criar usuário não sobrescreve o contexto (I-09, I-10, I-10b, R-D22) | `0100`, `0200`, `0300` | `05_audit` | Passou (36) |
| `sha256` único (CA-10); caminho `aaaa/mm/<id>.<ext>` definido pelo banco; `STORED` só com objeto igual; sem exclusão física; exclusão lógica só do Administrador; bucket privado; políticas de `storage.objects` por papel; Sócio, sem papel e `anon` sem leitura (I-12 a I-16, CA-06) | `0400`, `0500` | `06_proof_files_storage` | Passou (49) |
| Seed local com nomes fictícios, sem percentuais, papéis por procedimento com motivo (RAT-D019, RAT-D015) | `supabase/seed.sql`, `scripts/seed-dev.ts`, `scripts/sql/seed-dev-access.sql` | `npm run seed:dev` (2 execuções) e consulta à auditoria | Passou (ver "Comprovações manuais") |
| Login funciona com o schema novo; sem papel, sem perfil ou inativo = sem acesso | `src/server/auth.ts`, `src/app/page.tsx`, `src/app/login/actions.ts` | `loadSession` executada para os cinco usuários do seed e para `anon` (script descartável) | Passou (ver abaixo) |

Total pgTAP: **6 arquivos, 220 testes, PASS.**

### Comandos executados e resultados reais

| Comando | Resultado |
|---|---|
| `npx supabase db reset` (várias vezes, as duas últimas em sequência) | OK: 5 migrations + `seed.sql`, sem erro (idempotência do bucket e do seed, 7.5) |
| `npx supabase db lint` | **No schema errors found** (schemas `extensions`, `private`, `public`) |
| `npx supabase db advisors --local --type all --level info` | 4 avisos **INFO** de desempenho, nenhum WARN ou ERROR: `proof_files_deleted_by_fkey` sem índice (deliberado, `02` 5.1) e 3 índices de `audit_logs` "não usados" (banco vazio; atendem as consultas 8.4) |
| `npx supabase db advisors --local --type security --level warn --fail-on warn` | **No issues found** (exit 0) |
| `npm run db:test` (`supabase test db`) | **PASS: 6 arquivos, 220 testes** |
| `npm run db:types` | OK: `src/types/database.types.ts` regenerado (a CLI sugere `oxfmt`, que não é dependência do projeto; arquivo mantido como gerado) |
| `npm run seed:dev` (2 execuções) | OK e idempotente; papéis: Administrador, Operador, Visualizador, Sócio e um usuário sem papel |
| `npm run lint` | Sem erros nem avisos |
| `npm run typecheck` | Passou (`next typegen && tsc --noEmit`) |
| `npm test` | 2 arquivos, **28 testes** passando (`src/domain/shared`) |
| `npm run build` | **Passou**, Next.js 16.4.2; rotas `/` (Partial Prerender), `/_not-found` e `/login` |

### Comprovações manuais (scripts descartáveis, removidos)

- **Conexão do `db query --local`:** `select current_user, session_user` devolveu `postgres` nos dois (pré-requisito do passo 8 do `02` confirmado).
- **Auditoria do seed** (consulta agrupada em `audit_logs`): 5 `CREATE` de perfil com `source = SYSTEM`, rótulo `supabase-auth` e sem motivo (usuários criados pelo Auth); 3 `CREATE` de sócio e 4 `UPDATE` de perfil com `SCRIPT` e motivo; 4 `EVENT ACCESS_CHANGE` com rótulo `seed-dev`. A segunda execução do `seed:dev` não gerou novas linhas de acesso.
- **Visibilidade pelo RLS (cada usuário do seed, via PostgREST):** Administrador, Operador e Visualizador leem 3 sócios; Sócio e usuário sem papel leem 0.
- **`loadSession`:** Administrador, Operador, Visualizador e Sócio retornam `active` com o papel certo; o Sócio traz `partnerId`; o usuário sem papel retorna `no-access` (`no-role`); sem sessão, `anonymous`.
- **Correlação ponta a ponta** (nota 3.2 do `02`: "confirmar em teste de integração na E4"): `register_proof_file` chamada pelo supabase-js autenticado como Operador, com o cabeçalho `x-correlation-id`. O `ROW_CHANGE CREATE` de `proof_file` saiu com `correlation_id` igual ao enviado, `source = UI`, `request_role = authenticated` e `actor_role = OPERATOR`. O Operador não lê `audit_logs` (lista vazia). Vale para o PostgREST local; não está automatizado (a E5 passa a enviar o cabeçalho; ver 12.4 do `02`).

### Aplicação (item 8, adaptação mínima; o shell é da E5)

- `src/server/auth.ts`: perfil novo (`role` do enum `app_role`, `partner_id`, `active`). Sem perfil, inativo ou `role` nulo = `no-access`, com o motivo (`no-profile`, `inactive`, `no-role`). Não lê mais `indicators`.
- `src/app/page.tsx`: placeholder autenticado, sem dado de negócio, com os quatro papéis. O Sócio vê que o acesso aos dados ainda não foi definido (P-02b).
- `src/app/login/actions.ts`: só a mensagem de erro ("Procure o Administrador.").
- Sem mudança em `app-header.tsx`, `layout.tsx` e `login/page.tsx` (os textos "Ultra Contabilidade" seguem para a E5, SEG-07). Sem dependência npm nova. As APIs do Next usadas são as já presentes no projeto (`Suspense` com `cacheComponents`); não foi introduzida API nova.

### Divergências em relação ao `02`

| # | Onde | Divergência (correção mínima) | Motivo |
|---|---|---|---|
| D-E4-01 | 3.3, `private.assert_admin_remains` | Criada como `SECURITY DEFINER` com `search_path = ''` (o `02` a mostra `SECURITY INVOKER`) | O constraint trigger diferido roda no COMMIT sob o papel de quem apagou o usuário (ex.: `supabase_auth_admin`, na exclusão em cascata pelo Auth), que não tem `SELECT` em `public.profiles`. Sem isto, a exclusão falharia com "permission denied" em vez de aplicar a trava. Só lê e lança erro. Coberto em `03_profiles` |
| D-E4-02 | 3.5, `private.proof_files_before_insert` | Validação explícita do `mime_type` (`check_violation` com mensagem própria) antes de montar o caminho | O `CASE` devolveria caminho nulo e o erro apareceria como violação de NOT NULL em `storage_path`. A constraint `proof_files_mime` continua valendo |
| D-E4-03 | 3.3 e 6 | Função auxiliar nova `private.resolve_user_for_access(text)`, sem `EXECUTE` para `public`, `anon`, `authenticated` e `service_role` | Evita duplicar a busca do usuário e a criação do perfil (passos 4 e 5 do bootstrap) nos dois procedimentos. Mesmas permissões deles |
| D-E4-04 | 3.5, `register_proof_file` | `#variable_conflict use_column` no corpo | As colunas de saída da `table(...)` colidem com as colunas de `proof_files` em plpgsql; a diretiva resolve sem renomear o contrato da RPC |
| D-E4-05 | 3.5 e 3.6 | `grant execute` de `private.proof_upload_allowed` e `private.proof_readable` a `authenticated` (o `02` não lista) | As políticas de `storage.objects` chamam as funções como `authenticated`; sem o EXECUTE a política falharia. São `SECURITY DEFINER`, no schema `private` (fora do PostgREST), e devolvem só booleano |
| D-E4-06 | 3.1 | `grant execute` de `private.normalize_alias` a `authenticated` e `service_role` | A função é avaliada em colunas geradas e índices na escrita da tabela (features futuras); é pura e `IMMUTABLE` |
| D-E4-07 | 6.3 | `seed-dev-access.sql` é **uma única instrução** `select` com quatro chamadas | A CLI 2.120 envia o arquivo como comando preparado e não aceita várias instruções; roda numa transação, Administrador primeiro |
| D-E4-08 | 7.2 passo 8 e 12.1 | Senha dos usuários do seed: sem valor padrão no código; vem de `DEV_SEED_PASSWORD` ou é aleatória e impressa no final | Atende "senhas só locais, fora de documentação versionada". Substitui o padrão fixo que a rodada 2 havia mantido |
| D-E4-09 | 7.2 passo 8 | O seed tem os 3 sócios `Sócio Exemplo A/B/C` com UUIDs fixos; o usuário `PARTNER` do seed é vinculado ao A | Permite testar CA-06 localmente |

### R-D12 (plataforma hospedada)

No banco **local**, o trigger em `auth.users`, a escrita em `storage.buckets` e as políticas em `storage.objects` por migration funcionam (reset e pgTAP verdes). **Não foi possível confirmar no Supabase hospedado**: não há projeto remoto e esta etapa não pode criar um. A confirmação contra o projeto real fica para a E9 (primeira aplicação remota), com a alternativa do `02` (bucket por `config.toml`; perfil sob demanda no bootstrap, que o passo 5 já cobre).

### Pendências e observações

- **Segurança e QA ainda não revisaram a E4.** Pontos para `seguranca`: (1) D-E4-01 (`SECURITY DEFINER` na trava do último Administrador); (2) R-D18 (hash e tipo só garantidos no caminho do route handler, já encaminhado em D-20); (3) `docs/legado/07-10/scripts/seed-dev.ts` mantém o antigo valor fixo da senha **local** de desenvolvimento (arquivo arquivado e nunca executado; o valor já constava do histórico do repositório): decidir se o arquivo deve ser sanitizado. Para `qa`: reexecutar `db reset`, `db:test`, `seed:dev`, `lint`, `typecheck`, `test` e `build`, e conferir a contagem de testes (63 para 28 por arquivamento, não por remoção).
- Fora da E4 (não feito): shell, navegação, tela de login nova e textos da interface (E5); route handler de upload, limite de corpo e proxy (E7, `02` 12.4); `scripts/sql/bootstrap-first-admin.sql` com placeholders (E8, `02` 6.1; a função já existe e está testada); workflow de migrations remotas (E9).
- O teste de correlação via PostgREST é manual; automatizá-lo é da E5/E7.
- `src/types/database.types.ts` está sem formatação (saída bruta da CLI).
- O banco local do Supabase segue em execução (`npm run db:stop` libera a máquina). Nenhum temporário ficou no repositório.

### Handoff

- **`seguranca`:** revisar as migrations `0100` a `0500`, os pontos acima, `scripts/seed-dev.ts` (recusa de alvo não local, senha) e `src/server/auth.ts`.
- **`qa`:** validar a E4 contra os critérios CA-04 a CA-16 aplicáveis ao banco e à retomada do login.
- A E4 só fecha com a E5 e com a revisão de `seguranca` e `qa`.

## E5 — Infraestrutura de aplicação e shell

| Campo | Valor |
|---|---|
| Data | 23/10/2026 |
| Agente | `desenvolvedor` |
| Plano | `01-plano.md` (revisão 7) |
| UI/UX | `03-ui-ux.md` (rodadas 2 e 3; escopo da FND) |
| Banco | Linha de base da E4 (sem migration nova nesta etapa) |
| Branch | `fnd-001/e4-e5` (git operado pelo orquestrador; nenhum comando git de escrita foi executado) |
| Estado | **Implementada e verificada localmente.** Retomada de duas execuções interrompidas: o que já estava no disco foi conferido, os defeitos foram corrigidos e o restante foi feito agora. **Não declara aprovação**: aguarda `seguranca` e `qa` |

Nenhuma dependência npm nova (em `package.json` só mudaram os scripts `dev` e `start`, com `-p 3001`). Nenhum projeto remoto (Supabase, Vercel, GitHub) foi criado ou alterado.

### Rastreabilidade: requisito -> arquivo -> teste -> resultado

| # | Requisito | Arquivos | Teste | Resultado |
|---|---|---|---|---|
| 1 | Variáveis de ambiente validadas com zod, falha clara, sem repetir o valor; a chave secreta nunca é lida no runtime web (fora de `local`, a presença dela é erro); chave publicável não pode ser secreta | `src/lib/env.ts`, `src/lib/env.server.ts`, `src/instrumentation.ts` (valida na subida), `.env.example` | `src/lib/env.test.ts` | Passou |
| 2 | `AppError` + mapeamento de SQLSTATE (23505, 23514, 42501, 22023, P0001) para pt-BR, sem stack para o usuário | `src/lib/errors.ts`, `src/server/auth-errors.ts` | `src/lib/errors.test.ts`, `src/server/auth-errors.test.ts` | Passou |
| 3 | Logger próprio (JSON, `correlation_id` por requisição, redação de segredo, token, CPF e dado bancário) | `src/lib/logger.ts`, `src/lib/correlation.ts`, `src/server/request-context.ts`, `src/lib/supabase/{proxy,server}.ts` (cabeçalho `x-correlation-id` na resposta e ao PostgREST) | `src/lib/logger.test.ts` | Passou. Manual: `x-correlation-id` presente nas respostas HTTP; chega a `audit_logs.correlation_id` (verificado na E4) |
| 4 | Helpers de autorização para UX, com papel e sócio do perfil novo (a segurança real é do RLS) | `src/lib/roles.ts`, `src/server/authorization.ts`, `src/server/auth.ts`, `src/server/session.ts` | `src/server/authorization.test.ts` | Passou |
| 5 | Shell "Financeiro Ultra" (texto, sem "Ultra Contabilidade"), navegação pelos módulos do Brain 05 com "Sócios", placeholders "Em breve", estados de acesso (sem perfil/sem papel/inativo, Sócio sem escopo, sem permissão, erro, carregando), não encontrado, tokens de contraste reforçado | `src/lib/navigation.ts`, `src/components/shell/*`, `src/components/ui/{alert,badge,button,input,sheet,skeleton}.tsx`, `src/app/(app)/**`, `src/app/{not-found,global-error}.tsx`, `src/app/globals.css`, `src/app/layout.tsx` | Smoke HTTP de papéis (menu, estados, 404, `aria-current`, marcos) | 65 verificações OK (abaixo) |
| 6 | Autenticação: login; `/auth/confirm` (token_hash -> sessão com `@supabase/ssr`, só no clique); definir e redefinir senha; recuperação; `?next=` só com caminho interno | `src/app/(public)/{login,recuperar-senha}/**`, `src/app/(auth-flow)/{auth/confirm,definir-senha}/**`, `src/app/actions/{auth,access}.ts`, `src/lib/{safe-redirect,auth-link,password-policy,route-access}.ts`, `src/proxy.ts`, `src/lib/supabase/proxy.ts` | `safe-redirect.test.ts`, `auth-link.test.ts`, `password-policy.test.ts`, `route-access.test.ts`; smoke de redirecionamento; convite e recuperação pelo Mailpit | Passou |
| 7 | Cabeçalhos de segurança (CSP, HSTS só com `APP_ENV=production`, `frame-ancestors`, nosniff, Referrer-Policy) | `src/lib/security-headers.ts`, `next.config.ts` | `src/lib/security-headers.test.ts`; cabeçalhos conferidos numa resposta real do `next start` | Passou |
| 8 | `supabase/config.toml` alinhado à porta real (3001), modelos de e-mail em pt-BR, documentado | `supabase/config.toml`, `supabase/templates/{invite,recovery}.html`, `package.json`, `README.md` | Convite e recuperação reais pelo Mailpit (link na porta 3001) | Passou |
| 9 | Testes de unidade (env, erros, logger, redirecionamento, autorização, cabeçalhos, rotas, link, senha) | 12 arquivos de teste ativos | `npm test` | Ver "Verificação final" |
| 10 | Testes de banco independentes dos dados locais | `supabase/tests/database/03_profiles.test.sql` | `npm run db:test` nos dois cenários | Ver "Verificação final" |

### Defeito corrigido nos testes de banco (`03_profiles.test.sql`)

Depois do `npm run seed:dev`, o banco local tem outro Administrador ativo (o do seed), e a trava do último Administrador (I-08) não disparava: os testes 20, 21, 22 e 29 falhavam. Correção: no início do teste, dentro da transação (desfeita pelo `rollback`), os Administradores preexistentes são inativados com motivo, o mesmo padrão já usado em `04_bootstrap.test.sql`. Os outros cinco arquivos foram revisados pelo mesmo risco e passam nos dois cenários sem alteração (`01` só conta objetos de catálogo; `02`, `05` e `06` usam UUIDs próprios `f1000000-...`/`f2000000-...` ou leem papéis por RLS; `04` já neutralizava o seed).

### Smoke HTTP (Supabase local + `next start`, porta 3001)

Scripts temporários (fora do repositório), com cliente HTTP e jar de cookies, sem navegador. Das 9 falhas da execução anterior, nenhuma era defeito de segurança:

| Caso | Causa | Tratamento |
|---|---|---|
| (a) Login com erro: mensagem fora do HTML visível (4 itens) | **Não é falha da ação.** Num envio **sem JavaScript** a uma rota com Partial Prerender, o Next 16 responde só com o "resume" dinâmico (sem o documento HTML); o estado devolvido pela Server Action só existe no payload RSC (`self.__next_f`). Com JavaScript, o React aplica esse estado em `useActionState`. A mesma tela sem PPR (`/recuperar-senha`) mostra a mensagem no HTML. | Melhoria feita: o formulário do login saiu de dentro do `<Suspense>` (só o aviso e o campo `next` ficam atrás de fronteiras próprias), então o formulário aparece sem esperar `searchParams`. A verificação passou a ler o estado devolvido pela ação (payload). Registrado como D-E5-06. Sem navegador não foi possível conferir a mensagem na tela com JavaScript. |
| (b) Operador em `/configuracoes/usuarios` e Visualizador em `/importar-comprovantes` sem "Sem permissão" | Limitação do script: o texto sai como `Seu papel (<!-- -->Operador<!-- -->)` e a regex que removia comentários HTML estava errada (`[sS]` em vez de `[\s\S]`), deixando "( Operador )". A tela está correta. | Script corrigido. |
| (c) Sócio em `/`, `/recebimentos` e `/configuracoes/socios`: "sem nome de sócio nem dado de negócio" | Limitação do script, com dois falsos positivos: (1) o `<title>` da aba diz "Dashboard · Financeiro Ultra" (rótulo da rota, não é dado); (2) o **nome do próprio usuário** no bloco do usuário é "Sócio Exemplo A" (perfil), igual ao do cadastro de sócio do seed. | Verificação refeita: nenhum outro sócio ("Sócio Exemplo B/C"), nenhum UUID de cadastro de sócio (`a0000000-0000-4000-...`), nenhum campo `partner_id` no HTML nem no payload RSC, e "Dashboard" ausente do corpo. Passou: o papel Sócio fica sem acesso a dados até a P-02b. O layout nem consulta `partners` para o papel Sócio. |

Resultado do smoke de papéis: **65 verificações OK, 0 falhas.** Cobertura: login (senha errada, e-mail inexistente com a mesma mensagem, campos vazios), Administrador (menu completo, "Em breve", `aria-current`, marcos, título, sem "Ultra Contabilidade", sem "Partes"), 404 com sessão (sem shell e sem nome do usuário), `/login` com sessão redireciona, `/auth/confirm` acessível com sessão, Sair, Operador e Visualizador (menu e "Sem permissão"), Sócio e sem vínculo (telas neutras, sem menu), `?next=` (caminho interno vale; `//evil`, `https://`, `/\evil` e `javascript:` caem em `/`), visitante em rota inexistente vai a `/login?next=`, cookie vencido vai a `?aviso=sessao-expirada`.

### Convite completo pelo Mailpit local

Script temporário: convite pela API admin **local** (`inviteUserByEmail`; a chave vem só do `process.env` do script, que recusa alvo não local) -> e-mail lido na API do Mailpit (http://127.0.0.1:54324), assunto "Você foi convidado para o Financeiro Ultra" e link `http://127.0.0.1:3001/auth/confirm?token_hash=...&type=invite` -> abrir o link **duas vezes** (como um verificador de e-mail) sem gastar o token -> clique em "Aceitar convite" (troca por sessão, 303 para `/definir-senha?modo=convite`) -> senha definida (estado "concluído") -> reuso do mesmo link não cria sessão -> login com a nova senha -> "Sem acesso ativo" (usuário sem papel) -> papel atribuído por `private.set_user_access` -> Dashboard como Visualizador. **15 verificações OK.** O usuário e os e-mails de teste foram removidos. A recuperação de senha também foi exercitada (e-mail "Redefinir sua senha do Financeiro Ultra", `type=recovery`, 303 para `/definir-senha?modo=recuperacao`; senha não alterada).

### Divergências e decisões de implementação

| # | Onde | Divergência | Motivo |
|---|---|---|---|
| D-E5-01 | 03, 2.7 e P-10 | "Sem perfil", "sem papel" e "inativo" mostram a mesma tela "Sem acesso ativo" (texto neutro) | Não revelar diferença de configuração; registrada em P-10 do 03 |
| D-E5-02 | Plano, seção 12 | CSP com `script-src 'unsafe-inline'` (sem nonce) | O guia de CSP do Next afirma que nonce é incompatível com Partial Prerender/Cache Components (ver comentário em `security-headers.ts`). Compensações: `object-src 'none'`, `base-uri`, `form-action` e `connect-src` restritos, `frame-ancestors 'none'`. Alternativa futura: `experimental.sri`. Para a `seguranca` avaliar |
| D-E5-03 | 03, 4.8 | `/definir-senha` passa pelo proxy sem sessão; a página mostra "Sessão expirada" com "Solicitar novo link" (UX-11) e a Server Action revalida | Sem isso a pessoa com link vencido cairia no login sem explicação. Nenhum dado é exibido sem sessão |
| D-E5-04 | Plano, seção 6 | O proxy também libera `/recuperar-senha` e `/auth/confirm` (P-11 do 03). Com sessão, `/login` e `/recuperar-senha` voltam a `/`; `/auth/confirm` fica acessível com sessão | Convite e recuperação precisam funcionar com outra sessão aberta no navegador. Lista de rotas públicas para a `seguranca` revisar |
| D-E5-05 | `/auth/confirm` | O token só é trocado no **clique** do botão, não ao abrir a página | Verificadores de link de e-mail abrem a URL e gastariam o token de uso único |
| D-E5-06 | Formulários e JavaScript | Envio de formulário **sem JavaScript** a rota com Partial Prerender (login, `/auth/confirm`, `/definir-senha`) devolve só o "resume" dinâmico; o erro inline depende de JavaScript. O login bem-sucedido sem JavaScript redireciona normalmente (verificado). `/recuperar-senha` é estática e mostra a mensagem no HTML | Comportamento do Next 16 com Cache Components. Sem navegador no ambiente de verificação (Playwright não aprovado), o caminho com JavaScript não foi exercitado visualmente |
| D-E5-07 | RAT-D012 | `src/app/login/{page,actions,login-form}.tsx`, `src/app/page.tsx`, `src/components/app-header.tsx` e `src/lib/supabase/env.ts` foram **substituídos** por equivalentes novos (`(public)/login`, `(app)/page.tsx`, `components/shell`, `lib/env.ts`) | Eram a fundação provisória (login e placeholder da E4 e anteriores). Continuam no histórico do git. Corrigido na rodada de correções: ver QA-LEGADO em "Correções pós-validação (E4/E5)" (as telas antigas já estavam arquivadas em `docs/legado/07-10/`; faltavam as cópias fiéis de `page.tsx`, `login/actions.ts` e `env.ts`) |
| D-E5-08 | Seed | O nome do usuário `PARTNER` do seed (`Sócio Exemplo A`) é igual ao do cadastro de sócio A | Só confunde testes; não alterado (escopo da E4). Sugestão: renomear o usuário para algo como `Usuário Sócio Exemplo` |
| D-E5-09 | E-mail | Os modelos de e-mail só foram exercitados no Mailpit local; expiração do link/OTP e SMTP próprio ficam para a E8/E9 (checklist de painéis) | Plano, E8/E9 |
| D-E5-10 | `src/lib/supabase/server.ts` | `await connection()` no início de `createSupabaseServerClient()` | **Defeito encontrado na verificação final** (o `build` e o smoke passavam): a cada página autenticada o `next start` registrava `Error: Route "/": Next.js encountered the unstable value Date.now() while prerendering`, porque o cliente do Supabase lê o relógio ao ler a sessão e, com Cache Components + Partial Prefetching, o "App Shell" por sessão é pré-renderizado. As respostas saíam corretas, mas o log ficava poluído (76 erros para 35 logins) e houve um `ECONNRESET` isolado no script, não reproduzido. Com `connection()` o trecho passa a depender da requisição real: 0 erros no log após smoke completo, convite e recuperação. Efeito colateral aceito: o App Shell autenticado não é pré-buscado/cacheado por sessão no cliente (também é o comportamento mais conservador). Para a `seguranca` e o `qa` conhecerem |

### Verificação final (resultados reais, 23/10/2026)

| Comando | Resultado |
|---|---|
| `npm run lint` | Passou (sem avisos) |
| `npm run typecheck` | Passou |
| `npm test` | **12 arquivos, 191 testes, passou** |
| `npm run build` | Passou (19 rotas; `/` e demais páginas do sistema em Partial Prerender; `Proxy (Middleware)` ativo) |
| `npx supabase db reset` | Passou (5 migrations + `seed.sql`) |
| `npm run db:test` logo após o `db reset` | **PASS: 6 arquivos, 220 testes** |
| `npm run seed:dev` | Passou (5 usuários fictícios; senha aleatória gerada e não registrada aqui) |
| `npm run db:test` depois do `seed:dev` | **PASS: 6 arquivos, 220 testes** (antes da correção do `03`, falhavam os testes 20, 21, 22 e 29) |
| Smoke de papéis com `next start -p 3001` | **65 OK, 0 falhas** |
| Convite completo pelo Mailpit local | **15 OK, 0 falhas** |
| Recuperação de senha pelo Mailpit local | E-mail recebido; link `type=recovery`; 303 para `/definir-senha?modo=recuperacao` |
| Log do servidor durante o smoke | 0 erros (depois de D-E5-10) |
| Cabeçalhos em resposta real | CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` presentes; HSTS ausente em `APP_ENV=local`, como projetado |

### Pendências e observações

- **Segurança e QA ainda não revisaram a E5.** Pontos para `seguranca`: D-E5-02 (CSP), D-E5-03/04 (rotas liberadas no proxy e `/definir-senha`), D-E5-05, fusão P-10, `?next=` (só GET; revalidado na ação), HSTS só em `APP_ENV=production`, redação do logger e que `SUPABASE_SECRET_KEY` não é lida pela aplicação web.
- Fora da E5 (não feito): módulos de negócio, upload de comprovantes (E7), escopo de dados do Sócio (P-02b), Vercel e Supabase remoto (E8/E9), `experimental.sri`.
- Sem navegador: contraste, foco, leitor de tela, menu móvel e comportamento com JavaScript (D-E5-06) não foram testados visualmente; vale uma passada manual do `qa`.
- ~~`docs/legado/07-10/README.md` não precisou de alteração: a E5 não moveu nada para lá~~ — **afirmação incorreta, corrigida em QA-LEGADO** (a E5 arquivou login, página inicial e `app-header`, e apagou `src/lib/supabase/env.ts` sem cópia). Ver "Correções pós-validação (E4/E5)".
- O Supabase local segue em execução; a porta 3001 ficou livre ao final. Nenhum temporário ficou no repositório.

### Handoff

- **`seguranca`:** revisar os pontos acima, `src/proxy.ts`, `src/lib/supabase/proxy.ts`, `src/app/(auth-flow)/**`, `src/lib/{env,logger,safe-redirect,security-headers}.ts` e `next.config.ts`.
- **`qa`:** validar a E5 contra o `03-ui-ux.md` (estados de acesso, menu por papel, páginas "Em breve", 404, login/convite/recuperação), em navegador real.
- A FND-001 só fecha com a revisão de `seguranca` e `qa`.

## Correções pós-validação (E4/E5)

Rodada de correções dos achados de `seguranca` (SEG-E45-xx) e `qa` (QA-xx) sobre a E4 e a E5. O banco de referência ainda não foi aplicado em nenhum ambiente remoto; por isso as migrations da linha de base foram corrigidas no próprio arquivo (sem migration nova). **Não declaro aprovação:** segurança e QA precisam revalidar esta rodada.

### Itens corrigidos

| Item | O que mudou | Arquivos | Teste / prova | Resultado |
|---|---|---|---|---|
| SEG-E45-01 (médio) | `/definir-senha` (página e Server Action) só aceita sessão aberta por convite ou recuperação: claim `amr` com método `otp` (é o que o GoTrue local grava para `verifyOtp` com `type=invite` e `type=recovery`; `invite` e `recovery` também aceitos por precaução) e horário de até 15 min (tolerância de 60 s de relógio). Fora disso, o estado "expirado" que já existia. Depois de definir a senha: `signOut({ scope: "others" })`. `secure_password_change = true`; o aviso "senha alterada" por e-mail não entra (RAT-D020) | `src/lib/link-session.ts`, `src/app/(auth-flow)/definir-senha/{page,actions}`, `supabase/config.toml` | Vitest `link-session.test.ts` e `supabase-config.test.ts`; prova ao vivo (`seg.cjs`, A1 a A14) | Login comum com senha: a página mostra "expirado" e a action devolve `expired`, senha do usuário inalterada. Convite e recuperação pelo Mailpit continuam funcionando; a outra sessão do usuário é encerrada; `PUT /auth/v1/user` com sessão antiga é recusado (`reauthentication_needed`). 18 OK, 0 falhas |
| SEG-E45-02 (médio) | `over_email_send_rate_limit` (limite por conta) dá a mesma resposta de sucesso, só com log. A mensagem de limite só aparece para limite que vale para qualquer e-mail (`over_request_rate_limit` ou 429 sem código por conta) | `src/server/auth-errors.ts`, `src/app/(public)/recuperar-senha/actions.ts` | Vitest `recuperar-senha/actions.test.ts`; prova ao vivo (E1 e E2): duas solicitações seguidas para e-mail existente e para inexistente | Respostas idênticas (HTTP 200, `status: sent`, nas quatro) |
| SEG-E45-03 (médio, parte agora) | `private.proof_upload_allowed` exige `uploaded_by = auth.uid()` no registro pendente | `supabase/migrations/20261023000400_proof_files.sql` | pgTAP `06_proof_files_storage.test.sql` (Administrador que não é o dono não envia) | PASS |
| SEG-E45-04 (baixo) | `cookieOptions { httpOnly: true, sameSite: "lax", secure fora do local }` em uma fonte única, usada pelo cliente do servidor e pelo proxy | `src/lib/supabase/cookie-options.ts`, `server.ts`, `proxy.ts` | Vitest `cookie-options.test.ts`; `seg.cjs` C1 e C2 | `Set-Cookie: sb-127-auth-token=…; Path=/; …; HttpOnly; SameSite=lax` (sem `Secure` com `APP_ENV=local`). Login, renovação e logout seguem funcionando (smoke de papéis: 65 OK) |
| SEG-E45-06 (baixo) | `APP_ENV` explícita quando `VERCEL` ou `VERCEL_ENV` existir; `APP_ENV=local` com `VERCEL_ENV=production` é recusado. `npm run build` e `next start` locais seguem sem `VERCEL` | `src/lib/env.ts`, `src/lib/env.server.ts` | Vitest `env.test.ts` | Passou; `build` e `next start` locais OK (`.env.local` não foi alterado) |
| SEG-E45-07 (baixo) | `poweredByHeader: false`. A CSP **não** foi alterada (D-E5-02 segue como risco para aceite) | `next.config.ts` | `curl -sI /login` | `X-Powered-By` ausente (0 ocorrências); CSP, nosniff, Referrer-Policy e X-Frame-Options presentes |
| SEG-E45-08 (baixo) | `TRUNCATE` revogado de `anon`, `authenticated` e `service_role` em todas as tabelas de `public` e nos default privileges. `BEFORE TRUNCATE` que bloqueia em `partners`, `profiles` e `proof_files` (`audit_logs` já tinha) | `20261023000300_access.sql`, `20261023000400_proof_files.sql`, `20261023000500_privileges.sql` | pgTAP `01_catalog.test.sql` (nenhuma tabela auditada com TRUNCATE para os três papéis; toda tabela auditada tem o trigger) | PASS |
| SEG-E45-10 (informativo) | Teste garante que o schema `private` não está exposto na API (`[api] schemas` e `extra_search_path`) | `src/lib/supabase-config.test.ts` | Vitest | Passou |
| QA-B1 (defeito real) | `proof_files_deletion_consistency`: com `deletion_reason` NULL, `char_length(btrim(NULL))` virava NULL e o CHECK passava. Agora `coalesce(char_length(btrim(deletion_reason)), 0) > 0`. Revisados **todos** os CHECKs das 5 migrations pelo mesmo padrão: os demais usam colunas `NOT NULL` (`storage_bucket`, `sha256`, `mime_type`, `size_bytes`, `upload_status`, `kind`, `entity`, `action`, `normalized_name`) ou tratam o NULL de propósito (`x is null or …`, `is distinct from`); nenhum outro caso | `20261023000400_proof_files.sql` | pgTAP `06`: exclusão lógica com motivo NULL e sem motivo falham com `23514` | PASS |
| QA-LOG (baixo) | O logger redige texto livre como `password=…`, `token=…`, `access_token=…`, `cookie: sb-…=` e URL com credenciais (`https://usuario:senha@host`), sem dependência nova | `src/lib/logger.ts` | Vitest `logger.test.ts` (inclui texto comum que não deve ser redigido) | Passou |
| QA-UX51 (baixo) | "Esqueci minha senha" e "Voltar para o login" tinham 18 px de altura. Classe única `textLinkClassName`: 44 px no celular e 32 px no desktop (WCAG 2.2, 2.5.8, pede 24 px). Os demais links das telas são botões (`buttonVariants`, 44/36 px) | `src/components/ui/text-link.ts`, `login-form.tsx`, `recovery-form.tsx` | Medição no Chrome headless contra `next start` | 32 px no desktop e 44 px no celular |
| QA-SIDEBAR (baixo) | **Confirmado como real, só com a janela baixa:** a barra vertical de ~15 px reduz a largura útil do menu de 231 para 216 px e os itens "Competências" + "Em breve" precisam de 232 px. Coluna da barra lateral de 16rem para 17rem | `src/components/shell/app-shell.tsx` | Medição no Chrome headless (1280x450): antes, nav 244/240 e 5 elementos largos; depois, nav 256/256 e nenhum | Corrigido (D-E5-11) |
| QA-LEGADO (doc., RAT-D012) | Comparados os 44 arquivos apagados com `docs/legado/07-10/` (hash do HEAD, ignorando fim de linha). Faltavam: `src/lib/supabase/env.ts`; `src/app/page.tsx` original (o arquivado é o placeholder da E4); `src/app/login/actions.ts` original (o arquivado difere em 1 frase). Cópias do HEAD acrescentadas; README do legado e este documento corrigidos | `docs/legado/07-10/src/lib/supabase/env.ts`, `docs/legado/07-10/src/app/page.original-07-10.tsx`, `docs/legado/07-10/src/app/login-actions.original-07-10.ts`, `docs/legado/07-10/README.md` | `git show HEAD:<caminho>` (somente leitura) | Os 44 arquivos apagados têm cópia fiel |

### Verificação (resultados reais, 23/10/2026)

| Comando | Resultado |
|---|---|
| `npm run lint` | Passou (sem avisos) |
| `npm run typecheck` | Passou |
| `npm test` | **16 arquivos, 221 testes, passou** |
| `npm run build` | Passou |
| `npx supabase db reset` | Passou (5 migrations + `seed.sql`) |
| `npm run db:test` após o reset | **PASS: 6 arquivos, 229 testes** |
| `npm run seed:dev` | Passou (5 usuários fictícios; senha aleatória não registrada) |
| `npm run db:test` após o seed | **PASS: 6 arquivos, 229 testes** |
| `npx supabase db lint` | No schema errors found |
| `npx supabase db advisors --local` | No issues found |
| Smoke de papéis (`next start -p 3001`, `smoke-roles.cjs` com `flow.cjs`) | **65 OK, 0 falhas** |
| Prova das correções (`seg.cjs`: cookie, senha por link, recuperação, enumeração) | **18 OK, 0 falhas** |
| Suíte ampliada de convite, recuperação e `/auth/confirm` (`suite2.cjs`) | 42 OK e 4 "falhas" que são do roteiro, não do sistema (K11, K12b, M2, M4): procuram texto visível em envio **sem JavaScript** a rota com Partial Prerender (D-E5-06). O payload mostra `done` e `invalid`; M2 conferido à parte (status `invalid`, nenhum cookie); `/definir-senha` sem sessão mostra "Sessão expirada" (curl). Fica para o `qa` em navegador real |
| Auth local respondeu 429 | Não ocorreu nesta rodada (não foi preciso reiniciar `supabase_auth_financeiro-ultra`) |

### Divergências novas

| # | Onde | Divergência | Motivo |
|---|---|---|---|
| D-E4-10 | 02, `proof_files` e storage | `proof_upload_allowed` também exige `uploaded_by = auth.uid()` | SEG-E45-03: sem isso, qualquer perfil com escrita enviaria arquivo para o registro pendente de outro usuário |
| D-E4-11 | 02, `proof_files_deletion_consistency` | `coalesce` no CHECK do motivo da exclusão lógica | QA-B1: NULL passava no CHECK |
| D-E4-12 | 02, privilégios | `TRUNCATE` revogado de `service_role` e dos default privileges; `BEFORE TRUNCATE` também em `partners`, `profiles` e `proof_files` | SEG-E45-08: TRUNCATE não dispara os triggers de linha (auditoria e bloqueio de DELETE) |
| D-E5-11 | 03, 2.2 | Barra lateral de 272 px (17rem) em vez de 256 px | QA-SIDEBAR: evita rolagem horizontal quando a barra vertical aparece. Para o `design-ui-ux` revisar |
| D-E5-12 | 03, e-mails | **Revertido pela decisão do responsável de 23/10/2026 (RAT-D020, uso interno).** O aviso de senha alterada por e-mail foi desligado em `supabase/config.toml` e o modelo `password_changed.html` foi retirado | SEG-E45-01. `secure_password_change = true` continua |
| D-E5-13 | 03, `/definir-senha` | Link de convite ou recuperação com mais de 15 min desde o clique passa a mostrar "Sessão expirada" mesmo com a sessão ainda válida | SEG-E45-01. O limite de 15 min é proposta; ajustável em `LINK_SESSION_MAX_AGE_SECONDS` |
| D-E5-14 | `src/lib/link-session.ts` | O método `otp` do `amr` também seria gravado por um login por código de e-mail; hoje esse login não existe (só senha). Se for criado, a tela de definir senha precisa distinguir | Registrado para a revisão de segurança de qualquer futuro login por código |

### Pendências (não corrigidas nesta rodada, por decisão do orquestrador)

| Item | Pendência | Etapa |
|---|---|---|
| SEG-E45-03 (resto) | **Pré-requisito bloqueante de qualquer release com upload:** o servidor deve conferir o `sha256` do arquivo enviado (hoje o banco só confere formato e unicidade; o hash vem do cliente) | E7 |
| SEG-E45-05 | Limite por IP e por e-mail e CAPTCHA no login e na recuperação. **Fora do escopo** pela decisão do responsável de 23/10/2026 (RAT-D020, uso interno) | Fora do escopo |
| SEG-E45-09 | Valor fixo antigo da senha local na cópia arquivada (`docs/legado/07-10/scripts/seed-dev.ts`). Depende do responsável | Responsável |
| SEG-E45-11 | Mostrar o e-mail mascarado em `/definir-senha`. **Fora do escopo** pela decisão do responsável de 23/10/2026 (RAT-D020, uso interno) | Fora do escopo |
| D-E5-02 | CSP com `unsafe-inline` (sem nonce). **Fora do escopo** pela decisão do responsável de 23/10/2026 (RAT-D020, uso interno); `unsafe-inline` permanece | Fora do escopo |
| Roteiro `suite2` | Ajustar K11, K12b, M2 e M4 ao payload (ver acima) ou rodar em navegador real | `qa` |

### Handoff

- **`seguranca`:** revalidar SEG-E45-01, 02, 03, 04, 06, 07, 08 e 10 (`link-session.ts` e `definir-senha/actions.ts` em especial).
- **`qa`:** revalidar QA-B1, QA-LOG, QA-UX51, QA-SIDEBAR e QA-LEGADO; refazer convite e recuperação em navegador real.
- A FND-001 só fecha com a revisão de `seguranca` e `qa`.
