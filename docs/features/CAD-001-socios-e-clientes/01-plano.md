# CAD-001 — Sócios, Recebedores e Clientes · Plano técnico

| Campo | Valor |
|---|---|
| Feature | CAD-001 — Sócios e Clientes (cadastros da Fase 1 do `12-Roadmap.md`), com os Recebedores incluídos na revisão 2 |
| Agente | `engenheiro-software` |
| Data | 25/11/2026 (revisão 4: 27/11/2026) |
| Revisão | 4 |
| Status | **APROVADO. G0 aprovado em 25/11/2026** pelo responsável (respostas coletadas pelo orquestrador). Revisão 4 só registra decisões do responsável tomadas na validação (26 e 27/11/2026); escopo inalterado. Sem decisão pendente que bloqueie esta feature |
| Branch | `cad-001/socios-clientes`, criada a partir de `fnd-001/e9` |
| Fontes lidas | Brain `00`, `02`, `03`, `04` (Fluxos 1 e 2), `05`, `06`, `08`, `10`, `11`, `12`; FND-001 `01-plano.md` (seções 6, 7, 9, 11, 14, 18 e 19), `02-modelagem-dados.md` (2.1 a 2.5, 4.2, 5.2, 12.6, 13), `03-ui-ux.md` (2.3, 2.9, 5.1 a 5.3, 9.4/U-01); migrations `20261023000100` a `20261023000500`; `supabase/tests/database/*`; `src/lib/*`, `src/server/authorization.ts`, `src/lib/navigation.ts`; páginas placeholder; `src/app/(auth-flow)/definir-senha/actions.ts`; `docs/legado/07-10/` (só referência); docs do Next 16.4.6 em `node_modules/next/dist/docs/` (seção 4.5) |
| Revisão 1 (25/11/2026) | Primeira versão, com 8 perguntas para o G0 |
| Revisão 2 (25/11/2026) | Respostas do responsável (coletadas pelo orquestrador): **recebedores entram** (P-08: o recebedor está sempre ligado a um sócio); CNPJ nos dois formatos (P-13); **cliente pessoa física (CPF) ou empresa (CNPJ)**; **documento do cliente opcional**, sem repetição quando informado; sócio indicado em cliente ativo não é inativado; cliente ativo nunca fica sem sócio; mensalidade obrigatória; troca de sócios vale a partir de agora; sócio sem documento. O orquestrador registra as respostas no Brain como RAT-D023, RAT-D024 e RAT-D025. Ajustados escopo, regras, matriz, auditoria, etapas, critérios, riscos e decisões |
| Revisão 3 (25/11/2026) | **Plano aprovado e G0 aprovado.** PEND-1: o recebedor guarda o nome do titular (obrigatório) e, se houver, as variações do nome, a chave Pix e banco/agência/conta; o **documento do titular não é guardado** (RAT-D023). PEND-2: inativar o sócio inativa junto os recebedores ativos dele, com lista e confirmação (RAT-D025). R-S04b aprovada: antes de inativar, o sócio sai de todos os clientes, ativos e inativos (RAT-D025). Ajustados R-R04, R-R06, R-S04b, 4.2, 4.7, 7, 8, 9, 10, 11, 12 e 13. Escopo inalterado |
| Revisão 4 (27/11/2026) | Decisões do responsável na validação (E9/E10), sem mudar o escopo. **Limites de itens ativos por cadastro** (RAT-D026; fecha o QA-CAD-07 como regra de negócio): nova R-G09 e novo CA-26. **Busca de documento em Clientes pelo começo do número** (27/11/2026; fecha o QA-CAD-08): R-C17 e CA-19 ajustado. **Tipo do cliente só "CPF" ou "CNPJ"** (26/11/2026, complemento da RAT-D017; fecha o QA-CAD-02): R-C02b ajustada. Ajustados também 9 (nova 9.4), 11 (R-15), 12 e 13 |

## Como ler as classificações

Mesmo critério do plano da FND-001:

- **DECISÃO OFICIAL**: está em `11-Decisoes.md` (RAT-Dxxx), em documento do Brain com `status: ativo` (01, 02, 03, 04, 05, 07, 09) ou foi respondida pelo responsável no G0 desta feature ("responsável, 25/11/2026, G0 da CAD-001"). A fonte é citada. As RAT-D023 a RAT-D025 foram atribuídas pelo orquestrador, que as registra no Brain.
- **PROPOSTA**: recomendação deste plano. Só vira oficial com aprovação do responsável. Quando já foi aprovada no plano da FND-001, isso é dito.
- **DECISÃO PENDENTE**: depende do responsável. As que restam estão na seção 9.

Documentos do Brain em rascunho (`06`, `08`, `10`, `12`) são insumo, não decisão.

---

## 1. Objetivo

Permitir que o Administrador mantenha, dentro do sistema, os cadastros de que todo o resto depende:

- **Sócios** (a "Parte" do Brain, RAT-D017): cadastrar, editar, inativar, reativar e registrar apelidos usados no reconhecimento de comprovantes.
- **Recebedores** de cada sócio, isto é, as contas, nomes bancários e titulares pelos quais o dinheiro de um sócio chega. Têm identificadores para reconhecer o favorecido do comprovante.
- **Clientes** (pessoa física com CPF ou empresa com CNPJ): cadastrar manualmente, editar, inativar e reativar; informar o documento (opcional), o valor da mensalidade, os **sócios indicados** (a divisão será sempre 1/n entre eles, RAT-D015) e os apelidos.

Operador e Visualizador passam a consultar os clientes. Nada é calculado nem movimentado nesta feature: ela só prepara os dados que as features de Competências, Recebimentos e Rateio vão usar.

---

## 2. Estado atual (fatos observados)

| Item | Evidência | Situação |
|---|---|---|
| Tabela `partners` mínima | `supabase/migrations/20261023000300_access.sql`: `id`, `name`, `normalized_name` (gerada por `private.normalize_alias`, **única** — M-05), `active`, datas; auditoria por trigger (`audit_row_change('partner')`); `DELETE` e `TRUNCATE` bloqueados | Existe. Só leitura pela API (`partners_select_business`: Administrador, Operador, Visualizador). **Nenhuma política de escrita**: a migration diz que "a feature Sócios acrescenta as políticas de escrita do Administrador" |
| `profiles.partner_id` | FK para `partners` com `on delete restrict`; único por sócio; papel `PARTNER` exige vínculo | Existe. O vínculo usuário ↔ sócio é feito por SQL (`private.set_user_access`) |
| `private.current_partner_id()` | Só devolve o sócio se o perfil **e o sócio** estiverem ativos | Existe. Inativar um sócio retira o vínculo efetivo do login dele (regra R-S08) |
| Normalização | `private.normalize_alias(text)`, `IMMUTABLE`: minúsculas, sem acento, sem pontuação, espaços colapsados | Existe; serve a nomes e apelidos |
| CNPJ/CPF | Não existem na linha de base nova. O legado (`docs/legado/07-10/supabase/migrations/20261007000100_foundation.sql`, `private.is_valid_cnpj`) aceita só CNPJ numérico | Precisam ser criados |
| Recebedores | Só no modelo conceitual (`02-modelagem-dados.md` 2.4: `receivers` com `partner_id` **anulável** por causa da P-08; `receiver_identifiers` tipado). A UI da FND reservou a posição (U-01, recomendação: dentro de Configurações > Sócios) | Não existem no banco. Com a RAT-D023, `partner_id` passa a ser **obrigatório** |
| Auditoria | `audit_logs` append-only; `private.set_audit_context(p_reason, p_source, p_correlation_id, p_actor_label)` grava motivo opcional (RAT-D021); leitura só pelo Administrador | Existe; regras herdadas em `02-modelagem-dados.md` 12.6 |
| Privilégios | `20261023000500_privileges.sql`: tudo revogado de `anon`/`authenticated`; cada feature concede por tabela e coluna na sua migration | Existe |
| Padrão de escrita | `public.register_proof_file` / `complete_proof_file_upload`: RPC concedida a `authenticated`, checagem de papel no banco | Existe; serve de modelo |
| Páginas | `src/app/(app)/clientes/page.tsx`, `configuracoes/socios/page.tsx`, `configuracoes/aliases/page.tsx`: placeholders com `ModulePage` | Existem. Em `src/lib/navigation.ts`: Clientes visível a Administrador, Operador e Visualizador; Sócios e Aliases só ao Administrador; todos `available: false` |
| Autorização na aplicação | `src/server/authorization.ts` (`decideAccess`, papel Sócio sem escopo); `src/lib/roles.ts` | Existe (só experiência; a barreira é o banco) |
| Erros e correlação | `src/lib/errors.ts` (`AppError`, mapa SQLSTATE → código); `src/server/request-context.ts` (correlation id) | Existe |
| Padrão de Server Action | `src/app/(auth-flow)/definir-senha/actions.ts`: `useActionState`, estado tipado com erro por campo, revalidação no servidor, `getClaims()`, logger por requisição, mensagens fixas em português | Existe; serve de modelo |
| Testes | pgTAP: `01_catalog` a `06_proof_files_storage` (inclui o teste de catálogo "nenhuma coluna de percentual"); e2e por HTTP em `tests/e2e/` (`acesso`, `comprovantes`); Vitest unitário | Existem; a CAD-001 acrescenta, não altera |

