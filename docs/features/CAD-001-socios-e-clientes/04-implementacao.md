# CAD-001 — Sócios, Recebedores e Clientes · Registro de implementação

| Campo | Valor |
|---|---|
| Feature | CAD-001 — Sócios, Recebedores e Clientes |
| Agente | `desenvolvedor` |
| Data | 25/11/2026 |
| Plano | `01-plano.md` (revisão 3) |
| Modelagem | `02-modelagem-dados.md` (revisão 2, gate G1) |
| Escopo desta execução | **E3b** (ver a seção "E3b" no fim: migration 4, correção da 3, seed e tipos). Antes: **E3a, parte 1**: migrations `20261125000100_cad_base.sql` e `20261125000200_cad_tables.sql`, com os testes pgTAP. **E3a, parte 2**: migration `20261125000300_cad_partner_receiver_rpcs.sql` (funções de sócio e recebedor) e os testes delas. Fora: migration 4 (funções de cliente e busca), seed, TypeScript e telas |
| Status | Partes 1 e 2 e E3b prontas para revisão. **Não** é entrega final: `seguranca` e `qa` ainda não revisaram. Nada foi aplicado fora do banco local |

## E3a, parte 1

### Passo 1: migration `0100_cad_base`

Arquivo: `supabase/migrations/20261125000100_cad_base.sql` (modelagem 2.3, 3.2, 3.3, 6.1, 7.2, 10.1 ordem 1).

| Objeto | Observação |
|---|---|
| Enums `receiver_identifier_type` (`NAME_VARIANT`, `PIX_KEY`, `BANK_ACCOUNT`) e `client_alias_type` (`NAME`, `DOCUMENT`) | Conforme 2.3 |
| `private.normalize_document`, `is_valid_cpf`, `is_valid_cnpj`, `is_valid_document` | `IMMUTABLE`, `PARALLEL SAFE`, `SECURITY INVOKER`, `search_path = ''`. CNPJ numérico e alfanumérico no mesmo cálculo (valor = ASCII − 48; pesos 5..2,9..2 e 6..2,9..2). Execute para `authenticated` e `service_role` |
| `private.normalize_client_alias(tipo, texto)` | `NAME` por `normalize_alias`; `DOCUMENT` por `normalize_document` + DV. Erros `22023` com `hint` (`NAME_REQUIRED`, `NAME_TOO_LONG`, `INVALID_DOCUMENT`). Sem grant |
| `private.normalize_receiver_identifier(tipo, valor, banco, agência, conta)` | Tabela 3.3 inteira. Hints `NAME_REQUIRED`, `NAME_TOO_LONG`, `INVALID_PIX_KEY`, `INVALID_BANK`, `INVALID_BRANCH`, `INVALID_ACCOUNT`. Sem grant |
| `private.require_admin()` | `42501` com `hint = ADMIN_REQUIRED`. Sem grant |
| `private.assert_version(atual, esperada)` | `22023 VERSION_REQUIRED` e `P0001 STALE_VERSION` (com `detail` `{"current_updated_at":…}`). Sem grant |

### Passo 2: migration `0200_cad_tables`

Arquivo: `supabase/migrations/20261125000200_cad_tables.sql` (modelagem 2.4 a 2.10, 4, 5, 7, 8, 9, 10.1 ordem 2).

- Seis tabelas: `partner_aliases`, `receivers`, `receiver_identifiers`, `clients`, `client_aliases`, `client_partners`, com as constraints da modelagem, os índices da seção 5 (inclusive os quatro únicos parciais) e `comment on table`.
- Em cada tabela: `*_set_updated_at`, `*_audit` (`audit_row_change('<entidade>')`), `*_no_delete` (`prevent_mutation`), `*_no_truncate` (`prevent_truncate`) e `*_prepare` (`SECURITY DEFINER`, `search_path = ''`).
- `partners` **não ganha coluna**: ganha só o trigger `partners_guard` (`id`/`created_at` imutáveis; I-11; I-02 b e I-05 b).
- `private.assert_partner_name_free` e `private.assert_client_document_free`: trava consultiva por valor + checagem do dono (`23505`, `hint` e `detail` JSON conforme 6.3).
- Constraint triggers diferidos de I-01: `clients_require_partner` e `client_partners_keep_partner`, ambos com `private.assert_client_has_partner()` (`23514`, `hint = CLIENT_WITHOUT_PARTNER`).
- RLS ligado nas seis; políticas de leitura da 7.1 (inclusive `client_aliases_select_business` com inativos só para o Administrador); `grant select` da 7.2 e nenhum privilégio de escrita para `authenticated`. Todas as funções novas com `revoke execute ... from public`.

### Passo 3: testes pgTAP

| Arquivo | Conteúdo | Testes |
|---|---|---:|
| `01_catalog.test.sql` (alterado, 12.1) | `>= 10` tabelas; lista de `private` executável por `authenticated` ganha as 4 funções de documento; auditadas passam de 3 para 9. As demais asserções ficam **sem mudança** (inclusive "nenhuma `SECURITY DEFINER` em `public`" e "authenticated não escreve em tabela alguma, exceto `proof_files`") | 38 |
| `07_cad_documents.test.sql` | Vetores compartilhados da 12.3 (20 casos, num só `results_eq`), CPF, CNPJ numérico e alfanumérico, `normalize_document`; chave Pix (e-mail, telefone, aleatória, CPF, CNPJ numérico e alfanumérico) e conta (vetor da modelagem e erros por `hint`); apelido do cliente; CHECK de `clients`; I-17 (catálogo); privilégios das funções | 58 |
| `08_cad_partners_receivers.test.sql` | Espaço de nomes do sócio (I-11, nos três sentidos), `detail` do dono, imutabilidade (I-10), recebedor com sócio obrigatório, imutável e ativo (I-04, I-05 a), identificadores (formas, normalização calculada pelo trigger e o enviado ignorado, I-12 por tipo, inativo não bloqueia, reativar bloqueia), inativação do sócio (I-02 b e I-05 b, indicação em cliente ativo **e** inativo), DELETE/TRUNCATE | 77 |
| `09_cad_clients.test.sql` | Mensalidade `numeric(14,2)` (exata, teto, zero, negativo), nomes e observações, documento único entre ativos e inativos, apelidos (ALIAS_TAKEN, DOCUMENT_TAKEN nos dois sentidos, I-10), indicações (par único, reindicar reativa a mesma linha, sócio inativo), I-01 diferido (forçado por `set constraints all immediate`), DELETE/TRUNCATE, ausência de colunas de percentual e vigência | 80 |
| `10_cad_roles_matrix.test.sql` | Leitura das seis tabelas por papel (Administrador, Operador, Visualizador, Sócio, sem papel, inativo, `anon`), escrita direta negada (insert, update e delete, gerados por tabela), `service_role`, políticas só de leitura. A coluna "função de escrita" da 12.2 entra com as migrations 3 e 4 | 172 |
| `11_cad_audit.test.sql` | CREATE nas seis entidades, UPDATE só com colunas alteradas e sem `updated_at`, sem mudança sem linha, motivo e correlação, nada redigido (P-20), DELETE recusado sem rastro, triggers no catálogo | 34 |

Os testes de função de escrita (`save_*`, `set_*_active`, `search_*`), da concorrência com duas conexões (12.4) e das linhas `EVENT` entram com as migrations 3 e 4.

### Comandos e resultados

| Comando | Resultado |
|---|---|
| `npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,postgres-meta,realtime` | Stack no ar (o banco do projeto foi restaurado do backup local) |
| `npx supabase db reset` (várias vezes, a última com as migrations finais) | `Applying migration 20261125000100_cad_base.sql...` e `...000200_cad_tables.sql...` sem erro; seed aplicado; "Finished supabase db reset" |
| `npx supabase test db` (primeira rodada, só com as duas migrations, antes de estender o `01_catalog`) | 237 testes; falharam 2 do `01_catalog` (lista de `private` e contagem de 3 tabelas auditadas), exatamente os que o 12.1 manda estender. `02` a `06` da FND passaram sem mudança |
| `npx supabase test db` (rodada final) | **11 arquivos, 658 testes, todos passaram** (`Result: PASS`). FND: 237. CAD-001: 421 (07: 58, 08: 77, 09: 80, 10: 172, 11: 34) |
| `npx supabase db lint` (padrão e `--schema public,private --level warning`) | `No schema errors found`, sem avisos (a primeira rodada acusou a variável não usada `i` em `is_valid_cpf` e `is_valid_cnpj`; removida) |
| `npx supabase db advisors --local --level warn --fail-on warn` | `No issues found` (saída 0). Em `--level info` aparecem só `unused_index` dos índices novos (banco vazio) e o `unindexed_foreign_keys` de `proof_files` que já existia |
| `EXPLAIN` das checagens do I-11 e de I-12 (psql no contêiner, `enable_seqscan = off`, 200 sócios inseridos e desfeitos) | Todas usam índice: `partners_normalized_name_key`, `partner_aliases_active_key`, `receiver_identifiers_active_key` (prefixo `identifier_type = 'NAME_VARIANT'`), `clients_document_key` |

Um erro real foi achado e corrigido pelos testes: a primeira versão de `private.assert_client_has_partner()` usava `case tg_table_name when 'clients' then new.id else new.client_id end`; o PostgreSQL resolve os campos de `new` ao compilar a expressão, e o campo ausente em cada tabela dava `42703` em todo constraint trigger. Passou a `if/else` com atribuições separadas (comentado no código).

### Referências de rastreio (requisito → arquivo → teste → resultado)

| Requisito | Arquivo | Teste | Resultado |
|---|---|---|---|
| RAT-D024 DV de CPF/CNPJ numérico e alfanumérico, forma canônica | `0100` | `07` (vetores 12.3, CHECK de `clients`) | passou |
| RAT-D023 sem documento do titular; chave Pix CPF/CNPJ aceita | `0200` | `07` (I-17, Pix), `08` | passou |
| RAT-D025 sócio só com nome e apelidos; indicado em cliente ativo ou inativo não é inativado | `0200` (`partners_guard`) | `08` (PARTNER_HAS_CLIENTS nos dois casos) | passou |
| I-01 cliente ativo com ao menos uma indicação ativa | `0200` (constraint triggers) | `09` | passou |
| I-02, I-05 indicação e recebedor ativos só com sócio ativo, nos dois sentidos | `0200` | `08`, `09` | passou |
| I-07 a I-09 unicidades de documento e apelido | `0200` | `09` | passou |
| I-10 imutabilidade, I-11 espaço de nomes, I-12 identificador | `0200` | `08`, `09` | passou |
| I-13 mensalidade `numeric(14,2)` > 0, sem float | `0200` | `09`, `01_catalog` (sem float) | passou |
| I-14 sem exclusão física | `0200` | `08`, `09`, `11`, `01_catalog` | passou |
| I-15 auditoria nas seis tabelas | `0200` | `11`, `01_catalog` (9 tabelas auditadas) | passou |
| I-18 escrita só por função (nenhum grant de escrita) | `0200` | `10`, `01_catalog` | passou |
| RLS e papéis (7.1), Sócio negado, `anon` sem acesso | `0200` | `10` | passou |
| CA-04 (vetores de CNPJ alfanumérico) | `0100` | `07` | passou, com a pendência P-IMPL-01 |

## Desvios da modelagem

| ID | Onde | O que mudou e por quê |
|---|---|---|
| D-IMPL-01 | 6.1 (`assert_version`) | Declarada `STABLE` (o rascunho dizia `IMMUTABLE`) porque monta o `detail` com `jsonb_build_object` sobre `timestamptz`. Também grava o `detail` `{"current_updated_at":…}` pedido na tabela 6.3, que o rascunho não trazia. Sem efeito sobre o contrato |
| D-IMPL-02 | 4.2 (`assert_partner_name_free`, `assert_client_document_free`) | Ganharam um terceiro parâmetro opcional `p_field text default …` ('name' e 'document'). É só o nome do campo no `detail` (`field` da 6.3: `name`, `aliases`, `identifiers`; `document`, `aliases`), que o gatilho que chama conhece e a função não. Não muda a regra. A assinatura de 2 parâmetros do 4.2 não existe mais; quem chamar com 2 usa o padrão |
| D-IMPL-03 | 4.2 / 9.2 (`client_partners_prepare`) | Trava o **sócio** (`for share`, só ao incluir ativa ou reativar) **antes** do cliente (`for no key update`), seguindo a ordem global da 9.2 (sócios → clientes). O 4.2 listava o cliente primeiro. Efeito: nenhum caminho de SQL direto inverte a ordem usada por `save_client` |
| D-IMPL-04 | 3.3 (agência e conta) | A modelagem diz "só `[0-9X]` em maiúsculas" sem dizer o que fazer com outros caracteres. Aceito como separadores só espaço, ponto, hífen e barra; **qualquer outro caractere é recusado** (`INVALID_BRANCH`, `INVALID_ACCOUNT`) em vez de descartado em silêncio, coerente com a regra do documento (3.1). Mesma leitura para a conta: `X` só na última posição |
| D-IMPL-05 | 3.3 (chave Pix) | A modelagem diz "mantendo um `+` inicial". Implementado como: remove só espaço, ponto, parênteses, barra e hífen; um `+` fora do início **permanece** (a chave não é validada por formato, 3.3). Não afeta nenhum vetor |
| D-IMPL-06 | 12.1 (`01_catalog`) | A tabela 12.1 descreve o estado final da feature (8 invólucros públicos e 6 implementações privadas). Nesta parte, só existem as 4 funções de documento, então só elas entraram na lista de `private` e a lista de `public` **não mudou** (continua só as duas RPCs de comprovante). As demais entram com as migrations 3 e 4 |
| D-IMPL-07 | 12.2 (nomes e escopo dos arquivos) | `08`, `09`, `10` e `11` existem agora com os testes **de nível de tabela** (triggers, constraints, RLS, auditoria por trigger). Os testes das funções públicas entram nos mesmos arquivos nas etapas seguintes |

## Pendências

| ID | Item |
|---|---|
| P-IMPL-01 | **ENCERRADA na parte 2.** O exemplo oficial do CNPJ alfanumérico `12.ABC.345/01DE-35` foi **conferido pelo orquestrador** no material da Receita Federal (perguntas e respostas sobre o CNPJ alfanumérico, gov.br) e no PDF do Serpro sobre o cálculo do DV. O recálculo independente da parte 1 (DV1: soma 459, resto 8, DV = 3; DV2: soma 424, resto 6, DV = 5), confirmado pelo banco, bate com a fonte oficial. A condição do G1 sobre o exemplo está cumprida |
| P-IMPL-02 | Vetores CPF `00000000191`, `00000000272` e `10000000957` e o CNPJ numérico `99999999000191`, vindos da 12.3, foram recalculados em script (fictícios, gerados pelo algoritmo, RAT-D019). Os alfanuméricos `ZZ0TESTE000363`, `ZZ0TESTE000444` e `EX0A1B2C000119` foram calculados por mim e usados só nos testes. Nenhum entra no seed |
| P-IMPL-03 | Teste de concorrência com duas conexões (12.4) e `seed.sql` (13): não fazem parte desta parte |
| P-IMPL-04 | `npm run db:types` não rodado (pedido: nenhuma mudança em TypeScript). Os tipos gerados ficam desatualizados até a etapa que tocar o código da aplicação |
| P-IMPL-05 | Os avisos `unused_index` dos índices novos (modo `info` do `db advisors`) são esperados com o banco vazio e não são ação |

## Handoff

Parte 1 pronta para as próximas partes do E3a (migration 3, RPCs de sócio e recebedor). A revisão de `seguranca` (olhar em especial: as guardas `SECURITY DEFINER` e o `detail` com dados do dono, 18) e de `qa` continua obrigatória antes de qualquer fechamento da feature. O stack do Supabase local fica no ar.

---

## E3a, parte 2

### Passo 1: migration `0300_cad_partner_receiver_rpcs`

Arquivo: `supabase/migrations/20261125000300_cad_partner_receiver_rpcs.sql` (modelagem 6.1 a 6.5, 7.2, 8, 9 e 10.1 ordem 3).

| Função (`private` = SECURITY DEFINER; `public` = invólucro SECURITY INVOKER de uma linha) | Comportamento |
|---|---|
| `save_partner(p_partner_id, p_name, p_aliases text[], p_expected_updated_at, p_reason, p_correlation_id)` | Nome e apelidos como estado final, tudo ou nada. Novo (`p_partner_id` nulo) nasce ativo; edição trava o sócio (`for no key update`), confere a versão e atualiza o nome só se mudou. Apelidos: inativa os ativos fora da lista; mantém, **reativa a linha inativa mais recente** do mesmo sócio e valor, ou inclui. Mudança só nos apelidos toca `partners.updated_at`. Sem mudança: nenhuma escrita, nenhuma linha de auditoria, `updated_at` inalterado. Sócio inativo pode ser editado |
| `set_partner_active(p_partner_id, p_active, p_expected_updated_at, p_confirmed_receiver_ids uuid[], ...)` | Já na situação pedida: devolve a linha **sem escrever e sem checar a versão**. Reativar: confere a versão e só muda o sócio (não reativa recebedores nem indicações). Inativar: confere a versão; indicação ativa em **qualquer** cliente, ativo ou inativo, dá `PARTNER_HAS_CLIENTS` com a lista; compara **como conjunto** os recebedores ativos com a lista confirmada (diferença dá `RECEIVERS_CHANGED` com a lista atual); inativa os recebedores, depois o sócio, e grava `EVENT partner INACTIVATE {"receiver_ids":[...]}`, tudo na mesma transação e com o motivo em todas as linhas |
| `save_receiver(p_receiver_id, p_partner_id, p_holder_name, p_identifiers jsonb, p_expected_updated_at, ...)` | Titular e identificadores (variação de nome, chave Pix, conta bancária; várias de cada) como estado final. Novo: trava o sócio (`share`), exige sócio ativo. Edição: lê o sócio sem trava, trava sócio e depois recebedor, recusa troca de sócio (`RECEIVER_PARTNER_IMMUTABLE`), confere a versão. Identificadores: normalização única por `normalize_receiver_identifier`; repetidos viram um só; inativa os ausentes, mantém, reativa ou inclui. Chave Pix com formato de CPF ou CNPJ é aceita e guardada só como chave Pix (RAT-D023). Recebedor inativo pode ser editado |
| `set_receiver_active(p_receiver_id, p_active, p_expected_updated_at, ...)` | Reativar trava o sócio (`share`) **antes** do recebedor e exige sócio ativo (`PARTNER_INACTIVE`); inativar não tem condição extra e os identificadores continuam ativos (6.5). Idempotente como `set_partner_active` |

Em todas: `require_admin()` primeiro, `set_audit_context(p_reason, 'UI', p_correlation_id)` depois, validação e normalização (22023), travas na ordem da 9.2, versão, escritas, retorno da linha do dono. Concessões explícitas: `revoke ... from public` (e de `anon` nos invólucros) e `grant execute ... to authenticated` nas oito funções; nenhum grant de escrita em tabela e nenhuma `SECURITY DEFINER` em `public`. Nenhuma coluna ou política mudou.

### Passo 2: testes pgTAP

| Arquivo | O que entrou | Testes (antes → depois) |
|---|---|---:|
| `01_catalog.test.sql` | Listas de `public` (as 2 de comprovante + `save_partner`, `set_partner_active`, `save_receiver`, `set_receiver_active`) e de `private` (as 4 implementações). As asserções "nenhuma SECURITY DEFINER em `public`" e "authenticated não escreve" ficaram sem mudança | 38 (igual) |
| `08_cad_partners_receivers.test.sql` | Seção "FUNÇÕES DE GRAVAÇÃO", como Administrador, pelas funções públicas, com fixtures próprios (nomes "Rpc", `updated_at` antigo para provar quando a versão muda): `save_partner` (criação, repetidos, grafia, apelido × nome de outro sócio, apelido = próprio nome, retirar e reativar a mesma linha, sem mudança, só apelidos, renomear, `STALE_VERSION`, `VERSION_REQUIRED`, `NAME_*`, `NOT_FOUND`, tudo ou nada, lista nula); `set_partner_active` (bloqueio por cliente ativo e por cliente inativo, `RECEIVERS_CHANGED` nos quatro formatos, cascata, idempotência, reativar não reativa recebedores, versão, `ACTIVE_REQUIRED`); `save_receiver` (variação + 2 Pix + 2 contas, `IDENTIFIER_TAKEN` com `detail`, `PARTNER_NAME_TAKEN`, `PARTNER_INACTIVE`, `NOT_FOUND`, sócio imutável, estado final, reativação da mesma linha, sem mudança, tudo ou nada, Pix com formato de CPF e de CNPJ alfanumérico, todos os `INVALID_*` e `INVALID_IDENTIFIER`); `set_receiver_active` | 77 → 215 |
| `10_cad_roles_matrix.test.sql` | Coluna "função de escrita" da 12.2 para as 4 funções: Operador, Visualizador, Sócio, sem papel e inativo recebem `42501 ADMIN_REQUIRED` sem `detail`; `anon` não tem `EXECUTE`; nada foi escrito; Administrador executa; catálogo (`EXECUTE` de `authenticated` nas 8, de `anon` em nenhuma, `PUBLIC` em nenhuma; definer em `private`, invoker em `public`) | 172 → 228 |
| `11_cad_audit.test.sql` | Seção "Auditoria das funções de gravação": CREATE/UPDATE/EVENT por função, origem `UI`, ator, papel, `request_role`, `tx_id` único, motivo em todas as linhas da cascata, EVENT `INACTIVATE` com os ids, sem motivo e com motivo só de espaços/tabs/quebras de linha (reason nulo), chamada negada sem rastro | 34 → 61 |

### Concorrência (12.4): verificada à mão, não automatizada

Três cenários com duas sessões `psql` simultâneas no banco local (o `db reset` seguinte apagou os dados):

| Cenário | Resultado |
|---|---|
| `save_receiver` (segura o sócio com `share`) × `set_partner_active(false)` iniciado 1 s depois | A inativação esperou e, depois do commit, recusou com `RECEIVERS_CHANGED` listando o recebedor novo |
| `set_partner_active(false)` (segura o sócio) × `save_receiver` iniciado 1 s depois | A criação esperou e recusou com `PARTNER_INACTIVE` |
| Duas edições de `save_partner` com o mesmo token | A segunda esperou a primeira e recusou com `STALE_VERSION` |

Por que não entrou no pgTAP: `dblink` precisaria de dados confirmados, e as seis tabelas bloqueiam `DELETE` e `TRUNCATE`, então não haveria como limpar sem `db reset`. Os cenários de `client_partners` (CA-07, retiradas simultâneas) dependem de `save_client` e entram com a migration 4.

### Comandos e resultados

| Comando | Resultado |
|---|---|
| `npx supabase db reset` (final, depois da última edição) | `Applying migration 20261125000300_cad_partner_receiver_rpcs.sql...` sem erro; seed aplicado; "Finished supabase db reset" |
| `npx supabase test db` | **11 arquivos, 879 testes, todos passaram** (`Result: PASS`). FND: 237. CAD-001: 642 (07: 58, 08: 215, 09: 80, 10: 228, 11: 61). Antes: 658 |
| `npx supabase db lint` (padrão e `--schema public,private --level warning`) | `No schema errors found`, sem avisos. A primeira rodada acusou `'{}'` sem cast nas variáveis de lista e a variável `i` declarada à toa (o `for i in` já a declara); corrigido na própria migration, ainda não publicada |
| `npx supabase db advisors --local --level warn --fail-on warn` | `No issues found` (saída 0). Em `--level info` só `unused_index` (banco vazio) e o `unindexed_foreign_keys` de `proof_files`, que já existia |

Um achado dos testes (não da função): `now()` é o horário da transação, então dentro de um teste pgTAP o `updated_at` não avança entre chamadas. Os testes de "a versão mudou" usam fixtures inseridos com `updated_at = 2020-01-01` e comparam depois; em produção cada chamada é uma transação própria e a versão avança.

### Referências de rastreio (parte 2)

| Requisito | Arquivo | Teste | Resultado |
|---|---|---|---|
| RAT-D025 inativação bloqueada por indicação em cliente ativo ou inativo | `0300` (`set_partner_active`) e `partners_guard` | `08` (PARTNER_HAS_CLIENTS nos dois casos, com `detail`) | passou |
| RAT-D025 recebedores inativados junto, só com a lista confirmada igual à atual | `0300` | `08` (RECEIVERS_CHANGED: incompleta, nula, com inativo; cascata), `11` (UPDATE por recebedor + EVENT, motivo em todas as linhas) | passou |
| R-S05 reativar o sócio não reativa recebedores | `0300` | `08`, `11` | passou |
| RAT-D023 sócio do recebedor obrigatório e imutável; Pix com formato de CPF/CNPJ; várias chaves e contas | `0300` | `08` | passou |
| RAT-D021 motivo opcional, auditoria obrigatória | `0300` | `11` (com, sem e em branco) | passou |
| RAT-D011/D020 só o Administrador escreve; negar por padrão | `0300` (`require_admin`, grants) | `10` (5 papéis × 4 funções, `anon`, catálogo) | passou |
| 6.2 estado final, idempotência, versão em texto | `0300` | `08` | passou |
| 9.3 concorrência (sócio × recebedor, edição dupla) | `0300` | à mão, três cenários | verificado, não automatizado |

### Desvios da modelagem (parte 2)

| ID | Onde | O que mudou e por quê |
|---|---|---|
| D-IMPL-08 | 6.2 (listas) | Item **em branco** numa lista (apelido ou variação) é recusado com `NAME_REQUIRED` em vez de ser descartado em silêncio, pelo mesmo critério da D-IMPL-04. A tela deve tirar as linhas vazias antes de enviar |
| D-IMPL-09 | 6.3 (contrato de erros) | Três pontos sem hint na tabela, resolvidos sem criar regra: (a) `INVALID_IDENTIFIER` (`22023`) para `p_identifiers` que não é array, item que não é objeto, `type` desconhecido, chave desconhecida ou fora do tipo, valor que não é texto (um número JSON perderia os zeros da agência); (b) `ACTIVE_REQUIRED` (`22023`) para `p_active` nulo em `set_*_active`; (c) `NOT_FOUND` com `detail {"field":"partner_id"}` para sócio nulo ou inexistente em recebedor novo. **Proposta:** acrescentar as duas chaves à tabela 6.3 e ao `mapDatabaseError` |
| D-IMPL-10 | 6.4 | `p_aliases`, `p_identifiers` e `p_confirmed_receiver_ids` nulos valem lista vazia (estado final), como a 6.4.2 já dizia para a lista confirmada. Atenção da aplicação: nulo em `p_aliases` **inativa todos** os apelidos |
| D-IMPL-11 | 6.4.3 (erros de identificador) | Os erros de `normalize_receiver_identifier` são capturados e relançados com o mesmo `hint` e com `detail {"field":"identifiers","value":...}` (a 6.3 pede o valor; a função pura não o traz) |
| D-IMPL-12 | 12.2 (arquivos) | A 12.2 põe os testes das funções em `08`, `10` e `11`; foram **acrescentados nesses arquivos** (seções com fixtures próprios), e os `plan(n)` foram atualizados, em vez de criar arquivo novo |
| D-IMPL-13 | 9.2 (`save_receiver`, edição) | A edição lê o `partner_id` do recebedor sem trava (é imutável), trava o sócio `share` e só então o recebedor, para respeitar a ordem global também na edição |

### Pendências (parte 2)

| ID | Item |
|---|---|
| P-IMPL-03 | Continua aberta, mas reduzida: teste de concorrência **automatizado** (12.4) não foi feito (ver acima) e o `seed.sql` (13) não faz parte desta parte. Os cenários de `client_partners` ficam para a migration 4 |
| P-IMPL-04 | `npm run db:types` continua sem rodar; as quatro funções novas só aparecem nos tipos gerados quando a etapa que tocar o TypeScript rodar |
| P-IMPL-06 | `INVALID_IDENTIFIER` e `ACTIVE_REQUIRED` precisam entrar na tabela 6.3 da modelagem e no mapeamento de erros da aplicação (a aprovar) (resolvido: a tabela 6.3 foi atualizada pelo `modelagem-dados` na revisão 3 de `02-modelagem-dados.md`, com a PEND-M3 encerrada) |
| P-IMPL-07 | `src/lib/errors.ts` ainda não lê `hint`/`detail` (6.3): trabalho da etapa de aplicação, fora do pedido |

### Handoff (parte 2)

Pronto para a migration 4 (`save_client`, `set_client_active`, `search_clients`, `search_aliases`) e para revisão de `seguranca` (olhar em especial: `SECURITY DEFINER` das quatro implementações, `detail` com dados do dono só depois de `require_admin`, `FOR SHARE`/`FOR NO KEY UPDATE`) e `qa`, obrigatória antes de qualquer fechamento. O stack do Supabase local fica no ar; nada foi aplicado fora dele.

---

## E3b

Escopo: correção da migration 3 (listas nulas), migration `20261125000400_cad_client_rpcs.sql` (`save_client`, `set_client_active`, `search_clients`, `search_aliases`), pgTAP, seed local e tipos gerados. Sem TypeScript além dos tipos gerados. Status: **pronta para revisão**; segurança e QA ainda não revisaram.

### Passo 1: correção da migration 3 (lista nula recusada)

Migration `20261125000300_cad_partner_receiver_rpcs.sql`, ainda não publicada, editada (decisão do orquestrador): antes, `p_aliases` nulo e `p_identifiers` nulo valiam lista vazia e **inativavam todos** os itens por descuido.

