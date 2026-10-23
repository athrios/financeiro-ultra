-- =============================================================================
-- 0200 · Indicadores, aliases de recebimento, perfis e configuração financeira
-- =============================================================================

-- -----------------------------------------------------------------------------
-- indicators: o sócio/recebedor econômico
-- -----------------------------------------------------------------------------
create table public.indicators (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  default_percentage numeric(7, 4),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint indicators_name_not_blank check (btrim(name) <> ''),
  constraint indicators_default_percentage_range
    check (default_percentage is null or (default_percentage > 0 and default_percentage <= 100))
);

comment on column public.indicators.default_percentage is
  'Percentual na distribuição padrão. Só é usado quando finance_settings.use_custom_default_percentages = true.';

create unique index indicators_name_unique on public.indicators (lower(btrim(name)));

create trigger indicators_set_updated_at
  before update on public.indicators
  for each row execute function private.set_updated_at();

alter table public.indicators enable row level security;

-- -----------------------------------------------------------------------------
-- indicator_receipt_aliases: nomes pelos quais o indicador aparece como recebedor
-- -----------------------------------------------------------------------------
create table public.indicator_receipt_aliases (
  id uuid primary key default gen_random_uuid(),
  indicator_id uuid not null references public.indicators (id) on delete cascade,
  alias text not null,
  normalized_alias text not null generated always as (private.normalize_alias(alias)) stored,
  active boolean not null default true,
  created_at timestamptz not null default now(),

  constraint indicator_receipt_aliases_not_blank check (normalized_alias <> '')
);

-- Um alias normalizado ativo pertence a um único indicador.
create unique index indicator_receipt_aliases_active_unique
  on public.indicator_receipt_aliases (normalized_alias)
  where active;

create index indicator_receipt_aliases_indicator_idx
  on public.indicator_receipt_aliases (indicator_id);

alter table public.indicator_receipt_aliases enable row level security;

-- -----------------------------------------------------------------------------
-- profiles: vínculo entre usuário autenticado, papel e indicador
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role public.user_role not null,
  indicator_id uuid references public.indicators (id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.profiles.indicator_id is
  'Indicador representado pelo usuário. Obrigatório na prática para SOCIO; opcional para ADMIN_FINANCEIRO.';

-- Um indicador é representado por no máximo um usuário.
create unique index profiles_indicator_unique on public.profiles (indicator_id) where indicator_id is not null;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;

-- Cria o perfil automaticamente para novos usuários do Auth.
-- Todo perfil nasce SOCIO e sem indicador: privilégio mínimo, sem acesso a
-- dados financeiros. Promover a ADMIN_FINANCEIRO ou vincular um indicador é
-- uma alteração explícita em profiles (feita por um admin ou pela service
-- role) e fica registrada na auditoria. profiles.role é a única fonte da
-- verdade do papel — não é lido de app_metadata.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    'SOCIO'
  );

  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- Funções de autorização (usadas pelas políticas RLS)
-- SECURITY DEFINER para ler profiles sem recursão de RLS.
-- -----------------------------------------------------------------------------
create function private.has_active_profile()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.active
  );
$$;

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and p.active
       and p.role = 'ADMIN_FINANCEIRO'
  );
$$;

create function private.current_indicator_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.indicator_id
    from public.profiles p
   where p.id = auth.uid() and p.active;
$$;

revoke execute on function private.has_active_profile() from public;
revoke execute on function private.is_admin() from public;
revoke execute on function private.current_indicator_id() from public;
grant execute on function private.has_active_profile() to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.current_indicator_id() to authenticated;

