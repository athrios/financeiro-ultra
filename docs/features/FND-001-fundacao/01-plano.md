# FND-001 — Fundação do Sistema · Plano técnico

| Campo | Valor |
|---|---|
| Feature | FND-001 — Fundação |
| Agente | `engenheiro-software` |
| Data | 22/10/2026 |
| Status | **APROVADO** pelo responsável em 22/10/2026 ("sim, aprovo"). **Gate G0 aprovado**: P-04b respondida (RAT-D017). Regra de divisão fechada: sempre 1/n (RAT-D015). **Andamento em 23/10/2026:** E0, E2, E3 e E6 concluídas, com a E0 publicada na `main` do repositório privado. E4 e E5 implementadas e validadas na branch `fnd-001/e4-e5`: segurança sem bloqueio e QA aprovado com ressalvas (`05-seguranca.md`, `06-qa.md`). Próximas: E7, E8, E8b, E9, E9b e E10 |
| Fontes lidas | `brain-mensalidades-rateio/` (00 a 13 + README), `.claude/agents/*`, `.claude/docs/*`, código e banco do repositório |
| Revisão 1 (22/10/2026) | P-01 a P-06 respondidas pelo responsável e registradas no Brain como RAT-D010 a RAT-D015. Plano ajustado: empresa única, perfis + login das partes, nome "Financeiro Ultra", GitHub, divisão igualitária por padrão. Ver seção 18 |
| Revisão 2 (22/10/2026) | Esclarecimento da divisão: partes iguais entre as partes indicadas no cliente (5 cadastradas, 3 indicadas → ÷ 3), registrado em RAT-D015. Hospedagem na Vercel + banco Supabase criado pelo responsável (RAT-D016). Ajustadas as seções 1.3, 1.4, 1.5, 2, 7.3, 10, 11, 13 a 19 |
| Revisão 3 (22/10/2026) | Correções de uma revisão independente com verificação adversarial: 21 achados mantidos de 38 e 9 lacunas apontadas pelo crítico. Principais mudanças: duas leituras de RAT-D015 (P-06a); desvio de arredondamento do código atual em valores altos; ordem segura da E0 (Next 16.4.2 antes do primeiro push; Vercel só na E9); pipeline de migrations × deploy da Vercel; aprovação compatível com repositório privado; fluxo de convite e definição de senha; bootstrap do primeiro Administrador; revisão de segurança antes de publicar (E8b); ações do responsável (14.1) |
| Revisão 4 (22/10/2026) | Respostas do responsável: percentual padrão = 1/n ("o da matemática"), com RAT-D004 revogada e leitura B descartada; "Parte" passa a se chamar **Sócio** (RAT-D017); região São Paulo (RAT-D018); dados de teste fictícios (RAT-D019); **plano aprovado** e G0 aprovado |
| Revisão 5 (22/10/2026) | "Sempre 1/n": não haverá divisão própria por cliente, e a P-06a fica encerrada (modo `CUSTOM` descartado). `.acessos/` mantida no projeto e ignorada pelo git por decisão do responsável (R-04 aceito), o que libera o passo 4 da E0. Registro da primeira tentativa de execução, interrompida por falha de rede (seção 14) |
| Revisão 6 (22/10/2026) | Resultado da 2ª execução: E0 (passos 1–3), E6, `02-modelagem-dados.md` e `03-ui-ux.md` entregues e validados com ressalvas. Ajustes: E4 passa a incluir `partners` mínima e o arquivamento de seeds e tipos antigos; rota de exemplo `socios`; build vermelho registrado na E0. Brain com notas de consistência (00, 01, 05, 10; RAT-D015 revoga RAT-D004) |
| Revisão 7 (23/10/2026) | "Pode seguir": E4 e E5 liberadas. Ajuste de sequência: a E4 troca o schema e os tipos, e o código da tela antiga depende do schema velho. Por isso, E4 e E5 rodam em sequência na mesma execução: a E4 arquiva o banco antigo e o código de app que dependia dele (em `docs/legado/07-10/`, excluído de tsc, eslint e vitest) e deixa só o mínimo para compilar; a E5 constrói o shell. Trabalho na branch `fnd-001/e4-e5`. Aceitas pelo responsável, sem objeção: cores com contraste reforçado (acessibilidade) e o nome "Financeiro Ultra" em texto no lugar do logotipo, até haver um definitivo |
| Revisão 8 (23/10/2026) | E4 e E5 executadas e validadas. A segurança não bloqueia: a primeira revisão apontou 12 achados, e os de E4/E5 foram corrigidos. Restam três: SEG-E45-03, pré-requisito da E7; SEG-E45-09, com o responsável; e SEG-E45-12, opcional. O QA aprovou com ressalvas (parte A, 29 de 30 cenários; parte B, 15 de 15). O responsável definiu a postura de uso interno (RAT-D020): sem camadas extras de segurança, e por isso E8b e E9b passam a ser conferências curtas do básico. Registros em `04-implementacao.md`, `05-seguranca.md` e `06-qa.md` |

## Como ler as classificações

- **DECISÃO OFICIAL EXISTENTE** — está em `11-Decisoes.md` (RAT-Dxxx) ou é regra de documento do Brain com `status: ativo` (01, 02, 03, 04, 05, 07, 09). A fonte é sempre citada.
- **PROPOSTA** — recomendação deste plano. Só vira oficial com aprovação do responsável e registro em `11-Decisoes.md`.
- **DECISÃO PENDENTE** — depende do responsável pelo produto.

Documentos do Brain com `status: draft` (06-Dados, 08-Importação, 10-Segurança, 12-Roadmap, 13-Agentes) são tratados como **insumo**, não como decisão. Quando usados, aparecem como "PROPOSTA (Brain, rascunho)".

---

## 1. Estado atual do projeto

### 1.1 Fatos observados

| Item | Estado | Evidência |
|---|---|---|
| Controle de versão | **Inexistente**: o diretório não é um repositório git | `git rev-parse` falha |
| Stack instalada | Next.js 16.4.0 (App Router, Turbopack), React 19.3, TypeScript 5, Tailwind 4, shadcn/ui estilo `base-nova` (Base UI), Supabase (`@supabase/supabase-js` 2.117, `@supabase/ssr` 0.12), Zod 4, Vitest 5, Supabase CLI 2.120 (npm), Node 22.15, Docker | `package.json`, `components.json` |
| Banco | Supabase **local** (Postgres 17): 7 migrations, 12 tabelas, 1 view, 31 políticas RLS, 27 funções (5 RPCs públicas), `seed.sql` | `supabase/migrations/*` |
| Ambiente remoto | Nenhum projeto Supabase para este sistema; nenhum deploy; nenhuma CI | Listagem de projetos da conta em 07/10 |
| Aplicação | `/login`, `/` (tabela de recebimentos por competência), `src/proxy.ts` (sessão), server actions de login, logout e abertura de competência | `src/app/*` |
| Domínio TS | `src/domain/` com `shared` (dinheiro, percentual), `distribution`, `receipts`, `competencies`, `compensation` | `src/domain/*` |
| Testes unitários | 46/46 passando | `npx vitest run` em **22/10** |
| Typecheck | Sem erros | `npx tsc --noEmit` em **22/10** |
| Testes de banco (pgTAP) | 46/46 passando na última execução | `supabase test db` em **07/10**. Não reexecutado hoje: o stack local está parado |
| Verificação ponta a ponta | **Incompleta.** Só foram checados por HTTP o redirecionamento sem sessão (307 → `/login`) e a renderização do login. O fluxo de login pelo navegador foi interrompido em 07/10 | Histórico da sessão de 07/10 |
| Documentação | README padrão do `create-next-app`; sem `CLAUDE.md`; `AGENTS.md` com o aviso do Next 16 | Raiz do projeto |
| Vulnerabilidades | `npm audit` (22/10): 11 achados (1 crítico, 9 altos, 1 moderado). O `next` 16.4.0 tem RCE sem autenticação (GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr) e DoS em Server Actions (GHSA-p3m5-59mp-jv5r), corrigidos na **16.4.2**. O CLI `shadcn` está em `dependencies` de produção | `npm audit --json` |
| Credenciais locais | A pasta `.acessos/` na raiz contém arquivos de credenciais pessoais (não lidos). Está no `.gitignore` e, por decisão do responsável (22/10), permanece no diretório do projeto | `ls`, `.gitignore:44` |
| Ambiente local | A porta 3000 está ocupada por outro processo; o app sobe na 3001 | Log do `next dev` em 07/10 |

### 1.2 Origem do código existente

O código foi implementado em 07/10 a partir de uma especificação enviada no chat ("Financeiro Ultra Contabilidade"), **anterior ao Brain**. Essa especificação usa outro vocabulário (Indicador, Empresa, Sócio) e algumas regras diferentes. O Brain agora é a fonte de verdade (protocolo de orquestração), então o código precisa ser confrontado com ele.

### 1.3 Confronto código × Brain