**Confronto com o Brain.** O modelo conceitual da FND-001 já segue as decisões (sem percentual, vocabulário Sócio, `client_partners` só com a associação). As respostas do G0 alteram dois pontos do modelo conceitual: `receivers.partner_id` passa a ser obrigatório (RAT-D023), e o cliente troca `cnpj` obrigatório por documento opcional, CPF ou CNPJ (RAT-D024). A RAT-D024 **revisa o Brain 02** ("Cliente: Empresa pagadora"; atributo "CNPJ"). O orquestrador fará o registro.

**Divergência que afeta o plano (não editada aqui).** O sistema está publicado na **Vercel**, mas o `CLAUDE.md`, a RAT-D022 e o plano da FND-001 (revisão 12) descrevem o **Render**. Para a CAD-001 isso só muda a etapa de publicação (E11, seção 8), que fica escrita sem depender do provedor. Também segue sem CI (GitHub Actions parado desde a revisão 11 da FND): as verificações rodam localmente e as evidências vão para `04-implementacao.md`. Recomenda-se regularizar a RAT-D022 antes de publicar a CAD-001.

**Informação nova (25/11/2026), ainda fora do Brain.** "Sistema totalmente interno"; membros criados pelo Administrador no painel do Supabase, com senha, sem SMTP; papel ainda definido por SQL. **Não muda a matriz da seção 6**: o papel Sócio continua negado (P-02b) e a tela de usuários segue fora (P-24). Só reforça que a CAD-001 não deve depender de e-mail.

---

## 3. Escopo

### 3.1 Incluído

1. **Sócios** (Configurações > Sócios, só Administrador):
   - lista com busca por nome e filtro ativos/inativos;
   - cadastro e edição do nome (sem documento, RAT-D025);
   - inativação e reativação (regras R-S04 e R-R06);
   - apelidos do sócio: incluir, desativar, reativar.
2. **Recebedores** (dentro do detalhe do sócio, conforme a recomendação U-01 da UI da FND; só Administrador):
   - lista dos recebedores do sócio, com filtro ativos/inativos;
   - cadastro e edição (nome do titular como aparece no comprovante);
   - identificadores para reconhecimento: variações do nome, chave Pix e banco/agência/conta (seção 5.3, R-R04);
   - inativação e reativação.
3. **Clientes** (Cadastros > Clientes):
   - lista com busca por nome, nome fantasia, documento e apelido, filtro ativos/inativos e paginação no servidor (padrão `03-ui-ux.md` 2.9);
   - detalhe do cliente (todos os papéis de leitura);
   - cadastro manual e edição (Administrador): nome ou razão social, nome fantasia, documento (CPF ou CNPJ, opcional), valor padrão da mensalidade, observações;
   - aviso de possível duplicidade por nome ao cadastrar sem documento (PROPOSTA, R-C15);
   - sócios indicados: indicar e retirar, com a divisão exibida como 1/n (sem percentual armazenado);
   - apelidos do cliente: incluir, desativar, reativar;
   - inativação e reativação.
4. **Aliases** (Configurações > Aliases, só Administrador): lista consolidada, só leitura, com busca ("este apelido ou identificador pertence a quem?"), cobrindo apelidos de sócio, identificadores de recebedor e apelidos de cliente. A edição acontece nos detalhes. É PROPOSTA e pode ser cortada sem afetar o resto (etapa E7).
5. Banco: tabelas, RLS, privilégios, RPCs de escrita, auditoria e testes pgTAP (handoff à `modelagem-dados`).
6. Seed local com sócios, recebedores e clientes **fictícios** (RAT-D019), com documentos que só têm DV válido.

### 3.2 Fora do escopo

- Importação de clientes por planilha (Fase 3 do roadmap).
- Documento (CPF/CNPJ) do sócio (RAT-D025, item 8).
- Competências, recebimentos, rateio, apuração, compensações, liquidação.
- Reconhecimento automático de comprovantes (uso dos apelidos e identificadores; feature de Reconhecimento).
- Tela de usuários e vínculo usuário ↔ sócio pela aplicação (P-24; segue por SQL).
- Escopo do login do sócio (P-02b).
- Tela de histórico/auditoria (os dados ficam gravados; a consulta é da Fase 5, Governança).
- Exclusão física de qualquer cadastro (R-G01).
- Data de vigência para a composição de sócios (RAT-D025, item 7).
- Busca por semelhança de nomes (extensão `pg_trgm` ou similar). O aviso de duplicidade da R-C15 compara só o nome normalizado exato.

---

## 4. Impacto

### 4.1 Domínio

Nenhuma regra financeira nova. A CAD-001 só guarda **quem** está indicado em cada cliente e **por quais contas** cada sócio recebe. O cálculo 1/n e o snapshot pertencem às features Rateio e Recebimentos (RAT-D006, RAT-D015). A tela pode **exibir** "divisão igual entre 3 sócios (1/3 cada)" a partir da contagem, sem gravar percentual (Brain 04, Fluxo 2, passo 5).

Com a RAT-D023, "Recebido" por sócio (RN-010) passa a ser sempre determinável: todo recebedor aponta para um sócio. Isso elimina o risco, apontado na FND, de quebrar a soma zero da RN-011.

### 4.2 Dados (detalhe com a `modelagem-dados`, gate G1)

| Tabela | Mudança | Base |
|---|---|---|
| `partners` | Sem coluna nova (sem documento, RAT-D025). Ganha RPCs de escrita do Administrador | `02-modelagem-dados.md` 2.4 |
| `partner_aliases` | Nova | idem |
| `receivers` | Nova: `id`, `partner_id` **NOT NULL** (RAT-D023), `name` (titular/nome bancário), `normalized_name` gerada, `active`, datas. O campo `document` do modelo conceitual **não existe** (RAT-D023: o documento do titular não é guardado) | idem, ajustado pela RAT-D023 |
| `receiver_identifiers` | Nova; tipada (só variação do nome, chave Pix, banco/agência/conta; **sem tipo documento**); ativa/inativa; única por (tipo, valor normalizado) entre as ativas | idem + RAT-D023 + R-R04 |
| `clients` | Nova: `legal_name`, `trade_name`, `document` (como digitado, **anulável**), `document_type` (CPF/CNPJ, derivado), `normalized_document` gerada, **única quando não nula** (entre ativos e inativos), `default_monthly_value`, `active`, `notes` | idem, ajustado pela RAT-D024 |
| `client_aliases` | Nova | idem |
| `client_partners` | Nova; só a associação, `unique (client_id, partner_id)`, `active`; **sem percentual** | idem; RAT-D015 |
| Funções | normalização e validação de CPF e de CNPJ (numérico e alfanumérico) em funções `IMMUTABLE`; RPCs de escrita | P-13 (respondida); plano FND 7.7 |

Regras herdadas obrigatórias (`02-modelagem-dados.md` 12.6): PK `uuid`, trigger de auditoria, `BEFORE TRUNCATE`, bloqueio de `DELETE`, concessões por tabela e coluna, motivo opcional nas RPCs, **nunca editar** as migrations `20261023000100` a `20261023000500`. O teste de catálogo "nenhuma coluna de percentual" (I-37) continua valendo.

Compatibilidade: tudo aditivo (tabelas e políticas novas). Não há backfill. O banco hospedado já tem `partners`, e a migration nova não altera as colunas existentes.

### 4.3 Backend

