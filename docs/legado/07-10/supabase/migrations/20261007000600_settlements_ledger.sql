-- =============================================================================
-- 0600 · Liquidações e ledger financeiro
-- =============================================================================
-- A liquidação acontece fora do sistema; aqui apenas se registra que ocorreu.
-- O saldo de cada indicador NUNCA é armazenado: é sempre derivado do ledger.
-- =============================================================================

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  competency_id uuid not null references public.competencies (id),
  from_indicator_id uuid not null references public.indicators (id),
  to_indicator_id uuid not null references public.indicators (id),
  amount numeric(14, 2) not null,
  settlement_date date not null,
  proof_storage_path text,
  notes text,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),

  constraint settlements_distinct_indicators check (from_indicator_id <> to_indicator_id),
  constraint settlements_amount_positive check (amount > 0)
);

comment on table public.settlements is
  'Registro append-only de transferências realizadas fora do sistema. Correções são feitas com uma liquidação inversa.';

create index settlements_competency_idx on public.settlements (competency_id);
create index settlements_from_idx on public.settlements (from_indicator_id);
create index settlements_to_idx on public.settlements (to_indicator_id);

alter table public.settlements enable row level security;

-- Ledger append-only: liquidações não são alteradas nem removidas.
create trigger settlements_immutable
  before update or delete on public.settlements
  for each row execute function private.prevent_mutation();

create trigger settlements_audit
  after insert on public.settlements
  for each row execute function private.audit_row_change('settlement');

create policy settlements_select on public.settlements
  for select to authenticated
  using (
    (select private.is_admin())
    or (select private.current_indicator_id()) in (from_indicator_id, to_indicator_id)
  );

create policy settlements_insert_admin on public.settlements
  for insert to authenticated
  with check ((select private.is_admin()) and created_by = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- financial_ledger: lançamentos derivados, um por efeito econômico.
--
-- Convenção de sinal (perspectiva do indicador):
--   positivo = aumenta o que o indicador tem a RECEBER
--   negativo = aumenta o que o indicador tem a PAGAR
--
--   ECONOMIC_RIGHT       +allocation.amount   direito econômico (receipt_allocations)
--   DIRECT_RECEIPT       -receipt.amount      dinheiro que o indicador recebeu diretamente
--   SETTLEMENT_PAID      +settlement.amount   o indicador pagou a outro (quita dívida)
--   SETTLEMENT_RECEIVED  -settlement.amount   o indicador recebeu de outro (reduz crédito)
--
-- Apenas recebimentos CONFIRMED entram no ledger.
-- saldo da competência = soma dos lançamentos da competência
-- saldo atual          = soma acumulada de todas as competências até a atual
-- Em cada competência, a soma de todos os indicadores é zero.
-- -----------------------------------------------------------------------------
create view public.financial_ledger
with (security_invoker = true)
as
select c.id as competency_id,
       c.reference_month,
       a.indicator_id,
       'ECONOMIC_RIGHT'::text as entry_type,
       a.amount as amount,
       r.id as receipt_id,
       null::uuid as settlement_id,
       r.payment_date as entry_date
  from public.receipt_allocations a
  join public.receipts r on r.id = a.receipt_id and r.status = 'CONFIRMED'
  join public.competencies c on c.id = r.competency_id
union all
select c.id,
       c.reference_month,
       r.receiving_indicator_id,
       'DIRECT_RECEIPT'::text,
       -r.amount,
       r.id,
       null::uuid,
       r.payment_date
  from public.receipts r
  join public.competencies c on c.id = r.competency_id
 where r.status = 'CONFIRMED'
union all
select c.id,
       c.reference_month,
       s.from_indicator_id,
       'SETTLEMENT_PAID'::text,
       s.amount,
       null::uuid,
       s.id,
       s.settlement_date
  from public.settlements s
  join public.competencies c on c.id = s.competency_id
union all
select c.id,
       c.reference_month,
       s.to_indicator_id,
       'SETTLEMENT_RECEIVED'::text,
       -s.amount,
       null::uuid,
       s.id,
       s.settlement_date
  from public.settlements s
  join public.competencies c on c.id = s.competency_id;

comment on view public.financial_ledger is
  'Ledger derivado (security_invoker: respeita o RLS das tabelas de origem). Fonte da verdade para saldos.';