| Função | Antes | Agora |
|---|---|---|
| `save_partner` | `p_aliases` nulo = `{}` | `22023` `LIST_REQUIRED`, `detail {"field":"aliases"}` |
| `save_receiver` | `p_identifiers` nulo ou JSON `null` = `[]` | `22023` `LIST_REQUIRED`, `detail {"field":"identifiers"}` |
| `set_partner_active` | `p_confirmed_receiver_ids` nulo = vazio | **sem mudança** (ver D-IMPL-14) |

A lista vazia (`'{}'`, `'[]'`) continua significando "nenhum item". A checagem é a primeira validação, logo depois do `require_admin()` e do `set_audit_context()`.

Hint: a tabela 6.3 não tinha hint genérico de parâmetro obrigatório; foi criado **`LIST_REQUIRED`** (`22023`), ver D-IMPL-15.

Testes: `08` trocou os "lista nula = vazia" por "nula recusada (SQL e JSON null), nada inativado, vazia inativa" (+7 testes, 215 → 222), e as chamadas que passavam `null` sem querer passaram a `'{}'::text[]`/`'[]'::jsonb`; `11` idem (2 chamadas de preparo).

### Passo 2: extensão do contrato 6.3 (hints novos)

A pedido do orquestrador, os hints `INVALID_IDENTIFIER` e `ACTIVE_REQUIRED` da parte 2 estão **aprovados tecnicamente** como extensão da tabela 6.3. Junto com os criados nesta etapa, a extensão fica assim (a leitura de todos no `mapDatabaseError` é da E4; a tabela 6.3 da modelagem **não foi editada**):

| `hint` | SQLSTATE | Quando | `detail` (JSON) | Origem |
|---|---|---|---|---|
| `INVALID_IDENTIFIER` | `22023` | `p_identifiers` (recebedor) ou `p_aliases` (cliente) que não é array, item que não é objeto, `type` desconhecido, chave desconhecida, valor que não é texto | `{"field":"identifiers"}` ou `{"field":"aliases"}` | parte 2 (aprovado); reaproveitado nos apelidos do cliente |
| `ACTIVE_REQUIRED` | `22023` | `p_active` nulo em `set_*_active` | — | parte 2 (aprovado); vale também em `set_client_active` |
| `LIST_REQUIRED` | `22023` | lista de estado final **nula**: `p_aliases` (sócio e cliente), `p_identifiers` (JSON `null` também), `p_partner_ids` (cliente) | `{"field":"aliases"\|"identifiers"\|"partner_ids"}` | **nova** (ver D-IMPL-14 e D-IMPL-15) |
| `INVALID_FILTER` | `22023` | `search_clients`/`search_aliases`: situação, tipo, limite (fora de 1 a 100) ou deslocamento (negativo) inválidos | `{"field":"status"\|"kind"\|"limit"\|"offset"}` | **nova** |
| `NOT_FOUND` com `detail` | `P0002` | sócio da lista inexistente (`save_client`, `partner_ids`) ou nulo dentro da lista | `{"field":"partner_ids"}` | detalhe novo; o hint já existia |

### Passo 3: migration `0400_cad_client_rpcs`

Arquivo: `supabase/migrations/20261125000400_cad_client_rpcs.sql` (modelagem 6.4.5 a 6.4.7, 7.2, 8, 9, 10.1 ordem 4, 11.4 a 11.6). Mesmo desenho da `0300`: `private` `SECURITY DEFINER` com `search_path = ''`, primeira instrução `require_admin()`, segunda `set_audit_context(p_reason, 'UI', p_correlation_id)`, invólucro `public` `SECURITY INVOKER` de uma linha; `revoke ... from public` (e de `anon` em `public`) e `grant execute ... to authenticated` explícitos. Nenhuma tabela, coluna ou política mudou.

| Função | Comportamento |
|---|---|
| `save_client` (12 parâmetros) | Tudo ou nada. (1) Validação: lista de sócios e de apelidos nulas, `LIST_REQUIRED`; nome (1 a 200, não só pontuação), fantasia, observações (2000), documento (`normalize_document` + `is_valid_document`, em branco = sem documento), mensalidade por `private.to_money` (erros `22023` e `22003` viram `INVALID_AMOUNT`) e `> 0`, sócios sem repetição e em ordem de `id`, apelidos `{"type":"NAME"\|"DOCUMENT","value"}` normalizados por `normalize_client_alias` (repetidos viram um). (2) Lê o cliente sem trava para o `NOT_FOUND`. (3) Trava os sócios da lista `for share` em ordem de `id`: inexistente `NOT_FOUND`, inativo `PARTNER_INACTIVE` com os nomes; depois o cliente `for no key update` e `assert_version`. (4) Cliente ativo (sempre no novo) com lista vazia: `CLIENT_WITHOUT_PARTNER`; inativo pode ficar sem sócio. (5) Documento novo ou trocado: `assert_client_document_free` (dono no `detail`, só depois do `require_admin()`). (6) Aviso de nome repetido (11.4): só no novo ou quando nome, fantasia ou apelidos `NAME` mudaram; se algum parecido (ativo ou inativo) não está em `p_acknowledged_duplicate_ids`, `POSSIBLE_DUPLICATE` com a lista, sem gravar nada. (7) Insert ou update só se algo mudou (o `active` nunca é mudado aqui). (8) Indicações: inativa as ausentes, reativa a mesma linha ou inclui; se o conjunto mudou grava `EVENT PARTNERS_CHANGE` (antes, depois, contagens). (9) Apelidos: como em `save_partner` (mantém, reativa a linha inativa mais recente, inclui; inativa os ausentes). (10) Mudou só filho: toca `clients.updated_at`. Aviso confirmado grava `EVENT DUPLICATE_WARNING_ACK` com os ids dos parecidos que existiam. Sem mudança: nenhuma escrita e nenhuma linha de auditoria |
| `set_client_active` | `ACTIVE_REQUIRED`, `NOT_FOUND`; já na situação pedida devolve sem escrever e sem checar a versão; `assert_version`; reativar sem indicação ativa `CLIENT_WITHOUT_PARTNER` (o gatilho diferido repete no `COMMIT`); inativar mantém as indicações ativas (6.5) |
| `search_clients` (só `public`, `STABLE`, `INVOKER`) | Filtra por situação (`ACTIVE` padrão, `INACTIVE`, `ALL`); texto casa nome, nome fantasia ("contém", normalizados), documento (prefixo, só `[0-9A-Z]{1,14}`), apelido `NAME` ativo ("contém") e apelido `DOCUMENT` ativo (prefixo); ordem `normalized_name, id`; `partner_count` das indicações ativas; mensalidade em **texto**; `total_count` por `count(*) over ()`. O RLS vale: Sócio, sem papel e inativo recebem 0 linhas; `anon` não tem `EXECUTE` |
| `search_aliases` (só `public`, `STABLE`, `INVOKER`) | Lista consolidada (`PARTNER_ALIAS`, `CLIENT_ALIAS`, `NAME_VARIANT`, `PIX_KEY`, `BANK_ACCOUNT`) com dono (`PARTNER`, `CLIENT` ou `RECEIVER`) e sócio. Só o Administrador recebe linhas (`if not private.is_admin() then return`); os demais recebem vazio. Filtros de situação (do item) e de tipo; `total_count` |

Travas: sócios (`share`) antes do cliente (`no key update`), a ordem global da 9.2.

### Passo 4: pgTAP

| Arquivo | O que entrou | Testes (antes → depois) |
|---|---|---:|
| `01_catalog.test.sql` | Lista de `public` ganha `save_client`, `set_client_active`, `search_clients`, `search_aliases` (8 de cadastro + 2 de comprovante); lista de `private` ganha `save_client` e `set_client_active`. "Nenhuma `SECURITY DEFINER` em `public`" e "authenticated não escreve" sem mudança | 38 (igual) |
| `08_cad_partners_receivers.test.sql` | Lista nula recusada (`LIST_REQUIRED`, SQL e JSON `null`, nada inativado) e lista vazia inativa todos; chamadas que passavam `null` por descuido passaram a `'{}'`/`'[]'` | 215 → 222 |
| `09_cad_clients.test.sql` | Seção "FUNÇÕES DE CLIENTE", como Administrador, pelas funções públicas, com fixtures próprios (`Rpc`, `updated_at` antigo): criação completa (CNPJ alfanumérico com máscara, CPF, CNPJ numérico, minúsculas, sem documento, documento só pontuação), `INVALID_DOCUMENT`, `DOCUMENT_TAKEN` (ativo, inativo, apelido-documento, nos dois sentidos, com `detail` do dono), `ALIAS_TAKEN`, `INVALID_AMOUNT` (10 valores), nomes e observações, `LIST_REQUIRED`, `INVALID_IDENTIFIER`, apelidos inválidos, sócios (vazio, repetido, inativo, inexistente), versão, sem mudança, só mensalidade, troca de sócios (mesma linha reativada, `PARTNERS_CHANGE`), tudo ou nada, inativo sem sócios, aviso de nome repetido (parcial, vazio, completo, id sem relação, parecido novo, fantasia, apelido, com documento, edição), `search_clients` (nome, fantasia, documento com e sem pontuação, apelidos, situação, curinga, paginação, total, filtros inválidos), `search_aliases` (cinco tipos, situação, filtros inválidos), `set_client_active` (idempotência, versão, reativação recusada com indicação inativa e sem indicação) | 80 → 280 |
| `10_cad_roles_matrix.test.sql` | As seis funções de escrita nos cinco papéis (`42501 ADMIN_REQUIRED` sem `detail`) e em `anon`; nada escrito; Administrador executa; `search_clients` (Admin, Operador e Visualizador leem; Sócio, sem papel e inativo 0 linhas; `anon` `42501`); `search_aliases` (só o Administrador); catálogo com as 14 funções, 8 invólucros/buscas `INVOKER` e 6 implementações `DEFINER`, buscas `STABLE`. Os escopos `like 'f%'` viraram `like 'f_000000-0000-4000-8000-%'` (ver D-IMPL-24) | 228 → 270 |
| `11_cad_audit.test.sql` | Seção de funções de cliente: criação (CREATE de cliente, indicações e apelidos + `PARTNERS_CHANGE`), edição com troca de sócios (antes e depois, contagens, motivo em todas as linhas), só mensalidade sem motivo, aviso confirmado (`DUPLICATE_WARNING_ACK`), inativar e reativar, `save_client` negado sem rastro. As asserções de nível de tabela passaram a ler uma view só da transação (D-IMPL-24) | 61 → 81 |

### Passo 5: concorrência (12.4, 9.3): verificada à mão, não automatizada

Duas sessões `psql` simultâneas no banco local (a segunda iniciada 1,5 s depois, a primeira segurando a transação por 4 s), como `postgres` ou como o Administrador do `seed:dev` (`request.jwt.claims`). Os dados criados ficaram só no banco local e foram descartados pelo `db reset` seguinte.

| Cenário | Resultado |
|---|---|
| **CA-07**: duas retiradas simultâneas (`update client_partners set active = false`), cada uma do "outro" sócio de um cliente com 2 sócios | A segunda esperou ~3 s a trava do cliente (`client_partners_prepare`) e, no `COMMIT`, o gatilho diferido recusou com `CLIENT_WITHOUT_PARTNER`; um sócio ficou ativo |
| Duas `save_client` com o mesmo token, uma retirando cada sócio | A segunda esperou e recusou com `STALE_VERSION` (com `current_updated_at`); o cliente manteve um sócio |
| `save_client` indicando o sócio P × `set_partner_active(P, false)` 1,5 s depois | A inativação esperou e recusou com `PARTNER_HAS_CLIENTS`, listando o cliente novo |
| `set_partner_active(P, false)` × `save_client` indicando P 1,5 s depois | O cadastro esperou e recusou com `PARTNER_INACTIVE` |

Por que não entrou no pgTAP: as tabelas bloqueiam `DELETE`/`TRUNCATE`, então um teste com `dblink` e dados confirmados não teria como se limpar sem `db reset` (mesma razão da parte 2).

### Passo 6: seed local (`supabase/seed.sql`, 13)

Sócios A, B e C (já existiam) + 2 apelidos de sócio; 4 recebedores (o de C inativo); 4 identificadores (variação de nome, Pix por e-mail, Pix por chave aleatória, conta); 4 clientes: "Cliente Modelo Ltda" (CNPJ alfanumérico, 1.500,00, sócios A e B, apelido `NAME`), "Comércio Fictício Ltda" (CNPJ alfanumérico, 900,00, A, B e C), "Pessoa Exemplo" (sem documento, 350,00, C) e "Cliente Antigo Ltda" (sem documento, **inativo**, sem sócios). Tudo na mesma transação (o gatilho diferido de I-01 só confere no `COMMIT`), com ids explícitos. Nenhum CPF. Os dois CNPJ (`EX0SEED0000127`, `EX0SEED0000208`) foram gerados pelo algoritmo e validados pelo `CHECK` da tabela no `db reset`.

`npm run seed:dev` da FND continua funcionando: o seed SQL roda no `db reset` (sem usuários); o script cria os usuários e papéis depois (rodado nesta etapa: 5 usuários, verificação pelo RLS de sócios visíveis igual a antes).

### Passo 7: tipos gerados

`npm run db:types` regenerou `src/types/database.types.ts` (+237 linhas: 6 tabelas, 2 enums, as 8 funções de `public`). Nenhum outro TypeScript foi escrito. `npm run typecheck`: sem erro.

### Comandos e resultados (E3b)

| Comando | Resultado |
|---|---|
| `npx supabase db reset` (final, depois da última edição de migration, teste e seed) | As 9 migrations aplicadas sem erro, inclusive `20261125000400_cad_client_rpcs.sql`; seed aplicado; "Finished supabase db reset" |
| `npx supabase test db` | **11 arquivos, 1148 testes, todos passaram** (`Result: PASS`). FND (01 a 06): 237. CAD-001: 911 (07: 58, 08: 222, 09: 280, 10: 270, 11: 81). Antes: 879 |
| `npx supabase db lint` e `db lint --schema public,private --level warning` | `No schema errors found`, sem avisos |
| `npx supabase db advisors --local --level warn --fail-on warn` | `No issues found` (saída 0). Em `--level info`: `unused_index` (banco sem uso) e o `unindexed_foreign_keys` de `proof_files` que já existia |
| `npm run db:types` / `npm run typecheck` | Tipos regenerados; typecheck sem erro |
| `npm run seed:dev` | Concluído (5 usuários e papéis) sobre o banco semeado |

Falhas achadas e corrigidas pelos testes (nenhuma era regra de negócio): (a) o seed mudou o banco de teste, e 11 e 10 tinham escopos amplos (`audit_logs` inteiro, `id like 'f%'`); (b) `count(*)` de `search_clients` sem texto bate no limite padrão de 25, então o teste compara `total_count`; (c) em 11, `created_at` é o `now()` da transação (igual para todos os clientes), então os fixtures dos clientes homônimos são separados pela ordem de `audit_logs.seq`.

### Referências de rastreio (E3b)

| Requisito | Arquivo | Teste | Resultado |
|---|---|---|---|
| Lista de estado final nula recusada (decisão do orquestrador) | `0300`, `0400` | `08`, `09` | passou |
| RAT-D024 documento opcional, único entre ativos e inativos, CPF/CNPJ numérico e alfanumérico | `0400` + `0200` | `09` (`INVALID_DOCUMENT`, `DOCUMENT_TAKEN`) | passou |
| U-C02 erro de documento repetido com id, nome e situação do dono, só depois do `require_admin()` | `0400` | `09` (`detail`), `10` (negado sem `detail`) | passou |
| R-C15 aviso de nome repetido com lista confirmada | `0400` | `09`, `11` (`DUPLICATE_WARNING_ACK`) | passou |
| RAT-D025 mensalidade `> 0` em texto decimal, convertida por `private.to_money` | `0400` | `09` (`INVALID_AMOUNT`, CA-10) | passou |
| I-01 cliente ativo com sócio; reativar sem sócio recusado | `0400` + `0200` | `09`, concorrência CA-07 | passou |
| RAT-D025 a troca de sócios vale dali em diante e fica na auditoria | `0400` | `09`, `11` (`PARTNERS_CHANGE`) | passou |
| RAT-D021 motivo opcional; RAT-D009 auditoria obrigatória | `0400` | `11` (com, sem, em todas as linhas) | passou |
| RAT-D011/D020 só o Administrador escreve; buscas por papel | `0400` | `10` | passou |
| 9.3 concorrência | `0400` | à mão, quatro cenários | verificado, não automatizado |

### Desvios da modelagem (E3b)

| ID | Onde | O que mudou e por quê |
|---|---|---|
| D-IMPL-14 | 6.4.2 e 6.4.5 | Lista nula é recusada só nas **listas de estado final** (`p_aliases`, `p_identifiers`, `p_partner_ids`). `p_confirmed_receiver_ids` e `p_acknowledged_duplicate_ids` são **confirmações**: nulo vale vazio e nunca apaga nada (com recebedor ativo, a confirmação vazia dá `RECEIVERS_CHANGED`; com parecido, `POSSIBLE_DUPLICATE`). Substitui a D-IMPL-10 |
| D-IMPL-15 | 6.3 | Hints novos `LIST_REQUIRED` e `INVALID_FILTER` e `detail` do `NOT_FOUND` (quadro do passo 2). Não havia hint genérico de parâmetro inválido na 6.3 |
| D-IMPL-16 | 6.4.5 e 9.2 | `save_client` trava os **sócios antes do cliente** (a 9.2 manda; a lista da 6.4.5 punha o cliente primeiro) e lê o cliente sem trava antes só para o `NOT_FOUND`, como `save_receiver` |
| D-IMPL-17 | 6.4.5 passo 6 e 11.4 | O conjunto de nomes comparado é o do 11.4: nome e nome fantasia. Mudar o conjunto de apelidos `NAME` **dispara** a checagem (6.4.5), mas os apelidos do cliente não entram no conjunto: a 11.4 e a 6.4.5 não dizem que entram. **PERGUNTA**: o apelido `NAME` novo de um cliente que for igual ao nome de outro cliente deve avisar? Hoje não avisa (o único bloqueio é apelido igual a apelido, `ALIAS_TAKEN`) |
| D-IMPL-18 | 6.4.5 | O aviso vale também para cliente com documento (a 6.4.5 não restringe; o texto do orquestrador dizia "sem documento" como ênfase da R-C15). Nome fantasia só com pontuação é recusado (`NAME_REQUIRED`, campo `trade_name`) em vez de descartado em silêncio (mesmo critério da D-IMPL-08) |
| D-IMPL-19 | 8 e 11.4 | O `detail` de `POSSIBLE_DUPLICATE` traz **todos** os parecidos (inclusive os já confirmados) e a confirmação precisa cobri-los todos; o `EVENT DUPLICATE_WARNING_ACK` grava só os parecidos que existiam, não ids avulsos enviados a mais |
| D-IMPL-20 | 6.4.7 e 11.5 | `search_clients`: o apelido só casa se estiver **ativo** (a 11.5 diz "visível pelo RLS", o que faria o Administrador achar o cliente por apelido inativo e os demais não; o resultado mudaria conforme o papel). Valores nulos de situação, limite e deslocamento viram o padrão; fora da faixa (limite 1 a 100, deslocamento negativo, situação desconhecida) é `INVALID_FILTER`. Deslocamento além do fim devolve zero linhas e, portanto, nenhum `total_count`: a tela pega o total da primeira página |
| D-IMPL-21 | 6.4.7 e 11.6 | `search_aliases`: a modelagem só fixa a assinatura. Regras escolhidas: apelidos e variações pelo valor normalizado ("contém"); apelido-documento pelo prefixo do documento canônico; chave Pix e conta por "contém" no valor normalizado, com o texto em minúsculas ou só alfanumérico (conta achada com ou sem hífen). `owner_kind` é `PARTNER`, `CLIENT` ou `RECEIVER`; a conta aparece como `banco / agência / conta`; `p_status` é a situação do **item**; limite de 1 a 100 |
| D-IMPL-22 | 6.4.5 passo 1 | `INVALID_AMOUNT` cobre também o estouro do tipo (`22003`, capturado) e o zero, sem pré-comparar com o teto: o resultado é o mesmo do que a modelagem descreve |
| D-IMPL-23 | 13 (seed) | Os valores do seed **diferem** da tabela 13: CNPJ `EX0SEED0000127` e `EX0SEED0000208` (não `ZZ0TESTE000100`/`000282`), apelido de cliente "Mod. Semente" (não "Modelo"), Pix `semente.a@example.com`, variação "Socio Ex Semente A", conta Banco Semente, agência 0002, conta 65432-1, chave aleatória `...0b1`. Motivo: os pgTAP rodam sobre o banco semeado e usam os valores da 13 como fixtures (documento, apelido, Pix e conta únicos): colidiriam. Mesmo conjunto de situações (1, 2 e 3 sócios, com e sem documento, um inativo, um recebedor inativo) |
| D-IMPL-24 | 12 (testes) | Com o seed, o banco de teste deixa de estar vazio: `11` lê, no nível de tabela, uma view `pg_temp.cur_audit` com só as linhas da transação (`tx_id = pg_current_xact_id()`), e `10` escopa por `like 'f_000000-0000-4000-8000-%'` (o `like 'f%'` pegaria ids aleatórios do seed; o `client_partners` do seed ganhou ids explícitos). Nenhuma asserção foi enfraquecida |

### Pendências (E3b)

| ID | Item |
|---|---|
| P-IMPL-03 | **Encerrada**: concorrência verificada à mão (quatro cenários); automatizar fica fora, pelo mesmo motivo da parte 2; `seed.sql` feito |
| P-IMPL-04 | **Encerrada**: `db:types` rodado e `typecheck` verde |
| P-IMPL-06 | `INVALID_IDENTIFIER` e `ACTIVE_REQUIRED` aprovados tecnicamente; juntos com `LIST_REQUIRED`, `INVALID_FILTER` e o `detail` do `NOT_FOUND` precisam entrar na tabela 6.3 da modelagem (a editar por quem tem o documento) e no `mapDatabaseError` da E4 (resolvido: a tabela 6.3 foi atualizada pelo `modelagem-dados` na revisão 3 de `02-modelagem-dados.md`, com a PEND-M3 encerrada) |
| P-IMPL-07 | Continua: `src/lib/errors.ts` ainda não lê `hint`/`detail` (E4) |
| P-IMPL-08 | **Pergunta aberta**: D-IMPL-17 (apelido `NAME` igual ao nome de outro cliente deve avisar?) |
| P-IMPL-09 | `search_clients` e `search_aliases` usam `like '%x%'` sem índice: aceitável para centenas de linhas (R-D12); `pg_trgm` fica como evolução |
| P-IMPL-10 | Os `unused_index` (modo `info`) seguem esperados |

### Handoff (E3b)

Pronto para revisão de `seguranca` (olhar em especial: `SECURITY DEFINER` de `save_client` e `set_client_active`; `detail` com dados do dono só depois do `require_admin()` e sem vazar para os demais papéis, coberto em `10`; buscas `SECURITY INVOKER` apoiadas no RLS; `search_aliases` devolvendo variações, chaves Pix e contas só ao Administrador; ordem das travas) e de `qa`. **Não** é entrega final. O stack do Supabase local fica no ar, com o banco restaurado do `db reset` e o `seed:dev` aplicado. Nada foi aplicado fora do banco local; o projeto hospedado não foi tocado.

---

## E4

Escopo: base de servidor em TypeScript (documentos, dinheiro, esquemas `zod`, camada de leitura e escrita, `mapDatabaseError`) e Vitest. Sem telas, sem Server Actions de página, sem mudança de banco ou migration, sem dependência nova. Status: **pronta para revisão**; segurança e QA ainda não revisaram.

### Consultas ao Next 16 (`node_modules/next/dist/docs/01-app/`)

| Arquivo | O que decidiu |
|---|---|
| `02-guides/data-security.md` (Data Access Layer, DTOs, `server-only`) | Camada de leitura e escrita só no servidor (`import "server-only"` em todo módulo de `src/server`), devolvendo objetos mínimos (view models), não as linhas cruas; o `cause` do erro nunca vai ao cliente |
| `02-guides/server-actions.md` (Security; escolha de revalidação) | As ações (E5/E6) autenticam e autorizam dentro de cada uma; revalidar com `refresh()` ou `revalidatePath` **antes** de `redirect()`. Nada disso entra na E4 (sem Server Actions): só `getCadastroContext()` e resultados serializáveis (`ActionResult`, sem classe) |
| `02-guides/authentication-with-cache-components.md` | Confirma a decisão do plano 4.5: **sem `use cache`** nos dados de cadastro (dependem de `cookies()` e do papel). Leitura por requisição, atrás de `<Suspense>`; o cliente Supabase já chama `connection()` (E5 da FND) |
| `03-api-reference/04-functions/connection.md`, `refresh.md`, `revalidatePath.md` | Conferidos; a E4 não os chama |

### Passo 1: documentos em TS (`src/domain/documents/document.ts`)

- Espelho de `normalize_document`, `is_valid_cpf`, `is_valid_cnpj` e `is_valid_document`; também `documentTypeOf`, `formatCpf`, `formatCnpj` (agora alfanumérico), `formatDocument`, `describeDocument` e `parseDocumentInput` (mensagens exatas da UI 4.1.2).
- `src/lib/format.ts` passou a reexportar `formatCnpj`, `formatCpf` e `formatDocument` do domínio (o antigo `formatCnpj` só aceitava dígitos; nenhum código o usava).
- Teste: `document.test.ts` com os 20 vetores do `07_cad_documents.test.sql` (inclui `12.ABC.345/01DE-35`), mais casos de resto 10 e de resto < 2 nos dois dígitos. Os CPF `00000000604` e o de resto 10 no segundo DV (`000.000.0xx-30`, exceção de dado de teste registrada em `05-seguranca.md`) e os CNPJ `EX0TESTE000200` e `EX0TESTE000120` são fictícios, gerados pelo algoritmo e conferidos contra as funções do banco local.

### Passo 2: dinheiro (`src/domain/shared/money-input.ts`)

- Reaproveita `money.ts` (centavos inteiros, `parseMoney`, `toMoneyString`) e `formatCurrency` de `format.ts`. Novo: `parseMoneyInput("1.234,56") -> { decimal: "1234.56", cents }`, sem float; `formatMoneyInput("1234.56") -> "1.234,56"`.
- Recusa o que a UI 4.1.3 manda: vazio, zero e negativo, mais de 2 casas, formato ilegível, acima do limite; **"1234.56" dá erro** (ponto só como milhar, em grupos de três). Mensagens exatas da UI.
- Escolhas minhas, dentro do texto da UI: aceita prefixo "R$" colado; recusa "0.500" (ponto de milhar com zero à frente, para não ler 0,50 como R$ 500,00); "1." e ",50" são ilegíveis.

### Passo 3: `mapDatabaseError` (`src/lib/cadastro-errors.ts`, `src/lib/errors.ts`)

- `mapDatabaseError(error, context?)` agora lê `hint` e `details` (JSON validado com `zod`; malformado é descartado e a mensagem sai sem os dados). Todos os 29 hints do contrato (6.3 + extensão da E3b) têm mensagem fixa em pt-BR; um hint só vale com o SQLSTATE do contrato (senão cai no mapa por SQLSTATE de antes).
- `AppError` e `ActionError` ganharam `hint` e `details` (opcionais, serializáveis). `fail()` só os inclui quando existem. Comportamento da FND preservado (`errors.test.ts` inalterado e verde).
- `context` opcional (`subject`, `subjectName`, `documentLabel`, `operation`) para o que só quem chama sabe: "CPF" ou "CNPJ" na mensagem, nome do sócio, reativação.
- Teste: `cadastro-errors.test.ts`.

### Passo 4: esquemas `zod` (`src/domain/cadastros/schemas.ts`)

- Sócio (`partnerSaveSchema`, `partnerSetActiveSchema`), recebedor (`receiverSaveSchema` com identificadores tipados `NAME_VARIANT`, `PIX_KEY` e `BANK_ACCOUNT`; **sem** tipo nem campo de documento do titular, RAT-D023; `receiverSetActiveSchema`) e cliente (`buildClientSaveSchema`/`clientSaveSchema`, `clientSetActiveSchema`), mais `searchClientsSchema` e `searchAliasesSchema`.
- `expectedUpdatedAt` é `string` validada só por formato e devolvida intacta (sem `Date`, sem `coerce`). A mensalidade entra como o texto digitado ("1.234,56") e sai como texto decimal; o documento sai canônico (ou `null`); o motivo em branco vira `null`.
- O cliente não sabe se está ativo: `partnerIds` vazio é erro por padrão e `buildClientSaveSchema({ allowEmptyPartners: true })` serve ao cliente inativo (R-C10). Todas as conferências do cliente (versão, sócios, documento, mensalidade) rodam juntas para a tela mostrar todos os erros de uma vez.
- Linhas em branco de apelidos, variações, chaves e contas são descartadas no esquema (D-IMPL-08 pede isso à tela); texto só com pontuação segue ao banco, que o recusa.
- Teste: `schemas.test.ts` (42 casos).

### Passo 5: camada de servidor (`src/server/cadastros`, `partners`, `receivers`, `clients`)

