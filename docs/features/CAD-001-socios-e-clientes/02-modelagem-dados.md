# CAD-001 — Sócios, Recebedores e Clientes · Modelagem de dados

| Campo | Valor |
|---|---|
| Feature | CAD-001 — Sócios, Recebedores e Clientes |
| Agente | `modelagem-dados` |
| Data | 25/11/2026 (revisão 3: 26/11/2026; revisão 4: 27/11/2026) |
| Revisão | 4 |
| Gate | G1 (ver seção 18) |
| Entrada | `01-plano.md` (revisão 2, com as respostas finais da revisão 3 repassadas pelo orquestrador em 25/11/2026); `03-ui-ux.md` (perguntas U-C01 a U-C04 e U-C13, respondidas na seção 6.0); Brain `00`, `02`, `11` (RAT-D023, RAT-D024, RAT-D025); `docs/features/FND-001-fundacao/02-modelagem-dados.md` (2.4, 2.5, 3.2, 3.4, 3.6, 4, 5, 12.5, 12.6, 13); migrations `20261023000100` a `20261023000500`; `supabase/tests/database/01` a `06`; `supabase/seed.sql`; `src/lib/errors.ts`. **Revisão 3:** `04-implementacao.md` (D-IMPL-xx, D-E4-xx, D-E5b-xx, D-E6a-xx; P-IMPL-06, P-E4-03, P-E5b-02) conferido contra as migrations `20261125000100` a `20261125000400`, que prevalecem em caso de diferença. **Revisão 4:** Brain `11` (RAT-D026, limites de itens por cadastro, 27/11/2026); `src/domain/cadastros/limits.ts`, `schemas.ts`, `client-aliases.ts`, `receiver-identifiers.ts`; `src/lib/cadastro-errors.ts`; pgTAP `07` a `11`; `supabase/seed.sql` |
| Saída | Este documento. **Não** contém migrations: o `desenvolvedor` as escreve a partir das seções 2, 6, 7 e 10 |

## Como ler as classificações

Mesmo critério da modelagem da FND-001:

- **[OFICIAL]**: está em `11-Decisoes.md` (RAT-Dxxx) ou em documento ativo do Brain. A fonte é citada.
- **[PROPOSTA]**: escolha técnica desta modelagem ou do plano. Só vira oficial com aprovação.
- **[PENDENTE]**: depende do responsável (seção 16).

As respostas do G0 já estão no Brain como RAT-D023, RAT-D024 e RAT-D025. Com isso, **PEND-1 e PEND-2 do plano estão respondidas**:

- PEND-1 → RAT-D023: nome do titular obrigatório; variações do nome, chave Pix e banco/agência/conta opcionais; **sem** CPF/CNPJ do titular.
- PEND-2 → RAT-D025: os recebedores ativos são inativados junto com o sócio, com confirmação.
- R-S04b (proposta do plano) virou oficial pela RAT-D025: o sócio indicado em **qualquer** cliente, ativo ou inativo, não é inativado.

## Sumário

1. Diagnóstico do modelo atual
2. Modelo proposto (tabelas, colunas, tipos)
3. Documentos: normalização e onde validar
4. Invariantes
5. Índices
6. Funções de escrita (RPCs)
7. RLS e concessões
8. Auditoria
9. Concorrência e ordem de travas
10. Plano de migrations
11. Consultas críticas
12. Plano de testes pgTAP
13. Seed local
14. Riscos de dados
15. Divergências
16. Pendências
17. Handoff ao desenvolvedor
18. Gate G1

---

## 1. Diagnóstico do modelo atual

### 1.1 O que existe (FND)

| Objeto | Estado | Efeito na CAD-001 |
|---|---|---|
| `public.partners` (`0300`) | `id`, `name` (≤ 200), `normalized_name` gerada por `private.normalize_alias` e **única**, `active`, `created_at`, `updated_at`; triggers `set_updated_at`, `audit_row_change('partner')`, `prevent_mutation` no DELETE, `prevent_truncate`; RLS só com `partners_select_business` | Não ganha coluna ([OFICIAL] RAT-D025: sem documento). Ganha triggers de guarda (seção 4) e RPCs de escrita |
| `private.normalize_alias(text)` | `IMMUTABLE`; minúsculas, sem acento, sem pontuação, espaços colapsados; `EXECUTE` para `authenticated` e `service_role` | Reaproveitada para nomes, apelidos e variações de nome |
| `private.to_money(text)` | Converte texto para `numeric(14,2)` recusando mais de 2 casas e valor negativo | Usada por `save_client` para converter a mensalidade recebida como texto decimal (2.8) |
| Auditoria (`0200`) | `audit_logs` append-only; `audit_row_change(entity, redigidas)` exige coluna `id`; `audit_event`; `set_audit_context(reason, source, correlation, label)` com motivo opcional | Toda tabela nova usa o trigger; as RPCs chamam `set_audit_context` |
| Papéis (`0300`) | `private.is_admin()`, `can_operate()`, `can_read_business()` (exclui `PARTNER`), `current_partner_id()` | Base de RLS e da checagem de papel |
| Privilégios (`0500`) | Tudo revogado de `anon`/`authenticated`; default privileges revogam tabelas, sequências, funções e `TRUNCATE` | Cada concessão nova é explícita |
| Testes (`01_catalog`) | Listas fechadas: funções de `public` executáveis por `authenticated` (só as duas de comprovante); funções de `private` executáveis por `authenticated`; **nenhuma função `SECURITY DEFINER` em `public`**; 3 tabelas auditadas; nenhuma tabela com escrita por `authenticated` além de `proof_files` | As listas precisam ser **estendidas** pela CAD-001 (12.1). A regra "nenhum `SECURITY DEFINER` em `public`" é mantida pelo desenho da seção 6 |
| `src/lib/errors.ts` | Mapeia só o SQLSTATE (23505, 23514, 42501, 22023, P0001, P0002) | Precisa ler também o `hint` para as mensagens específicas (6.3) |

### 1.2 Fragilidades a evitar

| ID | Fragilidade | Tratamento |
|---|---|---|
| F-01 | Regras que dependem de duas tabelas (cliente ativo × indicações; sócio × indicações; sócio × recebedores) quebram sob concorrência se forem checadas só na aplicação ou só antes da escrita | Triggers com trava de linha e trigger de restrição diferido (seção 9) |
| F-02 | Unicidade entre tabelas diferentes (documento do cliente × apelido-documento de outro cliente; nome do sócio × apelido × variação de nome de recebedor) não cabe em índice único | Trava consultiva por valor normalizado + checagem no trigger (4.3) |
| F-03 | Concorrência otimista por `updated_at` falha se a aplicação converter o valor para `Date` do JavaScript (perde os microssegundos) | Contrato: o token volta como texto, sem conversão (6.2, 17) |
| F-04 | Um `CHECK` em `numeric(14,2)` arredonda silenciosamente casas extras na entrada | A mensalidade chega à função como **texto decimal** e é convertida por `private.to_money`, que recusa casas extras em vez de arredondar (2.8) |
| F-05 | O catálogo da FND fecha listas de funções e tabelas auditadas: uma feature que não atualiza o `01_catalog` quebra a suíte | Atualização explícita das listas (12.1) |
| F-06 | Chave Pix do tipo CPF/CNPJ confundida com "documento do titular", que a RAT-D023 exclui | [OFICIAL] RAT-D023 (revisada em 25/11/2026): a chave Pix pode ser CPF ou CNPJ e fica guardada **só como chave Pix**, sem coluna de documento no recebedor (3.3, I-17) |
| F-07 | Formulário com um só "Salvar" (UI, U-C01) feito com várias chamadas pode gravar pela metade | Uma função de salvamento por cadastro, tudo ou nada (6.0, 6.4) |

---

## 2. Modelo proposto

### 2.1 Diagrama

```text
partners 1 ──── N partner_aliases                    (apelidos do sócio)
partners 1 ──── N receivers 1 ──── N receiver_identifiers
         (partner_id NOT NULL e imutável: RAT-D023)    (NAME_VARIANT | PIX_KEY | BANK_ACCOUNT)

clients 1 ──── N client_aliases                      (NAME | DOCUMENT)
clients N ──── N partners  via client_partners       (só a associação; n = indicações ativas; sem percentual)

profiles N ── 0..1 partners                          (FND, não muda)
audit_logs: referência lógica (entity, entity_id)    (FND, não muda)
```

Cardinalidades:

| Relação | Cardinalidade | Classificação |
|---|---|---|
| sócio → recebedores | 1:N (0..N) | [OFICIAL] RAT-D023 |
| recebedor → sócio | N:1, **obrigatória e imutável** | [OFICIAL] RAT-D023 (obrigatória) + [PROPOSTA] R-R02 (imutável) |
| recebedor → identificadores | 1:N (0..N) | [OFICIAL] RAT-D023 (dados opcionais) + [PROPOSTA] (tipados) |
| identificador ativo → recebedor | N:1; um valor ativo de um tipo pertence a **um** recebedor | [PROPOSTA] (I-35 da FND) |
| sócio → apelidos | 1:N | [OFICIAL] RAT-D025 ("só nome e apelidos") |
| cliente ↔ sócio | N:N via `client_partners`, uma linha por par | [OFICIAL] RAT-D005, RAT-D015 |
| cliente ativo → indicações ativas | 1:**1..N** | [OFICIAL] RAT-D025 |
| cliente inativo → indicações ativas | 1:0..N | [PROPOSTA] (plano R-C10) |
| cliente → apelidos | 1:N | [OFICIAL] Brain 02 (aliases) |

### 2.2 Convenções (herdadas da FND, 12.6)

- PK `id uuid default gen_random_uuid()` em toda tabela; associações com chave substituta + `unique` no par.
- `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()` + trigger `private.set_updated_at()`.
- Trigger `private.audit_row_change('<entidade>')` (`after insert or update or delete`).
- Bloqueio de exclusão física: `before delete ... private.prevent_mutation()` + `before truncate ... private.prevent_truncate()`.
- `enable row level security` em todas.
- Nenhum `organization_id` ([OFICIAL] RAT-D010). Nenhuma coluna de percentual ([OFICIAL] RAT-D015).
- Textos livres: `btrim` na RPC; opcional em branco vira `NULL`.

### 2.3 Tipos novos (enums)

| Tipo | Valores | Uso | Classificação |
|---|---|---|---|
| `public.receiver_identifier_type` | `NAME_VARIANT`, `PIX_KEY`, `BANK_ACCOUNT` | Tipo do identificador do recebedor | [OFICIAL] RAT-D023 (variações do nome, chave Pix, banco/agência/conta) + [PROPOSTA] (nomes) |
| `public.client_alias_type` | `NAME`, `DOCUMENT` | Tipo do apelido do cliente | [PROPOSTA] (responde R-A06 e U-C03: `TRADE_NAME` e `OTHER` do modelo conceitual não mudam o reconhecimento, que compara texto normalizado; ficam fora). Na tela, "CPF" e "CNPJ" são `DOCUMENT`; o tipo do documento sai do tamanho |

**Sem subtipo de chave Pix** ([PROPOSTA], segue a UI 7.1, item 5: "sem seletor de tipo de chave"). A chave é guardada como aparece no comprovante e normalizada de forma independente do tipo (3.3). O modelo conceitual previa só o tipo; esta modelagem chegou a considerar um enum `pix_key_type`, descartado para não pedir na tela o que o comprovante já mostra.

O apelido do sócio **não tem tipo**: é sempre uma variação de nome. Um apelido do tipo documento guardaria o CPF/CNPJ do sócio, o que a RAT-D025 exclui ([OFICIAL] "só nome e apelidos, para guardar menos dado pessoal").

O tipo do documento do cliente (`CPF`/`CNPJ`) **não** é enum: é coluna gerada `text` (2.7), porque a conversão de enum para texto não é `IMMUTABLE` e não pode entrar em coluna gerada.

### 2.4 `public.partners` (existente, alterada só por triggers)

Nenhuma coluna nova, nenhuma coluna alterada ([OFICIAL] RAT-D025: sem documento). A migration da CAD-001 **não** usa `alter table ... add/alter column` em `partners`. Acrescenta:

| Objeto | Função | Seção |
|---|---|---|
| token de concorrência | `updated_at` (existente) passa a valer para o sócio **e** para os apelidos dele (6.2) | 6 |
| trigger `partners_guard` (`before insert or update`) | `id`/`created_at` imutáveis; espaço de nomes de sócio (I-11); inativação só sem indicação ativa e sem recebedor ativo (I-02, I-05) | 4 |
| índice | nenhum novo (`partners_normalized_name_key` já existe) | 5 |
| política de escrita | **nenhuma**: a escrita é feita por função `SECURITY DEFINER` (seção 6). O comentário da `0300` ("a feature Sócios acrescenta as políticas de escrita") fica superado por esse desenho | 7 |

### 2.5 `public.partner_aliases` (nova)

| Coluna | Tipo | Regra | Classificação |
|---|---|---|---|
| `id` | `uuid` PK | | [PROPOSTA] |
| `partner_id` | `uuid not null` FK `partners(id) on delete restrict` | imutável | [OFICIAL] Brain 02 (aliases da Parte) |
| `alias` | `text not null` | como digitado (após `btrim`); 1 a 200 caracteres | [PROPOSTA] |
| `normalized_value` | `text not null generated always as (private.normalize_alias(alias)) stored` | `<> ''` | [PROPOSTA] |
| `active` | `boolean not null default true` | desativar, nunca excluir | [PROPOSTA] R-A05 |
| `created_at`, `updated_at` | `timestamptz` | | |

Constraints: `partner_aliases_alias_length check (char_length(alias) between 1 and 200)`, `partner_aliases_not_blank check (normalized_value <> '')`.

### 2.6 `public.receivers` (nova)

| Coluna | Tipo | Regra | Classificação |
|---|---|---|---|
| `id` | `uuid` PK | | |
| `partner_id` | `uuid not null` FK `partners(id) on delete restrict` | **obrigatório**; **imutável** depois de criado | [OFICIAL] RAT-D023 + [PROPOSTA] R-R02 |
| `holder_name` | `text not null` | nome do titular como aparece no comprovante; 1 a 200 | [OFICIAL] RAT-D023 (obrigatório) |
| `normalized_holder_name` | `text not null generated always as (private.normalize_alias(holder_name)) stored` | `<> ''`; **não** é único (2.10) | [PROPOSTA] |
| `active` | `boolean not null default true` | ativo ⇒ sócio ativo (I-05) | [OFICIAL] RAT-D025 + [PROPOSTA] R-R07 |
| `created_at`, `updated_at` | `timestamptz` | `updated_at` é o token de concorrência do recebedor **e** dos seus identificadores (6.2) | |

Constraints: `receivers_holder_name_length check (char_length(holder_name) between 1 and 200)`, `receivers_holder_name_not_blank check (normalized_holder_name <> '')`.

Não há coluna de documento ([OFICIAL] RAT-D023: "O CPF ou CNPJ do titular não é guardado"); o campo `document` do modelo conceitual da FND (2.4) **sai**. Também **não há observação** ([OFICIAL] RAT-D023 lista só titular, variações, chave Pix e conta; a R-R03 do plano previa uma observação curta, que a UI também descartou em U-C15).

### 2.7 `public.receiver_identifiers` (nova)

| Coluna | Tipo | Regra | Classificação |
|---|---|---|---|
| `id` | `uuid` PK | | |
| `receiver_id` | `uuid not null` FK `receivers(id) on delete restrict` | imutável | [PROPOSTA] |
| `identifier_type` | `public.receiver_identifier_type not null` | imutável | [OFICIAL] RAT-D023 + [PROPOSTA] |
| `value` | `text` | `NAME_VARIANT`: como digitado, 1 a 200. `PIX_KEY`: como digitado, 1 a 100 (UI U-C13). Nulo em `BANK_ACCOUNT` | [PROPOSTA] |
| `bank_name` | `text` | `BANK_ACCOUNT`: instituição como aparece no comprovante (nome ou código), 1 a 100; nulo nos outros | [OFICIAL] RAT-D023 (banco) |
| `branch` | `text` | `BANK_ACCOUNT`: agência como digitada, 1 a 20; depois de normalizada, 1 a 6 caracteres `[0-9X]`; nulo nos outros | [OFICIAL] RAT-D023 (agência) + [PROPOSTA] (formato) |
| `account_number` | `text` | `BANK_ACCOUNT`: conta como digitada, 1 a 30; depois de normalizada, 1 a 20 caracteres `[0-9X]`; nulo nos outros | [OFICIAL] RAT-D023 (conta) + [PROPOSTA] (formato) |
| `normalized_value` | `text not null` | calculado pelo trigger `receiver_identifiers_prepare` (tabela 3.3); `<> ''`; o que o cliente envia é ignorado | [PROPOSTA] |
| `active` | `boolean not null default true` | | [PROPOSTA] |
| `created_at`, `updated_at` | `timestamptz` | | |

CHECK `receiver_identifiers_shape`:

```sql
check (
  (identifier_type in ('NAME_VARIANT', 'PIX_KEY') and value is not null
     and bank_name is null and branch is null and account_number is null)
  or (identifier_type = 'BANK_ACCOUNT' and value is null
     and bank_name is not null and branch is not null and account_number is not null)
)
```

Cardinalidade (responde U-C04): um recebedor pode ter **várias** variações de nome, **várias** chaves Pix e **várias** contas bancárias, cada uma uma linha tipada ([PROPOSTA], recomendação da UI aceita; [OFICIAL] RAT-D023 não limita a quantidade). O que é único é o **valor ativo** de cada tipo entre todos os recebedores (I-12).

Por que `normalized_value` é calculado por trigger e não por coluna gerada: a regra depende do tipo (enum), e a conversão de enum para texto não é `IMMUTABLE`; o trigger também devolve erro de validação com `hint` próprio, o que a coluna gerada não faz bem. A normalização fica numa função pura, `private.normalize_receiver_identifier(tipo, value, bank_name, branch, account_number)`, usada pelo trigger e pela função de salvamento (6.4). Como o identificador é **imutável** (só `active` muda, I-10), o valor calculado na inclusão nunca fica defasado.

Dados que **não** entram (R-R05, [OFICIAL] RAT-D023 e G0): CPF/CNPJ do titular, tipo de conta, saldo, senha, token, cartão, extrato.

### 2.8 `public.clients` (nova)

| Coluna | Tipo | Regra | Classificação |
|---|---|---|---|
| `id` | `uuid` PK | | |
| `legal_name` | `text not null` | nome (pessoa física) ou razão social; 1 a 200 | [OFICIAL] Brain 02 (nome/razão social) |
| `normalized_name` | `text not null generated always as (private.normalize_alias(legal_name)) stored` | `<> ''`; **não** é único (R-C06) | [PROPOSTA] |
| `trade_name` | `text` | nome fantasia; opcional; 1 a 200 quando presente | [PROPOSTA] (06, rascunho) |
| `normalized_trade_name` | `text generated always as (nullif(private.normalize_alias(trade_name), '')) stored` | | [PROPOSTA] |
| `document` | `text` | **opcional**; quando presente, forma canônica (seção 3) e DV válido; **único** entre todos os clientes, ativos e inativos | [OFICIAL] RAT-D024 |
| `document_type` | `text generated always as (case when document is null then null when char_length(document) = 11 then 'CPF' else 'CNPJ' end) stored` | só leitura; deduzido do documento | [OFICIAL] RAT-D024 (CPF ou CNPJ) + [PROPOSTA] R-C02b (deduzido) |
| `default_monthly_value` | `numeric(14,2) not null` | **> 0**; teto = o do próprio tipo (R$ 999.999.999.999,99) | [OFICIAL] RAT-D025 (obrigatória, > 0, editável); Brain 02 (valor padrão da mensalidade) + [PROPOSTA] aprovada na FND (dinheiro em `numeric(14,2)`, 2.1 da modelagem FND) |
| `notes` | `text` | opcional; 1 a 2000 quando presente | [OFICIAL] Brain 02 (observações) |
| `active` | `boolean not null default true` | ativo ⇒ ao menos 1 indicação ativa (I-01) | [OFICIAL] Brain 02 (status); RAT-D025 |
| `created_at`, `updated_at` | `timestamptz` | `updated_at` é o token de concorrência do cliente, das indicações **e** dos apelidos (6.2) | |

Constraints:

```sql
constraint clients_legal_name_length   check (char_length(legal_name) between 1 and 200),
constraint clients_legal_name_not_blank check (normalized_name <> ''),
constraint clients_trade_name_length   check (trade_name is null or char_length(trade_name) between 1 and 200),
constraint clients_document_canonical  check (document is null or document = private.normalize_document(document)),
constraint clients_document_valid      check (document is null or private.is_valid_document(document)),
constraint clients_monthly_value_positive check (default_monthly_value > 0),
constraint clients_notes_length        check (notes is null or char_length(notes) between 1 and 2000)
```

**Documento guardado só na forma canônica** ([PROPOSTA], ajusta o plano 4.2, que previa "como digitado" + coluna normalizada gerada): uma coluna só, sem divergência entre o digitado e o normalizado. A máscara de exibição (`000.000.000-00`, `AA.AAA.AAA/AAAA-00`) é feita pela aplicação a partir de `document_type`. Ver D-03.

**Mensalidade em `numeric(14,2)`, convenção da FND** (nunca float):

