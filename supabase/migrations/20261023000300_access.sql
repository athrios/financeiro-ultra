-- =============================================================================
-- 0300 · Sócio mínimo, perfis, papéis, autorização e procedimentos de acesso
-- FND-001 / E4 · Fonte: 02-modelagem-dados.md, seções 3.3, 3.4 e 6
-- =============================================================================

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
create trigger partners_no_truncate before truncate on public.partners
  for each statement execute function private.prevent_truncate();  -- SEG-E45-08
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
create trigger profiles_no_truncate before truncate on public.profiles
  for each statement execute function private.prevent_truncate();  -- SEG-E45-08
alter table public.profiles enable row level security;

-- Perfil criado automaticamente, SEM papel (corrige F-01).
-- Regra (0200, set_audit_context): função chamada por trigger NÃO sobrescreve o contexto
-- de auditoria da transação. Ela não chama private.set_audit_context (que redefine os
-- quatro GUCs).
--   * Sem contexto (transação do GoTrue, sem JWT): o CREATE do perfil sai com
--     source = SYSTEM e actor_label = 'supabase-auth' (senão a auditoria marcaria DIRECT).
--   * Com contexto já definido (script, seed, pgTAP, editor SQL): o CREATE herda o do chamador.
--   * Motivo (app.audit_reason) e correlação (app.correlation_id) nunca são tocados.
--   * Origem e rótulo voltam ao valor anterior logo depois do INSERT: nada vaza para as
--     escritas seguintes da mesma transação.
-- O trigger profiles_audit é AFTER ROW comum (não diferido): dispara ao fim do INSERT abaixo,
-- antes da restauração. Se um dia virar constraint trigger diferido, esta função precisa mudar.
-- Se o INSERT falhar dentro de um savepoint, o rollback do savepoint desfaz também os set_config.
create function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_prev_source text := coalesce(current_setting('app.audit_source', true), '');
  v_prev_label  text := coalesce(current_setting('app.audit_actor_label', true), '');
begin
  if v_prev_source = '' then
    perform pg_catalog.set_config('app.audit_source', 'SYSTEM', true);
    if v_prev_label = '' then
      perform pg_catalog.set_config('app.audit_actor_label', 'supabase-auth', true);
    end if;
  end if;

  insert into public.profiles (id, full_name)
  values (new.id, nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name'), ''))
  on conflict (id) do nothing;

  -- Restaura exatamente o que havia antes ('' = sem contexto; os leitores usam nullif).
  perform pg_catalog.set_config('app.audit_source',      v_prev_source, true);
  perform pg_catalog.set_config('app.audit_actor_label', v_prev_label,  true);
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
revoke execute on function private.has_role(variadic public.app_role[]) from public;
revoke execute on function private.is_admin()           from public;
revoke execute on function private.can_operate()        from public;
revoke execute on function private.can_read_business()  from public;
revoke execute on function private.current_partner_id() from public;
grant execute on function private.has_role(variadic public.app_role[]) to authenticated;
grant execute on function private.is_admin()           to authenticated;
grant execute on function private.can_operate()        to authenticated;
grant execute on function private.can_read_business()  to authenticated;
grant execute on function private.current_partner_id() to authenticated;

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
revoke execute on function private.profiles_guard_update() from public;
revoke execute on function private.profiles_guard_insert() from public;

-- Depois de existir um Administrador ativo, o sistema nunca fica sem nenhum.
-- SECURITY DEFINER (divergência D-E4-01): a verificação roda no COMMIT, sob o papel de quem
-- apagou o usuário (ex.: supabase_auth_admin, sem SELECT em public.profiles).
create function private.assert_admin_remains()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'ADMINISTRATOR' and old.active
     and not exists (select 1 from public.profiles p where p.role = 'ADMINISTRATOR' and p.active) then
    raise exception 'A operação deixaria o sistema sem Administrador ativo.' using errcode = 'check_violation';
  end if;
  return null;
end;
$$;
revoke execute on function private.assert_admin_remains() from public;
create constraint trigger profiles_admin_remains
  after update or delete on public.profiles
  deferrable initially deferred
  for each row execute function private.assert_admin_remains();
-- Também barra a exclusão (em cascata, pelo Auth) do último Administrador ativo.

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
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

-- Matriz do plano 6: só o Administrador lê a auditoria.
create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated
  using ((select private.is_admin()));

-- -----------------------------------------------------------------------------
-- Procedimentos de acesso da FND (plano 6; P-24: sem tela). Contratos na seção 6.
-- Executados pelo responsável no editor SQL do painel (papel postgres).
-- Para os dois: revoke all ... from public, anon, authenticated, service_role.
-- Ambiente local: o seed atribui papéis chamando set_user_access pela CLI
-- (supabase db query --local, conexão como postgres).
-- -----------------------------------------------------------------------------

-- Localiza exatamente um usuário do Auth pelo e-mail e garante o perfil (sem papel).
-- Auxiliar dos dois procedimentos; mesmas permissões (somente o dono).
create function private.resolve_user_for_access(p_email text)
returns uuid
language plpgsql set search_path = '' as $$
declare
  v_ids uuid[];
begin
  select pg_catalog.array_agg(u.id) into v_ids
    from auth.users u
   where pg_catalog.lower(u.email) = pg_catalog.lower(pg_catalog.btrim(p_email))
     and u.deleted_at is null;

  if v_ids is null or pg_catalog.cardinality(v_ids) = 0 then
    raise exception 'Nenhum usuário com este e-mail: crie/convide o usuário no painel primeiro.'
      using errcode = 'no_data_found';
  end if;
  if pg_catalog.cardinality(v_ids) > 1 then
    raise exception 'Mais de um usuário com este e-mail.' using errcode = 'too_many_rows';
  end if;

  -- Cobre o usuário criado antes do trigger do Auth. Sem papel e sem sócio, o que a
  -- guarda de INSERT aceita.
  insert into public.profiles (id) values (v_ids[1]) on conflict (id) do nothing;
  return v_ids[1];
end;
$$;

-- Bootstrap do primeiro Administrador (seção 6.2).
create function private.bootstrap_first_admin(p_email text, p_executor_label text)
returns text
language plpgsql set search_path = '' as $$
declare
  v_email   text := pg_catalog.btrim(coalesce(p_email, ''));
  v_label   text := pg_catalog.btrim(coalesce(p_executor_label, ''));
  v_user_id uuid;
  v_profile public.profiles;
begin
  -- 1. Validação
  if v_email !~ '^[^@<>[:space:]]+@[^@<>[:space:]]+\.[^@<>[:space:]]+$' then
    raise exception 'E-mail inválido (o placeholder do script versionado precisa ser substituído).'
      using errcode = 'invalid_parameter_value';
  end if;
  if v_label = '' or pg_catalog.char_length(v_label) > 200 then
    raise exception 'Identificação de quem executa é obrigatória (até 200 caracteres).'
      using errcode = 'invalid_parameter_value';
  end if;

  -- 2. Serialização (mesma trava das mudanças de acesso)
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('financeiro_ultra.access_change'));

  -- 3. Contexto, ANTES de qualquer escrita (inclusive o CREATE do passo 5)
  perform private.set_audit_context('Bootstrap do primeiro Administrador', 'SCRIPT', null, v_label);

  -- 4 e 5. Usuário e perfil
  v_user_id := private.resolve_user_for_access(v_email);
  select * into v_profile from public.profiles where id = v_user_id for update;

  -- 6. Idempotência: já é Administrador ativo, não escreve nada
  if v_profile.role = 'ADMINISTRATOR' and v_profile.active then
    return 'ALREADY_ADMIN';
  end if;

  -- 7. Só o primeiro
  if exists (select 1 from public.profiles p where p.role = 'ADMINISTRATOR' and p.active and p.id <> v_user_id) then
    raise exception 'Já existe Administrador; use private.set_user_access.' using errcode = 'check_violation';
  end if;

  -- 8. Promoção (ROW_CHANGE com motivo, origem SCRIPT e rótulo)
  update public.profiles set role = 'ADMINISTRATOR', active = true where id = v_user_id;

  -- 9. Evento semântico (sem o e-mail no payload)
  perform private.audit_event('profile', v_user_id, 'BOOTSTRAP_ADMIN', pg_catalog.jsonb_build_object('executor', v_label));

  -- 10.
  return 'PROMOTED';
