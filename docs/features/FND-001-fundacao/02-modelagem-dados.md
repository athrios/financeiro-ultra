# FND-001 — Fundação do Sistema · Modelagem de dados

| Campo | Valor |
|---|---|
| Feature | FND-001 — Fundação |
| Etapa / gate | E2 / G1 |
| Agente | `modelagem-dados` |
| Data | 22/10/2026 |
| Entrada | `01-plano.md` (revisão 6; aprovado em 22/10/2026, com o ajuste D-01 aceito); Brain 00, 02, 03, 04, 05, 06, 07, 08, 09, 10 e 11 (com as notas de revisão de 22/10); `supabase/migrations/20261007000100` a `0700` (só como referência de padrões); `src/domain/shared` e `src/domain/distribution` (primitivas) |
| Escopo da DDL | **Somente o transversal da FND**: papéis e perfis (com `partner_id` opcional), tabela mínima `partners` (exigida pela FK), auditoria estendida, `proof_files` e bucket de comprovantes. Nenhuma DDL de rateio, cliente, competência ou recebimento |
| Status | Proposta para o gate G1, **revisão 2** (correções da revisão independente; ver "Histórico de revisão" ao final). Nenhuma migration foi criada e nenhum código foi alterado (a implementação é a E4/E7) |

## Como ler as classificações

Mesma convenção do plano (`01-plano.md`, "Como ler as classificações"):

- **[OFICIAL]** — DECISÃO OFICIAL EXISTENTE: RAT-Dxxx em `11-Decisoes.md` ou regra de documento do Brain com `status: ativo`. A fonte é citada.
- **[PROPOSTA]** — recomendação desta modelagem (ou do plano aprovado, quando indicado). Só vira oficial com aprovação do responsável.
- **[PENDENTE]** — DECISÃO PENDENTE do responsável. Os IDs `P-xx` são os do plano; os IDs `M-xx` são pendências novas levantadas nesta modelagem (sugere-se registrá-las no Brain com numeração `P-` própria).

Documentos do Brain em `status: draft` (06, 08, 10) são **insumo**, citados como "PROPOSTA (Brain, rascunho)".

## Sumário

1. Diagnóstico do modelo atual
2. Modelo proposto (conceitual completo + nomes finais)
3. DDL proposta da FND
4. Invariantes
5. Índices
6. Contrato do bootstrap do primeiro Administrador
7. Plano de migration (linha de base)
8. Consultas críticas
9. Escala do percentual efetivo e registro do resíduo (P-17)
10. Riscos de dados
11. Divergências encontradas (Brain × plano × esta modelagem)
12. Handoff ao desenvolvedor
13. Pendências
14. Gate G1
15. Histórico de revisão

---

## 1. Diagnóstico do modelo atual

### 1.1 O que existe (migrations de 07/10, 12 tabelas, 1 view)

| Tabela / objeto | Papel no código de 07/10 | Situação diante do Brain |
|---|---|---|
| `indicators` | "Sócio/recebedor econômico" com `default_percentage` | Vocabulário divergente (RAT-D017). `default_percentage` não existe mais (RAT-D004 revogada). Mistura sócio e recebedor (RAT-D002) |
| `indicator_receipt_aliases` | Nomes pelos quais o indicador aparece como recebedor | Aliases presos ao sócio; o Brain quer recebedor separado com várias contas/nomes (02, ativo). Sem tipo de alias |
| `profiles` | Usuário ↔ papel (`ADMIN_FINANCEIRO`, `SOCIO`) ↔ indicador | Faltam Operador e Visualizador (RAT-D011). Todo usuário novo nasce `SOCIO`. O Administrador pode alterar qualquer perfil por API, inclusive o próprio papel, sem motivo e sem proteção do último Administrador |
| `finance_settings` | Flag `use_custom_default_percentages` | Caminho descartado (RAT-D004 revogada; RAT-D015) |
| `companies` / `company_indicators` | Cliente e sócios indicados, com `distribution_mode` (`INHERIT`/`EQUAL`/`CUSTOM`) e `custom_percentage` | Vocabulário divergente. Modo `CUSTOM` e percentual por cliente descartados (RAT-D015, "sempre 1/n"). CNPJ só numérico (P-13) |
| `competencies` / `competency_companies` | Mês `OPEN`/`CLOSED` + valor esperado por empresa no mês | Estados divergentes do Brain 09 (aberta, em conferência, apurada, liquidada). Sem reabertura nem histórico de transições. O valor esperado por competência não está no Brain (plano 1.3, linha 25) |
| `receipts` | Recebimento com colunas de arquivo embutidas | Sem `proof_files` separado, sem hash, TXID, EndToEnd ou origem. `payment_date` opcional (RN-006 exige data). Recebedor = indicador. Imutável já na confirmação, sem caminho de correção |
| `receipt_allocations` | Snapshot imutável do rateio por recebimento | **Alinhado com RAT-D006** no princípio. Percentual em `numeric(7,4)` e valor rateado a partir do percentual arredondado (desvio em valores altos — plano 1.3, linha 4). Resíduo não registrado. Guarda `distribution_source` (`EQUAL`/`DEFAULT_PERCENTAGE`/`COMPANY_CUSTOM`), dos quais só `EQUAL` sobrevive |
| `settlements` | Transferências livres, append-only | Conceito divergente: o Brain tem **compensações calculadas** (RN-012) e **liquidação da competência** (09) |
| `financial_ledger` (view) | Ledger derivado | **Sinal invertido** em relação a RN-010 (`saldo = direito − recebido`) |
| `audit_logs` + `private.audit_row_change` | Trilha append-only por trigger | Bom ponto de partida. Faltam motivo, origem, correlação, papel do ator, ordenação total, proteção contra `TRUNCATE`, redação de dados pessoais e eventos semânticos explícitos |

### 1.2 Fragilidades que a nova linha de base precisa evitar

| # | Fragilidade | Evidência | Tratamento |
|---|---|---|---|
| F-01 | Papel padrão de usuário novo é um papel de negócio (`SOCIO`) | `private.handle_new_user` | Usuário novo nasce **sem papel** (`role` nulo = nenhum acesso) |
| F-02 | Administrador altera papéis pela API, sem motivo e sem proteção contra ficar sem Administrador | política `profiles_update_admin` | Sem `UPDATE` direto na FND; mudança só por procedimento auditado com motivo obrigatório; trava do último Administrador |
| F-03 | `created_at` da auditoria usa `now()`, igual para todos os eventos da transação; sem ordem total | `audit_logs.created_at default now()` | `seq` (identity) + `created_at` com `clock_timestamp()` (mesmo nome do plano 9, só muda o padrão) + `tx_id` |
| F-04 | `TRUNCATE` na auditoria só é barrado por `REVOKE` para `authenticated` | `0700` | Trigger `BEFORE TRUNCATE` |
| F-05 | Ações semânticas deduzidas por `CASE` fixo no trigger genérico (acoplamento a nomes de colunas) | `audit_row_change` | Eventos semânticos gravados explicitamente pelas RPCs (`private.audit_event`) |
| F-06 | A auditoria copia a linha inteira, inclusive dados pessoais e extrações de OCR | `to_jsonb(new)` | Lista de colunas redigidas por tabela (argumento do trigger) |
| F-07 | Endurecimento de privilégios por exclusão (revoga alguns) | `0700` | Lista de permissões explícita (revoga tudo e concede por tabela/coluna) |
| F-08 | Rateio do valor a partir do percentual arredondado | `allocate-amount.ts` + `numeric(7,4)` | Fração exata `1/n` (seção 9) |
| F-09 | O recebedor efetivo não é congelado no recebimento: mudar o sócio de um recebedor reescreveria o "Recebido" histórico | (no modelo novo) | Snapshot `receiver_partner_id` no recebimento confirmado (seção 2) |

### 1.3 O que se reaproveita como padrão — [PROPOSTA] (plano 1.4)

- schema `private` não exposto pelo PostgREST, funções `SECURITY DEFINER` com `search_path = ''`, `revoke ... from public`;
- RLS em todas as tabelas, com chamadas `(select private.fn())` para cache por consulta;
- `private.set_updated_at`, `private.normalize_alias`, `private.prevent_mutation`, `private.to_money` (rejeita casas extras em vez de arredondar);
- constraint triggers `DEFERRABLE INITIALLY DEFERRED` para invariantes de conjunto (soma, existência de Administrador);
- view `security_invoker` para o ledger derivado;
- `private.to_percentage` **não** é reaproveitado: não há percentual digitado em lugar nenhum (RAT-D015).

---

## 2. Modelo proposto

### 2.1 Princípios do modelo

| Princípio | Classificação |
|---|---|
| Pagador, recebedor e beneficiário econômico (sócio) são conceitos e colunas distintos | [OFICIAL] RAT-D002, RN-001 |
| Empresa única: nenhuma tabela tem `organization_id`; RLS por papel | [OFICIAL] RAT-D010 |
| Vocabulário: Parte do Brain = **Sócio** (`partners`); Cliente, Recebedor, Competência, Recebimento, Compensação, Liquidação, Comprovante mantidos; nada de "Indicador"/"Empresa" | [OFICIAL] RAT-D017 |
| Divisão **sempre 1/n** entre os sócios indicados no cliente. **Nenhum percentual armazenado como parâmetro**: sem `default_percentage` por sócio, sem `custom_percentage` por cliente, sem modo de divisão | [OFICIAL] RAT-D015 (RAT-D004 revogada; RN-005 revogada) |
| O snapshot por recebimento guarda o percentual efetivo e o valor alocado | [OFICIAL] RAT-D006 |
| Competência é a unidade de apuração e liquidação; snapshot na liquidação | [OFICIAL] RAT-D003, Brain 09 |
| Nunca float; fechamento em centavos; resíduo determinístico e registrado | [OFICIAL] Brain 07 |
| Dinheiro em `numeric(14,2)`; PK `uuid`; `timestamptz`; enums para estados estáveis; dados financeiros sem exclusão física | [PROPOSTA] (plano 7.1 e 7.3) |
| Saldos nunca armazenados como fonte da verdade; derivados de lançamentos; o snapshot da liquidação é a exceção formal | [PROPOSTA] (plano 7.4) |
| Banco e código em inglês, interface em português | [PROPOSTA] (plano 3) |

### 2.2 Nomes finais

| Conceito (Brain / interface) | Tabela | Observação |
|---|---|---|
| Sócio (Parte) | `partners` | [PROPOSTA] Substitui `parts` (06, rascunho) e `indicators` (07/10) |
| Apelido do sócio | `partner_aliases` | [PROPOSTA] Tipado |
| Recebedor | `receivers` | [PROPOSTA] Entidade própria (RAT-D002) |
| Identificador do recebedor | `receiver_identifiers` | [PROPOSTA] Documento, chave Pix, conta, nome bancário |
| Cliente | `clients` | [PROPOSTA] Substitui `companies` |
| Apelido do cliente | `client_aliases` | [PROPOSTA] (06, rascunho; 08) |
| Sócio indicado no cliente | `client_partners` | [PROPOSTA] Só a associação; **sem percentual** |
| Competência | `competences` | [PROPOSTA] (nome do 06; o código antigo usa `competencies`) |
| Histórico de estados da competência | `competence_status_events` | [PROPOSTA] |
| Recebimento | `receipts` | [PROPOSTA] |
| Rateio aplicado (snapshot) | `receipt_allocations` | [OFICIAL] RAT-D006 (nome) + [PROPOSTA] (colunas) |
| Comprovante | `proof_files` | [PROPOSTA] (06, rascunho; plano 8) |
| Apuração | `competence_calculations` | [PROPOSTA] Versionada |
| Saldo por sócio na apuração | `calculation_partner_balances` | [PROPOSTA] Snapshot da apuração |
| Compensação | `compensations` | [PROPOSTA] O 06 (rascunho) chama de `settlements`; ver seção 11 |
| Liquidação | `competence_settlements` | [PROPOSTA] Snapshot imutável da liquidação |
| Reabertura | `competence_reopenings` | [PROPOSTA] |
| Usuário (perfil e papel) | `profiles` | [PROPOSTA] 1:1 com `auth.users` |
| Auditoria | `audit_logs` | [PROPOSTA] Estendida (plano 9) |

### 2.3 Diagrama conceitual

```text
auth.users 1 ──── 1 profiles ──── 0..1 partners            (RAT-D011: login próprio do sócio)
                                     │
             ┌───────────────────────┼──────────────────────────────┐
             │ 1                     │ 1                            │ 1
             ▼ N                     ▼ N                            ▼ N
      partner_aliases           receivers ── 1:N ── receiver_identifiers
                                (partner_id 0..1; P-08)
clients 1 ── N client_aliases
clients N ── N partners   via client_partners (só associação; n = sócios indicados — RAT-D015; filtro "sócio ativo": M-02)

competences 1 ── N competence_status_events
competences 1 ── N receipts N ── 1 clients
                       receipts N ── 0..1 receivers        (identificado na revisão)
                       receipts N ── 0..1 proof_files      (M-03: 1 comprovante → no máx. 1 recebimento ativo)
                       receipts 1 ── N receipt_allocations N ── 1 partners   (snapshot 1/n)

competences 1 ── N competence_calculations (versões; 1 CURRENT)
competence_calculations 1 ── N calculation_partner_balances N ── 1 partners
competence_calculations 1 ── N compensations (from_partner → to_partner) N ── 0..1 proof_files
competences 1 ── N competence_settlements (1 por ciclo de liquidação) 1 ── 1 competence_calculations
competences 1 ── N competence_reopenings  1 ── 1 competence_settlements (a que foi reaberta)

audit_logs: referência lógica (entity, entity_id) a qualquer tabela; sem FK (sobrevive às entidades)
```

### 2.4 Entidades e atributos

Legenda: **FND** = DDL entra na fundação (seção 3). **Feature** = só conceitual; DDL na feature indicada (plano 14, "Depois da FND").

#### `partners` — Sócio · FND (mínima) + feature Sócios

| Campo | Tipo | Regra | Classificação |
|---|---|---|---|
| `id` | `uuid` PK | | [PROPOSTA] |
| `name` | `text` | obrigatório, não vazio, ≤ 200 | [OFICIAL] (02: nome) |
| `normalized_name` | `text` gerada (`private.normalize_alias(name)`) | única (M-05) | [PROPOSTA] |
| `active` | `boolean` | padrão `true`; inativação, nunca exclusão física | [OFICIAL] (02: status) + [PROPOSTA] (forma) |
| `document` | `text` | CPF/CNPJ opcional, normalizado; **só na feature Sócios** (LGPD, P-20; formato, P-13) | [OFICIAL] (02: CPF/CNPJ opcional) + [PENDENTE] P-13, P-20 |
| `created_at`, `updated_at` | `timestamptz` | | [PROPOSTA] |

Não existe `default_percentage` — [OFICIAL] RAT-D004 revogada, RAT-D015.

#### `partner_aliases` — Feature Sócios

`id`, `partner_id` (FK, N:1), `alias_type` (enum `NAME`, `TRADE_NAME`, `DOCUMENT`, `OTHER`), `alias_value`, `normalized_value` (gerada), `active`, `created_at`. Unicidade: (`alias_type`, `normalized_value`) entre os ativos — um apelido ativo resolve para um único sócio. [PROPOSTA] (06, rascunho: `part_aliases` com `alias_type`).

#### `receivers` — Recebedor · Feature Sócios/Recebedores

| Campo | Tipo | Regra | Classificação |
|---|---|---|---|
| `id` | `uuid` PK | | |
| `partner_id` | `uuid` FK `partners`, **anulável** | Vínculo ao sócio. Recebimento só pode ser **confirmado** com recebedor vinculado a sócio enquanto P-08 não for decidida (senão a soma zero de RN-011 quebra) | [OFICIAL] RAT-D002 + [PENDENTE] P-08 |
| `name` | `text` | nome bancário/titular | [PROPOSTA] (06) |
| `document` | `text` | opcional, normalizado | [PROPOSTA] (06) + P-13/P-20 |
| `active` | `boolean` | | [PROPOSTA] |

Cardinalidade: sócio 1 — N recebedores (várias contas, nomes ou titulares — 02, ativo).

#### `receiver_identifiers` — Feature Sócios/Recebedores

`id`, `receiver_id` (FK), `identifier_type` (enum `DOCUMENT`, `PIX_KEY`, `BANK_ACCOUNT`, `BANK_NAME`, `ALIAS`), `value`, `normalized_value` (gerada), `active`. Unicidade (`identifier_type`, `normalized_value`) entre os ativos. Ordem de identificação do 08: documento → identificador bancário → alias → nome normalizado. [PROPOSTA] (06 tinha só `bank_reference`; tipar permite várias contas por recebedor).

#### `clients` — Cliente · Feature Clientes