- **Escrita só por RPC** (PROPOSTA): uma função por ação. Para sócio: criar, editar, ativar/inativar e apelidos. Para recebedor: criar, editar, ativar/inativar e identificadores. Para cliente: criar, editar, ativar/inativar, definir sócios e apelidos. Os nomes finais ficam com a `modelagem-dados`. Cada RPC confere `private.is_admin()`, chama `private.set_audit_context(p_reason, 'UI', p_correlation_id)` e grava tudo numa transação. Não há `INSERT`/`UPDATE` direto concedido a `authenticated`. Motivo: operações atômicas (inativar sócio + recebedores; salvar indicações) com o motivo na auditoria, o que políticas de tabela sozinhas não fazem bem.
- **Controle de concorrência** (PROPOSTA): as RPCs de edição recebem o `updated_at` lido e, se ele mudou, devolvem conflito (padrão 4.7 da UI).
- **Aviso de nome repetido** (PROPOSTA, R-C15): consulta de leitura que devolve clientes com o mesmo nome normalizado. É só aviso, não bloqueia.
- **Leitura** por `select` com RLS, numa camada de acesso a dados em `src/server/partners/`, `src/server/receivers/` e `src/server/clients/` (`server-only`).
- **Server Actions** (uma por ação), no padrão de `definir-senha/actions.ts`: `zod` na entrada; `getClaims()` + perfil ativo + papel Administrador (defesa e mensagem; a barreira é o banco); chamada da RPC; mapeamento do SQLSTATE para mensagem em português pelo `AppError`; `correlation_id` do `request-context`.

### 4.4 Frontend (detalhe com o `design-ui-ux`, gate G2)

Rotas propostas:

- clientes: `/clientes`, `/clientes/novo`, `/clientes/[id]`;
- sócios: `/configuracoes/socios`, `/configuracoes/socios/novo`, `/configuracoes/socios/[id]`;
- recebedores, dentro do sócio: `/configuracoes/socios/[id]/recebedores/novo`, `/configuracoes/socios/[id]/recebedores/[receiverId]`, ou em painel/diálogo no detalhe (a UI decide);
- apelidos: `/configuracoes/aliases`.

Os itens de navegação passam a `available: true`. Operador e Visualizador veem Clientes sem botões de edição.

Componentes novos prováveis:

- seletor de sócios (múltipla escolha, só entre os ativos);
- lista editável de apelidos e de identificadores;
- campo de documento que reconhece CPF ou CNPJ pela quantidade de caracteres, com máscara;
- campo monetário (padrão 5.3 da UI);
- diálogo de inativação com motivo opcional (nível 2 do padrão 5.1), listando clientes ou recebedores afetados;
- aviso de nome parecido.

### 4.5 Next.js 16 (documentação consultada)

| Ponto assumido | Arquivo em `node_modules/next/dist/docs/01-app/` |
|---|---|
| Server Actions são alcançáveis por POST direto: autenticar e autorizar **dentro** de cada ação | `02-guides/server-actions.md` (Security); `02-guides/data-security.md`; `02-guides/forms.md` |
| Formulário com `useActionState` (estado e `pending`) e validação no servidor | `01-getting-started/07-mutating-data.md`; `02-guides/forms.md` (Form validation, Validation errors) |
| Atualizar a tela após salvar: `refresh()` (dados fora do cache) ou `revalidatePath`; `redirect()` lança exceção, então revalidar antes | `01-getting-started/07-mutating-data.md`; `02-guides/server-actions.md` (Choosing a cache update); `03-api-reference/04-functions/refresh.md` |
| Com `cacheComponents: true` (ativo em `next.config`), a leitura de sessão fica atrás de `<Suspense>`; `cookies()` não pode ser lido dentro de `use cache` comum | `02-guides/authentication-with-cache-components.md` |
| Limite de 1 MB do corpo da Server Action (sem impacto: formulários pequenos) | `02-guides/server-actions.md` (Configuration) |

PROPOSTA: **não usar `use cache`** para dados de cadastro nesta feature. O resultado depende do papel (RLS), e cachear por usuário traz pouco ganho num sistema interno. As páginas leem no momento da requisição, atrás de `<Suspense>`, e as ações usam `refresh()` ou `redirect()` para o detalhe.

### 4.6 Integrações

Nenhuma. Sem e-mail, sem storage, sem serviço externo.

### 4.7 Permissões e segurança

A matriz está na seção 6. Pontos para a `seguranca`:

- RPCs `SECURITY DEFINER` (se usadas) com `search_path = ''` e checagem de papel;
- concessões mínimas;
- Server Actions com autorização própria;
- **dados pessoais novos**: CPF de cliente pessoa física, chave Pix (que pode ser CPF, e-mail ou telefone) e banco/agência/conta de recebedor (P-20). O documento do titular do recebedor não é guardado (RAT-D023).

O mínimo de dados bancários está na R-R05.

### 4.8 Testes

- pgTAP por tema: um arquivo por grupo de tabelas/RPCs e a extensão da matriz de papéis.
- Vitest para a validação de CPF/CNPJ e os esquemas `zod`.
- e2e por HTTP para as Server Actions (permitido × negado).

O detalhe está nos critérios da seção 10.

---

## 5. Regras

Identificadores: R-G (geral), R-S (sócio), R-R (recebedor), R-C (cliente), R-A (apelidos de sócio e cliente). Citação curta das respostas do G0: "G0" = "responsável, 25/11/2026, G0 da CAD-001".

### 5.1 Gerais

| ID | Regra | Classificação |
|---|---|---|
| R-G01 | Nenhum cadastro é excluído fisicamente; usa-se inativação. `DELETE` e `TRUNCATE` ficam bloqueados no banco nas sete tabelas | DECISÃO OFICIAL (Brain 05: ativação/inativação; 02: status) + PROPOSTA (forma; plano FND 7.1, já aplicada em `partners`) |
| R-G02 | Toda criação, edição, inativação, reativação, mudança de sócios indicados, de apelidos e de identificadores é auditada (quem, o quê, quando, de onde, antes/depois) | DECISÃO OFICIAL (RAT-D009, RN-015) |
| R-G03 | Motivo opcional: as RPCs aceitam motivo e o gravam quando informado; nunca bloqueiam sem ele | DECISÃO OFICIAL (RAT-D021) |
| R-G04 | Empresa única: nenhuma tabela tem `organization_id` | DECISÃO OFICIAL (RAT-D010) |
| R-G05 | Vocabulário: Sócio, Recebedor, Cliente, Apelido (na interface; "alias" só no banco e no código). Sem "Indicador", "Empresa" ou "Parte" | DECISÃO OFICIAL (RAT-D017) + PROPOSTA ("Apelido" na interface; o menu atual diz "Aliases"; o rótulo fica com o `design-ui-ux`) |
| R-G06 | Seeds, testes e exemplos só com nomes fictícios | DECISÃO OFICIAL (RAT-D019) |
| R-G07 | Nenhum percentual armazenado (nem por sócio, nem divisão própria por cliente) | DECISÃO OFICIAL (RAT-D015; RAT-D004 revogada; RN-005 revogada) |
| R-G08 | CPF e CNPJ são normalizados e validados por funções únicas no banco. O CNPJ é aceito no formato numérico e no **alfanumérico** (emitido desde jul/2026), sempre com DV válido. O cálculo do DV do formato novo também valida o antigo, então pode ser uma função só | DECISÃO OFICIAL (G0, item 2: P-13 respondida "sim"; RAT-D024) + PROPOSTA (forma; plano FND 7.7) |
| R-G09 | **Limites de itens ativos por cadastro.** Sócio: até **2 apelidos**. Cliente: até **2 apelidos do tipo nome e até 2 do tipo documento** (CPF ou CNPJ); cada tipo tem o próprio limite. Recebedor: até **30 variações do nome**, **10 chaves Pix** e **10 contas bancárias**. Contam **só os itens ativos**: o item inativado não conta e não é apagado (R-G01, R-A05). Numa lista cheia, incluir ou reativar um item exige inativar outro antes. **Garantia no banco**, para qualquer caminho de escrita e também com gravações simultâneas; a tela e a validação do servidor só **espelham** os mesmos números (mensagem clara e botão "Adicionar" bloqueado na lista cheia), num lugar só no código. O detalhe técnico fica no `02-modelagem-dados.md`, revisão 4 | DECISÃO OFICIAL (RAT-D026; responsável, 27/11/2026; substitui o limite técnico de proteção 50/50/50/20/20 do QA-CAD-07). A contagem só dos ativos é leitura do orquestrador registrada na própria RAT-D026 + PROPOSTA (garantia no banco e espelho na tela) |

### 5.2 Sócios

