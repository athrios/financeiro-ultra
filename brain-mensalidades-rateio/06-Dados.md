---
type: data-model
project: Brain Mensalidades e Rateio
status: draft
---

# Modelo de Dados

## Entidades principais

### `parts`

> **Nota (22/10/2026)** — conforme [[11-Decisoes#RAT-D015 — Divisão igualitária por padrão]]:
> - `default_percentage` deixa de existir ([[11-Decisoes#RAT-D004 — Percentual padrão]] revogada), e a divisão padrão é 1/n entre os sócios indicados no cliente;
> - `client_parts.custom_percentage` deixa de existir: a divisão é sempre 1/n;
> - a entidade passa a se chamar Sócio ([[11-Decisoes#RAT-D017 — Vocabulário do sistema]]).
>
> A modelagem final fica com o agente `modelagem-dados` (FND-001).

- id
- name
- document
- default_percentage
- status
- created_at
- updated_at

### `part_aliases`

- id
- part_id
- alias_type
- alias_value
- normalized_value

### `receivers`

- id
- part_id
- name
- document
- bank_reference
- status

### `clients`

- id
- legal_name
- trade_name
- cnpj
- default_monthly_value
- status

### `client_aliases`

- id
- client_id
- alias_type
- alias_value
- normalized_value

### `client_parts`

- id
- client_id
- part_id
- enabled
- custom_percentage nullable

### `competences`

- id
- reference_month
- status
- opened_at
- calculated_at
- liquidated_at

### `receipts`

- id
- competence_id
- client_id
- receiver_id
- amount
- received_at
- source
- status
- proof_file_id
- txid
- end_to_end
- created_by

### `receipt_allocations`

Snapshot do rateio aplicado em cada recebimento.

- id
- receipt_id
- part_id
- effective_percentage
- allocated_amount

### `proof_files`

- id
- storage_path
- file_hash
- mime_type
- extraction_status
- raw_extraction
- confidence_score

### `settlements`

- id
- competence_id
- from_part_id
- to_part_id
- amount
- status
- paid_at
- proof_file_id

### `audit_log`

- id
- user_id
- entity
- entity_id
- action
- previous_data
- new_data
- created_at

## Princípio técnico

`receipt_allocations` deve funcionar como snapshot.

Se a parametrização percentual mudar no futuro, o recebimento histórico mantém o rateio efetivamente aplicado naquela competência.

Ver [[11-Decisoes]].