| Campo | Tipo | Regra | Classificação |
|---|---|---|---|
| `id` | `uuid` PK | | |
| `legal_name` | `text` | obrigatório | [OFICIAL] (02: nome/razão social) |
| `trade_name` | `text` | opcional | [PROPOSTA] (06) |
| `cnpj` | `text` | como digitado | [OFICIAL] (02) |
| `normalized_cnpj` | `text` gerada | **única**; maiúsculas alfanuméricas sem pontuação; DV validado | [PROPOSTA] + [PENDENTE] P-13 (CNPJ alfanumérico) |
| `default_monthly_value` | `numeric(14,2)` | `> 0` | [OFICIAL] (02: valor padrão da mensalidade) |
| `active` | `boolean` | | [OFICIAL] (02: status; 05: ativação/inativação) |
| `notes` | `text` | | [OFICIAL] (02: observações) |
| `created_at`, `updated_at` | | | |

Sem `distribution_mode`, sem `custom_percentage` — [OFICIAL] RAT-D015.

#### `client_aliases` — Feature Clientes

`id`, `client_id`, `alias_type` (enum `NAME`, `TRADE_NAME`, `DOCUMENT`, `OTHER`), `alias_value`, `normalized_value` (gerada), `active`. Unicidade (`alias_type`, `normalized_value`) entre os ativos. [PROPOSTA] (06, rascunho; 08).

#### `client_partners` — Sócios indicados no cliente · Feature Clientes

| Campo | Tipo | Regra | Classificação |
|---|---|---|---|
| `id` | `uuid` PK | chave substituta, exigida pelo trigger de auditoria (regra "toda tabela auditada tem `id uuid`", seção 3.4) | [PROPOSTA] |
| `client_id` | FK `clients` | único com `partner_id`: `unique (client_id, partner_id)` (uma linha por par; reindicar = reativar a linha) | [OFICIAL] RAT-D005 (o cliente define os sócios) |
| `partner_id` | FK `partners` (`on delete restrict`) | | |
| `active` | `boolean` | indicação vigente; desindicar = `false` (histórico na auditoria) | [PROPOSTA] (06: `enabled`) |
| `created_at`, `updated_at` | | | |

**Não há coluna de percentual.** `n` = número de sócios indicados no cliente (linhas ativas) — [OFICIAL] RAT-D015. Contar só as linhas cujo **sócio** também está ativo é [PROPOSTA] desta modelagem, ligada a [PENDENTE] M-02: se M-02 for decidida como proposto (bloquear a inativação de sócio com indicação ativa), os dois critérios coincidem e o filtro vira só uma defesa.

Sócio inativado ainda indicado em cliente ativo: [PENDENTE] M-02 (proposta: bloquear a inativação do sócio enquanto houver indicação ativa, para que `n` nunca mude implicitamente).

#### `competences` — Competência · Feature Competências

| Campo | Tipo | Regra | Classificação |
|---|---|---|---|
| `id` | `uuid` PK | | |
| `reference_month` | `date` | sempre dia 1; única | [PROPOSTA] (padrão de 07/10) + [PENDENTE] P-19 (fuso) |
| `status` | enum `competence_status`: `OPEN`, `IN_REVIEW`, `CALCULATED`, `SETTLED` | | [OFICIAL] Brain 09 (aberta, em conferência, apurada, liquidada) |
| `opened_at`, `opened_by` | | | [PROPOSTA] |
| `current_calculation_id` | FK anulável | apuração vigente | [PROPOSTA] |
| `created_at`, `updated_at` | | | |

Transições [PROPOSTA] (detalhe em P-21): `OPEN → IN_REVIEW → CALCULATED → SETTLED`; `IN_REVIEW → OPEN` (devolver); `CALCULATED → IN_REVIEW` (invalida a apuração, que vira `SUPERSEDED`); `SETTLED → OPEN` somente por **reabertura** do Administrador, com motivo ([OFICIAL] Brain 09, RN-014).

#### `competence_status_events` — Feature Competências

`id`, `competence_id`, `from_status`, `to_status`, `occurred_at`, `actor_user_id`, `reason` (obrigatório na reabertura e nas voltas de estado), `calculation_id` (anulável). Append-only. [PROPOSTA]. Complementa a auditoria com consulta direta do ciclo de vida.

#### `receipts` — Recebimento · Feature Recebimentos

| Campo | Tipo | Regra | Classificação |
|---|---|---|---|
| `id` | `uuid` PK | | |
| `competence_id` | FK, **obrigatória** | | [OFICIAL] RN-002 |
| `client_id` | FK anulável até a confirmação | confirmado ⇒ não nulo | [OFICIAL] RN-006 + [PROPOSTA] (forma) |
| `receiver_id` | FK anulável até a confirmação | confirmado ⇒ não nulo | [OFICIAL] RN-006 |
| `receiver_partner_id` | FK `partners`, anulável | **snapshot** do sócio do recebedor no momento da confirmação; confirmado ⇒ não nulo enquanto P-08 não decidir outra coisa | [PROPOSTA] (corrige F-09) |
| `amount` | `numeric(14,2)` | `> 0` (estorno: P-11) | [OFICIAL] (02, RN-006) |
| `received_on` | `date` | confirmado ⇒ não nulo | [OFICIAL] RN-006 |
| `source` | enum `MANUAL`, `PROOF_IMPORT` | | [OFICIAL] (02: origem) + [PROPOSTA] (valores) |
| `status` | enum `DRAFT`, `PENDING_REVIEW`, `CONFIRMED`, `CANCELLED` | | [PROPOSTA] |
| `proof_file_id` | FK `proof_files`, anulável | | [OFICIAL] (02: comprovante) |
| `payer_name`, `payer_document` | `text` | pagador declarado/extraído (≠ cliente, ≠ recebedor) | [OFICIAL] RN-001 |
| `txid`, `end_to_end_id`, `bank_authentication` | `text` | identificadores bancários | [OFICIAL] RN-008 |
| `allocation_rule` | enum `EQUAL_SPLIT_V1` | regra aplicada no snapshot; confirmado ⇒ não nulo | [PROPOSTA] (seção 9) |
| `created_by`, `created_at`, `confirmed_by`, `confirmed_at`, `cancelled_by`, `cancelled_at`, `cancellation_reason` | | | [OFICIAL] (02: usuário responsável) + [PROPOSTA] |

Pendências que mudam constraints desta tabela: P-09 (parcial), P-10 (mais de uma mensalidade por cliente na competência — **por isso não há** unicidade `client_id, competence_id`), P-11 (estorno), P-12 (vencimento), M-01 (momento do snapshot), M-03 (um comprovante → vários recebimentos).

#### `receipt_allocations` — Rateio aplicado · Feature Motor de rateio

| Campo | Tipo | Regra | Classificação |
|---|---|---|---|
| `id` | `uuid` PK | | |
| `receipt_id` | FK | único com `partner_id` | [OFICIAL] RAT-D006 |
| `partner_id` | FK `partners` | beneficiário econômico | [OFICIAL] RAT-D002 |
| `split_count` | `smallint` | `n` aplicado; igual em todas as linhas do recebimento e igual ao número de linhas | [PROPOSTA] (seção 9) |
| `effective_percentage` | `numeric(9,6)` gerada = `round(100 / split_count, 6)` | percentual efetivo **informativo** | [OFICIAL] RAT-D006 (guardar o percentual) + [PROPOSTA] (escala) |
| `allocated_amount` | `numeric(14,2)` | valor alocado ao sócio | [OFICIAL] RAT-D006 |
| `rounding_adjustment` | `numeric(14,2)` | `0.00` ou `0.01`: centavo residual recebido por este sócio | [OFICIAL] Brain 07 (resíduo registrado) + [PROPOSTA] (forma — P-17) |
| `created_at` | | | |

Imutável (sem `UPDATE`/`DELETE`). Correção de recebimento confirmado = cancelamento + novo recebimento, só em competência não liquidada ou após reabertura ([OFICIAL] RN-014; forma [PROPOSTA]).

#### `proof_files` — Comprovante · **FND** (seção 3.5)

Metadados do arquivo, hash SHA-256 único, estado do envio, estado da extração (futuro), exclusão lógica.

#### `competence_calculations` — Apuração · Feature Apuração

| Campo | Tipo | Regra | Classificação |
|---|---|---|---|
| `id` | `uuid` PK | | |
| `competence_id` | FK | | [OFICIAL] RAT-D003 |
| `version` | `int` | 1, 2, 3… por competência; único (`competence_id`, `version`) | [PROPOSTA] |
| `status` | enum `CURRENT`, `SUPERSEDED` | no máximo 1 `CURRENT` por competência | [OFICIAL] Brain 09 ("nova apuração substitui a anterior mantendo histórico") + [PROPOSTA] (forma) |
| `total_received` | `numeric(14,2)` | soma dos recebimentos confirmados | [OFICIAL] Brain 09 (snapshot: total recebido) |
| `receipt_count` | `int` | | [PROPOSTA] |
| `inputs_fingerprint` | `text` | SHA-256 da lista ordenada (`receipt_id`, `amount`, alocações) usada; detecta mudança após a apuração | [PROPOSTA] |
| `rule_version` | `text` | ex.: `EQUAL_SPLIT_V1` + `COMPENSATION_V1` | [OFICIAL] Brain 09 ("parâmetros utilizados") + [PROPOSTA] |
| `calculated_at`, `calculated_by`, `superseded_at`, `superseded_reason` | | | |

#### `calculation_partner_balances` — Feature Apuração

`id` (`uuid` PK, chave substituta exigida pela auditoria), `calculation_id`, `partner_id` (`unique (calculation_id, partner_id)`), `received_amount`, `owed_amount`, `balance` (gerada = `received_amount − owed_amount`), `prior_paid_out`, `prior_paid_in` (compensações `PAID` de versões anteriores da mesma competência; zero na primeira apuração), `net_balance` (gerada = `received_amount − owed_amount − prior_paid_out + prior_paid_in`, **só com colunas base**: no PostgreSQL uma coluna gerada não pode referenciar outra coluna gerada). As compensações da versão quitam `net_balance`. [OFICIAL] RN-010 (sinal: `> 0` deve transferir; `< 0` deve receber) e Brain 09 (snapshot: recebido, devido e saldo por parte) + [PROPOSTA] (colunas de compensações anteriores, necessárias para reabertura depois de pagamentos reais — R-D05).

#### `compensations` — Compensação · Feature Apuração/Liquidação

| Campo | Tipo | Regra | Classificação |
|---|---|---|---|
| `id` | `uuid` PK | | |
| `calculation_id` | FK | a compensação pertence a uma versão da apuração | [PROPOSTA] |
| `from_partner_id`, `to_partner_id` | FK `partners` | diferentes | [OFICIAL] (02: Parte A → Parte B) |
| `amount` | `numeric(14,2)` | `> 0` | [OFICIAL] (02) |
| `status` | enum `PENDING`, `PAID`, `JUSTIFIED`, `VOID` | só `PENDING` vira `VOID` quando a apuração vira `SUPERSEDED`; `PAID` é definitivo (o dinheiro já mudou de mãos) | [OFICIAL] RN-013 (pagas ou justificadas) + [PROPOSTA] (`VOID`) |
| `paid_on`, `confirmed_by`, `confirmed_at` | | `PAID` ⇒ preenchidos | [OFICIAL] (05: data da liquidação) |
| `justification` | `text` | `JUSTIFIED` ⇒ obrigatório | [OFICIAL] RN-013 |
| `proof_file_id` | FK anulável | comprovante da transferência | [OFICIAL] (04, Fluxo 6: opcional) |

Critério de minimização e liquidação parcial: [PENDENTE] P-22.

#### `competence_settlements` — Liquidação · Feature Liquidação

`id`, `competence_id`, `calculation_id` (único), `settled_at`, `settled_by`, `snapshot jsonb` (total recebido, recebido/devido/saldo por sócio, compensações com status, `rule_version`), `snapshot_sha256`, `superseded_by_reopening_id` (anulável). Imutável, salvo o carimbo de reabertura. [OFICIAL] Brain 09 (snapshot da apuração na liquidação; RN-013) + [PROPOSTA] (forma).

#### `competence_reopenings` — Reabertura · Feature Liquidação

`id`, `competence_id`, `settlement_id` (a liquidação reaberta), `reopened_at` (relógio do servidor), `reopened_by` (Administrador), `reason` (obrigatório), `previous_status` (`SETTLED`), `impact` (`jsonb`). [OFICIAL] Brain 09 (usuário, data/hora, motivo, estado anterior, impacto financeiro). O conteúdo de "impacto financeiro" no momento da reabertura (quando a nova apuração ainda não existe): [PENDENTE] P-21 — proposta: registrar na reabertura o snapshot invalidado e, na liquidação seguinte, o diff por sócio entre as duas apurações.

#### `profiles` — Usuário · **FND** (seção 3.3)

1:1 com `auth.users`; `role` (`ADMINISTRATOR`, `OPERATOR`, `VIEWER`, `PARTNER`, ou nulo = sem papel); `partner_id` opcional (0..1 usuário por sócio); `active`.

#### `audit_logs` — Auditoria · **FND** (seção 3.4)

### 2.5 Cardinalidades e escolhas que precisam ser explícitas

| Relação | Cardinalidade | Classificação |
|---|---|---|
| usuário ↔ perfil | 1:1 (PK = `auth.users.id`) | [PROPOSTA] |
| perfil → sócio | N:0..1 com unicidade parcial ⇒ cada sócio tem **no máximo um** login | [OFICIAL] RAT-D011 (login próprio vinculado ao cadastro) + [PROPOSTA] (no máximo um) |
| papel × vínculo | `PARTNER` exige `partner_id`; os demais papéis podem ter `partner_id` (ex.: Administrador que também é sócio) | [PROPOSTA] (plano 6) |
| sócio → recebedores | 1:N | [OFICIAL] (02) |
| recebedor → sócio | N:0..1 (confirmação exige vínculo até P-08) | [PENDENTE] P-08 |
| cliente ↔ sócio | N:N via `client_partners` | [OFICIAL] RAT-D005 |
| recebimento → alocações | 1:N, N = `split_count` = sócios indicados no cliente (RAT-D015) **no momento do rateio** | [OFICIAL] RAT-D006, RAT-D015 + [PENDENTE] M-01 (momento: confirmação × apuração) + [PENDENTE] M-02 (filtro de sócio ativo) |
| comprovante → recebimentos | 1:0..1 entre recebimentos não cancelados | [PENDENTE] M-03 |
| competência → apurações | 1:N, no máximo 1 `CURRENT` | [PROPOSTA] |
| apuração → liquidação | 1:0..1 | [PROPOSTA] |
| competência → liquidações | 1:N (uma por ciclo; reaberturas geram novos ciclos) | [OFICIAL] Brain 09 (reabertura mantém histórico) |

---

## 3. DDL proposta da FND

**Escopo:** só o transversal (plano 14, E2/E4/E7). Os blocos abaixo são **proposta para revisão**; o desenvolvedor os transforma em migrations na E4/E7, com pgTAP. Nenhum objeto tem `organization_id` ([OFICIAL] RAT-D010). Toda a seção é [PROPOSTA], salvo onde indicado.

Arquivos sugeridos (a data real é a da E4; o prefixo `AAAAMMDD` é ilustrativo):

| Ordem | Arquivo | Conteúdo |
|---|---|---|
| 1 | `AAAAMMDD000100_base.sql` | schema `private`, enums, utilitários reaproveitados |
| 2 | `AAAAMMDD000200_audit.sql` | `audit_logs`, contexto de auditoria, trigger genérico, eventos semânticos |
| 3 | `AAAAMMDD000300_access.sql` | `partners` (mínima), `profiles`, trigger do Auth, funções de autorização, guardas, procedimentos de acesso e bootstrap |
| 4 | `AAAAMMDD000400_proof_files.sql` | `proof_files`, RPCs de envio, bucket `proofs` e políticas de `storage.objects` |
| 5 | `AAAAMMDD000500_privileges.sql` | revogação geral e concessões explícitas (lista de permissões) |

### 3.1 Base

```sql
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Papéis do sistema (RAT-D011) + papel do login dos sócios (plano 6).
-- NULL em profiles.role = "sem papel atribuído" (nenhum acesso).
create type public.app_role as enum ('ADMINISTRATOR', 'OPERATOR', 'VIEWER', 'PARTNER');

create type public.audit_kind   as enum ('ROW_CHANGE', 'EVENT');
create type public.audit_source as enum ('UI', 'IMPORT', 'SYSTEM', 'SCRIPT', 'DIRECT');

create type public.proof_upload_status     as enum ('PENDING_UPLOAD', 'STORED');
create type public.proof_extraction_status as enum ('NOT_REQUESTED', 'PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- Reaproveitadas sem mudança de comportamento das migrations de 07/10:
--   private.set_updated_at()      (trigger de updated_at)
--   private.normalize_alias(text) (IMMUTABLE; minúsculas, sem acento, sem pontuação)
--   private.prevent_mutation()    (bloqueia UPDATE/DELETE)
--   private.to_money(text)        (rejeita > 2 casas e negativos; não arredonda)
-- NÃO reaproveitadas: to_percentage, normalize_cnpj/is_valid_cnpj (voltam na
-- feature Clientes, já com a decisão de P-13), enums de 07/10.

-- Bloqueio de TRUNCATE (statement-level), usado na auditoria.
create function private.prevent_truncate()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception '% é imutável: TRUNCATE não permitido.', tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;
revoke execute on function private.prevent_truncate() from public;
```