- **Banco:** coluna `numeric(14,2)` com `> 0`. O teto é o do tipo; não há teto de negócio ([PROPOSTA]; PEND-M2 encerrada pelo orquestrador com o limite técnico).
- **Fronteira de entrada:** `save_client` recebe `p_default_monthly_value text` em **texto decimal com ponto** (`"1234.56"`) e converte com `private.to_money(text)`, que recusa formato inválido, valor negativo e mais de 2 casas (nunca arredonda). Antes da conversão, a função recusa valor acima de `999999999999.99` (senão o cast estouraria com `22003`). Zero passa em `to_money` e é recusado pela função. Todos esses casos voltam como `22023` com `hint = 'INVALID_AMOUNT'` (6.3).
- **Fronteira de saída:** a aplicação lê o valor como **texto** (`select=…,default_monthly_value::text` no PostgREST; `search_clients` devolve `text`), porque o PostgREST serializa `numeric` como número JSON e o JavaScript o leria como float.
- **Aplicação:** o texto digitado ("1.234,56") é analisado sem float; se precisar fazer conta, usa centavos inteiros e devolve ao banco o texto decimal (`"1234.56"`). A CA-10 do plano ("grava exatamente 1234.56") vale sem mudança.

Sem `distribution_mode`, `custom_percentage`, `default_percentage`, `organization_id` ([OFICIAL] RAT-D015, RAT-D010).

### 2.9 `public.client_aliases` (nova)

| Coluna | Tipo | Regra | Classificação |
|---|---|---|---|
| `id` | `uuid` PK | | |
| `client_id` | `uuid not null` FK `clients(id) on delete restrict` | imutável | [OFICIAL] Brain 02 (aliases do cliente) |
| `alias_type` | `public.client_alias_type not null` | imutável | [PROPOSTA] R-A06 |
| `alias` | `text not null` | como digitado; 1 a 200 | [PROPOSTA] |
| `normalized_value` | `text not null` | trigger `client_aliases_prepare`, pela função pura `private.normalize_client_alias(tipo, alias)`: `NAME` → `normalize_alias`; `DOCUMENT` → `normalize_document` + DV válido | [PROPOSTA] R-A01 |
| `active` | `boolean not null default true` | | [PROPOSTA] R-A05 |
| `created_at`, `updated_at` | `timestamptz` | | |

O apelido `DOCUMENT` serve ao caso da R-A08 ([PROPOSTA]: quem paga em nome do cliente com documento próprio). É dado pessoal quando for CPF (P-20).

### 2.10 `public.client_partners` (nova)

| Coluna | Tipo | Regra | Classificação |
|---|---|---|---|
| `id` | `uuid` PK | chave substituta (regra da auditoria) | [PROPOSTA] |
| `client_id` | `uuid not null` FK `clients(id) on delete restrict` | imutável | [OFICIAL] RAT-D005 |
| `partner_id` | `uuid not null` FK `partners(id) on delete restrict` | imutável | [OFICIAL] RAT-D005 |
| `active` | `boolean not null default true` | indicação vigente; retirar = `false`; reindicar = reativar a mesma linha | [PROPOSTA] R-C09 |
| `created_at`, `updated_at` | `timestamptz` | | |

`constraint client_partners_pair_key unique (client_id, partner_id)`.

**Sem coluna de percentual, peso ou vigência** ([OFICIAL] RAT-D015; RAT-D025: "vale a partir do momento da alteração", sem data de vigência). `n` = número de linhas ativas do cliente. O histórico das trocas fica em `audit_logs` (ROW_CHANGE por linha + EVENT `PARTNERS_CHANGE`, seção 8); o efeito sobre recebimentos é preservado pelo snapshot em `receipt_allocations` ([OFICIAL] RAT-D006), na feature Rateio.

### 2.11 O que fica de fora, de propósito

| Item | Motivo |
|---|---|
| Unicidade de `receivers.normalized_holder_name` | Um sócio pode ter duas contas com o mesmo titular (bancos diferentes). Entre sócios diferentes, o mesmo titular é improvável; se ocorrer, o reconhecimento trata como ambíguo e manda para revisão humana ([OFICIAL] RAT-D008). [PROPOSTA] |
| Unicidade de `clients.normalized_name` | Nomes repetem (filiais, homônimos): R-C06. Só aviso (R-C15). [PROPOSTA] |
| Tabela de bancos (código COMPE/ISPB) | O comprovante mostra o nome da instituição; uma tabela de bancos é escopo novo. [PROPOSTA] |
| Coluna `version` | O token de concorrência é `updated_at` (plano 4.3). [PROPOSTA] |

---

## 3. Documentos: normalização e onde validar

### 3.1 Formas aceitas

| Documento | Forma canônica | Regra | Classificação |
|---|---|---|---|
| CPF | 11 dígitos `^[0-9]{11}$` | DV pelo módulo 11 (pesos 10..2 e 11..2); recusa os 11 dígitos iguais | [OFICIAL] RAT-D024 (CPF) + [PROPOSTA] (recusa de repetidos) |
| CNPJ numérico | 14 dígitos | Mesmo cálculo do alfanumérico (cada dígito vale ele mesmo) | [OFICIAL] RAT-D024 |
| CNPJ alfanumérico | `^[0-9A-Z]{12}[0-9]{2}$`: 12 posições alfanuméricas (raiz + ordem) e 2 DVs numéricos | Valor de cada caractere = código ASCII − 48 (`0`..`9` → 0..9; `A` → 17 … `Z` → 42); DV1 com pesos 5,4,3,2,9,8,7,6,5,4,3,2 sobre as 12 posições; DV2 com pesos 6,5,4,3,2,9,8,7,6,5,4,3,2 sobre as 13; resto < 2 → 0, senão 11 − resto; recusa os 14 caracteres iguais | [OFICIAL] RAT-D024 (alfanumérico, DV validado) + [PROPOSTA] (recusa de repetidos) |

Exemplo de conferência (nota técnica da Receita sobre o CNPJ alfanumérico): `12.ABC.345/01DE-35` → canônico `12ABC34501DE35`. O cálculo foi refeito nesta modelagem: soma do DV1 = 459, resto 8, DV1 = 3; soma do DV2 = 424, resto 6, DV2 = 5. O `desenvolvedor` deve **conferir o exemplo no texto oficial** antes de fixá-lo no teste (CA-04).

A forma canônica é: sem espaços, pontos, barras e hífens, em maiúsculas. Qualquer outro caractere (letra acentuada, vírgula) torna o documento inválido, em vez de ser descartado em silêncio.

### 3.2 Funções no banco (fonte única)

Todas em `private`, `language sql` ou `plpgsql`, `IMMUTABLE`, `PARALLEL SAFE`, `set search_path = ''`, `revoke execute ... from public` e `grant execute ... to authenticated, service_role` (são usadas em `CHECK`, em trigger e nas funções de leitura `SECURITY INVOKER`; o `EXECUTE` é verificado para quem escreve ou consulta).

```sql
-- '12.ABC.345/01de-35' -> '12ABC34501DE35'; NULL ou só formatação -> NULL
create function private.normalize_document(p_value text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select nullif(pg_catalog.upper(
           pg_catalog.regexp_replace(coalesce(p_value, ''), '[[:space:]./-]', '', 'g')), '');
$$;

create function private.is_valid_cpf(p_doc text) returns boolean
language plpgsql immutable parallel safe set search_path = '' as $$
declare v_sum int; v_dv int; i int;
begin
  if p_doc is null or p_doc !~ '^[0-9]{11}$'
     or p_doc = pg_catalog.repeat(pg_catalog.substr(p_doc, 1, 1), 11) then
    return false;
  end if;
  v_sum := 0;
  for i in 1..9 loop v_sum := v_sum + pg_catalog.substr(p_doc, i, 1)::int * (11 - i); end loop;
  v_dv := (v_sum * 10) % 11; if v_dv = 10 then v_dv := 0; end if;
  if v_dv <> pg_catalog.substr(p_doc, 10, 1)::int then return false; end if;
  v_sum := 0;
  for i in 1..10 loop v_sum := v_sum + pg_catalog.substr(p_doc, i, 1)::int * (12 - i); end loop;
  v_dv := (v_sum * 10) % 11; if v_dv = 10 then v_dv := 0; end if;
  return v_dv = pg_catalog.substr(p_doc, 11, 1)::int;
end;
$$;

-- Numérico e alfanumérico (o cálculo novo também valida o antigo).
create function private.is_valid_cnpj(p_doc text) returns boolean
language plpgsql immutable parallel safe set search_path = '' as $$
declare
  w1 constant int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  w2 constant int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  v_sum int; v_dv int; i int;
begin
  if p_doc is null or p_doc !~ '^[0-9A-Z]{12}[0-9]{2}$'
     or p_doc = pg_catalog.repeat(pg_catalog.substr(p_doc, 1, 1), 14) then
    return false;
  end if;
  v_sum := 0;
  for i in 1..12 loop v_sum := v_sum + (pg_catalog.ascii(pg_catalog.substr(p_doc, i, 1)) - 48) * w1[i]; end loop;
  v_dv := case when v_sum % 11 < 2 then 0 else 11 - v_sum % 11 end;
  if v_dv <> pg_catalog.substr(p_doc, 13, 1)::int then return false; end if;
  v_sum := 0;
  for i in 1..13 loop v_sum := v_sum + (pg_catalog.ascii(pg_catalog.substr(p_doc, i, 1)) - 48) * w2[i]; end loop;
  v_dv := case when v_sum % 11 < 2 then 0 else 11 - v_sum % 11 end;
  return v_dv = pg_catalog.substr(p_doc, 14, 1)::int;
end;
$$;

-- Espera o documento já canônico.
create function private.is_valid_document(p_doc text) returns boolean
language sql immutable parallel safe set search_path = '' as $$
  select case pg_catalog.char_length(p_doc)
           when 11 then private.is_valid_cpf(p_doc)
           when 14 then private.is_valid_cnpj(p_doc)
           else false end;
$$;
```

Os corpos acima são a especificação de comportamento. O `desenvolvedor` pode reescrevê-los, desde que passem nos vetores da seção 12.3.

### 3.3 Normalização dos demais valores (trigger `*_prepare`)

| Valor | Normalização | Validação (erro `22023` com `hint`) |
|---|---|---|
| Nome do sócio, apelido do sócio, titular do recebedor, `NAME_VARIANT`, nome/razão social, nome fantasia, apelido `NAME` do cliente | `private.normalize_alias` (existente) | resultado não vazio (`NAME_REQUIRED`) |
| Documento do cliente e apelido `DOCUMENT` | `private.normalize_document` | `private.is_valid_document` (`INVALID_DOCUMENT`) |
| Chave Pix (sem subtipo) | Se contém `@`: `lower(btrim(value))` (e-mail). Senão: minúsculas, sem espaços, pontos, parênteses, barras e hífens, mantendo um `+` inicial (telefone `+55 (23) 9…` → `+5523…`; chave aleatória perde os hífens; CPF/CNPJ perdem a pontuação) | 1 a 100 caracteres digitados; resultado não vazio (`INVALID_PIX_KEY`). Chave com formato de **CPF ou CNPJ é aceita** e guardada só como chave Pix ([OFICIAL] RAT-D023, "Aceitar como chave Pix"). Como não há subtipo, o DV não é conferido (11 dígitos podem ser CPF ou telefone sem `+55`); a chave é gravada como aparece no comprovante |
| `BANK_ACCOUNT` | `normalize_alias(bank_name)`, agência e conta unidos por `|`; agência e conta = só `[0-9X]` em maiúsculas, sem zeros à esquerda (`'0'` se sobrar vazio) | banco não vazio (`INVALID_BANK`); agência com 1 a 6 caracteres depois de normalizar (`INVALID_BRANCH`); conta `^[0-9]*[0-9X]$` com 1 a 20 caracteres (`INVALID_ACCOUNT`) |

Limite conhecido: a mesma conta digitada com e sem o dígito da agência ("1234-5" × "1234") gera dois valores diferentes e não é detectada como repetida. A tela orienta copiar como aparece no comprovante (UI 7.1); o reconhecimento (feature futura) pode comparar também sem o último caractere da agência. [PROPOSTA]

Atenção para o `desenvolvedor`: em trigger `BEFORE`, as **colunas geradas ainda não foram calculadas** (o PostgreSQL as calcula depois dos triggers `BEFORE`). Os triggers que precisam do nome normalizado chamam `private.normalize_alias(new.<coluna>)` diretamente, em vez de ler `new.normalized_*`.

### 3.4 Onde validar o quê

| Regra | Banco | Aplicação (TS) | Justificativa |
|---|---|---|---|
| DV de CPF e de CNPJ (numérico e alfanumérico) | **Sim, autoridade**: `CHECK clients_document_valid` + trigger dos apelidos + RPC (erro com `hint`) | **Sim, espelho**: mensagem no campo antes de enviar | O banco garante a integridade por qualquer caminho de escrita (RPC, seed, SQL do responsável, futura importação de planilha). O espelho em TS só melhora a experiência. A divergência entre os dois é contida por **vetores de teste compartilhados** (12.3): os mesmos casos rodam no pgTAP e no Vitest. Se o espelho errar, o pior caso é uma mensagem tardia; o banco nunca grava documento inválido |
| Forma canônica do documento | Sim (`clients_document_canonical`; a RPC normaliza) | Sim (máscara e limpeza no campo) | Mesma razão |
| Formato de chave Pix, agência e conta | Sim (trigger) | Sim (máscara) | Mesma razão |
| Valor da mensalidade > 0, até 2 casas | Sim, autoridade (`private.to_money` na função + `clients_monthly_value_positive`) | Sim, espelho (análise de "1.234,56" sem float; recusa vazio, zero, negativo, mais de 2 casas e "1234.56" com ponto decimal, UI 4.1.3) | A aplicação entrega texto decimal canônico (`"1234.56"`); o banco converte sem arredondar e garante o intervalo |
| Cliente ativo com ≥ 1 sócio; sócio indicado não é inativado; recebedor ativo só de sócio ativo | **Só o banco** (triggers, seção 4) + pré-checagem na RPC para mensagem clara | Só para habilitar ou desabilitar botões | Regras entre tabelas e sob concorrência: só o banco consegue garantir |
| Unicidades (documento, apelidos, identificadores, espaço de nomes do sócio) | **Só o banco** (índices + travas) | Não | Mesma razão |
| Papel (Administrador) | **Sim, barreira** (`private.require_admin()` em cada RPC; RLS na leitura) | Sim, defesa e experiência | [OFICIAL] RAT-D011, RAT-D020 (papéis garantidos no banco) |

---

## 4. Invariantes

### 4.1 Lista

| ID | Invariante | Mecanismo | Classificação |
|---|---|---|---|
| I-01 | **Cliente ativo tem ao menos 1 indicação ativa** | constraint trigger **diferido** `clients_require_partner` (`after insert or update of active on clients`, `when (new.active)`) e `client_partners_keep_partner` (`after update of active on client_partners`, `when (old.active and not new.active)`), ambos com `private.assert_client_has_partner()`; serialização pela trava da linha do cliente em `client_partners_prepare` (9.2) | [OFICIAL] RAT-D025 |
| I-02 | **Indicação ativa ⇒ sócio ativo** (nos dois sentidos) | (a) `client_partners_prepare`: ao inserir ativa ou reativar, `select active from partners where id = new.partner_id for share` e exige `true` (`PARTNER_INACTIVE`); (b) `partners_guard`: ao mudar `active` de `true` para `false`, exige nenhuma linha ativa em `client_partners` do sócio, **em cliente ativo ou inativo** (`PARTNER_HAS_CLIENTS`) | [OFICIAL] RAT-D025 (indicado em qualquer cliente não é inativado) + [PROPOSTA] R-S05 (inativo não é indicado) |
| I-03 | Uma linha por par (cliente, sócio); `client_id` e `partner_id` imutáveis; reindicar reativa a linha | `client_partners_pair_key` + `client_partners_prepare` | [PROPOSTA] R-C09 |
| I-04 | Recebedor sempre com sócio; o sócio dono não muda | `partner_id not null` + FK `on delete restrict` + `receivers_prepare` recusa mudança (`RECEIVER_PARTNER_IMMUTABLE`) | [OFICIAL] RAT-D023 + [PROPOSTA] R-R02 |
| I-05 | **Recebedor ativo ⇒ sócio ativo** (nos dois sentidos) | (a) `receivers_prepare`: ao inserir ativo ou reativar, trava o sócio `for share` e exige ativo (`PARTNER_INACTIVE`); (b) `partners_guard`: ao inativar o sócio, exige nenhum recebedor ativo (`PARTNER_HAS_ACTIVE_RECEIVERS`). A RPC de inativação inativa os recebedores **antes** de inativar o sócio, na mesma transação (I-06) | [OFICIAL] RAT-D025 (recebedores inativados junto) + [PROPOSTA] R-R07 |
| I-06 | A inativação do sócio inativa exatamente os recebedores que o Administrador confirmou | RPC `set_partner_active`: compara a lista confirmada com os recebedores ativos **depois** de travar o sócio; diferença → `RECEIVERS_CHANGED` com a lista atual | [OFICIAL] RAT-D025 ("mostra a lista e pede confirmação") + [PROPOSTA] (forma) |
| I-07 | Documento do cliente canônico, com DV válido e **único entre todos os clientes**, ativos e inativos | `clients_document_canonical`, `clients_document_valid`, índice único parcial `clients_document_key` | [OFICIAL] RAT-D024 |
| I-08 | Documento de um cliente não coincide com apelido `DOCUMENT` **ativo** de outro cliente, e vice-versa | trava consultiva `cad.client_document:<doc>` + checagem cruzada em `clients_prepare` e `client_aliases_prepare` (`DOCUMENT_TAKEN`) | [PROPOSTA] R-A03 |
| I-09 | Apelido ativo de cliente resolve para um único cliente | índice único parcial `client_aliases_active_key (alias_type, normalized_value) where active` | [PROPOSTA] R-A02 |
| I-10 | Apelidos e identificadores são imutáveis, salvo `active` (e `updated_at`) | `partner_aliases_prepare`, `client_aliases_prepare`, `receiver_identifiers_prepare` recusam mudança de outras colunas (`IMMUTABLE_FIELD`) | [PROPOSTA] R-A05 |
| I-11 | **Espaço de nomes do sócio**: um texto normalizado que seja nome de sócio, apelido ativo de sócio ou variação de nome (`NAME_VARIANT`) ativa de recebedor aponta para **um único sócio** | índices `partners_normalized_name_key` (existente), `partner_aliases_active_key`, `receiver_identifiers_active_key` + trava consultiva `cad.partner_name:<texto>` e checagem cruzada em `partners_guard`, `partner_aliases_prepare` e `receiver_identifiers_prepare` com `private.assert_partner_name_free(texto, sócio)` (`PARTNER_NAME_TAKEN`) | [PROPOSTA] R-A02, R-A04, R-R09 |
| I-12 | Identificador ativo de recebedor: um valor por tipo pertence a um único recebedor | índice único parcial `receiver_identifiers_active_key (identifier_type, normalized_value) where active` (`IDENTIFIER_TAKEN`) | [PROPOSTA] I-35 da FND |
| I-13 | Mensalidade exata com 2 casas, > 0 | `numeric(14,2)` + `clients_monthly_value_positive` + entrada por `private.to_money`; catálogo sem float (I-17 da FND) | [OFICIAL] RAT-D025 + [PROPOSTA] aprovada na FND (`numeric(14,2)`) |
| I-14 | Nenhuma exclusão física nas 7 tabelas | `before delete ... prevent_mutation()` + `before truncate ... prevent_truncate()` + `TRUNCATE` revogado (default privileges da FND) | [OFICIAL] Brain 05 (inativação) + [PROPOSTA] R-G01 |
| I-15 | Toda escrita nas 7 tabelas é auditada | trigger `audit_row_change` em cada tabela | [OFICIAL] RAT-D009 |
| I-16 | Nenhum percentual armazenado; nenhum `organization_id` | catálogo (teste existente do `01_catalog`, que continua valendo sem mudança) | [OFICIAL] RAT-D015, RAT-D010 |
| I-17 | Nenhum CPF/CNPJ de sócio nem de titular de recebedor | catálogo: `partners`, `receivers` e `receiver_identifiers` sem coluna `document`, `cpf`, `cnpj`, `tax_id`. Uma chave Pix que seja CPF ou CNPJ fica só em `receiver_identifiers.value` do tipo `PIX_KEY`, nunca como documento | [OFICIAL] RAT-D023 (inclusive "Aceitar como chave Pix"), RAT-D025 |
| I-18 | A aplicação só escreve pelas RPCs | `authenticated` sem `INSERT`/`UPDATE`/`DELETE` nas 7 tabelas (o teste existente do `01_catalog` já cobre "authenticated não escreve em nenhuma tabela de public, exceto `proof_files`") | [PROPOSTA] plano 4.3 |
| I-19 (revisão 4) | **Itens ativos por cadastro têm teto:** sócio até 2 apelidos; cliente até 2 apelidos `NAME` **e** até 2 apelidos `DOCUMENT` (CPF e CNPJ somados), cada tipo com o próprio teto; recebedor até 30 `NAME_VARIANT`, 10 `PIX_KEY` e 10 `BANK_ACCOUNT`. Contam só os ativos | conferência no começo de `save_partner`, `save_client` e `save_receiver`, sobre a lista de estado final normalizada e sem repetidos, com os números de `private.cad_list_limit` e o erro de `private.assert_list_limit` (6.6). Como a lista é o estado final e a linha do dono está travada (9.2), o número de ativos depois da gravação é exatamente o tamanho da lista conferida | [OFICIAL] RAT-D026 (números, por tipo no cliente, só ativos) + [PROPOSTA] (mecanismo) |

### 4.2 Funções de guarda (todas `SECURITY DEFINER`, `set search_path = ''`, `revoke execute ... from public`)

