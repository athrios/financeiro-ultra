# CAD-001 · Segurança

> Registro das revisões do agente `seguranca`. Caminhos temporários aparecem como `<scratchpad>`.

## Postura de segurança (RAT-D020)

O sistema é de uso interno. Esta revisão confere só o básico: login por convite, papéis garantidos no banco, auditoria, área privada e segredos fora do código. CAPTCHA, limite próprio de tentativas, CSP mais rígida e e-mails de aviso ficam fora e não foram tratados como achado. Valem também as decisões RAT-D021 (motivo opcional) e RAT-D023 a RAT-D025: nada é mascarado para Operador e Visualizador, a chave Pix pode ser CPF ou CNPJ, e não se guarda documento de titular nem de sócio.

## E8 · Gate G4 (26/11/2026)

**Escopo:** branch local `cad-001/socios-clientes`, ainda sem commit, sobre `d045da5` (`fnd-001/e9`): migrations `20261125000100` a `0400`, Server Actions, páginas, `src/server/{cadastros,clients,partners,receivers}`, `src/lib/{errors,cadastro-errors,logger}.ts`, seed, testes, e2e `cad-*` e documentos novos e alterados.

**Como foi conferido:**
- leitura do código;
- consultas só de leitura no banco local (`docker exec … psql`, transações `begin read only … rollback`), sem `db reset`, `seed:dev`, `next start` nem e2e;
- `npm audit --omit=dev` e `npm run check:bundle`;
- busca de segredos, e-mails e documentos nos 157 arquivos novos e alterados.

**Veredito: LIBERADO COM RESSALVAS.** BLOQUEIA RELEASE: **NÃO**. Achados: 0 críticos, 0 altos, 0 médios, 2 baixos e 8 informativos.

### SEG-CAD-01 · baixo · aberto

- **Evidência:** `src/lib/logger.ts` só redige pelo conteúdo o CPF (`CPF_FORMATTED_PATTERN` e `CPF_BARE_PATTERN`) e o e-mail, que fica parcial. Testei as mesmas expressões no `<scratchpad>/redact.mjs` e passam **sem redação**:
  - o CNPJ numérico, com e sem máscara (`11.2…81`, `1122…81`);
  - o CNPJ alfanumérico (`12ABC34501DE35`);
  - a chave Pix de telefone (`+55…21`) e a aleatória (UUID);
  - a conta no formato normalizado (`banco|agência|conta`);
  - `{"document":"1122…81"}`.

  Pelo nome do campo, `document`, `documento`, `cnpj`, `value` e `details` não são sensíveis em `SENSITIVE_WORDS`. O único ponto de log novo é `src/server/cadastros/action-support.ts:32`, que grava `cause: appError.cause`, isto é, o objeto de erro do PostgREST com `message` e `details`, quando o código é `UNEXPECTED`.
- **Cenário:** um erro do banco fora do mapa de `errors.ts`, como `23502` ou uma falha inesperada de constraint ou tipo, cujo `details` traga a linha ("Failing row contains (…)") ou o valor. O CNPJ, a chave Pix ou a conta vão inteiros para o log técnico do Render. A exploração depende de um erro inesperado: não é provocável por usuário comum, e só o Administrador escreve.
- **Impacto:** documento ou dado bancário no log técnico, fora da regra R-C16 ("não vai para logs técnicos") e do cabeçalho do próprio logger ("CPF e dados bancários nunca saem em log").
- **Correção recomendada:**
  1. Em `action-support.ts`, registrar do erro do banco só `code`, `hint` e `message`, sem `details`. O `detail` dos cadastros carrega dono, documento e valor.
  2. Em `logger.ts`, redigir pelo conteúdo o CNPJ com e sem máscara, numérico e alfanumérico (`\b[0-9A-Z]{2}\.?[0-9A-Z]{3}\.?[0-9A-Z]{3}/?[0-9A-Z]{4}-?\d{2}\b` e 14 caracteres corridos), e incluir `document`, `documento` e `cnpj` em `SENSITIVE_WORDS`.
- **Como validar:**
  - casos em `logger.test.ts` com os três formatos de CNPJ e um objeto `{document: …}`;
  - um teste de `toActionFailure` com um erro `UNEXPECTED` cujo `details` contém CNPJ e chave Pix: a linha de log não pode conter nenhum dos dois.
- **Quem corrige:** `desenvolvedor`. Pode ficar para depois do merge, mas precisa estar feito antes de entrarem dados reais.

### SEG-CAD-02 · baixo · aberto

- **Evidência:**
  - Os documentos públicos citam o CPF `<CPF com DV válido, removido>`, com DV válido e fora do padrão fictício do projeto (`000.000.00x-xx`): `docs/features/CAD-001-socios-e-clientes/03-ui-ux.md:1127` (T-33) e `04-implementacao.md:977` (D-E7a-04). Não está no seed nem nos testes. O mais provável é que tenha vindo de um gerador ou de uma digitação durante a revisão de UI.
  - `04-implementacao.md:1085` usa `<e-mail em domínio real, removido>`, em domínio real (`x.com`).
- **Cenário:** o repositório `athrios/financeiro-ultra` é público. Um CPF válido pode pertencer a uma pessoa real; sozinho, sem nome, o impacto é pequeno.
- **Impacto:** fere a RAT-D019 e a regra do repositório público. É higiene, sem exposição de dado do negócio.
- **Correção recomendada:** antes do commit, trocar por `000.000.001-91` e por `pix.exemplo@example.com`. Os vetores de teste conhecidos (`529.…25`, `123.…09`, `11.2…81`) podem ficar, mas o ideal é migrá-los aos poucos para o padrão `000.000.00x`.
- **Como validar:** procurar nos arquivos versionados o CPF e o domínio apontados (lista mantida fora do repositório); o resultado deve ser vazio. Corrigido pelo orquestrador em 26/11/2026: `000.000.001-91` e `pix.exemplo@example.com`.
- **Quem corrige:** `desenvolvedor` ou o orquestrador, porque são só documentos.

