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
