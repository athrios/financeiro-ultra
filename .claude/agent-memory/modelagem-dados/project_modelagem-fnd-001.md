---
name: modelagem-fnd-001
description: Escolhas de modelagem da FND-001 (02-modelagem-dados.md, rev. 4 em 2026-10-23, sincronizada com as migrations) que as features futuras devem seguir ou rever
metadata:
  type: project
---

Entregue em `docs/features/FND-001-fundacao/02-modelagem-dados.md` (gate G1: APTA para o escopo FND; rev. 2 corrigiu 10 achados da revisão independente). Escolhas não óbvias:
- Divisão sempre 1/n (RAT-D015): `receipt_allocations` guarda `split_count`, `effective_percentage numeric(9,6)` gerado só para exibição e `rounding_adjustment` (0.00/0.01) — resposta a P-17; `receipts.allocation_rule = EQUAL_SPLIT_V1`.
- `receipts.receiver_partner_id` é snapshot (recebedor pode mudar de sócio).
- Compensação PAID é definitiva; reapuração usa `net_balance` (definida só com colunas base: coluna gerada não referencia outra gerada).
- Toda tabela auditada tem PK `id uuid` (trigger genérico usa `id`); associações usam chave substituta + unique no par.
- `profiles`: motivo OPCIONAL desde RAT-D021 (sem require_audit_reason; em branco vira NULL); escrita em `profiles`/`audit_logs` revogada de `service_role`. Seed local atribui papéis via `supabase db query --local -f` chamando `private.set_user_access`.
- Auditoria: campo `created_at` (clock_timestamp), ação `SETTLE` (não LIQUIDATE, divergência D-04).
- Comprovantes: limite provisório 4 MiB (Vercel ~4,5 MB a confirmar; proxy Next trunca >10 MB sem erro); hash/tipo só garantidos via route handler (R-D18, enviado à segurança).
- `partners` mínima na FND: D-01 ACEITA no plano rev. 6.
- Pendências M-01..M-05 e P-21 seguem abertas; M-01: Brain 09 ("Apurada: motor de rateio executado") × Brain 04 Fluxo 3 passo 7 (rateio no registro) — citar os dois lados (D-19).
- Rev. 4 (2026-10-23): migrations 20261023000100..0500 são a fonte da DDL; seção 11.1 lista D-E4/D-E7/D-E8 incorporadas; TRUNCATE revogado + BEFORE TRUNCATE; upload só do dono (D-E4-10).
- Rev. 3 (2026-10-23): trigger nunca chama `set_audit_context` (is_local vale até o fim da TRANSAÇÃO, não da função); `handle_new_user` lê GUCs, define só os vazios e restaura (I-10b, R-D22).

**Why:** features futuras (Sócios, Rateio, Apuração) partem deste modelo; revisores independentes checam rótulos OFICIAL × PROPOSTA com rigor.

**How to apply:** ao modelar uma feature, reler o 02-modelagem-dados.md atual e verificar se M-xx/P-xx viraram RAT-D no 11-Decisoes.md. Rotular [OFICIAL] só o que a fonte diz literalmente; extensões viram [PROPOSTA]. Ver também [[restricoes-workflow-financeiro-ultra]].