### SEG-CAD-03 · informativo · banco ok

Evidência no catálogo do banco local (`<scratchpad>/cat.sql`) e nas migrations:

- **RLS ligada nas 6 tabelas novas, só leitura (`FOR SELECT TO authenticated`):**
  - `partner_aliases`, `receivers` e `receiver_identifiers`: `is_admin()`;
  - `clients` e `client_partners`: `can_read_business()`;
  - `client_aliases`: `is_admin() or (active and can_read_business())`.

  `has_role` exige `p.id = auth.uid() and p.active`.
- **Concessões:** `authenticated` tem só `SELECT`. `anon` não tem nada, nem na tabela nem nas funções: `permission denied for table clients` e `permission denied for function search_clients`. `service_role` não tem `TRUNCATE`. Não há `grant all`.
- **Sócio (P-02b), sem papel e inativo:** recebem 0 linhas.
  - Prova ao vivo com um `sub` inexistente: 0 em todas as tabelas, em `audit_logs` e em `search_clients` e `search_aliases`.
  - Os papéis positivos e o PARTNER estão no `10_cad_roles_matrix.test.sql`, que não rodei: o banco está com o QA.
- **Funções `private` de escrita** (`save_*`, `set_*_active`, guardas e auxiliares de unicidade):
  - são `SECURITY DEFINER` com `search_path=""`;
  - têm `revoke … from public`;
  - fazem `require_admin()` como primeira instrução e `set_audit_context` como segunda. Prova ao vivo: `save_client` e `set_partner_active` sem papel param em `ADMIN_REQUIRED`, na linha do `require_admin`.

  Os normalizadores e o `require_admin` não têm `grant`. As funções `is_valid_*` e `normalize_document` são puras e liberadas a `authenticated`, o que não tem risco.
- **Invólucros `public`:** os quatro de escrita, mais `search_clients` e `search_aliases`, são `SECURITY INVOKER`. Nenhuma função `SECURITY DEFINER` em `public` (consulta com 0 linhas). O schema `private` não é exposto pelo PostgREST (`config.toml`: `public` e `graphql_public`), e o `pg_graphql` não está instalado.
- **`detail` com dados do dono:** só é alcançável depois de `require_admin()`. Isso vale para `DOCUMENT_TAKEN`, `ALIAS_TAKEN`, `IDENTIFIER_TAKEN`, `PARTNER_NAME_TAKEN`, `POSSIBLE_DUPLICATE` (com documento de outros clientes), `PARTNER_HAS_CLIENTS`, `RECEIVERS_CHANGED` e o `value` dos erros `22023`. Os gatilhos que levantam esses erros só disparam em escrita, e a escrita só existe pelas RPCs ou por `service_role`. `search_aliases` corta quem não é Administrador antes de montar qualquer linha.
- **Auditoria:** `audit_row_change` está nas 6 tabelas, e `partners` já o tinha na FND. `audit_event` cobre `INACTIVATE` com os recebedores, `PARTNERS_CHANGE` e `DUPLICATE_WARNING_ACK`. O motivo é opcional (RAT-D021) e não bloqueia nada.
- **Travas:** `prevent_mutation` em `DELETE` e `prevent_truncate` em `TRUNCATE` nas 6 tabelas.
- **Ordem das travas e concorrência:** `FOR SHARE` e `FOR NO KEY UPDATE` mais `pg_advisory_xact_lock` por valor, e versão otimista exata. Uma colisão de `hashtext` só serializa valores sem relação entre si, sem efeito de segurança.

### SEG-CAD-04 · informativo · aplicação ok

- **Server Actions:** as 6 de escrita (`clientes/actions.ts`, `socios/actions.ts`, `socios/[id]/recebedores/actions.ts`) chamam `authorizeAdmin()` primeiro. Ele chama `getSession()`, que valida o JWT e relê o perfil, e nega por padrão o perfil inexistente, sem papel, inativo, Operador, Visualizador e Sócio. Depois vêm a validação com `zod` e a escrita pelas RPCs. O sócio de destino e a situação atual vêm do banco, nunca do formulário.
- **Sem `cause` nem pilha para a tela:** `fail()` copia só `code`, `message`, `field`, `hint` e `details`. O `details` passa por esquemas `zod` em `cadastro-errors.ts`, e a mensagem sai sempre da tabela fixa.
- **`?aviso=`:** `parseClientFlash` e `parsePartnerFlash` usam `switch` com chaves fixas. A contagem é `^\d{1,5}$` com teto, e a mensagem nunca vem da URL.
- **`server-only`:** presente em `src/server/{cadastros,clients,partners,receivers}` e em `lib/supabase/server`. O único import de componente cliente para `@/server` é `import type`, apagado na compilação. `check:bundle` deu ok (51 arquivos).
- **Guardas de página:**
  - as páginas de Sócios e Recebedores usam `guardPage("/configuracoes/socios")`, item `ADMIN_ONLY` na navegação;
  - Apelidos, `clientes/novo` e `clientes/[id]/editar` usam `guardAdminPage`;
  - a lista e o detalhe de Clientes usam `guardPage` (Admin, Operador e Visualizador);
  - as ações de Administrador no detalhe só aparecem com `isAdmin`.
- **IDs da URL:** `isUuidText` em todas as leituras por id. O recebedor também confere `receiver.partnerId === id`. Os filtros (`status`, `por`, `pagina`, `q` com até 200 caracteres, `socio`) passam por esquemas.
- **Leituras:** só pelo cliente da sessão, com RLS. A aplicação não usa a chave secreta (`env.ts` a recusa fora do ambiente local).
- **Componentes `alert-dialog.tsx` e `textarea.tsx`:** escritos à mão sobre `@base-ui/react`, que já estava instalado. Não têm `dangerouslySetInnerHTML` nem dependência nova. O `cn` importado é o pacote `cn@0.4.0` (repositório `shadcn-ui/cn`), que já estava no lock desde a E0.