`SECURITY DEFINER` nas guardas garante que a checagem enxerga **todas** as linhas, qualquer que seja o papel de quem escreve (o RLS de quem chama nunca esconde uma linha conflitante), e permite `FOR SHARE` sem depender de privilégio de `UPDATE` do chamador. Nenhuma delas chama `set_audit_context` (regra da FND: só o ponto de entrada).

| Função (trigger) | Tabela / momento | O que faz |
|---|---|---|
| `private.partners_guard()` | `partners`, `before insert or update` | `id`/`created_at` imutáveis; inclusão ou troca de nome → `assert_partner_name_free(normalize_alias(new.name), new.id)`; `active` de `true` para `false` → I-02 (b) e I-05 (b) |
| `private.partner_aliases_prepare()` | `partner_aliases`, `before insert or update` | I-10; inclusão ativa ou reativação → `assert_partner_name_free(normalize_alias(new.alias), new.partner_id)` |
| `private.receivers_prepare()` | `receivers`, `before insert or update` | I-04 (imutabilidade de `partner_id`, `id`, `created_at`); I-05 (a) |
| `private.receiver_identifiers_prepare()` | `receiver_identifiers`, `before insert or update` | inclusão: valida e calcula `normalized_value` (3.3), ignorando o valor enviado; I-10; incluído ativo ou reativado → trava `cad.receiver_identifier:<tipo>:<valor>` e checa dono (`IDENTIFIER_TAKEN` com `detail`, inclusive `identifier_type`, 6.3; o `raise` mora **aqui**, na migration `0200`, e não em `save_receiver`, na `0300`); `NAME_VARIANT` → também `assert_partner_name_free(normalized_value, <sócio do recebedor>, 'identifiers')` |
| `private.clients_prepare()` | `clients`, `before insert or update` | `id`/`created_at` imutáveis; documento incluído ou trocado → `assert_client_document_free(new.document, new.id)` |
| `private.client_aliases_prepare()` | `client_aliases`, `before insert or update` | inclusão: valida e calcula `normalized_value`; I-10; incluído ativo ou reativado → trava `cad.client_alias:<tipo>:<valor>` e checa dono (`ALIAS_TAKEN` com `detail`); `DOCUMENT` → também `assert_client_document_free(normalized_value, new.client_id)` |
| `private.client_partners_prepare()` | `client_partners`, `before insert or update` | I-03; **trava a linha do cliente** (`select 1 from clients where id = new.client_id for no key update`); I-02 (a) |
| `private.assert_client_has_partner()` | constraint triggers diferidos de I-01 | se o cliente está ativo e não tem linha ativa em `client_partners` → `23514`, `hint = 'CLIENT_WITHOUT_PARTNER'` |
| `private.assert_partner_name_free(p_text text, p_partner_id uuid, p_field text default 'name')` | auxiliar | `pg_advisory_xact_lock(hashtext('cad.partner_name:' || p_text))`; recusa (`23505`, `hint = 'PARTNER_NAME_TAKEN'`, `detail` com o dono, 6.3) se o texto é nome de **outro** sócio (ativo ou inativo), apelido ativo de outro sócio ou `NAME_VARIANT` ativa de recebedor de outro sócio. `p_field` só vai para o `field` do `detail` (`name` em `partners_guard`, `aliases` em `partner_aliases_prepare`, `identifiers` em `receiver_identifiers_prepare`); não muda a regra (D-18) |
| `private.assert_client_document_free(p_doc text, p_client_id uuid, p_field text default 'document')` | auxiliar | `pg_advisory_xact_lock(hashtext('cad.client_document:' || p_doc))`; recusa (`23505`, `hint = 'DOCUMENT_TAKEN'`, `detail` com id, nome e situação do cliente dono, 6.3) se o documento é de outro cliente ou apelido `DOCUMENT` ativo de outro cliente. `p_field`: `document` (`clients_prepare` e `save_client`) ou `aliases` (`client_aliases_prepare`); só o `detail` (D-18) |
| `private.normalize_client_alias(p_type, p_alias)` e `private.normalize_receiver_identifier(p_type, p_value, p_bank_name, p_branch, p_account)` | puras (`IMMUTABLE`) | devolvem o valor normalizado ou levantam `22023` com o `hint` da tabela 3.3; usadas pelos triggers e pelas funções de salvamento |

As auxiliares não recebem `EXECUTE` de `authenticated`: só são chamadas por funções `SECURITY DEFINER`, que rodam como dono. As duas `normalize_*` também ficam fechadas: a aplicação não precisa delas.

O `detail` com nome do dono só existe no caminho de escrita, e toda escrita passa por `private.require_admin()` antes; o único papel que recebe esse conteúdo é o Administrador, que já lê todos esses cadastros pelo RLS (seção 7). `service_role` e `postgres` também o recebem, mas já leem tudo.

O mesmo texto em dois lugares da **mesma** entidade (ex.: apelido do sócio igual ao nome do próprio sócio, ou igual à variação de nome de um recebedor dele) é **aceito**, porque não há ambiguidade de reconhecimento ([PROPOSTA]; a R-A07 diz que repetir o nome é desnecessário, não proibido).

---

## 5. Índices

| Índice | Tabela | Justificativa |
|---|---|---|
| `partners_normalized_name_key` (existente, único) | `partners` | I-11; M-05 |
| `partner_aliases_active_key` único parcial `(normalized_value) where active` | `partner_aliases` | I-11; reconhecimento do sócio pelo apelido (Brain 08) |
| `partner_aliases_partner_id_idx (partner_id)` | `partner_aliases` | FK; apelidos no detalhe do sócio |
| `receivers_partner_id_idx (partner_id, active)` | `receivers` | FK; recebedores do sócio; I-05 (b) e a cascata de I-06 |
| `receiver_identifiers_active_key` único parcial `(identifier_type, normalized_value) where active` | `receiver_identifiers` | I-12; reconhecimento do recebedor (Brain 08: identificador bancário → alias → nome); também atende à checagem cruzada de I-11 (`identifier_type = 'NAME_VARIANT'` é prefixo do índice) |
| `receiver_identifiers_receiver_id_idx (receiver_id)` | `receiver_identifiers` | FK; identificadores do recebedor |
| `clients_document_key` único parcial `(document) where document is not null` | `clients` | I-07; busca por documento (Brain 08: documento exato primeiro) |
| `clients_normalized_name_idx (normalized_name)` | `clients` | aviso de nome repetido (R-C15); ordenação da lista |
| `clients_normalized_trade_name_idx (normalized_trade_name) where normalized_trade_name is not null` | `clients` | aviso de nome repetido pelo nome fantasia |
| `client_aliases_active_key` único parcial `(alias_type, normalized_value) where active` | `client_aliases` | I-09; reconhecimento do cliente pelo apelido; I-08 |
| `client_aliases_client_id_idx (client_id)` | `client_aliases` | FK; apelidos no detalhe |
| `client_partners_pair_key` único `(client_id, partner_id)` | `client_partners` | I-03; sócios de um cliente (prefixo `client_id`) |
| `client_partners_partner_id_idx (partner_id)` | `client_partners` | FK; "clientes em que o sócio está indicado" (I-02 (b), diálogo de inativação, futura P-02b) |

Busca textual por "contém" (lista de clientes, CA-19) usa `like '%termo%'` sobre colunas normalizadas, com varredura sequencial. Com centenas de clientes (uso interno) isso é instantâneo. `pg_trgm` está fora do escopo (plano 3.2) e fica como evolução se o volume crescer.

---

## 6. Funções de escrita (RPCs)

### 6.0 Respostas às perguntas da UI (`03-ui-ux.md`)

| # | Pergunta | Resposta desta modelagem |
|---|---|---|
| **U-C01** | Um só "Salvar" grava dados, sócios indicados e apelidos | **Aceito.** Uma função de salvamento por cadastro, **tudo ou nada** numa transação: `save_partner` (nome + apelidos), `save_receiver` (titular + variações + chaves Pix + contas) e `save_client` (dados + documento + mensalidade + sócios + apelidos). Listas filhas chegam como **estado final desejado** (os itens ativos que a tela mostra), não como operações: a função compara com o banco e inclui, reativa ou inativa. Com isso o salvamento é idempotente (reenviar o mesmo formulário não duplica nada), cabe numa chamada só e tem um único token de concorrência por cadastro (o `updated_at` do dono). Inativar e reativar o **cadastro** continuam em funções próprias (`set_*_active`), porque têm diálogo, motivo e efeitos próprios (cascata de recebedores, checagem de sócios). Isso substitui o desenho "uma RPC por ação" do plano 4.3 (D-02) |
| **U-C02** | Erro de documento repetido com id, nome e situação do cliente dono | `save_client` levanta `23505` com `hint = 'DOCUMENT_TAKEN'` e `detail` JSON `{"field":"document","owner":{"kind":"client","id":"…","name":"…","active":false}}`. Não vaza: o `detail` só é montado **depois** de `private.require_admin()`, e o Administrador já lê todos os clientes pelo RLS. Operador, Visualizador, Sócio e anônimo não chegam a nenhuma função de escrita (recebem `42501` antes de qualquer consulta). O mesmo formato vale para apelido e identificador repetidos (6.3), atendendo às mensagens com nome e link da UI (4.1.6, 5.2, 7.2) |
| **U-C03** | Tipos de apelido e normalização | **Cliente:** `NAME` (outra forma do nome: razão social antiga, nome fantasia alternativo, abreviação) e `DOCUMENT` (CPF ou CNPJ de quem paga em nome do cliente, R-A08); na tela, "Nome · CPF · CNPJ", e "CPF"/"CNPJ" viram `DOCUMENT`. **Sócio:** só nome, sem tipo (um apelido-documento guardaria o CPF/CNPJ do sócio, que a RAT-D025 exclui). Normalização: nomes por `private.normalize_alias` (minúsculas, sem acento, sem pontuação, espaços colapsados); documentos por `private.normalize_document` com DV validado (seção 3) |
| **U-C04** | Várias chaves Pix e várias contas por recebedor | **Sim**, como identificadores tipados (2.7). O único limite é que um valor ativo pertence a um só recebedor (I-12) |
| U-C07 | Leitura do vínculo de login pelo Administrador | Já existe: `profiles_select_own_or_admin` deixa o Administrador ler `profiles.partner_id`. Consulta em 11.7. Nenhuma mudança de banco |
| U-C13 | Limites | Nome, razão social, nome fantasia, titular, apelido e variação: 200. Observações do cliente: **2000**. Chave Pix: 100 (como digitada). Banco: 100. Motivo: o banco aceita até 2000 (`audit_logs_reason_length`, FND); a tela limita a 500. Mensalidade: só o teto **técnico** do `numeric(14,2)`, R$ 999.999.999.999,99 (PEND-M2 encerrada pelo orquestrador com o limite técnico) |
| U-C05 | Mascarar CPF/chave Pix/conta | **Nada é mascarado** ([OFICIAL] RAT-D023, "Ver completo"). A leitura continua limitada pela matriz do plano (seção 7): Operador e Visualizador veem o documento completo dos clientes; chaves Pix e contas só o Administrador lê. Nenhuma coluna ou função de máscara no banco |
| U-C16 | Apelidos inativos do cliente só para o Administrador | Garantido no RLS de `client_aliases` (seção 7) |

Lembretes do orquestrador, garantidos no banco:

- **Sócio indicado em cliente ativo ou inativo não é inativado:** I-02 (b), no trigger `partners_guard`, olha todas as linhas ativas de `client_partners`, sem filtrar pela situação do cliente.
- **Cliente não é reativado sem sócio ativo:** I-01 (trigger diferido na mudança de `active` para `true`) + I-02 (toda indicação ativa aponta para sócio ativo). Juntas, "ao menos uma indicação ativa" equivale a "ao menos um sócio ativo".

### 6.1 Onde ficam as funções

Desenho em duas camadas ([PROPOSTA]):

- **`private.<nome>`**: a implementação, `SECURITY DEFINER`, `set search_path = ''`, dona `postgres`. Primeira instrução: `perform private.require_admin()`. Segunda: `perform private.set_audit_context(p_reason, 'UI', p_correlation_id)`.
- **`public.<nome>`**: invólucro `SECURITY INVOKER`, `language sql`, uma linha (`select private.<nome>(...)`), com a mesma assinatura. É o único ponto que o PostgREST expõe (`supabase.rpc('<nome>', …)`).

Por que assim:

1. **Escrita só por função.** `authenticated` continua **sem** `INSERT`/`UPDATE`/`DELETE` em todas as tabelas (I-18). Com funções `SECURITY INVOKER`, seria preciso conceder escrita na tabela, e a aplicação poderia gravar direto, sem a função (sem concorrência otimista, sem o estado final das listas).
2. **Regra da FND preservada.** O teste "nenhuma função `SECURITY DEFINER` exposta em `public`" (`01_catalog`, 12.5 da FND) continua verdadeiro sem mudança: o privilégio elevado fica em `private`, que o PostgREST não expõe.
3. **Barreira no banco.** O papel é checado dentro da função `SECURITY DEFINER`, por `private.require_admin()` (usa `private.is_admin()`, que exige perfil ativo). As invariantes ficam nos triggers (seção 4), que valem mesmo para escrita feita por `postgres` ou `service_role`.

Justificativa escrita exigida pela FND (12.5: "nenhuma RPC pública `SECURITY DEFINER` sem justificativa escrita e teste por papel"): embora as funções `SECURITY DEFINER` fiquem em `private`, elas são alcançáveis pelos invólucros, e por isso esta seção serve de justificativa e a seção 12 traz o teste por papel de cada uma.

Funções auxiliares novas:

```sql
create function private.require_admin() returns void
language plpgsql stable set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Somente o Administrador altera cadastros.'
      using errcode = 'insufficient_privilege', hint = 'ADMIN_REQUIRED';
  end if;
end;
$$;

-- Concorrência otimista (6.2). STABLE, e não IMMUTABLE (revisão 3, D-17): monta o detail
-- com jsonb_build_object sobre timestamptz.
create function private.assert_version(p_current timestamptz, p_expected timestamptz) returns void
language plpgsql stable set search_path = '' as $$
begin
  if p_expected is null then
    raise exception 'Versão do registro não informada.' using errcode = 'invalid_parameter_value', hint = 'VERSION_REQUIRED';
  end if;
  if p_current is distinct from p_expected then
    raise exception 'O registro foi alterado por outra pessoa.' using errcode = 'P0001', hint = 'STALE_VERSION',
      detail = pg_catalog.jsonb_build_object('current_updated_at', p_current)::text;
  end if;
end;
$$;
```

Ambas com `revoke execute ... from public` e **sem** `grant` a `authenticated` (só são chamadas pelas funções `SECURITY DEFINER`).

### 6.2 Convenções comuns

| Tema | Regra |
|---|---|
| Parâmetros finais | toda função de escrita termina com `p_reason text default null, p_correlation_id uuid default null` ([OFICIAL] RAT-D021: motivo opcional; FND 12.6) |
| Ordem dentro da função | (1) `require_admin`; (2) `set_audit_context`; (3) validação e normalização das entradas (erros `22023`); (4) travas na ordem da seção 9; (5) checagem de versão; (6) pré-checagens com mensagem clara; (7) escritas; (8) eventos de auditoria; (9) retorno da linha do dono |
| Token de concorrência | `p_expected_updated_at timestamptz`, obrigatório em edição e em `set_*_active`; nulo só em `save_*` de cadastro novo (`p_<x>_id is null`). Comparação **exata** (microssegundos) depois de travar a linha. A aplicação devolve o `updated_at` **como veio do PostgREST (texto ISO com microssegundos)**; nunca converte para `Date` do JavaScript, que corta os microssegundos e produziria conflito falso em toda edição (F-03). No `zod`, o campo é `string`, sem `coerce` |
| Versão dos filhos | apelidos, identificadores e indicações não têm token próprio: qualquer mudança neles **toca** o `updated_at` do dono (`update <dono> set updated_at = now() where id = …`). O trigger de auditoria ignora `updated_at` e não gera linha só por isso (FND 3.2) |
| Idempotência | `set_*_active` para a situação em que o registro já está: devolve a linha sem escrever e **sem** checar a versão (duplo clique não vira conflito). `save_*` sem mudança real: nenhuma escrita, nenhuma linha de auditoria, `updated_at` inalterado |
| Textos | `btrim`; opcional em branco vira `NULL`; obrigatório em branco → `22023` `NAME_REQUIRED` |
| Listas | itens repetidos na mesma lista (mesmo valor normalizado) são reduzidos a um, sem erro. **Revisão 4 (RAT-D026):** a lista sem repetidos tem teto por tipo; o item que cria o primeiro valor distinto acima do teto dá `22023` `LIST_LIMIT_EXCEEDED` na hora, ainda na validação, antes de qualquer trava ou escrita (6.6) |
| Lista nula (revisão 3, D-13) | Há dois tipos de lista. **Estado final** (`p_aliases` de `save_partner` e `save_client`, `p_identifiers` de `save_receiver`, `p_partner_ids` de `save_client`): **nula é recusada** com `22023` `LIST_REQUIRED`, inclusive o JSON `null` nas listas `jsonb`, porque nula inativaria todos os itens por descuido; a lista vazia (`'{}'`, `'[]'`) continua significando "nenhum item". É a primeira validação, logo depois de `require_admin()` e `set_audit_context()`. **Confirmação** (`p_confirmed_receiver_ids` de `set_partner_active`, `p_acknowledged_duplicate_ids` de `save_client`): **nulo vale vazio** e nunca apaga nada; com recebedor ativo, a confirmação vazia dá `RECEIVERS_CHANGED`; com parecido, `POSSIBLE_DUPLICATE` |
| Retorno | a linha atualizada do dono (`public.partners`, `public.receivers`, `public.clients`), com o novo `updated_at` |
| Volatilidade | todas `volatile` (padrão) |

### 6.3 Contrato de erros

A aplicação mapeia o `SQLSTATE` (como hoje, `src/lib/errors.ts`) **e** o `hint`, que é uma chave estável. A mensagem em português vem sempre da tabela da aplicação; o texto do banco não vai para a tela. O `detail`, quando existe, é JSON e só é lido para montar a mensagem (nome do dono, link). O `desenvolvedor` estende `mapDatabaseError` para ler `hint` e `details` (supabase-js expõe os dois).