| # | Tema | Brain (fonte, status) | Código atual | Situação |
|---|---|---|---|---|
| 1 | Vocabulário | Parte, Cliente, Recebedor (02, ativo). No sistema, Parte = **Sócio** (RAT-D017) | `indicators`, `companies`, `receiving_indicator_id` | Divergente; a nova linha de base usa Sócio/Cliente/Recebedor |
| 2 | Recebedor | Entidade própria, permite várias contas/nomes por parte (02, ativo; RAT-D002) | Não existe: o recebedor é o próprio indicador; os aliases ficam presos ao indicador | **Conflito parcial com RAT-D002** |
| 3 | Regra padrão de divisão | 1/n entre os sócios indicados no cliente ("o percentual padrão é o da matemática"); não existe percentual configurado por sócio (RAT-D015; RAT-D004 revogada) | Padrão igualitário (`use_custom_default_percentages = false` na migration). Caminho **opcional** de percentuais globais: com a flag ligada e os percentuais do grupo somando 100%, a divisão deixa de ser igual. O seed de desenvolvimento liga a flag com 50/25/25, e a Padaria (3 indicadores) sai 50/25/25 | Padrão alinhado. O caminho de percentuais globais é **divergente** e fica descartado (rev. 4) |
| 4 | Subconjunto de partes | Partes iguais entre as indicadas, ex.: 5 cadastradas, 3 indicadas → ÷ 3 (RAT-D015); normalização proporcional (RAT-D005) revisada | Percentuais iguais entre os indicadores da empresa (333334/333333/333333 em unidades de 0,0001%), mas o **valor** é rateado a partir desses percentuais arredondados, e não da fração exata 1/3 | **Parcial** (rev. 3): coincide com a divisão exata até cerca de R$ 10 mil por recebimento, depois diverge. Medido no código: R$ 20.000,00 → 6.666,68 / 6.666,66 / 6.666,66; R$ 100.000,00 → diferença de 10 centavos. Vale também a ressalva da linha 3 |
| 5 | Divisão específica por cliente | **Não existe**: sempre 1/n (RAT-D015, fala 4) | Modo `CUSTOM` por empresa (soma exatamente 100%; inválida é bloqueada) | **Divergente**; descartado na nova linha de base (rev. 5) |
| 6 | Divisão igual explícita por cliente | Partes iguais é a regra padrão (RAT-D015) | Modo `EQUAL` | Redundante com a regra padrão; vale a ressalva de arredondamento da linha 4 |
| 7 | Sinal do saldo | `saldo = recebido − devido`; > 0 deve transferir (RN-010, 07) | `saldo = direito − recebido`; > 0 deve receber | **Sinal invertido** |
| 8 | Compensações | Obrigações calculadas que minimizam movimentos (RN-012, 07) | Não são geradas; `settlements` registra transferências livres | Divergente (conceito) |
| 9 | Estados da competência | Aberta, em conferência, apurada, liquidada + reabertura (09, ativo) | `OPEN` / `CLOSED`; sem apuração, liquidação ou reabertura | Divergente |
| 10 | Snapshot do rateio | Por recebimento, imutável (RAT-D006) | `receipt_allocations` imutável, gravado na confirmação | Alinhado |
| 11 | Snapshot da apuração | Salvo na liquidação (09, ativo) | Inexistente | Ausente |
| 12 | Correções | Imutável após liquidação; correção por reabertura auditada (RN-014) | Imutável já na confirmação do recebimento; sem caminho de correção | Mais rígido e sem saída |
| 13 | Duplicidade | Hash, TXID, EndToEnd, autenticação etc. (RN-008) | Sem hash, TXID ou EndToEnd | Ausente |
| 14 | Arquivos de comprovante | `proof_files` separado (06, rascunho) | Colunas dentro de `receipts` | Divergente (rascunho) |
| 15 | Aliases de cliente | `client_aliases` (06, rascunho; 08) | Inexistente | Ausente |
| 16 | Origem do recebimento | "origem" (02, ativo) | Inexistente | Ausente |
| 17 | Data no lançamento manual | Obrigatória (RN-006) | `payment_date` opcional | Divergente |
| 18 | Perfis | Administrador, Operador, Visualizador + login próprio das partes (RAT-D011) | `ADMIN_FINANCEIRO`, `SOCIO` (vinculado a indicador) | Divergente: faltam Operador e Visualizador; o vínculo usuário ↔ parte já tem precedente |
| 19 | Organização dona dos dados | Empresa única no MVP (RAT-D010) | Single-tenant, sem `organization_id` | **Alinhado** (rev. 1) |
| 20 | Auditoria | Obrigatória (RAT-D009, RN-015); reabertura com motivo (09) | Trigger genérico append-only; sem motivo, origem ou correlação | Parcial |
| 21 | Dinheiro | Nunca float; fechamento em centavos; resíduo determinístico **e registrado** (07, ativo) | Centavos inteiros + maior resto determinístico; resíduo não registrado | Parcial |
| 22 | Competência obrigatória | Todo recebimento confirmado pertence a uma competência (RN-002) | Obrigatória em todo recebimento | Alinhado |
| 23 | OCR como sugestão | RAT-D008 | Não implementado; estados de revisão já previstos | Compatível |
| 24 | Split gerencial | RAT-D001, RAT-D007 | Nenhuma movimentação de dinheiro | Alinhado |
| 25 | Valor esperado por competência | Não previsto no Brain | `competency_companies` guarda o valor do mês | Extra — avaliar na feature Competências |

### 1.4 O que é reaproveitável

**Infraestrutura e padrões (reaproveitáveis com baixo risco):**

- configuração do Next 16, proxy de sessão, login por Server Action e `loadSession` (JWT validado + perfil ativo);
- schema `private` com funções `SECURITY DEFINER` e `search_path` vazio, revogação do papel `anon`, padrão de RLS;
- trigger genérico de auditoria append-only;
- conversores estritos `to_money` / `to_percentage`, que rejeitam casas decimais extras em vez de arredondar;
- constraint triggers `DEFERRED` para invariantes de soma;
- primitivas de domínio: dinheiro em centavos, percentual em unidades de 0,0001%, rateio por maior resto com desempate rotativo;
- infraestrutura de testes (Vitest + pgTAP) e seed que passa pelo caminho real (RLS).

**Só como referência (codificam regras divergentes do Brain ou dependem de modelo antigo):**

- `domain/compensation` (sinal invertido);
- `domain/competencies` (mês de referência, status de pagamento do cliente e visão da competência, ligados à tela antiga);
- os estados OPEN/CLOSED, que ficam no banco (enum `competency_status`, checagem em `confirm_receipt`) e em `src/server/competencies.ts`;
- as tabelas de negócio e a tela principal.

**Referência valiosa para a feature Rateio (rev. 3):**

- `domain/distribution` divide igualmente nos **percentuais**, mas o **valor** é rateado a partir do percentual arredondado, e não da fração exata (linha 4 da tabela 1.3).
- O caminho opcional de **percentuais globais** (`use_custom_default_percentages` + `default_percentage`) foi **descartado**: RAT-D004 está revogada e o percentual padrão é 1/n. Ele não entra na nova linha de base.
- O modo `CUSTOM` (divisão própria por empresa) também foi **descartado**: a divisão é sempre 1/n (rev. 5).
- O código é preservado, não removido (RAT-D012).

### 1.5 Inconsistências internas do Brain

- O roadmap (rascunho) coloca a auditoria na Fase 5, mas RAT-D009 a torna obrigatória. A fundação deve incluir a infraestrutura de auditoria.
- `13-Agentes` (rascunho) lista agentes diferentes dos de `.claude/agents/`. Este plano segue `.claude/agents/` e o protocolo.
- RN-005 trata o percentual por cliente como evolução, o 07 (ativo) já o considerava no motor e o 11 o deixava pendente. Depois de RAT-D015 (rev. 5), a divisão é sempre 1/n, sem percentual por cliente: RN-005 está revogada.
- O Brain usa "Parte"; o sistema usará **Sócio** (RAT-D017). A correspondência está anotada em 02-Dominio.
- As revisões de 22/10 (RAT-D015) foram anotadas nos documentos ativos 02, 03, 04 e 07 e no rascunho 06, para que nenhum agente aplique a normalização proporcional antiga. Também foram corrigidos dois links quebrados já existentes em 02-Dominio (para RN-003 e RN-004).

---

## 2. Arquitetura recomendada

**PROPOSTA — monólito modular** sobre a stack já instalada:

```text
Navegador
   │  HTML/RSC + Server Actions (sem acesso direto a tabelas para escrita)
   ▼
Next.js (App Router) — hospedado na Vercel (RAT-D016)
   ├─ src/app ........ rotas finas: guarda de sessão, leitura de params, composição de telas
   ├─ src/server ..... casos de uso: autorização, validação, orquestração, mapeamento de erros
   │                    usa o cliente Supabase com o JWT do usuário (RLS sempre ativo)
   ├─ src/domain ..... regras puras (dinheiro, rateio, competência, compensação), sem I/O
   └─ src/lib ........ supabase, env, logger, erros, formatação
   │
   ▼
Supabase — projeto criado pelo responsável (RAT-D016)
   ├─ Postgres: tabelas, constraints, RLS, RPCs transacionais, triggers de auditoria
   ├─ Auth: e-mail e senha, sem auto-cadastro
   └─ Storage: bucket privado de comprovantes

Futuro (não na FND): processamento assíncrono para importação e OCR
```

Princípios:

| Princípio | Classificação |
|---|---|
| O sistema não movimenta dinheiro; registra, calcula e confirma | DECISÃO OFICIAL EXISTENTE (RAT-D001, RAT-D007) |
| A regra é **decidida** no domínio TS (pura e testável); o banco **verifica** invariantes (soma 100%, soma = valor, imutabilidade, transições), sem recalcular | PROPOSTA (padrão já usado no código) |
| Toda escrita passa pelo servidor com o JWT do usuário; o RLS é a última barreira; na FND a chave secreta não roda no runtime web (uso futuro restrito depende de P-24) | PROPOSTA |
| Transições financeiras (confirmar, apurar, liquidar, reabrir) são **uma RPC transacional** cada, auditada | PROPOSTA |
| Nunca float para dinheiro | DECISÃO OFICIAL EXISTENTE (07) |
| Stack: Next.js + TypeScript + Supabase (PostgreSQL e Auth) + Tailwind CSS + shadcn/ui; aplicação na Vercel | DECISÃO OFICIAL EXISTENTE (RAT-D016, que consolida a instrução de 07/10) |
| Supabase Storage para os comprovantes | PROPOSTA (seção 8) |
| Uma única empresa; sem camada de organização; acesso controlado por perfil | DECISÃO OFICIAL EXISTENTE (RAT-D010) |
| Mecanismo de processamento assíncrono (OCR, importação) | DECISÃO PENDENTE (P-16). A fundação só precisa não impedir: `proof_files.extraction_status` |

---

## 3. Organização de diretórios

**PROPOSTA** — evoluir a estrutura existente (camadas já presentes), organizando cada camada por módulo do Brain:

```text
src/
  app/
    (public)/login/          rotas sem sessão
    (app)/layout.tsx         guarda de sessão + shell com navegação dos módulos (Brain 05)
    (app)/page.tsx           início/dashboard (placeholder na FND)
    (app)/<modulo>/          clientes, socios, competencias, recebimentos... (features futuras)
    api/                     route handlers (upload de comprovantes, integrações futuras)
  server/
    auth/                    sessão, perfil, parte vinculada, autorização
    <modulo>/                casos de uso e consultas (I/O); recebem o cliente Supabase por parâmetro
  domain/
    shared/                  money, percentage, apportion, Result/erros de domínio
    <modulo>/                regras puras por módulo
  components/
    ui/                      shadcn (sem regra de negócio)
    shell/                   layout, navegação, cabeçalho
    <modulo>/                componentes de exibição
  lib/
    supabase/  env.ts  logger.ts  errors.ts  format.ts
  types/database.types.ts    gerado (npm run db:types)
supabase/
  migrations/                forward-only após o primeiro ambiente remoto
  tests/database/            pgTAP por tema: rls, papéis, auditoria, invariantes
  seed.sql                   somente local, dados fictícios
scripts/                     seed-dev e utilitários de desenvolvimento
docs/features/<slug>/        01-plano … 07-relatorio (protocolo)
brain-mensalidades-rateio/   fonte de verdade funcional
```

