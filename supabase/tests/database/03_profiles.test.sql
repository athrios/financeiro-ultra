-- =============================================================================
-- pgTAP · Perfis: criação sem papel, guardas de acesso (motivo opcional, sem autopromoção,
-- nunca zero Administradores ativos), exclusão em cascata e current_partner_id().
-- Rastreio: CA-07, CA-08, CA-09 (revisado, RAT-D021) · I-03, I-04, I-05, I-07, I-08, R-D20.
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(33);

-- Independência dos dados locais: o banco de teste pode ter os Administradores do seed:dev. Eles
-- são inativados (com motivo) só dentro desta transação, desfeita no rollback, para que a trava
-- do último Administrador (I-08) seja provada com os Administradores criados abaixo.
select private.set_audit_context('preparo do teste', 'SCRIPT', null, 'pgtap');
update public.profiles set active = false where role = 'ADMINISTRATOR' and active;

-- Estado inicial sem contexto de auditoria herdado.
select private.set_audit_context(null, null, null, null);

insert into public.partners (id, name) values
  ('f2000000-0000-4000-8000-000000000001', 'Sócio Teste A'),
  ('f2000000-0000-4000-8000-000000000002', 'Sócio Teste B');

-- -----------------------------------------------------------------------------
-- Usuário novo nasce SEM papel e com o nome do metadado (I-03)
-- -----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('f1000000-0000-4000-8000-000000000001', 'pgtap-adm1@example.com', '{"full_name": "  Admin Teste  "}'),
  ('f1000000-0000-4000-8000-000000000002', 'pgtap-adm2@example.com', '{}'),
  ('f1000000-0000-4000-8000-000000000003', 'pgtap-op@example.com',   '{}'),
  ('f1000000-0000-4000-8000-000000000004', 'pgtap-socio@example.com','{}'),
  ('f1000000-0000-4000-8000-000000000005', 'pgtap-socio2@example.com','{}');

select is((select role::text from public.profiles where id = 'f1000000-0000-4000-8000-000000000001'), null,
  'Usuário novo nasce com role nulo (nenhum acesso)');
select is((select full_name from public.profiles where id = 'f1000000-0000-4000-8000-000000000001'), 'Admin Teste',
  'O perfil herda full_name do metadado do Auth (sem espaços nas pontas)');
select is((select partner_id from public.profiles where id = 'f1000000-0000-4000-8000-000000000001'), null,
  'Usuário novo nasce sem sócio');

-- -----------------------------------------------------------------------------
-- Motivo opcional (RAT-D021, CA-09 revisado): a ação funciona sem motivo e fica auditada com reason nulo.
-- Usa o usuário 5 (descartável); a atribuição com motivo informado é provada mais abaixo.
-- -----------------------------------------------------------------------------
select lives_ok(
  $$update public.profiles set role = 'OPERATOR' where id = 'f1000000-0000-4000-8000-000000000005'$$,
  'Mudar papel sem motivo funciona (RAT-D021)');
select is(
  (select reason from public.audit_logs
    where entity = 'profile' and entity_id = 'f1000000-0000-4000-8000-000000000005'
      and kind = 'ROW_CHANGE' and action = 'UPDATE' order by seq desc limit 1),
  null, 'A mudança de papel sem motivo fica auditada com reason nulo');
select lives_ok(
  $$update public.profiles set active = false where id = 'f1000000-0000-4000-8000-000000000005'$$,
  'Inativar sem motivo funciona (RAT-D021)');
select lives_ok(
  $$select private.set_user_access('pgtap-socio2@example.com', 'VIEWER', null, false, E'  \t\r\n ', 'pgtap')$$,
  'set_user_access com motivo só em branco funciona (RAT-D021)');
select is(
  (select count(*) from public.audit_logs
    where entity = 'profile' and entity_id = 'f1000000-0000-4000-8000-000000000005'
      and reason is not null),
  0::bigint, 'Motivo em branco vira NULL na auditoria (nenhuma linha do usuário 5 com motivo)');

select lives_ok(
  $$select private.set_user_access('pgtap-adm1@example.com', 'ADMINISTRATOR', null, true, 'primeiro admin de teste', 'pgtap')$$,
  'set_user_access promove com motivo');