| ID | Regra | Classificação |
|---|---|---|
| R-S01 | Nome obrigatório, até 200 caracteres | PROPOSTA (já no banco) |
| R-S02 | Dois sócios não podem ter o mesmo nome normalizado (sem acento, maiúsculas ou pontuação) | PROPOSTA (M-05, já no banco) |
| R-S03 | Só o Administrador cria, edita, inativa e reativa sócios | PROPOSTA aprovada no plano FND §6 ("Configurar sócios e aliases") |
| R-S04 | **Sócio indicado em cliente ativo não pode ser inativado.** É preciso retirá-lo dos clientes antes; o sistema mostra a lista. Assim o número de sócios de um cliente (o n da divisão) nunca muda sem uma ação explícita no cliente | DECISÃO OFICIAL (G0, item 5; RAT-D025; responde à M-02) |
| R-S04b | Antes de inativar o sócio, ele sai de **todos** os clientes, ativos e inativos: o sócio a inativar não pode ter nenhuma indicação ativa. Motivo: senão, ao reativar um cliente, ele voltaria com um sócio inativo indicado | DECISÃO OFICIAL (responsável, 25/11/2026, G0 da CAD-001; RAT-D025) |
| R-S05 | Sócio inativo não pode ser indicado em cliente. Reativar o sócio não o devolve sozinho aos clientes nem reativa seus recebedores | PROPOSTA |
| R-S06 | O sócio **não guarda CPF nem CNPJ**: só nome e apelidos | DECISÃO OFICIAL (G0, item 8; RAT-D025) |
| R-S07 | Os percentuais não aparecem no cadastro do sócio | DECISÃO OFICIAL (RAT-D015) |
| R-S08 | Inativar um sócio com login vinculado não mexe no login. O vínculo efetivo deixa de valer, porque `current_partner_id()` só considera sócio ativo. Um Administrador que também é sócio continua Administrador. A tela avisa quando há login vinculado | PROPOSTA |

### 5.3 Recebedores

| ID | Regra | Classificação |
|---|---|---|
| R-R01 | Todo recebedor pertence a **um sócio**, obrigatoriamente. Um sócio pode ter vários recebedores (contas, nomes bancários, titulares). Não existe recebedor de terceiro ou intermediário | DECISÃO OFICIAL (G0, item 1: P-08 respondida; RAT-D023; Brain 02, Recebedor) |
| R-R02 | O sócio dono **não muda** depois de criado o recebedor. Para "passar" uma conta a outro sócio, inativa-se o recebedor e cria-se outro. Motivo: recebimentos futuros vão gravar o sócio do recebedor no momento do lançamento, e trocar o dono confundiria leitura e auditoria | PROPOSTA |
| R-R03 | Campos mínimos: nome do titular como aparece no comprovante (obrigatório, até 200) e ativo/inativo. Observação curta opcional (ex.: "conta PJ") | PROPOSTA |
| R-R04 | O recebedor guarda o **nome do titular** (obrigatório) e, opcionalmente, vários identificadores tipados: **variações do nome**, **chave Pix** e **banco + agência + conta**. **O CPF/CNPJ do titular não é guardado.** Os identificadores são normalizados no banco, e um identificador ativo pertence a um único recebedor | DECISÃO OFICIAL (responsável, 25/11/2026, G0 da CAD-001; RAT-D023) + PROPOSTA (normalização e unicidade). Consequência: o passo "documento" da ordem de identificação do recebedor no Brain 08 (rascunho) não terá dado para comparar; o reconhecimento usa identificador bancário → variação do nome → nome |
| R-R05 | **Mínimo de dados bancários**: nada de senha, token, número de cartão, saldo, extrato ou dado que não apareça num comprovante. Só o que serve para reconhecer o favorecido | DECISÃO OFICIAL (G0, item 1: "nada de dado bancário sensível além do necessário") + P-20 (LGPD) |
| R-R06 | **Inativar o sócio inativa junto os recebedores ativos dele**, na mesma operação, com confirmação que lista os recebedores e motivo opcional | DECISÃO OFICIAL (responsável, 25/11/2026, G0 da CAD-001; RAT-D025) |
| R-R06b | Reativar o sócio não reativa os recebedores: o Administrador reativa cada um (R-S05) | PROPOSTA (complemento da R-R06) |
| R-R07 | Não se cria nem se reativa recebedor de sócio inativo | PROPOSTA |
| R-R08 | Só o Administrador cria, edita, inativa, reativa e mantém identificadores de recebedores | PROPOSTA (matriz FND §6: "Configurar sócios e aliases"; Brain 04, Fluxo 1, passo 5: "Admin cadastra aliases e identificadores bancários") |
| R-R09 | Um identificador de recebedor não pode coincidir com apelido ativo de **outro** sócio, nem com o nome normalizado de outro sócio. Assim o reconhecimento não aponta para dois sócios | PROPOSTA (a `modelagem-dados` avalia o custo; casos ambíguos vão para revisão humana de qualquer forma, RAT-D008) |

### 5.4 Clientes

| ID | Regra | Classificação |
|---|---|---|
| R-C01 | "Nome ou razão social" obrigatório (até 200); nome fantasia opcional; observações opcionais | DECISÃO OFICIAL (02: nome/razão social, observações) + PROPOSTA (limites e rótulo) |
| R-C02 | O cliente pode ser **pessoa física (CPF)** ou **empresa (CNPJ)** | DECISÃO OFICIAL (G0, item 3; RAT-D024; revisa o Brain 02, "Empresa pagadora") |
| R-C02b | O tipo do cliente não é campo próprio: é deduzido do documento (11 dígitos = CPF; 14 caracteres = CNPJ). Na tela, o tipo aparece **só como "CPF" ou "CNPJ"**; não se usa "Pessoa física", "Pessoa jurídica" nem "Empresa". Sem documento, o cliente fica sem tipo | PROPOSTA (dedução, para não guardar informação que pode ficar incoerente) + DECISÃO OFICIAL (rótulo: responsável, 26/11/2026, complemento da RAT-D017; fecha o QA-CAD-02) |
| R-C03 | O documento (CPF ou CNPJ) é **opcional**. Cliente sem documento é identificado pelo nome | DECISÃO OFICIAL (G0, item 4; RAT-D024) |
| R-C04 | Quando informado, o documento é normalizado (sem pontuação, maiúsculas) e tem DV válido (R-G08) | DECISÃO OFICIAL (04, Fluxo 2: "Sistema normaliza CNPJ"; G0, item 2) |
| R-C05 | Quando informado, o documento **não se repete** em outro cliente, **ativo ou inativo**. Cliente que volta é reativado, não recadastrado | DECISÃO OFICIAL (G0, item 4; RAT-D024). A extensão aos inativos é **interpretação do orquestrador**, registrada a pedido dele |
| R-C06 | O nome pode repetir (filiais têm a mesma razão social e CNPJ diferente; homônimos de pessoa física) | PROPOSTA |
| R-C07 | Valor padrão da mensalidade **obrigatório, maior que zero e editável**, em `numeric(14,2)`, digitado em reais e convertido sem float | DECISÃO OFICIAL (G0, item 6; RAT-D025; 02: atributo) + PROPOSTA (formato; plano FND 7.3) |
| R-C08 | Mudar o valor padrão não altera nenhum recebimento passado (o recebimento terá valor próprio) | DECISÃO OFICIAL (RAT-D006, por analogia ao snapshot) + PROPOSTA |
| R-C09 | Sócios indicados: o mesmo sócio não aparece duas vezes; só sócios ativos podem ser indicados; retirar e indicar de novo reaproveita o registro | DECISÃO OFICIAL (RAT-D005: o cliente define os sócios) + PROPOSTA (forma; `02-modelagem-dados.md` 2.4) |
| R-C10 | **Cliente ativo nunca fica sem sócio**: não se salva cliente ativo sem sócio, não se retira o último sócio de um cliente ativo e não se reativa cliente sem ao menos 1 sócio ativo indicado. Cliente inativo pode ficar sem nenhum | DECISÃO OFICIAL (G0, item 5; RAT-D025) + PROPOSTA (aplicação na reativação e ao cliente inativo) |
| R-C11 | **A troca de sócios vale a partir do momento da mudança.** Não há data de vigência. Os recebimentos já rateados não mudam (snapshot), e a troca fica na auditoria | DECISÃO OFICIAL (G0, item 7; RAT-D025; RAT-D006). O momento exato do snapshot (confirmação × apuração) é a M-01, da feature Rateio |
| R-C12 | A tela mostra a divisão como "1/n" com o percentual aproximado (ex.: "3 sócios — 1/3 cada, 33,33%"), só como informação calculada | DECISÃO OFICIAL (RAT-D015; 04, Fluxo 2, passo 5) + PROPOSTA (apresentação) |
| R-C13 | Cliente inativo não aparece para seleção em lançamentos futuros (regra a aplicar na feature Recebimentos) | PROPOSTA (registrada para não se perder) |
| R-C14 | Só o Administrador cria, edita, inativa, reativa e define sócios e apelidos de cliente; Operador e Visualizador consultam | PROPOSTA aprovada no plano FND §6 (Brain 10, rascunho; 04, Fluxo 2: "Admin cadastra") |
| R-C15 | **Aviso de possível duplicidade**: ao salvar um cliente, o sistema avisa se já existe outro cliente (ativo ou inativo) com o mesmo nome normalizado, ou com apelido ativo igual a esse nome. O aviso vale especialmente para quem não tem documento. **É só aviso**: o Administrador pode confirmar e seguir | PROPOSTA (resposta ao risco de duplicidade sem documento; não é regra de bloqueio) |
| R-C16 | O CPF de cliente é dado pessoal: aparece para quem consulta clientes (Operador e Visualizador, R-C14), não vai para logs técnicos e fica sujeito à P-20 antes de dados reais | PROPOSTA (RAT-D020: sem camada extra; uma alternativa, mascarar o CPF para Operador e Visualizador, fica registrada só como opção para a `seguranca`) |
| R-C17 | Na lista de clientes, a busca por documento (CPF ou CNPJ, com ou sem pontuação) acha o cliente **pelo começo do número**, não por um trecho do meio ou do fim. A ajuda da busca diz isso (texto T-01 do `03-ui-ux.md`) | DECISÃO OFICIAL (responsável, 27/11/2026, na validação da CAD-001; fecha o QA-CAD-08). A busca por qualquer trecho foi apresentada como alternativa e não foi escolhida |