| `hint` | SQLSTATE | Quando | `detail` (JSON) |
|---|---|---|---|
| `ADMIN_REQUIRED` | `42501` | quem chama não é Administrador ativo | — |
| `NOT_FOUND` | `P0002` | id inexistente. **Sem `detail`** quando o inexistente é o próprio cadastro (sócio, recebedor ou cliente em edição ou em `set_*_active`). **Com `detail`** quando é uma referência (revisão 3, D-15): `save_receiver` novo com `p_partner_id` nulo ou inexistente; `save_client` com sócio inexistente ou item nulo em `p_partner_ids` | `{"field":"partner_id"}` (`save_receiver`) ou `{"field":"partner_ids"}` (`save_client`); ausente no primeiro caso |
| `VERSION_REQUIRED` | `22023` | edição sem `p_expected_updated_at` | — |
| `STALE_VERSION` | `P0001` | versão diferente da atual (levantado por `private.assert_version`, 6.1) | `{"current_updated_at":"<timestamptz em ISO 8601 com microssegundos>"}`, o `updated_at` atual da linha travada. A tela relê o registro para o bloco "O que mudou" (UI 8); o valor é texto e segue a regra do token (6.2: nunca `Date`) (revisão 3, D-17) |
| `ACTIVE_REQUIRED` | `22023` | `p_active` nulo em `set_partner_active`, `set_receiver_active` ou `set_client_active` (revisão 3, D-12) | — |
| `LIST_REQUIRED` | `22023` | lista de **estado final** nula (6.2): `p_aliases` (`save_partner`, `text[]`; `save_client`, `jsonb`, em que o JSON `null` também é recusado), `p_identifiers` (`save_receiver`, `jsonb`; JSON `null` também), `p_partner_ids` (`save_client`) (revisão 3, D-13). As listas de confirmação não entram aqui: nulo vale vazio | `{"field":"aliases"}`, `{"field":"identifiers"}` ou `{"field":"partner_ids"}` |
| `INVALID_IDENTIFIER` | `22023` | formato da lista JSON (revisão 3, D-11): `p_identifiers` (`save_receiver`) ou `p_aliases` (`save_client`) que não é array; item que não é objeto; `type` ausente, não texto ou desconhecido; chave desconhecida ou fora do tipo (recebedor: `value` em `NAME_VARIANT`/`PIX_KEY`, `bank_name`/`branch`/`account_number` em `BANK_ACCOUNT`; cliente: só `value`); valor que não é texto nem nulo (um número JSON perderia os zeros à esquerda da agência). O nome do hint vale também para os apelidos do cliente | `{"field":"identifiers"}` ou `{"field":"aliases"}` (sem `value`) |
| `LIST_LIMIT_EXCEEDED` (revisão 4) | `22023` | lista de estado final com mais valores distintos de um tipo do que o teto da RAT-D026 (I-19, 6.6): `p_aliases` de `save_partner` (mais de 2); `p_aliases` de `save_client` (mais de 2 `NAME` ou mais de 2 `DOCUMENT`); `p_identifiers` de `save_receiver` (mais de 30 `NAME_VARIANT`, 10 `PIX_KEY` ou 10 `BANK_ACCOUNT`). Repetidos (mesmo valor normalizado) contam uma vez. Levantado por `private.assert_list_limit`, chamado dentro do laço de validação | sempre presente, com `field`, `list` (a chave do teto), o tipo quando houver e `max` (número JSON): `{"field":"aliases","list":"PARTNER_ALIAS","max":2}`; `{"field":"aliases","list":"CLIENT_ALIAS_NAME","alias_type":"NAME","max":2}`; `{"field":"aliases","list":"CLIENT_ALIAS_DOCUMENT","alias_type":"DOCUMENT","max":2}`; `{"field":"identifiers","list":"NAME_VARIANT","identifier_type":"NAME_VARIANT","max":30}` (idem `PIX_KEY` e `BANK_ACCOUNT`, `max` 10). Sem `value` e sem contagem: a conferência para no primeiro valor acima do teto |
| `INVALID_FILTER` | `22023` | `search_clients` e `search_aliases` (revisão 3, D-14): `p_status` fora de `ACTIVE`/`INACTIVE`/`ALL`; `p_kind` fora da lista (só `search_aliases`); `p_limit` fora de 1 a 100; `p_offset` negativo. Nulo em situação, limite e deslocamento vale o padrão | `{"field":"status"}`, `{"field":"kind"}`, `{"field":"limit"}` ou `{"field":"offset"}` |
| `NAME_REQUIRED`, `NAME_TOO_LONG` | `22023` | nome, titular, apelido ou variação vazio ou acima de 200 | `{"field":"…"}` |
| `NOTES_TOO_LONG` | `22023` | observações acima de 2000 | — |
| `INVALID_DOCUMENT` | `22023` | documento do cliente ou apelido `DOCUMENT` com formato ou DV inválido | `{"field":"document"}` ou `{"field":"aliases","value":"…"}` |
| `INVALID_AMOUNT` | `22023` | mensalidade nula, ilegível, negativa, zero, com mais de 2 casas ou acima de `999999999999.99` (erro de `to_money` capturado e relançado com o `hint`) | `{"field":"default_monthly_value"}` |
| `INVALID_PIX_KEY`, `INVALID_BANK`, `INVALID_BRANCH`, `INVALID_ACCOUNT` | `22023` | identificador de recebedor inválido (3.3) | `{"field":"identifiers","value":"…"}` |
| `DOCUMENT_TAKEN` | `23505` | documento já é de outro cliente ou apelido-documento ativo de outro cliente | `{"field":"document" ou "aliases","owner":{"kind":"client","id":"…","name":"…","active":true}}` |
| `ALIAS_TAKEN` | `23505` | apelido ativo de outro cliente (I-09) | `{"field":"aliases","value":"…","owner":{"kind":"client","id","name","active"}}` |
| `PARTNER_NAME_TAKEN` | `23505` | nome, apelido ou variação já usado por outro sócio (I-11) | `{"field":"name"/"aliases"/"identifiers","value":"…","owner":{"kind":"partner","id","name","active","via":"NAME"/"ALIAS"/"NAME_VARIANT"}}` |
| `IDENTIFIER_TAKEN` | `23505` | chave Pix, conta ou variação ativa de outro recebedor (I-12). Levantado pelo gatilho `private.receiver_identifiers_prepare()`, na migration `0200` (D-21) | `{"field":"identifiers","identifier_type":"NAME_VARIANT"\|"PIX_KEY"\|"BANK_ACCOUNT","value":"<valor normalizado>","owner":{"kind":"receiver","id","name":"<titular>","partner_id","partner_name","active"}}`. O `identifier_type` (revisão 3, D-16) deixa a tela usar a frase de cada tipo (UI 7.2) |
| `PARTNER_INACTIVE` | `P0001` | indicar sócio inativo; criar ou reativar recebedor de sócio inativo | `{"partners":[{"id","name"}]}` |
| `PARTNER_HAS_CLIENTS` | `P0001` | inativar sócio com indicação ativa em qualquer cliente | `{"clients":[{"id","name","active"}]}` |
| `RECEIVERS_CHANGED` | `P0001` | a lista de recebedores confirmada difere da atual | `{"receivers":[{"id","name"}]}` |
| `PARTNER_HAS_ACTIVE_RECEIVERS` | `P0001` | defesa do trigger (I-05 b), caso a função não tenha inativado antes | — |
| `CLIENT_WITHOUT_PARTNER` | `P0001` na função; `23514` no trigger diferido | cliente ativo sem indicação (salvar, retirar o último, reativar) | — |
| `POSSIBLE_DUPLICATE` | `P0001` | aviso de possível duplicado ainda não confirmado (R-C15; [OFICIAL] RAT-D024; 6.4.5): nome ou nome fantasia igual ao de outro cliente, apelido `NAME` de outro cliente igual ao nome, ou (revisão 3, D-20) apelido `NAME` deste cliente igual ao nome ou ao nome fantasia de outro | `{"matches":[{"id","name","document","document_type","active","match":"SAME_NAME"/"SAME_ALIAS"}]}`. `SAME_NAME` quando o nome ou o fantasia do outro casa com o nome ou o fantasia informados; `SAME_ALIAS` nos dois casos de apelido (os dois sentidos) |
| `RECEIVER_PARTNER_IMMUTABLE`, `IMMUTABLE_FIELD` | `P0001` | tentativa de trocar o sócio do recebedor ou campo imutável | — |

Nos erros `*_TAKEN`, o `value` do `detail` é o valor **normalizado** (o que o gatilho compara); nos erros de validação que trazem `value` (`INVALID_DOCUMENT` de apelido, erros de identificador do recebedor e de apelido do cliente), é o valor **como digitado**, depois do `btrim`. `INVALID_IDENTIFIER`, `ACTIVE_REQUIRED`, `LIST_REQUIRED` e `INVALID_FILTER` entraram na revisão 3 e já são lidos pelo `mapDatabaseError` (E4). `LIST_LIMIT_EXCEEDED` entra na revisão 4 (RAT-D026); a frase de cada `list` está em 6.6.5.

**Onde cada erro de dono é levantado** (revisão 3, D-21): `PARTNER_NAME_TAKEN` e `DOCUMENT_TAKEN` nas auxiliares `assert_*_free`; `IDENTIFIER_TAKEN` e `ALIAS_TAKEN` nos gatilhos `receiver_identifiers_prepare` e `client_aliases_prepare`. Todos estão na migration `20261125000200_cad_tables.sql`; as funções de salvamento (`0300`, `0400`) os alcançam pelas escritas, e `save_client` também chama `assert_client_document_free` direto na pré-checagem (6.4.5, passo 5). Mudança no texto ou no `detail` desses erros é feita na `0200` (ou, depois de publicada, numa migration nova que recria a função).

Para que o `detail` exista mesmo numa corrida (duas pessoas salvando o mesmo valor ao mesmo tempo), as checagens de dono rodam **sob trava consultiva** dentro dos triggers: `cad.partner_name:<texto>`, `cad.client_document:<doc>`, `cad.client_alias:<tipo>:<valor>` e `cad.receiver_identifier:<tipo>:<valor>`. Os índices únicos continuam como última barreira; se um deles disparar (`23505` sem `hint`), a aplicação mostra a mensagem genérica de `CONFLICT`.

A chave de trava usa `hashtext`, de 32 bits: uma colisão só serializa duas operações sem relação, sem efeito na correção.

### 6.4 Assinaturas

Todas existem em `private` (implementação) e em `public` (invólucro), com os mesmos parâmetros. Tipos de retorno: a linha da tabela.

#### 6.4.1 `save_partner`

```sql
save_partner(
  p_partner_id          uuid,         -- null = novo sócio
  p_name                text,
  p_aliases             text[],       -- estado final dos apelidos ATIVOS (textos como digitados); nulo -> LIST_REQUIRED
  p_expected_updated_at timestamptz,  -- obrigatório na edição
  p_reason              text default null,
  p_correlation_id      uuid default null
) returns public.partners
```

0. `p_aliases` nulo → `LIST_REQUIRED` (`{"field":"aliases"}`); `'{}'` inativa todos os apelidos (revisão 3, D-13).
1. Valida o nome e cada apelido (1 a 200, normalizado não vazio); reduz repetidos pelo valor normalizado. Revisão 4 (RAT-D026): ao entrar o 3.º valor distinto → `LIST_LIMIT_EXCEEDED` (`list = PARTNER_ALIAS`, 6.6).
2. Novo: `insert into partners (name)` (nasce ativo). Edição: `select … for no key update`; `assert_version`; atualiza o nome se mudou. Sócio inativo pode ser editado (UI 5.2).
3. Apelidos: inativa os ativos do sócio fora da lista; para cada valor da lista, mantém o ativo, ou **reativa** a linha inativa mais recente do mesmo sócio com o mesmo valor, ou inclui uma nova.
4. Se só os apelidos mudaram, toca `partners.updated_at`.

Erros típicos: `PARTNER_NAME_TAKEN` (nome ou apelido de outro sócio, ou variação de recebedor de outro sócio), `STALE_VERSION`.

#### 6.4.2 `set_partner_active`

```sql
set_partner_active(
  p_partner_id             uuid,
  p_active                 boolean,
  p_expected_updated_at    timestamptz,
  p_confirmed_receiver_ids uuid[] default null,  -- recebedores ativos mostrados no diálogo (inativação); confirmação: nulo = vazio
  p_reason                 text default null,
  p_correlation_id         uuid default null
) returns public.partners
```

`p_active` nulo → `ACTIVE_REQUIRED` (revisão 3, D-12; vale também para `set_receiver_active` e `set_client_active`).

Inativação (`p_active = false`):

1. `select … from partners where id = p_partner_id for no key update`; se já inativo, devolve a linha.
2. `assert_version`.
3. Indicações ativas do sócio em **qualquer** cliente → `PARTNER_HAS_CLIENTS` com a lista ([OFICIAL] RAT-D025).
4. Recebedores ativos do sócio, comparados **como conjunto** com `p_confirmed_receiver_ids` (nulo = vazio). Diferença → `RECEIVERS_CHANGED` com a lista atual ([OFICIAL] RAT-D025: confirmação).
5. `update receivers set active = false where partner_id = … and active` ([OFICIAL] RAT-D025: inativados junto).
6. `update partners set active = false`.
7. `audit_event('partner', id, 'INACTIVATE', {"receiver_ids":[…]})`.

Reativação (`p_active = true`): `assert_version`; `update partners set active = true`. **Não** reativa recebedores nem indicações ([PROPOSTA] R-S05). O login vinculado não muda em nenhum dos dois sentidos ([PROPOSTA] R-S08).

#### 6.4.3 `save_receiver`

```sql
save_receiver(
  p_receiver_id         uuid,         -- null = novo recebedor
  p_partner_id          uuid,         -- obrigatório no novo; na edição, nulo ou igual ao atual
  p_holder_name         text,
  p_identifiers         jsonb,        -- estado final dos identificadores ATIVOS (formato abaixo); nulo ou JSON null -> LIST_REQUIRED
  p_expected_updated_at timestamptz,
  p_reason              text default null,
  p_correlation_id      uuid default null
) returns public.receivers
```

Formato de `p_identifiers` (array JSON; validado pela função: lista nula → `LIST_REQUIRED`; fora do formato → `22023` `INVALID_IDENTIFIER`, 6.3; `[]` inativa todos):

```json
[
  {"type": "NAME_VARIANT", "value": "S. Exemplo A"},
  {"type": "PIX_KEY",      "value": "socio.a@example.com"},
  {"type": "BANK_ACCOUNT", "bank_name": "Banco Exemplo", "branch": "0001", "account_number": "12345-6"}
]
```

1. Novo: `p_partner_id` nulo ou inexistente → `NOT_FOUND` com `{"field":"partner_id"}`; trava o sócio `for share` e exige ativo (`PARTNER_INACTIVE`; o trigger repete a checagem); `insert into receivers`. Edição: trava o recebedor `for no key update`; `p_partner_id` diferente do atual → `RECEIVER_PARTNER_IMMUTABLE`; `assert_version`; atualiza o titular se mudou. Recebedor inativo pode ser editado (UI 7.3).
2. Identificadores: normaliza cada item com `private.normalize_receiver_identifier` (revisão 4, RAT-D026: na validação, antes do passo 1, o 31.º `NAME_VARIANT`, a 11.ª `PIX_KEY` ou a 11.ª `BANK_ACCOUNT` distinta → `LIST_LIMIT_EXCEEDED`, 6.6); sincroniza pelo par (tipo, valor normalizado), como em 6.4.1 (mantém, reativa a linha inativa do mesmo recebedor ou inclui; inativa os ausentes).
3. Se só os identificadores mudaram, toca `receivers.updated_at`.

#### 6.4.4 `set_receiver_active`

```sql
set_receiver_active(p_receiver_id uuid, p_active boolean, p_expected_updated_at timestamptz,
                    p_reason text default null, p_correlation_id uuid default null)
returns public.receivers
```

Reativação: trava o sócio `for share` **antes** do recebedor (ordem da seção 9) e exige sócio ativo (`PARTNER_INACTIVE`; [PROPOSTA] R-R07). Inativação: sem condição extra. Os identificadores continuam ativos (6.5).

#### 6.4.5 `save_client`

```sql
save_client(
  p_client_id                    uuid,          -- null = novo cliente (nasce ativo)
  p_legal_name                   text,
  p_trade_name                   text,
  p_document                     text,          -- como digitado; null ou vazio = sem documento
  p_default_monthly_value        text,          -- texto decimal com ponto ("1234.56"); convertido por private.to_money
  p_notes                        text,
  p_partner_ids                  uuid[],        -- estado final dos sócios indicados; nulo -> LIST_REQUIRED
  p_aliases                      jsonb,         -- estado final dos apelidos ATIVOS: [{"type":"NAME"|"DOCUMENT","value":"…"}]; nulo ou JSON null -> LIST_REQUIRED
  p_expected_updated_at          timestamptz,   -- obrigatório na edição
  p_acknowledged_duplicate_ids   uuid[] default null,  -- clientes do aviso de nome repetido que o Administrador confirmou; confirmação: nulo = vazio
  p_reason                       text default null,
  p_correlation_id               uuid default null
) returns public.clients
```

0. `p_partner_ids` nulo → `LIST_REQUIRED` (`{"field":"partner_ids"}`); `p_aliases` nulo ou JSON `null` → `LIST_REQUIRED` (`{"field":"aliases"}`); `p_aliases` fora do formato → `INVALID_IDENTIFIER` (`{"field":"aliases"}`) (revisão 3, D-11, D-13). Listas vazias valem "nenhum item".
1. Valida e normaliza: nomes; `private.normalize_document(p_document)` + `is_valid_document` (`INVALID_DOCUMENT`); mensalidade por `private.to_money` + `> 0` + teto (`INVALID_AMOUNT`, 2.8); observações; apelidos com `private.normalize_client_alias`; sócios sem repetição. Revisão 4 (RAT-D026): o 3.º apelido `NAME` distinto ou o 3.º `DOCUMENT` distinto (CPF e CNPJ somados) → `LIST_LIMIT_EXCEEDED` (`list = CLIENT_ALIAS_NAME` ou `CLIENT_ALIAS_DOCUMENT`, 6.6), antes das travas, do aviso de duplicado e de qualquer escrita. O documento do próprio cliente (`p_document`) não é apelido e não conta.
2. Edição: trava o cliente `for no key update`; `assert_version`. O campo `active` **não** é mudado por esta função.
3. Trava os sócios da lista `for share`, em ordem de `id`; algum inexistente (ou item nulo na lista) → `NOT_FOUND` com `{"field":"partner_ids"}`; algum inativo → `PARTNER_INACTIVE` com os nomes (UI 4.1.4: "foi inativado enquanto a pessoa preenchia").
4. Cliente ativo (sempre, no novo) com lista vazia → `CLIENT_WITHOUT_PARTNER`. Cliente inativo pode ficar sem sócios ([PROPOSTA] R-C10).
5. Documento novo ou trocado: pré-checagem do dono (`DOCUMENT_TAKEN` com o cliente dono). O trigger repete sob trava.
6. **Aviso de nome repetido** ([PROPOSTA] R-C15; [OFICIAL] RAT-D024; UI 4.1.7 e U-C09): só no cadastro novo ou quando mudou o nome, o nome fantasia ou o conjunto de apelidos `NAME`. Calcula os **outros** clientes, ativos ou inativos, cujo `normalized_name` ou `normalized_trade_name` é igual ao nome ou ao nome fantasia normalizados informados, ou que têm apelido `NAME` ativo igual a um deles, ou (revisão 3, D-20) cujo `normalized_name` ou `normalized_trade_name` é igual a um apelido `NAME` da lista final deste cliente ([OFICIAL] RAT-D024, confirmado pelo responsável em 26/11/2026: "um apelido do cliente é igual ao nome ou ao nome fantasia de outro cliente"). O aviso vale para qualquer cliente, com ou sem documento ([OFICIAL] RAT-D024, "O do plano/código", 26/11/2026). Consulta 11.4. Os dois casos de apelido saem com `match = 'SAME_ALIAS'`. Se algum desses ids **não** estiver em `p_acknowledged_duplicate_ids` → `POSSIBLE_DUPLICATE` com a lista, sem gravar nada. Se todos estiverem → segue e grava `audit_event('client', id, 'DUPLICATE_WARNING_ACK', {"matches":[ids]})`. Assim a confirmação vale só para a lista exibida (UI 4.1.7), e um novo parecido que surja entre o aviso e a confirmação volta a avisar.
7. Escreve o cliente (insert ou update).
8. Indicações: reativa ou inclui as da lista; inativa as ausentes. Se o conjunto mudou, grava `audit_event('client', id, 'PARTNERS_CHANGE', {"previous_partner_ids":[…],"new_partner_ids":[…],"previous_count":n0,"new_count":n1})`.
9. Apelidos: sincroniza pelo par (tipo, valor normalizado), como em 6.4.1.
10. Se só filhos mudaram, toca `clients.updated_at`.

O motivo informado (diálogo de confirmação de sócios ou documento, UI 4.1.8) vale para **todas** as linhas de auditoria da transação.

#### 6.4.6 `set_client_active`

```sql
set_client_active(p_client_id uuid, p_active boolean, p_expected_updated_at timestamptz,
                  p_reason text default null, p_correlation_id uuid default null)
returns public.clients
```

Reativação: trava o cliente; `assert_version`; sem indicação ativa → `CLIENT_WITHOUT_PARTNER` (o trigger diferido de I-01 repete no `COMMIT`). Inativação: sem condição; as indicações continuam ativas (e por isso continuam impedindo a inativação desses sócios, como manda a RAT-D025).

#### 6.4.7 Funções de leitura (`public`, `SECURITY INVOKER`, `stable`; o RLS de quem chama vale)

```sql
search_clients(
  p_query  text default null,   -- nome, nome fantasia, documento (com ou sem pontuação) ou apelido
  p_status text default 'ACTIVE', -- 'ACTIVE' | 'INACTIVE' | 'ALL'
  p_limit  int  default 25,     -- 1 a 100
  p_offset int  default 0,
  p_partner_id uuid default null  -- revisão 3 (D-19): só clientes com indicação ATIVA deste sócio; nulo = sem filtro
) returns table (
  id uuid, legal_name text, trade_name text, document text, document_type text,
  default_monthly_value text,   -- numeric(14,2) convertido para texto (nunca número JSON)
  active boolean, partner_count int, updated_at timestamptz,
  total_count bigint
)

search_aliases(                 -- lista consolidada (UI 5.4; cortável, E7)
  p_query  text default null,
  p_kind   text default null,   -- 'PARTNER_ALIAS' | 'CLIENT_ALIAS' | 'NAME_VARIANT' | 'PIX_KEY' | 'BANK_ACCOUNT' | null
  p_status text default 'ACTIVE',
  p_limit  int default 50, p_offset int default 0
) returns table (
  kind text, item_id uuid, display_value text, active boolean,
  owner_kind text, owner_id uuid, owner_name text, owner_active boolean,
  partner_id uuid, partner_name text, total_count bigint
)
```

`search_clients` serve a todos os papéis de leitura (o RLS filtra). O `p_partner_id` (revisão 3, D-19; atende "Ver clientes deste sócio", UI 6.1, P-E4-02) é o **último** parâmetro, com padrão nulo, para as chamadas posicionais de 1 a 4 argumentos continuarem valendo; combina com o texto e com `p_status` (cliente inativo mantém a indicação ativa, RAT-D025, então aparece em `INACTIVE` e `ALL`); `total_count` respeita o filtro; sócio desconhecido devolve 0 linhas. O `grant`/`revoke` da 7.2 vale para a assinatura de 5 parâmetros. Filtros inválidos → `INVALID_FILTER` (6.3). `search_aliases` devolve linhas só ao Administrador, porque o RLS de `partner_aliases`, `receivers` e `receiver_identifiers` só libera a ele; para os demais papéis, a parte de clientes também é cortada pela própria função (`if not private.is_admin() then return; end if;`), para a tela não mostrar resultado parcial. As consultas estão em 11.5 e 11.6.

As demais leituras (detalhe, listas de sócios e recebedores, diálogos) são `select` diretos com RLS.

### 6.5 Efeitos que a função **não** faz (de propósito)

| Situação | Comportamento | Classificação |
|---|---|---|
| Inativar cliente | indicações e apelidos continuam ativos | [PROPOSTA] (reativar devolve o cliente como estava) |
| Inativar recebedor ou sócio | identificadores dos recebedores continuam ativos e seguem bloqueando o mesmo valor em outro recebedor | [PROPOSTA] (o valor continua apontando para quem era o dono; o reconhecimento trata recebedor inativo como caso de revisão, plano R-07) |
| Reativar sócio | recebedores e indicações continuam como estão | [PROPOSTA] R-S05 |
| Apelidos de dono inativo | continuam ativos e bloqueando o valor | [PROPOSTA] (coerente com o documento único entre inativos, RAT-D024) |

### 6.6 Limites de itens por cadastro (revisão 4; [OFICIAL] RAT-D026)

#### 6.6.1 Regra