Convenção de nomes:

- Vocabulário: **DECISÃO OFICIAL EXISTENTE** (RAT-D017). Parte = **Sócio**; Cliente e Recebedor mantidos.
- Banco e código em inglês, interface em português — **PROPOSTA**: `partners` para Sócio (substitui o `parts` do 06-Dados), `clients`, `receivers`, `competences`…
- Os nomes finais ficam com `modelagem-dados`.

---

## 4. Componentes principais

| Componente | Responsabilidade | Entra na FND? | Classificação |
|---|---|---|---|
| Autenticação e sessão | Login, logout, renovação de sessão, guarda de rotas | Sim (já existe; ajustar) | PROPOSTA |
| Organização e vínculos | — | **Não** (empresa única) | DECISÃO OFICIAL EXISTENTE (RAT-D010) |
| Perfis e permissões | Perfil por usuário (Administrador, Operador, Visualizador; papel Sócio para o login dos sócios), vínculo opcional com o cadastro de sócio, matriz de permissões, funções de RLS | Sim | OFICIAL (RAT-D011, RAT-D017) + PROPOSTA (forma) |
| Auditoria | Trilha imutável de eventos sensíveis | Sim | OFICIAL (RAT-D009) + PROPOSTA (forma) |
| Armazenamento de comprovantes | Bucket privado, convenção de caminho, validação e hash | Sim (estrutura, sem tela) | PROPOSTA |
| Erros e validação | `AppError`, mapeamento de erros do banco, Zod nas entradas | Sim | PROPOSTA |
| Observabilidade | Logger estruturado, `correlation_id`, redação de dados sensíveis | Sim | PROPOSTA |
| Primitivas monetárias | Centavos, percentuais, rateio exato por maior resto | Sim (já existem) | OFICIAL (não float) + PROPOSTA (forma) |
| Shell de interface | Layout, navegação, estados vazio/erro/sem permissão | Sim | PROPOSTA (`design-ui-ux`) |
| Cadastros, competências, recebimentos, motor de rateio, apuração, compensações, liquidação, importação, OCR | — | **Não** (features futuras) | FORA DE ESCOPO |

---

## 5. Fronteiras entre frontend, backend e domínio

| Camada | Pode | Não pode |
|---|---|---|
| Componentes (`components/`) | Exibir dados já calculados, formatar | Calcular dinheiro, percentual, saldo ou status financeiro |
| Rotas e Server Actions (`app/`) | Ler a sessão, validar entrada (Zod), chamar caso de uso, revalidar | Conter regra de negócio; acessar a chave secreta (na FND; P-24 decide o futuro) |
| Casos de uso (`server/`) | Autorizar (para UX), orquestrar, chamar RPC/tabelas, mapear erros | Decidir regra financeira (delegam ao domínio) |
| Domínio (`domain/`) | Regras puras e determinísticas | Importar Supabase/Next, ler relógio ou ambiente, usar float para dinheiro |
| Banco | Garantir invariantes, RLS, transições atômicas, auditoria | Confiar em valor calculado pelo cliente sem verificar invariantes |

**Modelo de erros (PROPOSTA):**

- O domínio retorna resultados discriminados com códigos (padrão já usado).
- O caso de uso retorna `{ ok: true, data } | { ok: false, error: { code, message, field? } }`. Erros esperados não viram exceção na interface.
- RPCs levantam erros com SQLSTATE e mensagem em pt-BR. `lib/errors` mapeia `23505`, `23514`, `42501`, `22023` e `P0001` para códigos da aplicação. Erros desconhecidos viram mensagem genérica, com log e `correlation_id`.
- Validação com Zod em toda entrada (formulários, route handlers, scripts). As constraints do banco são a rede de segurança.

---

## 6. Estratégia de autenticação e autorização

| Tema | Proposta | Classificação |
|---|---|---|
| Método | Supabase Auth com e-mail e senha | PROPOSTA (já implementado) |
| Cadastro | Auto-cadastro desligado; contas criadas por convite. Na FND, convite e criação de usuário no ambiente hospedado são feitos pelo **painel do Supabase** (Authentication → Users → Invite). Em seguida, o papel e a parte vinculada são definidos em `profiles` por procedimento documentado e auditado. A tela "Gerenciar usuários" fica fora da FND (P-24) | PROPOSTA |
| Convite e definição de senha | Rota `/auth/confirm` (troca `token_hash` por sessão, com `@supabase/ssr`) + página de definir/redefinir senha, protegida por sessão. Templates de e-mail do Supabase apontando para essa rota | PROPOSTA (E5, E9) |
| Primeiro Administrador no ambiente hospedado | O responsável cria o usuário no painel e executa um script SQL versionado e idempotente que promove esse e-mail a Administrador, com registro na auditoria (`source = script`) | PROPOSTA (E9) |
| Papel | Mora no banco (vínculo/perfil), nunca em `app_metadata`. Lição de 07/10: o GoTrue grava o `app_metadata` depois do INSERT, então o trigger não o enxerga | PROPOSTA |
| Sessão | O proxy renova cookies (checagem otimista); cada página e ação valida com `getClaims()` + perfil ativo; o RLS decide | PROPOSTA (já implementado) |
| Organização | Não há camada de organização: empresa única | DECISÃO OFICIAL EXISTENTE (RAT-D010) |
| Papéis | Administrador, Operador, Visualizador | DECISÃO OFICIAL EXISTENTE (RAT-D011) |
| Login dos sócios | Cada sócio terá login próprio vinculado ao seu cadastro de sócio | DECISÃO OFICIAL EXISTENTE (RAT-D011, RAT-D017) |
| O que o sócio vê e faz | Ainda não definido | DECISÃO PENDENTE (P-02b) |
| Estrutura | `profiles(user_id, role, partner_id NULL, active)`. O sócio entra com um papel próprio **Sócio**, que **nega acesso a dados de negócio por padrão** até P-02b ser definido. Um administrador que também é sócio usa `role = Administrador` + `partner_id` | PROPOSTA |
| Implementação | Funções `private.has_role(roles[])` e `private.current_partner_id()` nas políticas; matriz espelhada em `server/auth/permissions.ts` **só para UX** | PROPOSTA |
| MFA para administradores | TOTP nativo do Supabase | DECISÃO PENDENTE (P-14) — recomendado |
| E-mails de convite e de recuperação | Exigem SMTP próprio configurado no projeto hospedado | Dependência externa (P-25) |

**Matriz inicial.** Os papéis Administrador, Operador e Visualizador são oficiais (RAT-D011). As capacidades seguem a PROPOSTA do Brain (rascunho — 10). São PROPOSTA deste plano, sem respaldo no Brain 10: a coluna **Sócio** (papel do login dos sócios) e as linhas "Gerenciar usuários" e "Ler auditoria". A capacidade "altera percentuais" do Brain 10 não se aplica mais: a divisão é sempre 1/n (RAT-D015).

| Capacidade | Administrador | Operador | Visualizador | Sócio |
|---|:-:|:-:|:-:|:-:|
| Configurar sócios e aliases | ✔ | — | — | — |
| Gerenciar clientes | ✔ | consulta | consulta | P-02b |
| Lançar recebimentos e importar comprovantes | ✔ | ✔ | — | P-02b |
| Revisar reconhecimento | ✔ | ✔ | — | — |
| Apurar, liquidar e reabrir competência | ✔ | — | — | — |
| Gerenciar usuários | ✔ | — | — | — |
| Ler auditoria | ✔ | — | — | — |
| Leitura geral | ✔ | ✔ | ✔ | P-02b (na FND: nenhuma) |

---

## 7. Estratégia de dados

### 7.1 Convenções — PROPOSTA

- Postgres via Supabase; PK `uuid`; `timestamptz` (UTC) com `created_at`/`updated_at`.
- Enums para estados estáveis.
- Dados financeiros nunca são excluídos fisicamente: usar status ou inativação (o Brain fala em ativação/inativação de clientes e partes).

### 7.2 Empresa dona dos dados — DECISÃO OFICIAL EXISTENTE (RAT-D010)

- Empresa única: as tabelas **não** terão `organization_id`; o RLS é por papel (e, para o papel Sócio, pelo sócio vinculado).
- Risco aceito: uma futura evolução para multiempresa exigirá migração planejada (backfill, reescrita de políticas e retestes).
- PROPOSTA para reduzir esse custo sem antecipá-lo: concentrar as checagens de acesso em poucas funções `private.*`, para que uma futura troca de escopo altere funções, não dezenas de políticas.

### 7.3 Valores monetários e percentuais

- **DECISÃO OFICIAL EXISTENTE (07):** nunca float binário; fechamento em centavos; resíduo de arredondamento determinístico **e registrado**.
- **PROPOSTA de implementação** (em grande parte já existe):
  - `numeric(14,2)` no banco;
  - centavos inteiros na aplicação, com `BigInt` nos produtos;
  - texto decimal nas fronteiras (`amount::text`);
  - conversões estritas que rejeitam casas extras;
  - formatação a partir do texto (`Intl` pt-BR).
- **Ponto de atenção — dízimas:** a divisão 1/n (RAT-D015: 2 sócios → 50%, 3 → 33,33…%, 4 → 25%) gera dízimas quando n não divide o valor. Com 3 sócios e um valor ilustrativo de R$ 1.000,00: R$ 1.000,00 ÷ 3 = R$ 333,333…, e as parcelas fecham em R$ 333,34 + R$ 333,33 + R$ 333,33. PROPOSTA:
  - calcular a alocação a partir da **fração exata** (pesos inteiros: 1/1/1 na divisão igual), não do percentual arredondado. Isso corrige o desvio do código atual, que rateia o valor a partir de 33,3334/33,3333/33,3333% e por isso perde a igualdade em valores altos (tabela 1.3, linha 4: R$ 100.000,00 sai com 10 centavos de diferença);
  - fechar valores e percentuais exibidos por maior resto (a soma dá exatamente o total; as parcelas diferem no máximo 1 centavo);
  - desempatar o centavo residual de forma determinística por recebimento (o código atual já faz isso com hash do id), para que ele não favoreça sistematicamente a mesma parte;
  - registrar o resíduo na alocação.
  - A escala do percentual efetivo e a forma do registro do resíduo ficam com `modelagem-dados` (P-17).

### 7.4 Histórico e snapshots

- **DECISÃO OFICIAL EXISTENTE:** snapshot do rateio por recebimento (RAT-D006); snapshot da apuração na liquidação (09).
- **PROPOSTA:** saldos nunca armazenados como fonte da verdade, sempre derivados de lançamentos (ledger). O snapshot de liquidação é a exceção formal, como registro histórico.

