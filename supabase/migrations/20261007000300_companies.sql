-- =============================================================================
-- 0300 · Empresas e indicadores econômicos de cada empresa
-- =============================================================================

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cnpj text not null,
  normalized_cnpj text not null generated always as (private.normalize_cnpj(cnpj)) stored,
  default_amount numeric(14, 2) not null,
  distribution_mode public.distribution_mode not null default 'INHERIT',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint companies_name_not_blank check (btrim(name) <> ''),
  constraint companies_normalized_cnpj_key unique (normalized_cnpj),
  constraint companies_cnpj_valid check (private.is_valid_cnpj(normalized_cnpj)),
  constraint companies_default_amount_positive check (default_amount > 0)
);

comment on column public.companies.default_amount is
  'Mensalidade atual. Cada competência guarda seu próprio snapshot em competency_companies.expected_amount.';

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function private.set_updated_at();

alter table public.companies enable row level security;

create table public.company_indicators (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  indicator_id uuid not null references public.indicators (id) on delete restrict,
  custom_percentage numeric(7, 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint company_indicators_company_indicator_key unique (company_id, indicator_id),
  constraint company_indicators_custom_percentage_range
    check (custom_percentage is null or (custom_percentage > 0 and custom_percentage <= 100))
);

comment on column public.company_indicators.custom_percentage is
  'Usado apenas quando companies.distribution_mode = CUSTOM. Ignorado nos demais modos.';

create index company_indicators_indicator_idx on public.company_indicators (indicator_id);

create trigger company_indicators_set_updated_at
  before update on public.company_indicators
  for each row execute function private.set_updated_at();

alter table public.company_indicators enable row level security;

-- -----------------------------------------------------------------------------
-- Autorização: o usuário atual é indicador desta empresa?
-- -----------------------------------------------------------------------------
create function private.is_linked_to_company(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.company_indicators ci
      join public.profiles p on p.indicator_id = ci.indicator_id
     where ci.company_id = p_company_id
       and p.id = auth.uid()
       and p.active
  );
$$;

revoke execute on function private.is_linked_to_company(uuid) from public;
grant execute on function private.is_linked_to_company(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Integridade da distribuição CUSTOM
-- Empresa em modo CUSTOM: ao menos um indicador, todos com custom_percentage,
-- soma exatamente 100. Validado no COMMIT (deferred) para permitir salvar
-- empresa + indicadores na mesma transação. Nunca normaliza: rejeita.
-- -----------------------------------------------------------------------------
create function private.validate_company_distribution(p_company_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_mode public.distribution_mode;
  v_count int;
  v_missing int;
  v_sum numeric;
begin
  select c.distribution_mode into v_mode
    from public.companies c
   where c.id = p_company_id;

  if v_mode is distinct from 'CUSTOM' then
    return; -- empresa removida ou modo sem percentuais próprios
  end if;

  select count(*),
         count(*) filter (where ci.custom_percentage is null),
         coalesce(sum(ci.custom_percentage), 0)
    into v_count, v_missing, v_sum
    from public.company_indicators ci
   where ci.company_id = p_company_id;

  if v_count = 0 then
    raise exception 'Distribuição CUSTOM exige ao menos um indicador (empresa %).', p_company_id
      using errcode = 'check_violation';
  end if;

  if v_missing > 0 then
    raise exception 'Distribuição CUSTOM exige percentual para todos os indicadores (empresa %).', p_company_id
      using errcode = 'check_violation';
  end if;

  if v_sum <> 100 then
    raise exception 'Distribuição CUSTOM inválida: soma % (deve ser exatamente 100%%) (empresa %).', v_sum || '%', p_company_id
      using errcode = 'check_violation';
  end if;
end;
$$;

create function private.companies_assert_distribution()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.validate_company_distribution(new.id);
  return null;
end;
$$;

create function private.company_indicators_assert_distribution()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.validate_company_distribution(old.company_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.company_id is distinct from old.company_id) then
    perform private.validate_company_distribution(new.company_id);
  end if;
  return null;
end;
$$;

revoke execute on function private.validate_company_distribution(uuid) from public;
-- Chamada por triggers e pela RPC no contexto do usuário (RLS se aplica).
grant execute on function private.validate_company_distribution(uuid) to authenticated;
revoke execute on function private.companies_assert_distribution() from public;
revoke execute on function private.company_indicators_assert_distribution() from public;

create constraint trigger companies_distribution_valid
  after insert or update of distribution_mode on public.companies
  deferrable initially deferred
  for each row execute function private.companies_assert_distribution();

create constraint trigger company_indicators_distribution_valid
  after insert or update or delete on public.company_indicators
  deferrable initially deferred
  for each row execute function private.company_indicators_assert_distribution();

-- -----------------------------------------------------------------------------
-- RPC: save_company_distribution
-- Define atomicamente o modo de distribuição e o conjunto de indicadores.
-- p_indicators: [{"indicator_id": "...", "custom_percentage": "50.0000" | null}]
-- Indicadores fora da lista são desvinculados.
-- -----------------------------------------------------------------------------
create function public.save_company_distribution(
  p_company_id uuid,
  p_distribution_mode public.distribution_mode,
  p_indicators jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_list constant jsonb := coalesce(p_indicators, '[]'::jsonb);
  v_count int;
  v_distinct int;
begin
  if not private.is_admin() then
    raise exception 'Apenas ADMIN_FINANCEIRO pode alterar a distribuição da empresa.'
      using errcode = 'insufficient_privilege';
  end if;

  if jsonb_typeof(v_list) <> 'array' then
    raise exception 'p_indicators deve ser um array JSON.' using errcode = 'invalid_parameter_value';
  end if;

  perform 1 from public.companies c where c.id = p_company_id for update;
  if not found then
    raise exception 'Empresa % não encontrada.', p_company_id using errcode = 'no_data_found';
  end if;

  select count(*), count(distinct e ->> 'indicator_id')
    into v_count, v_distinct
    from jsonb_array_elements(v_list) e;

  if v_count <> v_distinct then
    raise exception 'Indicador repetido na distribuição da empresa.' using errcode = 'invalid_parameter_value';
  end if;

  update public.companies
     set distribution_mode = p_distribution_mode
   where id = p_company_id
     and distribution_mode is distinct from p_distribution_mode;

  delete from public.company_indicators ci
   where ci.company_id = p_company_id
     and not exists (
       select 1 from jsonb_array_elements(v_list) e
        where (e ->> 'indicator_id')::uuid = ci.indicator_id
     );

  insert into public.company_indicators (company_id, indicator_id, custom_percentage)
  select p_company_id,
         (e ->> 'indicator_id')::uuid,
         case
           when e ->> 'custom_percentage' is null then null
           else private.to_percentage(e ->> 'custom_percentage')
         end
    from jsonb_array_elements(v_list) e
  on conflict (company_id, indicator_id) do update
     set custom_percentage = excluded.custom_percentage
   where public.company_indicators.custom_percentage is distinct from excluded.custom_percentage;

  -- Valida já, com mensagem clara, em vez de esperar o COMMIT.
  perform private.validate_company_distribution(p_company_id);
end;
$$;

revoke execute on function public.save_company_distribution(uuid, public.distribution_mode, jsonb) from public, anon;
grant execute on function public.save_company_distribution(uuid, public.distribution_mode, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Auditoria
-- -----------------------------------------------------------------------------
create trigger companies_audit
  after insert or update or delete on public.companies
  for each row execute function private.audit_row_change('company');

create trigger company_indicators_audit
  after insert or update or delete on public.company_indicators
  for each row execute function private.audit_row_change('company_indicator');

-- -----------------------------------------------------------------------------
-- RLS
-- ADMIN: acesso total. SOCIO: apenas empresas em que é indicador.
-- -----------------------------------------------------------------------------
create policy companies_select on public.companies
  for select to authenticated
  using ((select private.is_admin()) or private.is_linked_to_company(id));

create policy companies_insert_admin on public.companies
  for insert to authenticated
  with check ((select private.is_admin()));

create policy companies_update_admin on public.companies
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy companies_delete_admin on public.companies
  for delete to authenticated
  using ((select private.is_admin()));

create policy company_indicators_select on public.company_indicators
  for select to authenticated
  using ((select private.is_admin()) or private.is_linked_to_company(company_id));

create policy company_indicators_insert_admin on public.company_indicators
  for insert to authenticated
  with check ((select private.is_admin()));

create policy company_indicators_update_admin on public.company_indicators
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy company_indicators_delete_admin on public.company_indicators
  for delete to authenticated
  using ((select private.is_admin()));
