-- =============================================================================
-- 0100 · Fundação: schema privado, enums, utilitários e auditoria
-- =============================================================================
-- O schema "private" não é exposto pelo PostgREST: guarda funções auxiliares
-- usadas por triggers e políticas RLS, sem virar endpoint RPC.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.user_role as enum ('ADMIN_FINANCEIRO', 'SOCIO');

create type public.distribution_mode as enum ('INHERIT', 'EQUAL', 'CUSTOM');

create type public.competency_status as enum ('OPEN', 'CLOSED');

create type public.receiver_identification_method as enum ('ALIAS', 'MANUAL', 'UNIDENTIFIED');

create type public.company_identification_method as enum ('CNPJ', 'NAME', 'MANUAL', 'UNIDENTIFIED');

create type public.receipt_status as enum (
  'RECEIVED',
  'PROCESSING',
  'AWAITING_RECEIVER',
  'AWAITING_COMPANY',
  'AWAITING_CONFIRMATION',
  'CONFIRMED',
  'READ_ERROR'
);

create type public.distribution_source as enum ('EQUAL', 'DEFAULT_PERCENTAGE', 'COMPANY_CUSTOM');

-- -----------------------------------------------------------------------------
-- Utilitários
-- -----------------------------------------------------------------------------

-- Mantém updated_at coerente sem depender da aplicação.
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- CNPJ normalizado: apenas dígitos.
create function private.normalize_cnpj(p_cnpj text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select pg_catalog.regexp_replace(coalesce(p_cnpj, ''), '[^0-9]', '', 'g');
$$;

-- Valida os dígitos verificadores de um CNPJ numérico (14 dígitos).
create function private.is_valid_cnpj(p_cnpj text)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_digits int[];
  v_weights1 constant int[] := array[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  v_weights2 constant int[] := array[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  v_sum int;
  v_check int;
begin
  if p_cnpj is null or p_cnpj !~ '^[0-9]{14}$' then
    return false;
  end if;

  -- Sequências repetidas (00000000000000, 11111111111111...) são inválidas.
  if p_cnpj ~ '^(.)\1{13}$' then
    return false;
  end if;

  select array_agg(d::int order by ord)
    into v_digits
    from pg_catalog.regexp_split_to_table(p_cnpj, '') with ordinality as t(d, ord);

  v_sum := 0;
  for i in 1..12 loop
    v_sum := v_sum + v_digits[i] * v_weights1[i];
  end loop;
  v_check := case when v_sum % 11 < 2 then 0 else 11 - v_sum % 11 end;
  if v_check <> v_digits[13] then
    return false;
  end if;

  v_sum := 0;
  for i in 1..13 loop
    v_sum := v_sum + v_digits[i] * v_weights2[i];
  end loop;
  v_check := case when v_sum % 11 < 2 then 0 else 11 - v_sum % 11 end;
  return v_check = v_digits[14];
end;
$$;

-- Normalização de aliases de recebimento:
-- minúsculas, sem acentos, sem pontuação, espaços colapsados.
-- "Contabil Exemplo Ltda." -> "contabil exemplo ltda"
-- Implementada sem a extensão unaccent para poder ser IMMUTABLE
-- (necessário para coluna gerada e índice único). Os acentos são removidos
-- antes do lower() para não depender do LC_CTYPE do banco.
create function private.normalize_alias(p_alias text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select pg_catalog.btrim(
    pg_catalog.regexp_replace(
      pg_catalog.lower(
        pg_catalog.translate(
          coalesce(p_alias, ''),
          'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝýÿ',
          'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYyy'
        )
      ),
      '[^a-z0-9]+', ' ', 'g'
    )
  );
$$;

-- Conversões estritas de texto para os tipos financeiros.
-- Um cast direto para numeric(p,s) ARREDONDA silenciosamente o excesso de
-- casas decimais; estas funções rejeitam em vez de arredondar.
create function private.to_percentage(p_value text)
returns numeric(7, 4)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_raw numeric;
begin
  if p_value is null or p_value !~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then
    raise exception 'Percentual inválido: "%".', p_value using errcode = 'invalid_parameter_value';
  end if;
  v_raw := p_value::numeric;
  if v_raw <> pg_catalog.round(v_raw, 4) then
    raise exception 'Percentual "%" tem mais de 4 casas decimais.', p_value using errcode = 'invalid_parameter_value';
  end if;
  if v_raw <= 0 or v_raw > 100 then
    raise exception 'Percentual "%" fora do intervalo (0, 100].', p_value using errcode = 'invalid_parameter_value';
  end if;
  return v_raw::numeric(7, 4);
end;
$$;

create function private.to_money(p_value text)
returns numeric(14, 2)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_raw numeric;
begin
  if p_value is null or p_value !~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then
    raise exception 'Valor monetário inválido: "%".', p_value using errcode = 'invalid_parameter_value';
  end if;
  v_raw := p_value::numeric;
  if v_raw <> pg_catalog.round(v_raw, 2) then
    raise exception 'Valor "%" tem mais de 2 casas decimais.', p_value using errcode = 'invalid_parameter_value';
  end if;
  if v_raw < 0 then
    raise exception 'Valor "%" não pode ser negativo.', p_value using errcode = 'invalid_parameter_value';
  end if;
  return v_raw::numeric(14, 2);
end;
$$;

-- -----------------------------------------------------------------------------
-- Auditoria
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,            -- sem FK de propósito: o log sobrevive ao usuário
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

comment on table public.audit_logs is
  'Trilha de auditoria append-only das ações financeiras relevantes. Gravada exclusivamente por triggers.';

create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index audit_logs_user_idx on public.audit_logs (user_id, created_at desc);

alter table public.audit_logs enable row level security;

-- Bloqueia alteração/remoção de registros de auditoria.
create function private.prevent_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% é imutável: operação % não permitida.', tg_table_name, tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_logs_immutable
  before update or delete on public.audit_logs
  for each row execute function private.prevent_mutation();

-- Trigger genérico de auditoria.
--   TG_ARGV[0] = entity_type gravado no log.
--   INSERT -> 'CREATE' com a linha completa.
--   UPDATE -> 'UPDATE' apenas com as colunas alteradas (old/new).
--   DELETE -> 'DELETE' com a linha completa.
-- Ações semânticas específicas sobrescrevem as genéricas (ver CASE abaixo).
create function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entity_type constant text := tg_argv[0];
  v_old_row jsonb;
  v_new_row jsonb;
  v_old jsonb;
  v_new jsonb;
  v_action text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old_row := pg_catalog.to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new_row := pg_catalog.to_jsonb(new);
  end if;

  if tg_op = 'INSERT' then
    v_action := 'CREATE';
    v_new := v_new_row;
  elsif tg_op = 'DELETE' then
    v_action := 'DELETE';
    v_old := v_old_row;
  else
    select pg_catalog.jsonb_object_agg(o.key, o.value),
           pg_catalog.jsonb_object_agg(o.key, n.value)
      into v_old, v_new
      from pg_catalog.jsonb_each(v_old_row) o
      join pg_catalog.jsonb_each(v_new_row) n on n.key = o.key
     where o.value is distinct from n.value
       and o.key <> 'updated_at';

    if v_new is null then
      return null; -- nada relevante mudou
    end if;
    v_action := 'UPDATE';
  end if;

  -- Ações semânticas
  v_action := case
    when v_entity_type = 'competency' and tg_op = 'INSERT' then 'OPEN'
    when v_entity_type = 'competency' and tg_op = 'UPDATE'
         and v_new ? 'status' and v_new_row ->> 'status' = 'CLOSED' then 'CLOSE'
    when v_entity_type = 'receipt' and tg_op = 'UPDATE'
         and v_new ? 'status' and v_new_row ->> 'status' = 'CONFIRMED' then 'CONFIRM'
    when v_entity_type = 'receipt' and tg_op = 'UPDATE'
         and v_new ? 'receiving_indicator_id'
         and v_new_row ->> 'receiver_identification_method' = 'MANUAL' then 'MANUAL_RECEIVER_IDENTIFICATION'
    when v_entity_type = 'receipt_allocation' and tg_op = 'INSERT' then 'ALLOCATION_SNAPSHOT'
    when v_entity_type = 'settlement' and tg_op = 'INSERT' then 'SETTLEMENT'
    else v_action
  end;

  insert into public.audit_logs (user_id, entity_type, entity_id, action, old_data, new_data)
  values (
    auth.uid(),
    v_entity_type,
    (coalesce(v_new_row, v_old_row) ->> 'id')::uuid,
    v_action,
    v_old,
    v_new
  );

  return null;
end;
$$;

revoke execute on function private.audit_row_change() from public;
revoke execute on function private.prevent_mutation() from public;
revoke execute on function private.set_updated_at() from public;