### 7.5 Migrations — PROPOSTA

1. Supabase CLI, arquivos versionados em `supabase/migrations/`.
2. Antes de qualquer merge: `supabase db reset` + pgTAP + `supabase db lint` + `supabase db advisors`.
3. **Linha de base única** (DECISÃO OFICIAL EXISTENTE — RAT-D012): como nada foi publicado, o histórico é reescrito **uma vez**, alinhado ao Brain, antes do primeiro ambiente remoto.
   - As 7 migrations atuais e seus testes pgTAP saem de `supabase/migrations/` e `supabase/tests/` e são arquivados como referência fora dos caminhos que o CLI aplica (ex.: `docs/legado/07-10/`).
   - Assim nenhum `db push` aplica o schema de 07/10 no banco hospedado.
4. Depois do primeiro ambiente remoto: forward-only, nunca editar migration aplicada. Mudanças incompatíveis seguem expand/contract; backfills são idempotentes; rollback = nova migration.
5. Aplicação em homologação e produção só por pipeline disparado com aprovação humana (seção 10). Nenhum agente aplica migration de produção sem autorização (regra do protocolo, `.claude/docs/CLAUDE-ORQUESTRACAO.md`). Não usar integrações que apliquem migrations sozinhas (integração GitHub do Supabase / Branching) sem decisão explícita.
6. Tipos TS regenerados a cada migration (`npm run db:types`); a CI falha se estiverem desatualizados.

### 7.6 Seeds — PROPOSTA (já existe)

`seed.sql` somente local. O `seed-dev` recusa URL que não seja local. **DECISÃO OFICIAL EXISTENTE (RAT-D019):** seeds, testes e exemplos usam só nomes fictícios. Hoje os seeds e os testes usam nomes que parecem reais (vindos da especificação de 07/10); a troca é feita na E0, antes do primeiro commit.

### 7.7 Identificadores normalizados — PROPOSTA

- CNPJ, CPF e aliases são normalizados por **uma única função imutável no banco** (fonte única).
- O CNPJ hoje aceita só dígitos e valida o DV. CNPJs **alfanuméricos** são emitidos desde julho/2026 → DECISÃO PENDENTE (P-13).

---

## 8. Estratégia de armazenamento de comprovantes

**PROPOSTA** (formatos: PROPOSTA do Brain, rascunho — 08):

| Aspecto | Proposta |
|---|---|
| Local | Supabase Storage, bucket **privado** `proofs`, sem acesso público |
| Caminho | `{aaaa}/{mm}/{proof_file_id}.{ext}`; nunca o nome original no caminho |
| Metadados | `proof_files` (06, rascunho): `storage_path`, `sha256` (único, para RN-008), `mime_type`, `size_bytes`, `original_name`, `uploaded_by`, `extraction_status`, `raw_extraction` (jsonb), `confidence_score`, `created_at` |
| Upload | Mediado pelo servidor (route handler): valida tamanho, extensão **e** assinatura binária (PDF/JPG/PNG), calcula SHA-256 no servidor, checa duplicidade e grava |
| Limites do Next 16 | Server Actions aceitam 1 MB por padrão (`serverActions.bodySizeLimit`); o proxy armazena até 10 MB (`proxyClientMaxBodySize`). Por isso o upload vai por route handler, com limite explícito |
| Leitura | URL assinada de curta duração, gerada no servidor após checar permissão; políticas em `storage.objects` por papel (a regra para o papel Sócio segue P-02b) |
| Imutabilidade | Sem sobrescrita (`upsert: false`); exclusão apenas lógica |
| Leitura automática (OCR) | Sugestão, nunca verdade absoluta — DECISÃO OFICIAL EXISTENTE (RAT-D008). Provedor: DECISÃO PENDENTE (P-16) |
| Tamanho máximo, retenção (LGPD), antivírus | DECISÃO PENDENTE (P-15) |
| Entrega na FND | Bucket + políticas + convenção + utilitário de validação/hash com testes. **Sem tela de upload** |

---

## 9. Estratégia de auditoria

- **DECISÃO OFICIAL EXISTENTE:** auditoria obrigatória (RAT-D009, RN-015). A reabertura registra usuário, data/hora, motivo, estado anterior e impacto (09). Lista de eventos: PROPOSTA (Brain, rascunho — 10).
- **PROPOSTA:**
  - **Trilha no banco via triggers.** Captura qualquer caminho, inclusive SQL direto. Append-only (UPDATE/DELETE bloqueados), leitura restrita. O padrão já existe.
  - **Campos:** `id`, `actor_user_id`, `actor_role`, `entity`, `entity_id`, `action`, `previous_data`, `new_data` (só o diff em UPDATE), `reason`, `source` (ui/importação/sistema/script), `correlation_id`, `created_at` (relógio do servidor).
  - **Motivo e correlação:** a RPC informa via `set_config('app.audit_reason', …, true)` e o trigger lê. Assim as ações que exigem motivo (reabertura, por exemplo) ficam completas.
  - **Ações semânticas** (OPEN, CONFIRM, CALCULATE, LIQUIDATE, REOPEN…), além de CREATE/UPDATE/DELETE.
  - **Auditoria ≠ log técnico.** A auditoria de negócio fica no banco, imutável e consultável; o log técnico fica na aplicação, com rotação.
  - Encadeamento por hash (evidência de adulteração) e retenção: DECISÃO PENDENTE (P-18).

---

## 10. Ambientes

**DECISÃO OFICIAL EXISTENTE:** repositório no GitHub (RAT-D014); aplicação na Vercel e banco em projeto Supabase criado pelo responsável (RAT-D016).

| Ambiente | Banco | Aplicação | Dados | Quem aplica migrations |
|---|---|---|---|---|
| Local | Supabase CLI + Docker | `next dev` | Seed fictício | Desenvolvedor (`db reset`) |
| Homologação | **Fase 1** (sem dados reais): o próprio projeto Supabase único. **Fase 2** (antes dos dados reais): projeto separado ou outra solução decidida em P-05c2 | Vercel **Preview** (por branch/PR) | Fictícios | Nenhuma migration de PR é aplicada no banco remoto enquanto ele for único |
| Produção | Projeto Supabase criado pelo responsável (RAT-D016) | Vercel **Production** | Reais | Pipeline disparado com aprovação humana |

**Banco único** — PROPOSTA:

- Enquanto não houver dados reais, o projeto criado serve de homologação.
- O Preview só testa código compatível com o schema já aplicado.
- Antes da entrada de dados reais, decidir P-05c2. Do contrário, os deploys de Preview passam a rodar contra dados reais (R-17).

**Região:**

- Supabase em `sa-east-1` (São Paulo) — **DECISÃO OFICIAL EXISTENTE (RAT-D018)**. A região é escolhida na criação do projeto e não muda depois.
- Funções da Vercel em `gru1` (São Paulo), para ficarem perto do banco — PROPOSTA.

**Planos dos serviços** — PROPOSTA, a confirmar por você (P-05c2, R-18):

- Pelos termos da Vercel, o plano Hobby é para uso pessoal e não comercial. Uso por uma empresa pede o plano Pro.
- No Supabase, projetos do plano Free são pausados após inatividade e **não têm backup automático**: backups diários só a partir do Pro, e PITR é um adicional pago. Dados reais só no Pro, ou, se o Free for aceito temporariamente, com rotina agendada de `supabase db dump` e cópia do Storage para fora do Supabase, com teste de restauração documentado.
- A organização Supabase da sua conta já tem 2 projetos (Ambitask e luv-platform). Se ela estiver no plano Free, o limite de projetos gratuitos ativos pode impedir um terceiro.
- Nesta revisão, os planos e limites citados não foram verificados contra as páginas atuais de preços; confirme no momento da contratação.

**Configuração da Vercel e do Supabase hospedado** — PROPOSTA:

- Variáveis por ambiente (Production e Preview): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `APP_ENV`, `LOG_LEVEL`.
- **Não** cadastrar `SUPABASE_SECRET_KEY` na Vercel: na FND o runtime da aplicação não a usa, porque convites e criação de usuários são feitos pelo painel do Supabase (seção 6; P-24 decide o futuro). Se for usada a integração Supabase ↔ Vercel, revisar as variáveis que ela cria e remover chaves secretas e strings de conexão não usadas (R-19).
- Supabase Auth:
  - Site URL = domínio de produção;
  - Redirect URLs = domínio de produção + `https://*-<slug-da-conta-ou-time>.vercel.app/auth/confirm` (curinga restrito ao slug e à rota). **Sem `localhost`** no projeto hospedado: o desenvolvimento usa o Supabase local, cujas URLs ficam no `config.toml`. Nesse arquivo, `site_url` e `additional_redirect_urls` devem usar a porta real do `next dev` (hoje 3001, porque a 3000 está ocupada — R-16). **Proibido** o curinga amplo `https://*.vercel.app/**`, que permitiria a qualquer site hospedado na Vercel receber tokens de convite e de recuperação;
  - templates de e-mail de convite e de recuperação apontando para `/auth/confirm` (seção 6);
  - auto-cadastro desligado. Projetos novos no Supabase vêm com o cadastro aberto, e o `supabase db push` não aplica o `config.toml`. Aplicar a configuração do Auth com `supabase config push` (pelo responsável) ou por checklist no painel, e verificar no CA-15.
- SMTP próprio no Supabase Auth: o envio de e-mail padrão é limitado e voltado a testes. Provedor e domínio: P-25.
- Smoke test do proxy de sessão, do login e do convite no primeiro deploy de Preview. O proxy do Next 16 roda em Node.js, e a Vercel usa o adaptador oficial.
- **Migrations × deploy** — ordem obrigatória:
  1. as migrations rodam só **depois do merge** na branch principal, num workflow do GitHub Actions (`supabase db push`) **disparado manualmente pelo responsável** (`workflow_dispatch`). O repositório deve ser privado, e as regras de aprovação obrigatória dos GitHub Environments não estão disponíveis em repositório privado nos planos Free, Pro e Team. Por isso, a restrição a quem dispara fica no próprio workflow:
     - o job só roda se `github.actor` for o usuário do responsável (`if: github.actor == '<usuario-do-responsavel>'`);
     - permissão de escrita no repositório só para o responsável; tokens de agente, se existirem, com escopo mínimo e sem permissão de Actions;
  2. o deploy de Production na Vercel só acontece **depois** da migration aplicada. Desligar o deploy automático de Production (Ignored Build Step) e publicar pelo mesmo workflow, após o `db push` (deploy hook ou `vercel deploy --prod`);
  3. migrations seguem expand/contract (seção 7.5), para que a versão anterior do código funcione com o schema novo durante a publicação;
  4. nenhuma migration é aplicada direto do computador de desenvolvimento;
  5. não ativar a integração GitHub do Supabase nem o Branching, que aplicam migrations sozinhos.