| Cadastro | Lista | Chave do teto (`list`) | Máximo de itens **ativos** |
|---|---|---|---|
| Sócio | apelidos (`p_aliases` de `save_partner`) | `PARTNER_ALIAS` | 2 |
| Cliente | apelidos do tipo nome (`p_aliases` de `save_client`, `type = NAME`) | `CLIENT_ALIAS_NAME` | 2 |
| Cliente | apelidos do tipo documento (`type = DOCUMENT`, CPF e CNPJ somados) | `CLIENT_ALIAS_DOCUMENT` | 2 |
| Recebedor | formas do nome (`p_identifiers`, `type = NAME_VARIANT`) | `NAME_VARIANT` | 30 |
| Recebedor | chaves Pix (`type = PIX_KEY`) | `PIX_KEY` | 10 |
| Recebedor | contas bancárias (`type = BANK_ACCOUNT`) | `BANK_ACCOUNT` | 10 |

- Cada linha tem o próprio teto: no cliente, "2 nomes e 2 documentos" gravam juntos (4 apelidos ativos); no recebedor, 30 + 10 + 10 gravam juntos.
- Contam só os ativos ([OFICIAL] RAT-D026). Como a lista enviada é o **estado final dos ativos** (6.2), contar a lista é contar os ativos depois da gravação: o item que sai da lista é inativado e libera a vaga; reativar um item inativo é voltar a pô-lo na lista, e com a lista cheia a lista passa do teto e é recusada. Não há consulta à tabela.
- Repetidos na mesma lista (mesmo valor normalizado, a mesma chave que a sincronização usa: `normalize_alias` no sócio; `(tipo, normalize_client_alias)` no cliente; `(tipo, normalize_receiver_identifier)` no recebedor) contam **uma** vez. Ex.: `S. Alfa` e `s alfa.`; `000.000.001-91` e `00000000191`; `Lim.A@Example.com` e `lim.a@example.com`; (`Banco Limite`, `0001`, `12345-6`) e (`banco limite`, `1`, `123456`).
- O documento do próprio cliente (`p_document`) não é apelido e não conta. `p_partner_ids` não tem teto (fora da RAT-D026).
- O teto vale para o cadastro ativo ou inativo (recebedor e cliente inativos podem ser editados, 6.4.3 e 6.4.5).

#### 6.6.2 Onde os números ficam no banco

Duas funções novas no começo da migration `20261125000300_cad_partner_receiver_rpcs.sql`, **antes** de `private.save_partner` (a `0400` as usa; a ordem dos arquivos garante que já existem). Nenhuma migration da FND nem a `0100`/`0200` mudam.

```sql
-- RAT-D026 (27/11/2026): tetos de itens ATIVOS por lista. Única fonte dos números no banco.
-- Espelho: src/domain/cadastros/limits.ts (LIST_LIMITS). O teste src/domain/cadastros/limits-sql.test.ts
-- lê as linhas "when '<CHAVE>' then return <N>;" desta função e compara com o espelho.
create function private.cad_list_limit(p_list text)
returns integer
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
begin
  case p_list
    when 'PARTNER_ALIAS'         then return 2;
    when 'CLIENT_ALIAS_NAME'     then return 2;
    when 'CLIENT_ALIAS_DOCUMENT' then return 2;
    when 'NAME_VARIANT'          then return 30;
    when 'PIX_KEY'               then return 10;
    when 'BANK_ACCOUNT'          then return 10;
    else
      raise exception 'Lista sem teto definido: %', coalesce(p_list, '(nula)')
        using errcode = 'XX000';
  end case;
end;
$$;

-- Levanta LIST_LIMIT_EXCEEDED (6.3) quando p_count passa do teto da lista. Um lugar só para o detail.
create function private.assert_list_limit(p_list text, p_count integer)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_max integer := private.cad_list_limit(p_list);
begin
  if p_count > v_max then
    raise exception 'Lista acima do teto de itens ativos (% > %).', p_list, v_max
      using errcode = 'invalid_parameter_value', hint = 'LIST_LIMIT_EXCEEDED',
            detail = pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
              'field', case when p_list in ('PARTNER_ALIAS', 'CLIENT_ALIAS_NAME', 'CLIENT_ALIAS_DOCUMENT')
                            then 'aliases' else 'identifiers' end,
              'list', p_list,
              'alias_type', case p_list when 'CLIENT_ALIAS_NAME' then 'NAME'
                                        when 'CLIENT_ALIAS_DOCUMENT' then 'DOCUMENT' end,
              'identifier_type', case when p_list in ('NAME_VARIANT', 'PIX_KEY', 'BANK_ACCOUNT') then p_list end,
              'max', v_max))::text;
  end if;
end;
$$;

revoke execute on function private.cad_list_limit(text)             from public;
revoke execute on function private.assert_list_limit(text, integer) from public;
```

- As chaves de `NAME_VARIANT`, `PIX_KEY` e `BANK_ACCOUNT` são iguais aos rótulos do enum `receiver_identifier_type` (o `save_receiver` passa `v_type::text`); as do cliente são `'CLIENT_ALIAS_' || v_type::text`.
- Nenhuma das duas é `SECURITY DEFINER` nem recebe `EXECUTE` de `authenticated`: só as implementações `private.save_*` (que rodam como dono) as chamam. O `01_catalog` não muda ("authenticated executa em private somente a lista explícita" continua igual; "toda função `SECURITY DEFINER` fixa o `search_path`" não se aplica e mesmo assim as duas fixam).
- A linha `when '<CHAVE>' then return <N>;` é **formato de contrato**: uma por chave, nessa forma, sem outras linhas parecidas no corpo (o teste de concordância as lê por expressão regular).
- Chave desconhecida ou nula: `XX000` (erro de programação; nunca chega à tela pelo caminho normal).

#### 6.6.3 Onde conferir (dentro do laço de validação de cada `save_*`)

A conferência fica no passo (3) da 6.2 (validação e normalização), **dentro** do laço que já normaliza e reduz os repetidos, logo depois de um valor **distinto** entrar na lista sem repetidos. Assim ela acontece antes de qualquer trava, leitura do dono, aviso de duplicado ou escrita, e com a lista já normalizada.

| Função | Onde, exatamente | Contagem passada |
|---|---|---|
| `save_partner` (`0300`) | no `foreach`, dentro do `if not (v_norm = any (v_norms))`, depois de acrescentar a `v_norms` | `perform private.assert_list_limit('PARTNER_ALIAS', pg_catalog.cardinality(v_norms));` |
| `save_receiver` (`0300`) | no laço de `p_identifiers`, dentro do `if not ((v_type::text \|\| ':' \|\| v_norm) = any (v_keys))`, depois de acrescentar às listas | três contadores inteiros (`v_n_name_variant`, `v_n_pix_key`, `v_n_bank_account`, iniciados em 0); soma 1 ao do tipo e `perform private.assert_list_limit(v_type::text, <contador do tipo>);` |
| `save_client` (`0400`) | no laço de `p_aliases`, dentro do `if not ((v_type::text \|\| ':' \|\| v_norm) = any (v_akeys))`, depois de acrescentar às listas | dois contadores (`v_n_alias_name`, `v_n_alias_document`); soma 1 ao do tipo e `perform private.assert_list_limit('CLIENT_ALIAS_' \|\| v_type::text, <contador do tipo>);` |

Ordem dos erros (determinística, para os testes): (1) `require_admin`; (2) `LIST_REQUIRED`; (3) as validações que hoje vêm antes do laço (nome, titular, documento, mensalidade, observações, sócios nulos no cliente) continuam antes; (4) no laço, os itens são lidos em ordem e o **primeiro** problema encontrado vence: erro de formato ou de valor de um item (`INVALID_IDENTIFIER`, `NAME_REQUIRED`, `NAME_TOO_LONG`, `INVALID_DOCUMENT`, `INVALID_PIX_KEY`…) que aparece **antes** do item que estoura o teto sai primeiro; itens **depois** dele não chegam a ser lidos. Depois do laço, nada muda.

Por que não esperar o fim do laço: a redução de repetidos usa `= any (array)` e `array || item`, que custam proporcional ao quadrado do número de distintos. Parando no primeiro valor acima do teto, o laço nunca guarda mais de 3 (sócio), 5 (cliente) ou 51 (recebedor) distintos, e uma lista de 3.000 itens distintos é recusada no 3.º, 3.º ou 31.º/11.º distinto, em milissegundos (QA-CAD-07). Uma lista de 3.000 **repetidos** do mesmo valor é lida inteira, mas cada item compara com no máximo um valor guardado: custo linear, também em milissegundos, e é gravada como um item só.

#### 6.6.4 Por que não há gatilho nem consulta à tabela

- A escrita nas tabelas filhas só acontece pelas três funções de salvamento (I-18; `authenticated` sem `INSERT`/`UPDATE`), e nenhuma outra função ativa apelido ou identificador (`set_*_active` não mexe nos filhos, 6.5).
- Cada `save_*` trava a linha do dono `for no key update` (edição) e confere a versão (9.2); duas gravações simultâneas do mesmo dono se serializam e a segunda recebe `STALE_VERSION`. No cadastro novo, o dono ainda não é visível a ninguém. Logo, ativos depois da gravação = tamanho da lista conferida, sem corrida.
- Um gatilho por linha (contar os ativos do dono a cada `insert`/reativação) repetiria o erro, cairia na `0200` e custaria uma consulta por item, sem cobrir caso novo. **Fica registrado** (R-D14): feature futura que crie ou reative apelido ou identificador fora dessas três funções (por exemplo, "salvar como apelido" a partir do reconhecimento de um comprovante) **tem de** chamar `private.assert_list_limit` com a contagem de ativos do dono, sob a trava do dono, ou passar pela função de salvamento.
- Dados já gravados: nenhuma migration publicada; no banco local, um `db reset` recria tudo. O pgTAP novo confere que nenhum dono do banco (seed incluído) passa do teto (12.2).

#### 6.6.5 Espelho na aplicação e frases

O banco é a autoridade; a aplicação repete a conferência para dar a mensagem no campo antes de enviar e traduz o `LIST_LIMIT_EXCEEDED` quando ele chega (chamada direta, ou espelho aproximado divergente). Os números moram num lugar só em cada lado: `private.cad_list_limit` (SQL) e `LIST_LIMITS` em `src/domain/cadastros/limits.ts` (TypeScript), com as **mesmas chaves**.

| `list` | Frase (campo do formulário) |
|---|---|
| `PARTNER_ALIAS` | "No máximo 2 apelidos." |
| `CLIENT_ALIAS_NAME` | "No máximo 2 apelidos de nome." |
| `CLIENT_ALIAS_DOCUMENT` | "No máximo 2 apelidos de CPF ou CNPJ." |
| `NAME_VARIANT` | "No máximo 30 formas do nome." |
| `PIX_KEY` | "No máximo 10 chaves Pix." |
| `BANK_ACCOUNT` | "No máximo 10 contas." |
| `detail` ilegível (sem `list` válido) | "A lista passou do limite de itens. Inative algum item e tente novamente." |

- O número da frase vem do `max` do `detail` quando o erro vem do banco, e de `LIST_LIMITS` na validação local; o teste de concordância garante que são iguais.
- As frases seguem o padrão já em uso ("No máximo N …", `limits.ts`) e podem ter a redação ajustada pelo `design-ui-ux` sem mudar chave, número nem `hint`. Na tela, a frase de saída `LIMIT_REACHED_HINT` ("Para adicionar ou reativar, inative ou remova algum item da lista.") continua sendo acrescentada só pela tela, como hoje.
- A contagem do espelho segue a do banco: só itens não vazios, **distintos** pela chave aproximada que a aplicação já tem (`normalizeAlias` no sócio e na forma do nome; `clientAliasKey` no cliente, por tipo; `normalizePixKey`; `accountKey`), e por tipo no cliente e no recebedor. Se o espelho aproximado divergir do banco numa letra fora da tabela de acentos (3.3, `text.ts`), quem decide é o banco, e a frase é a mesma.

**Contrato do lado da aplicação** (só `src/`, `tests/`, `scripts/`):

| Peça | O que muda |
|---|---|
| `src/domain/cadastros/limits.ts` | `export const LIST_LIMITS = { PARTNER_ALIAS: 2, CLIENT_ALIAS_NAME: 2, CLIENT_ALIAS_DOCUMENT: 2, NAME_VARIANT: 30, PIX_KEY: 10, BANK_ACCOUNT: 10 } as const` e `export type ListLimitKey = keyof typeof LIST_LIMITS`. Uma função `listLimitMessage(list: ListLimitKey, max: number): string` monta as frases da tabela acima; as constantes `MAX_*`, as frases `*_LIMIT_MESSAGE` e os objetos `*_LIMIT` passam a derivar de `LIST_LIMITS` e de `listLimitMessage`. `MAX_CLIENT_ALIASES` e `CLIENT_ALIASES_LIMIT` (somados) dão lugar a dois: nome e documento. O comentário do arquivo deixa de dizer "limite técnico" e passa a citar a RAT-D026 e o banco como autoridade |
| `schemas.ts` | `textList` do sócio e `identifiersField` do recebedor contam **valores distintos** (chave da linha acima), não itens brutos; o cliente confere `NAME` e `DOCUMENT` **separadamente**, cada um com a sua frase, no índice do primeiro item acima do teto do tipo (como o recebedor já faz) |
| `client-aliases.ts`, `receiver-identifiers.ts`, `editable-list.ts` e as telas | o botão e a função de **incluir** e também a de **reativar** recusam quando o tipo já está cheio (RAT-D026: "incluir ou reativar exige inativar outro antes"); no cliente, o teto é do tipo do item (2 nomes e 2 documentos), não da lista inteira. A frase de saída `LIMIT_REACHED_HINT` continua só na tela |
| `src/lib/cadastro-errors.ts` | `"LIST_LIMIT_EXCEEDED"` entra em `CADASTRO_HINTS`; em `HINTS`: `sqlstates: ["22023"]`, `code: "VALIDATION"`; o `detail` é lido com `zod` (`{ field?: string; list?: enum das 6 chaves; max?: inteiro positivo; alias_type?: "NAME" \| "DOCUMENT"; identifier_type?: "NAME_VARIANT" \| "PIX_KEY" \| "BANK_ACCOUNT" }`, tudo opcional, sem quebrar se faltar); mensagem `listLimitMessage(list, max)` quando `list` e `max` vêm válidos, senão a frase genérica da tabela; `field` pelo `formField(detail.field)` já existente (`aliases` ou `identifiers`); `details: { hint: "LIST_LIMIT_EXCEEDED", list: ListLimitKey \| null, max: number \| null }` (variante nova de `CadastroErrorDetails`), para a tela marcar a sublista certa (o tipo do apelido no cliente; formas do nome, Pix ou contas no recebedor) |

#### 6.6.6 Prova de que SQL e TypeScript usam os mesmos números

Três elos, sem arquivo compartilhado editado pelos dois desenvolvedores:

1. **SQL texto = SQL em execução** (pgTAP, desenvolvedor do banco): `private.cad_list_limit` devolve 2, 2, 2, 30, 10, 10 para as seis chaves e recusa chave desconhecida; e os comportamentos de 12.2 provam que as funções de salvamento usam esses números.
2. **SQL texto = TypeScript** (Vitest, desenvolvedor da aplicação): `src/domain/cadastros/limits-sql.test.ts` lê `supabase/migrations/20261125000300_cad_partner_receiver_rpcs.sql` (precedente: `src/lib/supabase-config.test.ts` lê `supabase/config.toml`), recorta o corpo de `create function private.cad_list_limit` até o primeiro `$$;` seguinte, extrai os pares pela expressão `/when '([A-Z_]+)'\s+then return (\d+);/g` e exige `toEqual(LIST_LIMITS)` (mesmas seis chaves, mesmos números). Também confere que o texto `hint = 'LIST_LIMIT_EXCEEDED'` aparece na `0300` e conta as ocorrências exatas de `perform private.assert_list_limit(`: 2 na `0300` (sócio e recebedor) e 1 na `0400` (cliente). O teste normaliza `\r\n` para `\n` antes de ler, como o `supabase-config.test.ts`.
3. **Números fixos dos dois lados**: o pgTAP e o Vitest afirmam também os valores literais (2, 2, 2, 30, 10, 10), para que uma mudança silenciosa nos dois lados ao mesmo tempo apareça em revisão.

Testes da aplicação que mudam com os números novos (o desenvolvedor da aplicação confere com `grep` por `50`, `20`, `MAX_` e "No máximo"): `src/domain/cadastros/schemas-limits.test.ts` (hoje afirma `[50, 50, 50, 20, 20]`), `src/app/(app)/clientes/actions.test.ts` ("mais de 50 apelidos"), `tests/e2e/cad-limits.e2e.test.ts` (50/51 apelidos, 20/21 Pix e contas, 50/51 formas do nome; o comentário do cabeçalho também), e qualquer teste unitário ou e2e que grave mais de 2 apelidos por sócio ou 2 por tipo no cliente. Casos novos mínimos: `cadastro-errors.test.ts` com os seis `detail` da 6.3 (frase e `field` de cada um), `detail` sem `list` ou com `max` não numérico (frase genérica) e SQLSTATE diferente de `22023` (não mapeia como este hint); `schemas` com repetidos que não contam duas vezes e com 2 nomes + 2 documentos aceitos e o 3.º de cada tipo recusado; reativação recusada com o tipo cheio; e2e com 2/3 apelidos de sócio, 2+2/3.º de cada tipo no cliente, 10/11 Pix, 10/11 contas e 30/31 formas do nome, e 3.000 itens recusados sem `UNEXPECTED`.

Ordem de trabalho: o formato da 6.6.2 é contrato. O desenvolvedor da aplicação escreve o teste contra esse formato sem esperar; até o desenvolvedor do banco gravar a função na `0300`, só a asserção sobre o arquivo real fica vermelha (o extrator é testado também com um trecho de exemplo dentro do próprio teste). A rodada final, com as três baterias, acontece depois que os dois terminam.

---

## 7. RLS e concessões

### 7.1 Políticas (todas `for select to authenticated`; nenhuma política de escrita)

| Tabela | Política | `using` | Base |
|---|---|---|---|
| `partners` | `partners_select_business` (existente, sem mudança) | `(select private.can_read_business())` | Plano 6: Op/Vis veem o nome dos sócios indicados |
| `partner_aliases` | `partner_aliases_select_admin` | `(select private.is_admin())` | Plano 6 |
| `receivers` | `receivers_select_admin` | `(select private.is_admin())` | Plano 6 (a feature Recebimentos revê a leitura do Operador) |
| `receiver_identifiers` | `receiver_identifiers_select_admin` | `(select private.is_admin())` | Plano 6 |
| `clients` | `clients_select_business` | `(select private.can_read_business())` | Plano 6 |
| `client_partners` | `client_partners_select_business` | `(select private.can_read_business())` | Plano 6 |
| `client_aliases` | `client_aliases_select_business` | `(select private.is_admin()) or (active and (select private.can_read_business()))` | Plano 6 + UI U-C16 (inativos só para o Administrador) |

O papel **Sócio** (`PARTNER`) não passa em `can_read_business()` nem em `is_admin()`: lê zero linhas em todas, e toda função de escrita o recusa com `42501` ([OFICIAL] RAT-D011, RAT-D020; [PENDENTE] P-02b). Usuário sem papel e usuário inativo: idem. `anon`: sem privilégio algum.

### 7.2 Concessões (na migration da feature, nunca `grant all`)

```sql
grant select on public.partner_aliases, public.receivers, public.receiver_identifiers,
                public.clients, public.client_aliases, public.client_partners to authenticated;
-- Nenhum INSERT/UPDATE/DELETE para authenticated (I-18). anon: nada (default privileges da 0500).

-- Invólucros públicos (SECURITY INVOKER)
revoke execute on function public.save_partner(...), public.set_partner_active(...),
  public.save_receiver(...), public.set_receiver_active(...),
  public.save_client(...), public.set_client_active(...),
  public.search_clients(...), public.search_aliases(...) from public;
grant execute on function <as mesmas oito> to authenticated;

-- Implementações (SECURITY DEFINER), alcançadas pelos invólucros
revoke execute on function private.save_partner(...), … (as seis) from public;
grant  execute on function private.save_partner(...), … (as seis) to authenticated;

-- Funções de documento: usadas em CHECK (escrita por postgres/service_role) e em search_clients (authenticated)
revoke execute on function private.normalize_document(text), private.is_valid_cpf(text),
  private.is_valid_cnpj(text), private.is_valid_document(text) from public;
grant execute on function <as mesmas quatro> to authenticated, service_role;

-- Guardas, auxiliares e normalizadores de identificador/apelido: só revoke from public
```

`service_role` mantém os padrões do Supabase nas tabelas novas (como em `partners` hoje, FND 3.6). Escrita direta por ela passa pelos mesmos triggers (invariantes e auditoria com origem `SYSTEM`); nenhuma parte da aplicação usa a chave secreta (P-24). [PROPOSTA]

`TRUNCATE` já nasce revogado de `anon`, `authenticated` e `service_role` pelos default privileges da `0500`; os triggers `before truncate` cobrem o dono.

---

## 8. Auditoria