### 5.5 Apelidos de sócio e de cliente

Uso: reconhecimento de comprovantes. Pelo Brain 08, o cliente é reconhecido por CNPJ exato → CPF/CNPJ normalizado → apelido → nome; o recebedor, por documento → identificador bancário → alias → nome.

| ID | Regra | Classificação |
|---|---|---|
| R-A01 | Apelido normalizado pela mesma função do banco (`private.normalize_alias`): minúsculas, sem acento, sem pontuação, espaços colapsados. Apelido do tipo documento é normalizado e validado como documento (R-G08) | PROPOSTA (plano FND 7.7: fonte única no banco) |
| R-A02 | Um apelido ativo pertence a **um único** cliente (entre clientes) e a **um único** sócio (entre sócios). Cliente e sócio são espaços separados (pagador × beneficiário, RN-001) | PROPOSTA (I-35) |
| R-A03 | Apelido do tipo documento de um cliente não pode coincidir com o documento de outro cliente | PROPOSTA |
| R-A04 | Apelido de sócio não pode coincidir com o nome normalizado de outro sócio | PROPOSTA |
| R-A05 | Apelido não é excluído: é desativado. Desativado não bloqueia o mesmo texto em outro cadastro | PROPOSTA (R-G01) |
| R-A06 | Tipos de apelido: lista curta definida pela `modelagem-dados` (proposta atual: nome, nome fantasia, documento, outro). Não é pergunta ao responsável | PROPOSTA |
| R-A07 | O nome e o documento do próprio cadastro não precisam ser repetidos como apelido: o reconhecimento já os usa | PROPOSTA |
| R-A08 | Quem paga em nome do cliente com documento próprio (ex.: o CPF do dono de uma empresa cliente) entra como apelido do tipo documento daquele cliente | PROPOSTA |

---

## 6. Matriz de papéis

Base: PROPOSTA aprovada no plano FND-001 §6 ("Configurar sócios e aliases": só Administrador; "Gerenciar clientes": Operador e Visualizador consultam). Papéis oficiais: RAT-D011. Em dúvida, negar. O papel **Sócio** continua sem acesso a qualquer dado de negócio até a P-02b. Usuário sem papel, usuário inativo e anônimo não acessam nada.

| Ação | Administrador | Operador | Visualizador | Sócio |
|---|:-:|:-:|:-:|:-:|
| Ver a tela Configurações > Sócios (lista e detalhe) | ✔ | — | — | — |
| Ver o **nome** dos sócios indicados no detalhe do cliente | ✔ | ✔ | ✔ | — |
| Cadastrar, editar, inativar, reativar sócio | ✔ | — | — | — |
| Ver e gerir apelidos de sócio | ✔ | — | — | — |
| Ver recebedores e seus identificadores | ✔ | — | — | — |
| Cadastrar, editar, inativar, reativar recebedor; gerir identificadores | ✔ | — | — | — |
| Listar e ver clientes (dados, documento, sócios indicados, apelidos) | ✔ | ✔ | ✔ | — |
| Cadastrar, editar, inativar, reativar cliente | ✔ | — | — | — |
| Indicar e retirar sócios do cliente | ✔ | — | — | — |
| Gerir apelidos de cliente | ✔ | — | — | — |
| Ver a lista consolidada de apelidos e identificadores (Configurações > Aliases) | ✔ | — | — | — |
| Ler a auditoria desses cadastros | ✔ (pelo banco; sem tela nesta feature) | — | — | — |

Observações:

- A leitura de `partners` por Operador e Visualizador **já existe** no banco (`partners_select_business`) e não muda.
- Recebedores e apelidos de sócio ficam negados a Operador e Visualizador por padrão, porque hoje não há uso. A feature Recebimentos deve rever a leitura de recebedores pelo Operador, que vai escolher o recebedor ao lançar.
- A barreira é o banco (RLS + RPC). A navegação e as Server Actions repetem a checagem só para experiência e defesa.

---

## 7. Auditoria

| Ação | Como é auditada | Motivo (RAT-D021) |
|---|---|---|
| Criar/editar sócio, recebedor ou cliente | `ROW_CHANGE` por trigger (antes/depois, diff no UPDATE) | Aceito; campo **não** exibido no formulário comum (PROPOSTA, para não poluir) |
| Inativar/reativar cliente ou recebedor | `ROW_CHANGE` + contexto da RPC | Campo "Motivo (opcional)" no diálogo |
| Inativar sócio (com os recebedores ativos dele, R-R06) | `ROW_CHANGE` em `partners` e em cada `receivers`, na mesma transação (`tx_id` comum) | Campo "Motivo (opcional)" no diálogo, gravado em todas as linhas da operação |
| Indicar/retirar sócios do cliente | `ROW_CHANGE` em `client_partners` (uma linha por sócio, mesma transação) | Campo "Motivo (opcional)" na confirmação da mudança |
| Incluir, trocar ou retirar o documento do cliente | `ROW_CHANGE` | Campo "Motivo (opcional)" (PROPOSTA: a chave de reconhecimento muda) |
| Confirmar cadastro apesar do aviso de nome repetido (R-C15) | `ROW_CHANGE` do cliente + marca na auditoria de que o aviso foi exibido e confirmado (PROPOSTA; a forma fica com a `modelagem-dados`) | Aceito |
| Incluir/desativar/reativar apelido ou identificador | `ROW_CHANGE` | Aceito, sem campo na tela |

Todas as RPCs recebem `p_reason` opcional e `p_correlation_id`, com origem `UI` (regras 12.6 da modelagem FND). A auditoria registra quem, o quê, quando e de onde mesmo sem motivo. Documentos de cliente (CPF, CNPJ) e dados de recebedor (chave Pix, conta) aparecem nos campos antes/depois da auditoria; a redação desses campos na auditoria é tema da P-20, fora desta feature.

---

## 8. Plano incremental

As etapas são pequenas: cada etapa de desenvolvimento cabe numa execução de subagente, grava progresso em `04-implementacao.md` ao fim de cada passo e não depende do contexto da conversa.