- **Quem faz o quê na E9:** o responsável age nos painéis (importar o repositório na Vercel, criar o projeto Supabase, cadastrar segredos do GitHub, SMTP, domínio). O agente entrega código, workflow, script de bootstrap e documentação. Se o agente precisar de CLI, os tokens têm escopo mínimo, são fornecidos pelo responsável fora de `.acessos/` e nunca são versionados.

**Variáveis** — PROPOSTA:

| Variável | Escopo | Uso |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Público | Cliente Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Público | Cliente Supabase (com RLS) |
| `SUPABASE_SECRET_KEY` | **Secreto** | Só scripts locais e administração. Na FND, nunca no runtime web e nunca cadastrada na Vercel; uso futuro restrito depende de P-24 |
| `APP_ENV` | Servidor | `local` / `staging` / `production` |
| `LOG_LEVEL` | Servidor | Nível do logger |
| SMTP | Configurado no Supabase, não na app | Convites e recuperação de senha |

Também PROPOSTA:

- validação das variáveis com Zod no boot (falha rápida e clara);
- `.env.example` versionado; `.env*` ignorado (já está);
- backups automáticos em produção (exige plano pago do Supabase — R-18); PITR, se o valor justificar.

---

## 11. Estratégia de testes

| Nível | Ferramenta | Estado | Na FND |
|---|---|---|---|
| Domínio | Vitest | 46 testes | Manter; adicionar testes de propriedade (soma das partes = total; soma dos saldos = 0) — `fast-check`, PROPOSTA |
| Banco | pgTAP (`supabase test db`) | 46 testes | Reorganizar por tema; adicionar matriz dos papéis (incluindo o papel Sócio negado por padrão), políticas de storage e auditoria estendida |
| Integração servidor × banco | Vitest + Supabase local | Inexistente | Criar harness |
| Ponta a ponta | Playwright — PROPOSTA | Inexistente | Smoke: login, guarda, usuário inativo, logout, convite → definir senha (e-mail local pelo Mailpit do Supabase CLI) |
| Estático | ESLint, `tsc`, `supabase db lint`, `db advisors`, `npm audit` | Parcial | Todos na CI |

- **CI** (PROPOSTA): GitHub Actions no repositório do GitHub (RAT-D014): lint → typecheck → unitários → `supabase start` + `db reset` + pgTAP → build → E2E smoke. Publicação: os Previews são gerados pela Vercel a partir do GitHub; a Production só depois da migration aprovada (seção 10).
- **Casos financeiros obrigatórios** (`qa.md` + Brain), para as features que usarem o motor:
  - caso baseado em RAT-D015 (valor ilustrativo): 5 partes cadastradas, 3 indicadas no cliente, R$ 1.000,00 → parcelas de R$ 333,34 + R$ 333,33 + R$ 333,33. A soma é exata, e o resíduo é tratado de forma determinística e registrado (07). A distribuição do centavo residual entre recebimentos é PROPOSTA (seção 7.3) e só vira caso obrigatório se for aprovada;
  - valor alto com 3 partes (ex.: R$ 100.000,00): as parcelas diferem no máximo 1 centavo. Esse caso **falha** no código atual (tabela 1.3, linha 4);
  - partes não indicadas no cliente recebem zero;
  - exemplo de compensações do 07 (A +2.000; B −1.000; C −1.000);
  - 1 parte com 100%;
  - dízimas e centavos;
  - recebedor diferente do beneficiário;
  - soma zero.
- **Regra do protocolo:** testes não são ajustados para passar; o QA é independente do desenvolvedor.

---

## 12. Segurança inicial

| Controle | Estado atual | Ação na FND | Classificação |
|---|---|---|---|
| Atualizar `next` para ≥ 16.4.2 | 16.4.0 com 2 RCE + 1 DoS | **Antes do primeiro push** ao GitHub e de qualquer conexão com a Vercel (E0) | PROPOSTA (urgente) |
| Repositório privado, sem dados pessoais reais versionados | Seeds e testes usam nomes que parecem reais (vindos da especificação de 07/10) | Repositório privado; trocar os nomes por fictícios na E0, antes do primeiro commit | DECISÃO OFICIAL EXISTENTE (RAT-D019) + PROPOSTA (repositório privado) |
| Triagem das demais vulnerabilidades; mover `shadcn` (CLI) para `devDependencies` | Pendente | Triagem documentada | PROPOSTA |
| Pasta `.acessos/` com credenciais pessoais dentro do projeto | Ignorada no git (`.gitignore:44`) e mantida no projeto por decisão do responsável (22/10) | Antes do primeiro commit, confirmar com `git check-ignore` que ela não entra no repositório. Não incluir o diretório em cópias, zips ou compartilhamentos | Risco aceito pelo responsável (R-04) |
| RLS em 100% das tabelas, negar por padrão, sem `anon` | Existe | Manter + testes por papel | PROPOSTA |
| Funções auxiliares `SECURITY DEFINER` no schema `private`, `search_path` vazio | Existe, com uma exceção: `public.confirm_receipt` é `SECURITY DEFINER` exposta a `authenticated`, com checagem interna de papel (`is_admin`), e ignora o RLS de propósito | Manter o padrão. Na nova linha de base, toda RPC pública `SECURITY DEFINER` precisa de justificativa escrita e teste por papel | PROPOSTA |
| Chave secreta fora do runtime web | Existe (só no seed) | Checagem automática na CI (bundle e `server-only`) | PROPOSTA |
| Auto-cadastro desligado | Local (`config.toml`) | Aplicar no projeto hospedado (`supabase config push` ou painel) e verificar com tentativa de cadastro que deve falhar (CA-15) | PROPOSTA |
| Redirect URLs do Auth | — | Curinga restrito ao slug da conta/time na Vercel; nunca `https://*.vercel.app/**` (seção 10) | PROPOSTA |
| Variáveis na Vercel | — | Só variáveis públicas e de configuração; nenhuma chave secreta do Supabase; revisar o que integrações injetam; Preview sem dados reais | PROPOSTA |
| Cabeçalhos (CSP, HSTS, `frame-ancestors`, `nosniff`, Referrer-Policy) | Ausentes | Configurar | PROPOSTA |
| CSRF | Server Actions validam a origem | Route handlers de upload validam sessão + origem | PROPOSTA |
| Upload seguro | Ausente | Conforme seção 8 | PROPOSTA |
| Logs sem segredos e sem dados pessoais (tokens, CPF, dados bancários) | Sem logger | Logger com redação + teste | PROPOSTA |
| LGPD: CPF de partes, dados bancários de recebedores, comprovantes | — | Base legal, retenção, acesso | DECISÃO PENDENTE (P-20) |
| Rate limit de login | Padrão do Supabase | Revisar limites no ambiente hospedado | PROPOSTA |
| MFA para administradores | Ausente | — | DECISÃO PENDENTE (P-14) |
| Princípios do Brain: menor privilégio, trilha imutável, timestamps do servidor, comprovantes protegidos | — | Cobertos nas seções 6, 8 e 9 | PROPOSTA (Brain, rascunho — 10) |

---

## 13. Dependências técnicas

### 13.1 Já instaladas

`next` 16.4.0 (→ 16.4.2), `react`/`react-dom` 19.3, `@supabase/supabase-js` ^2.117, `@supabase/ssr` ^0.12, `zod` ^4.6, `server-only`, shadcn/ui (`@base-ui/react`, `cn`, `class-variance-authority`, `lucide-react`, `tw-animate-css`), `tailwindcss` 4.

Desenvolvimento: `typescript` 5, `eslint` 9, `vitest` 5, `tsx`, `supabase` (CLI) 2.120, `@types/node` 22.

### 13.2 Novas propostas (cada uma exige aprovação)

- `@playwright/test` — E2E smoke.
- `fast-check` — testes de propriedade do dinheiro e do rateio.
- Logger — PROPOSTA: implementação mínima própria sobre `console`, com JSON estruturado e redação; `pino` só se aprovado junto com as demais dependências novas. Definido na E5.
- **Nenhuma** biblioteca de planilha ou OCR entra na FND.

### 13.3 Externas

- Docker Desktop (local).
- Repositório GitHub **privado**, criado por você (RAT-D014).
- Projeto na Vercel conectado ao GitHub (RAT-D016), **só na E9**.
- Projeto Supabase criado por você (RAT-D016), em São Paulo (RAT-D018).
- Provedor de SMTP e domínio (P-25).
- Planos dos serviços (P-05c2, R-18).

### 13.4 De decisão

Ainda bloqueia etapas da FND (seção 18):

- P-25 (provedor de SMTP e domínio) — bloqueia a E9.

P-04b (vocabulário) e P-05c1 (região) foram respondidas em 22/10 (RAT-D017, RAT-D018).

Precisa de resposta antes de entrarem dados reais (não bloqueia a FND):

- P-05c2 (banco de homologação separado e planos).

---

## 14. Sequência incremental de implementação