### SEG-CAD-05 · informativo · dependências ok

`npm audit --omit=dev`: 0 vulnerabilidades. `package.json` e `package-lock.json` estão sem diferença em relação à base.

### SEG-CAD-06 · informativo · repositório público ok, exceto SEG-CAD-02

Nos arquivos novos e alterados não há:
- chave `sb_secret_` ou `sb_publishable_`;
- JWT;
- ref de projeto `*.supabase.co`;
- URL real do Render: só `<serviço>`, no README.

Os e-mails são todos `@example.com` ou `@exemplo.com`, com a exceção do SEG-CAD-02. O seed usa nomes fictícios ("Sócio Exemplo", "Cliente Modelo Ltda"), CNPJs gerados (`EX0SEED…`), Pix `@example.com` ou UUID fictício e a conta "Banco Semente". O `$ACTION_KEY` fixo em `tests/e2e/support/cadastros.ts` não é segredo.

### SEG-CAD-07 · informativo · "Registro não encontrado" com status 200

- **Evidência:** as páginas chamam `notFound()` dentro de um trecho em streaming (Suspense ou PPR). Quando isso acontece, o cabeçalho já saiu com status 200 (`04-implementacao.md:595`). A tela "Sem permissão" também sai com 200.
- **Avaliação:** não vaza dado. Id inexistente, id escondido pelo RLS e id que não é UUID dão a mesma resposta, então não servem para descobrir se um registro existe. Não há correção de segurança a fazer.
- **Se quiser o 404 por UX ou monitoramento:** mover a leitura do id para antes da fronteira de streaming. Fica com o `desenvolvedor` e o `qa`, sem prioridade de segurança.

### SEG-CAD-08 · informativo · identificadores de recebedor inativo continuam ativos (O-E7b-02)

- **Evidência:** inativar o recebedor, ou o sócio em cascata, não inativa os `receiver_identifiers`, e isso está na modelagem. `save_receiver` aceita incluir identificador ativo em recebedor inativo, porque não confere a situação do recebedor nem a do sócio na edição. A lista de Apelidos mostra esses itens em "Ativos" sem indicar que o dono está inativo, embora `search_aliases` já devolva `owner_active`.
- **Avaliação:** não há risco hoje, porque só o Administrador vê e edita. O ponto importa para a feature Recebimentos e Importação: se o reconhecimento casar só por `ri.active`, um comprovante pago para a chave Pix ou a conta de um recebedor inativo, ou de um sócio inativo, será atribuído a esse sócio.
- **Recomendação:**
  1. Handoff ao plano de Recebimentos (`engenheiro-software` e `modelagem-dados`): o reconhecimento deve exigir `r.active and p.active`, ou mandar o caso para revisão humana (RAT-D008).
  2. Na tela de Apelidos, mostrar "(recebedor inativo)" ou "(sócio inativo)" ao lado do dono. Fica com o `design-ui-ux` e o `desenvolvedor`, sem bloquear.

### SEG-CAD-09 · informativo · U-C14 confirmada

Renomear o sócio e trocar a chave Pix ou a conta do recebedor podem salvar **sem diálogo e sem motivo**. Do ponto de vista de segurança, basta:
- só o Administrador escreve, e isso é garantido no banco;
- o identificador é imutável: trocar é inativar uma linha e incluir outra, ambas com `ROW_CHANGE` (antes, depois, autor e `tx_id`);
- a renomeação gera `ROW_CHANGE` com a diferença;
- o motivo é opcional (RAT-D021), e um diálogo a mais seria camada extra (RAT-D020).

A `seguranca` não exige o padrão 4.1.8 nesses dois casos.

### SEG-CAD-10 · informativo · dados pessoais e bancários (P-20), recomendações para antes dos dados reais

**O que é guardado e quem lê:**

| Dado | Onde | Quem lê |
|---|---|---|
| CPF ou CNPJ do cliente | `clients.document` | Admin, Operador e Visualizador, completo (RAT-D023, "Ver completo") |
| CPF ou CNPJ de quem paga em nome do cliente (terceiro) | `client_aliases` do tipo `DOCUMENT` | Admin, Operador e Visualizador, só os ativos |
| Nome do titular, chave Pix (pode ser CPF, CNPJ, e-mail ou telefone), banco, agência e conta | `receivers` e `receiver_identifiers` | Só o Admin |
| Observações livres do cliente | `clients.notes` | Admin, Operador e Visualizador |
| Antes e depois de tudo isso, sem redação | `audit_logs` | Só o Admin |

O sócio não tem documento (RAT-D025), e o titular também não (RAT-D023). A exposição está de acordo com as decisões.

**Recomendações ao responsável, sem bloquear, a decidir na P-20 antes de dados reais:**
1. **Retenção e redação da auditoria.** `audit_logs` só recebe inclusões e guarda CPF, CNPJ, Pix e conta para sempre. O mecanismo de redação por coluna já existe (`audit_row_change(entity, 'col1,col2')`) e não é usado nas tabelas novas. Falta decidir se guarda o valor inteiro, guarda só a indicação de que mudou, ou guarda por um prazo.
2. **CPF de terceiro.** O CPF de quem paga em nome do cliente aparece para Operador e Visualizador. Isso segue a RAT-D023, mas precisa entrar no inventário da P-20 (finalidade e base legal).
3. **Orientação de uso.** Pedir que não se registrem dados pessoais em "Observações" (texto livre lido por todos os papéis de leitura).
4. **Pendências da FND.** Continuam valendo a P-26 (servidor em Virginia) e o SEG-E9B-07 (plano gratuito; dados reais só depois da P-05c2).
5. **Logs.** Corrigir o SEG-CAD-01 antes de dados reais.

### Riscos residuais