| Etapa | Objetivo | Responsável | Depende de | Saída |
|---|---|---|---|---|
| **E0** | Gate G0. **Aprovado em 25/11/2026**; decisões registradas no Brain pelo orquestrador (RAT-D023 a RAT-D025) | Responsável + orquestrador | — | G0 ✔ |
| **E1** | Modelagem: DDL de `partner_aliases`, `receivers`, `receiver_identifiers`, `clients`, `client_aliases`, `client_partners`; funções de CPF e CNPJ; contrato das RPCs (entrada, erros, SQLSTATE, concorrência por `updated_at`); RLS e concessões; invariantes (R-S04/R-S04b, R-R01, R-R02, R-R06, R-C05, R-C09, R-C10, R-A02 a R-A04, R-R09); consulta do aviso R-C15; índices; lista de testes pgTAP; ordem das migrations | `modelagem-dados` | E0 | `02-modelagem-dados.md` (G1) |
| **E2** | UI/UX: lista, formulário e detalhe de Clientes e Sócios; recebedores dentro do sócio; seletor de sócios; apelidos e identificadores; campo de documento CPF/CNPJ; aviso de nome repetido; diálogos de inativação (listando clientes ou recebedores); estados (vazio, sem resultado, erro, só leitura, conflito); rótulo "Apelidos" × "Aliases"; textos. Em paralelo à E1 | `design-ui-ux` | E0 | `03-ui-ux.md` (G2) |
| **E3a** | Banco, parte 1: funções de documento, `partner_aliases`, `receivers`, `receiver_identifiers`, RPCs de sócio e recebedor, pgTAP desses temas | `desenvolvedor` | G1 | pgTAP verde |
| **E3b** | Banco, parte 2: `clients`, `client_aliases`, `client_partners`, RPCs de cliente (incluindo as travas R-S04 e R-C10), extensão da matriz de papéis, `db reset` + `db test` + `db lint` + `db advisors`, tipos regenerados | `desenvolvedor` | E3a | Banco recriável do zero |
| **E4** | Base de servidor: validação de CPF/CNPJ em TS (espelho, só para mensagem na tela), esquemas `zod`, camada de leitura (`src/server/partners`, `receivers`, `clients`), chamada das RPCs, mapeamento de erros; Vitest | `desenvolvedor` | E3b | Unitários verdes |
| **E5a** | Telas de Sócios: lista, novo, detalhe/edição, apelidos, inativar/reativar + Server Actions; navegação `available: true` | `desenvolvedor` | E4, G2 | Fluxo de sócios |
| **E5b** | Recebedores no detalhe do sócio: lista, novo, edição, identificadores, inativar/reativar + Server Actions; inativação do sócio com os recebedores (R-R06) | `desenvolvedor` | E5a | Fluxo de recebedores |
| **E6a** | Telas de Clientes, parte 1: lista com busca e paginação, detalhe (leitura para todos), novo e edição dos dados (documento opcional, aviso de nome repetido) + Server Actions | `desenvolvedor` | E5a | Cadastro de clientes |
| **E6b** | Telas de Clientes, parte 2: sócios indicados, apelidos, inativar/reativar + Server Actions | `desenvolvedor` | E6a | Fluxo de clientes completo |
| **E7** | Lista consolidada de apelidos e identificadores (se aprovada); seed local fictício; e2e por HTTP (permitido × negado nas Server Actions); verificação completa local (lint, `tsc`, Vitest, build, pgTAP, e2e); registro do G3 | `desenvolvedor` | E5b, E6b | G3 em `04-implementacao.md` |
| **E8** | Revisão de segurança (conferência do básico, RAT-D020): RLS, RPCs, concessões, Server Actions, dados pessoais e bancários (R-R05, R-C16), arquivos públicos sem segredo/URL/e-mail real | `seguranca` | E7 | `05-seguranca.md` (G4) |
| **E9** | QA: matriz dos CA da seção 10 e regressão da FND (login, papéis, comprovantes) | `qa` | E7 (em paralelo à E8) | `06-qa.md` (G5) |
| **E10** | Correções e revalidação por quem apontou | `desenvolvedor` → `seguranca`/`qa` | E8, E9 | Achados fechados |
| **E11** | Publicação: o responsável aplica as migrations no banco hospedado (CLI do Supabase, como na FND, opção B) e publica a aplicação no provedor em uso; smoke manual curto | Responsável (+ roteiro do `desenvolvedor`) | E10; regularização da hospedagem recomendada (seção 2) | Feature no ar |
| **E12** | Relatório em linguagem simples | `relator` | E11 | `07-relatorio.md` (G6) |

```text
E0 (G0) ──┬─► E1 (G1) ──► E3a ──► E3b ──► E4 ──┐
          └─► E2 (G2) ─────────────────────────┴─► E5a ──┬─► E5b ──────────┐
                                                         └─► E6a ──► E6b ──┴─► E7 (G3) ──┬─► E8 (G4) ──┐
                                                                                         └─► E9 (G5) ──┴─► E10 ──► E11 ──► E12 (G6)
```

E5b e E6a/E6b podem rodar em sequência (um só desenvolvedor) ou em paralelo, se o orquestrador preferir. Elas só se tocam na navegação.

**Rollback.** As migrations são só aditivas. Antes da publicação: `db reset`. Depois: uma migration nova revoga concessões e políticas, e a tela volta a placeholder com `available: false`. Nenhum dado existente é alterado. Nunca editar migration já aplicada.

---

## 9. Decisões pendentes

### 9.1 Respondidas no G0 (25/11/2026)

| # | Pergunta | Resposta do responsável | Registro |
|---|---|---|---|
| 1 | Recebedores entram agora? | **Sim.** O recebedor está sempre ligado a um sócio; um sócio pode ter vários; não existe recebedor de terceiro (P-08) | RAT-D023; R-R01 |
| 2 | CNPJ com letras (P-13)? | **Sim**, os dois formatos, validando o DV | RAT-D024; R-G08 |
| 3 | Cliente pessoa física com CPF? | **Sim**: pessoa física com CPF ou empresa com CNPJ (revisa o Brain 02) | RAT-D024; R-C02 |
| 4 | CNPJ obrigatório e sem repetição? | Documento **opcional**; quando informado, não se repete. A extensão aos inativos é interpretação do orquestrador | RAT-D024; R-C03, R-C05 |
| 5 | Inativar sócio em clientes; cliente ativo sem sócio? | Não aos dois; o sistema mostra a lista | RAT-D025; R-S04, R-C10 |
| 6 | Mensalidade obrigatória? | Sim, maior que zero, editável | RAT-D025; R-C07 |
| 7 | Troca de sócios vale desde quando? | A partir de agora; o passado não muda; fica na auditoria | RAT-D025; R-C11 |
| 8 | Documento do sócio? | Não: o sócio só tem nome e apelidos | RAT-D025; R-S06 |

### 9.2 Respondidas na aprovação (25/11/2026)

| # | Pergunta | Resposta do responsável | Registro |
|---|---|---|---|
| PEND-1 | Quais dados de cada recebedor guardar? | Nome do titular (obrigatório) e, opcionalmente, variações do nome, chave Pix e banco/agência/conta. **O CPF/CNPJ do titular não é guardado** (a recomendação o incluía; o responsável não o escolheu) | RAT-D023; R-R04 |
| PEND-2 | Inativar o sócio com recebedores ativos? | Os recebedores ativos são inativados junto, com lista e confirmação | RAT-D025; R-R06 |
| R-S04b | Retirar o sócio também dos clientes inativos antes de inativá-lo? | Aprovada: ele sai de todos os clientes, ativos e inativos | RAT-D025; R-S04b |
| — | Aprovação do plano | Aprovado | G0 ✔ (cabeçalho) |

Não há decisão pendente que bloqueie esta feature.

### 9.3 Não bloqueiam esta feature

P-02b (escopo do sócio), P-20 (LGPD; **antes de dados reais**, agora também com CPF de cliente e dados de recebedor), P-24 (usuários), M-01 (momento do snapshot; feature Rateio). Regularização da hospedagem no Brain (RAT-D022 × Vercel), a cargo do responsável.

### 9.4 Respondidas na validação (26 e 27/11/2026)

| # | Pergunta | Resposta do responsável | Registro |
|---|---|---|---|
| QA-CAD-02 | Como mostrar o tipo do cliente? | Só "CPF" ou "CNPJ"; nada de "Pessoa física", "Pessoa jurídica" ou "Empresa"; sem documento, sem tipo (26/11/2026) | Complemento da RAT-D017; R-C02b |
| QA-CAD-07 | Quantos itens ativos cada lista pode ter? | Sócio: 2 apelidos. Cliente: 2 nomes e 2 documentos. Recebedor: 30 variações do nome, 10 chaves Pix e 10 contas (27/11/2026). Os números propostos (50/50/50/20/20, limite técnico) foram trocados por estes, que viram regra | RAT-D026; R-G09; CA-26 |
| QA-CAD-08 | A busca de documento em Clientes acha por qualquer trecho do número? | Não: continua pelo começo do número (27/11/2026) | R-C17; CA-19 |

---

## 10. Critérios de aceite