select is(
  (select reason from public.audit_logs
    where entity = 'profile' and entity_id = 'f1000000-0000-4000-8000-000000000001'
      and kind = 'ROW_CHANGE' and action = 'UPDATE' order by seq desc limit 1),
  'primeiro admin de teste', 'A auditoria do UPDATE guarda o motivo');
select is(
  (select new_data from public.audit_logs
    where entity = 'profile' and entity_id = 'f1000000-0000-4000-8000-000000000001'
      and kind = 'ROW_CHANGE' and action = 'UPDATE' order by seq desc limit 1),
  '{"role": "ADMINISTRATOR"}'::jsonb, 'O UPDATE grava só a coluna alterada');
select is(
  (select count(*) from public.audit_logs
    where entity = 'profile' and entity_id = 'f1000000-0000-4000-8000-000000000001' and action = 'ACCESS_CHANGE' and kind = 'EVENT'),
  1::bigint, 'set_user_access grava o EVENT ACCESS_CHANGE');

select lives_ok(
  $$select private.set_user_access('pgtap-op@example.com', 'OPERATOR', null, true, 'operador de teste', 'pgtap')$$,
  'set_user_access atribui OPERATOR');

-- -----------------------------------------------------------------------------
-- Idempotência: nada mudou, nada escrito
-- -----------------------------------------------------------------------------
create temp table marks (name text primary key, seq bigint);
insert into marks select 'before_noop', coalesce(max(seq), 0) from public.audit_logs;
select private.set_user_access('pgtap-op@example.com', 'OPERATOR', null, true, 'operador de teste', 'pgtap');
select is((select count(*) from public.audit_logs where seq > (select seq from marks where name = 'before_noop')), 0::bigint,
  'set_user_access sem mudança não escreve nada');

-- -----------------------------------------------------------------------------
-- CHECK e unicidade (I-04, I-05)
-- -----------------------------------------------------------------------------
select throws_ok(
  $$select private.set_user_access('pgtap-socio@example.com', 'PARTNER', null, true, 'sem sócio', 'pgtap')$$,
  '23514', null, 'PARTNER sem partner_id falha');

select lives_ok(
  $$select private.set_user_access('pgtap-socio@example.com', 'PARTNER', 'f2000000-0000-4000-8000-000000000001', true, 'sócio de teste', 'pgtap')$$,
  'PARTNER com sócio é aceito');
select throws_ok(
  $$select private.set_user_access('pgtap-socio2@example.com', 'PARTNER', 'f2000000-0000-4000-8000-000000000001', true, 'mesmo sócio', 'pgtap')$$,
  '23505', null, 'Dois perfis para o mesmo sócio falham');
select lives_ok(
  $$select private.set_user_access('pgtap-adm2@example.com', 'ADMINISTRATOR', 'f2000000-0000-4000-8000-000000000002', true, 'admin que também é sócio', 'pgtap')$$,
  'Papel não PARTNER pode ter partner_id (Administrador que é sócio)');

-- -----------------------------------------------------------------------------
-- INSERT de perfil já com papel/sócio contorna a guarda? (R-D20)
-- -----------------------------------------------------------------------------
select private.set_audit_context(null, null, null, null);
delete from public.profiles where id = 'f1000000-0000-4000-8000-000000000003';   -- OPERATOR, não é o último admin
-- RAT-D021: sem motivo, a guarda de INSERT não bloqueia (a serialização e a auditoria continuam).
-- A proteção contra autopromoção é por privilégio de coluna e RLS (testes 02), não pelo motivo.
select lives_ok(
  $$insert into public.profiles (id, role) values ('f1000000-0000-4000-8000-000000000003', 'OPERATOR')$$,
  'INSERT de perfil já com papel, sem motivo, funciona e é auditado (RAT-D021)');
select is(
  (select reason from public.audit_logs
    where entity = 'profile' and entity_id = 'f1000000-0000-4000-8000-000000000003'
      and kind = 'ROW_CHANGE' and action = 'CREATE' order by seq desc limit 1),
  null, 'O CREATE do perfil sem motivo fica auditado com reason nulo');
delete from public.profiles where id = 'f1000000-0000-4000-8000-000000000003';
insert into public.partners (id, name) values ('f2000000-0000-4000-8000-000000000003', 'Sócio Teste C');
select lives_ok(
  $$insert into public.profiles (id, partner_id) values ('f1000000-0000-4000-8000-000000000003', 'f2000000-0000-4000-8000-000000000003')$$,
  'INSERT de perfil já com sócio, sem motivo, funciona (RAT-D021)');