- `src/server/cadastros/`: `types.ts` (`CadastroContext` = cliente da sessão + `correlationId`; `WriteResult`), `context.ts` (`getCadastroContext()`, a única parte que toca o Next: cliente Supabase da sessão e `getCorrelationId()`), `helpers.ts` (`unwrap*` que traduzem o erro do banco com `mapDatabaseError`, `fetchAllRows` que lê tudo paginando por `range`, `isUuidText`, `nullable` e `optional` para os parâmetros que os tipos gerados marcam como obrigatórios mas o banco aceita nulos).
- `src/server/partners/partners.ts`: leitura (`listPartners` com contagens de clientes e recebedores e busca por nome ou apelido, `listActivePartnerOptions`, `getPartnerDetail`, `listPartnerClients` = consulta 11.2, `listActiveReceiversOfPartner` = 11.3, `partnerHasLinkedLogin` = 11.7) e escrita (`savePartner`, `setPartnerActive`).
- `src/server/receivers/receivers.ts`: `listReceiversByPartner`, `getReceiverDetail`, `saveReceiver` (monta `p_identifiers` em snake_case por `toRpcIdentifiers`), `setReceiverActive`.
- `src/server/clients/clients.ts`: `searchClients` e `searchAliases` (RPCs `SECURITY INVOKER`), `getClientDetail` (mensalidade lida com `default_monthly_value::text`), `saveClient`, `setClientActive`.
- Todas as funções recebem o cliente Supabase (ou o contexto) por parâmetro, como `storeProofFile`; as de escrita chamam sempre o invólucro `public.<nome>` com `p_correlation_id`. Nenhuma lê ou grava tabela direto para escrever.
- `updated_at` é `string` do banco à tela e de volta; a mensalidade é `string` ("1234.56") em todas as leituras e escritas. As escritas devolvem só `id`, `active`, `updatedAt` e o nome (a mensalidade do retorno de `save_client` é número JSON e não é repassada).
- Extra pequeno, de apoio à tela: `src/domain/cadastros/division.ts` (`describeEqualDivision`, `equalSharePercent`, textos da UI 4.1.4, só com inteiros) e `text.ts` (`normalizeAlias`, espelho aproximado, só para filtrar lista curta).

### Passo 6: verificação contra o banco local (não é teste automatizado)

Uma sonda descartável (apagada) rodou as funções acima, com sessão real de Administrador, Operador e Visualizador do `seed:dev`, contra o Supabase local. Confirmou o contrato **como o PostgREST o entrega**: `hint` em maiúsculas, `details` como **texto JSON** (com espaços do `jsonb::text`), `updated_at` como texto com microssegundos (`2026-11-25T18:04:17.980158+00:00`), `default_monthly_value::text` devolve `"1234.56"` e `search_clients` devolve texto. Hints exercitados ao vivo: `ADMIN_REQUIRED` (Operador), `STALE_VERSION`, `PARTNER_NAME_TAKEN` (nome, apelido e variação), `IDENTIFIER_TAKEN`, `DOCUMENT_TAKEN`, `POSSIBLE_DUPLICATE` (e a confirmação por `acknowledgedDuplicateIds`), `PARTNER_HAS_CLIENTS`, `RECEIVERS_CHANGED`, `PARTNER_INACTIVE` (cliente, novo recebedor e reativar recebedor), `CLIENT_WITHOUT_PARTNER` (salvar e reativar), `INVALID_AMOUNT`, `INVALID_DOCUMENT` (apelido), `NOT_FOUND` com `partner_ids`, `INVALID_FILTER`. Operador e Visualizador leem clientes e sócios; `searchAliases` e recebedores voltam vazios para eles. O banco local ficou com dados da sonda e foi restaurado com `db reset` + `seed:dev` ao fim.

### Comandos e resultados (E4)

| Comando | Resultado |
|---|---|
| `npm run lint` | sem avisos nem erros |
| `npm run typecheck` (`next typegen && tsc --noEmit`) | sem erro |
| `npm test` (Vitest, pelo PowerShell com o disco em maiúscula, D-E9-01) | **31 arquivos, 539 testes, todos passaram**. Novos desta etapa: 9 arquivos, **249 testes** (290 eram da FND) |
| Sonda contra o Supabase local (descartável, passo 6) e, depois, `npx supabase db reset` + `npm run seed:dev` | Contrato conferido ao vivo; banco local restaurado (9 migrations, seed, 5 usuários). Nenhuma migration, teste pgTAP ou `seed.sql` foi tocado |

Testes novos por arquivo: `document.test.ts` (documentos, 20 vetores 12.3), `money-input.test.ts` (dinheiro), `schemas.test.ts` (42), `division.test.ts`, `cadastro-errors.test.ts` (um caso ou mais por hint, SQLSTATE incoerente, detail malformado), `helpers.test.ts`, `partners.test.ts`, `receivers.test.ts` e `clients.test.ts` (parâmetros enviados à função do banco, tradução das respostas e dos erros). O cliente Supabase falso está em `tests/unit-support/fake-supabase.ts`.

### Referências de rastreio (E4)

| Requisito | Arquivo | Teste | Resultado |
|---|---|---|---|
| 3.4 / CA-04: DV de CPF e CNPJ (numérico e alfanumérico) em TS, espelho do banco, vetores 12.3, `12.ABC.345/01DE-35` | `src/domain/documents/document.ts` | `document.test.ts` | passou |
| CA-10 / UI 4.1.3: "1.234,56" vira "1234.56" sem float; "1234.56", zero, negativo, mais de 2 casas, vazio e acima do limite recusados | `src/domain/shared/money-input.ts` | `money-input.test.ts`, `schemas.test.ts` | passou |
| 6.2 / F-03: `updated_at` sempre texto, sem `Date` | `schemas.ts`, `partners.ts`, `receivers.ts`, `clients.ts` | `schemas.test.ts`, `partners.test.ts`, `receivers.test.ts`, `clients.test.ts` (token idêntico ao recebido e `typeof === "string"`) | passou |
| 6.3 contrato de erros (29 hints) e UI: mensagens em pt-BR, dono do documento, `POSSIBLE_DUPLICATE`, `PARTNER_HAS_CLIENTS`, `RECEIVERS_CHANGED`, `STALE_VERSION` | `src/lib/cadastro-errors.ts`, `src/lib/errors.ts` | `cadastro-errors.test.ts` e os três de `src/server/*` | passou |
| 6.4 / 17.3: chamar sempre o invólucro `public.<nome>` com `p_correlation_id`; nenhuma escrita em tabela | `src/server/*/*.ts` | `partners.test.ts` (nenhuma consulta de tabela numa escrita) e os demais | passou |
| RAT-D023 (sem documento do titular), RAT-D015 (sem percentual), RAT-D025 (sem documento de sócio) | `schemas.ts`, `receivers.ts` | `schemas.test.ts`, `receivers.test.ts` (campos extras ignorados; tipo `DOCUMENT` recusado) | passou |
| RAT-D021 motivo opcional | `schemas.ts` | `schemas.test.ts` (branco vira `null`; nunca bloqueia) | passou |
| CA-09 divisão 1/n só informativa | `src/domain/cadastros/division.ts` | `division.test.ts` | passou |
| FND: `mapDatabaseError` e `fail` sem regressão | `src/lib/errors.ts` | `errors.test.ts` (inalterado) | passou |

### Desvios e decisões da etapa (D-E4-xx)

| ID | Onde | O que foi feito e por quê |
|---|---|---|
| D-E4-01 | 6.3 / mensagens | `IDENTIFIER_TAKEN`: o `detail` do banco traz o valor normalizado e o dono, mas **não o tipo** (chave Pix, conta ou forma do nome). A UI 7.2 tem frases distintas por tipo ("Esta chave Pix já está...", "Esta conta já está..."). A mensagem ficou única: "Esta chave Pix, conta ou forma do nome já está cadastrada no recebedor {Titular}, do sócio {Nome}." Ver P-E4-01 |
| D-E4-02 | `mapDatabaseError` | Ganhou o 2.º parâmetro opcional `context` (`subject`, `subjectName`, `documentLabel`, `operation`) para o que o banco não diz: "CPF" ou "CNPJ" na frase do documento repetido, nome do sócio na frase de bloqueio, mensagem de reativação. Sem contexto a frase sai genérica ("documento", "O sócio"), nunca errada. Chamadas antigas (`mapDatabaseError(e)`) continuam iguais |
| D-E4-03 | `AppError` / `ActionError` | Ganharam `hint` e `details` (opcionais, JSON simples). O código de aplicação segue o mapa por SQLSTATE (`STALE_VERSION` e os `*_TAKEN` saem `CONFLICT`; `PARTNER_*`, `POSSIBLE_DUPLICATE` e `CLIENT_WITHOUT_PARTNER` saem `RULE_VIOLATION`); quem precisa distinguir usa `hint`. Não criei código novo em `APP_ERROR_CODES` |
| D-E4-04 | `AppError.field` | Vale o nome do campo do **formulário** (camelCase: `legalName`, `monthlyValue`, `partnerIds`, `holderName`, `identifiers`...), traduzido do campo do `detail` (snake_case). Os mesmos nomes são as chaves dos esquemas |
| D-E4-05 | hint x SQLSTATE | Um hint só vale se vier com o SQLSTATE do contrato (ex.: `STALE_VERSION` só com `P0001`). Hint em outro SQLSTATE é ignorado e o erro cai no mapa por SQLSTATE. `CLIENT_WITHOUT_PARTNER` vale em `P0001` e em `23514` (gatilho diferido do `COMMIT`) |
| D-E4-06 | esquemas | Linhas em branco de listas são descartadas no esquema, como a D-IMPL-08 pede à tela. O cliente não sabe se está ativo: `partnerIds` vazio é erro por padrão e `buildClientSaveSchema({ allowEmptyPartners: true })` atende o cliente inativo (R-C10); o banco confere de novo |
| D-E4-07 | dinheiro | Fora do texto da UI, escolhi: aceitar o prefixo "R$" colado; recusar "0.500" (ponto de milhar com zero à frente) para ninguém ler 0,50 como R$ 500,00; "1," e ",50" são ilegíveis |
| D-E4-08 | tipos gerados | `supabase gen types` marca como obrigatórios parâmetros que o banco aceita nulos (`p_*_id` de cadastro novo, `p_expected_updated_at`, `p_document`, `p_trade_name`, `p_notes`). A conversão fica concentrada em `nullable()` (`src/server/cadastros/helpers.ts`); nada foi editado em `database.types.ts` |
| D-E4-09 | retorno de `save_client` | O retorno traz `default_monthly_value` como número JSON; as escritas **não** o repassam (devolvem só `id`, `active`, `updatedAt` e o nome). Quem precisar do valor relê o detalhe, que o pede com `::text` |
| D-E4-10 | leituras | As contagens de `listPartners` leem as tabelas paginando (`fetchAllRows`, 500 por página) para o limite de 1000 linhas do PostgREST não truncar nada em silêncio. Para Operador e Visualizador as contagens de recebedores vêm zeradas (o RLS não os deixa ler recebedores); a tela de sócios é do Administrador |

### Pendências (E4)

| ID | Item |
|---|---|
| P-E4-01 | **Proposta ao `modelagem-dados`:** incluir `identifier_type` (`NAME_VARIANT`, `PIX_KEY` ou `BANK_ACCOUNT`) no `detail` de `IDENTIFIER_TAKEN`. Com isso o mapeamento passa a dar as frases exatas da UI 7.2 por tipo. Não editei migration (regra da etapa); a mensagem genérica atual é correta, só menos específica |
| P-E4-02 | **Para a E6:** a UI (6.1) manda "Ver clientes deste sócio" para `/clientes?socio={id}&status=todos`, mas `search_clients` **não tem filtro por sócio**. Opções: parâmetro novo em `search_clients` (migration nova) ou página própria com `listPartnerClients` (consulta 11.2, já pronta). Decisão do orquestrador |
| P-E4-03 | A tabela 6.3 da modelagem não trazia `INVALID_IDENTIFIER`, `ACTIVE_REQUIRED`, `LIST_REQUIRED`, `INVALID_FILTER` e o `detail` do `NOT_FOUND` (P-IMPL-06). O `mapDatabaseError` já os trata (resolvido: a tabela 6.3 foi atualizada pelo `modelagem-dados` na revisão 3 de `02-modelagem-dados.md`, com a PEND-M3 encerrada) |
| P-E4-04 | P-IMPL-08 (apelido `NAME` igual ao nome de outro cliente deve avisar?) continua aberta; nada na camada de servidor depende da resposta |
| P-E4-05 | Não há Server Actions, rotas nem telas (E5/E6). A autorização de cada ação (`getClaims()`, perfil ativo e papel Administrador) entra com elas; a barreira real já está no banco (`ADMIN_REQUIRED`, conferido ao vivo com Operador) |
| P-E4-06 | Não rodei `npm run build` nem os testes e2e: nenhum código novo é importado por rota, e o `typecheck` cobre os tipos. Os pgTAP (1148) não foram reexecutados porque o banco não mudou |

### Handoff (E4)

Pronta para a E5a (Server Actions e telas de sócios) e para revisão de `seguranca` (olhar em especial: o `detail` com nome de terceiros só chega depois de `require_admin()` no banco, e a camada repassa à tela apenas `code`, `message`, `field`, `hint` e `details`, nunca `cause`; todo módulo de leitura e escrita é `server-only`; escritas só por função `public`; CPF e chaves não são logados pelo logger, que já os redige) e de `qa`. **Não** é entrega final. O stack do Supabase local fica no ar, com o banco restaurado do `db reset` e o `seed:dev` aplicado (senha gerada nesta execução, não registrada).

---

## E5a

Escopo: telas de **Sócios** (lista, novo, detalhe, editar) e Server Actions (salvar, inativar, reativar); `AlertDialog` e `Textarea`; navegação (Sócios liberado, "Aliases" vira "Apelidos"). Sem mudança de banco, sem migration, sem dependência nova. Recebedores dentro do detalhe são da E5b (aqui só leitura). Status: **pronta para revisão** (passos 1 a 3 feitos).

### Consultas ao Next 16 (`node_modules/next/dist/docs/01-app/`)

| Arquivo | O que decidiu |
|---|---|
| `01-getting-started/07-mutating-data.md` e `02-guides/server-actions.md` | Server Action autentica e autoriza **dentro** de cada ação (POST direto); `revalidatePath`/`refresh` **antes** de `redirect` (que lança); `redirect` fora de `try/catch`; retorno serializado e mínimo; em Server Action o `redirect` usa `push` |
| `02-guides/forms.md` | Formulário com `useActionState` num Client Component; ação com assinatura `(prevState, formData)`; validação no servidor com `zod` devolvendo erros por campo |
| `03-api-reference/03-file-conventions/page.md` | `params` e `searchParams` são `Promise`; são dados de requisição (dinâmicos): com `cacheComponents` ficam atrás de `<Suspense>` (o layout `(app)` já tem um; cada página tem o seu esqueleto) |
| `03-api-reference/04-functions/redirect.md`, `revalidatePath.md`, `refresh.md` | `redirect` por `push` na ação; `revalidatePath` com caminho literal atualiza a tela atual; `refresh` só em Server Action (no cliente, `router.refresh()`) |
| `02-guides/authentication-with-cache-components.md` e `data-security.md` | Sem `use cache` em dados de cadastro; leitura por requisição; DTO mínimo; `getSession()` (React `cache`) revalida perfil ativo e papel em cada ação |

### Passo 1: base de domínio, servidor e Server Actions (feito)

- **Componentes `ui`:** `src/components/ui/alert-dialog.tsx` (sobre `@base-ui/react/alert-dialog`, já instalado) e `textarea.tsx`. O `shadcn add --dry-run` mostrou o que o CLI geraria (`alert-dialog`, `textarea`, a dependência listada era só o alias `cn` do próprio projeto, e ele sobrescreveria o `button.tsx` ajustado da FND), então **não rodei o CLI**: os dois arquivos foram escritos a partir da saída do `--dry-run --view`, adaptados (foco de 3:1 como o `Input`, corpo rolável, `max-w-lg`, sem clique-fora). `package.json` e `package-lock.json` **não mudaram** (confirmado ao fim, ver comandos).
- **`FieldError`** saiu de `components/auth/` para `components/form/field-error.tsx` (a UI 9.1 pede); três imports ajustados.
- **Navegação:** Sócios `available: true`, descrição "Cadastro de sócios, seus recebedores e apelidos."; "Aliases" virou **"Apelidos"** (rota `/configuracoes/aliases` mantida, ainda `available: false` até a E7); título da página-placeholder ajustado; `authorization.test.ts` atualizado (só "/" e Sócios liberados; rótulo "Apelidos").
- **Domínio puro (testado):** `src/lib/format-date.ts` (dd/mm/aaaa e hh:mm em America/Sao_Paulo), `src/domain/cadastros/editable-list.ts` (lista de apelidos: adicionar, remover/inativar, reativar), `partner-view.ts` (filtros da URL, aviso de sucesso por chave fixa, variante e textos dos diálogos), `partner-form.ts` (leitura do `FormData`, erros do `zod` por campo).
- **Servidor:** `src/server/cadastros/authorize.ts` (`authorizeAdmin`: sessão por `getClaims` + perfil ativo + Administrador, senão `unauthenticated` ou `forbidden`), `action-support.ts` (`toActionFailure`: erro -> `ActionError` sem `cause`, log só do inesperado, "código de suporte" = correlation id), e `listPartnerBlockingClients` em `partners.ts` (consulta 11.2 + marca "Único sócio").
- **Server Actions:** `src/app/(app)/configuracoes/socios/actions.ts` com `savePartnerAction` e `setPartnerActiveAction` (autorizam dentro, validam com `zod`, chamam `src/server/partners`, devolvem estado serializável, `revalidatePath` antes de `redirect`). O sucesso vai ao detalhe com `?aviso=<chave>` (e `&n=` com os recebedores inativados): só chaves fixas valem, a mensagem nunca vem da URL (U-C17). Se o sócio já estava na situação pedida, a ação não escreve e leva `ja-inativo`/`ja-ativo` (UI 8.3), pois o banco é idempotente e não distingue.
- **Testes novos:** `actions.test.ts` (21 casos: sem sessão, sem permissão, validação, criar, editar, conflito, nome e apelido repetidos, inesperado sem vazar `cause`, inativar sem e com recebedores, reativar, já na situação, não encontrado, bloqueio com "Único sócio", recebedores mudaram, versão antiga), `authorize.test.ts`, `partner-view.test.ts`, `partner-form.test.ts`, `editable-list.test.ts`, `format-date.test.ts`, e 2 casos em `partners.test.ts`.

### Passo 2: telas de Sócios (feito; falta validar no navegador/HTTP)

Rotas em `src/app/(app)/configuracoes/socios/`: `page.tsx` (lista), `novo/page.tsx`, `[id]/page.tsx` (detalhe), `[id]/editar/page.tsx`, mais `error.tsx` (da lista e de `[id]`), `actions.ts` e `_components/` (`partner-form.tsx`, `partner-active-control.tsx`).

- Todas as páginas ficam atrás de `<Suspense>` próprio (esqueleto `ContentSkeleton`) porque `params`/`searchParams` e a sessão são dados de requisição; a guarda `guardPage()` (`src/components/shell/page-guard.tsx`) mostra "Sem permissão" (FND 2.7.4) a quem não é Administrador **antes** de qualquer leitura.
- **Lista:** busca (`?q=`, GET, funciona sem JS), situação (`?status=ativos|inativos|todos`, links com `aria-current`), "Limpar filtros" só com filtro, tabela em `md+` e lista de cartões no celular, contagem `role="status"`, quatro estados vazios (nenhum cadastrado, nenhum inativo, sem resultado) e erro de região.
- **Detalhe:** trilha, selo, "Editar" e "Inativar/Reativar sócio"; faixa de sócio inativo; aviso de login vinculado (U-C07, consulta 11.7; some se a leitura falhar); cartões Recebedores (**só leitura**, E5b), Clientes deste sócio (contagem, até 10 nomes, nota fixa, link com filtro) e Apelidos (ativos e inativos recolhidos); datas em `dd/mm/aaaa` e `hh:mm` de Brasília.
- **Formulário único** (nome + apelidos, um "Salvar"): controlado (o motivo e os campos sobrevivem a um erro), lista editável com Enter que adiciona sem enviar, resumo de erros com foco, link "Abrir sócio"/"Abrir sócio inativo" no nome ou apelido repetido, "Descartar as alterações?" no Cancelar e `beforeunload` ao fechar a aba, e o conflito de edição (UI 8.1) com "Carregar versão atual" (`router.refresh()` + reaplicação dos dados novos + bloco "O que você tinha digitado").
- **Inativar/reativar:** `PartnerActiveControl` escolhe a variante com os dados da página (bloqueio, cascata, simples, reativar). Bloqueio lista **todos** os clientes (ativos e inativos) com "Único sócio" e o link "Ver clientes deste sócio"; cascata lista os recebedores e envia `confirmedReceiverIds`; erro `PARTNER_HAS_CLIENTS` vira o bloqueio com a lista nova e `RECEIVERS_CHANGED` mantém a cascata com a lista nova. "Motivo (opcional)" nunca bloqueia. Sucesso: redireciona ao detalhe (a `key` do componente leva a versão do sócio, então ele remonta fechado).
- **Novos componentes compartilhados** (`src/components/form/`): `breadcrumbs`, `status-badge`, `status-filter`, `flash-alert`, `reason-field`, `confirm-dialog` (`ConfirmActionDialog` e `NoticeDialog`), `editable-text-list`; `PageHeader` ganhou `id="page-title"` focável e a prop `meta`; `ErrorPanel` ganhou `title` e `description` opcionais.

### Passo 3: verificação (feito)

| Comando | Resultado |
|---|---|
| `npm run lint` | sem avisos |
| `npm run typecheck` | ok (`next typegen` + `tsc --noEmit`) |
| `npm test` (PowerShell, disco em maiúscula, D-E9-01) | **37 arquivos, 601 testes, todos aprovados** |
| `npm run build` | ok; rotas `/configuracoes/socios`, `/novo`, `/[id]`, `/[id]/editar` geradas (PPR) |
| `git diff --stat -- package.json package-lock.json` | vazio: **nenhuma dependência nova** |

**Teste por HTTP** (`npm run start`, porta 3001; sessões reais de `admin@example.com` e `operador@example.com` do `seed:dev`, cookie montado como em `tests/e2e/support/http.ts`; envio de formulário como navegador sem JS, como `tests/e2e/support/pages.ts`). A senha do `seed:dev` não estava registrada (a anterior era aleatória): reexecutei `npm run seed:dev` com um `DEV_SEED_PASSWORD` gerado para esta execução (só Supabase local, não registrado). Roteiro descartável fora do repositório.

| Caso | Resultado |
|---|---|
| Sem sessão: lista, `novo` e detalhe | 307 para `/login?next=...` |
| Operador: lista e `novo` | 200 com "Sem permissão" (FND 2.7.4), sem dados de sócio |
| Administrador: lista (4 sócios, contagens), detalhe (recebedores só leitura, clientes, apelidos, datas dd/mm/aaaa e hh:mm), `novo`, `editar` (campos ocultos `id` e `expectedUpdatedAt`) | 200, conteúdo conferido |
| Operador, POST direto em `savePartnerAction` | estado `FORBIDDEN`/`ADMIN_REQUIRED`; nada criado |
| Administrador cria sócio com apelido | 303 para o detalhe com `?aviso=criado`; aviso e nome na página |
| Nome repetido (ignorando maiúscula) e nome vazio | 200 com erro por campo (`PARTNER_NAME_TAKEN` com o dono; `VALIDATION`) |
| Editar com a versão atual / depois com a versão antiga | 303 `?aviso=salvo` / estado `CONFLICT` `STALE_VERSION` com `currentUpdatedAt` |
| Inativar sócio com clientes (Sócio Exemplo A) | estado `PARTNER_HAS_CLIENTS` com os 2 clientes e `onlyPartner`; sócio continua ativo |
| Operador, POST direto em `setPartnerActiveAction` | `FORBIDDEN`/`ADMIN_REQUIRED` |
| Inativar sócio novo (sem clientes) / de novo / reativar com versão antiga / reativar | 303 `inativado` / 303 `ja-inativo` / `STALE_VERSION` / 303 `reativado` |
| Log do servidor | sem erro nem pilha; só eventos `auth.sign_out` |

A ação `setPartnerActiveAction` não tem formulário no HTML (o diálogo só existe aberto, com JS): o POST foi montado com o formato do `useActionState` (`$ACTION_REF`, `$ACTION_n:0` com o id da ação lido de `.next/server/server-reference-manifest.json`, `$ACTION_n:1` com o estado) mais os campos da ação. Isso valida autorização, banco, versão e redirecionamentos; **a interação do diálogo (foco, lista de cascata, "Carregar versão atual", `beforeunload`) não foi exercida** sem navegador.

Ao fim: processo na porta 3001 encerrado e porta conferida (só conexões em `TIME_WAIT`, sem escuta).

### Desvios e pendências da E5a

| Id | Descrição |
|---|---|
| D-E5a-01 | `shadcn add` não foi rodado (sobrescreveria `button.tsx` ajustado); `alert-dialog.tsx` e `textarea.tsx` escritos à mão a partir do `--dry-run --view` (passo 1) |
| D-E5a-02 | Se o sócio já está na situação pedida, a ação não escreve e vai para `ja-inativo`/`ja-ativo` (UI 8.3), porque o banco é idempotente (passo 1) |
| D-E5a-03 | A reativação por HTTP foi exercida como sócio sem recebedores; a cascata com `confirmedReceiverIds` (Sócio Exemplo B, com recebedor ativo) não foi inativada para não alterar o seed: coberta só pelos unitários de `actions.test.ts` e pelo pgTAP da E3 |
| P-E5a-01 | Sem navegador: foco, diálogos, lista editável, conflito com "O que você tinha digitado", responsividade e contraste ficam para os e2e da E7 e a revisão de `qa` |
| P-E5a-02 | Dados fictícios deixados no Supabase local pelos testes (não há exclusão de sócio): "Sócio Teste E5a Alfa" (execução anterior), "Sócio HTTP E5a 321359" e "Sócio HTTP E5a 378616 B" (esta verificação). Somem no próximo `npm run db:reset` |
| P-E5a-03 | Fora do escopo, a cargo das próximas etapas: recebedores no detalhe (E5b), clientes (E6), apelidos consolidados (E7) |

### Status e handoff (E5a)

**Pronta para revisão.** Nenhuma correção de código foi necessária neste passo: lint, typecheck, 601 testes e build passaram de primeira e o HTTP confirmou o comportamento. Pedir revisão de `seguranca` (autorização dentro de cada ação, negação por padrão, mensagem sem `cause`, aviso só por chave fixa) e `qa` (interação no navegador). **Não** é entrega final.

---

## E5b

Escopo: Recebedores dentro do detalhe do sócio (rotas novo e editar, lista com ações, Server Actions `saveReceiverAction` e `setReceiverActiveAction`) e o ajuste P-E4-01. Sem dependência nova. Status: **pronta para revisão** (passos 1 a 4 feitos; verificação por HTTP concluída, ver "Passo 4").

### Passo 1: P-E4-01 (`identifier_type` no `detail` de `IDENTIFIER_TAKEN`) (feito)

- **Banco:** o `raise` de `IDENTIFIER_TAKEN` mora na função de gatilho `private.receiver_identifiers_prepare()`, que está na migration `20261125000200_cad_tables.sql` (não na `0300`, como o pedido dizia; a `0300` só chama o gatilho por `save_receiver`). Editei a `0200` (ainda não publicada): o `detail` ganhou `'identifier_type', new.identifier_type::text`. Nada mais mudou; `PARTNER_NAME_TAKEN` (variação igual a nome de sócio) segue com o hint próprio.
- **pgTAP** (`08_cad_partners_receivers.test.sql`, plano 222 -> 226): 3 casos no gatilho (`PIX_KEY`, `BANK_ACCOUNT`, `NAME_VARIANT`) e 1 em `save_receiver`.
- `npx supabase db reset` + `npx supabase test db`: **11 arquivos, 1152 testes, todos aprovados** (eram 1148). `npm run seed:dev` reexecutado com senha gerada para a execução (não registrada).
- **`src/lib/cadastro-errors.ts`:** `IDENTIFIER_TAKEN` agora lê `identifier_type` e devolve a frase exata da UI 7.2 por tipo: "Esta chave Pix já está cadastrada no recebedor {Titular}, do sócio {Nome}." / "Esta conta já está cadastrada ..." e, para variação do nome (a UI não traz frase própria), "Esta forma do nome já está cadastrada ..." (mesmo molde; ver D-E5b-01). Sem tipo (detail antigo) cai na frase genérica da E4. `details` ganhou `identifierType` (`null` se ausente). Com `operation: "activate"` a frase é a da UI 6.5 ("Não foi possível reativar: a chave Pix ... já está em uso pelo recebedor ..."); hoje `set_receiver_active` não mexe em identificadores, então esse caminho é só defensivo.
- Testes: `cadastro-errors.test.ts` (por tipo, sem tipo, tipo desconhecido, reativação) e `receivers.test.ts`.

### Passo 2: domínio, Server Actions e testes unitários (feito)