| ID | Critério | Verificação |
|---|---|---|
| CA-01 | O Administrador cadastra, edita, inativa e reativa sócios. Nome repetido (mesmo após tirar acento, maiúscula e pontuação) é recusado com mensagem clara. O sócio não tem campo de documento | pgTAP + e2e HTTP + QA |
| CA-02 | Sócio com indicação ativa em qualquer cliente, ativo **ou inativo**, não é inativado, e a resposta lista os clientes. Sem indicação ativa, a inativação conclui | pgTAP + QA |
| CA-03 | `DELETE` e `TRUNCATE` são recusados em `partners`, `partner_aliases`, `receivers`, `receiver_identifiers`, `clients`, `client_aliases` e `client_partners`, por qualquer papel | pgTAP |
| CA-04 | Documento: com e sem pontuação, chega ao mesmo valor normalizado. CPF e CNPJ com DV inválido são recusados. O CNPJ numérico e o alfanumérico válidos são aceitos (conferido com o exemplo da nota técnica oficial da Receita) | pgTAP + Vitest |
| CA-05 | Cliente sem documento é aceito. Documento já usado por outro cliente, ativo ou inativo, é recusado | pgTAP |
| CA-06 | Ao salvar um cliente com o mesmo nome normalizado de outro (ou igual a um apelido ativo de outro), aparece um aviso; o Administrador pode confirmar e seguir | QA + e2e HTTP |
| CA-07 | Cliente ativo sem sócio é recusado: ao salvar, ao retirar o último sócio e ao reativar sem sócio ativo. Duas retiradas simultâneas não deixam o cliente ativo sem sócio | pgTAP |
| CA-08 | O mesmo sócio não é indicado duas vezes; sócio inativo não pode ser indicado; retirar e indicar de novo reaproveita o registro | pgTAP |
| CA-09 | O detalhe do cliente mostra "n sócios — 1/n cada", coerente com as indicações ativas. Nenhuma coluna de percentual existe no schema `public` (o teste de catálogo I-37 segue verde) | QA + pgTAP |
| CA-10 | Valor da mensalidade: obrigatório, maior que zero, aceita "1.234,56" e grava exatamente 1234.56; zero, negativo, vazio ou mais de 2 casas é recusado | pgTAP + Vitest |
| CA-11 | Recebedor: criação exige sócio ativo; o sócio dono não pode ser trocado; inativar e reativar funcionam; não se reativa recebedor de sócio inativo | pgTAP |
| CA-12 | Inativar sócio com recebedores ativos: todos são inativados na mesma operação, depois da confirmação com a lista, com auditoria de cada um e motivo comum. Se a operação falhar, nada é inativado. Reativar o sócio não reativa os recebedores | pgTAP + QA |
| CA-13 | Identificadores de recebedor: só variação do nome, chave Pix e banco/agência/conta; **não existe campo nem tipo para CPF/CNPJ do titular** (banco e tela); normalizados; identificador ativo repetido entre dois recebedores é recusado; identificador igual a apelido ou nome de outro sócio é recusado (se a R-R09 for mantida pela modelagem) | pgTAP |
| CA-14 | Apelidos: normalizados no banco. Apelido ativo repetido entre dois clientes (ou entre dois sócios) é recusado, e o desativado não bloqueia. Apelido documento igual ao documento de outro cliente é recusado, assim como apelido de sócio igual ao nome de outro sócio | pgTAP |
| CA-15 | A matriz da seção 6 é garantida no banco para cada papel (Administrador, Operador, Visualizador, Sócio, sem papel, inativo, anônimo), em cada tabela e cada RPC, nos casos permitido e negado | pgTAP (extensão de `02_roles_matrix`) |
| CA-16 | Server Actions de escrita chamadas por POST direto com sessão de Operador, Visualizador ou Sócio são recusadas e não alteram dados | e2e HTTP |
| CA-17 | Cada ação de escrita gera registro em `audit_logs` com autor, origem `UI`, antes/depois e motivo quando informado. Sem motivo, a ação conclui e o motivo fica nulo | pgTAP |
| CA-18 | Edição sobre dado desatualizado (outra pessoa salvou antes) é recusada com mensagem de conflito, sem sobrescrever | pgTAP + QA |
| CA-19 | Lista de clientes: busca por nome, nome fantasia, documento (com ou sem pontuação, **pelo começo do número**, R-C17: o começo do CPF ou do CNPJ acha o cliente; um trecho só do meio ou do fim não acha) e apelido; filtro ativos/inativos; paginação no servidor; estados vazio, sem resultado, erro e só leitura conforme o `03-ui-ux.md` da CAD-001 | QA |
| CA-20 | Operador e Visualizador veem clientes sem nenhum botão de edição. Não veem Configurações > Sócios, os recebedores nem Aliases. O Sócio vê a tela "sem escopo" | QA + e2e HTTP |
| CA-21 | Vocabulário: "Sócio", "Recebedor", "Cliente", "Apelido" (ou o rótulo aprovado na E2). Nenhum "Parte", "Indicador", "Empresa" ou percentual configurável na interface | QA |
| CA-22 | Nenhum dado bancário além da R-R05. Documentos e chaves não aparecem em logs técnicos | revisão + segurança |
| CA-23 | Seed, testes e exemplos só com nomes fictícios. Nenhum segredo, ref de projeto, URL de serviço ou e-mail real em arquivo versionado | revisão + `check:bundle` + segurança |
| CA-24 | Banco recriado do zero (`db reset`) com pgTAP, `db lint` e `db advisors` sem alerta novo. `lint`, `typecheck`, `test` e `build` verdes. As migrations da FND não foram editadas | evidências locais em `04-implementacao.md` |
| CA-25 | Regressão da FND: login, estados de acesso, comprovantes e auditoria continuam passando (pgTAP e e2e existentes) | QA |
| CA-26 | **Limites de itens ativos (R-G09; RAT-D026).** (a) No banco, por qualquer caminho de escrita: o 3º apelido ativo de um sócio é recusado; num cliente, o 3º apelido ativo **do tipo nome** é recusado e o 3º **do tipo documento** também, enquanto um cliente com 2 nomes e 0 documento ainda aceita 2 documentos (e o inverso); num recebedor, a 31ª variação do nome, a 11ª chave Pix e a 11ª conta ativas são recusadas, e cada tipo conta separado. (b) Com a lista cheia, **reativar** um item inativo também é recusado; depois de inativar outro item da mesma lista, incluir ou reativar volta a funcionar. (c) Itens inativos não contam: um cadastro com 2 apelidos ativos e vários inativos aceita trocar um ativo por outro. (d) A recusa é por inteiro: nada da gravação fica parcial, e duas gravações simultâneas no mesmo cadastro não deixam a lista passar do limite. (e) Na tela, a lista cheia mostra a mensagem do limite com a orientação de inativar outro item, e o botão "Adicionar" fica indisponível; os números da tela e da validação do servidor são os mesmos do banco. (f) Seed e testes respeitam os limites | pgTAP + Vitest + e2e HTTP + QA |

---

## 11. Riscos

| ID | Risco | Severidade | Mitigação |
|---|---|---|---|
| R-01 | Implementar com regra indefinida e ter de refazer o banco | Baixa (era Alta na revisão 1) | G0 aprovado com todas as respostas (revisão 3) |
| R-01b | Sem o documento do titular, o reconhecimento automático do recebedor fica mais fraco (o comprovante costuma trazer o CPF/CNPJ do favorecido) | Baixa nesta feature; Média na feature de Reconhecimento | Usar chave Pix, banco/agência/conta e variações do nome; casos ambíguos vão para revisão humana (RAT-D008). Rever na feature de Reconhecimento, se necessário, com nova decisão |
| R-02 | Subagente parar no meio por estouro de contexto | Média | Etapas E3a a E7 pequenas; progresso gravado em `04-implementacao.md` a cada passo |
| R-03 | Cálculo do DV do CNPJ alfanumérico ou do CPF errado | Média | Funções únicas no banco, testadas com o exemplo oficial da Receita e com documentos de teste conhecidos; espelho em TS só para mensagem |
| R-04 | **Cliente duplicado sem documento** (o documento é opcional) | Média | Aviso de nome repetido (R-C15); busca por nome e apelido na lista; inativar o duplicado. Busca por semelhança fica fora (3.2) |
| R-05 | **Dados pessoais** (CPF de cliente; chave Pix e conta de recebedor) sem base legal definida | Média | R-R05 (mínimo), só o Administrador grava; CPF fora de logs técnicos; P-20 antes de dados reais; uso interno (RAT-D020) |
| R-06 | Mudar sócios de um cliente depois que houver recebimentos e alguém esperar efeito retroativo | Média | R-C11 explícita na tela ("vale a partir de agora"); snapshot por recebimento (RAT-D006); a M-01 decide o momento |
| R-07 | Inativação em cascata (R-R06) inativar uma conta que ainda recebe dinheiro do sócio | Baixa | Diálogo lista as contas; reativação manual; recebimento futuro numa conta inativa cai em revisão (RAT-D008) |
| R-08 | Documento único com inativos impedir um caso legítimo | Baixa | Reativar e editar o cliente existente; afrouxar depois é migration simples |
| R-09 | Documentação de hospedagem divergente (Vercel × Render) levar a publicar no lugar errado | Média | E11 escrita sem depender do provedor; regularizar a RAT-D022 antes da E11 |
| R-10 | Sem CI: erro que só apareceria na integração | Média | Verificação completa local obrigatória (CA-24) com evidência; o QA independente roda de novo |
| R-11 | Migration aplicada à mão no banco hospedado divergir da versão testada | Média | Roteiro da E11 com `supabase migration list` antes e depois; nunca editar migration aplicada |
| R-12 | Seed com CPF/CNPJ válido coincidir com pessoa ou empresa real (repositório público) | Baixa | Nomes sempre fictícios; documentos gerados só com DV válido, sem relação com pessoa ou empresa conhecida; preferir CNPJ alfanumérico e evitar CPF no seed quando possível |
| R-13 | Inativar sócio com login gerar confusão de acesso | Baixa | R-S08: o login não muda; aviso na tela; o papel Sócio já não acessa nada (P-02b) |
| R-14 | Escopo crescer (importação, reconhecimento, histórico, busca por semelhança) | Média | Seção 3.2; achados novos vão para "FORA DE ESCOPO" |
| R-15 | Limites baixos (R-G09: 2 apelidos) impedirem um caso legítimo, ou testes e roteiros já escritos com mais itens que o limite passarem a falhar | Baixa | Inativar um item para liberar a vaga (o histórico fica); mudar um número é nova decisão do responsável e uma alteração pequena no banco e no ponto único do código. O banco da CAD-001 ainda não foi publicado, então não há dado real acima do limite; o seed atual já respeita os números. Testes e roteiros do e2e ajustados na implementação |