- O Administrador pode chamar as RPCs direto pelo PostgREST: o mesmo caso do SEG-E8B-02, aceito pela RAT-D020. As regras do banco valem igual; só o tamanho do motivo, que a tela limita a 500, não tem limite no banco.
- Erros não tratados em Server Components são registrados pelo próprio Next, fora do `logger.ts`. Nas leituras dos cadastros não se espera dado pessoal nessas mensagens, mas não há redação nesse caminho.
- `audit_logs` guarda os dados pessoais sem redação (SEG-CAD-10, item 1).

### Áreas não verificadas

- **Não rodei:** pgTAP (`10_cad_roles_matrix` e `11_cad_audit`), e2e e navegador, porque o QA estava usando o banco e a porta 3001. Os papéis positivos (Administrador, Operador e Visualizador) e o Sócio foram conferidos pela leitura dos testes e pelo registro da implementação: 1174 pgTAP e 156 e2e. A prova ao vivo foi só com o usuário sem papel e com `anon`.
- **Durante a revisão,** o banco local ficou vazio por alguns minutos, porque o QA o estava recriando; as consultas foram refeitas depois.
- **Fora desta revisão:**
  - os painéis do Render e do Supabase hospedado (as migrations ainda não foram aplicadas lá, e o SEG-E9B-08 continua aberto);
  - o histórico do git, porque ainda não há commit da CAD-001;
  - a saída real de log em produção.

## E8 · revalidação após E10 (26/11/2026)

**Escopo:** as correções da E10 registradas em `04-implementacao.md` ("E10 · correções" e "E10 · verificação completa"), na mesma branch local, ainda sem commit. Revisão só de leitura: sem `db reset`, `seed:dev`, servidor nem e2e, porque o QA estava usando o banco e a porta 3001.

**Como foi conferido:**
- leitura de `src/lib/logger.ts`, `src/server/cadastros/action-support.ts`, `src/lib/errors.ts`, das três `actions.ts` de escrita, de `alias-view.ts`, `aliases-list.tsx` e da `search_aliases` na migration `0400`;
- `npx vitest run` de `logger.test.ts` e `action-support.test.ts`: 2 arquivos, 60 de 60;
- `npm test` completo: 49 arquivos, 889 de 890. A única falha foi o tempo limite de 5 s em `equal-split.test.ts` ("casos aleatórios"), com a máquina ocupada pelo QA. O arquivo não mudou e passou sozinho, 19 de 19;
- uma sonda própria (`<scratchpad>/probe.ts`, com `tsx`) contra o `logger.ts` real;
- uma varredura (`<scratchpad>/scan.mjs`) dos 427 arquivos de `git ls-files` e dos novos de `git status`, sem `.acessos/` e sem `node_modules/`. Ela procura CPF e CNPJ com DV válido, com e sem máscara, e e-mails fora de `example.com` e `exemplo.com`. A saída só traz arquivo, linha e os três primeiros caracteres. Nenhum número suspeito foi copiado para este registro.

**Veredito do G4: LIBERADO COM RESSALVAS.** BLOQUEIA RELEASE: **NÃO**. 0 críticos, 0 altos, 0 médios. Os três itens reabertos estão fechados. Há 1 achado baixo novo (SEG-CAD-11), a corrigir antes do commit pelo mesmo motivo do SEG-CAD-02, e 2 informativos novos.

| Item | Status | Evidência |
|---|---|---|
| SEG-CAD-01 · baixo | **fechado** | `describeCause` leva ao log só `code`, `hint` e `message`, sem `details` nem o resto do objeto. O `logger.ts` redige o CNPJ pelo conteúdo e tem `cnpj`, `document` e `documento` em `SENSITIVE_WORDS`. Na sonda saíram `[REDACTED]`: `11.2…81`, `1122…81`, `12.ABC.345/01DE-35`, `12ABC34501DE35`, `12abc34501de35`, o CPF com e sem máscara e o `{document: …}`. O UUID ficou intacto. Em `action-support.test.ts`, um `UNEXPECTED` com `details` de CNPJ, Pix de telefone, Pix UUID e conta gera uma linha de log sem nenhum desses valores. As mensagens de `22023` montadas nas RPCs (`raise exception '%', v_msg`) são texto fixo, com o valor só no `detail`, e são erros mapeados, que não vão ao log. |
| SEG-CAD-08b · informativo | **fechado** | A coluna "Pertence a" de `/configuracoes/aliases` mostra "(sócio inativo)", "(recebedor inativo)" e "(cliente inativo)" pelo `owner_active` de `search_aliases` (`clients.ts:265` → `alias-view.ts:186` → `OwnerLink`, que serve à tabela e aos cartões). Não há buraco no caso de sócio inativo com recebedor ativo: `set_partner_active` inativa os recebedores em cascata, e `set_receiver_active` recusa a reativação sob sócio inativo (`PARTNER_INACTIVE`, `0300:479`). O handoff do item 1 (reconhecimento exigir `r.active and p.active`) continua valendo para Recebimentos. |
| SEG-CAD-02 · baixo | **fechado** | `03-ui-ux.md:1127` e `04-implementacao.md:977` usam `000.000.001-91`. `04-implementacao.md:1085` usa `pix.exemplo@example.com`. A varredura não acha o CPF nem o domínio originais em nenhum arquivo. Não há e-mail fora de `example.com` ou `exemplo.com` nos arquivos novos e alterados. A única exceção é o `admin_email` de exemplo, comentado no modelo padrão do Supabase CLI em `supabase/config.toml:113` e `:245`, que já estava na base. |

### SEG-CAD-11 · baixo · aberto (novo)

- **Evidência:** `docs/features/CAD-001-socios-e-clientes/06-qa.md` cita três documentos com DV válido fora do padrão fictício. Pelo contexto (B5-17, B6-01 e QA-CAD-08), foram digitados ou gerados nas rodadas de navegador do QA, depois do G4:
  - linha 278: CPF com máscara;
  - linhas 317 e 362: outro CPF, sem máscara;
  - linha 289: CNPJ alfanumérico, com e sem máscara e em minúsculas.

  Não estão no seed nem nos testes.