end;
$$;

-- Procedimento geral de acesso (seção 6.3).
create function private.set_user_access(
  p_email          text,
  p_role           public.app_role,
  p_partner_id     uuid,
  p_active         boolean,
  p_reason         text,
  p_executor_label text
) returns void
language plpgsql set search_path = '' as $$
declare
  v_reason  text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_label   text := pg_catalog.btrim(coalesce(p_executor_label, ''));
  v_user_id uuid;
  v_before  public.profiles;
begin
  if v_reason = '' then
    raise exception 'Motivo é obrigatório.' using errcode = 'invalid_parameter_value';
  end if;
  if v_label = '' or pg_catalog.char_length(v_label) > 200 then
    raise exception 'Identificação de quem executa é obrigatória (até 200 caracteres).'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_active is null then
    raise exception 'Informe se o usuário fica ativo.' using errcode = 'invalid_parameter_value';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('financeiro_ultra.access_change'));
  perform private.set_audit_context(v_reason, 'SCRIPT', null, v_label);   -- antes de qualquer escrita

  v_user_id := private.resolve_user_for_access(p_email);
  select * into v_before from public.profiles where id = v_user_id for update;

  -- Idempotente: nada mudou, nada é escrito.
  if (v_before.role, v_before.partner_id, v_before.active)
     is not distinct from (p_role, p_partner_id, p_active) then
    return;
  end if;

  update public.profiles
     set role = p_role, partner_id = p_partner_id, active = p_active
   where id = v_user_id;

  perform private.audit_event('profile', v_user_id, 'ACCESS_CHANGE', pg_catalog.jsonb_build_object(
    'previous_role', v_before.role, 'new_role', p_role,
    'previous_partner_id', v_before.partner_id, 'new_partner_id', p_partner_id,
    'previous_active', v_before.active, 'new_active', p_active));
end;
$$;

revoke all on function private.resolve_user_for_access(text) from public, anon, authenticated, service_role;
revoke all on function private.bootstrap_first_admin(text, text) from public, anon, authenticated, service_role;
revoke all on function private.set_user_access(text, public.app_role, uuid, boolean, text, text)
  from public, anon, authenticated, service_role;