---

## 12. Handoffs

### `modelagem-dados` (E1; gate G1) — **em andamento desde o G0 (25/11/2026)**

- **Entrada:** este plano (revisão 2); `02-modelagem-dados.md` da FND (2.4, 2.5, 4.2, 5.2, 12.6, 13); migrations atuais.
- **Entregar** `docs/features/CAD-001-socios-e-clientes/02-modelagem-dados.md` com DDL, RLS, concessões, RPCs (contrato e SQLSTATE), invariantes, índices, ordem das migrations (E3a/E3b), plano de testes pgTAP e rollback.
- **Focos:**
  - `receivers.partner_id` NOT NULL e imutável (RAT-D023, R-R02);
  - tipos de identificador: variação do nome, chave Pix, banco/agência/conta; sem documento do titular (RAT-D023);
  - funções `IMMUTABLE` de CPF e CNPJ (numérico e alfanumérico) e `clients.normalized_document` única e anulável;
  - unicidades parciais de apelidos e identificadores, e as checagens cruzadas (R-A03, R-A04, R-R09; avaliar o custo);
  - trava de inativação de sócio com qualquer indicação ativa (R-S04b) e cascata atômica para os recebedores (R-R06; RAT-D025);
  - trava de cliente ativo sem sócio, com concorrência: duas transações simultâneas não podem deixar n = 0;
  - consulta do aviso R-C15 e o registro da confirmação na auditoria;
  - concorrência por `updated_at`;
  - nenhuma coluna de percentual;
  - **revisão 4 (27/11/2026):** garantia no banco dos limites de itens ativos (R-G09; RAT-D026), por cadastro e por tipo, inclusive na reativação e com gravações simultâneas (CA-26).

### `design-ui-ux` (E2; gate G2) — **em andamento desde o G0 (25/11/2026)**

- **Entrada:** este plano; `03-ui-ux.md` da FND (2.3, 2.9, 4, 5.1 a 5.3, 7, 9.4/U-01).
- **Entregar** `docs/features/CAD-001-socios-e-clientes/03-ui-ux.md`:
  - telas de lista, formulário e detalhe;
  - recebedores dentro do sócio;
  - seletor de sócios;
  - apelidos e identificadores;
  - campo de documento CPF/CNPJ opcional;
  - aviso de nome repetido;
  - diálogos de inativação, com as listas de clientes ou recebedores;
  - textos de erro: documento inválido ou duplicado, sócio em clientes, cliente sem sócio, conflito;
  - visão só leitura de Operador e Visualizador;
  - rótulo do menu "Aliases".

### `desenvolvedor` (E3a a E7, E10)

- Seguir as etapas na ordem e registrar em `docs/features/CAD-001-socios-e-clientes/04-implementacao.md`, com rastreio requisito → arquivo → teste → resultado.
- Não editar migrations da FND, o Brain, os documentos da FND nem o `CLAUDE.md`. Não aplicar migration remota. Não autoaprovar.

### `seguranca` (E8; G4)

- Conferência do básico (RAT-D020): RLS e concessões, RPCs, Server Actions, dados pessoais e bancários (R-R05, R-C16, CA-22), arquivos públicos sem segredo. Entregar `05-seguranca.md`.

### `qa` (E9; G5)

- Matriz CA-01 a CA-26 e regressão da FND. Entregar `06-qa.md`.

### `relator` (E12; G6)

- `07-relatorio.md` em linguagem de produto, só com o estado real.

---

## 13. Decisões

### DECISÃO OFICIAL EXISTENTE

- RAT-D002 (recebedor separado do sócio e do pagador).
- RAT-D005 e RAT-D015 (o cliente define os sócios; sempre 1/n; nada de percentual).
- RAT-D006 (snapshot por recebimento; mudar sócios não reescreve o passado).
- RAT-D009 (auditoria), RAT-D010 (empresa única), RAT-D011 (papéis; login do sócio), RAT-D017 (Sócio), RAT-D019 (nomes fictícios), RAT-D020 (básico de segurança), RAT-D021 (motivo opcional).
- Brain 02 (atributos de Cliente, Parte e Recebedor), 04 (Fluxo 1, passo 5; Fluxo 2: normalizar documento, verificar duplicidade), 05 (Clientes: cadastro, edição, ativação/inativação, sócios, apelidos).
- **Respostas do G0 (responsável, 25/11/2026, G0 da CAD-001), a registrar pelo orquestrador:**
  - **RAT-D023**: o recebedor está sempre ligado a um sócio; um sócio pode ter vários recebedores; não há recebedor de terceiro ou intermediário (responde à P-08). O recebedor guarda o nome do titular (obrigatório) e, opcionalmente, variações do nome, chave Pix e banco/agência/conta; o CPF/CNPJ do titular não é guardado (PEND-1).
  - **RAT-D024**: o cliente pode ser pessoa física (CPF) ou empresa (CNPJ). O documento é opcional; quando informado, é validado e não se repete. A unicidade vale entre ativos e inativos, por interpretação do orquestrador. O CNPJ é aceito nos formatos numérico e alfanumérico (responde à P-13). Revisa o Brain 02.
  - **RAT-D025**: antes de inativar o sócio, ele sai de todos os clientes, ativos e inativos (o sistema mostra a lista; R-S04b aprovada); ao inativar o sócio, os recebedores ativos dele são inativados junto, com lista e confirmação (PEND-2); cliente ativo nunca fica sem sócio (responde à M-02). Mensalidade obrigatória, maior que zero e editável. A troca de sócios vale a partir de agora, sem vigência. O sócio não guarda CPF nem CNPJ.
- **Decisões do responsável na validação (registradas no Brain ou neste plano):**
  - **Complemento da RAT-D017 (26/11/2026)**: o tipo do cliente aparece só como "CPF" ou "CNPJ" (R-C02b; QA-CAD-02).
  - **RAT-D026 (27/11/2026)**: limites de itens ativos por cadastro, 2 apelidos por sócio, 2 nomes e 2 documentos por cliente, 30 variações do nome, 10 chaves Pix e 10 contas por recebedor (R-G09; CA-26; QA-CAD-07).
  - **Busca de documento pelo começo do número (27/11/2026)**: decisão do responsável registrada neste plano (R-C17; QA-CAD-08); não tem RAT própria.

### PROPOSTA

- Escrita só por RPC, com concorrência por `updated_at` (4.3); sem `use cache` (4.5).
- Lista consolidada de apelidos e identificadores (3.1).
- Regras de sócio: R-S01–R-S03, R-S05, R-S08.
- Regras de recebedor: R-R02, R-R03, R-R06b, R-R07–R-R09.
- Regras de cliente: R-C02b (dedução do tipo), R-C06, R-C08, R-C12–R-C16.
- Forma da R-G09: garantia no banco e espelho na tela e na validação do servidor, num ponto único do código.
- Regras de apelido: R-A01–R-A08.
- Matriz (seção 6, base aprovada na FND); campos de motivo exibidos (seção 7); etapas (seção 8).

### DECISÃO PENDENTE

- Nenhuma nesta feature (PEND-1 e PEND-2 respondidas em 25/11/2026: RAT-D023 e RAT-D025).
- Fora desta feature: P-02b, P-20 (antes de dados reais), P-24, M-01.