- **Cenário e impacto:** são os mesmos do SEG-CAD-02. O repositório é público, e um CPF ou CNPJ válido pode ser de uma pessoa ou empresa real; o CNPJ alfanumérico passou a ser emitido a partir de julho de 2026. Fere a RAT-D019. Não há exposição de dado do negócio.
- **Correção recomendada:** antes do commit, trocar os três pelos do padrão: `000.000.00x-xx` para CPF e `EX0…` ou `ZZ0TESTE…` para CNPJ. Pedir ao `qa` que use só a massa fictícia nas próximas rodadas.
- **Como validar:** rodar de novo a varredura (lista fora do repositório). Fora dos vetores aceitos, ela não pode achar nenhum CPF ou CNPJ válido em `06-qa.md`.
- **Quem corrige:** `qa` ou o orquestrador, porque são só documentos.

### SEG-CAD-12 · informativo · vetores sintéticos fora da lista estrita

A varredura acha outros documentos válidos fora da lista combinada (`000.000.00x-xx`, `EX0…` e os quatro vetores conhecidos). Todos são construídos à mão e não parecem ser de pessoa real:
- os `ZZ0TESTE…` e o alfanumérico `AB…70`;
- o CNPJ de raiz `99.999.999`;
- o CNPJ sequencial de exemplo em `document-mask.test.ts`;
- um CPF de forma `100.000.00x-xx`;
- CPFs `000.000.0xx-xx`.

Eles estão em `document.test.ts`, `document-mask.test.ts`, `schemas.test.ts`, `document.ts:98`, `07_cad_documents`, `09_cad_clients`, `02-modelagem-dados.md` (1057 a 1088) e `04-implementacao.md` (101, 317 e 355). Os acertos com prefixo `202` nos documentos da FND são carimbos de migration, falsos positivos. Os de `docs/legado/` são do código antigo e já estavam na base.

**Recomendação:** sem bloquear, ampliar a lista de vetores aceitos para incluir `ZZ0TESTE`, o `AB…70` e a raiz `99.999.999`, ou migrar esses vetores aos poucos, como no SEG-CAD-02.

**Atualização (27/11/2026):** a lista foi fechada na rodada 4c, no SEG-CAD-15, que registra a convenção de dado de teste e as trocas feitas antes do commit.

### SEG-CAD-13 · informativo · alcance da redação por conteúdo

O CNPJ com máscara parcial ou fora do padrão sai sem redação: com pontos e barra mas sem hífen, sem pontos mas com barra e hífen, ou com ponto no lugar da barra (testado com o vetor `11.2…81`). Também não são redigidos pelo conteúdo a chave Pix de telefone, a aleatória e a conta. O desenvolvedor registrou isso como DECISÃO PENDENTE.

**Avaliação:** o risco hoje é baixo. O banco guarda o documento já normalizado, o `details` não vai mais ao log e as mensagens de erro dos cadastros são texto fixo. Também há excesso de redação: qualquer texto de 14 letras ou números corridos que termine em dois dígitos sai como `[REDACTED]`, inclusive um id. Isso é seguro e não é achado.

**Recomendação:** reabrir só se um caminho novo de log passar a gravar `message` ou `details` com valor de cadastro. Isso inclui a importação de comprovantes, que vai ler chave Pix e conta.

### Regressão de segurança no diff da E10

Não achei regressão:
- **Autorização:** as 6 Server Actions de escrita continuam com `authorizeAdmin()` como primeira instrução, antes do `zod` (NUL, `documentType`, tetos). Os tetos do QA-CAD-07 reduzem o abuso por volume.
- **Banco:** só a `search_aliases` (0400) mudou na E10, com o mesmo `security invoker` e `search_path=''`. O `is_admin()` continua antes de montar linhas, e as concessões continuam só para `authenticated` (`revoke … from public, anon`). O `v_alike` só tem `[0-9a-z]`, então não entra curinga de `LIKE`. As migrations da FND estão sem diferença.
- **Tela:** `fail()` copia só `code`, `message`, `field`, `hint` e `details` validado. Nenhum `cause` chega à tela, e `aliases-list.tsx` e `alias-view.ts` não usam `details` nem `cause`.
- **Logs:** o único ponto de log novo dos cadastros é o de `action-support.ts`, já corrigido. Os logs de comprovantes (`proofs/http.ts`) são da FND e ficaram como estavam.
- **Repositório público:** não há segredo, JWT, ref `*.supabase.co` nem URL do Render nos arquivos de `tests/e2e` e `src`. As chaves `sb_secret_*` de `env.test.ts` são valores de teste da FND.

### Itens deixados fora de propósito

- **SEG-CAD-07** (o status 200 no "Registro não encontrado") continua informativo, sem correção de segurança.
- **SEG-CAD-10** (P-20: retenção e redação de `audit_logs`, CPF de terceiro, orientação sobre Observações) continua como recomendação ao responsável, antes de dados reais. O item 5 (logs) fica atendido pelo SEG-CAD-01.

### Riscos residuais e áreas não verificadas

- Os riscos residuais do G4 continuam valendo:
  - o Administrador chama as RPCs direto (RAT-D020);
  - os erros de Server Component são registrados pelo Next, sem redação;
  - `audit_logs` guarda os dados sem redação.
- **Não rodei:** pgTAP, e2e e navegador. Os números (1186 pgTAP e 199 e2e) são os do registro do desenvolvedor.
- **Não conferi na tela:** o aviso "(… inativo)", que fica com o `qa`.
- **Fora desta revisão:** os painéis do Render e do Supabase hospedado (SEG-E9B-08) e o histórico do git.

### Rodada 2 (26/11/2026)