| Etapa | Objetivo | Responsável | Depende de | Saída |
|---|---|---|---|---|
| **E0** | Higiene e segurança imediata, sem mudança funcional, **nesta ordem**: (1) `next` 16.4.2 e triagem do `npm audit`; `shadcn` → dev; (2) trocar os nomes que parecem reais por fictícios em seeds e testes (RAT-D019); (3) README real; `CLAUDE.md` mesclado a partir de `CLAUDE-ORQUESTRACAO.md`; (4) `git init` + primeiro commit já com o Next corrigido, depois da revisão rápida de segurança e de confirmar com `git check-ignore` que `.acessos/` e `.env*` ficam fora; (5) envio ao repositório GitHub privado que você criar (RAT-D014). A Vercel **não** é conectada nesta etapa. **Execução:** a 1ª tentativa (22/10) foi interrompida por falha de rede e só concluiu o passo 1. A 2ª tentativa concluiu os passos 1–3 (ver `04-implementacao.md`). QA aprovou com ressalvas. A segurança bloqueou o commit até remover os nomes reais do `04-implementacao.md` (feito). O build vermelho, anterior à E0, foi corrigido na rodada 2 (Suspense na tela antiga). **E0 concluída em 22/10/2026:** commit `931e1b9` enviado à branch `main` de `athrios/financeiro-ultra` (privado), após `git check-ignore` e varredura de segredos e nomes | `desenvolvedor` | Passos 1–4: aprovação do plano (**concedida em 22/10**) e `.acessos/` ignorada pelo git (decisão do responsável). Passo 5: URL do repositório | `desenvolvedor` | Passos 1–4: aprovação do plano (**concedida em 22/10**) e `.acessos/` ignorada pelo git (decisão do responsável). Passo 5: URL do repositório | Build e testes verdes |
| **E1** | Gate G0 formal: plano aprovado + P-04b respondida. **Aprovado em 22/10/2026** (RAT-D010 a RAT-D019). P-25 é necessária só para a E9. Regra de divisão fechada: sempre 1/n | Responsável pelo produto | Aprovação do plano | Gate G0 ✔ |
| **E2** | Modelagem da fundação: modelo conceitual **completo** (todas as entidades do Brain, com o vocabulário de RAT-D017, para não criar obstáculos) + DDL **apenas** do transversal (perfis/papéis com vínculo opcional ao Sócio, auditoria estendida, `proof_files`, storage) + plano de linha de base | `modelagem-dados` | E1 | `02-modelagem-dados.md` (G1) |
| **E3** | Especificação do shell: layout, navegação pelos módulos (05), login, estados, padrões de tabela e de valores (Recebido/Devido/Saldo, sinal RN-010) | `design-ui-ux` | E1 (em paralelo a E2) | `03-ui-ux.md` (G2) |
| **E4** | Linha de base do banco (RAT-D012), conforme `02-modelagem-dados.md`:<br>• nova migration base, incluindo uma tabela `partners` **mínima** (id, nome, ativo), necessária para a FK de `profiles.partner_id` (ajuste D-01, aceito pelo planejamento em 22/10);<br>• as 7 migrations antigas, seus testes pgTAP, o `seed.sql`, os tipos gerados e o `scripts/seed-dev.ts` antigos são **movidos** para fora dos caminhos do CLI (ex.: `docs/legado/07-10/`), sem apagar;<br>• novos pgTAP de RLS, papéis e auditoria;<br>• novo seed local **sem** percentuais.<br>Os estados OPEN/CLOSED do banco antigo não entram | `desenvolvedor` | E2 | Banco recriável do zero |
| **E5** | Infraestrutura de aplicação: env validado, `AppError` + mapeador de SQLSTATE, logger com `correlation_id` e redação, helpers de autorização, layout autenticado com navegação (placeholders), rota `/auth/confirm` e página de definir/redefinir senha (seção 6). A tela antiga e os serviços que a alimentam (`src/server/*`, `src/components/finance/*`) saem do caminho ativo e ficam como referência | `desenvolvedor` | E3, E4 | Shell funcional |
| **E6** | Primitivas de domínio: manter dinheiro, percentual e rateio por maior resto, com alocação pela **fração exata** (seção 7.3) e testes de propriedade (incluindo o caso de valor alto da seção 11). `domain/distribution`, `domain/compensation` e `domain/competencies` saem do caminho ativo junto com a tela antiga (E5) e ficam como referência para as features (o caminho de percentuais globais foi descartado — RAT-D004 revogada) | `desenvolvedor` | E1 | Domínio sem regra fora do Brain |
| **E7** | Comprovantes (estrutura): bucket, políticas, validação de arquivo e hash com testes; sem tela | `desenvolvedor` | E4 | Storage seguro testado |
| **E8** | Testes e CI: pipeline completo + Playwright smoke. Também os artefatos do agente para a E9: workflow de migrations × deploy (seção 10), script SQL versionado de bootstrap do primeiro Administrador, checklist de configuração dos painéis. Encerra a implementação (gate G3, registrada em `04-implementacao.md`) | `desenvolvedor` | E0, E5, E6, E7 | CI verde; G3 |
| **E8b** | Revisão de segurança do código, do workflow, do script de bootstrap e do checklist **antes de publicar** (gate G4, parte 1). Desde a revisão 8, é uma conferência curta do básico (RAT-D020) | `seguranca` | E8 | `05-seguranca.md` |
| **E9** | Ambientes (RAT-D016). **Responsável, nos painéis:** criar o projeto Supabase (São Paulo — RAT-D018), importar o repositório na Vercel, variáveis, Redirect URLs, templates de e-mail, SMTP, configuração do Auth, segredos do GitHub. Depois: executar o bootstrap, publicar (Preview e Production, sem dados reais) e fazer o smoke test. **Agente:** apoio e ajustes de documentação | responsável + `desenvolvedor` | E8b; P-25 | URLs de Preview e Production |
| **E9b** | Revisão de segurança da configuração hospedada (gate G4, parte 2): cadastro público, Redirect URLs, variáveis da Vercel, segredos, região, Preview × dados. Feita sobre evidências do checklist. Desde a revisão 8, é uma conferência curta do básico (RAT-D020) | `seguranca` | E9 | Adendo a `05-seguranca.md` |
| **E10** | Validação: QA → correções → revalidação → relatório | `qa`, `relator` | E9b | `06`, `07` |

```text
Aprovação do plano ──┬─► E0 ───────────────────────────────┐ (E8 depende de E0)
                     └─► E1 (G0) ──┬─► E2 ──► E4 ──┬─► E5 ──┼─► E8 (G3) ──► E8b ──► E9 ──► E9b ──► E10
                                   │               └─► E7 ──┤
                                   ├─► E3 ──────────► (E5)  │
                                   └─► E6 ──────────────────┘
```

### 14.1 Ações do responsável, em ordem

1. ~~Aprovar este plano~~ — **feito** (22/10).
2. ~~Responder P-04b, P-05c1 e P-06a~~ — **feito** (RAT-D017, RAT-D018, RAT-D015: sempre 1/n).
3. ~~Pasta `.acessos/`~~ — **decidido**: fica no projeto, ignorada pelo git (R-04 aceito). Libera o passo 4 da E0.
4. ~~Criar o repositório privado~~ — **feito** (`athrios/financeiro-ultra`, privado). Continua valendo: **não importar o repositório na Vercel antes da E9**.
5. ~~Nomes nos seeds~~ — **feito**: fictícios (RAT-D019).
6. Ao criar o projeto Supabase:
   - região **São Paulo (`sa-east-1`)** (RAT-D018), que não muda depois;
   - **não** conectar a integração GitHub do Supabase nem ativar o Branching;
   - plano conforme P-05c2.
7. Escolher o provedor de SMTP e o domínio (P-25) antes da E9.
8. Na E9: executar os passos de painel listados na seção 10 e o script de bootstrap do primeiro Administrador.
9. Antes de dados reais: decidir P-05c2 (homologação separada e planos pagos).

**Depois da FND** — PROPOSTA, alinhada ao roadmap (rascunho):

1. Sócios, recebedores e aliases
2. Clientes (+ importação de planilha)
3. Competências
4. Recebimentos manuais
5. Motor de rateio
6. Apuração e compensações
7. Upload de comprovantes
8. Reconhecimento automático
9. Liquidação e reabertura

**FORA DE ESCOPO da FND:** cadastros funcionais, competências, recebimentos, motor de rateio, apuração, compensações, liquidação, importação de planilha, OCR, dashboards. O modelo conceitual da E2 os contempla; a implementação, não.

---

## 15. Critérios de aceite da FND-001

| ID | Critério verificável |
|---|---|
| CA-01 | Repositório git **privado** com histórico inicial; primeiro commit já com `next` ≥ 16.4.2; `.acessos/` e `.env*` fora do repositório (`git check-ignore`); varredura sem segredos nem dados pessoais reais versionados; seeds e testes só com nomes fictícios (RAT-D019) |
| CA-02 | `next` ≥ 16.4.2; `npm audit --omit=dev` sem crítico ou alto em dependências de runtime (ou aceite de risco formal registrado) |
| CA-03 | `npm run lint`, `typecheck`, `test` e `build` verdes localmente e na CI |
| CA-04 | `supabase db reset` aplica a linha de base do zero sem erro; `db lint` sem erros; `db advisors` sem WARN/ERROR de segurança |
| CA-05 | Teste automatizado confirma RLS em 100% das tabelas de `public`; `anon` sem acesso a tabelas e funções de negócio |
| CA-06 | Usuário com papel **Sócio** autentica, mas não acessa dados de negócio nem arquivos enquanto P-02b não definir o escopo (negar por padrão — pgTAP + teste de storage) |
| CA-07 | Matriz de papéis aprovada coberta por pgTAP (cada papel: permitido e negado) |
| CA-08 | E2E local: login, logout, redirecionamento sem sessão, bloqueio de usuário inativo ou sem vínculo, auto-cadastro desligado, convite → `/auth/confirm` → definir senha, recuperação de senha |
| CA-09 | Operações em tabelas auditadas geram registro com ator, papel, ação, diff, origem, `correlation_id` e horário do servidor; UPDATE/DELETE no log falham; motivo obrigatório testado em ação de exemplo |
| CA-10 | Bucket privado; leitura só por URL assinada gerada no servidor; tipo (assinatura binária), tamanho e SHA-256 testados; o mesmo arquivo enviado duas vezes é detectado |
| CA-11 | Nenhuma coluna monetária ou percentual em float/real/double (teste no catálogo); testes de propriedade: soma das partes = total; divisão igual com parcelas que diferem no máximo 1 centavo, inclusive em valores altos (ex.: R$ 100.000,00 com 3 partes) |
| CA-12 | Variável de ambiente ausente gera erro claro no boot; a chave secreta não aparece no bundle do cliente (checagem na CI) |
| CA-13 | Erros esperados chegam em pt-BR sem stack; inesperados geram log com `correlation_id`; o redator remove segredos e CPF (teste) |
| CA-14 | Shell autenticado com o nome **Financeiro Ultra** (RAT-D013), navegação dos módulos e estados conforme `03-ui-ux.md` |
| CA-15 | Ambiente hospedado:<br>• Vercel conectada ao GitHub e ao projeto Supabase (São Paulo, `sa-east-1` — RAT-D018);<br>• nenhuma chave secreta nas variáveis da Vercel;<br>• migrations só pelo workflow disparado pelo responsável: o workflow checa `github.actor` e só o responsável tem escrita no repositório; deploy de Production depois do `db push`;<br>• cadastro público recusado no projeto hospedado (tentativa de `signUp` com a chave publicável falha);<br>• Redirect URLs sem curinga amplo;<br>• primeiro Administrador criado pelo script de bootstrap, com registro na auditoria;<br>• smoke de login, guarda de rota e convite → definir senha aprovado no Preview |
| CA-16 | Nenhuma regra divergente do Brain em caminho ativo da aplicação. Exemplos: sinal do saldo invertido; estados OPEN/CLOSED; caminho de percentuais globais (descartado — RAT-D004 revogada); modo `CUSTOM` por cliente (descartado — sempre 1/n); seed com 50/25/25; vocabulário antigo "Indicador"/"Empresa" (RAT-D017) |
| CA-17 | README com setup local completo (incluindo a porta do `next dev`); artefatos `02`, `03`, `04`, `05` (com o adendo da E9b), `06` e `07` produzidos; decisões resolvidas registradas em `11-Decisoes.md` |