- **Domínio puro** (`src/domain/cadastros/`): `receiver-identifiers.ts` (`normalizePixKey` espelho do banco; lista de contas `addAccount`/`removeAccount`/`reactivateAccount`, `accountKey` com zeros à esquerda e separadores, `describeAccount`, `listsFromIdentifiers`), `receiver-form.ts` (leitura do `FormData`: `variants`, `pixKeys` e contas por três campos paralelos `accountBank`/`accountBranch`/`accountNumber`; `summarizeReceiverValidation` leva cada problema do `zod` à lista do tipo do item; `receiverFieldOfError` leva o erro do banco à lista certa pelo `identifierType`), `receiver-view.ts` (rotas, filtro `?recebedores=`, textos exatos de 6.5, 7.1, 7.2). `partner-view.ts` ganhou 6 chaves de aviso `recebedor-*` (mensagem sempre fixa, nunca da URL). `editable-list.ts`: `addItem` aceita `normalize` e mensagens próprias (chaves Pix usam `normalizePixKey`, porque `normalizeAlias` apagaria a pontuação de e-mails e daria "repetida" falso). `schemas.ts`: `findAccountProblems` extraída do `superRefine` e exportada, para a tela e o servidor dizerem o mesmo (sem mudar o comportamento do esquema).
- **Server Actions** (`src/app/(app)/configuracoes/socios/[id]/recebedores/actions.ts`): `saveReceiverAction` (autoriza dentro, `zod`, `save_receiver`, erro por lista, `revalidatePath` antes do `redirect`, sem `cause`) e `setReceiverActiveAction` (lê o recebedor antes: se já está na situação pedida não escreve e leva `recebedor-ja-*`; o sócio de destino vem do banco, não do formulário). Todas voltam ao detalhe do sócio.
- **Testes novos:** `actions.test.ts` (28: sem sessão, sem permissão, validação por campo, novo, edição, destino vindo do banco, conflito, `IDENTIFIER_TAKEN` por tipo, forma do nome igual a sócio, sócio inativo, inesperado sem `cause`, sem documento do titular, inativar/reativar/já-na-situação/não encontrado/sócio inativo/versão antiga), `receiver-identifiers.test.ts`, `receiver-form.test.ts`, `receiver-view.test.ts`, mais casos em `editable-list.test.ts` e `schemas.test.ts`.

### Passo 3: telas de Recebedor e lista no detalhe do sócio (feito; falta validar no navegador/HTTP)

Rotas novas em `src/app/(app)/configuracoes/socios/[id]/recebedores/`: `novo/page.tsx` (R1), `[receiverId]/page.tsx` (R2, abre direto no formulário, como a UI 2.1 define), `error.tsx` ("Não foi possível carregar este recebedor.", UI 7.3), `actions.ts` e `_components/` (`receiver-form.tsx`, `account-list.tsx`, `receiver-active-control.tsx`). Cartão em `socios/_components/receivers-card.tsx`, usado por `[id]/page.tsx` no lugar da lista só de leitura da E5a.

- **R1:** sócio dono vem da rota (nunca editável); sócio inativo mostra o bloqueio da UI 7.2 ("Não é possível cadastrar recebedor para um sócio inativo. Reative o sócio primeiro.") com "Ir para o sócio", no lugar do formulário. Sócio que não existe: "Registro não encontrado".
- **R2:** recebedor que não existe, que o RLS esconde ou que é de outro sócio da URL cai em "Registro não encontrado". Cabeçalho com selo e "Inativar recebedor"/"Reativar recebedor"; faixa "Recebedor inativo..." quando for o caso; faixa "O sócio {Nome} está inativo." se o sócio dono estiver inativo.
- **Formulário único** (`ReceiverForm`): faixa de contexto do sócio (a frase de "não pode mudar de sócio", completa só na edição), aviso de privacidade ("Guarde só o que aparece nos comprovantes..."), "Nome do titular *", listas "Outras formas do nome" e "Chaves Pix" (a `EditableTextList` da E5a ganhou `feminine` e `addOptions`, para as frases da UI 7.2 e o gênero dos anúncios) e "Contas bancárias" (`AccountList`: banco, agência e conta lado a lado e "Adicionar"; Enter adiciona sem enviar). Sem CPF/CNPJ do titular nem observação. Controlado (o que foi digitado sobrevive a erro), resumo de erros com foco, "Cancelar" com "Descartar as alterações?" e `beforeunload`, e o conflito (UI 8.1) com "Carregar versão atual" e "O que você tinha digitado". "Abrir recebedor" / "Abrir sócio" no valor repetido. Não há campo de motivo no formulário (a UI 7 não o prevê; a ação aceita `reason`, opcional).
- **Cartão no detalhe do sócio:** "Novo recebedor" (oculto com sócio inativo, que mostra "Reative o sócio para cadastrar recebedores."), filtro Ativos (padrão) / Inativos / Todos em `?recebedores=` (links, funciona sem JS), tabela a partir de 768 px e cartões abaixo, colunas Titular (com "{k} variações do nome"), Chaves Pix, Contas, Situação e Ações (Editar e Inativar/Reativar com nome acessível próprio), estados vazios da UI. Os avisos de sucesso voltam ao detalhe do sócio (`?aviso=recebedor-*`).
- **Inativar e reativar** (`ReceiverActiveControl`, nas linhas e no cabeçalho de R2): textos exatos de 6.5; reativar com o sócio inativo abre o bloqueio "Fechar" / "Ir para o sócio"; se o sócio foi inativado com o diálogo aberto, o erro `PARTNER_INACTIVE` troca o diálogo pelo bloqueio; estado já mudado leva a "Este recebedor já está inativo/ativo. A tela foi atualizada.".

### Comandos e resultados (E5b)

| Comando | Resultado |
|---|---|
| `npx supabase db reset` + `npx supabase test db` | **11 arquivos, 1152 testes, todos aprovados** (1148 + 4 novos do `identifier_type`) |
| `npm run seed:dev` | ok (senha gerada para a execução, não registrada) |
| `npm run lint` | sem avisos |
| `npm run typecheck` | ok |
| `npm test` (PowerShell, disco em maiúscula) | **41 arquivos, 672 testes, todos aprovados** (eram 37 e 601: +71 novos). Numa das execuções, o `equal-split.test.ts` (FND, fora desta etapa) estourou o limite de 5 s sob carga e passou nas outras; não é desta etapa |
| `git diff -- package.json package-lock.json` | vazio: nenhuma dependência nova |
| `npm run build` / servidor | rodados no passo 4 (abaixo) |

### Passo 4: verificação (build e HTTP) (feito)

| Comando | Resultado |
|---|---|
| `npm run lint` / `npm run typecheck` | sem avisos / ok |
| `npm test` (PowerShell, disco em maiúscula) | **41 arquivos, 672 testes, todos aprovados** (sem estouro do `equal-split.test.ts` desta vez) |
| `npm run build` | ok; geradas (PPR) `/configuracoes/socios/[id]/recebedores/novo` e `/[receiverId]` |
| `git diff -- package.json package-lock.json` | vazio: nenhuma dependência nova |

**Teste por HTTP** (`npm run start`, porta 3001; `npm run seed:dev` reexecutado com `DEV_SEED_PASSWORD` gerado para a execução, não registrado; sessões reais de `admin@example.com` e `operador@example.com`; telas lidas como em `tests/e2e/support/pages.ts`; POST das ações montado como no E5a, com os ids lidos de `.next/server/server-reference-manifest.json`). Roteiro descartável fora do repositório (scratchpad). Resultado: **45 verificações, todas conforme o esperado** (uma delas acusou falha só por erro de digitação do roteiro, regex sem `\d`; o conteúdo da tela estava correto).

| Caso | Resultado |
|---|---|
| Sem sessão: R1, R2 e detalhe do sócio | 307 para `/login?next=...` |
| Operador: R1 | 200 com "Sem permissão", sem formulário |
| Operador, POST direto em `saveReceiverAction` (novo e editar) e `setReceiverActiveAction` | `FORBIDDEN` / `ADMIN_REQUIRED`; nada gravado |
| Administrador: R1 | formulário com "Nome do titular", "Chaves Pix", "Contas bancárias" e aviso de privacidade; sem campo de CPF/CNPJ do titular |
| Criar recebedor (titular, 1 variação, 1 chave Pix, 1 conta) | 303 `?aviso=recebedor-criado`; aviso "Recebedor cadastrado."; detalhe lista titular, chave, conta e "1 variação do nome" |
| R2 | abre no formulário, com `expectedUpdatedAt` e botão "Inativar recebedor" |
| Editar com a versão atual / com a versão antiga | 303 `?aviso=recebedor-salvo` / `CONFLICT` `STALE_VERSION` com `currentUpdatedAt`; a versão mudou após a edição |
| Chave Pix repetida (outra caixa) / conta repetida (zeros e separador diferentes) / forma do nome repetida | `IDENTIFIER_TAKEN` com a frase do tipo certo: "Esta chave Pix..." / "Esta conta..." / "Esta forma do nome já está cadastrada no recebedor {Titular}, do sócio {Nome}." |
| Chave Pix de recebedor de outro sócio | frase com o titular e o sócio donos (`Sócio Exemplo A`) |
| Forma do nome igual ao nome de sócio | `PARTNER_NAME_TAKEN` ("Este nome já é usado pelo sócio Sócio Exemplo B...") |
| Titular em branco / sem `partnerId` e sem `id` | `VALIDATION` ("Informe o nome do titular." / "Escolha o sócio do recebedor.") |
| Recebedor de outro sócio na URL, id inexistente, id que não é UUID | "Registro não encontrado" (no payload RSC; o status HTTP é 200 por causa do streaming do PPR, igual às telas de sócio da E5a), sem dados do recebedor |
| Inativar / inativar de novo / reativar com versão antiga | 303 `recebedor-inativado` / 303 `recebedor-ja-inativo` / `STALE_VERSION` |
| Lista `?recebedores=inativos`, `ativos`, `todos`, e valor inválido | inativo aparece só em `inativos` e `todos`; valor inválido cai em `ativos` |
| R2 de recebedor inativo | faixa "Recebedor inativo" e "Reativar recebedor" |
| Sócio inativo: reativar recebedor | `RULE_VIOLATION` `PARTNER_INACTIVE` com o nome do sócio |
| Sócio inativo: R1 | bloqueio "Não é possível cadastrar recebedor para um sócio inativo..." com "Ir para o sócio", sem formulário; POST direto de criação também recusado (`PARTNER_INACTIVE`) |
| Sócio inativo: detalhe e R2 | sem "Novo recebedor", com "Reative o sócio para cadastrar recebedores."; R2 com faixa "está inativo" |
| Reativar o sócio, reativar o recebedor / de novo / inativar inexistente / `active` inválido | 303 `recebedor-reativado` / 303 `recebedor-ja-ativo` / `NOT_FOUND` / `VALIDATION` |
| Log do servidor | sem erro, aviso nem pilha |

Não exercido sem navegador: foco, diálogos (inativar, reativar, bloqueio, "Descartar as alterações?"), lista editável com Enter, "Carregar versão atual" com "O que você tinha digitado", responsividade (tabela x cartões) e contraste (P-E5b-01, para os e2e e o `qa`).

Ao fim: processo na porta 3001 encerrado e porta conferida (livre).

### Referências de rastreio (E5b)

| Requisito | Arquivo | Teste | Resultado |
|---|---|---|---|
| P-E4-01 / UI 7.2: frase por tipo | `20261125000200_cad_tables.sql`, `cadastro-errors.ts` | `08_cad_partners_receivers.test.sql` (4), `cadastro-errors.test.ts`, `receivers.test.ts`, `actions.test.ts` | passou |
| RAT-D023: sem documento do titular; várias chaves e contas; sócio fixo | `schemas.ts`, `receiver-form.ts`, `receiver-form.tsx` | `actions.test.ts` (nenhum documento vai ao banco), `receiver-form.test.ts` | passou |
| UXC-33: titular obrigatório, listas, aviso de privacidade, sócio só leitura | `receiver-form.tsx`, `receiver-view.ts` | `receiver-view.test.ts`; tela sem navegador (P-E5b-01) | unitário passou; tela pendente |
| UXC-32: filtro Ativos/Inativos, sem "Novo recebedor" com sócio inativo | `receivers-card.tsx`, `receiver-view.ts` | `receiver-view.test.ts`; tela pendente | parcial |
| UXC-34: textos de 6.5 e bloqueio com sócio inativo | `receiver-active-control.tsx`, `receiver-view.ts` | `receiver-view.test.ts`, `actions.test.ts` | unitário passou; diálogo pendente |
| R-R06b: reativar o sócio não reativa recebedores | (banco; nenhuma ação da tela reativa em cascata) | pgTAP da E3 | passou |
| RAT-D021: motivo opcional | `receiver-active-control.tsx`, `actions.ts` | `actions.test.ts` (sem motivo não bloqueia) | passou |
| Autorização dentro da ação; sem `cause`; `revalidatePath` antes do `redirect` | `recebedores/actions.ts` | `actions.test.ts` | passou |
| UI 8.1 conflito de edição | `receiver-form.tsx`, `actions.ts` | `actions.test.ts` (`STALE_VERSION`); "Carregar versão atual" pendente | parcial |

### Desvios e decisões (D-E5b-xx)

| Id | Descrição |
|---|---|
| D-E5b-01 | A migration que levanta `IDENTIFIER_TAKEN` é a `0200_cad_tables.sql` (gatilho `receiver_identifiers_prepare`), não a `0300` do pedido. Editei a `0200` (não publicada). A UI 7.2 só tem frases para chave Pix e conta; para variação do nome usei o mesmo molde ("Esta forma do nome já está cadastrada no recebedor {Titular}, do sócio {Nome}."), a confirmar com o `design-ui-ux` |
| D-E5b-02 | O pedido dizia "editar recebedor" sem rota; segui a UI 2.1: R2 é `.../recebedores/[receiverId]` (abre direto no formulário), sem `/editar` |
| D-E5b-03 | As ações do recebedor (salvar, inativar, reativar) voltam sempre ao **detalhe do sócio** com o aviso (a UI 7.3 define isso para salvar; para inativar/reativar a UI não diz, e ficar no detalhe mostra a lista já com a mudança) |
| D-E5b-04 | Contas vão ao servidor em três campos paralelos (`accountBank`, `accountBranch`, `accountNumber`), não em JSON: sem `JSON.parse` de entrada não confiável; tamanhos diferentes viram "conta incompleta", recusada pelo esquema |
| D-E5b-05 | Chave Pix repetida na lista é comparada por `normalizePixKey` (espelho do banco), não por `normalizeAlias`: este apagaria pontos de e-mail e acusaria "repetida" em chaves diferentes |
| D-E5b-06 | O diálogo "Descartar as alterações?" foi duplicado no formulário do recebedor (20 linhas) em vez de extrair um componente comum: evita mexer no formulário do sócio, já verificado |
| D-E5b-07 | Falha na leitura da lista de recebedores derruba a página do sócio inteira (`error.tsx` do sócio), em vez do `ErrorPanel` só na região (UI 5.3); a cascata de inativar sócio depende da mesma leitura |
| D-E5b-08 | O ramo "reativação" de `IDENTIFIER_TAKEN` (UI 6.5) está implementado e testado, mas hoje `set_receiver_active` não mexe em identificadores, então o erro não ocorre por esse caminho |

### Pendências (E5b)

| Id | Item |
|---|---|
| P-E5b-01 | Sem navegador: foco, diálogos, listas editáveis, "Carregar versão atual" com "O que você tinha digitado", responsividade (tabela x cartões) e contraste ficam para os e2e (E7) e o `qa`. Build e teste por HTTP: **feitos** (passo 4), sem correção necessária |
| P-E5b-04 | Dados fictícios deixados no Supabase local pelos roteiros (não há exclusão de sócio): dois sócios "Sócio HTTP E5b ..." de execuções do roteiro e seus recebedores. Somem no próximo `npm run db:reset` |
| P-E5b-02 | A tabela 6.3 da modelagem (linha de `IDENTIFIER_TAKEN`) não citava `identifier_type` no `detail` (resolvido: a tabela 6.3 foi atualizada pelo `modelagem-dados` na revisão 3 de `02-modelagem-dados.md`, com a PEND-M3 encerrada) |
| P-E5b-03 | O link "Ver todos os clientes deste sócio" segue para `/clientes?socio=...` (P-E4-02, decisão do orquestrador, E6) |

### Status e handoff (E5b)

**Pronta para revisão** (lint, typecheck, 672 testes, build e HTTP aprovados; nenhuma correção de código foi necessária no passo 4). Pedir revisão de `seguranca` e `qa`. Pontos para a `seguranca`: autorização dentro de cada ação, sócio de destino vindo do banco, nenhum `cause` na resposta, avisos por chave fixa, `detail` com nome de outro recebedor/sócio só chega depois de `require_admin()`. Não é entrega final.

---

## E6a

Escopo: ajustes no banco para Clientes (filtro por sócio em `search_clients`, aviso por apelido em `save_client`) e as telas de **lista** (`/clientes`) e **detalhe** (`/clientes/[id]`), só leitura. O formulário (novo e editar) e as ações de inativar e reativar são da E6b/E6c. Sem dependência nova. Status: **pronta para a verificação da E6c** (passos 1 a 3 feitos; sem build nem servidor nesta execução, por pedido).

### Passo 1: banco (feito)

Migration `20261125000400_cad_client_rpcs.sql` editada no lugar (ainda não publicada; justificativa: as duas mudanças são de funções criadas nela e uma assinatura nova numa migration nova obrigaria `drop function` + `create function` sem ganho, já que nada foi aplicado fora do ambiente local).

- **Filtro por sócio (P-E4-02, opção A):** `public.search_clients(p_query, p_status, p_limit, p_offset, p_partner_id uuid default null)`. O parâmetro novo é o último, com padrão nulo: as chamadas antigas (posicionais, de 1 a 4 argumentos) continuam valendo. Traz os clientes com **indicação ativa** daquele sócio (`client_partners.active`), no filtro de situação pedido (ativos, inativos ou todos): cliente inativo mantém a indicação ativa (RAT-D025), então aparece em "Inativos" e "Todos". Combina com o texto; `total_count` respeita o filtro; sócio desconhecido devolve 0 linhas. Sem mudança de papéis: continua `SECURITY INVOKER`, o RLS de `clients` e `client_partners` vale, Operador e Visualizador leem e Sócio recebe 0 linhas; `grant`/`revoke` com a assinatura nova.
- **Aviso por apelido (RAT-D024, 26/11/2026):** em `save_client`, um apelido `NAME` do cliente (estado final da lista) igual ao nome **ou ao nome fantasia** normalizado de **outro** cliente (ativo ou inativo) gera `POSSIBLE_DUPLICATE`, que não bloqueia e se confirma pela mesma lista `p_acknowledged_duplicate_ids`. O rótulo `match` desse caso é `SAME_ALIAS` ("apelido igual", a UI 4.1.7 só tem dois motivos), então a camada de servidor e a UI não mudam. O gatilho do aviso na edição já cobria "apelidos NAME mudaram", então editar só a mensalidade não reavisa. O nome fantasia entra além do nome por coerência com a consulta 11.4 (nome = nome ou fantasia).
- **`database.types.ts`:** editado à mão (uma linha: `p_partner_id?: string` em `search_clients`), igual ao que `supabase gen types` produziria.
- **pgTAP:** `09_cad_clients` 280 -> 298 (+10 do aviso por apelido: nome, fantasia, inativo, nada gravado, confirmação, auditoria `DUPLICATE_WARNING_ACK`, edição sem reavisar, apelido novo avisa e não grava; +7 do filtro por sócio: conjunto exato, ACTIVE x INACTIVE, indicação inativa, sócio desconhecido, combinação com texto, `total_count`, nulo = sem filtro); `10_cad_roles_matrix` 270 -> 274 (filtro de sócio por Administrador, Operador, Visualizador e Sócio; assinatura do catálogo).
- `npx supabase db reset` + `npx supabase test db`: **11 arquivos, 1174 testes, todos aprovados** (eram 1152). `npm run seed:dev` reexecutado com senha gerada para a execução (não registrada).

### Passo 2: servidor e domínio (feito)

- **Esquema:** `searchClientsSchema` ganhou `partnerId` (UUID, nulo ou ausente = sem filtro; texto que não é UUID é recusado). `src/server/clients/clients.ts`: `searchClients` envia `p_partner_id`; novo `listActivePartnerNamesByClient` (nomes dos sócios com indicação ativa dos clientes da página, em blocos de 50 ids, por `fetchAllRows`, ordem alfabética), pois `search_clients` só devolve a contagem. `src/server/partners/partners.ts`: novo `listPartnerFilterOptions` (todos os sócios, ativos e inativos, para o seletor "Sócio").
- **Domínio puro** `src/domain/cadastros/client-view.ts` (+ `client-view.test.ts`): filtros da URL (`?q=&status=&socio=&pagina=&por=`, tudo cai num valor seguro), `clientsListHref`, paginação ("1–25 de 128"), resumo ("128 clientes ativos", "3 clientes encontrados"), mensalidade em R$ por centavos inteiros, documento da lista, sócios (até 3 nomes, "e mais k", "3 sócios · 1/3 cada"), textos do detalhe (tipo, divisão, apelido de documento com tipo) e o aviso de sucesso por chave fixa (`criado`, `salvo`, `inativado`, `reativado`, `ja-inativo`, `ja-ativo`; a mensagem nunca vem da URL). As chaves e `clientDetailHref`/`clientEditHref` já ficam prontas para a E6b/E6c.
- **Testes:** `client-view.test.ts` (novo), `clients.test.ts` (+5: filtro por sócio, UUID inválido, nomes por cliente, ids inválidos, blocos), `partners.test.ts` (+1), `schemas.test.ts` (+1 e o caso dos padrões).

### Passo 3: telas e navegação (feito; sem navegador, sem build)

Rotas em `src/app/(app)/clientes/`: `page.tsx` (lista), `error.tsx`, `[id]/page.tsx` (detalhe), `[id]/error.tsx`, e dois placeholders: `novo/page.tsx` e `[id]/editar/page.tsx`. Componentes em `clientes/_components/` (`clients-list.tsx`: tabela e cartões; `clients-pagination.tsx`). Todas as páginas ficam atrás de `<Suspense>` com `ContentSkeleton`; a guarda `guardPage` agora devolve também o `role` (para esconder botões) e há `guardAdminPage` (só o Administrador; os outros papéis veem "Sem permissão").

- **Lista (UI 3):** busca (`role="search"`, GET, funciona sem JS), seletor "Sócio" (todos os sócios, `(inativo)` ao lado do nome), situação Ativos/Inativos/Todos (links), chips dos filtros aplicados (Busca, **Sócio com o nome**, Situação) cada um com "×" para tirar só aquele filtro, mais "Limpar filtros". Resumo `role="status"`, tabela a partir de 768 px (Cliente com nome fantasia, Documento, Mensalidade padrão à direita, Sócios com "n sócios · 1/n cada", Situação) e cartões abaixo, paginação "Anterior"/"Próxima" com "1–25 de N" e "Por página" 25/50/100 (links; some no celular). "Novo cliente" só para o Administrador. Estados: vazio em quatro variantes (sem sócio ativo, com sócio, Operador/Visualizador, sem resultado com "Há k cliente(s) inativo(s) com essa busca." e "Ver inativos"), "Nenhum cliente ativo."/"Nenhum cliente inativo." quando só uma situação está vazia, e erro (`error.tsx`, "Não foi possível carregar os clientes.", "Tentar novamente", código de suporte). Página além do fim redireciona à primeira. Sócio desconhecido na URL é ignorado.
- **Detalhe (UI 4.2):** trilha, nome com selo e tipo ("Pessoa física"/"Empresa"; sem tipo sem documento), faixa "Cliente inativo..." (com "Peça a um Administrador para reativá-lo." para Operador e Visualizador), cartões Dados, Sócios e divisão (prévia 1/n; nomes são link só para o Administrador; nota da divisão), Apelidos (ativos; inativos recolhidos só para o Administrador, que é o que o RLS já entrega), datas `dd/mm/aaaa` e `hh:mm`, aviso `?aviso=`. "Editar" (link, só Administrador) e "Inativar/Reativar cliente" (botão **desabilitado**, só Administrador): as ações são da E6b/E6c.
- **Link do sócio (P-E5b-03):** nada a mudar: `partnerClientsHref` (E5a) já aponta para `/clientes?socio={id}&status=todos`, que agora é lido de verdade (teste em `client-view.test.ts`).
- **Navegação:** "Clientes" com `available: true` e a descrição da UI 2.2; `authorization.test.ts` atualizado.

### Comandos e resultados (E6a)

| Comando | Resultado |
|---|---|
| `npx supabase db reset` + `npx supabase test db` | **11 arquivos, 1174 testes, todos aprovados** (eram 1152: +18 no `09`, +4 no `10`) |
| `npm run seed:dev` | ok (senha gerada para a execução, não registrada) |
| `npm run lint` | sem avisos |
| `npm run typecheck` | ok |
| `npm test` (PowerShell, disco em maiúscula) | **42 arquivos, 700 testes, todos aprovados** (eram 41 e 672: +28) |
| `npm run build` / servidor | **não rodados** (por pedido; E6c) |
| `git diff -- package.json package-lock.json` | sem mudança: nenhuma dependência nova |

### Referências de rastreio (E6a)

| Requisito | Arquivo | Teste | Resultado |
|---|---|---|---|
| P-E4-02: filtro por sócio em `search_clients` | `20261125000400_cad_client_rpcs.sql`, `schemas.ts`, `clients.ts` | `09` (7), `10` (4), `clients.test.ts`, `schemas.test.ts` | passou |
| RAT-D024: apelido igual ao nome de outro cliente avisa | `20261125000400_cad_client_rpcs.sql` | `09` (10) | passou |
| UXC-11/12/13: colunas, busca, filtros na URL, paginação | `clientes/page.tsx`, `client-view.ts`, `_components/*` | `client-view.test.ts`; tela pendente | unitário passou; tela pendente |
| UXC-14/15: estados e celular | `clientes/page.tsx`, `_components/clients-list.tsx` | tela pendente | pendente (E6c) |
| UXC-06/08/25: papéis e detalhe | `clientes/[id]/page.tsx`, `page-guard.tsx` | tela pendente | pendente (E6c) |
| UXC-10: menu sem "Em breve" | `navigation.ts` | `authorization.test.ts` | passou |

### Desvios e decisões (D-E6a-xx)

| Id | Descrição |
|---|---|
| D-E6a-01 | A migration `0400` foi editada no lugar (não publicada), como pedido: `search_clients` mudou de assinatura (5.º parâmetro com padrão nulo) e o `save_client` ganhou o ramo do apelido. Os pgTAP chamam a função por posição (1 a 4 argumentos) e seguem valendo |
| D-E6a-02 | O motivo do aviso por apelido é `SAME_ALIAS` (UI 4.1.7: "apelido igual"), não um valor novo: assim `cadastro-errors.ts` e a UI não mudam. Compara com o nome **e** o nome fantasia do outro cliente |
| D-E6a-03 | `search_clients` só dá a contagem de sócios; os nomes vêm de uma segunda leitura (`listActivePartnerNamesByClient`), uma consulta por 50 clientes da página. Alternativa descartada: devolver os nomes pela função (mudaria o contrato de retorno e o tipo gerado) |
| D-E6a-04 | "Por página" (25/50/100) e "Anterior/Próxima" são links, não um `<select>`: funciona sem JavaScript. O seletor "Sócio" da busca é um `<select>` nativo dentro do formulário GET e só vale depois de "Buscar" |
| D-E6a-05 | O espaço entre "R$" e o número é o espaço não separável do `Intl` (`R$ 1.250,00` com NBSP), o que evita quebra de linha; igual ao `formatCurrency` da FND |
| D-E6a-06 | Estados vazios que a UI não nomeia: com filtro "Ativos" vazio e clientes inativos existentes, "Nenhum cliente ativo." com "Ver inativos"; "Inativos" vazio, "Nenhum cliente inativo." com "Ver ativos". Para decidir entre "nenhum cliente" e "nenhum ativo" há uma consulta extra de 1 linha, só quando a lista vem vazia sem busca |
| D-E6a-07 | "Inativar/Reativar cliente" no detalhe é um botão desabilitado (E6c); "Editar" leva a `/clientes/{id}/editar`, que é um placeholder (E6b), assim como `/clientes/novo` |
| D-E6a-08 | Chips: além de Busca e Sócio, a Situação (quando não é "Ativos") também aparece como chip, para o filtro vindo do detalhe do sócio (`status=todos`) ficar visível |

### Pendências (E6a)

| Id | Item |
|---|---|
| P-E6a-01 | Sem navegador, build nem HTTP nesta execução: tabela x cartões, foco, "×" dos chips, paginação, estados vazios e papéis (Operador e Visualizador sem botões; `/clientes/novo` e `/editar` com "Sem permissão") ficam para a E6c e o `qa`. O `e2e` existente só usa `/clientes` para redirecionamento de login |
| P-E6a-02 | Inativar/Reativar (E6c) e os formulários de novo e editar (E6b) |
| P-E6a-03 | Ordenação por clique no cabeçalho (U-C10, cortável) e primeira coluna fixa no tablet (UI 3.4) não foram feitas |
| P-E6a-04 | ~~Mascarar o CPF para Operador e Visualizador (U-C05)~~ **Encerrada**: o responsável decidiu "Ver completo" (RAT-D023, Brain `11-Decisoes.md`); nada é mascarado, para nenhum papel. Não há modo mascarado a construir |

### Status e handoff (E6a)

Pronta para a verificação (E6c: build, servidor, HTTP). Depois, `seguranca` (o aviso por apelido e o filtro de sócio não mudam papéis nem RLS; `search_clients` segue `SECURITY INVOKER`, conferido nos pgTAP do `10` para os quatro papéis) e `qa`. **Não** é entrega final.