**Escopo:** as correções de "E10 · correções (rodada 2)" em `04-implementacao.md` (SEG-CAD-11, N-02 e N-03). Depois da revalidação anterior, só mudaram `alias-view.ts`, `alias-view.test.ts`, `aliases-list.tsx`, `cad-aliases.e2e.test.ts`, `cad-limits.e2e.test.ts`, `04-implementacao.md` e `06-qa.md` (conferido pela data dos arquivos). Nenhuma migration, Server Action, `logger.ts` ou `action-support.ts` mudou. Revisão só de leitura, sem `db reset`, `seed:dev`, servidor nem e2e.

**Como foi conferido:**
- `npx vitest run` de `logger.test.ts`, `action-support.test.ts` e `alias-view.test.ts`: 3 arquivos, 85 de 85;
- `npm test` completo: 49 arquivos, 889 de 890. A falha foi de novo o tempo limite de 5 s em `equal-split.test.ts`, com a máquina ocupada. O arquivo não mudou e passou sozinho, 19 de 19;
- a sonda `<scratchpad>/probe.ts` contra o `logger.ts` atual deu o mesmo resultado da rodada anterior;
- a varredura `<scratchpad>/scan.mjs` foi refeita nos `git ls-files` e nos novos de `git status`. Também rodei uma varredura mais larga, que aceita máscara parcial, em `03-ui-ux.md`, `04-implementacao.md`, `05-seguranca.md` e `06-qa.md`. Os acertos de prefixo `112`, `12A`, `529` e `123` foram comparados com os quatro vetores conhecidos, e todos são esses vetores. Nenhum número foi copiado para este registro.

**Veredito do G4: LIBERADO.** BLOQUEIA RELEASE: **NÃO**. 0 críticos, 0 altos, 0 médios e 0 baixos abertos. Ficam só os informativos (SEG-CAD-07, 08 item 1, 10, 12 e 13).

| Item | Status | Evidência |
|---|---|---|
| SEG-CAD-01 · baixo | **fechado** | Sem mudança desde a rodada anterior. Os testes e a sonda confirmam a redação do CNPJ (numérico e alfanumérico, com e sem máscara, em minúsculas) e do `{document: …}`, e que o `details` com CNPJ e Pix não chega à linha de log. |
| SEG-CAD-08b · informativo | **fechado** | O N-02 mudou só a ordem: o aviso "(recebedor inativo)" fica colado ao titular, e depois vem `context` (" · sócio …"). O link cobre só o nome do dono, com `encodeURIComponent` nos ids. Tudo é texto de React, sem `dangerouslySetInnerHTML`. A página continua só para o Administrador. |
| SEG-CAD-02 · baixo | **fechado** | `000.000.001-91` em `03-ui-ux.md:1127` e `04-implementacao.md:977`, `pix.exemplo@example.com` em `04-implementacao.md:1085`. A varredura não acha o CPF nem o domínio originais. |
| SEG-CAD-11 · baixo | **fechado** | Em `06-qa.md`, as linhas 278, 289, 317 e 362 usam agora valores `000.000.00x-xx`, `000000003xx` e `EX0…`. Nenhuma das duas varreduras acha documento válido em `06-qa.md` fora do padrão e dos vetores conhecidos. Os únicos outros acertos (linhas 36, 292 e 438) são CPFs de dígitos repetidos, que o sistema recusa e que não são documento de ninguém. |

**Regressão de segurança na rodada 2:** nenhuma.
- Não mudou nada em autorização, RLS, concessões nem logs.
- `describeAliasOwner` só reorganiza campos que já vinham de `search_aliases`, sem dado novo na tela. Nenhum `details` ou `cause` chega ao cliente.
- O N-03 só mexe no tempo limite de um teste.
- Nos arquivos novos e alterados não há e-mail fora de `example.com` ou `exemplo.com`. A exceção continua sendo o modelo do Supabase CLI em `supabase/config.toml` (113 e 245), que vem da base.

**Fora de propósito (sem mudança):** SEG-CAD-07 e SEG-CAD-10, como na rodada anterior.

**Riscos residuais e áreas não verificadas:** os mesmos da rodada anterior. Não rodei pgTAP, e2e nem navegador. A ordem visual do aviso no navegador (passo 27) fica com o `qa` e o `design-ui-ux`. O handoff do SEG-CAD-08, item 1 (o reconhecimento deve exigir `r.active and p.active`), continua para Recebimentos.

### Rodada 4 (27/11/2026)

**Escopo:** "E10 · rodada 4 (limites da RAT-D026)" em `04-implementacao.md` e a revisão 4 de `02-modelagem-dados.md` (6.6). Li `cad_list_limit`, `assert_list_limit` e os trechos novos de `save_partner` e `save_receiver` (0300) e de `save_client` (0400), as concessões das duas migrations, `cadastro-errors.ts` (hint novo), `action-support.ts` (log), `limits.ts`, `identifier-keys.ts`, `schemas.ts`, o pgTAP `12` e o e2e `cad-limits`. A busca de documento em Clientes não foi mexida (QA-CAD-08 fechado por decisão). Revisão só de leitura: sem servidor, e2e, `db reset` nem pgTAP, e sem usar a porta 3001. No banco local rodei só um `SELECT` no catálogo.

**Veredito: LIBERADO.** BLOQUEIA RELEASE: **NÃO**. Nenhum achado crítico, alto, médio ou baixo. Um informativo novo (SEG-CAD-14).