-- -----------------------------------------------------------------------------
-- finance_settings: configuração financeira (linha única)
-- -----------------------------------------------------------------------------
create table public.finance_settings (
  id uuid primary key default gen_random_uuid(),
  use_custom_default_percentages boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Garante uma única linha de configuração.
create unique index finance_settings_singleton on public.finance_settings ((true));

create trigger finance_settings_set_updated_at
  before update on public.finance_settings
  for each row execute function private.set_updated_at();

alter table public.finance_settings enable row level security;

insert into public.finance_settings (use_custom_default_percentages) values (false);

-- -----------------------------------------------------------------------------
-- Integridade da distribuição padrão
-- Quando use_custom_default_percentages = true, a soma dos percentuais padrão
-- dos indicadores ativos que compõem a distribuição padrão deve ser 100.
-- Constraint trigger DEFERRED: valida no COMMIT, permitindo ajustar vários
-- indicadores na mesma transação. Nunca normaliza: apenas rejeita.
-- -----------------------------------------------------------------------------
create function private.assert_default_distribution_valid()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_use_custom boolean;
  v_sum numeric;
  v_count int;
begin
  select fs.use_custom_default_percentages into v_use_custom
    from public.finance_settings fs
   limit 1;

  if coalesce(v_use_custom, false) then
    select coalesce(sum(i.default_percentage), 0), count(*)
      into v_sum, v_count
      from public.indicators i
     where i.active and i.default_percentage is not null;

    if v_count = 0 or v_sum <> 100 then
      raise exception 'Distribuição padrão inválida: a soma dos percentuais padrão dos indicadores ativos é % (deve ser exatamente 100%%).', v_sum || '%'
        using errcode = 'check_violation';
    end if;
  end if;

  return null;
end;
$$;

revoke execute on function private.assert_default_distribution_valid() from public;

create constraint trigger indicators_default_distribution_valid
  after insert or update or delete on public.indicators
  deferrable initially deferred
  for each row execute function private.assert_default_distribution_valid();

create constraint trigger finance_settings_default_distribution_valid
  after insert or update on public.finance_settings
  deferrable initially deferred
  for each row execute function private.assert_default_distribution_valid();

-- -----------------------------------------------------------------------------
-- RPC: set_default_distribution
-- Define de forma atômica se a distribuição padrão usa percentuais e quais são.
-- p_percentages: [{"indicator_id": "...", "percentage": "50.0000"}, ...]
-- Indicadores ativos fora da lista ficam sem percentual padrão.
-- -----------------------------------------------------------------------------
create function public.set_default_distribution(
  p_use_custom_default_percentages boolean,
  p_percentages jsonb default '[]'::jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_list constant jsonb := coalesce(p_percentages, '[]'::jsonb);
  v_sum numeric;
  v_count int;
  v_distinct int;
  v_unknown int;
begin
  if not private.is_admin() then
    raise exception 'Apenas ADMIN_FINANCEIRO pode alterar a distribuição padrão.'
      using errcode = 'insufficient_privilege';
  end if;

  if jsonb_typeof(v_list) <> 'array' then
    raise exception 'p_percentages deve ser um array JSON.' using errcode = 'invalid_parameter_value';
  end if;

  with requested as (
    select (e ->> 'indicator_id')::uuid as indicator_id,
           private.to_percentage(e ->> 'percentage') as percentage
      from jsonb_array_elements(v_list) e
  )
  select count(*),
         count(distinct r.indicator_id),
         coalesce(sum(r.percentage), 0),
         count(*) filter (where not exists (select 1 from public.indicators i where i.id = r.indicator_id))
    into v_count, v_distinct, v_sum, v_unknown
    from requested r;

  if v_unknown > 0 then
    raise exception 'Distribuição padrão referencia indicador inexistente.' using errcode = 'foreign_key_violation';
  end if;

  if v_count <> v_distinct then
    raise exception 'Indicador repetido na distribuição padrão.' using errcode = 'invalid_parameter_value';
  end if;

  if p_use_custom_default_percentages and v_sum <> 100 then
    raise exception 'A soma dos percentuais padrão é % (deve ser exatamente 100%%).', v_sum || '%'
      using errcode = 'check_violation';
  end if;

  with requested as (
    select (e ->> 'indicator_id')::uuid as indicator_id,
           private.to_percentage(e ->> 'percentage') as percentage
      from jsonb_array_elements(v_list) e
  )
  update public.indicators i
     set default_percentage = r.percentage
    from (
      select i2.id, req.percentage
        from public.indicators i2
        left join requested req on req.indicator_id = i2.id
    ) r
   where r.id = i.id
     and i.default_percentage is distinct from r.percentage;

  update public.finance_settings
     set use_custom_default_percentages = p_use_custom_default_percentages
   where use_custom_default_percentages is distinct from p_use_custom_default_percentages;
end;
$$;

revoke execute on function public.set_default_distribution(boolean, jsonb) from public, anon;
grant execute on function public.set_default_distribution(boolean, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- RPC: resolve_receiver_indicator
-- Base para a identificação automática do recebedor: dado o nome do recebedor
-- extraído de um comprovante, retorna o indicador dono do alias ativo.
-- -----------------------------------------------------------------------------
create function public.resolve_receiver_indicator(p_receiver_name text)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select a.indicator_id
    from public.indicator_receipt_aliases a
    join public.indicators i on i.id = a.indicator_id
   where a.active
     and i.active
     and a.normalized_alias = private.normalize_alias(p_receiver_name);
$$;

revoke execute on function public.resolve_receiver_indicator(text) from public, anon;
grant execute on function public.resolve_receiver_indicator(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Auditoria
-- -----------------------------------------------------------------------------
create trigger indicators_audit
  after insert or update or delete on public.indicators
  for each row execute function private.audit_row_change('indicator');

create trigger indicator_receipt_aliases_audit
  after insert or update or delete on public.indicator_receipt_aliases
  for each row execute function private.audit_row_change('indicator_receipt_alias');

create trigger profiles_audit
  after insert or update or delete on public.profiles
  for each row execute function private.audit_row_change('profile');

create trigger finance_settings_audit
  after update on public.finance_settings
  for each row execute function private.audit_row_change('finance_settings');

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

-- profiles: cada usuário lê o próprio perfil; ADMIN lê e altera todos.
-- Inserção apenas via trigger do Auth; remoção apenas via cascade do Auth.
create policy profiles_select_own_or_admin on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));

create policy profiles_update_admin on public.profiles
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- indicators: qualquer perfil ativo lê (nomes dos sócios); só ADMIN escreve.
create policy indicators_select_active_profile on public.indicators
  for select to authenticated
  using ((select private.has_active_profile()));

create policy indicators_insert_admin on public.indicators
  for insert to authenticated
  with check ((select private.is_admin()));

create policy indicators_update_admin on public.indicators
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy indicators_delete_admin on public.indicators
  for delete to authenticated
  using ((select private.is_admin()));

-- indicator_receipt_aliases: exclusivo do ADMIN.
create policy indicator_receipt_aliases_admin_all on public.indicator_receipt_aliases
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- finance_settings: perfis ativos leem (necessário para exibir a regra de
-- distribuição); só ADMIN altera. Sem INSERT/DELETE: linha única.
create policy finance_settings_select_active_profile on public.finance_settings
  for select to authenticated
  using ((select private.has_active_profile()));

create policy finance_settings_update_admin on public.finance_settings
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