| Ação | Registros gerados (mesmo `tx_id`) | Motivo |
|---|---|---|
| Criar sócio (`save_partner` novo) | `ROW_CHANGE CREATE partner` + `CREATE partner_alias` por apelido | o informado (a tela não pede, UI 5.2) |
| Editar sócio | `UPDATE partner` (só colunas alteradas) + `CREATE`/`UPDATE partner_alias` por apelido incluído, reativado ou inativado | idem |
| Inativar sócio | `UPDATE receiver` (`active: true → false`) por recebedor da cascata + `UPDATE partner` + `EVENT partner INACTIVATE {"receiver_ids":[…]}` | o do diálogo, gravado em **todas** as linhas da operação ([OFICIAL] RAT-D021) |
| Reativar sócio | `UPDATE partner` | o do diálogo |
| Criar ou editar recebedor | `CREATE`/`UPDATE receiver` + `CREATE`/`UPDATE receiver_identifier` por identificador | o informado |
| Inativar ou reativar recebedor | `UPDATE receiver` | o do diálogo |
| Criar cliente | `CREATE client` + `CREATE client_partner` por sócio + `CREATE client_alias` por apelido + `EVENT client PARTNERS_CHANGE` (de `[]` para a lista) + `EVENT client DUPLICATE_WARNING_ACK` se o aviso foi confirmado | o informado |
| Editar cliente | `UPDATE client` (inclui troca de documento e de mensalidade, com antes/depois) + linhas dos filhos alterados | o do diálogo de sócios/documento, quando houver (UI 4.1.8) |
| **Trocar os sócios do cliente** | `CREATE`/`UPDATE client_partner` por linha + `EVENT client PARTNERS_CHANGE {"previous_partner_ids","new_partner_ids","previous_count","new_count"}` | o do diálogo ([OFICIAL] RAT-D025: "a troca fica na auditoria") |
| Confirmar o aviso de nome repetido | `EVENT client DUPLICATE_WARNING_ACK {"matches":[ids]}` | — |
| Inativar ou reativar cliente | `UPDATE client` | o do diálogo |
| Salvar sem mudança | nada | — |

Campos comuns (FND 3.2): `actor_user_id`, `actor_role`, `source = 'UI'`, `correlation_id`, `request_role`, `created_at` do servidor. Nomes de entidade: `partner` (existente), `partner_alias`, `receiver`, `receiver_identifier`, `client`, `client_alias`, `client_partner`.

**Dados pessoais na auditoria:** documento do cliente, apelido-documento, chave Pix e conta aparecem em `previous_data`/`new_data`. Nenhuma coluna é redigida nesta feature (o plano, seção 7, deixa a redação para a P-20). Se a P-20 pedir redação, basta passar os nomes das colunas no segundo argumento de `audit_row_change` numa migration nova (efeito só para frente). A auditoria só é lida pelo Administrador (FND).

---

## 9. Concorrência e ordem de travas

### 9.1 Requisitos

- Nível de isolamento **READ COMMITTED** (padrão do PostgreSQL e do PostgREST). As checagens dos triggers relêem o banco a cada instrução e enxergam o que outra transação confirmou enquanto esta esperava a trava.
- Nas funções, a trava de linha é `for no key update` (nunca `for update`): não conflita com a `for key share` que as FKs tomam ao incluir filhos, o que evita um impasse entre "renomear sócio" e "incluir apelido do mesmo sócio".

### 9.2 Ordem das travas (para não haver impasse)

`partners` → `clients` → `receivers` → filhos (`client_partners`, `client_aliases`, `partner_aliases`, `receiver_identifiers`) → travas consultivas por valor.

| Operação | Travas, na ordem |
|---|---|
| `save_partner` | sócio (`no key update`) → apelidos → consultiva de nome |
| `set_partner_active(false)` | sócio (`no key update`) → recebedores (pelo `update`). Lê `client_partners` sem travar |
| `save_receiver` / `set_receiver_active(true)` | sócio (`share`) → recebedor (`no key update`) → identificadores → consultivas |
| `save_client` | sócios da lista (`share`, em ordem de `id`) → cliente (`no key update`) → indicações (o trigger trava o cliente de novo, já detido, e o sócio `share`, já detido) → apelidos → consultivas |
| `set_client_active` | cliente (`no key update`) |

Atenção: em `save_client` os sócios são travados **antes** do cliente, para seguir a ordem global. Um impasse residual (ex.: escrita direta por SQL fora dessa ordem) é detectado pelo PostgreSQL (`40P01`); a aplicação mostra "tente novamente" (`UNEXPECTED`).

### 9.3 Cenários concorrentes e o que acontece

| Cenário | Resultado | Mecanismo |
|---|---|---|
| Duas retiradas simultâneas, cada uma do "outro" sócio de um cliente ativo com 2 sócios (CA-07) | a segunda espera a primeira; no `COMMIT`, o trigger diferido vê 0 indicações e recusa (`CLIENT_WITHOUT_PARTNER`) | trava do cliente em `client_partners_prepare` + I-01 diferido |
| Inativar sócio enquanto outra pessoa o indica num cliente | se a indicação travou o sócio antes, a inativação espera e depois vê a indicação (`PARTNER_HAS_CLIENTS`); se a inativação travou antes, a indicação espera e depois vê o sócio inativo (`PARTNER_INACTIVE`) | `share` × `no key update` no sócio + I-02 |
| Inativar sócio enquanto outra pessoa cria um recebedor dele | mesmo raciocínio: `RECEIVERS_CHANGED` ou `PARTNER_INACTIVE` | `share` × `no key update` + I-05, I-06 |
| Dois clientes recebendo o mesmo documento ao mesmo tempo | o segundo espera a trava consultiva e recebe `DOCUMENT_TAKEN` com o dono | `cad.client_document:<doc>` + índice único |
| Mesmo texto como apelido de um sócio e variação de recebedor de outro | o segundo recebe `PARTNER_NAME_TAKEN` | `cad.partner_name:<texto>` |
| Duas pessoas editando o mesmo cliente | a segunda recebe `STALE_VERSION` | trava + `assert_version` |
| Reativar cliente enquanto outra pessoa retira o último sócio | serializados pela trava do cliente; quem chega depois falha | I-01 |

**Teste de concorrência:** pgTAP roda numa sessão só. Os cenários acima são cobertos em sequência no pgTAP (a mesma regra, sem paralelismo) e, em paralelo, por um teste com **duas conexões** ao banco local: `dblink` dentro do pgTAP, se a extensão estiver disponível no ambiente local, ou um teste Vitest de integração com dois clientes `pg`. A escolha é do `desenvolvedor`, registrada em `04-implementacao.md` (12.4).

---

## 10. Plano de migrations

### 10.1 Arquivos e ordem

| Ordem | Arquivo | Conteúdo | Etapa |
|---|---|---|---|
| 1 | `20261125000100_cad_base.sql` | enums `receiver_identifier_type`, `client_alias_type`; `private.normalize_document`, `is_valid_cpf`, `is_valid_cnpj`, `is_valid_document`; `private.normalize_client_alias`, `private.normalize_receiver_identifier`; `private.require_admin`, `private.assert_version`; `revoke`/`grant` dessas funções | E3a |
| 2 | `20261125000200_cad_tables.sql` | as 6 tabelas novas (colunas, constraints, índices); triggers `set_updated_at`, `audit_row_change`, `prevent_mutation` (delete), `prevent_truncate`, `*_prepare`, constraint triggers de I-01; `private.partners_guard` + trigger em `partners`; `private.assert_partner_name_free`, `private.assert_client_document_free`; `enable row level security`; políticas de 7.1; `grant select` de 7.2 | E3a |
| 3 | `20261125000300_cad_partner_receiver_rpcs.sql` | `private.cad_list_limit` e `private.assert_list_limit` (revisão 4, 6.6.2, no começo do arquivo); `save_partner`, `set_partner_active`, `save_receiver`, `set_receiver_active` (`private` + `public`) e concessões | E3a (+ E10, revisão 4) |
| 4 | `20261125000400_cad_client_rpcs.sql` | `save_client` (com a conferência de 6.6.3), `set_client_active`, `search_clients`, `search_aliases` e concessões | E3b (+ E10, revisão 4) |

Revisão 4: as migrations da CAD-001 ainda não foram publicadas, então a RAT-D026 entra **editando a `0300` e a `0400` no lugar** (como a D-19). Nenhuma assinatura pública muda (`save_partner`, `save_receiver`, `save_client` seguem com os mesmos parâmetros e retornos): `src/types/database.types.ts` **não** é regenerado. Se a CAD-001 já tivesse sido publicada, o caminho seria uma migration nova que recria as três implementações em `private`.

As tabelas de cliente entram na **E3a** (arquivo 2), e não na E3b como dizia o plano (8, E3a/E3b): a inativação do sócio (E3a) precisa checar `client_partners` desde o primeiro dia ([OFICIAL] RAT-D025). A E3b fica com as funções de cliente, a matriz de papéis e o catálogo (D-05).

### 10.2 O que muda em `partners` sem quebrar a FND

- **Nenhuma** coluna, tipo, índice ou política existente muda. Nenhuma migration da FND é editada (FND 12.6).
- Entra um trigger novo, `partners_guard` (`before insert or update`). Efeitos sobre o que existe:
  - Testes da FND que inativam sócio direto (`03_profiles`: `current_partner_id()` nulo para sócio inativo) continuam passando, porque esses sócios não têm indicação nem recebedor.
  - Inserções de sócio em fixtures e no `seed.sql` continuam passando, porque não há apelidos nem variações que conflitem.
  - `profiles.partner_id` e `current_partner_id()` não mudam ([PROPOSTA] R-S08).
- O comentário da `0300` ("a feature Sócios acrescenta as políticas de escrita") fica superado: a escrita é por função (D-07). O teste do `02_roles_matrix` "ADMINISTRATOR não grava partners pela API" continua verdadeiro e passa a valer como regra permanente.

### 10.3 Compatibilidade, backfill, validação e rollback

| Tema | Plano |
|---|---|
| Compatibilidade | tudo aditivo; nenhuma coluna existente muda; a aplicação atual (placeholders) não lê as tabelas novas |
| Backfill | **nenhum**. O banco hospedado tem `partners` da FND (com ou sem linhas); linhas existentes não são reescritas e só passam pelo `partners_guard` na próxima escrita. Se houver sócios no hospedado, eles não têm apelidos nem recebedores, logo não há conflito possível no espaço de nomes |
| Validação local | `supabase db reset` + `supabase test db` + `supabase db lint` + `supabase db advisors` (sem alerta novo) + `npm run db:types`; evidências em `04-implementacao.md` (CA-24) |
| Validação no hospedado (E11, pelo responsável) | `supabase migration list` antes e depois; conferir que as 4 migrations aparecem e que `select count(*) from public.clients` responde (0) para o Administrador |
| Rollback antes da publicação | `db reset` local (nada foi aplicado fora) |
| Rollback depois da publicação | migration nova que revoga `execute` dos oito invólucros e o `select` das seis tabelas; a tela volta a `available: false`. Tabelas e dados ficam (nada é apagado, RAT-D012). Nunca editar migration aplicada |

---

## 11. Consultas críticas

### 11.1 Divisão do cliente (`n` e exibição 1/n)

```sql
select c.id, count(cp.*) filter (where cp.active) as split_count
  from public.clients c
  left join public.client_partners cp on cp.client_id = c.id
 where c.id = :client_id
 group by c.id;
```

O percentual exibido (`100 / n`) é calculado na tela e nunca gravado ([OFICIAL] RAT-D015; plano R-C12).

### 11.2 Diálogo de inativação do sócio: clientes que o bloqueiam

```sql
select c.id, c.legal_name, c.active
  from public.client_partners cp
  join public.clients c on c.id = cp.client_id
 where cp.partner_id = :partner_id and cp.active
 order by c.active desc, c.normalized_name;
```

### 11.3 Diálogo de inativação do sócio: recebedores que serão inativados

```sql
select r.id, r.holder_name
  from public.receivers r
 where r.partner_id = :partner_id and r.active
 order by r.normalized_holder_name;
```

Os ids viram `p_confirmed_receiver_ids` (6.4.2).

### 11.4 Aviso de nome repetido (dentro de `save_client`)

```sql
-- :names       = conjunto {normalize_alias(legal_name), normalize_alias(trade_name)} sem nulos/vazios
-- :alias_names = apelidos NAME normalizados da lista final deste cliente (revisão 3, D-20; RAT-D024)
select c.id, c.legal_name, c.document, c.document_type, c.active,
       case when c.normalized_name = any(:names) or c.normalized_trade_name = any(:names)
            then 'SAME_NAME' else 'SAME_ALIAS' end as match
  from public.clients c
 where c.id is distinct from :client_id
   and (c.normalized_name = any(:names)
        or c.normalized_trade_name = any(:names)
        or c.normalized_name = any(:alias_names)        -- apelido deste cliente = nome de outro
        or c.normalized_trade_name = any(:alias_names)  -- apelido deste cliente = fantasia de outro
        or exists (select 1 from public.client_aliases a
                    where a.client_id = c.id and a.active and a.alias_type = 'NAME'
                      and a.normalized_value = any(:names)));
```

Apelido `NAME` deste cliente igual a apelido `NAME` ativo de outro não entra aqui: é bloqueio (`ALIAS_TAKEN`, I-09), não aviso.

### 11.5 Busca de clientes (`search_clients`)

- `q_name := private.normalize_alias(p_query)`; `q_doc := private.normalize_document(p_query)`, usado só se casar `^[0-9A-Z]{1,14}$` (evita curingas de `LIKE`; `normalize_alias` já tira `%` e `_`).
- Casa se `normalized_name like '%' || q_name || '%'`, ou `normalized_trade_name like …`, ou `document like q_doc || '%'`, ou existe apelido **visível** (o RLS de `client_aliases` vale, porque a função é `SECURITY INVOKER`) com `normalized_value like '%' || q_name || '%'` (apelido `NAME`) ou `like q_doc || '%'` (apelido `DOCUMENT`).
- `p_query` vazio: sem filtro de texto. Filtro de situação por `p_status`. Ordem: `normalized_name, id`. `total_count` por `count(*) over ()`. `partner_count` = indicações ativas.
- Revisão 3: o apelido só casa se estiver **ativo** (o resultado não muda conforme o papel; D-IMPL-20). Com `p_partner_id` (D-19): `and exists (select 1 from client_partners cp where cp.client_id = c.id and cp.partner_id = :partner_id and cp.active)`, apoiado em `client_partners_partner_id_idx`.

### 11.6 Dono de um texto (lista consolidada; prévia do reconhecimento)

```sql
-- :t = normalize_alias(texto); :d = normalize_document(texto)
select 'PARTNER_NAME' as kind, p.id as owner_id, p.name as owner_name from public.partners p where p.normalized_name = :t
union all
select 'PARTNER_ALIAS', pa.partner_id, p.name from public.partner_aliases pa join public.partners p on p.id = pa.partner_id
 where pa.active and pa.normalized_value = :t
union all
select 'NAME_VARIANT', r.partner_id, p.name from public.receiver_identifiers ri
  join public.receivers r on r.id = ri.receiver_id join public.partners p on p.id = r.partner_id
 where ri.active and ri.identifier_type = 'NAME_VARIANT' and ri.normalized_value = :t
union all
select 'CLIENT_DOCUMENT', c.id, c.legal_name from public.clients c where c.document = :d
union all
select 'CLIENT_ALIAS', a.client_id, c.legal_name from public.client_aliases a join public.clients c on c.id = a.client_id
 where a.active and ((a.alias_type = 'NAME' and a.normalized_value = :t) or (a.alias_type = 'DOCUMENT' and a.normalized_value = :d));
```

Pelas invariantes I-07 a I-12, cada ramo devolve no máximo um dono por espaço (sócio ou cliente). Nome de cliente pode repetir (R-C06): esse é o único caso com mais de um dono, e vai para revisão humana ([OFICIAL] RAT-D008).

### 11.7 Sócio com login vinculado (UI U-C07)

```sql
select exists (select 1 from public.profiles where partner_id = :partner_id) as has_login;
```

Só o Administrador lê perfis alheios (`profiles_select_own_or_admin`, FND). Nenhuma mudança de banco.

---

## 12. Plano de testes pgTAP

Padrão dos arquivos existentes: um arquivo por tema, `begin; … select plan(n); … rollback;`, usuários de teste em `auth.users` com e-mail `pgtap-*@example.com`, papéis por `private.set_user_access`, troca de usuário com `set local role authenticated` + `set_config('request.jwt.claims', …)`. Fixtures **só com nomes fictícios** ([OFICIAL] RAT-D019).

### 12.1 Mudanças em arquivos existentes (necessárias; o plano dizia "acrescenta, não altera", ver D-06)

| Arquivo | Teste | Mudança |
|---|---|---|
| `01_catalog` | "authenticated executa em public somente as duas RPCs de comprovante" | lista passa a ter as 2 + `save_partner`, `set_partner_active`, `save_receiver`, `set_receiver_active`, `save_client`, `set_client_active`, `search_clients`, `search_aliases` |
| `01_catalog` | "authenticated executa em private somente a lista explícita" | acrescenta as 6 implementações e `normalize_document`, `is_valid_cpf`, `is_valid_cnpj`, `is_valid_document` |
| `01_catalog` | "Três tabelas auditadas na FND" | passa a 9 (as 3 + as 6 novas); o teste "toda tabela auditada tem `id uuid`" continua igual |
| `01_catalog` | "O catálogo enxerga as tabelas da FND" (`>= 4`) | pode ficar; recomenda-se `>= 10` |
| `01_catalog` | "Nenhuma função SECURITY DEFINER exposta em public" | **sem mudança** (tem de continuar passando) |
| `01_catalog` | "authenticated não escreve em nenhuma tabela de public, exceto proof_files" | **sem mudança** (cobre I-18) |
| `02_roles_matrix` | contagens e `plan(n)` | só se o `desenvolvedor` estender este arquivo; a recomendação é deixar a matriz da CAD-001 num arquivo próprio (`10`) |
| `08_cad_partners_receivers` (revisão 4) | "Apelido igual ao nome de outro sócio -> PARTNER_NAME_TAKEN" e o `detail_of` seguinte (hoje com `array['S. Alfa', 'Alfa Rpc', 'Socio Rpc Beta']`, 3 distintos) | a lista passa a `array['S. Alfa', 'Socio Rpc Beta']`; senão o teto (antes da escrita) responde `LIST_LIMIT_EXCEEDED` no lugar de `PARTNER_NAME_TAKEN` |
| `08_cad_partners_receivers` (revisão 4) | "Apelido igual ao nome do PRÓPRIO sócio é aceito" (hoje `array['S. Alfa', 'Alfa Rpc', 'Sócio Rpc Alfa']`) e "O apelido igual ao próprio nome ficou ativo" (espera 3) | a lista passa a `array['S. Alfa', 'Sócio Rpc Alfa']` ('Alfa Rpc' fica inativo) e a contagem esperada passa a **2**, com a descrição ajustada. Os testes seguintes não mudam: `array['S. Alfa']` continua dando (1 ativo, 3 linhas) e `array['S. Alfa', 'ALFA RPC']` continua reativando a mesma linha (2 ativos, 3 linhas) |
| `08_cad_partners_receivers` (revisão 4) | "save_partner: apelidos repetidos viram um só" (`array['S. Alfa', 'Alfa Rpc', 's alfa.']`) | **sem mudança**: são 2 distintos, e o teste passa a provar também que repetido não conta duas vezes |
| `09`, `10`, `11` (revisão 4) | — | conferidos em 27/11/2026: nenhuma chamada passa de 2 apelidos por sócio, 2 `NAME`/2 `DOCUMENT` por cliente ou 30/10/10 por recebedor. Sem mudança |

### 12.2 Arquivos novos

**`07_cad_documents.test.sql`** (E3a): vetores da 12.3 em `normalize_document`, `is_valid_cpf`, `is_valid_cnpj`, `is_valid_document`; `CHECK` de `clients` recusa documento não canônico e DV inválido inserindo como `postgres`; normalização de chave Pix e conta (3.3): aceite de chave com formato de **CPF e de CNPJ** (numérico e alfanumérico), de `+55…`, de e-mail e de chave aleatória; catálogo confirma que nenhuma tabela de recebedor tem coluna de documento (I-17).

**`08_cad_partners_receivers.test.sql`** (E3a), como Administrador, pelas funções públicas:

- `save_partner`: cria com apelidos; nome repetido por grafia (`Sócio Teste A` × `socio teste a.`) → `PARTNER_NAME_TAKEN`; apelido igual ao nome de outro sócio → recusado; apelido igual ao nome do próprio sócio → aceito; retirar um apelido da lista o inativa (linha continua existindo); devolver o mesmo texto reativa a mesma linha (nenhuma linha nova); salvar sem mudança não gera linha em `audit_logs` e não muda `updated_at`; versão antiga → `STALE_VERSION`; sem versão na edição → `VERSION_REQUIRED`.
- `set_partner_active(false)`: com indicação ativa em cliente **ativo** → `PARTNER_HAS_CLIENTS` com a lista; com indicação ativa só em cliente **inativo** → também recusado (RAT-D025); sem indicações e com 2 recebedores ativos confirmados → sócio e os 2 recebedores inativos, `EVENT INACTIVATE` com os ids e o mesmo `tx_id`, motivo gravado em todas as linhas; lista confirmada incompleta → `RECEIVERS_CHANGED`; repetir a inativação → devolve a linha sem escrever. Reativar → recebedores continuam inativos.
- Trigger direto (como `postgres`): `update partners set active = false` com indicação ativa → recusado; com recebedor ativo → `PARTNER_HAS_ACTIVE_RECEIVERS`.
- `save_receiver`: cria com variação, 2 chaves Pix e 2 contas (U-C04); sócio inativo → `PARTNER_INACTIVE`; trocar o sócio → `RECEIVER_PARTNER_IMMUTABLE`; chave Pix ativa de outro recebedor → `IDENTIFIER_TAKEN` com titular e sócio no `detail`; variação igual ao apelido de **outro** sócio → `PARTNER_NAME_TAKEN`; a mesma variação num recebedor do **mesmo** sócio que tem esse apelido → aceita; `update` direto da coluna `value` de um identificador → `IMMUTABLE_FIELD`.
- `set_receiver_active(true)` com sócio inativo → `PARTNER_INACTIVE`.
- `DELETE` e `TRUNCATE` em `partner_aliases`, `receivers`, `receiver_identifiers` recusados (inclusive como `postgres`, pelos triggers).