---

## 16. Riscos

| ID | Risco | Severidade | Mitigação |
|---|---|---|---|
| R-01 | Construir features sobre um modelo divergente do Brain (sinal, recebedor, estados, vocabulário) | Alta | Linha de base (RAT-D012); vocabulário definido (RAT-D017); CA-16 |
| R-02 | `next` 16.4.0 com RCE sem autenticação. Se a Vercel for conectada ao repositório antes da correção, o primeiro push publica a versão vulnerável | **Crítica** se exposto | Correção no primeiro commit (E0); Vercel só na E9 (14.1); CA-01, CA-02 |
| R-03 | Sem controle de versão: perda de trabalho e regressões sem rastreio | Alta | E0 |
| R-04 | Credenciais pessoais (`.acessos/`) dentro do projeto: vazamento por cópia, compactação ou commit acidental | Alta → **aceito pelo responsável** (22/10) | Pasta ignorada pelo git (`.gitignore:44`), checada com `git check-ignore` antes do primeiro commit (CA-01). Recomendação mantida: não copiar nem compactar o diretório do projeto com a pasta dentro |
| R-05 | Futura evolução para multiempresa exigirá migração | Baixa (risco **aceito** — RAT-D010) | Checagens de acesso concentradas em funções `private.*` |
| R-06 | Divisões com dízima (ex.: 3 partes iguais) geram centavos divergentes ou soma ≠ total. O código atual já perde a igualdade em valores altos (tabela 1.3, linha 4) | Média | Fração exata + maior resto com desempate determinístico por recebimento + resíduo registrado + testes de propriedade e de valor alto (CA-11) |
| R-06b | ~~Regra de divisão em aberto~~ — **encerrado** (rev. 5): sempre 1/n, sem percentuais | — | — |
| R-07 | Sinal do saldo invertido entre código e Brain confunde a operação | Média | Adotar RN-010; testes com o exemplo do 07; UI sem depender só de cor |
| R-08 | CNPJ alfanumérico bloqueia o cadastro de clientes novos | Média | P-13 |
| R-09 | Upload grande ou malicioso | Média | Route handler, limites, assinatura binária, bucket privado |
| R-10 | Regra decidida em TS e verificação em SQL divergirem | Média | Banco só verifica invariantes; testes cruzados (integração) |
| R-11 | Escopo da fundação crescer e atrasar a primeira entrega de valor | Média | Critérios fechados; features explicitamente fora |
| R-12 | Next 16 e shadcn `base-nova` diferem do conhecimento comum (APIs novas) | Média | `AGENTS.md`: consultar `node_modules/next/dist/docs/` |
| R-13 | Nenhuma evidência E2E do login pela interface (verificação de 07/10 interrompida) | Média | Smoke Playwright na E8 |
| R-14 | OCR externo e LGPD (comprovantes contêm dados pessoais e bancários) | Média (futuro) | P-16; avaliação de provedor e DPA antes da feature |
| R-15 | Documentos do Brain em rascunho usados como verdade | Média | Tratar como insumo; promover via `11-Decisoes.md` |
| R-16 | Ambiente local depende de Docker e de portas livres. A 3000 está ocupada, então o app sobe na 3001, enquanto o `config.toml` do Supabase local aponta para a 3000, o que quebraria os links de convite locais | Baixa | Fixar a porta do `next dev` no README e alinhar `site_url`/`additional_redirect_urls` do `config.toml` (E5) |
| R-17 | Banco único compartilhado entre Preview e Production: código em teste rodando contra dados reais; migration de PR alterando o banco de produção | Média agora; **Alta** com dados reais | Usar o projeto como homologação até os dados reais; nenhuma migration de PR no banco remoto; decidir P-05c2 antes |
| R-18 | Planos gratuitos em uso comercial: Vercel Hobby (não comercial); Supabase Free (pausa por inatividade, **sem backup automático**) | **Alta** com dados reais | Dados reais só no plano Pro, ou com rotina própria de `db dump` + cópia do Storage e restauração testada (P-05c2) |
| R-20 | Deploy automático da Vercel publicar código antes da migration correspondente | Alta | Deploy de Production pelo workflow, depois do `db push` (seção 10); expand/contract |
| R-21 | Integração GitHub do Supabase ou Branching aplicarem migrations sozinhos, inclusive as antigas de 07/10 | Alta | Não ativar (14.1); migrations antigas fora de `supabase/migrations/` (7.5) |
| R-22 | Configuração do Auth hospedado diferente da local (cadastro aberto, Redirect URLs amplas) | Alta | `supabase config push` ou checklist; verificação no CA-15 |
| R-19 | Integração Supabase ↔ Vercel pode criar variáveis secretas na Vercel | Média | Configurar as variáveis manualmente, ou remover as secretas não usadas; checagem na CI (CA-12, CA-15) |

---

## 17. Decisões já resolvidas pelo Brain

| ID | Decisão | Fonte | Impacto na fundação |
|---|---|---|---|
| RAT-D001 | Split gerencial pós-recebimento; o sistema não movimenta dinheiro | 11 | Nenhuma integração de pagamento na arquitetura |
| RAT-D002 | Pagador, recebedor e beneficiário econômico separados | 11; RN-001 | O modelo conceitual (E2) traz recebedor como entidade própria |
| RAT-D003 | Competência é a unidade de fechamento | 11 | Escopo de apuração e liquidação por competência |
| RAT-D004 | Partes com percentual padrão global — **revogada** (22/10) por RAT-D015: o percentual padrão é 1/n | 11; RN-003 | Sem `default_percentage` na nova linha de base |
| RAT-D005 | Cliente define as partes participantes; a normalização proporcional foi **revisada** por RAT-D015 | 11; RN-004 | Vale a participação por cliente; a normalização deixa de ser o padrão |
| RAT-D006 | Snapshot do rateio em `receipt_allocations` | 11 | Padrão de imutabilidade e auditoria |
| RAT-D007 | Transferências externas; o admin confirma a liquidação | 11 | Nenhuma integração bancária |
| RAT-D008 | Reconhecimento assistido; ambíguo → revisão humana | 11; 08 | `proof_files` com status e confiança |
| RAT-D009 | Auditoria obrigatória | 11; RN-015 | Infra de auditoria na fundação (seção 9) |
| RAT-D010 | Empresa única no MVP; sem multiorganização | 11 (22/10) | Sem `organization_id`; RLS por papel |
| RAT-D011 | Perfis Administrador, Operador e Visualizador; sócios com login próprio vinculado ao seu cadastro de sócio | 11 (22/10) | `profiles.role` + `partner_id` opcional; papel Sócio (PROPOSTA) negado por padrão até P-02b |
| RAT-D012 | Nova linha de base técnica, reaproveitando a infraestrutura; nada removido sem aprovação | 11 (22/10) | E4 e E6 |
| RAT-D013 | Nome do produto: **Financeiro Ultra** | 11 (22/10) | Shell, títulos e metadados |
| RAT-D014 | Repositório no GitHub, criado pelo responsável | 11 (22/10) | E0 e CI |
| RAT-D015 | Divisão **sempre** 1/n entre os sócios indicados no cliente (2 → 50%, 3 → 33,33…%, 4 → 25%); sem percentual configurado, sem divisão própria por cliente, sem normalização | 11 (22/10) | Feature Rateio; primitivas de rateio exato pela fração, com fechamento em centavos (E6) |
| RAT-D016 | Aplicação na Vercel; banco em projeto Supabase criado pelo responsável; stack de 07/10 consolidada (Next.js, TypeScript, Supabase PostgreSQL/Auth, Tailwind, shadcn/ui). O Storage é proposta do plano | 11 (22/10) | Seção 10; E9 |
| RAT-D017 | Vocabulário: Parte = **Sócio**; Cliente, Recebedor e demais termos do Brain mantidos; nada de "Indicador"/"Empresa" | 11 (22/10) | Interface, código e banco (E2, E3, E5) |
| RAT-D018 | Projeto Supabase em São Paulo (`sa-east-1`) | 11 (22/10) | Criação do projeto; E9 |
| RAT-D019 | Seeds, testes e exemplos só com nomes fictícios | 11 (22/10) | E0 (antes do primeiro commit); CA-01 |
| RN-002 | Recebimento confirmado pertence a uma competência | 03 (ativo) | Constraint futura |
| RN-008 | Duplicidade por hash, TXID, EndToEnd… | 03 (ativo) | `sha256` único em `proof_files` |
| RN-010 / RN-011 | `saldo = recebido − devido`; soma dos saldos = 0 | 03, 07 (ativos) | Convenção de sinal única em todo o sistema |
| RN-014 | Imutabilidade pós-liquidação; correção por reabertura auditada | 03 (ativo) | Auditoria com motivo; transições por RPC |
| 07 | Nunca float; fechamento em centavos; resíduo determinístico e registrado | 07 (ativo) | Seção 7.3 |
| 09 | Estados aberta → em conferência → apurada → liquidada; reabertura só pelo administrador; snapshot na liquidação | 09 (ativo) | Modelo conceitual (E2) |

---

## 18. Decisões ainda pendentes

### Respondidas em 22/10/2026 (rev. 1, 2 e 4)

