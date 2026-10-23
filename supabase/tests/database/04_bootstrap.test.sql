-- =============================================================================
-- pgTAP · Bootstrap do primeiro Administrador e procedimento set_user_access
-- Contrato: 02-modelagem-dados.md, seção 6. Rastreio: CA-15 · I-07, I-08.
-- Observação: o arquivo roda numa única transação, então "mesmo tx_id" vale para todas as
-- linhas; as linhas de cada passo são separadas por seq (tabela temporária de marcos).
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(29);

create temp table marks (name text primary key, seq bigint);

-- Cenário de produção: nenhum Administrador ativo. O banco de teste pode ter os do seed:dev; eles
-- são inativados só dentro desta transação (desfeita no fim) para provar o "primeiro" de verdade.
select private.set_audit_context('preparo do teste', 'SCRIPT', null, 'pgtap');
update public.profiles set active = false where role = 'ADMINISTRATOR' and active;
select private.set_audit_context(null, null, null, null);

insert into auth.users (id, email) values
  ('f1000000-0000-4000-8000-000000000001', 'pgtap-primeiro@example.com'),
  ('f1000000-0000-4000-8000-000000000002', 'pgtap-segundo@example.com'),
  ('f1000000-0000-4000-8000-000000000003', 'pgtap-semperfil@example.com');

-- -----------------------------------------------------------------------------
-- Validação de entrada
-- -----------------------------------------------------------------------------
select throws_ok(
  $$select private.bootstrap_first_admin('<EMAIL-DO-ADMINISTRADOR>', 'responsavel via painel')$$,
  '22023', null, 'O placeholder do script versionado é rejeitado');
select throws_ok(
  $$select private.bootstrap_first_admin('nao-e-email', 'responsavel via painel')$$,
  '22023', null, 'E-mail sem formato válido é rejeitado');
select throws_ok(
  $$select private.bootstrap_first_admin('pgtap-primeiro@example.com', '   ')$$,
  '22023', null, 'Identificação de quem executa vazia é rejeitada');
select throws_ok(
  $$select private.bootstrap_first_admin('ninguem@example.com', 'responsavel via painel')$$,
  'P0002', null, 'E-mail inexistente no Auth é rejeitado');

-- -----------------------------------------------------------------------------
-- Usuário SEM perfil prévio: CREATE + UPDATE + EVENT, todos com origem SCRIPT (CA-15)
-- -----------------------------------------------------------------------------
delete from public.profiles where id = 'f1000000-0000-4000-8000-000000000003';
insert into marks select 'semperfil', coalesce(max(seq), 0) from public.audit_logs;

select is(private.bootstrap_first_admin('PGTAP-semperfil@example.com', 'pgtap-exec'), 'PROMOTED',
  'Usuário sem perfil prévio é promovido (e-mail sem diferenciar maiúsculas)');

select is(
  (select count(*) from public.audit_logs
    where seq > (select seq from marks where name = 'semperfil')
      and entity = 'profile' and entity_id = 'f1000000-0000-4000-8000-000000000003'),
  3::bigint, 'Exatamente três linhas de auditoria: CREATE, UPDATE e BOOTSTRAP_ADMIN');
select results_eq(
  $$select kind::text, action from public.audit_logs
     where seq > (select seq from marks where name = 'semperfil')
       and entity_id = 'f1000000-0000-4000-8000-000000000003' order by seq$$,
  $$values ('ROW_CHANGE', 'CREATE'), ('ROW_CHANGE', 'UPDATE'), ('EVENT', 'BOOTSTRAP_ADMIN')$$,
  'A sequência é ROW_CHANGE CREATE, ROW_CHANGE UPDATE, EVENT BOOTSTRAP_ADMIN');
select is(
  (select count(*) from public.audit_logs
    where seq > (select seq from marks where name = 'semperfil')
      and entity_id = 'f1000000-0000-4000-8000-000000000003'
      and source = 'SCRIPT' and actor_label = 'pgtap-exec'
      and reason = 'Bootstrap do primeiro Administrador'
      and tx_id = pg_current_xact_id()),
  3::bigint, 'As três linhas têm source SCRIPT, rótulo, motivo e o mesmo tx_id');
select is(
  (select request_role from public.audit_logs
    where seq > (select seq from marks where name = 'semperfil') and action = 'BOOTSTRAP_ADMIN'),
  'direct:postgres', 'request_role registra a conexão direta (direct:postgres)');
select is(
  (select new_data from public.audit_logs
    where seq > (select seq from marks where name = 'semperfil') and action = 'BOOTSTRAP_ADMIN'),
  '{"executor": "pgtap-exec"}'::jsonb, 'O payload do EVENT não leva o e-mail');
select is(
  (select count(*) from public.profiles where role = 'ADMINISTRATOR' and active),
  1::bigint, 'Existe exatamente um Administrador ativo (o promovido pelo bootstrap)');

-- -----------------------------------------------------------------------------
-- Idempotência (segunda execução)
-- -----------------------------------------------------------------------------
delete from marks where name = 'segunda';
insert into marks select 'segunda', coalesce(max(seq), 0) from public.audit_logs;
select is(private.bootstrap_first_admin('pgtap-semperfil@example.com', 'pgtap-exec'), 'ALREADY_ADMIN',
  'Segunda execução devolve ALREADY_ADMIN');