---

## E6b

Escopo: **formulário de cliente** (novo e editar, um só "Salvar") e a Server Action `saveClientAction`. Sem dependência nova, sem mudança de banco. Sem `npm run build` nem servidor Next nesta execução (a verificação completa é da E6c). U-C05 já decidido (RAT-D023): CPF/CNPJ e chave Pix aparecem inteiros para todos os papéis; nada fica pendente aí. Status: **pronta para a verificação da E6c** (passos 1 a 3 feitos; sem build nem servidor, por pedido).

### Passo 1: domínio puro e testes (feito)

- `src/domain/documents/document-mask.ts` (+ teste): máscara de CPF `000.000.000-00` e de CNPJ `AA.AAA.AAA/AAAA-00` (letras e números nas 12 primeiras posições, só números nas 2 últimas, minúsculas viram maiúsculas), colar com ou sem pontuação, exemplos dos campos.
- `src/domain/cadastros/client-form.ts` (+ teste): `readClientSaveForm` (apelidos em dois campos paralelos `aliasType`/`aliasValue`, listas de tamanhos diferentes viram "lista inválida"), resumo de erros, validação local de documento e mensalidade (mensagens exatas da UI 4.1.2 e 4.1.3), "Valor lido", prévia da divisão (0 a n sócios, ativo e inativo), `computeConfirmationChanges` (diálogo 4.1.8: sócios antes/depois, nova divisão, documento antes/depois) e assinatura do aviso de nome parecido (4.1.7).
- `src/domain/cadastros/client-aliases.ts` (+ teste): lista editável de apelidos do cliente com tipo (Nome, CPF, CNPJ; no banco `NAME` ou `DOCUMENT`): adicionar (mensagens da UI 4.1.6), reativar inativo igual, remover/inativar, assinaturas.

### Passo 2: Server Action `saveClientAction` e testes (feito)

- `src/server/clients/clients.ts`: `getClientActiveState` (lê só `id, active`; `null` se não existe, não é UUID ou o RLS esconde). A ação a usa na edição para decidir `allowEmptyPartners` **pelo banco**, nunca por campo do formulário (campo forjado não libera cliente ativo sem sócio).
- `src/app/(app)/clientes/actions.ts`: `saveClientAction(prevState, formData)`: autoriza dentro (`authorizeAdmin`: sem sessão leva ao login com o aviso; sem permissão devolve `FORBIDDEN`), lê o `FormData` (`readClientSaveForm`), valida com `buildClientSaveSchema({ allowEmptyPartners })`, chama `saveClient` (`save_client`), devolve `ClientFormState` (`ActionError` sem `cause`, `fieldErrors` por campo, `supportCode` = correlation id só no inesperado) e, em sucesso, `revalidatePath("/clientes")` e do detalhe **antes** do `redirect` para `/clientes/{id}?aviso=criado|salvo`. `POSSIBLE_DUPLICATE` volta em `error.details.matches` (nada gravado; o reenvio leva `acknowledgedDuplicateIds`); `DOCUMENT_TAKEN`/`ALIAS_TAKEN` voltam com `details.owner` (id, nome, situação) para o link; `PARTNER_INACTIVE` cai em `partnerIds`; `STALE_VERSION` com `currentUpdatedAt`.
- Testes: `actions.test.ts` (27: sem sessão, sem permissão, validação de todos os campos de uma vez, "1234.56" recusado, lista de apelidos de tamanhos diferentes, edição sem versão, criar com o estado final enviado ao banco e revalidação antes do redirect, editar com versão em texto e motivo, sem motivo, ativo sem sócio recusado, inativo sem sócio aceito, situação nunca do formulário, cliente inexistente, id não UUID, duplicado com e sem confirmação, documento repetido ativo e inativo, apelido-documento igual a documento alheio, apelido repetido, sócio inativado, conflito, inesperado sem vazar `cause`, falha na leitura da situação) e 2 casos de `getClientActiveState` em `clients.test.ts`.

### Passo 3: formulário e telas (feito; sem navegador, sem build)

Rotas: `src/app/(app)/clientes/novo/page.tsx` e `[id]/editar/page.tsx` (os placeholders da E6a viraram o formulário real; ambas atrás de `<Suspense>` e de `guardAdminPage`, então Operador e Visualizador veem "Sem permissão" antes de qualquer leitura; id inexistente ou escondido pelo RLS dá "Registro não encontrado"). O botão "Editar" do detalhe (E6a) já apontava para `/clientes/{id}/editar` e passa a abrir o formulário. Componentes em `clientes/_components/`:

- `client-form.tsx` (`ClientForm`): formulário único, controlado, com resumo de erros (links por campo, foco no resumo ou no campo único), conferência ao sair do campo depois do primeiro envio (nome, documento, mensalidade), erro do servidor que some do campo quando a pessoa o edita, "Descartar as alterações?" no Cancelar e nos links de cliente existente, `beforeunload`, conflito de edição (8.1) com "Carregar versão atual" e "O que você tinha digitado", "Salvar cliente"/"Salvar alterações" com "Salvando…". Blocos "Identificação" (nome, nome fantasia), "Mensalidade", "Observações" com contador "{n} de 2000".
- `document-field.tsx`: três opções lado a lado (Sem documento, CPF, CNPJ) com rádios nativos; trocar de tipo esvazia o número; máscara por tipo; ajuda do CNPJ; "Abrir cliente"/"Abrir cliente inativo" no documento repetido. Envia `documentType` e `document`.
- `money-field.tsx`: prefixo R$, à direita, `tabular-nums`; só dígitos, ponto e vírgula; reformata ao sair; "Valor lido: R$ ..." visível ao digitar e anunciada ao leitor de tela só ao sair do campo.
- `partner-picker.tsx`: caixas de marcação só dos sócios ativos (A a Z; rola com mais de 10), selo "Inativo" e só desmarcar para o sócio inativo ainda indicado, aviso e link "Cadastrar sócio" sem sócio ativo, prévia `role="status"` (zero sócios: aviso em cliente ativo, informativo em inativo), notas fixas e, na edição, "A troca de sócios vale daqui em diante...".
- `client-alias-list.tsx`: lista de apelidos com "Tipo" (Nome, CPF, CNPJ; máscara do tipo; Enter adiciona sem enviar), "Remover" (novo) ou "Inativar" (salvo), "Apelidos inativos (k)" com "Reativar", anúncios `role="status"`.
- `duplicate-warning.tsx`: `Alert` `warning` com os clientes parecidos (nome, documento, selo, motivo, "Abrir cliente"), "Salvar mesmo assim" (botão de envio, leva `acknowledgedDuplicateIds`) e "Revisar dados" (foco no nome). O "Salvar cliente" comum fica oculto enquanto o aviso vale; o aviso some se o nome ou os apelidos mudarem.
- `confirm-changes-dialog.tsx`: "Confirmar as alterações em {Nome}?" só na edição que muda sócios ou documento, com antes e depois, nova divisão, avisos fixos, "Motivo (opcional)", foco inicial em "Voltar e revisar", "Confirmar e salvar" (envia o formulário principal; o motivo vai em campo oculto dele) e, com conflito dentro do diálogo (8.2), o aviso e "Cancelar"/"Recarregar dados". O aviso de nome parecido vem antes do diálogo; a confirmação do diálogo vale para o mesmo conjunto de mudanças e a mesma versão do cadastro.

### Comandos e resultados (E6b)

| Comando | Resultado |
|---|---|
| `npm run lint` | sem avisos |
| `npm run typecheck` | ok |
| `npm test` (PowerShell, disco em maiúscula) | **46 arquivos, 785 testes, todos aprovados** (eram 42 e 700: +85) |
| `git diff -- package.json package-lock.json` | vazio: nenhuma dependência nova |
| `npm run build` / servidor / navegador | **não rodados** (por pedido; E6c) |

### Referências de rastreio (E6b)

| Requisito | Arquivo | Teste | Resultado |
|---|---|---|---|
| UXC-16: três opções, máscara CPF/CNPJ (letras), colar, trocar esvazia | `document-field.tsx`, `document-mask.ts` | `document-mask.test.ts` | unitário passou; tela pendente |
| UXC-17: mensagens de documento, repetido com link | `client-form.ts`, `actions.ts`, `document-field.tsx` | `client-form.test.ts`, `actions.test.ts` (ativo e inativo) | unitário passou; link pendente |
| UXC-18: mensalidade ("1.234,56" lido; "1234.56" recusado; "Valor lido") | `money-field.tsx`, `client-form.ts` | `client-form.test.ts`, `actions.test.ts` | unitário passou; tela pendente |
| UXC-19: sócios ativos, prévia 1/n, sem sócio, sem sócio ativo | `partner-picker.tsx`, `client-form.ts` | `client-form.test.ts`, `actions.test.ts` | unitário passou; tela pendente |
| UXC-20: nome parecido, "Salvar mesmo assim"/"Revisar dados", some ao mudar o nome | `duplicate-warning.tsx`, `client-form.tsx`, `actions.ts` | `actions.test.ts` (sem e com confirmação), `client-form.test.ts` (assinatura) | unitário passou; tela pendente |
| UXC-21: apelidos com tipo, Enter, Inativar/Reativar | `client-alias-list.tsx`, `client-aliases.ts` | `client-aliases.test.ts` | unitário passou; tela pendente |
| UXC-22: diálogo ao mudar sócios ou documento, motivo opcional | `confirm-changes-dialog.tsx`, `client-form.ts` | `client-form.test.ts` (antes e depois), `actions.test.ts` (sem motivo salva) | unitário passou; diálogo pendente |
| UXC-23: "Descartar as alterações?" | `client-form.tsx` | tela pendente | pendente (E6c) |
| UXC-24: resumo de erros, foco, sucesso "Cliente cadastrado."/"Alterações salvas." | `client-form.tsx`, `actions.ts`, `client-view.ts` | `client-form.test.ts`, `actions.test.ts` (destino do redirect) | unitário passou; foco pendente |
| UXC-36: conflito, sem "Salvar mesmo assim" | `client-form.tsx`, `confirm-changes-dialog.tsx` | `actions.test.ts` (`STALE_VERSION`), `client-form.test.ts` (o que tinha digitado) | unitário passou; "Carregar versão atual" pendente |
| UXC-06: só o Administrador grava; `/novo` e `/editar` com "Sem permissão" | `guardAdminPage`, `authorizeAdmin` | `actions.test.ts` (sem sessão e sem permissão) | unitário passou; tela pendente |
| R-C10 (inativo sem sócio) e D-E4-06 | `actions.ts` (`getClientActiveState`), `schemas.ts` | `actions.test.ts` (situação lida do banco, não do formulário), `clients.test.ts` | passou |
| RAT-D021: motivo opcional | `confirm-changes-dialog.tsx`, `actions.ts` | `actions.test.ts` | passou |
| RAT-D023 (U-C05): CPF/CNPJ inteiros para todos | detalhe e formulário | (sem máscara de leitura) | decidido, nada pendente |
| Autorização dentro da ação; sem `cause`; `revalidatePath` antes do `redirect` | `clientes/actions.ts` | `actions.test.ts` | passou |

### Desvios e decisões (D-E6b-xx)

| Id | Descrição |
|---|---|
| D-E6b-01 | Apelidos do cliente vão ao servidor em dois campos paralelos (`aliasType` e `aliasValue`, um par por apelido ativo), não em JSON, como as contas do recebedor (D-E5b-04). Tamanhos diferentes viram "Lista de apelidos inválida." |
| D-E6b-02 | Apelido de documento digitado como CPF ou CNPJ é gravado com `type: "DOCUMENT"` e o número formatado; o tipo do seletor só vale para máscara e mensagem. No servidor a mensagem de apelido-documento inválido é a genérica ("Informe um CPF (11 números) ou um CNPJ (14 caracteres)."), porque o esquema não recebe o tipo escolhido; a tela já impede o caso comum ao adicionar |
| D-E6b-03 | No diálogo 4.1.8 os nomes dos sócios aparecem sem chaves ("Sócios: Alfa, Beta → Alfa, Gama"): as chaves da UI foram lidas como marcador de lugar. Com um só sócio depois da troca: "A divisão passa a ser de um só sócio: 1/1 (100%)." (a UI só traz o texto para 2 ou mais). A descrição do diálogo ("Confira o que vai mudar antes de salvar.") é texto novo, exigido pelo `alertdialog` (UXC-41); confirmar com o `design-ui-ux` |
| D-E6b-04 | Se a tela já vê erro (nome em branco, documento, mensalidade ou sócio), "Salvar alterações" envia direto e mostra os erros, em vez de abrir o diálogo de confirmação. A confirmação só vale depois de a tela estar satisfeita |
| D-E6b-05 | "Salvar mesmo assim" é um botão de envio do formulário com campos ocultos `acknowledgedDuplicateIds` (os ids que o aviso mostrou); na edição com mudança de sócios ou documento, o diálogo 4.1.8 vem depois do aviso, e só é pedido de novo se as mudanças ou a versão do cadastro mudarem |
| D-E6b-06 | "O que mudou desde que você abriu" (8.1, item 3, opcional e cortável U-C10) **não** foi feito; "O que você tinha digitado" foi |
| D-E6b-07 | UNEXPECTED no topo do formulário usa o texto da UI 4.1.9 ("Não foi possível salvar agora. Tente novamente em instantes."), não o da tabela geral de erros; o código de suporte vai junto |
| D-E6b-08 | `getClientActiveState` é uma leitura nova só de `id, active`: a ação não confia em nenhum campo do formulário para decidir se o cliente pode ficar sem sócio |

### Pendências (E6b)

| Id | Item |
|---|---|
| P-E6b-01 | Sem navegador, build nem HTTP: máscara ao digitar e colar, troca de tipo, "Valor lido", prévia anunciada, Enter nos apelidos, aviso de nome parecido, diálogos (4.1.8, 8.2, descartar), conflito com "Carregar versão atual", foco, responsividade e contraste ficam para a E6c e o `qa`. Falta também exercer as rotas `/clientes/novo` e `/clientes/[id]/editar` por HTTP (papéis, "Registro não encontrado") |
| P-E6b-02 | "Inativar/Reativar cliente" no detalhe estava desabilitado: ligado na E6c parte 1 |
| P-E6b-03 | Link de saída fora do formulário (menu lateral) não passa por "Descartar as alterações?"; só o `beforeunload` do navegador (igual ao formulário de sócio) |

### Status e handoff (E6b)

**Pronta para a verificação da E6c** (lint, typecheck e 785 testes aprovados; sem build nem servidor, por pedido). Depois, `seguranca` (autorização dentro da ação, situação do cliente lida do banco, nenhum `cause` na resposta, `detail` com dados de outro cliente só depois de `require_admin()`) e `qa` (formulário no navegador). **Não** é entrega final.


---

## E6c parte 1

Escopo: inativar e reativar cliente (Server Action, diálogos e avisos), sem banco novo, sem migration, sem dependência nova. **Sem build, sem servidor Next e sem HTTP** nesta parte (vêm na parte 2). Status: **implementada e com unitários verdes; falta a verificação da parte 2**.

### Passo 1: domínio (feito)

- `src/domain/cadastros/client-view.ts`: `clientActiveVariant` (ativo -> inativar; inativo com sócio ativo -> reativar; inativo sem sócio ativo -> bloqueio), `clientDialogTitle`, `inactivateClientDescription` (6.3), `reactivateClientDescription` (6.4 A, com contagem, nomes, 1/n e percentual de `equalSharePercent`), `REACTIVATE_BLOCKED_DESCRIPTION` (6.4 B), rótulos de ação e de andamento e `clientUnexpectedMessage`. Os avisos `inativado`, `reativado`, `ja-inativo` e `ja-ativo` já existiam em `parseClientFlash` desde a E6a.
- `src/domain/cadastros/client-form.ts`: `readClientSetActiveForm` (`active` só vale "true" ou "false").

### Passo 2: Server Action `setClientActiveAction` (feito)

`src/app/(app)/clientes/actions.ts`: autoriza dentro (`authorizeAdmin`), valida com `clientSetActiveSchema`, lê a situação do banco (`getClientActiveState`; o formulário nunca decide), se já está na situação pedida **não escreve** e vai a `?aviso=ja-ativo|ja-inativo` (D-E5a-02, UI 8.3), senão chama `setClientActive` (`set_client_active`). Erros viram `ActionError` sem `cause` (`toActionFailure`); `CLIENT_WITHOUT_PARTNER` chega com `hint` e a mensagem da UI 6.4. `revalidatePath` da lista e do detalhe **antes** do `redirect`. Motivo opcional (RAT-D021).

### Passo 3: controle e tela (feito; sem navegador, sem build)

- `src/app/(app)/clientes/_components/client-active-control.tsx` (novo, modelo: `PartnerActiveControl`): botão "Inativar cliente" / "Reativar cliente", `ConfirmActionDialog` (inativar e reativar com "Motivo (opcional)", foco em "Cancelar", "Inativando…"/"Reativando…") e `NoticeDialog` de bloqueio com "Fechar" e o link "Editar cliente". Se o servidor devolver `CLIENT_WITHOUT_PARTNER` com o diálogo de reativar aberto, ele vira o bloqueio com a mensagem do servidor num aviso e, ao fechar, a página é atualizada. Erro dentro do diálogo continua aberto (motivo preservado); `STALE_VERSION` e `NOT_FOUND` oferecem "Atualizar a tela".
- `src/app/(app)/clientes/[id]/page.tsx`: o botão desabilitado deu lugar ao controle (só no bloco do Administrador); `key` com id, versão e situação, para remontar fechado depois do sucesso; nomes dos sócios = indicações ativas de sócio ativo.

### Testes (feito)

| Arquivo | Casos novos |
|---|---|
| `src/app/(app)/clientes/actions.test.ts` | 15: sem sessão, sem permissão, entrada inválida, inativar (ordem revalidar -> redirecionar e argumentos da RPC), revalidação da lista e do detalhe, sem motivo, reativar, já na situação (ativo e inativo, sem escrever), situação forjada no formulário, `CLIENT_WITHOUT_PARTNER`, `STALE_VERSION`, não encontrado (leitura e banco), inesperado sem `cause` e com código de suporte, falha ao ler a situação |
| `src/domain/cadastros/client-view.test.ts` | 7: variantes, títulos, textos de inativar e reativar (1, 2 e 3 sócios), bloqueio, rótulos, avisos |
| `src/domain/cadastros/client-form.test.ts` | 4: leitura do formulário de situação |

### Comandos e resultados (E6c parte 1)

| Comando | Resultado |
|---|---|
| `npm run lint` | sem avisos |
| `npm run typecheck` | ok |
| `npm test` (PowerShell, disco em maiúscula) | **46 arquivos, 811 testes, todos aprovados** (eram 785) |
| `git diff --stat -- package.json package-lock.json` | sem mudança: nenhuma dependência nova |

### Desvios e pendências (E6c parte 1)

| Id | Descrição |
|---|---|
| D-E6c-01 | `STALE_VERSION` no diálogo mostra a frase padrão da tabela de erros ("Este cliente foi alterado enquanto você editava. Suas alterações não foram salvas."), igual ao diálogo de sócio; a UI 8.3 não traz texto próprio para o conflito dentro de inativar/reativar |
| D-E6c-02 | Na reativação, o aviso de corrida (`CLIENT_WITHOUT_PARTNER`) aparece dentro do bloqueio 6.4 B, com "Fechar" e "Editar cliente" |
| P-E6c-01 | Parte 2: `npm run build`, HTTP com sessões reais (Administrador e Operador: botão ausente, POST direto negado; inativar, reativar, já na situação, reativar sem sócio ativo, versão antiga) e conferência do `?aviso=` |
| P-E6c-02 | Sem navegador: foco inicial, Esc, foco ao título depois do aviso, responsividade e contraste dos diálogos ficam para o `qa` |


---

## E6c parte 2

Escopo: verificação (lint, typecheck, testes unitários, build e HTTP) de todas as telas e ações de Clientes (E6a, E6b e E6c parte 1). **Nenhum código, migration ou dependência foi alterado nesta parte**: a verificação não revelou defeito da E6. Status: **pronta para revisão**.

### Comandos e resultados (E6c parte 2)

| Comando | Resultado |
|---|---|
| `npm run lint` / `npm run typecheck` | sem avisos / ok |
| `npm test` (PowerShell, disco em maiúscula) | **46 arquivos, 811 testes, todos aprovados** |
| `npm run build` | ok; geradas (PPR) `/clientes`, `/clientes/[id]`, `/clientes/[id]/editar` e `/clientes/novo` |
| `git diff -- package.json package-lock.json supabase/migrations` | vazio: sem dependência nova, migrations intactas |
| `npm run start` (porta 3001) + roteiro HTTP descartável (scratchpad) | **121 verificações, 121 conformes** (4 execuções do roteiro; as 3 primeiras acusaram só erros do próprio roteiro, abaixo) |

`npm run seed:dev` reexecutado a cada execução com `DEV_SEED_PASSWORD` gerada na hora (não registrada); sessões reais de `admin`, `operador`, `visualizador` e `socio`. POST das ações montado como na E5a/E5b (ids lidos de `.next/server/server-reference-manifest.json`, `$ACTION_REF_1`, `Origin`). Log do servidor: só as linhas de inicialização, sem erro, aviso nem pilha.

Falhas do roteiro (não da aplicação), corrigidas no roteiro: (1) a página além do fim redireciona por PPR (status 200 com `<meta http-equiv="refresh">` e `NEXT_REDIRECT;replace;/clientes;307` no payload, igual às telas de sócio), então o teste passou a ler o HTML; (2) a versão do sócio vem de `/configuracoes/socios/{id}/editar`, não do detalhe; (3) regex "1/2" casava com a data "26/11/2026" e a prévia do detalhe diz "divisão igual: 1/3".

### Resultados por área

| Área | Verificado | Resultado |
|---|---|---|
| Sem sessão | `/clientes`, `/clientes/novo`, detalhe, editar | 307 para `/login` |
| Lista por papel | Admin, Operador, Visualizador leem (documento, mensalidade "R$ 1.500,00", "2 sócios"/"3 sócios"); "Novo cliente" só no Admin; Sócio não vê clientes | conforme |
| Filtros | `?q=`, `?status=inativos/todos/padrão ativos`, `?socio=`, valores inválidos caem em padrão, sem resultado, página além do fim (meta refresh), busca + sócio | conforme |
| Paginação | 27 clientes de prefixo igual: "1–25 de 27" com Próxima, "26–27 de 27" com Anterior, `por=50` numa página, página 3 redireciona | conforme |
| Detalhe | por papel (Editar e Inativar só no Admin; Operador e Visualizador sem botões), inativo ("Peça a um Administrador..." para Operador; "Reativar cliente" para Admin), id inexistente e não UUID: "Registro não encontrado"; Sócio sem leitura | conforme |
| `/novo` e `/editar` | Operador e Visualizador: "Sem permissão", sem formulário; Sócio sem formulário; Admin: formulário (e versão no editar); editar inexistente: "Registro não encontrado"; sócio inativo não é escolha | conforme |
| `saveClientAction` (criar) | CNPJ, CPF, sem documento, CNPJ alfanumérico `12.ABC.345/01DE-35` (e minúsculas repetidas = repetido), CPF inválido, CNPJ com dígito errado, tipo sem número | conforme |
| Documento/dados repetidos | de cliente ativo e de inativo: `DOCUMENT_TAKEN` com nome e id do dono; apelido-documento igual a documento alheio recusado | conforme |
| Nome parecido | sem documento: `POSSIBLE_DUPLICATE` com o cliente parecido e nada gravado; reenvio com `acknowledgedDuplicateIds` grava; apelido igual ao nome de outro: `POSSIBLE_DUPLICATE` `SAME_ALIAS` e depois grava | conforme |
| Mensalidade | "1.234,56" e "99" aceitas (lista mostra R$ 1.234,56); "1234.56", "0", "0,00", "-5", "-1.234,56", "abc" e vazio: `VALIDATION`, nada gravado | conforme |
| Sócios | sem sócio, id inexistente, id não UUID, nome em branco: `VALIDATION`; sócio inativado de verdade: `PARTNER_INACTIVE` em `partnerIds` | conforme |
| Editar | 3 sócios (detalhe "divisão igual: 1/3"), troca para só um (1/1, A e C saem), CPF e dois apelidos, versão antiga `STALE_VERSION` com `currentUpdatedAt` e nada gravado, sem versão recusado, id inexistente `NOT_FOUND`, id não UUID recusado | conforme |
| `setClientActiveAction` | inativar (`aviso=inativado`, faixa, sai de Ativos, vai a Inativos); repetir inativar: `ja-inativo` e versão intacta; reativar com versão antiga `STALE_VERSION`; reativar; repetir: `ja-ativo`; reativar sem sócio ativo: `RULE_VIOLATION`/`CLIENT_WITHOUT_PARTNER` e segue inativo; `active` inválido `VALIDATION`; inexistente `NOT_FOUND`; id não UUID e sem versão recusados | conforme |
| Acesso | Operador e Visualizador, POST direto nas duas ações: `FORBIDDEN`/`ADMIN_REQUIRED`, nada gravado | conforme |
| Ponta com sócios | link "Ver clientes deste sócio" abre `/clientes?socio={id}&status=todos` filtrado; sócio indicado em cliente ativo continua bloqueado (`RULE_VIOLATION` `PARTNER_HAS_CLIENTS`); com o cliente inativado o bloqueio permanece (a indicação segue, RAT-D025) | conforme |

### Pendências (E6c parte 2)

| Id | Item |
|---|---|
| P-E6c2-01 | Não exercido sem navegador (para os e2e da E7 e o `qa`): máscara ao digitar/colar, troca de tipo de documento, "Valor lido", lista de apelidos com Enter, aviso de nome parecido (botões "Salvar mesmo assim"/"Revisar dados"), diálogos (4.1.8, 8.2, "Descartar as alterações?", inativar, reativar, bloqueio), "Carregar versão atual", foco, Esc, responsividade (tabela x cartões, "Por página" no celular), contraste |
| P-E6c2-02 | Dados fictícios deixados no Supabase local pelos roteiros (clientes "... HTTP E6c ...", "Zeta Paginação E6c ..." e sócios de teste); somem no próximo `npm run db:reset` |
| P-E6c2-03 | Ordenação por cabeçalho e primeira coluna fixa no tablet (P-E6a-03) seguem não feitas |

### Status e handoff (E6c parte 2)

**Pronta para revisão.** Porta 3001 liberada (conferida). Pedir `seguranca` e `qa` (E6a, E6b, E6c). Não é entrega final.

---

## E7 parte 1

Escopo: página **Apelidos** (`/configuracoes/aliases`), lista consolidada **só de leitura**, e o item de menu liberado. Sem migration, sem mudança de banco, sem dependência nova. Os e2e e as demais frentes da E7 ficam para a parte 2. Status: **pronta para revisão**; segurança e QA ainda não revisaram.

### Decisões e fontes

- **Quem lê (plano 6 e UI 2.3):** só o Administrador. A UI diz "Sem permissão" para Operador e Visualizador, e `search_aliases` devolve lista vazia a eles (RLS de `partner_aliases`, `receivers` e `receiver_identifiers`; corte também dentro da função). Escolha: `guardAdminPage("/configuracoes/aliases")`, que mostra "Sem permissão" antes de qualquer leitura. Menu: `roles` já era `ADMIN_ONLY`; só `available` passou a `true`.
- **Consulta ao Next 16:** sem novidade além do já registrado na E5a e na E6a (`searchParams` é `Promise`; leitura atrás de `<Suspense>`; sem `use cache` em dados de cadastro; `redirect` fora de `try/catch`).
- **Filtros:** busca (`?q=`), tipo (`?tipo=socio|cliente|variacao|pix|conta`), situação (`?status=`, padrão Ativos), página e tamanho (`?pagina=`, `?por=`, 25/50/100, padrão 25). Funcionam sem JavaScript (formulário GET e links). **Não há filtro "por dono"**: a UI 5.4 só pede busca, tipo e situação, e `search_aliases` não tem esse parâmetro; o dono se acha pela busca e pelo link da linha.

### Arquivos

| Arquivo | Finalidade |
|---|---|
| `src/domain/cadastros/alias-view.ts` (novo) | View model puro: filtros da URL (`parseAliasListParams`, `aliasesListHref`, `hasAliasFilters`), rótulos de tipo, `describeAliasText` (conta como "Banco {x} · Ag. {y} · Conta {z}"), `describeAliasOwner` (texto e link do dono), `describeAliasCount` e os textos fixos da UI |
| `src/domain/cadastros/alias-view.test.ts` (novo) | 22 testes: tipos e opções, parser da URL (entrada hostil), ida e volta da URL, contagem, texto da conta, dono por tipo |
| `src/app/(app)/configuracoes/aliases/page.tsx` | Troca o placeholder pela lista: cabeçalho, busca, tipo, situação, "Limpar filtros" (só com filtro), contagem, tabela (md+), cartões (celular), paginação, estados vazio e sem resultado |
| `src/app/(app)/configuracoes/aliases/_components/aliases-list.tsx` (novo) | Tabela com legenda e cabeçalhos (Texto, Tipo, Pertence a, Situação) e lista de cartões; `StatusBadge` (ícone + texto); link do dono |
| `src/app/(app)/configuracoes/aliases/error.tsx` (novo) | Estado de erro: "Não foi possível carregar os apelidos.", "Tentar novamente" e código de suporte |
| `src/components/form/list-pagination.tsx` (novo) | Paginação genérica ("1–25 de N", Anterior/Próxima, "Por página"), extraída do que existia em Clientes |
| `src/app/(app)/clientes/_components/clients-pagination.tsx` | Passou a ser um invólucro fino de `ListPagination` (mesmo HTML e mesmos textos de antes) |
| `src/lib/navigation.ts` | Apelidos com `available: true` (sem selo "Em breve") |
| `src/server/authorization.test.ts` | Lista de módulos liberados passa a incluir `/configuracoes/aliases` |