| Item | Status | Evidência |
|---|---|---|
| Funções de salvamento seguem o desenho de duas camadas | **fechado** | No catálogo local, `private.save_partner`, `private.save_receiver` e `private.save_client` têm `prosecdef = true` e `search_path=""`. A concessão continua só `postgres` e `authenticated`. `private.require_admin()` é a primeira instrução das três, antes da validação e do teto (0300:100 e 333; 0400:87). Os invólucros `public.*` continuam SECURITY INVOKER, com `revoke … from public, anon` e `grant` só a `authenticated`. Não há concessão nova. |
| Funções novas não ficam expostas | **fechado** | `private.cad_list_limit` e `private.assert_list_limit` não são SECURITY DEFINER e têm `search_path=""`. Pelo catálogo, a concessão é só de `postgres`: `has_function_privilege('anon', …)` dá falso, e o pgTAP `12` confere o mesmo para `authenticated`. Elas só rodam dentro das funções DEFINER. |
| Teto conferido antes de gravar | **fechado** | `assert_list_limit` fica dentro do laço de validação, antes de qualquer trava, versão ou escrita. O pgTAP `12` tem controles: com 3 itens, o erro é `LIST_LIMIT_EXCEEDED` e não `STALE_VERSION`, `PARTNER_INACTIVE` nem `POSSIBLE_DUPLICATE`. |
| Sem contorno por chamada direta | **fechado** | A lista enviada é o estado final dos ativos. O que sai dela é inativado, e só o que está nela fica ativo. Por isso, contar os distintos da lista é contar os ativos depois da gravação. **Repetidos com outra grafia:** o teto conta pela mesma chave que a gravação usa (`normalize_alias`, `type:normalizado`), então duas grafias que viram a mesma linha contam uma vez, e as que viram duas linhas contam duas. **Tipo trocado:** o tipo fora da lista fechada é recusado (`INVALID_IDENTIFIER`), e o teto é contado pelo mesmo tipo que é gravado. **Item inativo voltando:** reativar é pôr o item de volta na lista, e ele conta. **Concorrência:** a trava do dono (`for no key update`) e a versão impedem que duas gravações somem listas. **Outros caminhos:** `grep` nas migrations acha escrita em `partner_aliases`, `receiver_identifiers` e `client_aliases` só nas três funções, e `authenticated` não tem INSERT nem UPDATE nas tabelas (I-18). |
| Sem estouro de tempo | **fechado** | O laço para no primeiro item distinto acima do teto. Os repetidos são comparados com no máximo 30 chaves, num custo linear. O pgTAP `12` roda com `statement_timeout` de 2 s: 3.000 itens distintos são recusados e 3.000 repetidos gravam. Veja o SEG-CAD-14. |
| Erro novo sem vazamento | **fechado** | O `detail` do `LIST_LIMIT_EXCEEDED` só leva `field`, `list`, `alias_type`, `identifier_type` e `max`, sem valor do cadastro. A `message` só cita a chave da lista e o teto. O erro vira `VALIDATION`: `toActionFailure` registra log só para `UNEXPECTED`, e esse log continua levando só `code`, `hint` e `message` (SEG-CAD-01). Na tela, o `detail` passa por um zod tolerante, com `list` restrito às chaves de `LIST_LIMITS`. |
| Dados fictícios e repositório público | **fechado** | Varredura de CPF e CNPJ com DV válido, e-mail, ref `*.supabase.co`, URL do Render e chave `sb_secret_` nos documentos da feature, nas duas migrations, no seed, nos pgTAP `08` e `12`, no e2e `cad-limits` e nos arquivos de `src` da rodada. Não achou dado real. O único documento fora da lista estrita é o CPF de forma `100.000.00x-xx` já citado no SEG-CAD-12, que o pgTAP `12` reaproveita. Os e-mails são de `example.com`. Não há senha, URL nem `DEV_SEED_PASSWORD` nos testes novos. O seed não mudou nesta rodada. |

#### SEG-CAD-14 · informativo · repetidos sem teto de tamanho bruto

- **Evidência:** o zod (`schemas.ts:113-114` e o `superRefine` dos identificadores) e o banco contam só os itens distintos. Uma lista com milhares de repetições do mesmo valor passa e é percorrida inteira.
- **Cenário:** só o Administrador chega às funções (`require_admin`). Ele pode mandar uma lista grande de repetidos pela Server Action, que é limitada pelo corpo padrão de 1 MB do Next, ou direto pela RPC, que é limitada pelo `statement_timeout` do papel.
- **Impacto:** no pior caso, a própria gravação dele demora ou cai por tempo, sem afetar dados nem outro usuário. O pgTAP prova 3.000 repetidos abaixo de 2 s.
- **Recomendação:** nenhuma ação agora (RAT-D020). Reabrir se as funções passarem a ser chamadas por papel não administrador ou por importação automática.
- **Como validar, se reabrir:** um teste com uma lista de repetidos do tamanho do corpo máximo, sob o `statement_timeout` do papel `authenticated`.

**Regressão de segurança na rodada 4:** nenhuma. Não mudaram RLS, políticas, concessões de tabela, `logger.ts`, `action-support.ts`, nem a busca de Clientes. As assinaturas públicas são as mesmas.

**Riscos residuais e áreas não verificadas:**
- Os riscos residuais das rodadas anteriores continuam.
- Não rodei pgTAP, e2e nem navegador, por ordem desta rodada. Os números (1272 pgTAP, 932 unitários e 200 e2e, com 1 falha por tempo em `acesso.e2e.test.ts` sem relação com os limites) são os do registro do desenvolvedor.
- A DECISÃO PENDENTE de cadastro já acima do novo teto (UI 17.7.8) é de produto, não de segurança. Hoje o banco não guarda nada publicado, e o seed está dentro do teto.
- O R-D14 (caminho de escrita futuro precisa chamar `assert_list_limit`) fica para quem criar a importação ou Recebimentos.

### Rodada 4c (varredura pré-commit, 27/11/2026)

**Escopo:** todos os arquivos que vão para o primeiro commit da CAD-001 (novos e alterados da branch local `cad-001/socios-clientes`), antes de subirem ao repositório público. A varredura (`<scratchpad>/scan.js`, `dvcheck.js`, `docs-scan.js` e `docs-check.js`) confere o DV de CPF e CNPJ, com e sem máscara, e procura telefone, e-mail, segredo, ref do Supabase e URL de serviço. A saída traz só arquivo e linha; nenhum valor foi copiado para este registro. Nesta rodada, a `seguranca` mexeu só neste documento e na própria memória. As trocas no código e nos testes ficaram com o `desenvolvedor`, e o `06-qa.md` fica com o `qa`.

