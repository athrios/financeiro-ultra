-- =============================================================================
-- pgTAP · Auditoria: append-only (UPDATE, DELETE e TRUNCATE bloqueados), motivo, origem,
-- correlação, horário do servidor, ordem total, diff por coluna, redação e a regra
-- "função disparada por trigger não sobrescreve o contexto" (I-10b).
-- Rastreio: CA-09, CA-12 · I-09, I-10, I-10b, R-D13, R-D21, R-D22.
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(36);

create temp table marks (name text primary key, seq bigint);

select private.set_audit_context(null, null, null, null);

-- -----------------------------------------------------------------------------
-- Append-only (I-09)
-- -----------------------------------------------------------------------------
insert into public.partners (id, name) values ('f2000000-0000-4000-8000-000000000001', 'Sócio Teste A');

select throws_ok($$update public.audit_logs set reason = 'adulterado'$$, '42501', null,
  'UPDATE em audit_logs falha (inclusive como postgres)');
select throws_ok($$delete from public.audit_logs$$, '42501', null,
  'DELETE em audit_logs falha (inclusive como postgres)');
select throws_ok($$truncate public.audit_logs$$, '42501', 'audit_logs é imutável: TRUNCATE não permitido.',
  'TRUNCATE em audit_logs falha (trigger BEFORE TRUNCATE, inclusive como postgres)');
select throws_ok($$truncate public.audit_logs cascade$$, '42501', null,
  'TRUNCATE ... CASCADE em audit_logs também falha');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000099","role":"authenticated"}', true);
select throws_ok($$insert into public.audit_logs (kind, entity, entity_id, action, source, request_role)
                    values ('EVENT', 'x', gen_random_uuid(), 'FORGED', 'UI', 'authenticated')$$,
  '42501', null, 'INSERT direto em audit_logs por authenticated falha');
select throws_ok($$truncate public.audit_logs$$, '42501', null, 'authenticated não faz TRUNCATE em audit_logs');
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok($$insert into public.audit_logs (kind, entity, entity_id, action, source, request_role)
                    values ('EVENT', 'x', gen_random_uuid(), 'FORGED', 'SYSTEM', 'service_role')$$,
  '42501', null, 'INSERT direto em audit_logs por service_role falha');
reset role;
select set_config('request.jwt.claims', '', true);

-- -----------------------------------------------------------------------------
-- Regra "toda tabela auditada tem id uuid" (3.4)
-- -----------------------------------------------------------------------------
create table public.zz_sem_id (a int);
create trigger zz_sem_id_audit after insert on public.zz_sem_id
  for each row execute function private.audit_row_change('zz_sem_id');
select throws_ok($$insert into public.zz_sem_id values (1)$$, '0A000',
  'Tabela auditada zz_sem_id não tem coluna id (regra da seção 3.4).',
  'Trigger em tabela sem coluna id falha com a mensagem da regra');

-- -----------------------------------------------------------------------------
-- Origem DIRECT sem contexto; horário do servidor por evento; ordem total
-- -----------------------------------------------------------------------------
insert into marks select 'direct', coalesce(max(seq), 0) from public.audit_logs;
select pg_sleep(0.02);
insert into public.partners (id, name) values ('f2000000-0000-4000-8000-000000000002', 'Sócio Teste B');
select pg_sleep(0.02);
insert into public.partners (id, name) values ('f2000000-0000-4000-8000-000000000003', 'Sócio Teste C');

select results_eq(
  $$select source::text, actor_label, reason, request_role, actor_user_id, correlation_id
      from public.audit_logs where seq > (select seq from marks where name = 'direct') order by seq$$,
  $$values ('DIRECT', null, null, 'direct:postgres', null::uuid, null::uuid),
           ('DIRECT', null, null, 'direct:postgres', null::uuid, null::uuid)$$,
  'Escrita sem contexto sai com source DIRECT, request_role direct:postgres e sem ator');
select ok(
  (select bool_and(created_at > now()) from public.audit_logs where seq > (select seq from marks where name = 'direct')),
  'created_at é o relógio do servidor por evento (clock_timestamp), não o instante da transação');
select ok(
  (select count(distinct created_at) = 2 from public.audit_logs where seq > (select seq from marks where name = 'direct')),
  'Dois eventos da mesma transação têm horários diferentes');
select ok(
  (select bool_and(seq > lag_seq) from (
     select seq, lag(seq) over (order by seq) lag_seq from public.audit_logs
      where seq > (select seq from marks where name = 'direct')) q where lag_seq is not null),
  'seq cresce dentro da mesma transação (ordem total)');
select is(
  (select count(distinct tx_id) from public.audit_logs where seq > (select seq from marks where name = 'direct')),
  1::bigint, 'Eventos da mesma transação compartilham tx_id');
select ok(
  not exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'audit_logs' and column_name = 'seq'
                 and is_identity = 'NO'),
  'seq é coluna de identidade (gerada pelo banco)');