delete from public.profiles where id = 'f1000000-0000-4000-8000-000000000003';
select lives_ok(
  $$insert into public.profiles (id) values ('f1000000-0000-4000-8000-000000000003')$$,
  'INSERT de perfil sem papel e sem sócio é aceito (caminho do Auth e dos procedimentos)');

-- -----------------------------------------------------------------------------
-- Nunca zero Administradores ativos (I-08)
-- -----------------------------------------------------------------------------
select lives_ok(
  $$select private.set_user_access('pgtap-adm2@example.com', 'ADMINISTRATOR', 'f2000000-0000-4000-8000-000000000002', false, 'inativar um dos dois', 'pgtap');
    set constraints all immediate$$,
  'Inativar um Administrador é aceito enquanto outro ativo permanece');
set constraints all deferred;

select throws_ok(
  $$select private.set_user_access('pgtap-adm1@example.com', 'ADMINISTRATOR', null, false, 'inativar o último', 'pgtap');
    set constraints all immediate$$,
  '23514', 'A operação deixaria o sistema sem Administrador ativo.', 'Inativar o último Administrador ativo falha');
set constraints all deferred;

select throws_ok(
  $$select private.set_user_access('pgtap-adm1@example.com', 'OPERATOR', null, true, 'rebaixar o último', 'pgtap');
    set constraints all immediate$$,
  '23514', 'A operação deixaria o sistema sem Administrador ativo.', 'Rebaixar o último Administrador ativo falha');
set constraints all deferred;

select throws_ok(
  $$delete from auth.users where id = 'f1000000-0000-4000-8000-000000000001';
    set constraints all immediate$$,
  '23514', 'A operação deixaria o sistema sem Administrador ativo.', 'Excluir (em cascata, pelo Auth) o último Administrador ativo falha');
set constraints all deferred;

-- -----------------------------------------------------------------------------
-- Exclusão em cascata continua funcionando para quem não é o último Administrador
-- (inclui o papel que o GoTrue usa: supabase_auth_admin, sem SELECT em public)
-- -----------------------------------------------------------------------------
select lives_ok(
  $$delete from auth.users where id = 'f1000000-0000-4000-8000-000000000005'$$,
  'Excluir usuário sem papel remove o perfil em cascata (como postgres)');
select is((select count(*) from public.profiles where id = 'f1000000-0000-4000-8000-000000000005'), 0::bigint,
  'O perfil do usuário excluído desapareceu');

-- O GoTrue exclui usuários como supabase_auth_admin, que não tem SELECT em public.profiles (e o
-- papel postgres não pode assumi-lo num teste). A trava do último Administrador é avaliada sob esse
-- papel no COMMIT; por isso a função é SECURITY DEFINER (divergência D-E4-01).
select ok(
  (select p.prosecdef from pg_proc p where p.oid = 'private.assert_admin_remains()'::regprocedure)
  and not has_table_privilege('supabase_auth_admin', 'public.profiles', 'select'),
  'A trava do último Administrador é SECURITY DEFINER (o papel do GoTrue não lê public.profiles)');

-- -----------------------------------------------------------------------------
-- current_partner_id(): nulo para sócio inativo (3.3)
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is(private.current_partner_id(), 'f2000000-0000-4000-8000-000000000001'::uuid,
  'current_partner_id() devolve o sócio do usuário PARTNER ativo');
reset role;

update public.partners set active = false where id = 'f2000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is(private.current_partner_id(), null, 'current_partner_id() é nulo quando o sócio está inativo');
reset role;

select private.set_user_access('pgtap-socio@example.com', 'PARTNER', 'f2000000-0000-4000-8000-000000000001', false, 'inativar o login do sócio', 'pgtap');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is(private.current_partner_id(), null, 'current_partner_id() é nulo quando o perfil está inativo');
reset role;

-- -----------------------------------------------------------------------------
-- Identidade imutável
-- -----------------------------------------------------------------------------
select throws_ok(
  $$update public.profiles set id = gen_random_uuid() where id = 'f1000000-0000-4000-8000-000000000001'$$,
  '42501', 'Identidade do perfil é imutável.', 'O id do perfil é imutável');

select * from finish();
rollback;