Destino do link do dono: sócio `/configuracoes/socios/{id}`; cliente `/clientes/{id}`; recebedor `/configuracoes/socios/{sócio}/recebedores/{id}` (rótulo "{Titular} · sócio {Nome}"). Sem o sócio na linha, o recebedor aparece sem link (nenhum endereço inventado).

### Comandos e resultados

| Comando | Resultado |
|---|---|
| `npm run lint` | sem avisos |
| `npm run typecheck` | ok |
| `npm test` (PowerShell, disco em maiúscula) | **47 arquivos, 833 testes, todos aprovados** (eram 811; +22 de `alias-view.test.ts`) |
| `npm run build` | ok; `/configuracoes/aliases` gerada (PPR) |
| `git diff -- package.json package-lock.json` | não mexi (nenhuma dependência) |

### Verificação por HTTP (`npm run start`, porta 3001; sessões do `seed:dev` com `DEV_SEED_PASSWORD` gerada na hora e não registrada; roteiro descartável no scratchpad)

**37 de 37 verificações ok.**

| Caso | Resultado |
|---|---|
| Sem sessão | 307 para `/login?next=%2Fconfiguracoes%2Faliases` |
| Operador e Visualizador (com e sem filtros na URL) | 200 com "Sem permissão"; nenhum controle nem dado da lista; sem link para Apelidos no menu |
| Administrador, padrão | 200; cabeçalho e descrição da UI; "Buscar texto" com a ajuda; filtro Tipo com as 5 opções; situação Ativos/Inativos/Todos; colunas Texto, Tipo, Pertence a, Situação; "19 textos ativos"; sem botão de edição; sem "Limpar filtros" |
| Links do dono | 4 de sócio, 26 de cliente (todas as rotas da página) e 8 de recebedor no formato certo; "Titular · sócio Nome"; conta como "Banco ... · Ag. ... · Conta ..." |
| Tipo (cada um dos 5) | só linhas do tipo; contagem igual ao número de linhas (13 de cliente) |
| Busca | com resultado ("2 textos encontrados", "Limpar filtros"); sem resultado ("Nenhum texto encontrado." + "Limpar filtros"); `%`, `_` e `\` não quebram; HTML digitado sai escapado |
| URL hostil (`tipo`, `status`, `pagina`, `por` inválidos) | cai no padrão |
| Paginação | "1–19 de 19"; `pagina=99` redireciona (`NEXT_REDIRECT`) |
| Log do servidor | sem erro nem pilha |

Ao fim: processo da porta 3001 encerrado e porta conferida (sem escuta).

### Desvios e pendências

| Id | Descrição |
|---|---|
| D-E7a-01 | `ClientsPagination` foi extraída para `ListPagination` (comum às duas listas) em vez de duplicar o componente. Mesmo HTML e mesmos textos; Clientes não tem teste de componente, então a garantia é o `build` e o `typecheck` (e a verificação visual fica para o `qa`) |
| D-E7a-02 | A UI não diz o que mostrar quando o padrão "Ativos" está vazio mas há textos inativos. Usei "Nenhum texto encontrado." com o botão "Ver todos" (não há filtro a limpar nesse caso). Com busca ou tipo aplicados, "Limpar filtros", como a UI manda **Ajustado pelo T-31 (revisão de UI de 26/11/2026): hoje é "Nenhum texto ativo." com "Ver inativos".** |
| D-E7a-03 | Resumo da contagem ("12 textos ativos", "3 textos encontrados") segue o padrão de Clientes; a UI 5.4 não fixa o texto |
| D-E7a-04 | Apelido de cliente do tipo documento aparece como foi cadastrado (ex.: "000.000.001-91"), sem o prefixo "CPF"; a UI 5.4 diz só "o apelido" |
| P-E7a-01 | Sem navegador, não exercidos: tabela x cartões (responsividade), foco, contraste, leitura por teclado do filtro e dos links. Estados "Nenhum apelido cadastrado ainda." (banco sem apelidos), "Ver todos" e o de erro (`error.tsx`) ficaram só por revisão de código; o seed local não tem textos inativos, então a exibição de linha inativa também não foi vista por HTTP |
| P-E7a-02 | ~~U-C05 (mascarar chave Pix e conta nesta tela)~~ **Encerrada**: decidido "Ver completo" (RAT-D023). A tela mostra tudo completo, só para o Administrador, como a UI 5.4 manda |
| P-E7a-03 | Os dados de teste das verificações anteriores seguem no Supabase local (some no `npm run db:reset`) |

### Status e handoff (E7 parte 1)

**Pronta para revisão.** Pedir `seguranca` (apenas Administrador lê; Operador e Visualizador recebem "Sem permissão" e, mesmo se a guarda falhasse, `search_aliases` devolve vazio por RLS; chaves Pix e contas completas na tela) e `qa` (UXC-35, UXC-10, UXC-15, UXC-37 e UXC-46 no navegador). Não é entrega final.

---

## E7 parte 2 — G3

Escopo: transformar as verificações por HTTP em **testes e2e permanentes** e rodar a **verificação completa local** que fecha o gate G3. Nenhuma migration, nenhum código de aplicação e nenhuma dependência foram alterados: a verificação não revelou defeito. Status: **G3: implementação concluída, pronta para segurança e QA** (segurança e QA ainda não revisaram).

### Arquivos

| Arquivo | Finalidade |
|---|---|
| `tests/e2e/cad-partners.e2e.test.ts` (novo, 24 testes) | Sócios: páginas por papel (anônimo, Administrador, Operador, Visualizador, Sócio), Server Actions negadas por papel e sem sessão, criar com apelido, nome repetido, editar, conflito de versão, inativação bloqueada (sócio do seed e sócio com cliente criado agora, ativo e inativo), inativar, "já inativo", reativar |
| `tests/e2e/cad-receivers.e2e.test.ts` (novo, 29 testes) | Recebedores: páginas por papel, ações negadas, criar, editar, conflito, sócio dono fixo, Pix/conta/forma do nome repetidos (no mesmo sócio e em outro), inativar e reativar, cascata da inativação do sócio (lista não confirmada ou parcial recusada, confirmada inativa tudo, sócio inativo bloqueia reativar e criar, reativar o sócio não reativa os recebedores) |
| `tests/e2e/cad-clients.e2e.test.ts` (novo, 36 testes) | Clientes: páginas por papel, lista com busca e filtros (inclusive hostis), ações negadas, CNPJ/CPF/CNPJ alfanumérico/sem documento, documento inválido, documento repetido (cliente ativo e inativo), mensalidade, sócios (nenhum, inexistente, inativo), aviso de nome parecido com confirmação e `SAME_ALIAS`, editar 1/3 e 1/1, retirar o último sócio, conflito de versão, apelidos, inativar, reativar e reativar sem sócio (bloqueado), ponta com sócios |
| `tests/e2e/cad-aliases.e2e.test.ts` (novo, 19 testes) | Apelidos: só o Administrador lê; cinco tipos pesquisáveis com o dono certo; filtros de tipo e de situação; entradas hostis |
| `tests/e2e/support/cadastros.ts` (novo) | POST direto de Server Action (ids pelo manifesto do build), geradores de CPF e CNPJ (inclusive alfanumérico) válidos e aleatórios, sufixo único por execução, criação de sócio, recebedor e cliente, leitura da versão do formulário |
| `tests/e2e/support/cad-sessions.ts` (novo) | Entra uma vez por papel (Administrador, Operador, Visualizador, Sócio) para a execução inteira |
| `tests/e2e/support/global-setup.ts` | Passa a entregar essas sessões aos testes (`project.provide`), para não estourar o limite de 30 logins por 5 minutos do Supabase local |
| `tests/e2e/support/http.ts` | `CookieJar.get(name)` (usado para repassar as sessões) |
| `README.md`, `vitest.e2e.config.mts` | Descrição do `test:e2e` com os testes da CAD e a nota de repetibilidade |

Repetibilidade: o banco semeado não permite exclusão; todo nome, documento, chave Pix e conta criados levam sufixo ou número aleatório da execução. Os clientes criados não usam os sócios do seed (A, B e C) como indicados, e as listas são sempre filtradas pelo sufixo ou por um nome do seed; assim o seed continua achável por mais execuções que se acumulem. Nada do seed é alterado (o bloqueio de "reativar sem sócio" e o de inativar o Sócio Exemplo A não escrevem). Todos os dados são fictícios (RAT-D019).

### Comandos e resultados (ordem da verificação)

`DEV_SEED_PASSWORD` gerada na hora para cada `seed:dev` e cada execução do e2e; **não registrada**. Logs de cada comando ficam no scratchpad do orquestrador.

| # | Comando | Resultado |
|---|---|---|
| 1 | `npm run lint` | sem avisos (saída 0) |
| 2 | `npm run typecheck` | ok (`next typegen` + `tsc --noEmit`, saída 0) |
| 3 | `npm test` (PowerShell, disco em maiúscula) | **47 arquivos, 833 testes, 833 aprovados** |
| 4 | `npm run build` | ok; rotas da CAD geradas |
| 5 | `npm run check:bundle` | **ok: 51 arquivos em `.next/static` sem chave secreta** (rodado também com `--env-file=.env.local`, que confere o valor de `SUPABASE_SECRET_KEY`: ok) |
| 6 | `npx supabase db reset` | ok (as 4 migrations da CAD aplicam do zero; migrations da FND não editadas) |
| 7 | `npx supabase test db` | **11 arquivos, 1174 testes, Result: PASS** |
| 8 | `npx supabase db lint` | `No schema errors found` |
| 9 | `npx supabase db advisors --level warn --fail-on warn` | `No issues found` (saída 0) |
| 10 | `npm run seed:dev` | ok (senha gerada na hora) |
| 11 | `npm run start` (porta 3001) + `npm run test:e2e` | **6 arquivos, 156 testes, 156 aprovados**: 48 da FND (`acesso`, `comprovantes`) + 108 da CAD (24 + 29 + 36 + 19) |
| 12 | `npm run test:e2e` de novo, sobre o mesmo banco já usado (`seed:dev` reexecutado, sem `db reset`) | **156 de 156 aprovados**: repetível |
| 13 | `npm audit --omit=dev` | `found 0 vulnerabilities` |
| 14 | `git status -- package.json package-lock.json` | sem alteração: nenhuma dependência nova. As migrations da CAD são arquivos novos ainda não versionados e não foram editadas nesta parte |

Log do servidor (`next start`) nas duas execuções: só eventos de autenticação e de comprovante da FND e **duas** linhas com pilha, ambas de testes da FND que forçam a recusa pelo RLS do storage (`proof.request_refused`, esperadas). Nenhuma linha de cadastro, e nenhum documento, chave Pix, conta ou nome de cadastro nos logs (CA-22).

Falhas do roteiro no meio do caminho (corrigidas nos próprios testes; não eram defeito da aplicação): (1) a busca repete o texto digitado na página, então "não contém o nome" passou a contar as ligações `/clientes/{id}` da lista; (2) o sócio vê no cabeçalho o nome "Sócio Exemplo A", que não serve de prova de ausência de dado (o teste usa o Sócio Exemplo B e o texto "Acesso de sócio ainda não disponível"); (3) a busca de chave Pix **não** ignora pontuação (o banco casa o Pix pelo texto em minúsculas ou só alfanumérico contra o valor guardado, que mantém `.` e `@`): ver O-E7b-01; (4) inativar o recebedor **não** inativa os identificadores dele (modelagem, por desenho): a lista de Apelidos em "Ativos" continua mostrando-os, e o teste desativa a chave Pix pelo cadastro do recebedor.

### Rastreabilidade dos critérios de aceite (plano, seção 10)

"Navegador" = só o `qa` com navegador consegue cobrir (interação, foco, diálogos, responsividade, contraste).

| CA | Onde está coberto | Observação |
|---|---|---|
| CA-01 | pgTAP `08_cad_partners_receivers` + e2e `cad-partners` (criar, nome repetido sem acento e em maiúsculas, editar, inativar, reativar; sem campo de documento no sócio) | Diálogos: navegador |
| CA-02 | pgTAP `08`/`09` + e2e `cad-partners` (inativação bloqueada: sócio do seed, sócio com cliente novo ativo e inativo, com a lista) e `cad-clients` ("ponta com sócios") | Diálogo de bloqueio: navegador |
| CA-03 | pgTAP `01_catalog`, `08`, `09`, `10` (DELETE e TRUNCATE recusados) | só banco |
| CA-04 | pgTAP `07_cad_documents` + Vitest `document.test.ts` + e2e `cad-clients` (CPF, CNPJ, CNPJ alfanumérico, DV errado, dígitos repetidos) | — |
| CA-05 | pgTAP `09` + e2e `cad-clients` (sem documento aceito; documento repetido de cliente ativo e de inativo, com o dono) | — |
| CA-06 | e2e `cad-clients` ("aviso de nome parecido e confirmação": nome parecido e apelido igual, sem gravar e depois gravando com `acknowledgedDuplicateIds`) | Botões "Salvar mesmo assim" e "Revisar dados": navegador |
| CA-07 | pgTAP `09` (a concorrência foi verificada à mão na E3b) + e2e `cad-clients` (sem sócio ao salvar, retirar o último, reativar sem sócio bloqueado) | Concorrência automatizada: P-G3-06 |
| CA-08 | pgTAP `09`/`10` + e2e `cad-clients` (sócio inativo recusado, `PARTNER_INACTIVE`) | — |
| CA-09 | pgTAP `01_catalog` (I-37) + e2e `cad-clients` ("1/2", "1/3", "1/1" no detalhe) | Leitura visual: navegador |
| CA-10 | pgTAP `09` + Vitest `money-input.test.ts` + e2e `cad-clients` ("1.234,56" e "99" aceitas; "1234.56", "0", "0,00", "-5", "abc" e vazio recusadas) | — |
| CA-11 | pgTAP `08` + e2e `cad-receivers` (sócio dono fixo; reativar e criar com sócio inativo recusados) | — |
| CA-12 | pgTAP `08` + e2e `cad-receivers` (cascata: lista não confirmada ou parcial recusada, confirmada inativa tudo junto, reativar sócio não reativa os recebedores) | Diálogo com a lista: navegador |
| CA-13 | pgTAP `08` + e2e `cad-receivers` (Pix, conta e forma do nome repetidos; Pix de outro sócio citando o sócio; sem campo de CPF/CNPJ do titular na tela) | — |
| CA-14 | pgTAP `08`/`09` + e2e `cad-clients` (apelido-documento igual a documento alheio recusado) e `cad-aliases` | — |
| CA-15 | pgTAP `10_cad_roles_matrix` | só banco |
| CA-16 | e2e `cad-partners`, `cad-receivers` e `cad-clients`: POST direto das seis Server Actions de escrita (salvar e inativar de sócio, recebedor e cliente) por Operador, Visualizador, Sócio e sem sessão; negado e nada gravado | Cobertura completa |
| CA-17 | pgTAP `11_cad_audit` (autor, origem `UI`, antes/depois, motivo nulo ou informado) | O e2e envia `reason` em editar e inativar; a leitura da auditoria é pelo banco |
| CA-18 | pgTAP + e2e `cad-partners`, `cad-receivers`, `cad-clients` (`STALE_VERSION` sem sobrescrever, ao salvar e ao inativar/reativar) | "Carregar versão atual": navegador |
| CA-19 | e2e `cad-clients` (busca por nome e por documento com e sem pontuação, filtros de situação e de sócio, parâmetros hostis, página além do fim, sem resultado); paginação de 27 clientes verificada na E6c parte 2 (roteiro descartável, não permanente) | Estado de erro, responsividade e só leitura visual: navegador |
| CA-20 | e2e dos quatro arquivos: Operador e Visualizador sem botões de edição nem Sócios, recebedores e Apelidos (menu e páginas "Sem permissão"); Sócio vê "Acesso de sócio ainda não disponível" | Aparência: navegador |
| CA-21 | Revisão do vocabulário nos textos exercidos pelos e2e ("Sócio", "Recebedor", "Cliente", "Apelidos") | **Navegador/QA** (revisão visual completa) |
| CA-22 | Log do servidor sem documento, Pix ou conta (conferido nas duas execuções) | `seguranca` |
| CA-23 | Só dados fictícios nos testes; `check:bundle` ok (inclusive com o valor da chave secreta) | `seguranca` confirma o repositório |
| CA-24 | Linhas 1 a 9 e 13 da tabela acima | — |
| CA-25 | pgTAP `01` a `06` (dentro dos 1174) e os 48 e2e da FND (`acesso`, `comprovantes`) passando junto com os da CAD, nas duas execuções | — |

### Pendências consolidadas (E3a a E7)

| Id | Item | Quem resolve |
|---|---|---|
| P-G3-01 | **Navegador**: máscara ao digitar e colar, troca de tipo de documento, "Valor lido", lista editável com Enter, aviso de nome parecido (botões), diálogos (inativar sócio com lista, bloqueio, "Descartar as alterações?", reativar), "Carregar versão atual" com "O que você tinha digitado", foco inicial, Esc, foco no título depois do aviso, tabela x cartões, "Por página" no celular, contraste (P-E5a-01, P-E5b-01, P-E6a-01, P-E6b-01, P-E6c-02, P-E6c2-01, P-E7a-01) | `qa` com navegador |
| P-G3-02 | Estados que o seed local não produz: "Nenhum apelido cadastrado ainda.", "Nenhum texto ativo." e "Nenhum texto inativo." (T-31, ver "Ajustes de texto pós-revisão de UI"; cobertos por teste unitário), tela de erro (`error.tsx`) | `qa` ou revisão de código |
| P-G3-03 | ~~U-C05~~ **Encerrada, não está pendente**: o responsável decidiu "Ver completo" (RAT-D023, Brain). Nada é mascarado: CPF/CNPJ inteiros para todos os papéis que leem o cliente; Pix e conta inteiros para o Administrador na lista de Apelidos (P-E6a-04, P-E7a-02) | — |
| P-G3-04 | ~~Tabela 6.3 da `02-modelagem-dados.md`~~ **Resolvida**: já foi atualizada pelo `modelagem-dados` na revisão 3 do documento (`INVALID_IDENTIFIER`, `ACTIVE_REQUIRED`, `LIST_REQUIRED`, `INVALID_FILTER`, `detail` do `NOT_FOUND`, `identifier_type` em `IDENTIFIER_TAKEN`), com a PEND-M3 encerrada (P-IMPL-06, P-E4-01, P-E4-03, P-E5b-02) | — |
| P-G3-05 | Ordenação por cabeçalho e primeira coluna fixa no tablet (U-C10, UI 3.4; P-E6a-03, P-E6c2-03): não feitas, são cortáveis | orquestrador |
| P-G3-06 | Concorrência de duas retiradas simultâneas (12.4) só **verificada à mão** na E3a e na E3b, não automatizada (P-IMPL-03) | opcional, pós-G3 |
| P-G3-07 | Saída pelo menu lateral não passa por "Descartar as alterações?": só o `beforeunload` do navegador, igual ao formulário de sócio (P-E6b-03) | `qa` avalia |
| P-G3-08 | `search_clients` e `search_aliases` usam `like '%x%'` sem índice (aceitável para centenas de linhas; `pg_trgm` fica como evolução); os `unused_index` em modo `info` seguem esperados (P-IMPL-09, P-IMPL-10, P-IMPL-05) | evolução |
| P-G3-09 | Dados fictícios acumulados no Supabase local pelas verificações e pelos e2e (sócios, recebedores, clientes). Somem no próximo `npm run db:reset` | sem ação |
| P-G3-10 | A paginação com 27 clientes (CA-19) não virou e2e permanente: exigiria criar 27 clientes por execução num banco sem exclusão. Fica coberta pela verificação da E6c parte 2 e pela revisão do `qa` | `qa` |
| P-G3-11 | As migrations da CAD ainda não foram aplicadas no banco hospedado (E11, a cargo do responsável) | responsável |

Desvios das etapas anteriores (D-E5a-xx, D-E5b-xx, D-E6a-xx, D-E6b-xx, D-E7a-xx) seguem como registrados nas respectivas seções.

### Observações para segurança e QA

- **O-E7b-01 (busca de Pix):** a busca da lista de Apelidos não ignora pontuação para chave Pix (`pix.exemplo@example.com` não casa com `pixexemploexamplecom`), porque o valor normalizado guardado mantém `.` e `@`. A descrição da tela diz "A busca ignora acento, maiúscula e pontuação", o que vale para nomes, documentos e contas. Não é problema de segurança; é uma diferença de texto da UI para o `qa` decidir se ajusta a ajuda ou a função (`search_aliases`, migration nova se for o caso).
- **O-E7b-02 (identificadores de recebedor inativo):** inativar o recebedor mantém os identificadores dele ativos (modelagem, para continuarem bloqueando o mesmo valor em outro recebedor). Na lista de Apelidos, em "Ativos", eles continuam aparecendo com o dono inativo.
- Autorização (CA-16): as seis Server Actions de escrita (`savePartnerAction`, `setPartnerActiveAction`, `saveReceiverAction`, `setReceiverActiveAction`, `saveClientAction`, `setClientActiveAction`) foram chamadas por POST direto por Operador, Visualizador, Sócio e sem sessão. A negação é `FORBIDDEN` (com sessão) ou redirecionamento ao login (sem sessão); nada foi gravado.

### Status e handoff (E7 parte 2)

**G3: implementação concluída, pronta para segurança e QA.** Porta 3001 liberada (processo encerrado, sem escuta, conferido). Pedir `seguranca` (E8, G4: RLS, RPCs, Server Actions, dados pessoais e bancários, arquivos públicos sem segredo) e `qa` (E9, G5: matriz dos CA, com navegador para o que está marcado acima, e regressão da FND). Não é entrega final: segurança e QA ainda não revisaram.

## Ajustes de texto pós-revisão de UI

Origem: `03-ui-ux.md`, seção 16 (revisão pós-implementação de 26/11/2026, `design-ui-ux`), que aprovou 30 de 39 textos e pediu 9 ajustes. Nenhuma regra, tabela, migration ou dependência mudou.

| # | Texto novo | Arquivos |
|---|---|---|
| T-06 | Título do aviso e início do erro `POSSIBLE_DUPLICATE`: "Já existe um cliente com nome ou apelido igual" | `src/domain/cadastros/client-form.ts`, `src/lib/cadastro-errors.ts` |
| T-08 | Motivo "apelido igual ao nome" (o "mesmo nome" não muda) | `src/domain/cadastros/client-form.ts` |
| T-12 | "Sócio não encontrado" no lugar de "Sócio removido" (diálogo e "O que você tinha digitado") | `src/domain/cadastros/client-form.ts` |
| T-18 | Inativar: "Este {cliente, sócio ou recebedor} foi alterado por outra pessoa. A inativação não foi feita. Atualize a tela e tente de novo."; reativar: "A reativação não foi feita." A edição mantém a frase antiga. Usa o `operation` que o mapa de erros já recebia | `src/lib/cadastro-errors.ts` (`staleMessage`) |
| T-23 | Lista de sócios, "Ativos" vazio com sócios inativos: "Nenhum sócio ativo." com "Ver inativos" e "Novo sócio"; "Nenhum sócio cadastrado" (só com "Novo sócio") apenas sem sócio nenhum. A página consulta os inativos só nesse caso | `src/domain/cadastros/partner-view.ts` (`partnersEmptyKind`), `src/app/(app)/configuracoes/socios/page.tsx` |
| T-24 | "Informe o nome e, se quiser, os apelidos do sócio." | `src/app/(app)/configuracoes/socios/novo/page.tsx` |
| T-26 | "Este sócio não tem recebedores ativos." quando há recebedores inativos (filtro Ativos); sem nenhum recebedor, fica o título antigo | `src/domain/cadastros/receiver-view.ts` (`receiversEmptyMessage`), `.../socios/_components/receivers-card.tsx` |
| T-31 | Apelidos: "Nenhum texto ativo." com "Ver inativos"; "Nenhum texto inativo." com "Ver ativos"; "Nenhum texto encontrado." só com busca ou tipo (com "Limpar filtros"). O botão "Ver todos" saiu | `src/domain/cadastros/alias-view.ts` (`aliasesEmptyKind`), `src/app/(app)/configuracoes/aliases/page.tsx` |
| T-38 | "em clientes" quando o servidor não devolve a contagem (antes "em cliente") | `src/lib/cadastro-errors.ts` |

Testes acompanhados: `cadastro-errors.test.ts` (T-06, T-18 para os três sujeitos, T-38), `client-form.test.ts` (T-08, T-12), `partner-view.test.ts` (T-23), `receiver-view.test.ts` (T-26), `alias-view.test.ts` (T-31), `receivers.test.ts` e `recebedores/actions.test.ts` (T-18 na inativação) e, no e2e, `cad-partners.e2e.test.ts` (T-24). Nenhum e2e citava as frases antigas; T-23, T-26 e T-31 não são exercidos nos e2e porque o seed local não produz os estados vazios (cobertos por teste unitário das funções de decisão).

Registro corrigido: **U-C05 não está pendente** (RAT-D023, "Ver completo": nada é mascarado) e a **tabela 6.3 da modelagem já foi atualizada** na revisão 3 de `02-modelagem-dados.md`, com a PEND-M3 encerrada. Linhas ajustadas: P-IMPL-06, P-E4-03, P-E5b-02, P-E6a-04, P-E7a-02, P-G3-02, P-G3-03 e P-G3-04.

| Comando | Resultado |
|---|---|
| `npm run lint` | sem avisos (saída 0) |
| `npm run typecheck` | ok (saída 0) |
| `npm test` (PowerShell, disco em maiúscula) | 47 arquivos, **838 testes, 838 aprovados** (eram 833) |
| `npm run build` | ok (saída 0) |
| `npm run start` + `npm run test:e2e` (`seed:dev` com `DEV_SEED_PASSWORD` gerada na hora, não registrada) | 6 arquivos, **156 testes, 156 aprovados** |

Porta 3001 liberada ao fim (sem escuta, conferido). Pendência: a conferência visual dos novos vazios (T-23, T-26, T-31) em navegador, a cargo do `qa`. Não é entrega final: segurança e QA ainda não revisaram.

## E10 · correções (banco)

Origem: `06-qa.md`, seção "E9 · Consolidação e veredito do G5", itens da área "banco". Nenhuma regra de negócio mudou; a assinatura de `search_aliases` não mudou (sem regeneração de tipos).

| Item | O que mudou | Arquivos |
|---|---|---|
| QA-CAD-01 (Baixo) | No ramo `match_by = 'X'` (chave Pix e conta) de `public.search_aliases`, o texto digitado reduzido a letras e números (`v_alike`) agora é comparado com o valor guardado também reduzido (`pg_catalog.regexp_replace(i.nv, '[^0-9a-z]', '', 'g') like v_alike escape '\'`). Antes comparava com o valor que ainda tem `.` e `@`. `sementeaexamplecom`, `semente a@example com` e `SEMENTE.A` agora acham `semente.a@example.com`. O texto de ajuda da tela ("A busca ignora acento, maiúscula e pontuação.") ficou como estava. Chave UUID, CPF/CNPJ/telefone e conta seguem casando como antes; o texto digitado continua tendo de estar contido na chave. | `supabase/migrations/20261125000400_cad_client_rpcs.sql` (função e comentário), `supabase/tests/database/09_cad_clients.test.sql`, `tests/e2e/cad-aliases.e2e.test.ts` |
| QA-CAD-04d (Baixo) | pgTAP novo (CA-03): `DELETE` direto em `partners` recusado como `postgres` (42501, mensagem "partners é imutável: operação DELETE não permitida.", do gatilho `partners_no_delete` da FND) e como Administrador (42501, sem privilégio de DELETE); o sócio continua existindo e nenhuma linha nova entra em `audit_logs` (contagem por `tx_id`) nos dois casos. | `supabase/tests/database/10_cad_roles_matrix.test.sql` |

Decisão de forma (justificada): a correção foi feita **na própria 0400**, e não em migration nova, porque a CAD-001 ainda não foi publicada (pode ser editada) e a mudança é de uma linha de uma função criada nessa migration. Nenhuma migration da FND foi tocada.

Testes acompanhados:
- `09_cad_clients.test.sql`: plano de 298 para 305. Fixture ganhou uma chave Pix UUID (`6F1D7A4E-...`) no recebedor "Titular Rpc Busca". 5 asserções de Pix e-mail (sem ponto e arroba, com espaço, maiúsculas, trecho que atravessa o `@`, texto fora da chave sem casar) e 2 de UUID (sem hífen; com hífen e maiúsculas). As contagens existentes ('busca' = 4 itens) não mudaram.
- `10_cad_roles_matrix.test.sql`: plano de 274 para 280 (3 asserções como `postgres`, 3 como Administrador).
- `cad-aliases.e2e.test.ts`: caso novo "a chave Pix de e-mail é achada sem ponto e sem arroba" (`tipo=pix`, sem pontuação, com espaços e maiúsculas, e um texto fora da chave). **Escrito e verificado só por `typecheck`; não foi executado** porque esta etapa não sobe servidor Next. Precisa de uma rodada de `npm run test:e2e`.