-- -----------------------------------------------------------------------------
-- UPDATE: só colunas alteradas; sem mudança não grava; updated_at ignorado
-- -----------------------------------------------------------------------------
insert into marks select 'upd', coalesce(max(seq), 0) from public.audit_logs;
update public.partners set name = name where id = 'f2000000-0000-4000-8000-000000000001';
select is((select count(*) from public.audit_logs where seq > (select seq from marks where name = 'upd')), 0::bigint,
  'UPDATE sem mudança não gera linha de auditoria');
update public.partners set active = false where id = 'f2000000-0000-4000-8000-000000000001';
select results_eq(
  $$select action, previous_data, new_data from public.audit_logs where seq > (select seq from marks where name = 'upd')$$,
  $$values ('UPDATE', '{"active": true}'::jsonb, '{"active": false}'::jsonb)$$,
  'UPDATE grava só a coluna alterada (sem updated_at)');

-- INSERT guarda a linha nova; DELETE de proof_files não existe, então o DELETE é provado pelo cascade de perfil
select ok(
  (select new_data ? 'name' and new_data ->> 'name' = 'Sócio Teste B' from public.audit_logs
    where entity = 'partner' and entity_id = 'f2000000-0000-4000-8000-000000000002' and action = 'CREATE'),
  'INSERT grava a linha nova inteira');

-- -----------------------------------------------------------------------------
-- Redação de colunas (proof_files.raw_extraction)
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values ('f1000000-0000-4000-8000-000000000002', 'pgtap-operador@example.com');
select private.set_user_access('pgtap-operador@example.com', 'OPERATOR', null, true, 'operador de teste', 'pgtap');
select private.set_audit_context(null, null, null, null);

select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
insert into public.proof_files (id, sha256, mime_type, size_bytes) values
  ('f3000000-0000-4000-8000-000000000001', repeat('c', 64), 'image/png', 500);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.proof_files set raw_extraction = '{"cpf": "000.000.000-00"}', extraction_status = 'DONE'
 where id = 'f3000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims', '', true);

select is(
  (select new_data ->> 'raw_extraction' from public.audit_logs
    where entity = 'proof_file' and entity_id = 'f3000000-0000-4000-8000-000000000001' and action = 'UPDATE'),
  '[omitido]', 'raw_extraction aparece como "[omitido]" na auditoria');
select ok(
  not exists (select 1 from public.audit_logs where new_data::text like '%000.000.000-00%' or previous_data::text like '%000.000.000-00%'),
  'O conteúdo da extração não vaza em nenhuma linha da auditoria');


-- -----------------------------------------------------------------------------
-- Ator e papel vêm do JWT e do banco (R-D13); source UI para usuário autenticado
-- -----------------------------------------------------------------------------
insert into marks select 'ator', coalesce(max(seq), 0) from public.audit_logs;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select * from public.register_proof_file(repeat('d', 64), 'application/pdf', 700, 'x.pdf');
reset role;
select results_eq(
  $$select source::text, actor_user_id, actor_role::text, request_role, actor_label
      from public.audit_logs where seq > (select seq from marks where name = 'ator') order by seq$$,
  $$values ('UI', 'f1000000-0000-4000-8000-000000000002'::uuid, 'OPERATOR', 'authenticated', null::text)$$,
  'Escrita do usuário autenticado: source UI, ator do JWT, papel lido do banco, request_role authenticated');

insert into marks select 'sys', coalesce(max(seq), 0) from public.audit_logs;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.partners set active = true where id = 'f2000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims', '', true);
select results_eq(
  $$select source::text, actor_user_id, request_role from public.audit_logs where seq > (select seq from marks where name = 'sys')$$,
  $$values ('SYSTEM', null::uuid, 'service_role')$$,
  'Escrita com a chave de serviço sai como SYSTEM / service_role');

-- -----------------------------------------------------------------------------
-- Correlação: GUC e cabeçalho x-correlation-id (D-05); valor inválido é descartado
-- -----------------------------------------------------------------------------
select private.set_audit_context(null, null, null, null);
insert into marks select 'corr1', coalesce(max(seq), 0) from public.audit_logs;
select set_config('request.headers', '{"x-correlation-id": "11111111-2222-4333-8444-555555555555"}', true);
update public.partners set active = false where id = 'f2000000-0000-4000-8000-000000000001';
select is(
  (select correlation_id from public.audit_logs where seq > (select seq from marks where name = 'corr1')),
  '11111111-2222-4333-8444-555555555555'::uuid, 'O cabeçalho x-correlation-id chega a audit_logs.correlation_id');

insert into marks select 'corr2', coalesce(max(seq), 0) from public.audit_logs;
select set_config('request.headers', '{"x-correlation-id": "isto-nao-e-uuid"}', true);
update public.partners set active = true where id = 'f2000000-0000-4000-8000-000000000001';
select is(
  (select correlation_id from public.audit_logs where seq > (select seq from marks where name = 'corr2')),
  null, 'Correlação que não é UUID é descartada sem falhar a escrita');