| ID | Pergunta | Resposta do responsável | Registro |
|---|---|---|---|
| P-06a (parte 1) | "Se as partes A, B e C têm percentual padrão 50/25/25 e o cliente indica as três, a divisão é 50/25/25 ou 1/3 para cada?" | "O percentual padrão é o da matemática. Se em um cliente tiverem 2 partes indicadas, então será dividido por 2, ou seja, 50% pra cada; se em outro cliente forem indicados 3 partes, então dividido por 3, 33% pra cada; se em outro cliente forem indicados 4 partes, então 25% pra cada" | RAT-D015 (1/n); RAT-D004 revogada |
| P-06a (restante) | "O administrador poderá definir, para um cliente específico, uma divisão diferente da igual (ex.: 70% / 30%)? Ou é sempre 1/n?" | "Sempre 1/n" | RAT-D015 (regra final); modo `CUSTOM` descartado |
| — | Pasta `.acessos/` | "Incluí .acessos/ em gitignore" (mantida no projeto) | R-04 aceito; libera o passo 4 da E0 |
| P-04b | Vocabulário do sistema | "Parte deve ser chamado de Sócio, os demais pode manter" | RAT-D017 |
| P-05c1 | Região do Supabase | "São Paulo" | RAT-D018 |
| — | Nomes reais nos seeds/testes? (14.1, item 5) | "Nomes fictícios para teste" | RAT-D019 |
| — | Aprovação do plano | "Sim, aprovo" | Cabeçalho deste plano; G0 aprovado |
| P-05b | Hospedagem e banco (pergunta feita: "onde hospedar a aplicação") | "Vou hospedar na Vercel e criar um banco no Supabase" | RAT-D016 |
| P-06b | Pergunta feita: "Os valores específicos da divisão são preenchidos por cliente, uma vez para cada parte valendo para todos os clientes, ou nos dois níveis?" | "Na verdade a lógica de divisão estabelecida antes está correta. Deve ser feita por partes iguais. Se de 5 partes cadastradas apenas 3 forem indicadas no cliente, então o valor daquele cliente será dividido por 3, uma parte igual para cada parte." Não respondeu ao nível de preenchimento; firmou a divisão igual entre as partes indicadas | RAT-D015. Superada pela P-06a: não há valores específicos |
| P-06c | Pergunta feita: "Os valores preenchidos precisam somar exatamente 100%?" | Sem resposta direta | Sem objeto: não há valores preenchidos (sempre 1/n) |
| P-01 | Multiorganização no MVP? | "Apenas uma empresa" | RAT-D010 |
| P-02 | Papéis do Brain? Partes com login próprio? | "Sim" | RAT-D011 |
| P-03 | O que fazer com o código existente? | "Ok" para a linha de base nova reaproveitando a infraestrutura | RAT-D012 |
| P-04 | Nome do produto | "Financeiro Ultra" | RAT-D013 |
| P-05 | Repositório git | "Vou criar o repositório no GitHub" | RAT-D014 |
| P-06 | Regra de divisão | "A divisão é igualitária caso o admin não preencha com valores específicos a divisão entre as partes" | RAT-D015 (revisa RAT-D005; RAT-D004 revogada na rev. 4) |

### Ainda bloqueiam etapas da FND

| ID | Pergunta | Recomendação (PROPOSTA) | Bloqueia |
|---|---|---|---|
| P-25 | Provedor de SMTP para o Supabase Auth e domínio da aplicação | A escolher por você (ex.: provedor transacional com domínio próprio verificado) | E9 |

### Detalhes das decisões novas (não bloqueiam a FND)

| ID | Pergunta | Recomendação (PROPOSTA) | Bloqueia |
|---|---|---|---|
| P-02b | O que o sócio vê e faz com o login próprio? (ex.: só os clientes de que participa e o próprio saldo; enviar comprovantes?) | Negar tudo na FND; definir na primeira feature voltada aos sócios | Feature de acesso dos sócios |
| P-05c2 | Banco de homologação separado e planos (Vercel e Supabase) antes dos dados reais | Projeto Supabase separado para homologação; Vercel Pro e Supabase Pro em produção (backups) | Entrada de dados reais |
| P-24 | Gestão de usuários pela aplicação (exige a chave secreta no servidor) ou pelo painel do Supabase? | FND: painel do Supabase. Na feature de usuários: chave secreta só no ambiente Production da Vercel, em módulo `server-only` restrito ao Administrador e auditado, ou manter o painel | Feature de gestão de usuários |

### Bloqueiam features futuras (não a FND)

| ID | Pergunta | Recomendação (PROPOSTA) |
|---|---|---|
| P-07 | (Respondida pela P-06a: não há percentual específico por cliente — sempre 1/n) | — |
| P-08 | Recebedor é sempre um Sócio (Parte, no Brain) ou pode haver intermediário? (Brain 11) | Modelar `receivers` com `partner_id` opcional; regra decidida na feature |
| P-09 | Recebimento parcial é permitido? (Brain 11) | Decidir antes da feature Recebimentos (o código atual já supõe "Parcial") |
| P-10 | Mais de uma mensalidade por cliente na mesma competência? (Brain 11) | Decidir antes de Competências |
| P-11 | Estorno é permitido? (Brain 11) | Se sim, como lançamento compensatório, nunca como edição |
| P-12 | Data de vencimento por cliente? (Brain 11) | Decidir antes de Competências |
| P-13 | Aceitar CNPJ alfanumérico (emitido desde jul/2026)? | Sim: normalizar para maiúsculas alfanuméricas e validar o DV no novo padrão |
| P-14 | MFA para administradores? | Sim (TOTP) |
| P-15 | Comprovantes: tamanho máximo, retenção, antivírus | 10 MB; retenção definida com o jurídico; antivírus antes da produção |
| P-16 | Provedor de OCR e mecanismo assíncrono | Decidir na feature, com avaliação LGPD |
| P-17 | Forma de registrar o resíduo de arredondamento (07) | Campo de ajuste na alocação |
| P-18 | Auditoria: quem lê, retenção, encadeamento por hash | Leitura só pelo administrador; retenção ≥ 5 anos (a validar) |
| P-19 | Fuso oficial da competência | `America/Sao_Paulo` |
| P-20 | LGPD: base legal e retenção de CPF, dados bancários e comprovantes | Definir com o jurídico antes da produção |
| P-21 | Transições "em conferência" e reabertura: quem move, pré-condições além do 09 | Detalhar na feature Competências |
| P-22 | Compensações: critério de minimização e desempate (RN-012); liquidação parcial de uma compensação | Detalhar na feature Apuração |

---

## 19. Handoffs

### `modelagem-dados` (após E1; gate G1)

- **Entrada:** este plano; Brain 02, 03, 06, 07, 09, 10, 11; migrations atuais como referência (padrões de RLS, auditoria, conversores estritos, constraints `DEFERRED`).
- **Entregar** `02-modelagem-dados.md` com:
  - modelo conceitual completo (todas as entidades do Brain, com cardinalidades);
  - DDL da fundação: perfis (Administrador, Operador, Visualizador, Sócio) com `partner_id` opcional, auditoria estendida, `proof_files`, storage — **sem** `organization_id` (RAT-D010);
  - contrato do script de bootstrap do primeiro Administrador (idempotente e auditado);
  - plano da linha de base (RAT-D012), com as migrations antigas arquivadas fora de `supabase/migrations/`;
  - invariantes;
  - escala do percentual efetivo e registro do resíduo (P-17);
  - nomes finais (vocabulário de RAT-D017: Sócio, Cliente, Recebedor…);
  - consultas críticas (ledger, saldo por parte).
- **Focos:**
  - parte ↔ recebedor (P-08);
  - usuário ↔ parte (RAT-D011);
  - aliases tipados (cliente e parte);
  - unicidade de hash;
  - estados e transições da competência;
  - snapshot da apuração;
  - regra padrão de RAT-D015 (partes iguais entre as partes indicadas no cliente, com alocação pela fração exata);
  - nenhum percentual armazenado: sem percentual padrão por sócio (RAT-D004 revogada) e sem divisão própria por cliente (RAT-D015: sempre 1/n). A FND não tem DDL de rateio.

### `design-ui-ux` (em paralelo a E2; gate G2)

- **Entrada:** este plano; Brain 01, 04, 05; componentes existentes (shadcn `base-nova`).
- **Entregar** `03-ui-ux.md` com:
  - shell com o nome **Financeiro Ultra** (RAT-D013) e navegação pelos módulos;
  - login, aceite de convite / definir senha e recuperação de senha;
  - vocabulário de RAT-D017 na interface (Sócio, Cliente, Recebedor…);
  - estados: vazio, carregando, erro, sem permissão, sem vínculo, usuário Sócio ainda sem escopo (P-02b);
  - padrão de tabela financeira;
  - apresentação de Recebido / Devido / Saldo e do sinal (RN-010) **sem depender só de cor**;
  - padrão de confirmação para ações irreversíveis;
  - responsividade e acessibilidade.

### `desenvolvedor` (E0 após aprovação do plano; E6 após E1; E4 e E7 após G1; E5 e E8 após G1 e G2; apoio à E9 após E8b)

- **Executar** as etapas da seção 14 com rastreabilidade requisito → arquivo → teste → resultado.
- **Registrar** em `04-implementacao.md`.
- **Na E0:** seguir a ordem da tabela — Next corrigido antes do primeiro commit; nada de Vercel.
- **Na E8:** entregar também os artefatos da E9: workflow de migrations × deploy (com checagem de `github.actor`), script de bootstrap e checklist. Eles passam pela E8b antes de qualquer publicação. Os passos de painel da E9 são do responsável (seção 10).
- **Não** aplicar migration remota sem autorização; **não** apagar o código atual (RAT-D012: preservar como referência); **não** autoaprovar.

### `seguranca` (gate G4 em duas partes: E8b, sobre código, workflow e scripts, antes da E9; E9b, sobre a configuração hospedada, depois da E9 e antes de dados reais)

- **Entregar** `05-seguranca.md`.
- **Focos:**
  - vulnerabilidades de dependências (`next`);
  - RLS por papel, incluindo o papel Sócio negado por padrão;
  - funções `SECURITY DEFINER`, incluindo RPCs públicas (a referência antiga `confirm_receipt` e as que a substituírem);
  - workflow de migrations × deploy, segredos do GitHub, repositório privado;
  - configuração do Auth hospedado: cadastro público, Redirect URLs (curinga restrito), templates, `/auth/confirm`;
  - políticas de storage e URLs assinadas;
  - validação de upload;
  - segredos (`.acessos/`, env, bundle, variáveis da Vercel e o que integrações injetam);
  - Preview da Vercel × dados reais (R-17);
  - cabeçalhos;
  - logs e LGPD;
  - configuração do Auth (auto-cadastro, MFA, rate limit).
- A triagem da E0 (dependências) pode ter uma revisão rápida antecipada.

### `qa` (E10: após E9b; gate G5)

- **Entregar** `06-qa.md` com a matriz baseada em CA-01 a CA-17.
- **Cobrir:**
  - regressão do login, convite → definir senha e recuperação de senha;
  - bordas de dinheiro e percentual (incluindo o caso ÷ 3 de RAT-D015 e o de valor alto);
  - ambiente hospedado (CA-15);
  - papéis permitido/negado (incluindo o papel Sócio sem acesso);
  - imutabilidade da auditoria;
  - comprovante duplicado;
  - banco recriado do zero.

### `relator` (final; G6)

- **Entregar** `07-relatorio.md` em linguagem de produto, só com o estado real.