| Comando | Resultado |
|---|---|
| `npx supabase db reset` | ok (todas as migrations aplicadas) |
| `npx supabase test db` | 11 arquivos, **1186 testes**, PASS |
| `npx supabase db lint` | sem erros |
| `npx supabase db lint --schema public,private` | sem erros |
| `npx supabase db advisors --level warn --fail-on warn` | sem avisos |
| `npm run seed:dev` (senha gerada na hora, não registrada) | ok |
| `npm run typecheck` | ok |

Desvios: nenhum em relação ao pedido. O e2e novo não foi rodado (ver acima). Porta 3001 sem escuta ao fim. Não é entrega final: segurança e QA ainda precisam revalidar.


## E10 · correções (aplicação)

Origem: `06-qa.md` (seção "E9 · Consolidação e veredito do G5", QA-CAD-05, 06 e 07) e `05-seguranca.md` (SEG-CAD-01). Nenhuma regra de negócio, tabela, migration ou dependência mudou.

| Item | O que mudou | Arquivos |
|---|---|---|
| QA-CAD-05 (Baixo) | Texto livre com NUL (U+0000) é recusado no zod com **"O texto tem um caractere inválido."** no campo do texto: nome do sócio e do cliente, nome fantasia, observações, motivo (todas as ações), apelido de sócio e de cliente (nome), titular, forma do nome, chave Pix e banco. Agência e conta já caíam na conferência de caracteres ("Use só números, hífen e a letra X."); documento e apelido-documento, na conferência do número. O texto só com NUL não vira "em branco" (o `trim` não o tira). Na **busca** o NUL é **removido** (nunca erro): `queryField` do zod e as três leituras da URL (`?q=` de clientes, apelidos e sócios), então `/clientes?q=a%00b` e `/configuracoes/aliases?q=a%00b` abrem a página normal ("Nenhum ... encontrado"). A tela recusa NUL ao adicionar apelido de cliente (colar não digita NUL, mas o servidor é a autoridade). | `src/domain/cadastros/schemas.ts`, `text.ts` (`hasNul`, `stripNul`), `limits.ts` (frase), `client-view.ts`, `alias-view.ts`, `partner-view.ts`, `client-aliases.ts` |
| QA-CAD-06 (Baixo) | `documentType` agora é `z.enum(["CPF","CNPJ"], { error: "Escolha CPF ou CNPJ." })`. `documentType` entrou em `CLIENT_FORM_FIELDS` (rótulo "Tipo de documento"), então a resposta traz `fieldErrors.documentType`; a tela mostra o erro no grupo do documento e o foco vai ao mesmo lugar. Revisão dos demais `z.enum`: os de `schemas.ts` já tinham frase em português; os de `cadastro-errors.ts` leem o `detail` do banco (não é entrada de usuário) e os de `env.ts` e `auth-link.ts` são da FND e fora do escopo. Teste unitário varre os esquemas de cadastro e não aceita "Invalid"/"expected" em nenhuma mensagem. | `schemas.ts`, `client-form.ts`, `src/app/(app)/clientes/_components/client-form.tsx` |
| QA-CAD-07 (Baixo) | **Teto de itens ATIVOS por lista**, no zod e na tela, num lugar só (`limits.ts`): **50 apelidos por sócio, 50 por cliente (nomes e documentos juntos), 50 formas do nome, 20 chaves Pix e 20 contas por recebedor.** Frases: "No máximo 50 apelidos.", "No máximo 50 formas do nome.", "No máximo 20 chaves Pix.", "No máximo 20 contas.", ligadas ao campo (`aliases`; no recebedor, ao índice do primeiro item acima do teto, para a tela achar a lista). Linhas em branco não contam. Na tela, ao chegar no teto, **"Adicionar" e "Reativar" ficam desabilitados com a frase escrita abaixo do campo** (`aria-describedby`); o campo de inclusão continua habilitado e nada digitado se perde; Enter no teto mostra a mesma frase. Reativar item inativo também conta (aumenta os ativos). | `limits.ts`, `schemas.ts`, `editable-list.ts` (`isAtLimit`, `limit` em `addItem`), `client-aliases.ts`, `receiver-identifiers.ts` (`addAccount`), `src/components/form/editable-text-list.tsx`, `clientes/_components/client-alias-list.tsx`, `recebedores/_components/account-list.tsx`, `receiver-form.tsx`, `socios/_components/partner-form.tsx` |
| SEG-CAD-01 (baixo) | `action-support.ts` registra do erro do banco só `code`, `hint` e `message` (`describeCause`, sem `details` nem o resto do objeto). `logger.ts` redige o **CNPJ pelo conteúdo** (numérico e alfanumérico, com e sem máscara; o sem máscara exige 14 caracteres corridos sem letra ou número colado, então UUID e ids não casam) e `document`, `documento` e `cnpj` entraram em `SENSITIVE_WORDS`. | `src/server/cadastros/action-support.ts`, `src/lib/logger.ts` |

**Limites (QA-CAD-07): decisão e justificativa.** Os números são o ponto de partida sugerido pelo QA e são limite técnico de proteção, não regra de negócio: sem teto, a gravação passava de ~1.800 itens para o `statement_timeout` de 8 s (`UNEXPECTED`) e a edição com 1.000 apelidos gerava 1,7 MB de HTML. O uso real é de dezenas. Ajustável em `src/domain/cadastros/limits.ts` (um número por lista; o e2e `cad-limits.e2e.test.ts` repete os números e precisa acompanhar). O teto vale para os ativos enviados: itens inativos já gravados não entram na conta e continuam na tela. **Registrar no plano** (`01-plano.md`), a cargo do responsável; o plano não foi editado.

Testes acompanhados:
- `schemas-limits.test.ts` (novo): NUL em cada campo (sócio, cliente, recebedor, motivo, busca e parâmetros de URL); tipo de documento (`XYZ`, `cpf`, `cnpj`, `CNPJ `, `RG`, número) com a frase e sem texto em inglês, em todos os esquemas de cadastro; N aceito e N+1 recusado por lista (50/51 sócio, 50/51 cliente incluindo mistura nome e documento, 50/51 formas, 20/21 Pix, 20/21 contas, índice do problema no recebedor); funções da tela (`isAtLimit`, `addItem`, `addClientAlias`, `addAccount` no teto, reativar no teto).
- `logger.test.ts`: CNPJ nos cinco formatos, UUID e ids comuns intactos, campos `document`/`documento`/`cnpj`, linha de log inteira.
- `action-support.test.ts` (novo): `toActionFailure` com `details` de CNPJ, Pix de telefone, Pix UUID e conta: a linha de log não contém nenhum (mantém operação, código, dica e mensagem); `describeCause`.
- `clientes/actions.test.ts` e `socios/actions.test.ts`: `documentType` inválido, NUL e 51 apelidos pela Server Action (`VALIDATION` com `fieldErrors`, sem chamar o banco).
- `tests/e2e/cad-limits.e2e.test.ts` (novo): `?q=a%00b` em clientes, apelidos e sócios (página normal); `savePartnerAction`, `saveClientAction` e `saveReceiverAction` com NUL (`VALIDATION` com a frase); `documentType` `XYZ`, `cpf` e `CNPJ ` (`VALIDATION`, `documentType` no payload, sem "Invalid option"); 50 apelidos de sócio gravados e 51 recusados; 51 e 3.000 apelidos de cliente, 21 Pix, 21 contas e 51 formas recusados com `VALIDATION` e rápido. **Escrito e verificado só por `typecheck` e `lint`; não foi executado** (esta etapa não sobe servidor). Precisa de uma rodada de `npm run test:e2e`.

| Comando | Resultado |
|---|---|
| `npm run lint` | sem avisos (saída 0) |
| `npm run typecheck` | ok (saída 0) |
| `npm test` (PowerShell, disco em maiúscula) | 49 arquivos, **886 testes, 886 aprovados** (eram 838 antes da E10; 48 novos) |

Desvios e pendências:
- Não rodei `build`, servidor nem `test:e2e` (pedido da etapa). O e2e novo e a conferência visual do botão "Adicionar" desabilitado no teto (UI) ficam para a próxima rodada de QA.
- O item "ux" do QA-CAD-07 (desabilitar "Adicionar" na tela) foi feito aqui, junto com o do zod, porque depende dos mesmos números. A especificação `03-ui-ux.md` não foi alterada: a frase do teto precisa ser incluída lá pelo `design-ui-ux`.
- `documentType` no resumo de erros da tela aparece com o rótulo "Tipo de documento" e leva ao grupo do documento; só surge em envio forjado (a tela só oferece as três opções).
- O log técnico perde o `stack` do erro original dos cadastros (só `code`, `hint` e `message`), como o `05-seguranca.md` pede; o `correlationId` continua ligando ao suporte.
- Chave Pix de telefone ou aleatória e conta no formato `banco|agência|conta` **não** são redigidas pelo conteúdo (não são do pedido; saem do log por não irem em `details`). Se um `message` do banco um dia as citar, a redação por conteúdo precisa ser ampliada (DECISÃO PENDENTE da segurança).
- SEG-CAD-02 e demais itens fora da lista não foram tocados.

Porta 3001 sem escuta ao fim (conferido). Não é entrega final: segurança e QA ainda precisam revalidar.

## E10 · correções (telas e textos)

Origem: `06-qa.md` (seção "E9 · Consolidação e veredito do G5", QA-CAD-08), `05-seguranca.md` (SEG-CAD-08b) e o item de registro (docs-E9). Nenhuma regra de negócio, tabela, migration ou dependência mudou; o plano e o Brain não foram editados.

| Item | O que mudou | Arquivos |
|---|---|---|
| QA-CAD-08 (Baixo) | Texto de ajuda da busca de Clientes (T-01): **"Nome, nome fantasia, apelido, ou o começo do CPF ou do CNPJ. A busca ignora acento, maiúscula e pontuação."** (era "Nome, nome fantasia, CPF, CNPJ ou apelido. ..."). A frase saiu da página para a constante `CLIENTS_SEARCH_HELP`, para ter teste. A busca em si **não mudou**: continua por prefixo no documento. Busca por trecho do documento (meio ou fim do CPF) é decisão de produto e exigiria migration; **não foi feita** e fica com o responsável. | `src/domain/cadastros/client-view.ts`, `src/app/(app)/clientes/page.tsx` |
| SEG-CAD-08b (informativo) | Coluna "Pertence a" de `/configuracoes/aliases`: ao lado do dono inativo aparece, em cinza, **"(sócio inativo)"**, **"(recebedor inativo)"** ou **"(cliente inativo)"**. `search_aliases` já devolve `owner_kind` e `owner_active`, então distingue os três e não foi preciso usar "(inativo)" genérico. O nome e o link do dono não mudam; dono ativo não leva aviso. Vale para tabela e cartões do celular (mesmo `OwnerLink`). A situação do texto (selo Ativo/Inativo) segue separada da situação do dono. | `src/domain/cadastros/alias-view.ts` (`ownerActive` em `AliasOwnerSource`, `inactiveNote` em `AliasOwnerView`), `src/app/(app)/configuracoes/aliases/_components/aliases-list.tsx` |
| docs-E9 | Este registro, com as correções acima, o limite adotado no QA-CAD-07 (seção anterior, "Limites (QA-CAD-07)": 50 apelidos por sócio e por cliente, 50 formas do nome, 20 chaves Pix e 20 contas por recebedor, em `limits.ts`) e os totais de teste abaixo. | `04-implementacao.md` |

Testes acompanhados:
- `client-view.test.ts`: a frase nova da ajuda, e que ela não promete busca por qualquer trecho (2 testes novos). Nenhum teste nem e2e citava a frase antiga.
- `alias-view.test.ts`: aviso por tipo de dono inativo (sócio, recebedor, cliente), dono inativo mantém nome e link, dono ativo sem aviso (2 testes novos); os testes existentes de `describeAliasOwner` ganharam `ownerActive: true` e `inactiveNote: null`.

| Comando | Resultado |
|---|---|
| `npm run lint` | sem avisos (saída 0) |
| `npm run typecheck` | ok (saída 0) |
| `npm test` (PowerShell, disco em maiúscula) | 49 arquivos, **890 testes, 890 aprovados** (eram 886 antes desta área; 4 novos) |

**Totais de teste conhecidos hoje** (cada um na rodada em que foi medido): unitários **890** (esta rodada); pgTAP **1186** (rodada "banco", 11 arquivos, `09_cad_clients` com plano 305 e `10_cad_roles_matrix` com 280); e2e **156** na última rodada completa (`Ajustes de texto pós-revisão de UI`), **sem os casos novos** `cad-limits.e2e.test.ts` e o caso Pix de `cad-aliases.e2e.test.ts`, escritos na E10 e **ainda não executados**. O total de e2e e o de pgTAP precisam ser remedidos na rodada final de `test:e2e` e `supabase test db`.

Desvios e pendências:
- **Validação da frase da ajuda com o `design-ui-ux` (T-01)**: não pude acionar o subagente nesta etapa. A frase é a sugerida no `06-qa.md` (item 16), sem mudança; o `design-ui-ux` precisa conferi-la e atualizar a T-01 em `03-ui-ux.md`. Fica a **verificação pendente**.
- **Texto novo no `03-ui-ux.md` para o design-ui-ux conferir**: "(sócio inativo)", "(recebedor inativo)" e "(cliente inativo)" na coluna "Pertence a". O pedido citava só sócio e recebedor; acrescentei "(cliente inativo)" porque `search_aliases` também devolve apelidos de cliente inativo e deixar só esse caso sem aviso seria inconsistente. Estilo: texto em cinza (`text-muted-foreground`) logo após o nome, sem selo nem ícone; para leitor de tela é lido junto do nome, dentro da mesma célula.
- Não rodei `build`, servidor nem `test:e2e` (pedido da etapa). A conferência visual do aviso e da ajuda em navegador fica para o `qa`. Não criei e2e para o aviso: o seed local não tem texto ativo de dono inativo e o e2e não deve criar esse estado só para isto (coberto por teste unitário do view model).
- Se um sócio estiver inativo e seu recebedor ativo (ou o contrário), o aviso reflete só o dono do texto (o recebedor), não o sócio ao qual ele pertence.

Porta 3001: nenhum servidor foi subido nesta área (conferência no fim). Não é entrega final: segurança e QA ainda precisam revalidar.


## E10 · correções (testes permanentes)

Origem: `06-qa.md`, seção "E9 · Consolidação e veredito do G5", itens QA-CAD-04a, 04b, 04c, 04e e 04f (04f fecha o QA-CAD-03). Só testes e apoio de teste: **nenhum arquivo de `src/`, migration, regra de negócio ou dependência mudou.** O 04d (pgTAP de `DELETE` em `partners`) ficou na área "banco" e não foi tocado aqui.

| Item | O que mudou | Arquivos |
|---|---|---|
| QA-CAD-04a (UXC-08) | E2E novo: no detalhe de um cliente com dois sócios, o Administrador tem exatamente dois links `href="/configuracoes/socios/{id}"` (um por sócio, com o nome do sócio como texto do link); Operador e Visualizador têm **zero** links para sócio (nem por id) e veem os dois nomes em texto simples. | `tests/e2e/cad-ux.e2e.test.ts` (novo) |
| QA-CAD-04b (UXC-46) | E2E novo: para lista, novo, detalhe e edição de cliente, lista, novo, detalhe e edição de sócio, novo recebedor, edição do recebedor e Apelidos, nos papéis que abrem cada página (Administrador em todas; Operador e Visualizador também na lista e no detalhe do cliente): **exatamente um `<h1>`**, **um único `<title>`** e ele igual a `{Página} · Financeiro Ultra` (termina em " · Financeiro Ultra"). Caso extra: Operador e Visualizador nas páginas só do Administrador veem "Sem permissão" e ainda assim um h1 e o título padrão. | `tests/e2e/cad-ux.e2e.test.ts` |
| QA-CAD-04c (CA-19, UXC-13) | E2E novo: 27 clientes com prefixo único (nome, nome fantasia e apelido únicos por execução, sócio novo). Filtrando pelo prefixo: "1–25 de 27" com 25 linhas e "Próxima" ativa; página 2 "26–27 de 27" com os 2 últimos e "Anterior" ativa; as duas páginas juntas = os 27 na ordem do nome, sem repetido nem faltante; `por=50` mostra os 27 numa página, sem "Próxima"; `pagina=3` (e `por=50&pagina=2`) redireciona ao começo mantendo a busca e tirando `pagina`, e o destino mostra "1–25 de 27". Na mesma massa: busca por nome fantasia (exata, com maiúsculas, por trecho comum) e por apelido (exato e por trecho), cada exata achando um só cliente, e busca sem resultado. | `tests/e2e/cad-clients-list.e2e.test.ts` (novo) |
| QA-CAD-04e | Os casos de `cad-clients` que só conferiam `failed` e `location` nulo agora conferem também **código, frase exata e campo**: sem sócio (`VALIDATION`, "Escolha pelo menos um sócio. Todo cliente ativo precisa de um.", campo `partnerIds`), sócio inexistente (`NOT_FOUND`, "O sócio escolhido não foi encontrado. Atualize a página e escolha de novo."), id de sócio inválido (`VALIDATION`, "Identificador de sócio inválido."), nome em branco (`VALIDATION`, "Informe o nome ou a razão social.", `legalName`), sócio inativo (`RULE_VIOLATION`, "O sócio ... foi inativado e não pode mais ser indicado. ..."), retirar o último sócio (mesma frase do "sem sócio"), edição sem versão, id inexistente e id lixo na edição, e as entradas inválidas de inativar/reativar (ação lixo, cliente inexistente, id lixo, sem versão). Também confere que nenhum desses envios gravou cliente. Helper novo `errorOf(result)` lê o estado de erro do payload (com chaves aninhadas). | `tests/e2e/cad-clients.e2e.test.ts`, `tests/e2e/support/cadastros.ts` |
| QA-CAD-04f (CA-07, CA-18; fecha QA-CAD-03) | E2E novo com `Promise.all`: (1) duas `saveClientAction` sobre o mesmo cliente e o mesmo token, 4 rodadas com cliente novo cada: exatamente uma grava (303 `salvo`) e a outra devolve conflito (`CONFLICT` com a chave `STALE_VERSION`, frase "Este cliente foi alterado enquanto você editava. Suas alterações não foram salvas.", sem redirecionamento); só a observação do vencedor fica gravada; o perdedor, relendo a versão, grava depois. (2) Variante: cliente com 2 sócios, cada chamada retira um sócio diferente (uma deixa só o A, a outra só o B), 4 rodadas: um grava, o outro é recusado, o cliente fica com exatamente o sócio do vencedor ("divisão: 1/1"), ativo. (3) As duas tirando o mesmo sócio também gravam uma só vez. | `tests/e2e/cad-clients-concurrency.e2e.test.ts` (novo) |

Observação sobre o 04f: o pedido dizia que a segunda chamada "devolve STALE_VERSION". No sistema, `STALE_VERSION` é a **chave estável** (`hint`) do erro; o `code` da resposta é `CONFLICT` (mapeamento do banco em `src/lib/cadastro-errors.ts`). O teste confere os dois. Por usar a mesma versão, a variante dos dois sócios é decidida pela conferência de versão; a trava da linha do cliente mais o gatilho diferido (I-01) continuam sendo a defesa para versões diferentes, e essa parte segue provada pelo pgTAP `09` e pela B1 (duas sessões `psql`).

Testes acompanhados (resumo): 4 arquivos e2e (3 novos, `cad-clients` reforçado), 30 casos novos (15 em `cad-ux`, 11 em `cad-clients-list`, 4 em `cad-clients-concurrency`); nenhum caso removido.

| Comando | Resultado |
|---|---|
| `npm run build` (para o manifesto das ações refletir o `src` atual) | ok |
| `npm run seed:dev` (senha gerada na hora, não registrada) + `npm run start` (porta 3001) | ok |
| `npx vitest run --config vitest.e2e.config.mts tests/e2e/cad-ux tests/e2e/cad-clients-list tests/e2e/cad-clients-concurrency tests/e2e/cad-clients.e2e` (PowerShell) | 4 arquivos, 66 testes, 61 aprovados na primeira rodada; os 5 reprovados eram do próprio teste novo (esperava `STALE_VERSION` no `code` e `errorOf` não lia `details` aninhado); corrigidos e reexecutados `cad-clients-concurrency` + `cad-clients`: 2 arquivos, **40 de 40** |
| `npm run lint` | sem avisos (saída 0) |
| `npm run typecheck` | ok (saída 0) |
| `npm run test:e2e` (PowerShell), conjunto completo | 10 arquivos, **199 testes, 198 aprovados, 1 reprovado**: `cad-limits` "51 apelidos... 3.000 também, rápido" falhou só pelo relógio (13,5 s contra o limite de 8 s) com o computador ocupado; reexecutado sozinho: 12 de 12 aprovados. Teste e e2e fora desta lista de itens |

Desvios e pendências:
- Sem desvios de regra. `errorOf` e as frases exatas copiam textos de `src/domain/cadastros` e `src/lib/cadastro-errors.ts`; mudar a frase quebra o teste de propósito.
- O teto de tempo do caso de 3.000 apelidos em `cad-limits` é sensível à carga da máquina (observado uma vez). Não foi alterado por estar fora dos itens; sugiro ao QA decidir se relaxa o limite.
- A paginação foi provada na lista de Clientes (CA-19). A lista de Apelidos usa o mesmo componente `ListPagination` e não ganhou massa própria.
- O pgTAP não foi tocado nesta área (04d fica com a área "banco").
- Porta 3001 conferida livre ao fim. Não é entrega final: segurança e QA ainda precisam revalidar.

## E10 · verificação completa

Status: **pronta para revalidação** (segurança e QA). Rodada única sobre o código e os testes depois das quatro áreas de correção da E10 (banco, aplicação, telas e textos, testes permanentes). Nenhum arquivo de código, teste, migration ou dependência foi alterado nesta etapa; só este registro. Nenhuma quebra foi encontrada, então nada foi corrigido.

| # | Comando | Resultado |
|---|---|---|
| 1 | `npm run lint` | sem avisos (saída 0) |
| 2 | `npm run typecheck` | ok (saída 0) |
| 3 | `npm test` (PowerShell, disco em maiúscula) | 49 arquivos, **890 testes, 890 aprovados** |
| 4 | `npm run build` | ok (saída 0) |
| 5 | `npm run check:bundle` (CA-12) | ok: 52 arquivos em `.next/static` sem chave secreta |
| 6 | `npx supabase db reset` | ok (todas as migrations e o seed aplicados) |
| 7 | `npx supabase test db` | 11 arquivos, **1186 testes, 1186 aprovados**, PASS |
| 8 | `npx supabase db lint` | sem erros |
| 9 | `npx supabase db lint --schema public,private` | sem erros |
| 10 | `npx supabase db advisors --level warn --fail-on warn` | sem avisos ("No issues found") |
| 11 | `npm run seed:dev` (`DEV_SEED_PASSWORD` gerada na hora, não registrada) | ok |
| 12 | `npm run start` (porta 3001) + `npm run test:e2e` (PowerShell) | 10 arquivos, **199 testes, 199 aprovados** |
| 13 | `npm audit --omit=dev` | 0 vulnerabilidades |

Pontos de atenção:
- Os casos e2e escritos na E10 que ainda não tinham sido executados (`cad-limits.e2e.test.ts` inteiro e o caso da chave Pix de e-mail em `cad-aliases.e2e.test.ts`) **passaram** nesta rodada. O caso "51 apelidos... 3.000 também, rápido", que falhou uma vez pelo relógio na rodada anterior (máquina ocupada), passou desta vez; o teto de 8 s continua sensível à carga da máquina (sugestão ao QA mantida: decidir se relaxa).
- Totais atualizados: unitários **890**; pgTAP **1186** (11 arquivos); e2e **199** (10 arquivos).
- Conferência visual (botão "Adicionar" desabilitado no teto, ajuda da busca T-01, aviso "(sócio inativo)" etc.) e a validação da T-01 pelo `design-ui-ux` seguem pendentes, a cargo do `qa` e do `design-ui-ux`, como registrado nas áreas anteriores.
- Outros problemas: nenhum encontrado. O aviso do Supabase CLI sobre versão nova (v3.4.0) é informativo e não foi tratado.

Porta 3001: servidor encerrado ao fim (processo finalizado, sem escuta, conferido). Não é entrega final: segurança e QA ainda precisam revalidar.

## E10 · correções (rodada 2)

Origem: `05-seguranca.md` (SEG-CAD-11) e `06-qa.md`, seção "E9 · Consolidação e veredito do G5" (N-02 e N-03). Sem migration, sem regra de negócio e sem dependência nova.

| Item | O que mudou | Arquivos |
|---|---|---|
| SEG-CAD-11 | Os três documentos reais-válidos digitados nas rodadas de navegador do QA foram trocados por valores do padrão fictício (RAT-D019): o CPF com máscara (B5-17) virou `000.000.002-72` (trechos `000002` e `00000`); o CPF sem máscara (B5, QA-CAD-08, duas linhas) virou `00000000353`; o CNPJ alfanumérico (B6-01) virou `EX0QAB6R000146` (máscara `EX.0QA.B6R/0001-46`, minúsculas `ex.0qa.b6r/0001-46`). Como o padrão tem zeros, o "trecho do meio" do CPF coincide com o início; as duas linhas de QA-CAD-08 agora dizem isso e não citam mais dígitos exatos. Varredura própria (CPF e CNPJ com DV, com e sem máscara) em `06-qa.md`: só sobram `000.000.00x-xx`, `EX0…` e os vetores conhecidos (`99.999.999/000x-xx`, `12.ABC.345/01DE-35`). Nenhum dos valores trocados aparece em outro arquivo do repositório | `docs/features/CAD-001-socios-e-clientes/06-qa.md` |
| N-02 | Em Apelidos, o aviso do recebedor inativo agora fica colado ao titular e o sócio vem depois: "Titular X (recebedor inativo) · sócio Y". `describeAliasOwner` passou a devolver `label` (só o nome do dono, texto do link) e `context` (`" · sócio Y"`, só no recebedor com sócio na linha); `OwnerLink` mostra link, aviso em cinza e contexto, na tabela e nos cartões. O link do recebedor agora cobre só o titular | `src/domain/cadastros/alias-view.ts`, `src/domain/cadastros/alias-view.test.ts`, `src/app/(app)/configuracoes/aliases/_components/aliases-list.tsx`, `tests/e2e/cad-aliases.e2e.test.ts` |
| N-03 | Teto de tempo do caso "51 apelidos... 3.000 também, rápido" subiu de 8 s para 20 s por chamada, e o caso ganhou tempo limite próprio de 60 s (o padrão do e2e é 30 s). A prova que importa é o código `VALIDATION` e a frase "No máximo 50 apelidos."; o teto só pega travamento | `tests/e2e/cad-limits.e2e.test.ts` |

Testes acompanhados: `alias-view.test.ts` ajustado (campo `context`, ordem aviso e sócio); `cad-aliases.e2e` ganhou a asserção da ordem no caso do recebedor inativado.

| Comando | Resultado |
|---|---|
| `npm run lint` | sem avisos |
| `npm run typecheck` | ok |
| `npm test` (PowerShell) | 49 arquivos, 890 de 890 |
| `npm run build` | ok |
| `npm run check:bundle` | ok, 52 arquivos sem chave secreta |
| `npx supabase db reset` | ok |
| `npx supabase test db` | 11 arquivos, 1186 de 1186, PASS |
| `npm run seed:dev` (senha gerada na hora, não registrada) + `npm run start` + `npm run test:e2e` (PowerShell) | 10 arquivos, **199 de 199**. Na primeira rodada, logo após o reset, 2 reprovaram por tempo limite de 30 s em `acesso` (usuário inativado) e `comprovantes` (usuário inativo), fora desta área; a rodada seguinte, completa, passou sem falhas |
| `npm audit --omit=dev` | 0 vulnerabilidades |

Desvios e pendências:
- O N-02 pedia avaliação do `design-ui-ux` e conferência no navegador (passo 27). Não há navegador aqui e o subagente não foi acionado nesta área: adotei a posição mais simples (aviso logo após o titular, sócio depois), coberta por teste unitário e e2e. O `design-ui-ux`/`qa` ainda deve confirmar o visual no passo 27.
- No SEG-CAD-11, a prova original do QA-CAD-08 (trecho do meio de um CPF) usou um CPF de teste que não é mais citado; o texto foi reescrito com valor fictício e uma nota. A varredura final dos documentos é do `seguranca`.
- Porta 3001: servidor encerrado, sem escuta. Não é entrega final: segurança e QA ainda precisam revalidar.

## E10 · rodada 3 (tipo CPF/CNPJ e textos)

Origem: decisão do responsável (26/11/2026, complemento da RAT-D017, registrado no Brain): o tipo do cliente aparece só como "CPF" ou "CNPJ"; nada de "Pessoa física", "Pessoa jurídica" ou "Empresa"; cliente sem documento fica sem tipo. Fecha o QA-CAD-02 (UI 4.2 contra UXC-01). Mais os ajustes de texto do `design-ui-ux` (A-01 a A-08), o N-01 e o N-04 do QA. Sem migration, sem regra de negócio e sem dependência nova. Build, servidor e e2e não foram feitos na rodada; foram feitos na etapa de verificação seguinte (ver a segunda tabela de comandos abaixo).