select is(
  (select count(*) from public.audit_logs where seq > (select seq from marks where name = 'segunda')),
  0::bigint, 'Segunda execução não grava nenhuma linha de auditoria');

-- -----------------------------------------------------------------------------
-- Só o primeiro
-- -----------------------------------------------------------------------------
select throws_ok(
  $$select private.bootstrap_first_admin('pgtap-primeiro@example.com', 'pgtap-exec')$$,
  '23514', 'Já existe Administrador; use private.set_user_access.',
  'Com outro Administrador ativo, o bootstrap falha (nunca cria o segundo)');
select is((select role::text from public.profiles where id = 'f1000000-0000-4000-8000-000000000001'), null,
  'O candidato rejeitado continua sem papel');

-- -----------------------------------------------------------------------------
-- Segundo Administrador: só pelo procedimento geral, nunca pelo bootstrap
-- -----------------------------------------------------------------------------
select lives_ok(
  $$select private.set_user_access('pgtap-primeiro@example.com', 'ADMINISTRATOR', null, true, 'segundo admin de teste', 'pgtap-exec')$$,
  'set_user_access cria o segundo Administrador (o bootstrap nunca serve para isso)');

-- -----------------------------------------------------------------------------
-- set_user_access: contrato de 6.3
-- -----------------------------------------------------------------------------
-- RAT-D021: o motivo é opcional; em branco ou nulo, a mudança é feita e auditada com reason nulo.
select lives_ok(
  $$select private.set_user_access('pgtap-segundo@example.com', 'OPERATOR', null, true, E' \t\r\n ', 'pgtap-exec')$$,
  'set_user_access funciona sem motivo (RAT-D021)');
select results_eq(
  $$select kind::text, action, reason, source::text, actor_label from public.audit_logs
     where entity_id = 'f1000000-0000-4000-8000-000000000002' and action in ('UPDATE', 'ACCESS_CHANGE')
     order by seq desc limit 2$$,
  $$values ('EVENT', 'ACCESS_CHANGE', null, 'SCRIPT', 'pgtap-exec'),
           ('ROW_CHANGE', 'UPDATE', null, 'SCRIPT', 'pgtap-exec')$$,
  'Sem motivo: ROW_CHANGE + EVENT auditados com reason nulo, origem SCRIPT e rótulo');
select throws_ok(
  $$select private.set_user_access('pgtap-segundo@example.com', 'OPERATOR', null, true, 'motivo', '')$$,
  '22023', null, 'set_user_access exige identificação de quem executa');
select throws_ok(
  $$select private.set_user_access('pgtap-segundo@example.com', 'OPERATOR', null, null, 'motivo', 'pgtap-exec')$$,
  '22023', null, 'set_user_access exige o estado ativo explícito');
select throws_ok(
  $$select private.set_user_access('inexistente@example.com', 'OPERATOR', null, true, 'motivo', 'pgtap-exec')$$,
  'P0002', null, 'set_user_access com e-mail inexistente falha');

delete from marks where name = 'acesso';
insert into marks select 'acesso', coalesce(max(seq), 0) from public.audit_logs;
select lives_ok(
  $$select private.set_user_access('pgtap-segundo@example.com', 'VIEWER', null, true, 'visualizador de teste', 'pgtap-exec')$$,
  'set_user_access atribui VIEWER');
select results_eq(
  $$select kind::text, action, reason, source::text, actor_label from public.audit_logs
     where seq > (select seq from marks where name = 'acesso')
       and entity_id = 'f1000000-0000-4000-8000-000000000002' order by seq$$,
  $$values ('ROW_CHANGE', 'UPDATE', 'visualizador de teste', 'SCRIPT', 'pgtap-exec'),
           ('EVENT', 'ACCESS_CHANGE', 'visualizador de teste', 'SCRIPT', 'pgtap-exec')$$,
  'Mudança de acesso grava ROW_CHANGE + EVENT com motivo, origem SCRIPT e rótulo');
select is(
  (select new_data ->> 'new_role' from public.audit_logs
    where seq > (select seq from marks where name = 'acesso') and action = 'ACCESS_CHANGE'),
  'VIEWER', 'O EVENT ACCESS_CHANGE registra o papel novo');
select is(
  (select new_data ->> 'previous_role' from public.audit_logs
    where seq > (select seq from marks where name = 'acesso') and action = 'ACCESS_CHANGE'),
  'OPERATOR', 'O EVENT ACCESS_CHANGE registra o papel anterior (OPERATOR, atribuído sem motivo acima)');
select is(
  (select (new_data::text ~ '@')::text from public.audit_logs
    where seq > (select seq from marks where name = 'acesso') and action = 'ACCESS_CHANGE'),
  'false', 'O payload do EVENT não contém e-mail');

-- Procedimento é só do dono: authenticated e service_role não executam
set local role authenticated;
select throws_ok(
  $$select private.set_user_access('pgtap-segundo@example.com', 'ADMINISTRATOR', null, true, 'tentativa', 'x')$$,
  '42501', null, 'authenticated não executa set_user_access');
reset role;
set local role service_role;
select throws_ok(
  $$select private.bootstrap_first_admin('pgtap-segundo@example.com', 'x')$$,
  '42501', null, 'service_role não executa bootstrap_first_admin');
reset role;

select is((select count(*) from public.profiles where role = 'ADMINISTRATOR' and active), 2::bigint,
  'Ao final há dois Administradores ativos, criados pelos procedimentos');

select * from finish();
rollback;