### 3.2 Auditoria estendida (plano 9)

```sql
create table public.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  seq             bigint generated always as identity,            -- ordem total
  created_at      timestamptz not null default clock_timestamp(), -- relógio do servidor, por evento (nome do plano 9)
  tx_id           xid8 not null default pg_current_xact_id(),     -- agrupa os eventos de uma transação
  kind            public.audit_kind not null,
  entity          text not null,
  entity_id       uuid not null,
  action          text not null,
  previous_data   jsonb,          -- linha anterior (DELETE) ou só as colunas alteradas (UPDATE)
  new_data        jsonb,          -- linha nova (INSERT) ou só as colunas alteradas (UPDATE)
  reason          text,
  source          public.audit_source not null,
  correlation_id  uuid,
  actor_user_id   uuid,            -- sem FK de propósito: o log sobrevive ao usuário
  actor_role      public.app_role, -- papel do ator no momento do evento
  actor_label     text,            -- quem executou um script/SQL direto (sem auth.uid())
  request_role    text not null,   -- 'authenticated', 'service_role' ou 'direct:<session_user>'

  constraint audit_logs_seq_key        unique (seq),
  constraint audit_logs_entity_format  check (entity ~ '^[a-z][a-z0-9_]*$'),
  constraint audit_logs_action_format  check (action ~ '^[A-Z][A-Z0-9_]*$'),
  constraint audit_logs_row_actions    check (kind <> 'ROW_CHANGE' or action in ('CREATE', 'UPDATE', 'DELETE')),
  constraint audit_logs_reason_length  check (reason is null or char_length(reason) between 1 and 2000),
  constraint audit_logs_label_length   check (actor_label is null or char_length(actor_label) between 1 and 200)
);

comment on table public.audit_logs is
  'Trilha append-only. ROW_CHANGE: gravado por trigger em toda escrita das tabelas auditadas. EVENT: ação semântica gravada pela RPC (CONFIRM, CALCULATE, SETTLE, REOPEN, BOOTSTRAP_ADMIN...).';

alter table public.audit_logs enable row level security;

create trigger audit_logs_immutable
  before update or delete on public.audit_logs
  for each row execute function private.prevent_mutation();
create trigger audit_logs_no_truncate
  before truncate on public.audit_logs
  for each statement execute function private.prevent_truncate();

-- Contexto da transação (motivo, origem, correlação, rótulo do executor).
-- Chamado pelas RPCs e pelos procedimentos; vale até o fim da transação (is_local = true).
create function private.set_audit_context(
  p_reason          text,
  p_source          public.audit_source default null,
  p_correlation_id  uuid default null,
  p_actor_label     text default null
) returns void
language plpgsql set search_path = '' as $$
begin
  perform pg_catalog.set_config('app.audit_reason',      coalesce(pg_catalog.btrim(p_reason), ''), true);
  perform pg_catalog.set_config('app.audit_source',      coalesce(p_source::text, ''), true);
  perform pg_catalog.set_config('app.correlation_id',    coalesce(p_correlation_id::text, ''), true);
  perform pg_catalog.set_config('app.audit_actor_label', coalesce(pg_catalog.btrim(p_actor_label), ''), true);
end;
$$;

-- Resolve os campos comuns a ROW_CHANGE e EVENT.
-- Origem: GUC app.audit_source; senão UI (usuário autenticado), SYSTEM (service_role) ou DIRECT (SQL direto).
-- Correlação: GUC app.correlation_id; senão cabeçalho HTTP x-correlation-id repassado pelo PostgREST.
--   Valor que não for UUID é descartado (nunca falha a escrita por causa da correlação).
-- request_role: papel do JWT; sem JWT, 'direct:' || session_user.
create function private.audit_insert(
  p_kind public.audit_kind, p_entity text, p_entity_id uuid, p_action text,
  p_previous jsonb, p_new jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid        uuid := auth.uid();
  v_jwt_role   text := auth.jwt() ->> 'role';
  v_source_txt text := nullif(current_setting('app.audit_source', true), '');
  v_corr_txt   text := coalesce(
                         nullif(current_setting('app.correlation_id', true), ''),
                         nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-correlation-id');
  v_corr       uuid;
begin
  if v_corr_txt ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_corr := v_corr_txt::uuid;
  end if;

  insert into public.audit_logs (
    kind, entity, entity_id, action, previous_data, new_data,
    reason, source, correlation_id, actor_user_id, actor_role, actor_label, request_role)
  values (
    p_kind, p_entity, p_entity_id, p_action, p_previous, p_new,
    nullif(current_setting('app.audit_reason', true), ''),
    coalesce(v_source_txt::public.audit_source,
             case when v_uid is not null then 'UI'
                  when v_jwt_role = 'service_role' then 'SYSTEM'
                  else 'DIRECT' end::public.audit_source),
    v_corr,
    v_uid,
    (select p.role from public.profiles p where p.id = v_uid),
    nullif(current_setting('app.audit_actor_label', true), ''),
    coalesce(v_jwt_role, 'direct:' || session_user));
end;
$$;
-- public.profiles é criada na migration 0300; como a função é plpgsql, a referência
-- só é resolvida na execução (sem erro de ordem de criação).

-- Trigger genérico (ROW_CHANGE).
--   TG_ARGV[0] = nome da entidade (ex.: 'profile').
--   TG_ARGV[1] = colunas redigidas, separadas por vírgula (ex.: 'raw_extraction'),
--                gravadas como "[omitido]" (registra QUE mudou, não o conteúdo).
--   UPDATE grava só as colunas alteradas (exceto updated_at); UPDATE sem mudança não gera registro.
create function private.audit_row_change()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_entity   constant text   := tg_argv[0];
  v_redacted constant text[] := coalesce(pg_catalog.string_to_array(nullif(tg_argv[1], ''), ','), '{}');
  v_old jsonb; v_new jsonb; v_old_d jsonb; v_new_d jsonb; v_col text;
  v_id uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := pg_catalog.to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := pg_catalog.to_jsonb(new); end if;
  -- Regra (seção 3.4): toda tabela auditada tem PK "id uuid". Sem ela, falha com mensagem
  -- clara em vez de violar o NOT NULL de entity_id. O teste de catálogo (12.2) barra antes.
  if not (coalesce(v_new, v_old) ? 'id') then
    raise exception 'Tabela auditada % não tem coluna id (regra da seção 3.4).', tg_table_name
      using errcode = 'feature_not_supported';
  end if;
  v_id := (coalesce(v_new, v_old) ->> 'id')::uuid;

  if tg_op = 'UPDATE' then
    select pg_catalog.jsonb_object_agg(o.key, o.value), pg_catalog.jsonb_object_agg(o.key, n.value)
      into v_old_d, v_new_d
      from pg_catalog.jsonb_each(v_old) o
      join pg_catalog.jsonb_each(v_new) n on n.key = o.key
     where o.value is distinct from n.value and o.key <> 'updated_at';
    if v_new_d is null then return null; end if;
    v_old := v_old_d; v_new := v_new_d;
  end if;

  foreach v_col in array v_redacted loop
    if v_old ? v_col then v_old := v_old || pg_catalog.jsonb_build_object(v_col, '[omitido]'); end if;
    if v_new ? v_col then v_new := v_new || pg_catalog.jsonb_build_object(v_col, '[omitido]'); end if;
  end loop;

  perform private.audit_insert(
    'ROW_CHANGE', v_entity, v_id,
    case tg_op when 'INSERT' then 'CREATE' when 'UPDATE' then 'UPDATE' else 'DELETE' end,
    v_old, v_new);
  return null;
end;
$$;

-- Evento semântico explícito (EVENT), chamado pelas RPCs e procedimentos.
create function private.audit_event(
  p_entity text, p_entity_id uuid, p_action text, p_data jsonb default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.audit_insert('EVENT', p_entity, p_entity_id, p_action, null, p_data);
end;
$$;

-- Ações que exigem motivo chamam esta função antes de escrever.
create function private.require_audit_reason()
returns text language plpgsql stable set search_path = '' as $$
declare v_reason text := pg_catalog.btrim(coalesce(current_setting('app.audit_reason', true), ''));
begin
  if v_reason = '' then
    raise exception 'Esta operação exige motivo.' using errcode = 'check_violation';
  end if;
  return v_reason;
end;
$$;

revoke execute on function private.audit_insert(public.audit_kind, text, uuid, text, jsonb, jsonb) from public;
revoke execute on function private.audit_row_change() from public;
revoke execute on function private.audit_event(text, uuid, text, jsonb) from public;
revoke execute on function private.set_audit_context(text, public.audit_source, uuid, text) from public;
revoke execute on function private.require_audit_reason() from public;
-- RPCs SECURITY INVOKER (executadas como authenticated) chamam estas três.
-- O schema private não é exposto pelo PostgREST: o cliente não as chama diretamente.
grant execute on function private.audit_event(text, uuid, text, jsonb) to authenticated;
grant execute on function private.set_audit_context(text, public.audit_source, uuid, text) to authenticated;
grant execute on function private.require_audit_reason() to authenticated;

create index audit_logs_entity_idx      on public.audit_logs (entity, entity_id, seq desc);
create index audit_logs_actor_idx       on public.audit_logs (actor_user_id, seq desc) where actor_user_id is not null;
create index audit_logs_created_at_idx  on public.audit_logs (created_at desc);
create index audit_logs_correlation_idx on public.audit_logs (correlation_id) where correlation_id is not null;
create index audit_logs_tx_idx          on public.audit_logs (tx_id);

-- Matriz do plano 6: só o Administrador lê a auditoria.
-- (private.is_admin é criada na 0300; a política vai para a 0300 ou para depois dela.)
create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated
  using ((select private.is_admin()));
```

Notas:

- `source` e `correlation_id` são **informativos** (o cliente pode influenciar o cabeçalho). Os campos confiáveis são `actor_user_id` (JWT validado), `actor_role` (lido do banco), `created_at`, `seq`, `tx_id` e `request_role`. [PROPOSTA]
- O nome do campo de horário é `created_at`, como no plano 9; a diferença para 07/10 é só o padrão (`clock_timestamp()` em vez de `now()`), que dá um horário por evento e não um por transação. [PROPOSTA]
- A ação semântica de liquidação chama-se `SETTLE` (o plano 9 cita `LIQUIDATE` numa lista exemplificativa). Motivo: mesmo radical do estado `SETTLED` e da tabela `competence_settlements`, para que código, enum e auditoria usem um termo só. Registrado em D-04. [PROPOSTA]
- O valor `DIRECT` (alteração por SQL sem contexto, ex.: editor do painel) amplia a lista do plano 9 (ui/importação/sistema/script) para que nenhuma escrita fique sem origem. [PROPOSTA]
- Encadeamento por hash e retenção: [PENDENTE] P-18. O modelo permite acrescentar `prev_hash`/`row_hash` depois, calculados na ordem de `seq` (backfill determinístico, porque a tabela é append-only).
- `request.headers` e `request.jwt.claims` são GUCs que o PostgREST define por requisição; o comportamento com o cabeçalho `x-correlation-id` deve ser confirmado em teste de integração na E4 (não só em pgTAP).

### 3.3 Sócio mínimo, perfis, papéis e autorização

```sql
-- Sócio (RAT-D017). Na FND só existe para dar destino à FK profiles.partner_id
-- e aos testes do papel PARTNER. Aliases, recebedores e documento: feature Sócios.
create table public.partners (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  normalized_name text not null generated always as (private.normalize_alias(name)) stored,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint partners_name_not_blank check (normalized_name <> ''),
  constraint partners_name_length    check (char_length(name) <= 200)
);
-- Sem coluna de percentual (RAT-D004 revogada; RAT-D015).
create unique index partners_normalized_name_key on public.partners (normalized_name);   -- M-05
create trigger partners_set_updated_at before update on public.partners
  for each row execute function private.set_updated_at();
create trigger partners_audit after insert or update or delete on public.partners
  for each row execute function private.audit_row_change('partner');
create trigger partners_no_delete before delete on public.partners
  for each row execute function private.prevent_mutation();        -- inativar, nunca excluir
alter table public.partners enable row level security;

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  role        public.app_role,          -- NULL = sem papel (nenhum acesso)
  partner_id  uuid references public.partners (id) on delete restrict,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint profiles_partner_role_requires_partner
    check (role is distinct from 'PARTNER' or partner_id is not null),
  constraint profiles_full_name_length
    check (full_name is null or char_length(full_name) between 1 and 200)
);
comment on column public.profiles.role is
  'Fonte única do papel (nunca app_metadata). NULL = usuário sem papel: autentica, mas não acessa nada.';
comment on column public.profiles.partner_id is
  'Sócio representado pelo usuário (RAT-D011). Obrigatório para PARTNER; opcional para os demais (ex.: Administrador que é sócio).';

create unique index profiles_partner_id_key on public.profiles (partner_id) where partner_id is not null;
create index profiles_active_role_idx on public.profiles (role) where active;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger profiles_audit after insert or update or delete on public.profiles
  for each row execute function private.audit_row_change('profile');
alter table public.profiles enable row level security;

-- Perfil criado automaticamente, SEM papel (corrige F-01).
create function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Executa na transação do GoTrue (sem JWT): sem isto, a auditoria marcaria DIRECT.
  perform private.set_audit_context(null, 'SYSTEM', null, 'supabase-auth');
  insert into public.profiles (id, full_name)
  values (new.id, nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name'), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function private.handle_new_user() from public;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Autorização: checagens concentradas em poucas funções (plano 7.2).
create function private.has_role(variadic p_roles public.app_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p
                  where p.id = auth.uid() and p.active and p.role = any (p_roles));
$$;
create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role('ADMINISTRATOR'::public.app_role);
$$;
create function private.can_operate() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role('ADMINISTRATOR'::public.app_role, 'OPERATOR'::public.app_role);
$$;
create function private.can_read_business() returns boolean   -- PARTNER fora até P-02b
language sql stable security definer set search_path = '' as $$
  select private.has_role('ADMINISTRATOR'::public.app_role, 'OPERATOR'::public.app_role, 'VIEWER'::public.app_role);
$$;
create function private.current_partner_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.partner_id from public.profiles p join public.partners s on s.id = p.partner_id
   where p.id = auth.uid() and p.active and s.active;
$$;
-- Para as cinco: revoke execute ... from public; grant execute ... to authenticated.

-- Guarda de alterações de perfil.
create function private.profiles_guard_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'Identidade do perfil é imutável.' using errcode = 'insufficient_privilege';
  end if;
  if new.role is distinct from old.role
     or new.partner_id is distinct from old.partner_id
     or new.active is distinct from old.active then
    perform private.require_audit_reason();     -- motivo obrigatório (exemplo do CA-09)
    -- Serializa mudanças de acesso: evita que duas transações concorrentes
    -- removam, cada uma, "o outro" Administrador.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('financeiro_ultra.access_change'));
  end if;
  return new;
end;
$$;
create trigger profiles_guard_update before update on public.profiles
  for each row execute function private.profiles_guard_update();

-- Guarda de criação de perfil: fecha o caminho "apagar o perfil e reinseri-lo já com papel"
-- (ou inserir com papel para um usuário sem perfil). O trigger do Auth e os procedimentos
-- criam o perfil SEM papel e SEM sócio; só então o UPDATE (com a guarda acima) atribui acesso.
-- Inserir já com papel ou sócio exige o mesmo contexto com motivo e a mesma serialização.
create function private.profiles_guard_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.role is not null or new.partner_id is not null then
    perform private.require_audit_reason();
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('financeiro_ultra.access_change'));
  end if;
  return new;
end;
$$;
create trigger profiles_guard_insert before insert on public.profiles
  for each row execute function private.profiles_guard_insert();
-- Para as duas guardas: revoke execute ... from public.

-- Depois de existir um Administrador ativo, o sistema nunca fica sem nenhum.
create function private.assert_admin_remains()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.role = 'ADMINISTRATOR' and old.active
     and not exists (select 1 from public.profiles p where p.role = 'ADMINISTRATOR' and p.active) then
    raise exception 'A operação deixaria o sistema sem Administrador ativo.' using errcode = 'check_violation';
  end if;
  return null;
end;
$$;
create constraint trigger profiles_admin_remains
  after update or delete on public.profiles
  deferrable initially deferred
  for each row execute function private.assert_admin_remains();
-- Também barra a exclusão (em cascata, pelo Auth) do último Administrador ativo.

-- Procedimentos de acesso da FND (plano 6; P-24: sem tela). Contratos na seção 6.
-- Executados pelo responsável no editor SQL do painel (papel postgres).
--   private.bootstrap_first_admin(p_email text, p_executor_label text) returns text
--   private.set_user_access(p_email text, p_role public.app_role, p_partner_id uuid,
--                           p_active boolean, p_reason text, p_executor_label text) returns void
-- Para os dois: revoke all ... from public, anon, authenticated, service_role.
-- Ambiente local: o seed atribui papéis chamando set_user_access pela CLI
-- (supabase db query --local, conexão como postgres) — seção 7.2, passo 8.

-- RLS
create policy profiles_select_own_or_admin on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));
-- Sem INSERT/UPDATE/DELETE para authenticated na FND (corrige F-02):
-- criação pelo trigger do Auth; mudanças pelo procedimento auditado; remoção só em cascata.

create policy partners_select_business on public.partners
  for select to authenticated
  using ((select private.can_read_business()));
-- Escrita em partners: nenhuma pela API na FND (seed local e testes como postgres).
-- A feature Sócios acrescenta as políticas de escrita do Administrador.
```