**Resultado:**
- nenhum segredo (`sb_secret_`, `sb_publishable_`, JWT, senha), nenhuma ref `*.supabase.co`, nenhuma URL do Render e nenhum e-mail real;
- achados baixos, todos de dado de teste: CPF e CNPJ com DV válido fora dos padrões fictícios, telefones de teste com DDD real e e-mails num domínio que não é reservado para exemplo. Não são dados do negócio, mas o repositório é público e um número com DV válido pode ser de uma pessoa ou empresa real (RAT-D019). Os valores novos ainda não estavam no histórico público: trocá-los antes do commit os mantém fora dele.

**Veredito:** BLOQUEIA RELEASE: **NÃO**, desde que as trocas abaixo estejam no commit. Um informativo novo (SEG-CAD-15), já fechado.

#### SEG-CAD-15 · informativo · fechado · convenção de dado de teste

É uma decisão técnica do orquestrador sobre dado de teste, registrada aqui pela `seguranca`. **Não é regra de negócio** e não muda nenhuma RAT; fica informada ao responsável. Ela fecha a recomendação do SEG-CAD-12.

**Convenção (vale para seeds, testes, exemplos e documentos):**

| Dado | Usar | Observação |
|---|---|---|
| CPF | `000.000.00x-xx` e os vetores `100.000.00x-xx` já existentes | Livres e conferidos: `000.000.004-34`, `000.000.005-15`, `000.000.007-87`, `000.000.008-68` e `000.000.009-49`. |
| CPF do caso em que o 2º DV dá resto 10 | um único vetor da faixa `000.000.0xx-xx`, em `src/domain/documents/document.test.ts:121` | Exceção registrada: nenhum CPF `000.000.00x-xx` exercita esse caso. Não criar outros. |
| CNPJ só de números | raiz sintética `99.999.999` | Filiais conferidas: `/0001-91` (já usada), `/0002-72` e `/0003-53`. |
| CNPJ alfanumérico | prefixo `EX0` ou `ZZ0TESTE`, e o exemplo público `12.ABC.345/01DE-35` | Livre e conferido: `EX0A1B2C000119`. |
| Teste que só aplica máscara (não confere DV) | número com os dois últimos dígitos trocados por `00` | O DV fica inválido de propósito. |
| Telefone (chave Pix de celular) | DDD `23`, que não existe no Brasil, com o resto do número | — |
| E-mail | `@example.com` | Domínio reservado para exemplo. |

Os valores novos de CPF e CNPJ foram conferidos com `isValidCpf` e `isValidCnpj` do próprio projeto (`<scratchpad>/seg15-dv.mts`, com `tsx`): todos têm DV válido.

**O que foi trocado (valores antigos mascarados):**

| Antigo | Situação no histórico | Troca |
|---|---|---|
| CPF `529.…25` | novo | `000.000.005-15`, com e sem máscara, mantendo a forma; outros CPFs livres onde o mesmo teste precisa de dois distintos |
| CPF `123.…09` | já estava em `src/lib/logger.test.ts` | Nos testes só de máscara, os dois últimos dígitos viram `00`. No JSDoc de `document-mask.ts` e de `client-aliases.ts`, em `client-form.test.ts`, no pgTAP `09` e no `logger.test.ts`: `000.000.004-34` (no logger, o teste continua provando a redação do CPF pelo conteúdo) |
| CNPJ `11.2…81` | já estava no JSDoc de `src/lib/format.ts` | `99.999.999/0002-72` onde o teste precisa de CNPJ só de números (a filial `0001` já pertence a outro cliente no pgTAP `09` e daria `DOCUMENT_TAKEN`), `99.999.999/0003-53` quando precisa de um segundo, ou um `EX0…`/`ZZ0TESTE…` já existente onde não precisa ser numérico |
| CNPJ `12.3…95` (teste só de máscara) | novo | dois últimos dígitos trocados por `00`, na entrada e no esperado |
| CNPJ alfanumérico `AB…70` | novo | `EX0A1B2C000119` |
| Telefones de teste com DDD `11` (5 valores) | novos | DDD `23`, na entrada e no valor normalizado |
| E-mail `u…@` em domínio que não é de exemplo | já estava em `authorization.test.ts` e `logger.test.ts` | domínio `example.com`, na entrada e no esperado |
| CNPJ `99.9…91` | novo | fica: a raiz `99.999.999` é a convenção |
| CPF `0000…30` | novo | fica: é a exceção do 2º DV com resto 10 |

Neste documento, os números por extenso dos achados (SEG-CAD-01, 02, 12 e 13 e a tabela da revalidação após a E10) foram trocados por forma mascarada, sem mudar o sentido dos registros.

**Risco residual:** os três valores que já estavam no histórico (`123.…09`, `11.2…81` e o e-mail `u…@`) saem da versão atual, mas continuam nos commits anteriores. Reescrever o histórico de um repositório público é decisão do responsável; pela natureza do dado (vetores de teste conhecidos, sem nome nem vínculo com o negócio), a `seguranca` não recomenda fazê-lo.

**Como validar:** rodar de novo a varredura nos arquivos do commit. Fora dos padrões desta convenção, ela não pode achar CPF ou CNPJ com DV válido, telefone com DDD real nem e-mail fora de `example.com` (a exceção do modelo do Supabase CLI em `supabase/config.toml` continua, como no SEG-CAD-06). O pgTAP desta rodada (`07`, `08` e `09`) roda depois, quando o banco local estiver livre, agendado pelo orquestrador.

**Áreas não verificadas nesta rodada:** não rodei pgTAP, e2e, navegador nem `npm test`, por ordem da rodada (o banco local e a porta 3001 estavam com o responsável). A conferência das trocas no código fica com a nova varredura e com os testes do `desenvolvedor` e do `qa`.