insert into marks select 'corr3', coalesce(max(seq), 0) from public.audit_logs;
select private.set_audit_context('motivo', 'IMPORT', '99999999-2222-4333-8444-555555555555', 'rotulo');
update public.partners set active = false where id = 'f2000000-0000-4000-8000-000000000001';
select results_eq(
  $$select correlation_id, source::text, reason, actor_label from public.audit_logs where seq > (select seq from marks where name = 'corr3')$$,
  $$values ('99999999-2222-4333-8444-555555555555'::uuid, 'IMPORT', 'motivo', 'rotulo')$$,
  'O contexto da transação (GUC) tem precedência sobre o cabeçalho');
select set_config('request.headers', '', true);
select private.set_audit_context(null, null, null, null);
update public.partners set active = true where id = 'f2000000-0000-4000-8000-000000000001';

-- -----------------------------------------------------------------------------
-- I-10b · criação de usuário não sobrescreve o contexto da transação
-- (a) SEM contexto
-- -----------------------------------------------------------------------------
select private.set_audit_context(null, null, null, null);
insert into marks select 'ctx_a', coalesce(max(seq), 0) from public.audit_logs;
insert into auth.users (id, email) values ('f1000000-0000-4000-8000-0000000000a1', 'pgtap-ctx-a@example.com');

select results_eq(
  $$select kind::text, action, source::text, actor_label, reason from public.audit_logs
     where seq > (select seq from marks where name = 'ctx_a') and entity_id = 'f1000000-0000-4000-8000-0000000000a1'$$,
  $$values ('ROW_CHANGE', 'CREATE', 'SYSTEM', 'supabase-auth', null::text)$$,
  '(a) Sem contexto: o CREATE do perfil sai como SYSTEM / supabase-auth e sem motivo');

insert into marks select 'ctx_a2', coalesce(max(seq), 0) from public.audit_logs;
update public.partners set active = false where id = 'f2000000-0000-4000-8000-000000000001';
select results_eq(
  $$select source::text, actor_label, reason from public.audit_logs where seq > (select seq from marks where name = 'ctx_a2')$$,
  $$values ('DIRECT', null::text, null::text)$$,
  '(a) A escrita seguinte, na mesma transação, volta a DIRECT sem rótulo (nada vazou)');
select is(coalesce(current_setting('app.audit_source', true), ''), '', '(a) app.audit_source voltou vazio');
select is(coalesce(current_setting('app.audit_actor_label', true), ''), '', '(a) app.audit_actor_label voltou vazio');

-- (b) COM contexto
select private.set_audit_context('motivo de teste', 'SCRIPT', 'aaaaaaaa-2222-4333-8444-555555555555', 'pgtap');
insert into marks select 'ctx_b', coalesce(max(seq), 0) from public.audit_logs;
insert into auth.users (id, email) values ('f1000000-0000-4000-8000-0000000000b1', 'pgtap-ctx-b@example.com');

select results_eq(
  $$select action, source::text, reason, correlation_id, actor_label from public.audit_logs
     where seq > (select seq from marks where name = 'ctx_b') and entity_id = 'f1000000-0000-4000-8000-0000000000b1'$$,
  $$values ('CREATE', 'SCRIPT', 'motivo de teste', 'aaaaaaaa-2222-4333-8444-555555555555'::uuid, 'pgtap')$$,
  '(b) Com contexto: o CREATE do perfil herda motivo, origem, correlação e rótulo do chamador');

insert into marks select 'ctx_b2', coalesce(max(seq), 0) from public.audit_logs;
update public.profiles set role = 'OPERATOR' where id = 'f1000000-0000-4000-8000-0000000000b1';
select results_eq(
  $$select action, source::text, reason, correlation_id, actor_label from public.audit_logs
     where seq > (select seq from marks where name = 'ctx_b2')$$,
  $$values ('UPDATE', 'SCRIPT', 'motivo de teste', 'aaaaaaaa-2222-4333-8444-555555555555'::uuid, 'pgtap')$$,
  '(b) A escrita seguinte (mudar o papel) passa pela guarda de motivo e grava os mesmos motivo, origem, correlação e rótulo');
select is(current_setting('app.audit_reason', true), 'motivo de teste', '(b) app.audit_reason intacto');
select is(current_setting('app.audit_source', true), 'SCRIPT', '(b) app.audit_source intacto');
select is(current_setting('app.correlation_id', true), 'aaaaaaaa-2222-4333-8444-555555555555', '(b) app.correlation_id intacto');
select is(current_setting('app.audit_actor_label', true), 'pgtap', '(b) app.audit_actor_label intacto');

-- (c) Falha do INSERT dentro de um savepoint: o rollback desfaz também os set_config
select private.set_audit_context(null, null, null, null);
select throws_ok(
  $$insert into auth.users (id, email) values ('f1000000-0000-4000-8000-0000000000c1', 'pgtap-ctx-a@example.com')$$,
  '23505', null, '(c) E-mail duplicado em auth.users falha');
select is(coalesce(current_setting('app.audit_source', true), ''), '',
  '(c) Depois da falha, a origem continua vazia (set_config desfeito junto com o savepoint)');

select * from finish();
rollback;
