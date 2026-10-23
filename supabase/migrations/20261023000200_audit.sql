-- =============================================================================
-- 0200 · Auditoria estendida e append-only
-- FND-001 / E4 · Fonte: 02-modelagem-dados.md, seção 3.2
-- =============================================================================
-- Trilha única: ROW_CHANGE (trigger genérico em toda escrita das tabelas
-- auditadas) e EVENT (ação semântica gravada explicitamente pelas RPCs e
-- procedimentos). A política de leitura (somente Administrador) fica na 0300,
-- depois de private.is_admin().
-- =============================================================================

create table public.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  seq             bigint generated always as identity,            -- ordem total
  created_at      timestamptz not null default clock_timestamp(), -- relógio do servidor, por evento
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
-- Função disparada por TRIGGER nunca chama esta função (seção 3.2, "Quem define o contexto").
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
-- public.profiles é criada na 0300; como a função é plpgsql, a referência
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
  -- clara em vez de violar o NOT NULL de entity_id. O teste de catálogo barra antes.
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
