-- =============================================================================
-- 0400 · Competências mensais e snapshot das empresas por competência
-- =============================================================================

create table public.competencies (
  id uuid primary key default gen_random_uuid(),
  reference_month date not null,
  status public.competency_status not null default 'OPEN',
  opened_at timestamptz not null default now(),
  opened_by uuid references public.profiles (id),
  closed_at timestamptz,
  closed_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),

  constraint competencies_reference_month_key unique (reference_month),
  -- reference_month representa o mês: sempre o dia 1 (2026-10-01 = Outubro/2026).
  constraint competencies_reference_month_first_day
    check (reference_month = date_trunc('month', reference_month)::date),
  constraint competencies_closed_consistency
    check ((status = 'CLOSED') = (closed_at is not null))
);

alter table public.competencies enable row level security;

-- Snapshot do valor esperado de cada empresa na competência.
-- Alterações futuras em companies.default_amount não afetam meses já abertos.
create table public.competency_companies (
  id uuid primary key default gen_random_uuid(),
  competency_id uuid not null references public.competencies (id),
  company_id uuid not null references public.companies (id),
  expected_amount numeric(14, 2) not null,
  created_at timestamptz not null default now(),

  constraint competency_companies_competency_company_key unique (competency_id, company_id),
  constraint competency_companies_expected_amount_positive check (expected_amount > 0)
);

create index competency_companies_company_idx on public.competency_companies (company_id);

alter table public.competency_companies enable row level security;

-- -----------------------------------------------------------------------------
-- RPC: open_competency
-- Abre a competência e gera o snapshot das empresas ativas, atomicamente.
-- -----------------------------------------------------------------------------
create function public.open_competency(p_reference_month date)
returns public.competencies
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_competency public.competencies;
begin
  if not private.is_admin() then
    raise exception 'Apenas ADMIN_FINANCEIRO pode abrir competências.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_reference_month is null or p_reference_month <> date_trunc('month', p_reference_month)::date then
    raise exception 'reference_month deve ser o primeiro dia do mês (recebido: %).', p_reference_month
      using errcode = 'invalid_parameter_value';
  end if;

  begin
    insert into public.competencies (reference_month, opened_by)
    values (p_reference_month, auth.uid())
    returning * into v_competency;
  exception when unique_violation then
    raise exception 'A competência % já foi aberta.', to_char(p_reference_month, 'MM/YYYY')
      using errcode = 'unique_violation';
  end;

  insert into public.competency_companies (competency_id, company_id, expected_amount)
  select v_competency.id, c.id, c.default_amount
    from public.companies c
   where c.active;

  return v_competency;
end;
$$;

revoke execute on function public.open_competency(date) from public, anon;
grant execute on function public.open_competency(date) to authenticated;

-- -----------------------------------------------------------------------------
-- Auditoria
-- (inserções em competency_companies são cobertas pelo log OPEN da competência;
--  alterações posteriores do snapshot são auditadas individualmente)
-- -----------------------------------------------------------------------------
create trigger competencies_audit
  after insert or update or delete on public.competencies
  for each row execute function private.audit_row_change('competency');

create trigger competency_companies_audit
  after update or delete on public.competency_companies
  for each row execute function private.audit_row_change('competency_company');

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
create policy competencies_select_active_profile on public.competencies
  for select to authenticated
  using ((select private.has_active_profile()));

create policy competencies_insert_admin on public.competencies
  for insert to authenticated
  with check ((select private.is_admin()));

create policy competencies_update_admin on public.competencies
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy competency_companies_select on public.competency_companies
  for select to authenticated
  using ((select private.is_admin()) or private.is_linked_to_company(company_id));

create policy competency_companies_insert_admin on public.competency_companies
  for insert to authenticated
  with check ((select private.is_admin()));

create policy competency_companies_update_admin on public.competency_companies
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