| Item | O que mudou | Arquivos |
|---|---|---|
| QA-CAD-02, A-01 | `clientTypeLabel` devolve `"CPF"` ou `"CNPJ"`; sem documento, `null`. Comentário reescrito | `src/domain/cadastros/client-view.ts` |
| A-02 | Unitário acompanha: "tipo: só CPF ou CNPJ; sem documento, nenhum" | `src/domain/cadastros/client-view.test.ts` |
| A-03 | Cabeçalho do detalhe do cliente: o tipo ganhou o prefixo `sr-only` "Tipo de documento: " (só leitor de tela). Visual igual: texto cinza depois do selo; sem documento, nada | `src/app/(app)/clientes/[id]/page.tsx` |
| A-04 | e2e do detalhe: `"Tipo de documento: CPF"` (cliente CPF) e `"Tipo de documento: CNPJ"` (cliente CNPJ), com ausência de "Pessoa física" e de "Empresa" no texto da página, e `"Tipo de documento"` ausente no detalhe do cliente sem documento. O extrator `visibleText` troca tags por espaço, então o prefixo e o tipo ficam contíguos no texto | `tests/e2e/cad-clients.e2e.test.ts` |
| A-05 | Nome fictício do cliente CNPJ do e2e: `Empresa E2E` virou `Cliente CNPJ E2E` (nenhum outro teste procura esse nome; a varredura de "Empresa" na interface fica sem falso positivo) | `tests/e2e/cad-clients.e2e.test.ts` |
| A-06 | Teto das listas de texto (apelidos do sócio, formas do nome, chaves Pix): nova constante `LIMIT_REACHED_HINT` ("Para adicionar ou reativar, inative ou remova algum item da lista."). Parágrafo do teto em texto normal (`text-sm`, não mais cinza claro) com "No máximo N ... + frase de saída", escondido enquanto houver erro de inclusão; campo e botões "Reativar" apontam para ele por `aria-describedby`; Enter no teto mostra a frase completa uma só vez; o anúncio ao chegar no teto termina com a frase "No máximo N ...". O zod e o servidor seguem devolvendo só "No máximo N ..." | `src/domain/cadastros/limits.ts`, `src/components/form/editable-text-list.tsx` |
| A-07 | Mesmo padrão nos apelidos do cliente (campo, botões "Reativar", Enter no teto, anúncio) | `src/app/(app)/clientes/_components/client-alias-list.tsx` |
| A-08 | Mesmo padrão nas contas do recebedor (os três campos entram no `describedBy`; Enter no teto; anúncio da última conta termina com "No máximo 20 contas.") | `src/app/(app)/configuracoes/socios/[id]/recebedores/_components/account-list.tsx` |
| N-04 | O caso "casos aleatórios (semente fixa)" ganhou tempo limite próprio de 30 s (o padrão do vitest é 5 s). Lógica do teste intacta | `src/domain/shared/equal-split.test.ts` |
| N-01 | Não alterado (ver abaixo) | nenhum |

Detalhes e desvios:
- A-06 a A-08: o botão "Adicionar" também só aponta para o parágrafo do teto enquanto ele existe (sem erro de inclusão), para não deixar `aria-describedby` apontando para elemento ausente. Os e2e que citam "No máximo N ..." (`cad-limits.e2e`, `actions.test.ts`, `schemas-limits.test.ts`) testam a resposta do servidor/zod, que não mudou; nenhum teste automático cobre o componente de tela (não há teste de componente no projeto). O visual e o fluxo por teclado do teto ficam para o `qa` conferir no navegador.
- N-01 (motivo com caractere NUL devolve a frase "O texto tem um caractere inválido." com `fieldErrors` vazio): o diálogo de confirmação (`ReasonField`) não tem lugar para erro por campo, e `reason` não está entre os campos conhecidos de nenhum dos formulários (o motivo vive no diálogo, não no formulário). Ligar o erro ao campo exigiria um erro novo no diálogo, o que seria tela nova. Hoje a frase aparece no alerta da ação, e o e2e (`cad-limits.e2e`) já prova código `VALIDATION`, a frase e nada gravado. O navegador, além disso, não deixa digitar NUL no campo. Registrado como não corrigido, a critério do responsável.
- Varredura do rótulo antigo ("Pessoa física", "Pessoa jurídica", "Empresa") em `src/` e `tests/`: sobrou apenas o `not.toContain` do e2e (de propósito). `docs/legado/` não foi tocado (RAT-D012).

| Comando | Resultado |
|---|---|
| `npm run lint` (PowerShell) | sem avisos |
| `npm run typecheck` (PowerShell) | ok |
| `npm test` (PowerShell) | 49 arquivos, 890 de 890 |
| build, `check:bundle`, banco, e2e | rodados na etapa de verificação (tabela abaixo) |

Verificação da rodada 3 (build e e2e), feita depois da rodada, sem alterar código nem teste:

| Comando | Resultado |
|---|---|
| `npx supabase db reset` | ok (limpou os dados de teste deixados pelo QA) |
| `npm run build` | ok |
| `npm run check:bundle` | ok, 52 arquivos sem chave secreta |
| `npm run seed:dev` (senha gerada na hora, só no ambiente do processo, não registrada) | ok |
| `npm run start` (porta 3001, segundo plano) + `npm run test:e2e` (PowerShell, mesma senha no ambiente) | 10 arquivos, **199 de 199**, sem falhas e sem repetição de arquivo; duração de 465 s |

Nenhum e2e falhou por causa da rodada 3 (rótulo "CPF"/"CNPJ", prefixo "Tipo de documento: " e demais textos). Servidor encerrado (PID conferido pelo `netstat` antes do `taskkill`); porta 3001 sem escuta depois (restam apenas conexões em TIME_WAIT). Não é entrega final: segurança e QA ainda precisam revalidar.

## E10 · rodada 4 (limites da RAT-D026)

Origem: decisão do responsável (27/11/2026), registrada no Brain como RAT-D026. Tetos de itens **ativos** por lista, agora regra de negócio (antes eram o limite técnico de proteção do QA-CAD-07, 50/50/50/20/20): sócio, 2 apelidos; cliente, 2 apelidos do tipo nome e 2 do tipo documento (CPF e CNPJ juntos), cada tipo com o próprio limite; recebedor, 30 formas do nome, 10 chaves Pix e 10 contas. Só os ativos contam; numa lista cheia, incluir ou reativar exige inativar outro antes. Fonte: `02-modelagem-dados.md` (revisão 4, 6.6 e 12) e `03-ui-ux.md` seção 17. A busca de documento em Clientes continua pelo começo do número (QA-CAD-08 fechado por decisão; a busca não foi alterada). Sem dependência npm nova, sem tocar no Brain nem no plano.

### Banco

| Item | O que mudou | Arquivos |
|---|---|---|
| Números e erro | `private.cad_list_limit(text)` (imutável; 2/2/2/30/10/10; chave nula ou desconhecida levanta XX000) e `private.assert_list_limit(text, integer)` (22023, hint `LIST_LIMIT_EXCEEDED`, detail JSON com `field`, `list`, `alias_type`, `identifier_type`, `max`). Sem `grant` a `authenticated` e sem SECURITY DEFINER; `revoke execute ... from public` | `supabase/migrations/20261125000300_cad_partner_receiver_rpcs.sql` |
| Sócio | `save_partner` confere os apelidos distintos (chave aproximada) dentro do laço de validação, antes de qualquer trava ou escrita | mesma migration |
| Recebedor | `save_receiver` conta por tipo (forma do nome, Pix, conta) e chama `assert_list_limit` uma vez por item novo | mesma migration |
| Cliente | `save_client` conta nome e documento à parte (`CLIENT_ALIAS_NAME` e `CLIENT_ALIAS_DOCUMENT`) | `supabase/migrations/20261125000400_cad_client_rpcs.sql` |
| pgTAP | `08` com as listas do sócio ajustadas ao teto de 2 (plan 226 igual); `12` novo, plan 86: números e catálogo, sócio, cliente, recebedor, lista enorme sob `statement_timeout` de 2 s e verificação de que o seed não passa do teto. Controles na própria suíte provam a ordem real das conferências (STALE_VERSION, PARTNER_INACTIVE, POSSIBLE_DUPLICATE) | `supabase/tests/database/08_cad_partners_receivers.test.sql`, `supabase/tests/database/12_cad_list_limits.test.sql` (novo) |

Nenhuma assinatura pública mudou; `database.types.ts` não foi regenerado. As migrations só foram aplicadas no banco local, não em produção.

### Aplicação

| Item | O que mudou | Arquivos |
|---|---|---|
| Números e frases | `LIST_LIMITS` (espelho do banco), `listLimitMessage` ("No máximo 2 apelidos."), `listLimitHelp` ("Até 2 apelidos ativos."), frase genérica, `MAX_*` derivados (`MAX_CLIENT_ALIASES` virou `MAX_CLIENT_NAME_ALIASES` e `MAX_CLIENT_DOCUMENT_ALIASES`) | `src/domain/cadastros/limits.ts` |
| Chaves de comparação | `squeezeAccountText`, `normalizePixKey`, `accountKey` e `countDistinctKeys` reunidos num módulo novo (evita import circular); `schemas.ts` e `receiver-identifiers.ts` reexportam | `src/domain/cadastros/identifier-keys.ts` (novo), `schemas.ts`, `receiver-identifiers.ts` |
| zod | Contagem de distintos por tipo (sócio, recebedor, cliente com nome e documento à parte); o problema vai no índice bruto do primeiro item acima do teto | `src/domain/cadastros/schemas.ts` |
| Listas (lógica) | `addItem` no teto devolve `atLimit`; `reactivateItem` recusa no teto; cliente: `clientAliasGroupOf`, `countActiveClientAliases`, `isClientAliasGroupFull`; contas: `addAccount` e `reactivateAccount` no mesmo padrão | `editable-list.ts`, `client-aliases.ts`, `receiver-identifiers.ts` |
| Erro do banco | Hint `LIST_LIMIT_EXCEEDED` (22023, VALIDATION); detail lido com zod tolerante; frase com o `max` do detail; `receiverFieldOfError` leva o erro à lista certa | `src/lib/cadastro-errors.ts`, `src/domain/cadastros/receiver-form.ts` |
| Telas (17.7) | Linha do limite sempre renderizada: ajuda antes do teto, frase e saída no teto, nunca as duas; `aria-describedby` com o limite; Adicionar e Reativar desabilitados apontam para ela; anúncios ao chegar ao teto e ao liberar vaga; cliente com grupo (Nome ou Documento) pelo seletor | `editable-text-list.tsx`, `account-list.tsx`, `client-alias-list.tsx` |
| Testes | `limits-sql.test.ts` novo (compara `LIST_LIMITS` com a `cad_list_limit` da 0300, o hint e o número de chamadas de `assert_list_limit`); `schemas-limits`, `client-aliases`, `editable-list`, `cadastro-errors` e as `actions.test.ts` de sócios e clientes atualizados; `tests/e2e/cad-limits.e2e.test.ts` reescrito (2 e 3 apelidos, 2+2 do cliente, 30/31, 10/11, 10/11 e 3.000 itens) | arquivos citados |

Divergência entre as duas especificações, resolvida a favor do design: a modelagem pedia "No máximo 2 apelidos de nome." para o cliente; o design pede "No máximo 2 nomes." e "No máximo 2 documentos.", e assim a frase do banco, a do zod e a da tela são a mesma. Chaves, números e hints não mudaram.

### Conferência da integração (feita na verificação)

- Hint e detail: o `assert_list_limit` do banco devolve `hint = 'LIST_LIMIT_EXCEEDED'`, errcode 22023 e detail com `field` (`aliases` ou `identifiers`), `list`, `alias_type`, `identifier_type` e `max`; o `cadastro-errors.ts` mapeia o mesmo hint, o mesmo SQLSTATE e lê exatamente esses campos (`list` restrito às chaves de `LIST_LIMITS`).
- Números: 2/2/2/30/10/10 em `LIST_LIMITS` e em `private.cad_list_limit`; o `limits-sql.test.ts` compara os dois lados por leitura do SQL e passou.
- e2e e seed: o seed não tem nenhum dono acima do teto (último teste do pgTAP 12); o e2e de limites cria os próprios dados e os demais e2e gravam no máximo 1 a 2 itens por lista; todos passaram contra o banco com os limites.

### Comandos e resultados

| Comando | Resultado |
|---|---|
| `npm run lint` | exit 0, sem avisos |
| `npm run typecheck` | exit 0 |
| `npm test` (PowerShell) | 50 arquivos, **932 de 932** (antes 890) |
| `npx supabase db reset` | ok |
| `npx supabase test db` | Files=12, Tests=**1272**, PASS (antes 1186; +86 do arquivo 12) |
| `npx supabase db lint` e `npx supabase db lint --schema public,private` | sem erros, as duas formas |
| `npx supabase db advisors --level warn --fail-on warn` | sem avisos |
| `npm run build` | ok |
| `npm run check:bundle` | ok, 52 arquivos sem chave secreta |
| `npm run seed:dev` (senha gerada na hora, só no ambiente do processo, não registrada) | ok |
| `npm run start` (porta 3001, segundo plano) + `npm run test:e2e` (PowerShell, mesma senha no ambiente) | 10 arquivos, **200 testes** (antes 199): na rodada completa, 199 passaram e 1 reprovou por tempo limite de 30 s em `acesso.e2e.test.ts` ("usuário inativado continua autenticando...") |
| `npx vitest run --config vitest.e2e.config.mts tests/e2e/acesso.e2e.test.ts` (arquivo sozinho) | 1ª repetição: o mesmo teste reprovou de novo por tempo (37,8 s); 2ª repetição, com novo `seed:dev`: **18 de 18** |
| `npm audit --omit=dev` | 0 vulnerabilidades |

Nota sobre o tempo limite: o teste chama `npx supabase db query --local` duas vezes (inativar e reativar o operador), e cada chamada leva cerca de 10 s nesta máquina ocupada (medido: 9,7 s e 10,5 s para um `select 1`), mais os logins e a navegação; o total ficou em torno do teto de 30 s. É o mesmo teste e o mesmo sintoma das rodadas 2 e 3 (tempo, sem relação com limites de itens); passa quando a máquina está menos carregada. Sugestão, não aplicada por estar fora do escopo: dar ao teste um tempo limite próprio maior. Nenhum e2e falhou por causa da rodada 4.

Servidor encerrado (PID 60836 conferido pelo `netstat` e pela linha de comando antes do `taskkill`); porta 3001 sem escuta depois. Não é entrega final: segurança e QA ainda precisam revalidar a rodada 4. Pendência herdada (DECISÃO PENDENTE, UI 17.7.8): o texto de "cadastro já acima do novo teto" só vale se existir dado assim; hoje, acima do teto, Adicionar e Reativar ficam desabilitados e a linha mostra a frase do teto.

## E10 · rodada 4b (conferência do design e tempo dos testes de acesso)

Rodada curta, sem regra nova, sem mudança de números, hints ou banco (`supabase/` intocado). Fecha as ressalvas (2) e (3) do QA da rodada 4. A ressalva (1), a conferência no navegador pelo responsável, segue com o responsável.

### O que mudou, arquivo por arquivo

| Item | Arquivo | Mudança |
|---|---|---|
| R4-UX-01 (média) | `src/components/form/editable-text-list.tsx` | `handleRemove`: estando no teto com o erro de teto na tela (`atLimit && addError?.isLimit`), limpa o erro de inclusão. A linha do limite volta (ajuda "Até ...") e "Adicionar" habilita, sem o erro vermelho contradizendo. Vale para apelidos do sócio, formas do nome e chaves Pix. |
| R4-UX-01 | `src/app/(app)/clientes/_components/client-alias-list.tsx` | `handleRemove`: limpa o erro de teto só quando o grupo do item removido (`clientAliasGroupOf(item.type)`) estava cheio e é o grupo escolhido no seletor (`full[freed] && freed === group`). Remover do outro grupo mantém o erro, que continua valendo. |
| R4-UX-01 | `src/app/(app)/configuracoes/socios/[id]/recebedores/_components/account-list.tsx` | `handleRemove`: mesma regra da lista de textos. |
| R4-UX-02 (baixa) | `src/app/(app)/configuracoes/socios/[id]/recebedores/_components/account-list.tsx` | Novo `invalidFor(campo)`: erro de inclusão sem campo (`field` nulo: teto e conta repetida) marca `aria-invalid` nos três campos (Banco, Agência, Conta); erro com campo continua marcando só o campo dele. |
| Tempo dos testes | `tests/e2e/acesso.e2e.test.ts` | O teste "usuário inativado continua autenticando, mas perde o acesso na hora; ao reativar, volta" ganhou tempo limite próprio de 90 s (terceiro argumento de `it`, forma aceita pelo vitest 5.0.3 instalado), com comentário de uma linha. |
| Tempo dos testes | `tests/e2e/comprovantes.e2e.test.ts` | O teste "usuário inativo é recusado (403) para enviar e para ler..." ganhou o mesmo tempo limite de 90 s e o mesmo comentário. |

Não mudaram: o limite global de 30 s em `vitest.e2e.config.mts`, a lógica dos testes, textos, números, hints e o banco.

Testes unitários: nenhum teste unitário confere esses textos nem o comportamento de tela (não há teste de componente no projeto; a lógica de lista é coberta por `editable-list`, `client-aliases` e `receiver-identifiers`, que não mudaram). Por isso nenhum teste unitário precisou de ajuste. A conferência do comportamento novo das telas fica no roteiro do navegador abaixo.

### Roteiro para o navegador (ressalva 1 do QA)

1. Sócio, apelidos: com 2 apelidos ativos, digitar um terceiro e apertar Enter (erro vermelho de teto, linha do limite escondida). Clicar em "Inativar" em um apelido salvo: o erro some, a linha "Até 2 apelidos ativos." volta e "Adicionar" habilita. O leitor de tela anuncia "Já dá para adicionar ou reativar."
2. Cliente: com 2 nomes ativos e Tipo = Nome, Enter com um terceiro nome (erro de teto). Remover um documento (outro grupo): o erro de teto permanece. Remover um nome: o erro some e "Adicionar" habilita.
3. Recebedor, contas: com 10 contas ativas, preencher Banco, Agência e Conta e apertar Enter (erro de teto): os três campos ficam com `aria-invalid` e o foco vai ao campo Conta. Inativar uma conta: o erro some.
4. Recebedor, formas do nome e chaves Pix: mesmo teste do item 1.

### Comandos e resultados

| Comando | Resultado |
|---|---|
| `npm run lint` | exit 0, sem avisos |
| `npm run typecheck` | exit 0 |
| `npm test` (PowerShell) | 50 arquivos, **932 de 932** (igual à rodada 4) |
| `npm run build` | ok (mudou código de tela); `next start` não foi subido |
| e2e | não rodado nesta rodada, por instrução: o QA roda tudo em seguida |

Porta 3001 livre ao final (nenhum servidor foi iniciado). Não é entrega final: segurança e QA ainda precisam revalidar a rodada 4b.

## E10 · rodada 4c (dados de teste fictícios)

Motivo: antes do commit público, uma varredura achou, nos arquivos da feature, números de documento com dígito verificador válido fora dos padrões fictícios do projeto (RAT-D019, SEG-CAD-02, SEG-CAD-12) e telefones de teste com DDD real. Só dados de teste, comentários e exemplos de documentação mudaram; nenhuma lógica, migration ou seed.

Convenção de dado de teste desta rodada (decisão técnica do orquestrador, a registrar em `05-seguranca.md`; não é regra de negócio):

- CNPJ só de números: raiz sintética `99.999.999` (filiais `0001-91`, `0002-72`, `0003-53`; a `0002-72` substituiu o valor antigo).
- CPF: faixa `000.000.00x-xx`; exceção única para o caso de resto 10 no segundo DV (um vetor `000.000.0xx-30` já existente em `document.test.ts`).
- Telefone de teste (chave Pix de celular): DDD 23, que não existe no Brasil.
- Teste que só aplica máscara troca os dois últimos dígitos por `00` (DV inválido de propósito).
- E-mail de teste: domínio `example.com`.
- CPF novo: `000.000.005-15` (no lugar do "529.…25"), `000.000.004-34` (no lugar do "123.…09" nos exemplos e fixtures); CNPJ numérico `99.999.999/0002-72` (no lugar do "11.2…81"); CNPJ alfanumérico `EX0A1B2C000119` (no lugar do "AB1C…70", DV conferido com `isValidCnpj`).

Arquivo por arquivo (valores antigos mascarados):

| Arquivo | O que mudou |
|---|---|
| `src/app/(app)/clientes/actions.test.ts` | CPF "529.…25" e CNPJ "11.2…81" (com e sem máscara) pelos novos; `VALID_CNPJ` agora `99.999.999/0002-72` |
| `src/domain/cadastros/client-aliases.test.ts` | mesmos dois documentos (formatados onde estavam formatados) |
| `src/domain/cadastros/client-form.test.ts` | os dois documentos acima; CPF "123.…09" (fixtures de apelido-documento) por `000.000.004-34` |
| `src/domain/cadastros/client-aliases.ts` | JSDoc: exemplo "123.…09" por `000.000.004-34` |
| `src/domain/documents/document-mask.ts` | JSDoc de `maskCpf`: exemplo por `000.000.004-34` |
| `src/domain/documents/document-mask.test.ts` | testes só de máscara: dois últimos dígitos do CPF "123.…09" e do CNPJ "12.3…95" trocados por `00` na entrada e no esperado; a entrada parcial do CNPJ (13 dígitos) ficou `...0001-0` para seguir a mesma sequência |
| `src/domain/documents/document.test.ts` | vetor 18: CNPJ alfanumérico "AB1C…70" por `EX0A1B2C000119` (continua válido) |
| `src/lib/format.ts` | JSDoc de `formatCnpj`: exemplo numérico por `99999999000272` -> `99.999.999/0002-72` |
| `src/lib/logger.test.ts` | `FAKE_CPF` e o CPF solto por `000.000.004-34` / `00000000434`; CNPJ numérico por `99.999.999/0002-72`; e-mail de exemplo por `usuario@example.com` (esperado `u***@example.com`). Os padrões do logger continuam pegando os valores (teste verde) |
| `src/server/authorization.test.ts` | e-mail de sessão por `usuario@example.com` (duas linhas) |
| `src/server/cadastros/action-support.test.ts` | CNPJ numérico (com e sem máscara) e telefone Pix com DDD 23 |
| `src/domain/cadastros/schemas.test.ts` | telefone Pix `+55 (23) 91234-5678` (entrada e esperado) |
| `src/domain/cadastros/receiver-identifiers.test.ts` | telefone Pix com DDD 23 (entrada e esperado) |
| `src/domain/cadastros/editable-list.test.ts` | telefone salvo e telefone digitado com DDD 23 (continuam o mesmo número, para o teste de duplicidade) |
| `src/app/(app)/configuracoes/socios/[id]/recebedores/actions.test.ts` | telefone Pix com DDD 23 (formulário e esperado) |
| `supabase/tests/database/07_cad_documents.test.sql` | vetor 18 e a contagem de alfanuméricos com letras (`EX0A1B2C000119`); telefone Pix `+55 (23) 91234-5678` -> `+5523912345678` |
| `supabase/tests/database/08_cad_partners_receivers.test.sql` | telefones Pix das linhas de entrada e de valor normalizado esperado (DDD 23) |
| `supabase/tests/database/09_cad_clients.test.sql` | CPF com máscara -> `00000000515`; CNPJ numérico com máscara -> `99999999000272`; documento do teste de aviso de nome repetido (cliente novo) por `000.000.004-34` |
| `docs/features/CAD-001-socios-e-clientes/02-modelagem-dados.md` | tabela 12.3 e regra da chave Pix: exemplo de telefone com DDD 23 (igual ao pgTAP 07) |
| `docs/features/CAD-001-socios-e-clientes/04-implementacao.md` | linhas P-IMPL-02 (alfanumérico novo), E4/teste do documento (CPF de resto 10 mascarado como `000.000.0xx-30`) e SEG-CAD-11 (vetor numérico citado como `99.999.999/000x-xx`); esta seção |

Sem troca (decisão do orquestrador): CNPJ `99.999.999/0001-91` (raiz da convenção) e o CPF `000.000.0xx-30` (exceção registrada do resto 10).

### Conferência manual dos pgTAP 07, 08 e 09 (o pgTAP NÃO foi rodado)

- 07: o vetor 18 e a contagem "quatro CNPJ alfanuméricos com letras" usam `EX0A1B2C000119`, distinto dos demais (`12ABC34501DE35`, `ZZ0TESTE000100`, `ZZ0TESTE000282`); o DV foi conferido em script contra `isValidCnpj` (mesmo algoritmo de `private.is_valid_cnpj`). O telefone normalizado esperado (`+5523912345678`) bate com a entrada formatada.
- 08: os dois telefones (`+55 (23) 91234-5678` na linha da inserção e `+55 (23) 90000-1111` no JSON do RPC) continuam distintos entre si e o valor normalizado esperado de cada um (`+5523912345678`, `+5523900001111`) bate com a entrada; nenhuma chave repetida no mesmo arquivo (sem risco de `IDENTIFIER_TAKEN`).
- 09 (uma única transação): `00000000515` e `99999999000272` não existem em outro lugar do arquivo (os documentos gravados são os `ZZ0TESTE...`, `10000000957`, `99999999000191`, os apelidos `00000000191` e `00000000272`); o CNPJ numérico novo é a filial 0002 porque a 0001 já está em outro cliente (daria `DOCUMENT_TAKEN`). O CPF `000.000.004-34` do teste de nome repetido não está gravado em nenhum cliente nem apelido. Valores canônicos esperados batem com as entradas com máscara.
- O pgTAP (`npx supabase test db`) fica pendente para depois da conferência do responsável no navegador (o banco local não foi tocado nesta rodada).

### Comandos e resultados

| Comando | Resultado |
|---|---|
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` (PowerShell) | 50 arquivos, **932 de 932** (igual à rodada 4b) |
| busca dos valores antigos (itens 1, 2, 3, 5, 6, 8 e 9) em `src/`, `tests/` e `supabase/tests/` | nenhuma ocorrência |

Fora do escopo desta rodada e ainda com valores antigos (a tratar por quem edita cada arquivo): `docs/features/CAD-001-socios-e-clientes/06-qa.md` (QA), `docs/features/FND-001-fundacao/03-ui-ux.md` e `docs/legado/07-10/supabase/seed.sql` (legado). Não é entrega final: segurança e QA ainda precisam revalidar.

## E10 · rodada 4d (ajustes da regressão final)

Motivo: a regressão final antes do commit rodou o pgTAP pela primeira vez depois da rodada 4c e reprovou um teste. Causa: resíduo do dado de teste trocado na 4c. Só dado de teste mudou; nenhuma lógica, migration, seed ou código de produção.

| Arquivo | O que mudou |
|---|---|
| `supabase/tests/database/09_cad_clients.test.sql` | Teste "Busca pelo começo do CPF" (linha 816): o termo de busca ainda era o começo do CPF antigo ("529.9…"), mas o cliente `Cliente Rpc Cpf` passou a ser gravado com `000.000.005-15` na 4c. Busca trocada para `000.000.005` (começo do CPF novo, já dentro da convenção SEG-CAD-15) |

Conferência: `000.000.005` (9 dígitos `000000005`) só casa com o CPF `00000000515` do cliente `Cliente Rpc Cpf`; nenhum outro documento ou apelido do arquivo começa assim, então a busca devolve uma única linha. Busca pelo valor antigo em `supabase/`, `src/` e `tests/`: nenhuma ocorrência restante.

| Comando | Resultado |
|---|---|
| `npx supabase test db` (sem reset) | 12 arquivos, **1272 testes**, Result: PASS (o 09 inteiro passou) |

Não é entrega final: segurança e QA ainda precisam revalidar.

### Ajustes de acabamento (pontas soltas da regressão final)

Só teste; nenhuma lógica, migration, seed ou código de produção.

| Arquivo | O que mudou |
|---|---|
| `src/app/(app)/clientes/actions.test.ts` (linha 175) | CNPJ inválido do teste "CNPJ com dígitos errados…" trocado de "11.2…80" para `99.999.999/0001-90` (raiz da convenção SEG-CAD-15, segundo dígito verificador errado; o válido seria 0001-91). Mesma mensagem esperada |
| `src/domain/cadastros/client-aliases.test.ts` (linha 72) | Mesma troca no teste "documento inválido: mensagens da UI 4.1.2" |
| `src/domain/cadastros/client-form.test.ts` (linha 123) | Mesma troca no teste "mensagens exatas da UI 4.1.2" |
| `tests/e2e/acesso.e2e.test.ts` (afterAll da linha 111) | Timeout próprio de 90 s (segundo argumento do `afterAll`), com comentário, no mesmo estilo do teste da linha 163: `setUserAccess` roda `supabase db query` e estourou o `hookTimeout` global de 30 s uma vez na rodada 4d. O `hookTimeout` global não mudou |

Conferência: o valor novo não colide com nenhum outro documento dos três arquivos (os CNPJs válidos usados neles são `99.999.999/0002-72`, outro número depois de normalizado). Busca por "11.2…80" em `src/`, `tests/` e `supabase/`: nenhuma ocorrência restante. O e2e não foi rodado pelo desenvolvedor (fica com o QA). Segurança e QA ainda precisam revalidar.