**`09_cad_clients.test.sql`** (E3b):

- `save_client`: sem documento → aceito; CPF e CNPJ (numérico e alfanumérico) com e sem pontuação → gravados canônicos; `document_type` correto; DV inválido → `INVALID_DOCUMENT`; documento de outro cliente **inativo** → `DOCUMENT_TAKEN` com `{"id","name","active":false}`; documento igual ao apelido `DOCUMENT` ativo de outro cliente → `DOCUMENT_TAKEN`; o inverso (apelido igual ao documento de outro) → `DOCUMENT_TAKEN`; apelido `NAME` ativo de outro cliente → `ALIAS_TAKEN`; apelido inativo de outro cliente não bloqueia.
- Mensalidade: `'1234.56'` grava exatamente `1234.56` (CA-10); `'0'`, `'-1'`, nulo, `''`, `'abc'`, `'1.234'` com 3 casas e `'1000000000000.00'` → `INVALID_AMOUNT`; nenhum caso arredonda; leitura `default_monthly_value::text` devolve `'1234.56'`.
- Sócios: lista vazia em cliente novo → `CLIENT_WITHOUT_PARTNER`; sócio repetido na lista → uma linha só; sócio inativo → `PARTNER_INACTIVE`; retirar e reindicar → mesma linha reativada; trocar sócios gera `EVENT PARTNERS_CHANGE` com antes, depois e contagens; nenhuma coluna de percentual (catálogo).
- Aviso de nome repetido: mesmo nome de outro cliente → `POSSIBLE_DUPLICATE` com a lista e **nada gravado**; repetir com os ids confirmados → grava e cria `EVENT DUPLICATE_WARNING_ACK`; confirmação parcial (faltando um id) → `POSSIBLE_DUPLICATE`; editar só a mensalidade de um cliente com homônimo → sem aviso.
- I-01 em sequência: cliente ativo com 2 sócios; retirar 1 → ok; retirar o último → `CLIENT_WITHOUT_PARTNER`; como `postgres`, `update client_partners set active = false` no último e `set constraints all immediate` → `23514`.
- `set_client_active`: inativar com sócios → ok e indicações seguem ativas; inativo pode ficar sem sócios (`save_client` com lista vazia); reativar sem sócio → `CLIENT_WITHOUT_PARTNER`; reativar com sócio → ok.
- Concorrência otimista: versão antiga → `STALE_VERSION`; mudar só apelidos muda `updated_at` do cliente.
- `search_clients`: por nome sem acento, por nome fantasia, por documento com e sem pontuação, por apelido; filtro de situação; `total_count`.
- `DELETE`/`TRUNCATE` recusados em `clients`, `client_aliases`, `client_partners`.

**`10_cad_roles_matrix.test.sql`** (E3b), para cada papel (Administrador, Operador, Visualizador, Sócio, sem papel, inativo) e `anon`:

| Verificação | Admin | Operador | Visualizador | Sócio / sem papel / inativo | anon |
|---|:-:|:-:|:-:|:-:|:-:|
| `select` em `clients`, `client_partners` | linhas | linhas | linhas | 0 linhas | `42501` |
| `select` em `client_aliases` | ativos e inativos | só ativos | só ativos | 0 | `42501` |
| `select` em `partner_aliases`, `receivers`, `receiver_identifiers` | linhas | 0 | 0 | 0 | `42501` |
| cada uma das 6 funções de escrita | executa | `42501` | `42501` | `42501` | `42501` (sem `EXECUTE`) |
| `search_clients` | linhas | linhas | linhas | 0 linhas | `42501` |
| `search_aliases` | linhas | 0 | 0 | 0 | `42501` |
| `insert`/`update`/`delete` direto nas 6 tabelas | `42501` | `42501` | `42501` | `42501` | `42501` |
| erro de escrita negada não traz `detail` com dados | — | sim | sim | sim | — |

**`11_cad_audit.test.sql`** (E3b): cada função gera os registros da seção 8 com `source = 'UI'`, `actor_user_id`, `actor_role`, `correlation_id` informado; sem motivo → `reason` nulo e a ação conclui; motivo só com espaços → nulo; motivo informado aparece em todas as linhas da mesma transação (cascata e troca de sócios).

**`12_cad_list_limits.test.sql`** (revisão 4, RAT-D026; arquivo novo para não mexer nos `plan(n)` dos outros). Mesmo padrão do `08`/`09`: `begin; … rollback;`, Administrador de teste `pgtap-*@example.com` por `private.set_user_access`, `set local role authenticated` + `request.jwt.claims`, auxiliares `pg_temp.err_of` (devolve `'<sqlstate>|<hint>'` ou `'ok'`) e `pg_temp.detail_of` (devolve o `detail` como `jsonb`) copiadas do `08`. Só nomes, e-mails, chaves e contas fictícios; documentos só dos vetores 12.3 (CPF `000.000.001-91`, `00000000272`, `10000000957`; CNPJ `ZZ0TESTE000100`, `ZZ0TESTE000282`, `12.ABC.345/01DE-35`). Cada caso de erro confere o par `22023|LIST_LIMIT_EXCEEDED` **e** o `detail` inteiro (`is(detail_of(...), '{…}'::jsonb)`).

- **Números (como `postgres`)**: `private.cad_list_limit` devolve `2`, `2`, `2`, `30`, `10`, `10` para `PARTNER_ALIAS`, `CLIENT_ALIAS_NAME`, `CLIENT_ALIAS_DOCUMENT`, `NAME_VARIANT`, `PIX_KEY`, `BANK_ACCOUNT`; chave `'OUTRA'` e nula → `XX000` (`throws_ok`); `provolatile = 'i'` em `cad_list_limit`; nenhuma das duas é `prosecdef`; `authenticated` sem `EXECUTE` nas duas.
- **Sócio** (`save_partner`):
  - 2 apelidos → grava (2 ativos).
  - 3 distintos (novo) → recusado; `detail` = `{"field":"aliases","list":"PARTNER_ALIAS","max":2}`; o sócio não existe depois.
  - repetidos: `array['S. Lim', 's lim.', 'Outro Lim', 'OUTRO LIM!']` → grava 2.
  - inativos não contam: com `['Lim Um','Lim Dois']`, salvar `['Lim Um']` (Dois inativo) → salvar `['Lim Um','Lim Tres']` grava (2 ativos, 3 linhas) → salvar `['Lim Um','Lim Dois','Lim Tres']` → recusado → salvar `['Lim Dois','Lim Tres']` grava e **reativa a mesma linha** de 'Lim Dois' (2 ativos, 3 linhas).
  - conferência antes da trava e da versão: edição com `p_expected_updated_at` antigo **e** 3 distintos → `LIST_LIMIT_EXCEEDED` (não `STALE_VERSION`); `updated_at` e apelidos do sócio inalterados.
  - ordem dentro do laço: `array['A Lim','B Lim','C Lim','']` → `LIST_LIMIT_EXCEEDED`; `array['A Lim','','B Lim','C Lim']` → `NAME_REQUIRED`.
- **Cliente** (`save_client`):
  - 2 `NAME` + 2 `DOCUMENT` (um CPF e um CNPJ) **juntos** → grava (4 ativos: 2 de cada tipo).
  - 3º `NAME` → recusado, `{"field":"aliases","list":"CLIENT_ALIAS_NAME","alias_type":"NAME","max":2}`; 3º `DOCUMENT` → recusado, `{"field":"aliases","list":"CLIENT_ALIAS_DOCUMENT","alias_type":"DOCUMENT","max":2}`.
  - CPF e CNPJ somam no mesmo teto: 1 CPF + 2 CNPJ → recusado (`CLIENT_ALIAS_DOCUMENT`).
  - repetidos: `000.000.001-91` e `00000000191` contam uma vez (com `00000000272`, grava 2 documentos); `Apelido Lim` e `apelido lim.` contam uma vez.
  - o documento do próprio cliente não conta: cliente com `p_document` + 2 apelidos `DOCUMENT` → grava.
  - inativos não contam: com 2 `NAME`, salvar com 1 → salvar com outros 2 (um novo) grava → salvar com 3 → recusado.
  - conferência antes das travas e do aviso: lista com 3 `NAME` e (a) um sócio inativo em `p_partner_ids` → `LIST_LIMIT_EXCEEDED` (não `PARTNER_INACTIVE`); (b) nome igual ao de outro cliente → `LIST_LIMIT_EXCEEDED` (não `POSSIBLE_DUPLICATE`).
- **Recebedor** (`save_receiver`):
  - 30 `NAME_VARIANT` + 10 `PIX_KEY` + 10 `BANK_ACCOUNT` **juntos** → grava (50 ativos; contagem por tipo 30/10/10). Valores gerados com `generate_series` e `jsonb_agg` (`'Forma Lim ' \|\| g`, `'lim.pix' \|\| g \|\| '@example.com'`, conta `('Banco Limite', '0001', (10000 + g)::text \|\| '-1')`).
  - 31ª forma do nome → `{"field":"identifiers","list":"NAME_VARIANT","identifier_type":"NAME_VARIANT","max":30}`; 11ª chave Pix → `…"PIX_KEY"…,"max":10`; 11ª conta → `…"BANK_ACCOUNT"…,"max":10`.
  - repetidos: `Lim.A@Example.com` e `lim.a@example.com`; (`Banco Limite`, `0001`, `12345-6`) e (`banco limite`, `1`, `123456`) contam uma vez cada (com 9 outras chaves, grava 10 chaves).
  - inativos não contam: com 10 chaves, salvar com 9 → salvar com 9 + uma nova grava → salvar com as 10 + a retirada → recusado.
  - edição com versão antiga **e** 11 chaves → `LIST_LIMIT_EXCEEDED` (não `STALE_VERSION`).
- **Lista enorme, sem estouro de tempo** (QA-CAD-07): antes do bloco, `set local statement_timeout = '2s'`; depois, `set local statement_timeout = 0`. Com 3.000 itens distintos: `save_partner` (`array_agg('Apelido Massa ' \|\| g)`), `save_client` (3.000 `NAME`) e `save_receiver` (3.000 `PIX_KEY`) → `22023|LIST_LIMIT_EXCEEDED`, sem `57014` (o `57014` não é capturado pelo `err_of`, porque `when others` não pega `query_canceled`: o arquivo falharia de forma visível). Com 3.000 repetições do mesmo valor: `save_partner` e `save_receiver` (Pix) → gravam **1** item.
- **Dados do banco dentro do teto** (como `postgres`, no fim do arquivo, cobrindo o seed e o que o arquivo criou): 0 linhas em

```sql
select x.list, x.owner, x.n from (
  select 'PARTNER_ALIAS' as list, partner_id as owner, count(*) as n
    from public.partner_aliases where active group by partner_id
  union all
  select 'CLIENT_ALIAS_' || alias_type::text, client_id, count(*)
    from public.client_aliases where active group by client_id, alias_type
  union all
  select identifier_type::text, receiver_id, count(*)
    from public.receiver_identifiers where active group by receiver_id, identifier_type
) x where x.n > private.cad_list_limit(x.list);
```

Cuidado com os valores entre casos do mesmo arquivo: uma chave Pix, conta ou forma do nome **ativa** num recebedor bloqueia o mesmo valor em outro (`IDENTIFIER_TAKEN`, I-12), e uma forma do nome não pode coincidir com nome ou apelido de outro sócio (`PARTNER_NAME_TAKEN`, I-11). Use prefixos distintos por caso (`Lim A`, `Lim B`…) ou o mesmo recebedor.

### 12.3 Vetores compartilhados (pgTAP e Vitest)

Fictícios, gerados para teste. Não usar no seed os de CPF e o numérico (R-12 do plano). O exemplo da nota técnica deve ser conferido no texto oficial (3.1).

| Entrada | Esperado |
|---|---|
| `12.ABC.345/01DE-35` | canônico `12ABC34501DE35`, CNPJ válido (exemplo da nota técnica) |
| `zz0teste000100` | canônico `ZZ0TESTE000100`, CNPJ válido |
| `ZZ0TESTE000282` | CNPJ válido |
| `ZZ0TESTE000101` | inválido (DV) |
| `ZZ0TESTE0001A0` | inválido (DV com letra) |
| `ZZ0TESTE00010` (13) | inválido (tamanho) |
| `ÁZ0TESTE000100` | inválido (caractere) |
| `99.999.999/0001-91` | canônico `99999999000191`, CNPJ numérico válido |
| `00000000000000` / `AAAAAAAAAAAAAA` | inválido (repetidos) |
| `000.000.001-91` | canônico `00000000191`, CPF válido |
| `00000000272`, `10000000957` | CPF válido |
| `00000000192` | inválido (DV) |
| `11111111111` | inválido (repetidos) |
| `''`, `' ./- '` | `normalize_document` → `NULL` |

Chave Pix: `Socio.A@Example.com` → `socio.a@example.com`; `+55 (23) 91234-5678` → `+5523912345678`; `123E4567-E89B-42D3-A456-426614174000` → `123e4567e89b42d3a456426614174000`; `000.000.001-91` → `00000000191` (aceita como chave Pix); `12.ABC.345/01DE-35` → `12abc34501de35` (aceita). Conta: (`Banco Exemplo`, `0001`, `12345-6`) → `banco exemplo|1|123456`.

Tetos de itens ativos (revisão 4, [OFICIAL] RAT-D026; SQL em `private.cad_list_limit`, TypeScript em `LIST_LIMITS`; prova em 6.6.6):

| Chave | Máximo |
|---|---|
| `PARTNER_ALIAS` | 2 |
| `CLIENT_ALIAS_NAME` | 2 |
| `CLIENT_ALIAS_DOCUMENT` | 2 |
| `NAME_VARIANT` | 30 |
| `PIX_KEY` | 10 |
| `BANK_ACCOUNT` | 10 |

### 12.4 Concorrência

Cenários da 9.3 com duas conexões (dblink no pgTAP ou Vitest com dois clientes `pg` no banco local). Mínimo: duas retiradas simultâneas (CA-07) e inativação de sócio × indicação simultânea.

---

## 13. Seed local (`supabase/seed.sql`)

Acrescentar, depois dos três sócios existentes e na **mesma transação** com o `set_audit_context` já presente (o trigger diferido de I-01 só confere no `COMMIT`, então cliente e indicações entram juntos). Inserção direta como `postgres` (o seed não tem `auth.uid()`; as funções de escrita exigem Administrador). Todos os nomes, e-mails, chaves e contas são fictícios ([OFICIAL] RAT-D019); nenhum percentual ([OFICIAL] RAT-D015); nenhum CPF ([PROPOSTA], R-12 do plano).

| Tabela | Linhas sugeridas |
|---|---|
| `partner_aliases` | "S. Exemplo A" (sócio A); "Exemplo B" (sócio B) |
| `receivers` | "Sócio Exemplo A" (A); "Exemplo A Serviços Ltda" (A); "Sócio Exemplo B" (B); "Sócio Exemplo C" (C, **inativo**, para a tela de inativos) |
| `receiver_identifiers` | variação "Socio Ex A" (1º recebedor de A); chave Pix `socio.a@example.com` (A); chave aleatória `00000000-0000-4000-8000-0000000000a1` (B); conta "Banco Exemplo", agência "0001", conta "12345-6" (2º recebedor de A) |
| `clients` | "Cliente Modelo Ltda", CNPJ `ZZ0TESTE000100`, `1500.00`, sócios A e B; "Comércio Fictício Ltda", CNPJ `ZZ0TESTE000282`, `900.00`, sócios A, B e C; "Pessoa Exemplo", sem documento, `350.00`, sócio C; "Cliente Antigo Ltda", sem documento, **inativo**, sem sócios |
| `client_partners` | conforme acima (2, 3 e 1 sócios: exibe 1/2, 1/3 e 1/1) |
| `client_aliases` | "Modelo" (`NAME`) no primeiro cliente |

Com os sócios A, B e C indicados em clientes, nenhum deles pode ser inativado no seed; o QA cria um sócio próprio para testar a inativação.

Revisão 4 (RAT-D026): o `seed.sql` atual (conferido em 27/11/2026) está dentro dos tetos: 1 apelido por sócio (A e B), no máximo 1 identificador por tipo em cada recebedor e 1 apelido `NAME` no primeiro cliente. **Sem mudança.** Quem acrescentar linhas ao seed respeita a tabela de 6.6.1; o pgTAP `12` confere (12.2, último item).

---

## 14. Riscos de dados

| ID | Risco | Tipo | Severidade | Mitigação |
|---|---|---|---|---|
| R-D01 | Duas sessões deixarem cliente ativo sem sócio | concorrência | Média → Baixa | I-01 diferido + trava do cliente (9.3); teste com duas conexões (12.4) |
| R-D02 | Sócio inativado com indicação ou recebedor ativo por corrida | concorrência | Média → Baixa | `share` × `no key update` + checagem no trigger depois da trava (9.3) |
| R-D03 | Conflito falso em toda edição por perda de microssegundos no token | inconsistência | Média | contrato 6.2 (texto, sem `Date`); teste e2e de edição dupla |
| R-D04 | Cliente duplicado sem documento | duplicação | Média | aviso R-C15 com confirmação auditada (6.4.5); busca por nome e apelido |
| R-D05 | A mesma conta cadastrada com e sem dígito da agência | duplicação | Baixa | orientação na tela; reconhecimento compara variantes (3.3) |
| R-D06 | Espelho TS do DV divergir do banco | inconsistência | Baixa | vetores compartilhados (12.3); o banco é a autoridade |
| R-D07 | Dados pessoais (CPF de cliente, apelido-documento, chave Pix que pode ser CPF, conta) visíveis sem máscara e na auditoria sem redação | privacidade | Média | escolha do responsável ([OFICIAL] RAT-D023: "Ver completo"; RAT-D020); leitura limitada pela matriz (chaves e contas só para o Administrador; a auditoria também); redação aditiva se a P-20 pedir (seção 8); P-20 antes de dados reais |
| R-D08 | Mensalidade lida como número JSON e tratada como float na aplicação | inconsistência | Média | leitura sempre em texto (`::text`; `search_clients` devolve `text`), conforme 2.8; teste e2e com valor como `0.10` e `1234.56` |
| R-D10 | Impasse (`40P01`) em escrita fora da ordem de travas | concorrência | Baixa | ordem 9.2 nas funções; o PostgreSQL desfaz uma das transações; a aplicação pede nova tentativa |
| R-D11 | Duplo clique em "Salvar" no cadastro novo criar dois registros | duplicação | Baixa | botão desabilitado durante o envio (UI). Cliente com documento: o segundo envio recebe `DOCUMENT_TAKEN`. Cliente sem documento: o segundo envio recebe `POSSIBLE_DUPLICATE`, porque o registro criado pelo primeiro não estava na lista confirmada. Sócio: `PARTNER_NAME_TAKEN`. Recebedor: pode duplicar se não tiver identificadores; baixo impacto (inativa-se o repetido) |
| R-D12 | Volume crescer e a busca por "contém" ficar lenta | performance | Baixa | uso interno, centenas de linhas; `pg_trgm` como evolução |
| R-D13 | Identificador ou apelido de dono inativo bloquear o mesmo valor para outro cadastro | atrito | Baixa | comportamento intencional (6.5); a mensagem traz o dono e o link para inativar o item |
| R-D14 (revisão 4) | Caminho de escrita futuro (fora de `save_*`) ativar apelido ou identificador sem conferir o teto da RAT-D026 | inconsistência | Baixa | hoje não existe outro caminho (I-18, 6.5); regra registrada em 6.6.4: chamar `private.assert_list_limit` sob a trava do dono ou passar pela função de salvamento; o pgTAP `12` confere os dados do banco |
| R-D15 (revisão 4) | Espelho TS e SQL com números diferentes (a tela deixa passar, o banco recusa, ou o contrário) | inconsistência | Baixa | uma fonte por lado (`cad_list_limit`, `LIST_LIMITS`) e o teste de concordância que lê a migration (6.6.6); a frase do erro do banco usa o `max` do `detail` |
| R-D16 (revisão 4) | Banco local com cadastro acima do teto (criado na validação com os limites antigos de 50/20) não conseguir salvar sem antes reduzir a lista | atrito | Baixa | só no ambiente local; `supabase db reset` recria do seed (dentro do teto). Nada publicado. Em produção não há dado anterior |

---

## 15. Divergências (para o `engenheiro-software` registrar; nada foi editado no plano, no Brain ou na FND)