Observações:

- O usuário `PARTNER` lê **apenas o próprio perfil** (para a interface mostrar o estado "sem escopo"), e nada mais: negar por padrão até P-02b ([OFICIAL] RAT-D011 + [PENDENTE] P-02b; CA-06).
- O usuário sem papel (`role` nulo) também só lê o próprio perfil (estado "sem vínculo" do plano, E3; CA-08).
- `profiles.id` em cascata com `auth.users` é mantido: um convite nunca aceito pode ser excluído pelo painel. Um usuário com histórico financeiro fica protegido pelas FKs `restrict` das tabelas de negócio (features), por `proof_files.uploaded_by` e pela trava do último Administrador. Política recomendada: **inativar, não excluir**. [PROPOSTA]
- Escrita em `profiles` por `service_role` é revogada (seção 3.6): o runtime da FND não usa a chave secreta (plano 10) e nenhum fluxo legítimo precisa dela. O trigger do Auth e os procedimentos rodam como dono (`postgres`), e a exclusão em cascata a partir de `auth.users` roda com os privilégios do dono da tabela referenciadora; os dois caminhos continuam funcionando (confirmar no pgTAP de "Perfis"). [PROPOSTA]
- Resíduo aceito: o papel `postgres` (dono) pode desligar triggers. Esse acesso é o do responsável pelo projeto, e a mitigação é organizacional (senha do banco só com ele; plano 10), não do schema. [PROPOSTA]
- O trigger em `auth.users` segue o padrão documentado pelo Supabase para criação de perfis; confirmar na E4, contra a documentação vigente, que o projeto hospedado continua permitindo triggers em `auth.users` (ver R-D12).

### 3.4 Tabelas auditadas na FND

| Tabela | Trigger | Colunas redigidas |
|---|---|---|
| `partners` | `audit_row_change('partner')` | — |
| `profiles` | `audit_row_change('profile')` | — |
| `proof_files` | `audit_row_change('proof_file', 'raw_extraction')` | `raw_extraction` (dados pessoais e bancários extraídos; P-20) |

As tabelas das features entram com o mesmo trigger, cada uma na sua migration.

**Regra para toda tabela auditada** [PROPOSTA]: ter PK `id uuid`. Tabelas de associação (`client_partners`, `calculation_partner_balances`) usam chave substituta `id uuid` + `unique` no par natural, em vez de PK composta. Motivo: o trigger genérico identifica a linha por `id`, e `audit_logs.entity_id` é `uuid not null`; com PK composta, toda escrita falharia. Alternativas descartadas: `entity_id` como `text`/`jsonb` (perde o tipo e o índice simples da consulta 8.4) e coluna de identidade por `TG_ARGV` (não resolve PK de duas colunas). O trigger falha com mensagem explícita se a regra for violada (3.2), e o teste de catálogo (12.2) verifica que toda tabela com `audit_row_change` tem coluna `id` do tipo `uuid`.

### 3.5 Comprovantes: `proof_files` e storage (plano 8)

Fluxo em duas fases, para que tabela e bucket nunca divirjam silenciosamente:

```text
route handler (servidor, JWT do usuário)
 1. valida tamanho, extensão e assinatura binária; calcula SHA-256
 2. rpc register_proof_file(sha256, mime, size, original_name)
      ├─ hash já existe → devolve o registro existente (is_duplicate = true); não envia de novo (CA-10)
      └─ hash novo      → cria linha PENDING_UPLOAD com storage_path definido pelo banco
 3. storage.upload('proofs', storage_path, arquivo, { upsert: false })
      └─ a política de INSERT só aceita o caminho de uma linha PENDING_UPLOAD
 4. rpc complete_proof_file_upload(id)
      └─ confere o objeto (existe; tamanho e mimetype iguais) → STORED (idempotente)

O banco garante a coerência ENTRE linha e objeto (caminho, tamanho, tipo declarado),
mas NÃO confere o conteúdo: sha256 e tipo real só são garantidos quando o fluxo passa
pelo route handler (etapa 1). Ver R-D18.
```

```sql
create table public.proof_files (
  id                 uuid primary key default gen_random_uuid(),
  storage_bucket     text not null default 'proofs',
  storage_path       text not null,
  sha256             text not null,
  mime_type          text not null,
  size_bytes         bigint not null,
  original_name      text,
  upload_status      public.proof_upload_status not null default 'PENDING_UPLOAD',
  uploaded_by        uuid not null references public.profiles (id),
  created_at         timestamptz not null default now(),
  stored_at          timestamptz,
  extraction_status  public.proof_extraction_status not null default 'NOT_REQUESTED',  -- P-16 (futuro)
  raw_extraction     jsonb,
  confidence_score   numeric(5, 4),
  extracted_at       timestamptz,
  deleted_at         timestamptz,
  deleted_by         uuid references public.profiles (id),
  deletion_reason    text,
  updated_at         timestamptz not null default now(),

  constraint proof_files_bucket             check (storage_bucket = 'proofs'),
  constraint proof_files_sha256_format      check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint proof_files_sha256_key         unique (sha256),                 -- RN-008 (hash)
  constraint proof_files_storage_path_key   unique (storage_path),
  constraint proof_files_mime               check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  constraint proof_files_path_format        check (storage_path ~ ('^[0-9]{4}/[0-9]{2}/' || id::text || '\.(pdf|jpg|png)$')),
  constraint proof_files_path_matches_mime  check (
       (mime_type = 'application/pdf' and storage_path like '%.pdf')
    or (mime_type = 'image/jpeg'      and storage_path like '%.jpg')
    or (mime_type = 'image/png'       and storage_path like '%.png')),
  constraint proof_files_size               check (size_bytes > 0 and size_bytes <= 4194304),   -- 4 MiB provisório (P-15; ver notas)
  constraint proof_files_original_name_len  check (original_name is null or char_length(original_name) between 1 and 255),
  constraint proof_files_stored_consistency check ((upload_status = 'STORED') = (stored_at is not null)),
  constraint proof_files_confidence_range   check (confidence_score is null or confidence_score between 0 and 1),
  constraint proof_files_deletion_consistency check (
       (deleted_at is null and deleted_by is null and deletion_reason is null)
    or (deleted_at is not null and deleted_by is not null and char_length(btrim(deletion_reason)) > 0))
);
comment on column public.proof_files.storage_path is
  'Definido pelo banco: {aaaa}/{mm}/{id}.{ext} (aaaa/mm do created_at em UTC). Nunca contém o nome original.';

create index proof_files_uploaded_by_idx on public.proof_files (uploaded_by, created_at desc);
create index proof_files_pending_idx     on public.proof_files (created_at) where upload_status = 'PENDING_UPLOAD';

create trigger proof_files_set_updated_at before update on public.proof_files
  for each row execute function private.set_updated_at();
create trigger proof_files_audit after insert or update or delete on public.proof_files
  for each row execute function private.audit_row_change('proof_file', 'raw_extraction');
alter table public.proof_files enable row level security;

-- BEFORE INSERT: o banco define os campos controlados. O cliente só informa
-- sha256, mime_type, size_bytes e original_name (concessão por coluna em 3.6).
create function private.proof_files_before_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.uploaded_by       := auth.uid();
  if new.uploaded_by is null then
    raise exception 'Envio de comprovante exige usuário autenticado.' using errcode = 'insufficient_privilege';
  end if;
  new.upload_status     := 'PENDING_UPLOAD';
  new.stored_at         := null;
  new.created_at        := now();
  new.extraction_status := 'NOT_REQUESTED';
  new.raw_extraction    := null;  new.confidence_score := null;  new.extracted_at := null;
  new.deleted_at        := null;  new.deleted_by := null;        new.deletion_reason := null;
  new.sha256            := pg_catalog.lower(new.sha256);
  new.storage_path      := pg_catalog.to_char(new.created_at at time zone 'UTC', 'YYYY/MM') || '/' || new.id::text
                           || case new.mime_type when 'application/pdf' then '.pdf'
                                                 when 'image/jpeg'      then '.jpg'
                                                 when 'image/png'       then '.png' end;
  return new;
end;
$$;

-- BEFORE UPDATE: imutáveis + transições válidas.
-- SECURITY DEFINER para conferir storage.objects independentemente do RLS do chamador.
create function private.proof_files_guard_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.id, new.storage_bucket, new.storage_path, new.sha256, new.mime_type, new.size_bytes,
      new.original_name, new.uploaded_by, new.created_at)
     is distinct from
     (old.id, old.storage_bucket, old.storage_path, old.sha256, old.mime_type, old.size_bytes,
      old.original_name, old.uploaded_by, old.created_at) then
    raise exception 'Metadados do comprovante são imutáveis.' using errcode = 'insufficient_privilege';
  end if;

  if new.upload_status is distinct from old.upload_status then
    if not (old.upload_status = 'PENDING_UPLOAD' and new.upload_status = 'STORED') then
      raise exception 'Transição de envio inválida: % → %.', old.upload_status, new.upload_status
        using errcode = 'check_violation';
    end if;
    if not exists (
      select 1 from storage.objects o
       where o.bucket_id = 'proofs' and o.name = new.storage_path
         and (o.metadata ->> 'size')::bigint = new.size_bytes
         and o.metadata ->> 'mimetype' = new.mime_type) then
      raise exception 'Arquivo do comprovante ausente ou diferente do registrado.' using errcode = 'check_violation';
    end if;
    new.stored_at := now();
  end if;

  if old.deleted_at is not null
     and (new.deleted_at, new.deleted_by, new.deletion_reason)
         is distinct from (old.deleted_at, old.deleted_by, old.deletion_reason) then
    raise exception 'Exclusão lógica é definitiva.' using errcode = 'insufficient_privilege';
  end if;
  if old.deleted_at is null and new.deleted_at is not null then
    if not private.is_admin() then
      raise exception 'Somente o Administrador exclui comprovantes.' using errcode = 'insufficient_privilege';
    end if;
    new.deleted_at := now();
    new.deleted_by := auth.uid();
  end if;

  -- Campos de extração: sem escrita pela aplicação na FND (a feature de leitura automática define quem grava).
  if (new.extraction_status, new.raw_extraction, new.confidence_score, new.extracted_at)
     is distinct from (old.extraction_status, old.raw_extraction, old.confidence_score, old.extracted_at)
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Campos de extração não são editáveis pela aplicação.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger proof_files_before_insert before insert on public.proof_files
  for each row execute function private.proof_files_before_insert();
create trigger proof_files_guard_update before update on public.proof_files
  for each row execute function private.proof_files_guard_update();
create trigger proof_files_no_delete before delete on public.proof_files
  for each row execute function private.prevent_mutation();       -- exclusão só lógica

-- Funções das políticas de storage (SECURITY DEFINER: leem proof_files sem depender do RLS).
create function private.proof_upload_allowed(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.proof_files f
                  where f.storage_path = p_name and f.upload_status = 'PENDING_UPLOAD' and f.deleted_at is null);
$$;
create function private.proof_readable(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.proof_files f where f.storage_path = p_name and f.deleted_at is null);
$$;

-- RPCs (SECURITY INVOKER: RLS e guardas valem; nenhuma RPC pública SECURITY DEFINER na FND).
--
-- public.register_proof_file(p_sha256 text, p_mime_type text, p_size_bytes bigint, p_original_name text)
--   returns table (proof_file_id uuid, storage_path text, upload_status public.proof_upload_status,
--                  deleted boolean, is_duplicate boolean)
--   1. exige private.can_operate();
--   2. procura por lower(p_sha256); se existir (mesmo excluído logicamente), devolve-o com is_duplicate = true;
--   3. senão INSERT (sha256, mime_type, size_bytes, original_name) e devolve com is_duplicate = false;
--   4. em unique_violation (envio concorrente do mesmo arquivo), relê e devolve com is_duplicate = true.
--
-- public.complete_proof_file_upload(p_proof_file_id uuid) returns public.proof_files
--   1. exige private.can_operate();
--   2. se já STORED, devolve a linha (idempotente);
--   3. senão UPDATE set upload_status = 'STORED' (a guarda confere o objeto no bucket).

-- RLS de proof_files
create policy proof_files_select on public.proof_files
  for select to authenticated using ((select private.can_read_business()));       -- M-04
create policy proof_files_insert on public.proof_files
  for insert to authenticated
  with check ((select private.can_operate()) and uploaded_by = (select auth.uid()));
create policy proof_files_update on public.proof_files
  for update to authenticated
  using ((select private.can_operate())) with check ((select private.can_operate()));

-- Bucket criado pela migration (não pelo config.toml, para haver uma só fonte).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', false, 4194304, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Políticas em storage.objects (só o bucket proofs).
create policy proofs_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'proofs' and (select private.can_operate()) and private.proof_upload_allowed(name));
create policy proofs_select on storage.objects
  for select to authenticated
  using (bucket_id = 'proofs' and (select private.can_read_business()) and private.proof_readable(name));
-- Sem UPDATE e sem DELETE: sem sobrescrita (upsert: false) e sem exclusão física pela API.
```

Notas:

- A URL assinada é gerada no servidor com o cliente do usuário (`createSignedUrl` exige `SELECT` no objeto), com validade curta. [PROPOSTA] (plano 8)
- A unicidade de `sha256` vale também para registros excluídos logicamente: reenviar um arquivo excluído devolve o registro existente (`deleted = true`) e a interface decide. Restaurar comprovante excluído não está previsto na FND. [PROPOSTA]
- Linhas `PENDING_UPLOAD` sem objeto (envio interrompido) são inofensivas: o mesmo hash retoma o envio a partir da etapa 2. A limpeza de pendentes antigos fica para a feature de upload. [PROPOSTA]
- **Limite de tamanho: 4 MiB provisório** (era 10 MiB na revisão 1). O limite está no bucket **e** na constraint; mudar P-15 exige migration nos dois lugares. [PENDENTE] P-15. Motivos da redução [PROPOSTA]:
  - **Vercel (RAT-D016):** o corpo de requisição de uma Function tem limite público de cerca de **4,5 MB** (limite da plataforma, **a confirmar** na documentação atual da Vercel na E7; não verificável nesta modelagem). Arquivo de 4 MiB + cabeçalhos do multipart cabe com folga; 10 MiB não chegaria ao handler.
  - **Proxy do Next 16:** com proxy ativo, o corpo é guardado em memória até `proxyClientMaxBodySize` (padrão 10 MB); acima disso o handler recebe **só o corpo parcial, sem erro** (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/proxyClientMaxBodySize.md`). O matcher atual de `src/proxy.ts` cobre `/api`. Com 4 MiB o limite não é atingido, mas a rota de upload deve sair do matcher (ela valida a sessão por conta própria com `getClaims()`) para que um corpo truncado nunca chegue silenciosamente ao handler. Alternativa: ajustar `proxyClientMaxBodySize` (opção experimental). Em qualquer caso, o handler compara o tamanho recebido com o `Content-Length` e rejeita divergência.
  - Se P-15 pedir arquivos maiores que o limite da Vercel, o caminho muda (envio direto ao Storage por URL de upload assinada), e isso reabre R-D18, porque o hash deixaria de ser calculado no servidor. Decisão junto com P-15.
- **O que o banco garante e o que não garante** [PROPOSTA]: a deduplicação (I-12) é sobre o `sha256` **declarado** na RPC, e `STORED` (I-14) confere tamanho e `mimetype` **declarados** ao Storage (o `mimetype` do objeto vem do cabeçalho do envio). O banco não recalcula hash nem lê assinatura binária. Como Operador e Administrador têm `EXECUTE` em `register_proof_file` e `INSERT` em `storage.objects` com o próprio JWT, quem chamar a API diretamente, sem o route handler do plano 8, pode registrar um hash que não corresponde ao arquivo ou enviar um arquivo cujo conteúdo não bate com o tipo. Risco registrado em R-D18 e encaminhado à revisão `seguranca` (E8b).

### 3.6 Privilégios (lista de permissões)

```sql
-- Revoga tudo e concede só o necessário (corrige F-07).
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

alter default privileges for role postgres in schema public revoke all     on tables    from anon, authenticated;
alter default privileges for role postgres in schema public revoke all     on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

grant select on public.partners, public.profiles, public.audit_logs, public.proof_files to authenticated;
grant insert (sha256, mime_type, size_bytes, original_name)          on public.proof_files to authenticated;
grant update (upload_status, deleted_at, deleted_by, deletion_reason) on public.proof_files to authenticated;
-- deleted_at/deleted_by são sobrescritos pela guarda (relógio do servidor e auth.uid()).

grant execute on function public.register_proof_file(text, text, bigint, text) to authenticated;
grant execute on function public.complete_proof_file_upload(uuid)               to authenticated;
-- service_role mantém os padrões do Supabase (uso só em scripts locais; plano 10), EXCETO
-- escrita em profiles e audit_logs: sem isto, a chave secreta inseriria perfis com papel sem
-- motivo (I-07) e forjaria linhas de auditoria (I-09). Triggers e procedimentos rodam como postgres.
revoke insert, update, delete, truncate on public.profiles, public.audit_logs from service_role;
```

Cada feature acrescenta as próprias concessões na sua migration (nunca `grant all`). O teste de catálogo do CA-05 verifica que `anon` não tem nenhum privilégio em `public`.

---

## 4. Invariantes

### 4.1 Protegidas pelo banco na FND (DDL da seção 3)

| ID | Invariante | Mecanismo | Classificação |
|---|---|---|---|
| I-01 | Toda tabela de `public` tem RLS ativo; `anon` não tem privilégio algum | `enable row level security` + seção 3.6 + teste de catálogo | [PROPOSTA] (CA-05) |
| I-02 | Papel só existe em `profiles.role`; nunca em `app_metadata` | modelo + funções `private.has_role` | [PROPOSTA] (plano 6) |
| I-03 | Usuário novo nasce sem papel (nenhum acesso) | `private.handle_new_user` | [PROPOSTA] |
| I-04 | `PARTNER` ⇒ `partner_id` não nulo | CHECK `profiles_partner_role_requires_partner` | [PROPOSTA] |
| I-05 | Cada sócio tem no máximo um login | índice único parcial `profiles_partner_id_key` | [PROPOSTA] |
| I-06 | O papel `PARTNER` não lê dados de negócio nem arquivos até P-02b | `can_read_business()` exclui `PARTNER`; nenhuma política usa `current_partner_id()` na FND | [OFICIAL] RAT-D011 (só o login próprio do sócio) + [PROPOSTA] (papel Sócio negado por padrão: plano 6 e 17, aprovado) + [PENDENTE] P-02b |
| I-07 | Atribuir ou mudar papel, vínculo ou ativação exige motivo e fica auditado, por UPDATE ou por INSERT | `profiles_guard_update` + `profiles_guard_insert` + `audit_row_change` + escrita revogada de `service_role` (3.6). Resíduo: `postgres` pode desligar triggers (3.3) | [OFICIAL] RAT-D009 + [PROPOSTA] |
| I-08 | Depois do primeiro Administrador, sempre existe ao menos um ativo | constraint trigger `profiles_admin_remains` + trava consultiva | [PROPOSTA] |
| I-09 | A auditoria é append-only: sem `UPDATE`, `DELETE` ou `TRUNCATE`; nenhuma linha inserida fora das funções de auditoria | triggers + ausência de concessões (inclusive `INSERT` revogado de `service_role`) | [OFICIAL] RAT-D009 + [PROPOSTA] |
| I-10 | Todo evento de auditoria tem horário do servidor, ordem total e origem | `created_at default clock_timestamp()`, `seq`, `source not null` | [PROPOSTA] (Brain 10, rascunho: timestamps de servidor) |
| I-11 | Sócio não é excluído fisicamente | `partners_no_delete` | [PROPOSTA] (plano 7.1) |
| I-12 | Um SHA-256 **declarado** é registrado uma única vez. Que o hash corresponda ao conteúdo só é garantido no caminho do route handler (R-D18) | `proof_files_sha256_key` | [OFICIAL] RN-008 + [PROPOSTA] |
| I-13 | O caminho no bucket é definido pelo banco, contém o `id` e nunca o nome original | trigger `before insert` + CHECKs de caminho | [PROPOSTA] (plano 8) |
| I-14 | `STORED` ⇒ o objeto existe no bucket com o tamanho registrado e o `mimetype` declarado no envio. O tipo **real** (assinatura binária) só é garantido no caminho do route handler (R-D18) | `proof_files_guard_update` + `stored_consistency` | [PROPOSTA] |
| I-15 | Metadados do comprovante são imutáveis; exclusão só lógica, definitiva, pelo Administrador e com motivo | guarda + `proof_files_no_delete` + CHECK de exclusão | [PROPOSTA] |
| I-16 | Bucket privado, sem sobrescrita e sem exclusão pela API | `public = false`; sem políticas de UPDATE/DELETE em `storage.objects` | [PROPOSTA] (plano 8) |
| I-17 | Dinheiro e percentual nunca em float | convenção + teste de catálogo (CA-11): nenhuma coluna `real`/`double precision` em `public` | [OFICIAL] Brain 07 |

### 4.2 Para as features (conceituais; cada feature implementa e testa)

| ID | Invariante | Mecanismo sugerido | Classificação |
|---|---|---|---|
| I-20 | Recebimento confirmado tem competência, cliente, recebedor, data, valor > 0 e `receiver_partner_id` | CHECK condicional ao status | [OFICIAL] RN-002, RN-006 + [PENDENTE] P-08 |
| I-21 | Recebimento confirmado tem alocações; não confirmado não tem (forma válida se M-01 confirmar o rateio na confirmação; se o rateio for na apuração, vira "recebimento de competência apurada tem alocações") | constraint trigger diferida (padrão de 07/10) | [OFICIAL] RAT-D006 (snapshot por recebimento) + [PENDENTE] M-01 (momento) |
| I-22 | Σ `allocated_amount` = `amount` do recebimento | constraint trigger diferida | [OFICIAL] Brain 07 |
| I-23 | Número de alocações = `split_count` = n; todas as linhas com o mesmo `split_count` | constraint trigger diferida | [OFICIAL] RAT-D015 + [PROPOSTA] |
| I-24 | Cada `allocated_amount` ∈ {`base`, `base + 0,01`}, com `base = floor(amount_centavos / n) / 100`; `rounding_adjustment` = `allocated_amount − base`; Σ `rounding_adjustment` = `(amount_centavos mod n) / 100` | constraint trigger diferida | [OFICIAL] Brain 07 + [PROPOSTA] (P-17) |
| I-25 | O conjunto de sócios das alocações = sócios indicados no cliente no momento do rateio | verificação na RPC que gera o rateio, com `FOR SHARE` em `client_partners` | [OFICIAL] RAT-D015 + [PENDENTE] M-01 (momento) + [PENDENTE] M-02 (filtro de sócio ativo) |
| I-26 | `receipt_allocations` é imutável | trigger `prevent_mutation` | [OFICIAL] RAT-D006 |
| I-27 | Recebimentos de competência `SETTLED` não mudam; correção só após reabertura auditada. Estender a trava a `CALCULATED` (mudar exige antes voltar a competência para `IN_REVIEW`, o que invalida a apuração) é proposta | guarda em `receipts` lendo o estado da competência | [OFICIAL] RN-014 (`SETTLED`) + [PROPOSTA] (`CALCULATED`; ver P-21) |
| I-28 | Um EndToEnd ID pertence a no máximo um recebimento não cancelado | índice único parcial | [OFICIAL] RN-008 + [PROPOSTA] |
| I-29 | Um comprovante sustenta no máximo um recebimento não cancelado | índice único parcial em `receipts (proof_file_id)` | [PENDENTE] M-03 |
| I-30 | No máximo uma apuração `CURRENT` por competência | índice único parcial | [PROPOSTA] |
| I-31 | Na apuração: Σ `received_amount` = Σ `owed_amount` = `total_received`; Σ `balance` = 0 | constraint trigger diferida | [OFICIAL] RN-010, RN-011 |
| I-32 | Compensações da apuração quitam exatamente os saldos líquidos: para cada sócio, Σ saídas − Σ entradas da versão = `net_balance` | constraint trigger diferida | [OFICIAL] RN-012 + [PROPOSTA] (saldo líquido) |
| I-32b | Compensação `PAID` nunca muda de status nem é anulada por reapuração | guarda de transição | [PROPOSTA] |
| I-33 | Liquidar exige todas as compensações `PAID` ou `JUSTIFIED` e a apuração `CURRENT` com `inputs_fingerprint` igual ao estado atual | RPC de liquidação | [OFICIAL] RN-013, Brain 09 |
| I-34 | Reabertura só pelo Administrador, com motivo; nunca apaga a liquidação anterior | RPC + `competence_reopenings` + `require_audit_reason` | [OFICIAL] Brain 09, RN-014 |
| I-35 | Apelido/identificador ativo resolve para uma única entidade | índices únicos parciais por (`tipo`, `normalized_value`) | [PROPOSTA] |
| I-36 | CNPJ normalizado do cliente é único e válido | coluna gerada + CHECK de DV | [PROPOSTA] + [PENDENTE] P-13 |
| I-37 | Nenhuma tabela guarda percentual como parâmetro (sócio ou cliente) | revisão de schema + teste de catálogo: as únicas colunas de percentual de `public` são as do snapshot | [OFICIAL] RAT-D015, RAT-D004 revogada |

---

## 5. Índices

### 5.1 FND

| Índice | Tabela | Justificativa |
|---|---|---|
| PK `id` | todas | acesso por chave |
| `audit_logs_seq_key` (único) | `audit_logs` | ordem total; paginação estável |
| `audit_logs_entity_idx (entity, entity_id, seq desc)` | `audit_logs` | histórico de uma entidade (consulta 8.4) |
| `audit_logs_actor_idx (actor_user_id, seq desc)` parcial | `audit_logs` | o que um usuário fez |
| `audit_logs_created_at_idx (created_at desc)` | `audit_logs` | auditoria por período |
| `audit_logs_correlation_idx` parcial | `audit_logs` | ligar log técnico (`correlation_id`) à trilha |
| `audit_logs_tx_idx (tx_id)` | `audit_logs` | todos os efeitos de uma operação (RPC) |
| `partners_normalized_name_key` (único) | `partners` | evita sócio duplicado por grafia (M-05) |
| `profiles_partner_id_key` (único parcial) | `profiles` | I-05; busca do usuário de um sócio |
| `profiles_active_role_idx (role) where active` | `profiles` | trava do último Administrador; listagens por papel |
| `proof_files_sha256_key` (único) | `proof_files` | deduplicação (RN-008) |
| `proof_files_storage_path_key` (único) | `proof_files` | políticas de storage procuram por caminho a cada acesso |
| `proof_files_uploaded_by_idx (uploaded_by, created_at desc)` | `proof_files` | FK + "meus envios" |
| `proof_files_pending_idx (created_at) where PENDING_UPLOAD` | `proof_files` | limpeza/retomada de envios interrompidos |

O RLS da FND usa `profiles.id` (PK) em todas as funções; não precisa de índice adicional. FKs `deleted_by` → `profiles` não precisam de índice (sem exclusão de perfil com histórico, sem consulta por esse campo).

### 5.2 Features (orientação)

| Índice | Justificativa |
|---|---|
| `receipts (competence_id, status)` | apuração e listagem por competência |
| `receipts (client_id, competence_id)` | situação do cliente no mês; FK |
| `receipts (receiver_id)`, `receipts (receiver_partner_id, competence_id)` | "Recebido" por sócio |
| único parcial `receipts (end_to_end_id) where status <> 'CANCELLED' and end_to_end_id is not null` | I-28 |
| `receipts (txid)` parcial; `receipts (competence_id, client_id, amount, received_on)` | detecção de duplicidade por combinação (RN-008) |
| único parcial `receipts (proof_file_id) where status <> 'CANCELLED'` | I-29 (se M-03 confirmar) |
| único `receipt_allocations (receipt_id, partner_id)`; `receipt_allocations (partner_id)` | snapshot; "Devido" por sócio |
| único parcial `competence_calculations (competence_id) where status = 'CURRENT'` | I-30 |
| `compensations (calculation_id, status)` | pendências de liquidação |
| únicos parciais por (`alias_type`/`identifier_type`, `normalized_value`) where active | I-35; reconhecimento (08) |
| `client_partners (partner_id)` | FK; "clientes do sócio" (P-02b) |

---

## 6. Contrato do bootstrap do primeiro Administrador

[PROPOSTA] (plano 6 e 10; entregue na E8, revisado na E8b, executado pelo responsável na E9.)

### 6.1 Forma

- **Função no banco**, criada pela migration `0300`: `private.bootstrap_first_admin(p_email text, p_executor_label text) returns text`. Fica no schema `private` (fora do PostgREST) e com `EXECUTE` revogado de `public`, `anon`, `authenticated` e `service_role`: só o dono (`postgres`) executa, ou seja, só quem acessa o editor SQL do painel ou o banco com a senha do projeto.
- **Script versionado** `scripts/sql/bootstrap-first-admin.sql`, que só chama a função dentro de uma transação. O arquivo versionado contém **placeholders**, nunca e-mail real ([OFICIAL] RAT-D019):

```sql
begin;
select private.bootstrap_first_admin(
  '<EMAIL-DO-ADMINISTRADOR>',          -- e-mail do usuário já convidado/criado no painel
  '<IDENTIFICACAO-DE-QUEM-EXECUTA>'    -- ex.: "responsavel-produto via painel"
);
commit;
```

- Ser função (e não um bloco `DO` solto) permite cobrir o contrato com pgTAP na E4/E8.

### 6.2 Comportamento

| Passo | Regra |
|---|---|
| 1. Validação | `p_email` com formato de e-mail e **diferente do placeholder** (rejeita texto com `<` ou `>`); `p_executor_label` não vazio (≤ 200). Falha com `invalid_parameter_value` |
| 2. Serialização | `pg_advisory_xact_lock(hashtext('financeiro_ultra.access_change'))` — a mesma trava das mudanças de acesso |
| 3. Contexto | `private.set_audit_context('Bootstrap do primeiro Administrador', 'SCRIPT', null, p_executor_label)` — **antes de qualquer escrita**, para que todo `ROW_CHANGE` da transação (inclusive o `CREATE` do passo 5) saia com `source = SCRIPT`, motivo e `actor_label`. Só define variáveis da transação; não grava nada |
| 4. Usuário | Exatamente **um** registro em `auth.users` com `lower(email) = lower(btrim(p_email))` e `deleted_at is null`. Zero → erro "crie/convide o usuário no painel primeiro". O e-mail não precisa estar confirmado (o convite pode ainda não ter sido aceito) |
| 5. Perfil | `insert into public.profiles (id) values (...) on conflict (id) do nothing` (sem papel e sem sócio, o que a guarda de INSERT aceita) — cobre o usuário criado **antes** da migration (quando o trigger do Auth ainda não existia) |
| 6. Idempotência | Se o perfil já é `ADMINISTRATOR` e `active`: retorna `'ALREADY_ADMIN'`, **sem escrever nada** (nem auditoria; o passo 5 não escreve, porque o perfil já existe) |
| 7. Só o primeiro | Se existe **outro** Administrador ativo: erro "já existe Administrador; use `private.set_user_access`". O bootstrap nunca serve para criar o segundo Administrador |
| 8. Promoção | `update public.profiles set role = 'ADMINISTRATOR', active = true where id = ...` (gera `ROW_CHANGE` com motivo, `source = SCRIPT`, `actor_label`, `request_role = 'direct:postgres'`) |
| 9. Evento | `private.audit_event('profile', <user_id>, 'BOOTSTRAP_ADMIN', jsonb_build_object('executor', p_executor_label))` — sem o e-mail no payload |
| 10. Retorno | `'PROMOTED'` |

Pós-condições verificáveis (CA-15): exatamente um `ADMINISTRATOR` ativo; um `EVENT` `BOOTSTRAP_ADMIN` e um `ROW_CHANGE` `UPDATE` em `profiles`, com o mesmo `tx_id`, `source = SCRIPT`, motivo e `actor_label`. **Usuário sem perfil prévio:** além desses, um `ROW_CHANGE` `CREATE` em `profiles`, também com `source = SCRIPT`, motivo, `actor_label` e o mesmo `tx_id` (três linhas no total). Segunda execução retorna `'ALREADY_ADMIN'` e não cria linhas na auditoria.

### 6.3 Procedimento geral de acesso (FND, sem tela — P-24)

`private.set_user_access(p_email, p_role, p_partner_id, p_active, p_reason, p_executor_label)`, mesmas permissões do bootstrap:

- exige `p_reason` e `p_executor_label` não vazios e define o contexto com `source = SCRIPT` **antes de qualquer escrita** (mesma regra do passo 3 do bootstrap);
- localiza o usuário como no passo 4; cria o perfil (sem papel) se faltar;
- aplica `role`, `partner_id` e `active` num único `UPDATE` (a guarda exige motivo e serializa; as CHECKs exigem sócio para `PARTNER`; a trava impede ficar sem Administrador);
- grava `EVENT` `ACCESS_CHANGE` com papel e sócio anteriores e novos;
- se nada mudou, não escreve (idempotente).

Quando a feature de gestão de usuários existir (P-24), uma RPC pública restrita ao Administrador substitui o uso do editor SQL, reaproveitando as mesmas guardas.

---

## 7. Plano de migration (linha de base — RAT-D012)

[OFICIAL] RAT-D012 (refazer a base uma única vez, antes do primeiro ambiente publicado; preservar o código antigo; nada removido sem aprovação) + plano 7.5. Forma: [PROPOSTA].

### 7.1 Pré-condições

1. E0 concluída até o passo 4: **existe commit git** com o estado de 07/10 (mais as correções da E0). É ele que torna o arquivamento reversível. Sem esse commit, a E4 não começa.
2. Nenhum projeto Supabase remoto recebeu as migrations de 07/10 (plano 1.1: não existe ambiente remoto). Se isso mudar antes da E4, o plano volta para `modelagem-dados`.
3. Este documento aprovado no G1.

### 7.2 Ordem

| Passo | Ação | Observação |
|---|---|---|
| 1 | Criar `docs/legado/07-10/` com um `README.md` curto: origem (especificação de 07/10), motivo do arquivamento (RAT-D012), aviso "não aplicar" | |
| 2 | **Mover** (não apagar) `supabase/migrations/20261007000100` … `0700` para `docs/legado/07-10/supabase/migrations/` | Fora do caminho que o CLI aplica: nenhum `db push`/`db reset` as executa (plano 7.5; R-21) |
| 3 | Mover `supabase/tests/database/01_integrity_and_rls.test.sql` para `docs/legado/07-10/supabase/tests/database/` | |
| 4 | Mover `supabase/seed.sql` para `docs/legado/07-10/supabase/seed.sql` | O seed antigo usa `indicators`, `finance_settings` e 50/25/25 (CA-16) |
| 5 | Copiar `src/types/database.types.ts` para `docs/legado/07-10/src/types/` e regenerar o arquivo ativo a partir do novo schema (`npm run db:types`) | O código antigo que ainda importa os tipos sai do caminho ativo na E5/E6 (plano 14) |
| 6 | `scripts/seed-dev.ts` (chama RPCs antigas): mover para `docs/legado/07-10/scripts/` e escrever um novo, só com nomes fictícios (RAT-D019) | Coordenar com a E5 |
| 7 | Criar as 5 migrations da seção 3 (`AAAAMMDD000100` … `000500`) | Timestamps posteriores a `20261007…`, para não colidir com nenhum histórico local |
| 8 | Novo `supabase/seed.sql`: só dados fictícios — ex.: sócios "Sócio Exemplo A/B/C", nenhum percentual, **nenhum usuário**. Usuários e papéis pelo novo `seed-dev`, em duas fases: (a) cria usuários fictícios pela API admin do Auth local (padrão atual: `supabase-js` com a chave secreta local, recusando URL não local); o trigger cria os perfis sem papel; (b) atribui papéis executando um SQL versionado (ex.: `scripts/sql/seed-dev-access.sql`, só e-mails fictícios do domínio reservado `example.com`) com `supabase db query --local -f <arquivo>` — subcomando existente na CLI 2.120 instalada, que conecta como `postgres` e por isso pode chamar `private.set_user_access`. Sem dependência nova (plano 13.2) e sem expor o schema `private`. O script **fixa** `--local` e nunca aceita `--linked`/`--db-url`. Confirmar na E4 que a conexão do `db query --local` usa o papel `postgres` | [OFICIAL] RAT-D019 + [PROPOSTA] (forma) |
| 9 | Novos pgTAP por tema (seção 12) | |
| 10 | `supabase db reset` + `supabase test db` + `supabase db lint` + `supabase db advisors` | CA-04 |

### 7.3 Compatibilidade

- **Banco local:** `db reset` recria tudo; os dados locais de 07/10 são fictícios e descartáveis. Não há dado real em lugar nenhum (plano 1.1). Portanto **não há perda de dados a tratar**.
- **Banco remoto:** não existe; a primeira aplicação remota será a da nova linha de base, pelo workflow da E9 (plano 10).
- **Código:** a tela e os serviços antigos dependem das tabelas antigas e saem do caminho ativo na E5/E6. Entre a E4 e a E5 o `typecheck` pode quebrar nesses arquivos; a E4 e a E5 devem fechar juntas antes de qualquer commit na branch principal, ou os arquivos antigos devem sair do `tsconfig` ativo junto com a E4. [PROPOSTA]
- **Depois da primeira aplicação remota:** forward-only, expand/contract, nunca editar migration aplicada (plano 7.5).

### 7.4 Backfill

Nenhum. A linha de base começa vazia. Os únicos dados iniciais são: o bucket `proofs` (migration, idempotente com `on conflict`) e o primeiro Administrador (bootstrap, idempotente — seção 6).

### 7.5 Validação

- `supabase db reset` sem erro, duas vezes seguidas (idempotência do bucket e do seed).
- Teste de catálogo: nenhuma tabela/coluna de 07/10 (`indicators`, `companies`, `finance_settings`, `distribution_mode`, `default_percentage`, `custom_percentage`) existe no schema ativo (CA-16; I-37).
- `ls supabase/migrations` só contém os arquivos novos; `docs/legado/07-10/` contém os 7 antigos + teste + seed + tipos (contagem conferida).
- pgTAP verdes (seção 12).

### 7.6 Rollback

- Antes de qualquer ambiente remoto: `git revert`/`git checkout` do commit da E4 restaura `supabase/migrations/` antigo; `db reset` recria o banco de 07/10. Nada se perde, porque os arquivos foram movidos e o histórico git preserva o estado anterior.
- Depois do primeiro ambiente remoto: rollback = nova migration corretiva (plano 7.5). Não há "down migration".

---

## 8. Consultas críticas

### 8.1 Autorização do usuário corrente (FND)

```sql
select p.role, p.active, p.partner_id, s.name as partner_name, s.active as partner_active
  from public.profiles p
  left join public.partners s on s.id = p.partner_id   -- PARTNER não lê partners: a interface usa só o role
 where p.id = auth.uid();
```

Estados para a interface (E3): `role is null` → "sem vínculo"; `active = false` → bloqueado; `role = 'PARTNER'` → "acesso de sócio ainda não definido" (P-02b).

### 8.2 Deduplicação de comprovante (FND)

```sql
select id, upload_status, deleted_at is not null as deleted
  from public.proof_files
 where sha256 = lower($1);         -- usa proof_files_sha256_key
```

### 8.3 Envios interrompidos (FND)

```sql
select id, storage_path, uploaded_by, created_at
  from public.proof_files
 where upload_status = 'PENDING_UPLOAD' and created_at < now() - interval '1 day';
```

### 8.4 Trilha de uma entidade e de uma operação (FND)

```sql
-- histórico de um perfil
select seq, created_at, kind, action, reason, source, actor_user_id, actor_role, actor_label,
       previous_data, new_data
  from public.audit_logs
 where entity = 'profile' and entity_id = $1
 order by seq desc;

-- tudo o que uma operação gravou (mesma transação)
select * from public.audit_logs where tx_id = $1 order by seq;
```

### 8.5 Ledger por competência (feature Apuração) — sinal de RN-010

Convenção (perspectiva do sócio): **positivo = deve transferir**, negativo = deve receber. [OFICIAL] RN-010.

```sql
create view public.partner_ledger with (security_invoker = true) as
-- Recebido: o sócio do recebedor recebeu o dinheiro (+)
select r.competence_id, r.receiver_partner_id as partner_id, 'RECEIVED' as entry_type,
       r.amount as amount, r.id as receipt_id, null::uuid as compensation_id
  from public.receipts r
 where r.status = 'CONFIRMED'
union all
-- Devido: direito econômico do sócio (−)
select r.competence_id, a.partner_id, 'ENTITLED', -a.allocated_amount, r.id, null
  from public.receipt_allocations a
  join public.receipts r on r.id = a.receipt_id and r.status = 'CONFIRMED'
union all
-- Compensação paga: quem pagou reduz o que deve (−); quem recebeu reduz o que tem a receber (+).
-- Entram TODAS as compensações PAID, inclusive as de apurações SUPERSEDED: é dinheiro que
-- efetivamente mudou de mãos e continua valendo depois de uma reabertura.
select c.competence_id, k.from_partner_id, 'COMPENSATION_PAID', -k.amount, null, k.id
  from public.compensations k join public.competence_calculations c on c.id = k.calculation_id
 where k.status = 'PAID'
union all
select c.competence_id, k.to_partner_id, 'COMPENSATION_RECEIVED', k.amount, null, k.id
  from public.compensations k join public.competence_calculations c on c.id = k.calculation_id
 where k.status = 'PAID';
```

Consequência para a reapuração depois de uma reabertura: o saldo a compensar na nova versão é o saldo **líquido** do ledger (recebido − devido − pago + recebido em compensações anteriores), e não o bruto. Ver `calculation_partner_balances` (seção 2.4) e R-D05.

### 8.6 Saldo por sócio na competência (apuração)

Saldo **bruto** (recebido − devido). Na primeira apuração ele é o que as compensações quitam; em reapurações, somar as compensações já pagas (`partner_ledger`, 8.5) para obter o saldo líquido.

```sql
with received as (
  select r.receiver_partner_id as partner_id, sum(r.amount) as received
    from public.receipts r
   where r.competence_id = $1 and r.status = 'CONFIRMED'
   group by 1),
owed as (
  select a.partner_id, sum(a.allocated_amount) as owed
    from public.receipt_allocations a
    join public.receipts r on r.id = a.receipt_id
   where r.competence_id = $1 and r.status = 'CONFIRMED'
   group by 1)
select coalesce(rc.partner_id, ow.partner_id) as partner_id,
       coalesce(rc.received, 0)                         as received_amount,
       coalesce(ow.owed, 0)                             as owed_amount,
       coalesce(rc.received, 0) - coalesce(ow.owed, 0)  as balance   -- RN-010
  from received rc
  full join owed ow on ow.partner_id = rc.partner_id;
```

Verificação de soma zero (RN-011), que deve dar exatamente `0.00` (sem diferença de arredondamento, porque I-22 garante Σ alocações = Σ recebimentos):

```sql
select sum(balance) from (<consulta 8.6>) s;   -- = 0.00
```

O exemplo do Brain 07 (A = +2.000; B = −1.000; C = −1.000) vira teste obrigatório desta consulta.

### 8.7 Saldo acumulado (todas as competências até a atual)

```sql
select l.partner_id, sum(l.amount) as balance
  from public.partner_ledger l
  join public.competences c on c.id = l.competence_id
 where c.reference_month <= $1
 group by l.partner_id;
```

### 8.8 Candidatos a duplicidade de recebimento (RN-008)

```sql
select r.id, r.status, r.amount, r.received_on, r.client_id, r.receiver_id, r.txid, r.end_to_end_id
  from public.receipts r
 where r.status <> 'CANCELLED'
   and (   (r.end_to_end_id = $e2e)
        or (r.txid = $txid)
        or (r.bank_authentication = $auth)
        or (r.proof_file_id = $proof_file_id)
        or (r.competence_id = $comp and r.client_id = $client and r.amount = $amount
            and r.received_on = $date));
```

As colisões por identificador bancário bloqueiam (I-28); as colisões por combinação (cliente + valor + data) só alertam e vão para revisão humana ([OFICIAL] RAT-D008).

### 8.9 Pendências de liquidação

```sql
select k.id, k.from_partner_id, k.to_partner_id, k.amount, k.status
  from public.compensations k
  join public.competence_calculations c on c.id = k.calculation_id
 where c.competence_id = $1 and c.status = 'CURRENT' and k.status = 'PENDING';
```

---

## 9. Escala do percentual efetivo e registro do resíduo (P-17)

### 9.1 Regra

[OFICIAL] RAT-D015: cada recebimento de um cliente com n sócios indicados é dividido em 1/n. Brain 07 (ativo): valor pela fração exata, fechado em centavos, resíduo determinístico e registrado; parcelas diferem no máximo 1 centavo.

### 9.2 Representação proposta — [PROPOSTA] (responde P-17)

| Coluna (`receipt_allocations`) | Tipo | Conteúdo | Uso |
|---|---|---|---|
| `split_count` | `smallint`, `1 ≤ n ≤ 100` | o **n** aplicado | **Fonte exata** do percentual efetivo: a fração 1/n, sem dízima |
| `effective_percentage` | `numeric(9,6)`, coluna gerada `round(100::numeric / split_count, 6)` | 1/n em percentual com 6 casas: 50.000000, 33.333333, 25.000000 | Exibição, relatórios e atendimento a RAT-D006 ("salvar o percentual aplicado"). **Nunca** é usado para calcular valor |
| `allocated_amount` | `numeric(14,2)` | parcela final do sócio | "Devido" |
| `rounding_adjustment` | `numeric(14,2)` ∈ {0.00, 0.01} | centavo residual recebido por este sócio | Registro do resíduo (Brain 07) |
| `receipts.allocation_rule` | enum `EQUAL_SPLIT_V1` | versão da regra (fração exata + maior resto + desempate determinístico por recebimento) | Reprodutibilidade: uma mudança futura de regra cria `V2` sem reescrever o histórico (RAT-D006) |

Por que não guardar só o percentual arredondado (como em 07/10, `numeric(7,4)`): 33,3333% × 3 = 99,9999%; calcular o valor a partir dele gera o desvio medido no plano (R$ 100.000,00 → 10 centavos de diferença). Com `split_count`, o percentual guardado é a própria fração, e a soma das partes é exata por construção.

A soma de `effective_percentage` **não** é invariante (33,333333 × 3 = 99,999999). A invariante é estrutural: número de linhas = `split_count` (I-23). A interface mostra "1/3 (33,33%)". [PROPOSTA]

Por que 6 casas: com n ≤ 100, 6 casas distinguem qualquer 1/n de 1/(n+1) e cabem em `numeric(9,6)`; mais casas não acrescentam informação, já que a fonte exata é `split_count`. [PROPOSTA]

### 9.3 Algoritmo de alocação (domínio TS — E6; verificado pelo banco na feature Rateio)

```text
centavos      = amount × 100                       (inteiro)
base          = floor(centavos / n)                (inteiro)
resto         = centavos mod n                     (0 ≤ resto < n)
ordem         = sócios ordenados por hash(receipt_id : partner_id)   (desempate determinístico; plano 7.3)
os `resto` primeiros da ordem recebem base + 1; os demais, base
rounding_adjustment = 0,01 para quem recebeu +1; 0,00 para os demais
```

Equivale ao maior resto com pesos 1/1/…/1 (todos os restos empatam; decide a ordem). Exemplos (valores ilustrativos):

| Valor | n | Parcelas | Σ `rounding_adjustment` |
|---|---|---|---|
| R$ 1.000,00 | 3 | 333,34 + 333,33 + 333,33 | 0,01 |
| R$ 100.000,00 | 3 | 33.333,34 + 33.333,33 + 33.333,33 | 0,01 |
| R$ 1.000,00 | 2 | 500,00 + 500,00 | 0,00 |
| R$ 0,02 | 3 | 0,01 + 0,01 + 0,00 | 0,02 |

O último caso mostra que uma parcela pode ser zero: `allocated_amount >= 0` (não `> 0`). [PROPOSTA]

O banco verifica I-22, I-23 e I-24 (a forma das parcelas), mas **não** recalcula qual sócio recebeu o centavo: essa escolha é do domínio e é coberta por teste de propriedade (plano 2: o banco verifica, o domínio decide). Para auditoria posterior, a ordem é reproduzível a partir de `receipt_id`, `partner_id` e `allocation_rule`. [PROPOSTA]

### 9.4 Efeito do resíduo na apuração

O resíduo nunca cria nem destrói dinheiro: Σ alocações = Σ recebimentos (I-22). Por isso a soma dos saldos (RN-011) fecha em **exatamente zero**, sem a "diferença controlada de arredondamento" que RN-011 admite. O que pode existir é um viés acumulado de centavos para um sócio; a consulta abaixo o torna visível:

```sql
select a.partner_id, sum(a.rounding_adjustment) as residual_received
  from public.receipt_allocations a
  join public.receipts r on r.id = a.receipt_id
 where r.competence_id = $1 and r.status = 'CONFIRMED'
 group by a.partner_id;
```

---

## 10. Riscos de dados

| ID | Tipo | Risco | Severidade | Mitigação |
|---|---|---|---|---|
| R-D01 | Perda | Arquivar as migrations antigas antes de existir commit git torna o estado de 07/10 irrecuperável se algo falhar | Alta | Pré-condição 7.1-1 (commit da E0 antes da E4); mover, nunca apagar |
| R-D02 | Perda | Um `db push` acidental das migrations antigas (integração GitHub/Branching ou arquivos esquecidos em `supabase/migrations/`) cria o schema divergente no remoto | Alta | Arquivamento em `docs/legado/07-10/`; teste de catálogo (7.5); não ativar integração/Branching (plano 14.1) |
| R-D03 | Inconsistência | Recebedor muda de sócio depois de recebimentos confirmados e reescreve o "Recebido" histórico | Alta | Snapshot `receipts.receiver_partner_id` (F-09) |
| R-D04 | Inconsistência | Sócio inativado, ou indicação removida, muda o n de clientes ativos sem ninguém perceber | Média | M-02 (proposta: bloquear inativação com indicação ativa); snapshot por recebimento já protege o histórico |
| R-D05 | Inconsistência | Reabertura depois de compensações pagas: anular as compensações pagas ou recalcular pelo saldo bruto duplicaria transferências | **Alta** | Compensação `PAID` é definitiva (I-32b); reapuração pelo saldo líquido (`net_balance`); ledger inclui todas as compensações pagas |
| R-D06 | Duplicação | Mesmo comprovante enviado duas vezes, inclusive em paralelo | Média | `sha256` único + tratamento de `unique_violation` na RPC (3.5) |
| R-D07 | Duplicação | Mesmo pagamento lançado manualmente e por comprovante | Média | EndToEnd único entre não cancelados (I-28); alerta por combinação (8.8); revisão humana |
| R-D08 | Divergência tabela × bucket | Objeto enviado sem registro, ou registro `STORED` sem objeto | Média | Duas fases; política de INSERT só para caminho pendente; `STORED` exige objeto (I-14); exclusão física bloqueada |
| R-D09 | Concorrência | Dois Administradores se removem simultaneamente | Média | Trava consultiva + constraint trigger diferida (I-08) |
| R-D10 | Concorrência | Confirmação de recebimento concorrente com mudança de sócios do cliente ou com a apuração | Média (features) | RPC de confirmação com `FOR SHARE` em `client_partners`/`clients` e `FOR UPDATE` na competência; apuração com `FOR UPDATE` na competência; `inputs_fingerprint` (I-33) |
| R-D11 | Vazamento (LGPD) | A auditoria copia dados pessoais (documentos, extrações de OCR) e é append-only, o que dificulta atender retenção/eliminação | Média | Colunas redigidas por tabela (`raw_extraction` já na FND); documentos de sócios/recebedores entram na feature com decisão de P-20; retenção P-18 |
| R-D12 | Plataforma | O Supabase hospedado restringir triggers em `auth.users` ou escrita em `storage.buckets`/políticas de `storage.objects` por migration | Média | Confirmar na E4 contra a documentação vigente (`node_modules`/docs do Supabase CLI); alternativa: criar o bucket por `config.toml` + `supabase config push` e o perfil sob demanda no bootstrap (passo 5 já cobre usuário sem perfil) |
| R-D13 | Forjamento | `source` e `correlation_id` da auditoria podem ser influenciados pelo cliente | Baixa | Documentados como informativos; ator e papel vêm do JWT e do banco |
| R-D14 | Performance | Funções de RLS chamadas por linha; auditoria crescendo indefinidamente | Baixa (volume de empresa única) | `(select fn())` nas políticas (cache por consulta); índices de 5.1; retenção/particionamento por período só se P-18 pedir |
| R-D15 | Fuso | Recebimento de 31/10 23h30 (São Paulo) gravado como 01/11 UTC cai na competência errada | Média (features) | `received_on` é `date` informada (não derivada de `timestamptz`); fuso oficial em P-19 |
| R-D16 | Formato | CNPJ alfanumérico (desde jul/2026) rejeitado por normalização só numérica | Média (feature Clientes) | P-13; normalização para maiúsculas alfanuméricas |
| R-D17 | Regra | `split_count` grande (cliente com muitos sócios) e valor pequeno geram parcelas zero | Baixa | Permitido (`allocated_amount >= 0`); teste de borda (9.3) |
| R-D18 | Integridade do comprovante | Operador ou Administrador que chame a API direto com o próprio JWT (sem o route handler) registra um `sha256` que não corresponde ao arquivo, ou envia conteúdo que não bate com o tipo declarado. Efeitos: duplicata não detectada (RN-008), arquivo de outro tipo servido como PDF/imagem, ou um hash "reservado" que faria um envio legítimo posterior parecer duplicado | Média | **Na FND:** documentado com precisão em I-12/I-14 e 3.5; os papéis com escrita são internos e autenticados, e toda escrita fica auditada com ator e `request_role`. **Encaminhado à `seguranca` (E8b)** para decidir entre: (a) aceite formal do risco, pelo caráter interno do papel; (b) verificação posterior no servidor (feature de upload): baixar o objeto `STORED`, recalcular SHA-256 e assinatura binária e marcar divergência (exigiria colunas novas, ex.: `content_verified_at`, por migration aditiva); (c) upload só pelo servidor com credencial própria, o que contraria a decisão do plano 10 de não usar a chave secreta no runtime. Proposta desta modelagem: (a) na FND + (b) na feature de upload. [PROPOSTA] |
| R-D19 | Plataforma / truncamento | Arquivo no limite chega truncado ao route handler (proxy do Next guarda até 10 MB e depois entrega corpo parcial **sem erro**) ou é recusado pela Vercel (corpo de Function limitado a cerca de 4,5 MB — a confirmar) | Média (E7) | Limite provisório reduzido para 4 MiB (3.5); rota de upload fora do matcher do proxy; handler compara bytes recebidos com `Content-Length`; teste de upload no tamanho máximo e acima dele (12.4) |
| R-D20 | Escalada de acesso | Apagar um perfil e reinseri-lo já com papel (ou inserir com papel para um usuário sem perfil) contornaria a guarda de UPDATE | Baixa | Guarda `profiles_guard_insert` (motivo + serialização) e escrita em `profiles` revogada de `service_role` (3.3, 3.6); resíduo: `postgres` pode desligar triggers (acesso do responsável) |
| R-D21 | Auditoria inutilizável | O trigger genérico identifica a linha por `id`; tabela auditada com PK composta faria toda escrita falhar | Média (features) | Regra "toda tabela auditada tem `id uuid`" (3.4); `client_partners` e `calculation_partner_balances` com chave substituta; erro explícito no trigger; teste de catálogo (12.2) |

---

## 11. Divergências encontradas (Brain × plano × esta modelagem)

O Brain e o plano **não foram editados** (regra da tarefa). Itens para o responsável/`engenheiro-software` registrarem. A coluna "Situação" reflete o plano revisão 6 e o Brain em 22/10/2026.

| # | Onde | Divergência | Sugestão | Situação |
|---|---|---|---|---|
| D-01 | Plano 14 (E2) e 19 | A DDL da FND é "só o transversal", mas `profiles.partner_id` precisa de FK para `partners`, que não está na lista | Incluir `partners` **mínima** (id, nome, ativo) na linha de base da FND, como nesta proposta (seção 3.3). Alternativa: criar `partner_id` só na feature Sócios (expand), o que deixa CA-06 sem testar o vínculo | **Aceita** pelo planejamento (plano rev. 6, E4) |
| D-02 | Plano 6 ("Estrutura") | `profiles(user_id, role, partner_id NULL, active)` não diz o papel de um usuário recém-criado. O código antigo dava `SOCIO` | `role` anulável: nulo = sem papel (I-03). Atende o estado "sem vínculo" do CA-08 | Aberta (proposta desta modelagem) |
| D-03 | Plano 6 / código de 07/10 | O código antigo permite ao Administrador alterar perfis pela API; o plano diz "procedimento documentado e auditado" | Sem `UPDATE` em `profiles` pela API na FND; procedimento `private.set_user_access` com motivo (6.3) | Aberta (proposta desta modelagem) |
| D-04 | Plano 9 | Lista de origens `ui/importação/sistema/script`; campo `created_at`; ação `LIQUIDATE` | Acrescentar `DIRECT` (SQL sem contexto). Acrescentar `seq`, `tx_id`, `actor_label`, `request_role`, `kind`. Manter o nome `created_at` (revisão 1 desta modelagem o havia trocado por `occurred_at`; voltou ao nome do plano), com padrão `clock_timestamp()`. Ação de liquidação = `SETTLE` em vez de `LIQUIDATE`, pelo mesmo radical de `SETTLED`/`competence_settlements` (lista do plano é exemplificativa) | Aberta (proposta desta modelagem) |
| D-05 | Plano 9 | Correlação só por `set_config` na RPC | Também pelo cabeçalho `x-correlation-id` (escritas diretas em tabela via PostgREST) | Aberta (proposta desta modelagem) |
| D-06 | Plano 8 | `sha256` "único", sem dizer o que acontece com registros excluídos logicamente | Unicidade inclui excluídos; reenvio devolve o registro existente (3.5) | Aberta (proposta desta modelagem) |
| D-07 | Brain 06 (rascunho) | `settlements` (from/to/amount/status) corresponde à **Compensação** do Brain 02; "Liquidação" é outro conceito | `compensations` + `competence_settlements` | Aberta (Brain 06 é rascunho) |
| D-08 | Brain 06 (rascunho) | `parts` / `part_aliases` / `client_parts.enabled` / `client_parts.custom_percentage` | `partners` / `partner_aliases` / `client_partners.active`; sem `custom_percentage` (RAT-D015) | Parcial: o Brain 06 anota que `custom_percentage` deixou de existir; os nomes `parts`/`client_parts` seguem no rascunho |
| D-09 | Brain 06 (rascunho) | `receipt_allocations.effective_percentage` sem escala; sem registro do resíduo | Seção 9 (`split_count`, `numeric(9,6)` gerado, `rounding_adjustment`) | Aberta (Brain 06 é rascunho) |
| D-10 | Brain 05 (ativo) | "Configurações → Regras de divisão" ainda listado; com RAT-D015 não há regra configurável | Anotar no Brain que o submódulo deixou de existir (ou vira só exibição da regra 1/n) | **Resolvida** no Brain 05 (nota de 22/10: o submódulo deixou de existir) |
| D-11 | Brain 10 (rascunho) | Administrador "altera percentuais" | Já apontado no plano 6; anotar no Brain | **Resolvida** no Brain 10 (nota de 22/10) |
| D-12 | Brain 11, RAT-D015 | O corpo diz que RAT-D015 "coloca RAT-D004 em revisão", mas RAT-D004 está **revogada** (nota na própria RAT-D004 e "Regra final") | Ajustar a frase para "revoga RAT-D004" | **Resolvida** no Brain 11 (RAT-D015 agora diz "revoga RAT-D004") |
| D-13 | Brain 03, RN-011 | Admite "diferenças controladas de arredondamento" na soma dos saldos | Com I-22, a soma é exatamente zero; a ressalva pode ficar, mas não deve ser usada como tolerância em teste | Aberta (Brain 03 mantém a ressalva) |
| D-14 | Brain 09 | Reabertura deve registrar "impacto financeiro", que só é conhecido depois da nova apuração | P-21: registrar o snapshot invalidado na reabertura e o diff na liquidação seguinte | Aberta (P-21) |
| D-15 | Plano 3 | Rota de exemplo `(app)/<modulo>/ clientes, partes…` | Usar `socios` (RAT-D017) | **Aceita** (plano rev. 6, seção 3: `socios`) |
| D-16 | Plano 14 (E4) | Lista só migrations e pgTAP para arquivar | Também `seed.sql`, `src/types/database.types.ts` e `scripts/seed-dev.ts` (7.2, passos 4 a 6) | **Aceita** (plano rev. 6, E4) |
| D-17 | Plano 1.3, linha 25 | `competency_companies` (valor esperado por cliente no mês) fora do Brain | Não incluído no modelo; decidir na feature Competências junto com P-10 e P-12 | Aberta (feature Competências) |
| D-18 | Plano 6 (matriz) e P-15/P-20 | "Leitura geral" do Visualizador inclui abrir o arquivo do comprovante? | M-04. Esta proposta segue a matriz aprovada (Visualizador lê), sujeita à revisão de segurança | Aberta (M-04) |
| D-19 | Brain 09 (ativo) × M-01 | Brain 09: "Apurada: Motor de rateio executado e compensações calculadas", o que liga a execução do rateio à apuração. A M-01 propõe gerar o snapshot na confirmação do recebimento (como em 07/10) | Decidir M-01 citando o Brain 09. Se o rateio for na apuração, I-21 e I-25 mudam de gatilho (2.5, 4.2); a estrutura de `receipt_allocations` não muda | Aberta (M-01) |
| D-20 | Plano 8 ("Upload mediado pelo servidor") | O modelo não obriga o caminho do servidor: Operador/Administrador conseguem chamar `register_proof_file` e o Storage direto, e o banco não confere hash nem tipo real | R-D18: aceite formal na FND + verificação posterior na feature de upload; decisão da `seguranca` (E8b) | Aberta (E8b) |
| D-21 | Plano 8 ("Limites do Next 16") e P-15 | O plano conclui que o route handler resolve o limite do proxy, mas o route handler também passa pelo proxy quando o matcher cobre `/api` (corpo truncado sem erro acima de 10 MB); e a Vercel limita o corpo de Function a cerca de 4,5 MB (a confirmar). O valor provisório de 10 MiB não cabia | Limite provisório de 4 MiB; rota de upload fora do matcher; teste no tamanho máximo (3.5, 12.4) | Aberta (registrar no plano) |
| D-22 | Plano 7.6 / 14 (E4: "novo seed local") | O plano não diz como o seed local atribui papéis; o `seed-dev` atual grava `profiles` pelo PostgREST, o que o modelo novo impede (escrita revogada, guarda exige motivo, schema `private` não exposto) | `seed-dev` em duas fases: usuários pela API admin do Auth local; papéis por `supabase db query --local -f` chamando `private.set_user_access` (7.2, passo 8) | Aberta (registrar no plano) |

---

## 12. Handoff ao desenvolvedor

### 12.1 E4 — linha de base do banco

- [ ] Confirmar a pré-condição 7.1 (commit da E0 existente; nenhum remoto com o schema antigo).
- [ ] Arquivar em `docs/legado/07-10/` (mover, não apagar): 7 migrations, `01_integrity_and_rls.test.sql`, `seed.sql`, cópia de `database.types.ts`, `scripts/seed-dev.ts`; criar `README.md` do arquivo (7.2).
- [ ] Criar as migrations `000100` a `000500` a partir da seção 3, respeitando a ordem de dependência (a política `audit_logs_select_admin` só depois de `private.is_admin`).
- [ ] Reaproveitar `set_updated_at`, `normalize_alias`, `prevent_mutation` e `to_money` sem mudar comportamento; não trazer `to_percentage`, `normalize_cnpj`, `is_valid_cnpj` nem os enums de 07/10.
- [ ] Implementar os corpos de `private.bootstrap_first_admin` e `private.set_user_access` conforme a seção 6, com `revoke all` de `public`, `anon`, `authenticated` e `service_role`.
- [ ] `revoke`/`grant` exatamente como 3.6 (lista de permissões; `alter default privileges for role postgres`).
- [ ] Novo `seed.sql` só com sócios fictícios, sem percentuais e sem usuários (RAT-D019); novo `seed-dev` em duas fases (7.2, passo 8): usuários fictícios pela API admin do Auth **local**; papéis por `supabase db query --local -f scripts/sql/seed-dev-access.sql`, que chama `private.set_user_access` com motivo e `p_executor_label = 'seed-dev'`. Fixar `--local`; nunca `--linked`/`--db-url`. Confirmar que a conexão usa o papel `postgres`.
- [ ] Toda tabela auditada tem PK `id uuid` (3.4); associações usam chave substituta + `unique` no par natural.
- [ ] Guardas `profiles_guard_update` **e** `profiles_guard_insert`; `revoke insert, update, delete, truncate` em `profiles` e `audit_logs` de `service_role` (3.6).
- [ ] Bootstrap e `set_user_access`: `set_audit_context` antes de qualquer escrita (6.2, passo 3).
- [ ] `npm run db:types`.
- [ ] Verificar R-D12 (trigger em `auth.users`, `storage.buckets` e políticas em `storage.objects` por migration) contra a documentação vigente antes de concluir.

### 12.2 pgTAP (por tema)

- [ ] **Catálogo:** toda tabela com trigger `audit_row_change` tem coluna `id` do tipo `uuid` (3.4); RLS ativo em 100% de `public`; `anon` sem privilégio em tabelas, sequências e funções; nenhuma coluna `real`/`double precision`; nenhuma tabela/coluna de 07/10 (I-37); `has_function_privilege` negado para `authenticated` em `bootstrap_first_admin` e `set_user_access`.
- [ ] **Papéis (matriz do plano 6):** para cada um de `ADMINISTRATOR`, `OPERATOR`, `VIEWER`, `PARTNER`, sem papel e inativo — leitura de `partners`, `profiles` (próprio × alheio), `audit_logs`, `proof_files`; escrita negada em `profiles` e `partners` pela API.
- [ ] **Perfis:** usuário novo nasce com `role` nulo; `PARTNER` sem `partner_id` falha; dois perfis com o mesmo sócio falham; mudar papel sem motivo falha; com motivo grava auditoria com `reason`; INSERT de perfil já com papel ou sócio sem motivo falha (também como `postgres`, sem contexto); `service_role` não insere, altera nem exclui perfis; exclusão em cascata a partir de `auth.users` continua funcionando para usuário não Administrador; remover/inativar o último Administrador falha (inclusive exclusão em cascata do Auth); `current_partner_id()` nulo para sócio inativo.
- [ ] **Bootstrap:** placeholder rejeitado; e-mail inexistente rejeitado; usuário sem perfil prévio é promovido, com `ROW_CHANGE CREATE` + `ROW_CHANGE UPDATE` + `EVENT BOOTSTRAP_ADMIN`, todos com `source = SCRIPT`, motivo, `actor_label` e o mesmo `tx_id`; segunda execução retorna `ALREADY_ADMIN` sem novas linhas de auditoria; com outro Administrador ativo, falha; `EVENT BOOTSTRAP_ADMIN` e `ROW_CHANGE` com o mesmo `tx_id`, `source = SCRIPT`, `actor_label` preenchido.
- [ ] **Auditoria:** `UPDATE`, `DELETE` e `TRUNCATE` em `audit_logs` falham (inclusive como `postgres`, para `UPDATE`/`DELETE`/`TRUNCATE` via trigger); `INSERT` direto em `audit_logs` por `authenticated` e `service_role` falha; trigger em tabela de teste sem coluna `id` falha com a mensagem da regra 3.4; `UPDATE` sem mudança não gera linha; diff só com colunas alteradas; `raw_extraction` aparece como `"[omitido]"`; `seq` cresce dentro da mesma transação; `source = DIRECT` em escrita sem contexto.
- [ ] **Comprovantes:** campos controlados ignoram o que o cliente envia; caminho no formato `aaaa/mm/<id>.<ext>`; hash repetido detectado (CA-10); `STORED` sem objeto falha; com objeto de tamanho diferente falha; exclusão física falha; exclusão lógica só pelo Administrador, com motivo, e definitiva; `PARTNER` não lê `proof_files` nem objetos (CA-06).
- [ ] **Storage:** INSERT em `storage.objects` só em caminho `PENDING_UPLOAD` e só para `ADMINISTRATOR`/`OPERATOR`; SELECT negado para `PARTNER`, sem papel e `anon`; UPDATE/DELETE negados para todos os papéis da aplicação.

### 12.3 E6 — domínio (insumo para a feature Rateio)

- [ ] Alocação 1/n pela fração exata (9.3), devolvendo para cada sócio `allocated_amount` e `rounding_adjustment`, mais `split_count` e `allocation_rule = EQUAL_SPLIT_V1`.
- [ ] Testes de propriedade: Σ = total; parcelas diferem no máximo 1 centavo; Σ ajustes = `resto`; determinismo por `receipt_id`; casos de 9.3 (incluindo R$ 100.000,00 com 3 sócios e R$ 0,02 com 3 sócios).
- [ ] `effective_percentage` só para exibição (6 casas); nunca usado no cálculo.

### 12.4 E7 — comprovantes

- [ ] Route handler conforme o fluxo de 3.5 (validação binária e SHA-256 no servidor; `upsert: false`; URL assinada curta).
- [ ] Limite provisório de 4 MiB (P-15) no handler, na constraint e no bucket; confirmar na documentação atual da Vercel o limite de corpo de Function (cerca de 4,5 MB) e registrar a fonte.
- [ ] Tirar a rota de upload do matcher de `src/proxy.ts` (a rota valida a sessão com `getClaims()`), ou justificar o ajuste de `proxyClientMaxBodySize` (experimental); conferir antes em `node_modules/next/dist/docs/`.
- [ ] O handler compara os bytes recebidos com `Content-Length` e rejeita divergência (proteção contra corpo truncado sem erro).
- [ ] Testes de integração: upload exatamente no limite (aceito, hash igual ao do arquivo original) e 1 byte acima (rejeitado com erro claro, sem linha `PENDING_UPLOAD` criada).
- [ ] Levar R-D18 (hash e tipo só garantidos no caminho do handler) para a revisão `seguranca` (E8b).
- [ ] Enviar `x-correlation-id` em toda chamada ao Supabase a partir do servidor (E5) e confirmar em teste de integração que ele chega a `audit_logs.correlation_id`.

### 12.5 Não fazer

- [ ] Nenhuma coluna de percentual parametrizável (sócio ou cliente) — RAT-D015.
- [ ] Nenhuma RPC pública `SECURITY DEFINER` sem justificativa escrita e teste por papel (plano 12).
- [ ] Nenhuma migration aplicada em remoto; nenhum `db push` fora do workflow da E9.
- [ ] Nenhum nome, e-mail ou documento real em seed, teste, script ou exemplo — RAT-D019.

---

## 13. Pendências

### 13.1 Do plano, que afetam o modelo

| ID | Tema | Efeito no modelo | Bloqueia |
|---|---|---|---|
| P-02b | Escopo do login dos sócios | Políticas com `current_partner_id()`; hoje nega tudo | Feature de acesso dos sócios |
| P-08 | Recebedor intermediário | `receivers.partner_id` anulável; confirmação exige vínculo até a decisão (I-20) | Feature Recebimentos |
| P-09, P-10, P-11, P-12 | Parcial, várias mensalidades, estorno, vencimento | Constraints de `receipts`; eventual tabela de mensalidades esperadas | Features Competências/Recebimentos |
| P-13 | CNPJ alfanumérico | Normalização e DV de `clients.normalized_cnpj` | Feature Clientes |
| P-15 | Tamanho, retenção, antivírus | Limite de **4 MiB** provisório no bucket e na constraint (limite de corpo da Vercel e do proxy do Next; 3.5, R-D19). Arquivos maiores mudam o caminho de upload e reabrem R-D18 | Não bloqueia a FND (valor provisório) |
| P-16 | OCR | Escrita de `extraction_status`/`raw_extraction` | Feature Reconhecimento |
| P-17 | Resíduo de arredondamento | **Respondida por proposta** na seção 9 (aguarda aprovação) | Feature Rateio |
| P-18 | Auditoria: leitura, retenção, hash | `prev_hash`/`row_hash` aditivos | Não bloqueia a FND |
| P-19 | Fuso da competência | `received_on` como `date`; abertura do mês | Feature Competências |
| P-20 | LGPD | Documentos de sócios/recebedores; redação na auditoria | Antes de dados reais |
| P-21 | Transições e reabertura | Transições de 2.4; conteúdo de `impact`; se a trava de I-27 vale também para `CALCULATED` | Feature Competências/Liquidação |
| P-22 | Minimização das compensações; liquidação parcial | `compensations` | Feature Apuração |
| P-24 | Gestão de usuários | Hoje por `private.set_user_access` | Feature Usuários |

### 13.2 Novas (levantadas nesta modelagem)

| ID | Pergunta | Proposta | Bloqueia |
|---|---|---|---|
| M-01 | O conjunto de sócios usado no rateio de um recebimento é o vigente **na confirmação** do recebimento, ou o vigente em outra data (data do recebimento, abertura da competência, **apuração**)? O Brain 09 (ativo) descreve o estado "Apurada" como "Motor de rateio executado e compensações calculadas", o que sugere o rateio na apuração (D-19) | Na confirmação (como em 07/10), com o snapshot preservando o resultado: o Operador vê o rateio de cada recebimento antes da apuração, e a apuração só soma snapshots já gravados. Se a decisão for "na apuração", mudam o gatilho de I-21/I-25 e a RPC que grava `receipt_allocations`; a tabela não muda | Feature Rateio |
| M-02 | Pode-se inativar um sócio que ainda está indicado em clientes ativos? E o `n` conta só sócios ativos? | Não pode inativar: exigir retirar as indicações antes, para que n nunca mude implicitamente. Com isso, "sócios indicados" (RAT-D015) e "sócios indicados ativos" coincidem | Feature Sócios |
| M-03 | Um comprovante pode sustentar mais de um recebimento (ex.: um PDF com vários pagamentos)? | Não: no máximo um recebimento não cancelado por comprovante (I-29) | Feature Recebimentos |
| M-04 | O Visualizador pode abrir o arquivo do comprovante, ou só ver os metadados? | Seguir a matriz aprovada (lê); revisar com `seguranca` e P-20 | Não bloqueia a FND (a proposta segue a matriz aprovada) |
| M-05 | Dois sócios podem ter o mesmo nome? | Não (unicidade do nome normalizado); homônimos se diferenciam no nome cadastrado | Não bloqueia a FND (afrouxar é migration simples) |

---

## 14. Gate G1

**APTA PARA IMPLEMENTAÇÃO** — para o escopo da FND (E4 e E7), com as condições abaixo. Revisão 2: os 10 problemas da revisão independente foram tratados (ver "Histórico de revisão").

Fundamentos (critério do agente: sem perda de dados não tratada, sem ambiguidade de cardinalidade, sem regra financeira indefinida **no escopo a implementar**):

1. **Perda de dados:** não há dado real em nenhum ambiente; a linha de base move (não apaga) os artefatos de 07/10, e o rollback é por git (seção 7). Condição: o commit da E0 precisa existir antes da E4 (7.1).
2. **Cardinalidades da FND definidas:** usuário 1:1 perfil; perfil N:0..1 sócio com no máximo um login por sócio; papel `PARTNER` exige sócio; comprovante 1 registro por hash; perfil 1:N comprovantes enviados.
3. **Regra financeira:** a FND não tem DDL financeira. A regra de divisão está fechada ([OFICIAL] RAT-D015: sempre 1/n entre os sócios indicados no cliente), e a forma de guardar o percentual efetivo e o resíduo (P-17) está especificada na seção 9 para a feature Rateio.
4. **Sem `organization_id`** ([OFICIAL] RAT-D010) e **sem percentual armazenado como parâmetro** ([OFICIAL] RAT-D015; RAT-D004 revogada).
5. **`partners` mínima na linha de base:** **aceita** pelo planejamento no plano revisão 6 (E4: "ajuste D-01, aceito pelo planejamento em 22/10"). Deixa de ser condição do gate.

Condições e ressalvas:

- R-D12 (permissões da plataforma hospedada sobre `auth.users` e `storage`) deve ser verificado no início da E4; se algo estiver restrito, a alternativa já está descrita e não muda o modelo.
- Seed local (D-22): confirmar na E4 que `supabase db query --local` conecta como `postgres`. Se não conectar, a alternativa é executar o mesmo SQL pelo `psql` do contêiner local do banco; o modelo não muda.
- O limite de 4 MiB (P-15) é provisório; o limite de corpo da Vercel deve ser confirmado na documentação atual na E7 (R-D19).
- R-D18 (hash e tipo do comprovante só garantidos no caminho do route handler) vai para a revisão `seguranca` (E8b). A proposta desta modelagem é aceitar o risco na FND e verificar o conteúdo na feature de upload. A decisão não muda a DDL da FND (no máximo acrescenta colunas por migration aditiva).
- Divergências abertas com o plano e o Brain (seção 11, coluna "Situação") devem ser registradas pelo `engenheiro-software`; nenhuma bloqueia a E4/E7.
- O modelo conceitual das features (seção 2.4) **não** está apto para implementação enquanto as pendências de 13.1 e 13.2 marcadas como bloqueantes da respectiva feature (inclusive M-01 a M-05 e P-21, que continuam DECISÃO PENDENTE) não forem decididas. Cada feature passa pelo seu próprio gate de modelagem.

---

## Histórico de revisão

| Revisão | Data | Mudanças |
|---|---|---|
| 1 | 22/10/2026 | Versão inicial entregue para o G1 (plano revisão 5) |
| 2 | 22/10/2026 | Correções da revisão independente (veredito "consistente com ressalvas", 10 problemas), sobre o plano revisão 6. Detalhe abaixo |

Mudanças da revisão 2, por problema apontado:

1. **Auditoria × PK composta (média).** Regra nova "toda tabela auditada tem `id uuid`" (3.4). `client_partners` e `calculation_partner_balances` ganham chave substituta `id uuid` + `unique` no par natural (2.4). O trigger genérico falha com mensagem explícita se a tabela não tiver `id` (3.2). Teste de catálogo e de trigger (12.2). Risco R-D21.
2. **Seed local sem caminho para atribuir papéis (média).** `seed-dev` em duas fases: usuários pela API admin do Auth local; papéis por `supabase db query --local -f`, que conecta como `postgres` e chama `private.set_user_access` (7.2 passo 8, 3.3, 12.1). Sem dependência nova; subcomando conferido na CLI 2.120 instalada. Divergência D-22.
3. **Upload direto pela API contorna hash e tipo (média).** I-12 e I-14 reescritas para dizer o que o banco garante (hash e tipo **declarados**). Nota em 3.5, risco R-D18 com alternativas, encaminhamento à `seguranca` (E8b), divergência D-20.
4. **Limite de 10 MiB incompatível com proxy e Vercel (média).** Limite provisório reduzido para 4 MiB (constraint e bucket). Rota de upload fora do matcher do proxy, checagem de `Content-Length` e testes no tamanho máximo (3.5, 12.4). Documentação do Next 16 consultada (`proxyClientMaxBodySize.md`); o limite da Vercel fica a confirmar. Risco R-D19, divergência D-21, P-15 atualizada.
5. **Bootstrap gravava o CREATE do perfil sem contexto (baixa).** `set_audit_context` passa a ser o passo 3, antes de qualquer escrita, também em `set_user_access` (6.2, 6.3). Pós-condições e pgTAP cobrem o caso "usuário sem perfil prévio" (CREATE + UPDATE + EVENT, `source = SCRIPT`, mesmo `tx_id`).
6. **INSERT em `profiles` contornava a guarda (baixa).** Nova guarda `profiles_guard_insert` (motivo + serialização para inserir com papel ou sócio). Escrita em `profiles` e `audit_logs` revogada de `service_role`, o que também impede forjar linhas de auditoria (3.3, 3.6). I-07 e I-09 atualizadas, risco R-D20, pgTAP.
7. **Coluna gerada sobre coluna gerada (baixa).** `net_balance` passa a usar só colunas base: `received_amount − owed_amount − prior_paid_out + prior_paid_in` (2.4).
8. **Rótulos OFICIAL indevidos (baixa).** `n` = sócios indicados ([OFICIAL] RAT-D015); o filtro "sócio ativo" virou [PROPOSTA] ligada a M-02 (2.3, 2.4, 2.5, I-25). I-27: [OFICIAL] RN-014 só para `SETTLED`; `CALCULATED` virou [PROPOSTA] (ligada a P-21). I-06: [OFICIAL] RAT-D011 só para o login; negar por padrão virou [PROPOSTA] do plano + [PENDENTE] P-02b.
9. **M-01 sem citar o Brain 09 (baixa).** M-01 cita "Apurada: Motor de rateio executado e compensações calculadas" e descreve o efeito de cada resposta. Nova divergência D-19. I-21 rotulada [OFICIAL] RAT-D006 + [PENDENTE] M-01. M-01 continua DECISÃO PENDENTE.
10. **Nomes da auditoria diferentes do plano sem registro (baixa).** O campo voltou a `created_at` (nome do plano 9), com padrão `clock_timestamp()`; o índice virou `audit_logs_created_at_idx`. A ação `SETTLE` (no lugar de `LIQUIDATE`) foi mantida, com justificativa em D-04 e em 3.2.

Outras mudanças da revisão 2:

- Cabeçalho e gate apontam para o plano revisão 6; `partners` mínima (D-01) consta como **aceita** e saiu das condições do gate.
- Seção 11 ganhou a coluna "Situação". D-01, D-15 e D-16 aceitas no plano rev. 6; D-10, D-11 e D-12 resolvidas no Brain (notas de 22/10); D-08 parcial.
- M-02 explicita a pergunta sobre o filtro de sócio ativo em `n`; P-21 inclui a extensão de I-27 a `CALCULATED`. Nenhuma pendência (M-01 a M-05, P-21) foi resolvida nesta revisão.