| ID | Onde | Divergência | Recomendação |
|---|---|---|---|
| D-01 | — | **Retirada na revisão 2.** A revisão 1 usava centavos `bigint` por leitura errada do pedido; o orquestrador esclareceu que "em centavos" significava "nunca float". A mensalidade segue a convenção da FND (`numeric(14,2)`, `private.to_money`, texto decimal nas fronteiras; 2.8). Plano R-C07 e CA-10 valem sem mudança | Nenhuma |
| D-02 | Plano 4.3 ("uma função por ação") | Funções de **salvamento** por cadastro (tudo ou nada), por causa do "Salvar" único da UI (U-C01) | Atualizar o plano 4.3 e os critérios que citam ações separadas |
| D-03 | Plano 4.2 (`document` "como digitado" + `normalized_document` gerada) | Uma coluna `document`, só canônica; `document_type` gerado | Atualizar o plano 4.2 |
| D-04 | Plano R-R03 (observação do recebedor) e R-R04 (identificador "documento do titular") | Removidos pela RAT-D023; a UI também tirou a observação (U-C15) | Marcar R-R03 e R-R04 como superadas |
| D-05 | Plano 8 (E3a/E3b) | Tabelas de cliente vão para a E3a (a inativação do sócio precisa delas); E3b fica com as funções de cliente, matriz e catálogo | Ajustar a tabela de etapas |
| D-06 | Plano 2 ("a CAD-001 acrescenta, não altera" os testes) | O `01_catalog` tem listas fechadas e **precisa** ser estendido (12.1) | Registrar como mudança esperada |
| D-07 | Migration `0300` (comentário sobre "políticas de escrita do Administrador") | Escrita por função `SECURITY DEFINER`, sem política de escrita | Nenhuma ação (o comentário fica como histórico; não editar a migration) |
| D-08 | — | **Retirada na revisão 2**: a chave Pix CPF/CNPJ é aceita ([OFICIAL] RAT-D023), como já dizia a UI 7.1 | Nenhuma |
| D-09 | UI 4.1.3 ("convertido sem float pelo servidor") | O Next (Server Action) analisa "1.234,56" sem float e envia o texto decimal `"1234.56"`; o banco converte com `private.to_money` | Só esclarecimento |
| D-10 | FND 2.4 (`receiver_identifiers` com `DOCUMENT`, `BANK_NAME`, `ALIAS`; `partner_aliases` e `client_aliases` com `TRADE_NAME`, `OTHER`) | Tipos reduzidos (2.3) | Nada a fazer na FND; esta modelagem prevalece para a CAD-001 |
| D-11 | 6.3, 6.4.3, 6.4.5 · origem **D-IMPL-09 (a)**, P-IMPL-06, D-IMPL-15 | Hint novo `INVALID_IDENTIFIER` (`22023`) para lista JSON fora do formato em `save_receiver` (`p_identifiers`) e `save_client` (`p_aliases`), com `{"field":"identifiers"\|"aliases"}` | Incorporado na revisão 3 (6.3). Já tratado no `mapDatabaseError` (E4) |
| D-12 | 6.3, 6.4.2 · origem **D-IMPL-09 (b)**, P-IMPL-06 | Hint novo `ACTIVE_REQUIRED` (`22023`) para `p_active` nulo nas três `set_*_active`, sem `detail` | Incorporado na revisão 3 |
| D-13 | 6.2, 6.3, 6.4.1, 6.4.3, 6.4.5 · origem **D-IMPL-14** e D-IMPL-15 (substituem a D-IMPL-10) | Listas de estado final nulas recusadas com o hint novo `LIST_REQUIRED` (`22023`, `{"field":…}`; JSON `null` também nas listas `jsonb`); listas de confirmação (`p_confirmed_receiver_ids`, `p_acknowledged_duplicate_ids`) com nulo = vazio. Decisão do orquestrador na E3b: nula inativaria todos os itens por descuido | Incorporado na revisão 3. A aplicação envia sempre a lista, mesmo vazia |
| D-14 | 6.3, 6.4.7, 11.5 · origem **D-IMPL-15**, D-IMPL-20 | Hint novo `INVALID_FILTER` (`22023`, `{"field":"status"\|"kind"\|"limit"\|"offset"}`) nas buscas; nulo em situação, limite e deslocamento vale o padrão; em `search_clients` o apelido só casa se ativo | Incorporado na revisão 3 |
| D-15 | 6.3, 6.4.3, 6.4.5 · origem **D-IMPL-09 (c)**, D-IMPL-15 | `NOT_FOUND` ganha `detail` `{"field":"partner_id"}` (`save_receiver` novo) ou `{"field":"partner_ids"}` (`save_client`) quando o inexistente é uma referência; sem `detail` quando é o próprio cadastro | Incorporado na revisão 3 |
| D-16 | 6.3, 4.2 · origem **P-E4-01**, D-E4-01, D-E5b-01 | `IDENTIFIER_TAKEN` ganha `identifier_type` no `detail`, para a frase por tipo da UI 7.2 (sem ele, a E4 só tinha uma frase genérica) | Incorporado na revisão 3. Encerra P-E5b-02 |
| D-17 | 6.1, 6.3 · origem **D-IMPL-01** | `assert_version` é `STABLE` (não `IMMUTABLE`) e grava o `detail` `{"current_updated_at":…}` de `STALE_VERSION`, que o rascunho de 6.1 não trazia | Incorporado na revisão 3 (código de 6.1 atualizado) |
| D-18 | 4.2 · origem **D-IMPL-02** | `assert_partner_name_free` e `assert_client_document_free` ganham o 3.º parâmetro `p_field text` (padrão `'name'` e `'document'`), que só preenche o `field` do `detail`. A assinatura de 2 parâmetros não existe mais | Incorporado na revisão 3. Regra sem mudança; o `revoke` usa `(text, uuid, text)` |
| D-19 | 6.4.7, 11.5 · origem **P-E4-02** (opção A), D-E6a-01 | `search_clients` ganha o 5.º parâmetro `p_partner_id uuid default null` (clientes com indicação ativa do sócio). Migration `0400` editada no lugar, ainda não publicada | Incorporado na revisão 3. Chamadas posicionais antigas seguem válidas |
| D-20 | 6.3, 6.4.5, 11.4 · origem **D-IMPL-17** / P-IMPL-08, respondidas pela **RAT-D024** (responsável, 26/11/2026); D-E6a-01, D-E6a-02 | `POSSIBLE_DUPLICATE` também quando um apelido `NAME` do cliente é igual ao nome ou ao nome fantasia de outro cliente; `match = 'SAME_ALIAS'`; mesma confirmação por `p_acknowledged_duplicate_ids` | Incorporado na revisão 3. A comparação com o nome fantasia é [OFICIAL] RAT-D024 (o responsável escolheu "O do plano/código" em 26/11/2026; PEND-M3 encerrada) |
| D-21 | 6.3, 4.2, 10.1 · origem **D-E5b-01** | O `raise` de `IDENTIFIER_TAKEN` (frase e `detail`) mora no gatilho `receiver_identifiers_prepare`, na migration `0200`, e não na `0300` (`save_receiver` só o alcança pela escrita). O mesmo vale para `ALIAS_TAKEN`, `PARTNER_NAME_TAKEN` e `DOCUMENT_TAKEN` | Registrado na revisão 3 (nota em 6.3). Mudanças futuras nesses erros vão para a `0200` ou para migration nova que recria a função |
| D-22 | 4.1 (I-19), 6.2, 6.3, 6.4, 6.6, 12, 13 · origem **QA-CAD-07** e **[OFICIAL] RAT-D026** (responsável, 27/11/2026) | O teto de itens existia só na aplicação, como limite técnico de proteção (50 apelidos de sócio, 50 de cliente somados, 50 formas do nome, 20 Pix, 20 contas). Vira regra de negócio com outros números (2; 2 `NAME` + 2 `DOCUMENT`; 30; 10; 10), garantida no banco (hint novo `LIST_LIMIT_EXCEEDED`, `22023`) e espelhada na aplicação. No cliente, o teto passa a ser **por tipo** | Incorporado na revisão 4. O plano da CAD-001 registra a RAT-D026 (pedido do responsável: "Plano e Brain"); o Brain já foi atualizado pelo orquestrador |

---

## 16. Pendências

| ID | Pergunta (linguagem simples) | Recomendação | Bloqueia? |
|---|---|---|---|
| PEND-M1 | Chave Pix que é CPF ou CNPJ | **Respondida** pelo responsável: "Aceitar como chave Pix" ([OFICIAL] RAT-D023). Guardada só como chave Pix (3.3) | Encerrada |
| PEND-M2 | Teto de negócio da mensalidade | **Encerrada** pelo orquestrador: só o limite técnico de `numeric(14,2)`, sem pergunta ao responsável | Encerrada |
| U-C05 | Máscara de CPF, chave Pix e conta | **Respondida** pelo responsável: "Ver completo" ([OFICIAL] RAT-D023). Sem máscara; leitura limitada pela matriz (seção 7) | Encerrada |
| P-20 | LGPD (CPF de cliente, chave Pix, conta, auditoria sem redação) | Antes de dados reais | Não bloqueia a implementação |
| P-02b | Escopo do login do sócio | Hoje negado em tudo | Não |
| M-01 | Momento do snapshot do rateio | Feature Rateio | Não |
| P-IMPL-06 / P-E4-03 | Hints `INVALID_IDENTIFIER`, `ACTIVE_REQUIRED`, `LIST_REQUIRED`, `INVALID_FILTER` e o `detail` do `NOT_FOUND` fora da tabela 6.3 | **Resolvida na revisão 3** (6.3; D-11 a D-15) | Encerrada |
| P-E5b-02 | `identifier_type` fora do `detail` de `IDENTIFIER_TAKEN` na tabela 6.3 | **Resolvida na revisão 3** (6.3; D-16) | Encerrada |
| P-IMPL-08 | Apelido `NAME` igual ao nome de outro cliente deve avisar? | **Respondida** pelo responsável em 26/11/2026 ([OFICIAL] RAT-D024): sim. Incorporada em 6.4.5 e 11.4 (D-20) | Encerrada |
| PEND-M3 | A primeira redação da RAT-D024 limitava o primeiro caso do aviso a "um cliente **sem documento**", mas a função avisa também quando o cliente tem documento (D-IMPL-18) e compara os nomes por igualdade depois de normalizar | **Resolvida** pelo responsável em 26/11/2026 ([OFICIAL] RAT-D024, já corrigida no Brain): escolheu "O do plano/código". `POSSIBLE_DUPLICATE` vale para qualquer cliente, com ou sem documento, quando o nome normalizado é igual, e também quando um apelido do cliente é igual ao nome ou ao nome fantasia de outro cliente. O nome fantasia conta como nome. O código não muda | Encerrada |

Todas as perguntas da UI dirigidas à modelagem (U-C01 a U-C04, U-C07, U-C13, U-C16) foram respondidas na seção 6.0.

---

## 17. Handoff ao desenvolvedor

### 17.1 E3a (migrations 1 a 3)

- [ ] `20261125000100_cad_base.sql`: enums (2.3); funções de documento (3.2) e de normalização (3.3); `require_admin` e `assert_version` (6.1); `revoke`/`grant` (7.2).
- [ ] `20261125000200_cad_tables.sql`: tabelas 2.5 a 2.10 com as constraints; índices da seção 5; em cada tabela, `set_updated_at`, `audit_row_change('<entidade>')`, `prevent_mutation` no `DELETE`, `prevent_truncate`; guardas da 4.2 (`SECURITY DEFINER`, `search_path = ''`); constraint triggers diferidos de I-01; `partners_guard` em `partners` **sem alterar** colunas; RLS e políticas da 7.1; `grant select` da 7.2.
- [ ] Nos triggers `BEFORE`, normalizar a partir das colunas de origem (colunas geradas ainda não existem nesse momento, 3.3).
- [ ] `20261125000300_cad_partner_receiver_rpcs.sql`: `save_partner`, `set_partner_active`, `save_receiver`, `set_receiver_active` em `private` (`SECURITY DEFINER`) e em `public` (invólucro `SECURITY INVOKER`), na ordem de passos da 6.2 e de travas da 9.2; erros com `hint` e `detail` da 6.3.
- [ ] pgTAP `07` e `08`; vetores 12.3.
- [ ] Registrar o `EXPLAIN` da checagem cruzada de I-11 (5).

### 17.2 E3b (migration 4 e testes)

- [ ] `20261125000400_cad_client_rpcs.sql`: `save_client`, `set_client_active`, `search_clients`, `search_aliases` (6.4.5 a 6.4.7; consultas 11.4 a 11.6).
- [ ] pgTAP `09`, `10`, `11`; atualizar `01_catalog` (12.1).
- [ ] Teste de concorrência com duas conexões (12.4).
- [ ] `seed.sql` (13).
- [ ] `db reset` + `db test` + `db lint` + `db advisors` + `npm run db:types`; evidências em `04-implementacao.md`.

### 17.3 E4 (servidor)

- [ ] Estender `mapDatabaseError` para ler `hint` e `details` (6.3); mensagens em português numa tabela fixa; `details` validado com `zod` antes de usar.
- [ ] Espelho TS de `normalize_document` e do DV com os vetores da 12.3 no Vitest.
- [ ] Análise do valor digitado sem `parseFloat` ("1.234,56" → texto `"1234.56"`; "1234.56" digitado recusado, conforme UI 4.1.3); centavos inteiros só para conta interna na aplicação; envio ao banco e leitura (`::text`) sempre em texto decimal (2.8).
- [ ] Token `updated_at` tratado como `string` do começo ao fim (6.2).
- [ ] Chamar sempre o invólucro `public.<nome>` com `p_correlation_id` do `request-context`.

### 17.4 Revisão 4: limites de itens (RAT-D026), dois desenvolvedores ao mesmo tempo

Divisão: o **desenvolvedor do banco** mexe só em `supabase/` (migrations `0300` e `0400` da CAD-001, pgTAP e `seed.sql`); o **desenvolvedor da aplicação** mexe só em `src/`, `tests/` e `scripts/`. Nenhum arquivo é editado pelos dois. O único ponto de contato é o texto de `private.cad_list_limit` na `0300`, que o banco **cria** e a aplicação só **lê** no teste (6.6.6), no formato fixado em 6.6.2.

Banco:

- [ ] `0300`: criar `private.cad_list_limit` e `private.assert_list_limit` no começo do arquivo, exatamente como 6.6.2 (com os `revoke`).
- [ ] `0300`: `save_partner` e `save_receiver` chamam `assert_list_limit` no laço, como 6.6.3. `0400`: `save_client` idem, por tipo.
- [ ] Atualizar o cabeçalho de comentários da `0300` e da `0400` (fonte: revisão 4, 6.6). Nenhuma assinatura muda; nenhuma outra migration é editada.
- [ ] pgTAP: ajustes do `08` (12.1, revisão 4) e arquivo novo `12_cad_list_limits.test.sql` (12.2).
- [ ] `seed.sql`: sem mudança (13).
- [ ] `supabase db reset` + `supabase test db` + `supabase db lint`; **não** rodar `npm run db:types` (nada público mudou).

Aplicação:

- [ ] `limits.ts`: `LIST_LIMITS` com as seis chaves e números da 6.6.1; constantes e frases derivadas; teto do cliente por tipo; comentário passa de "limite técnico" para "regra de negócio, RAT-D026".
- [ ] `schemas.ts`, `client-aliases.ts`, `receiver-identifiers.ts`, telas: contagem por valor distinto e por tipo; incluir **e reativar** recusados com o tipo cheio (6.6.5).
- [ ] `cadastro-errors.ts`: hint `LIST_LIMIT_EXCEEDED`, leitura do `detail` com `zod`, frase por `list` com o `max` do `detail`, variante nova de `CadastroErrorDetails` (6.3, 6.6.5).
- [ ] Teste de concordância `limits-sql.test.ts` (6.6.6) e ajustes dos testes que usam os números antigos, inclusive `tests/e2e/cad-limits.e2e.test.ts` (6.6.6).

### 17.5 Não fazer

- [ ] Nenhum `INSERT`/`UPDATE`/`DELETE` concedido a `authenticated` nas tabelas novas.
- [ ] Nenhuma função `SECURITY DEFINER` em `public`.
- [ ] Nenhuma coluna de percentual, peso, vigência, documento de sócio ou documento de titular.
- [ ] Nenhuma edição das migrations `20261023000100` a `20261023000500`, do Brain, do plano ou dos documentos da FND.
- [ ] Nenhum motivo obrigatório (RAT-D021).
- [ ] Nenhuma migration aplicada fora do ambiente local.

---

## 18. Gate G1

**APTA PARA IMPLEMENTAÇÃO**, com as condições abaixo.

Fundamentos (critério do agente):

1. **Perda de dados:** nenhuma. Tudo é aditivo; `partners` não muda de colunas; não há backfill; nenhuma exclusão física é possível nas 7 tabelas.
2. **Cardinalidades definidas** (2.1): recebedor N:1 sócio obrigatório e imutável; identificadores e apelidos 1:N com unicidade do valor ativo; cliente N:N sócio com uma linha por par; cliente ativo com 1..N indicações ativas.
3. **Regras financeiras:** a CAD-001 não calcula nada. A mensalidade é `numeric(14,2)`, > 0, convertida sem arredondar por `private.to_money` ([OFICIAL] RAT-D025; convenção da FND); a divisão é só a contagem de indicações ativas, sem percentual ([OFICIAL] RAT-D015); a troca de sócios vale dali em diante e fica auditada ([OFICIAL] RAT-D025, RAT-D009), com o snapshot por recebimento a cargo da feature Rateio ([OFICIAL] RAT-D006).
4. **Regras do G0 garantidas no banco, mesmo se a aplicação falhar:** cliente ativo com ≥ 1 sócio (I-01), sócio indicado em qualquer cliente não é inativado (I-02), recebedores inativados junto e só com confirmação (I-05, I-06), documento único entre ativos e inativos (I-07), sem documento de sócio nem de titular (I-17).

Condições:

- Revisão 2: PEND-M1, PEND-M2 e U-C05 encerradas; D-01 e R-D09 retiradas (mensalidade na convenção da FND). Nenhuma pendência da modelagem bloqueia a implementação.
- Revisão 3: o contrato (6.3, 6.4, 11.4, 11.5) foi alinhado às migrations `20261125000100` a `0400` (D-11 a D-21). Nenhuma tabela, coluna, constraint ou índice mudou; só funções e o `detail` dos erros. P-E4-03, P-E5b-02, P-IMPL-08 e PEND-M3 encerradas (PEND-M3 pela RAT-D024, "O do plano/código", 26/11/2026). Nenhuma pendência da modelagem fica aberta na CAD-001, além das que já existiam e não bloqueiam (P-20, P-02b, M-01).
- O exemplo da nota técnica do CNPJ alfanumérico deve ser conferido no texto oficial antes de entrar no teste (3.1).
- Revisão 4: a RAT-D026 entra como I-19, garantida no banco no começo das três funções de salvamento (6.6), com hint novo `LIST_LIMIT_EXCEEDED`. Nenhuma tabela, coluna, constraint, índice ou assinatura pública muda; não há backfill (nada publicado; seed dentro do teto). Sem pendência nova: números, contagem por tipo no cliente e "só ativos" estão na RAT-D026.
- A revisão de `seguranca` (E8) deve olhar em especial: as seis funções `SECURITY DEFINER` em `private` alcançadas pelos invólucros (6.1), o `detail` com dados do dono (6.3, U-C02) e a ausência de redação de dados pessoais na auditoria (seção 8).

---

## Histórico de revisão

| Revisão | Data | Mudança |
|---|---|---|
| 1 | 25/11/2026 | Primeira versão. Incorpora RAT-D023 a RAT-D025 e as respostas às perguntas U-C01 a U-C04 da UI (salvamento único, `detail` do dono, tipos de apelido, várias chaves e contas por recebedor) |
| 2 | 25/11/2026 | Ajustes do orquestrador: mensalidade volta à convenção da FND (`default_monthly_value numeric(14,2)`, `> 0`, `private.to_money`, texto decimal nas fronteiras; D-01 e R-D09 retiradas; CA-10 sem mudança); chave Pix CPF/CNPJ aceita e guardada só como chave Pix (PEND-M1 respondida, RAT-D023); nada mascarado para Operador e Visualizador (U-C05, RAT-D023); PEND-M2 encerrada com o limite técnico. G1 segue apto |
| 3 | 26/11/2026 | Alinhamento ao que a implementação acrescentou ao contrato, conferido nas migrations `20261125000100` a `0400`: hints `INVALID_IDENTIFIER`, `ACTIVE_REQUIRED`, `LIST_REQUIRED` e `INVALID_FILTER`; `detail` do `NOT_FOUND` com `field`; `identifier_type` em `IDENTIFIER_TAKEN`; `detail` de `STALE_VERSION` e `assert_version` `STABLE`; lista de estado final nula recusada e confirmação nula = vazia; `p_partner_id` em `search_clients`; aviso `POSSIBLE_DUPLICATE` por apelido igual ao nome de outro cliente (RAT-D024, 26/11/2026); `p_field` em `assert_*_free`; `IDENTIFIER_TAKEN` levantado na `0200`. D-11 a D-21 (seção 15); P-E4-03, P-E5b-02 e P-IMPL-08 encerradas; PEND-M3 aberta e encerrada na mesma revisão pela RAT-D024 ("O do plano/código": aviso para qualquer cliente, com ou sem documento, e nome fantasia conta como nome). G1 segue apto |
| 4 | 27/11/2026 | Limites de itens por cadastro ([OFICIAL] RAT-D026; origem QA-CAD-07): I-19; sócio 2 apelidos, cliente 2 `NAME` + 2 `DOCUMENT` (teto por tipo), recebedor 30 formas do nome, 10 Pix, 10 contas; só ativos. Garantia no banco no laço de validação de `save_partner`, `save_receiver` (`0300`) e `save_client` (`0400`), antes de travas e escritas, com `private.cad_list_limit` (números) e `private.assert_list_limit` (erro); hint novo `LIST_LIMIT_EXCEEDED` (`22023`, `detail` com `field`, `list`, tipo e `max`); espelho em `LIST_LIMITS` e teste de concordância que lê a `0300` (6.6). pgTAP `12_cad_list_limits` novo e ajuste de 2 casos do `08`; seed sem mudança; nenhuma assinatura pública muda (tipos não regenerados). D-22; R-D14 a R-D16. A busca de documento em Clientes continua pelo começo do número (decisão do responsável no mesmo dia; sem mudança nesta modelagem). G1 segue apto |
