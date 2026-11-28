-- =============================================================================
-- pgTAP · CAD-001 · Matriz de papéis: leitura das tabelas novas
-- Papéis: ADMINISTRATOR, OPERATOR, VIEWER, PARTNER (negado por padrão, RAT-D011/D020),
-- sem papel e inativo. Mais anon e service_role.
-- Escrita direta (insert, update e delete) negada a todos: a aplicação só escreve pelas
-- funções (I-18). A coluna "função de escrita" da matriz (12.2): sócio e recebedor (migration 0300) e
-- cliente (migration 0400) no fim deste arquivo, junto com as buscas search_clients e search_aliases.
-- Rastreio: RAT-D011, RAT-D020 · I-18 · plano 6 · UI U-C16.
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(279);

-- -----------------------------------------------------------------------------
-- Fixtures (como postgres; nomes fictícios)
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('f1000000-0000-4000-8000-000000000001', 'pgtap-admin@example.com'),
  ('f1000000-0000-4000-8000-000000000002', 'pgtap-operador@example.com'),
  ('f1000000-0000-4000-8000-000000000003', 'pgtap-visualizador@example.com'),
  ('f1000000-0000-4000-8000-000000000004', 'pgtap-socio@example.com'),
  ('f1000000-0000-4000-8000-000000000005', 'pgtap-sem-papel@example.com'),
  ('f1000000-0000-4000-8000-000000000006', 'pgtap-inativo@example.com');

insert into public.partners (id, name) values
  ('f2000000-0000-4000-8000-000000000001', 'Sócio Teste A'),
  ('f2000000-0000-4000-8000-000000000002', 'Sócio Teste B');

select private.set_user_access('pgtap-admin@example.com',        'ADMINISTRATOR', null, true,  'fixture de teste', 'pgtap');
select private.set_user_access('pgtap-operador@example.com',     'OPERATOR',      null, true,  'fixture de teste', 'pgtap');
select private.set_user_access('pgtap-visualizador@example.com', 'VIEWER',        null, true,  'fixture de teste', 'pgtap');
select private.set_user_access('pgtap-socio@example.com',        'PARTNER',       'f2000000-0000-4000-8000-000000000001', true, 'fixture de teste', 'pgtap');
select private.set_user_access('pgtap-inativo@example.com',      'OPERATOR',      null, false, 'fixture de teste', 'pgtap');

-- Dados: 2 apelidos de sócio, 2 recebedores, 2 identificadores, 2 clientes (1 inativo),
-- 1 indicação e 2 apelidos de cliente (1 inativo).
insert into public.partner_aliases (id, partner_id, alias, active) values
  ('f3000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'Apelido Teste A1', true),
  ('f3000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000001', 'Apelido Teste A2', false);
insert into public.receivers (id, partner_id, holder_name) values
  ('f4000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'Titular Fictício A1'),
  ('f4000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000002', 'Titular Fictício B1');
insert into public.receiver_identifiers (id, receiver_id, identifier_type, value) values
  ('f5000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000001', 'PIX_KEY', 'socio.a@example.com'),
  ('f5000000-0000-4000-8000-000000000002', 'f4000000-0000-4000-8000-000000000002', 'NAME_VARIANT', 'S. Teste B');
insert into public.clients (id, legal_name, document, default_monthly_value, active) values
  ('f6000000-0000-4000-8000-000000000001', 'Cliente Modelo Teste Ltda', 'ZZ0TESTE000100', 1500.00, true),
  ('f6000000-0000-4000-8000-000000000002', 'Cliente Antigo Teste Ltda', null, 10.00, false);
insert into public.client_partners (id, client_id, partner_id)
values ('f8000000-0000-4000-8000-000000000001', 'f6000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001');
insert into public.client_aliases (id, client_id, alias_type, alias, active) values
  ('f7000000-0000-4000-8000-000000000001', 'f6000000-0000-4000-8000-000000000001', 'NAME', 'Modelo', true),
  ('f7000000-0000-4000-8000-000000000002', 'f6000000-0000-4000-8000-000000000001', 'NAME', 'Modelo Antigo', false);


-- -----------------------------------------------------------------------------
-- DELETE direto em partners (CA-03, QA-CAD-04d): recusado até para postgres (gatilho da FND) e para o
-- Administrador (sem privilégio de DELETE), e sem linha nova em audit_logs.
-- -----------------------------------------------------------------------------
select set_config('test.audit_tx_before',
  (select count(*) from public.audit_logs where tx_id = pg_current_xact_id())::text, true);
select throws_ok($$delete from public.partners where id = 'f2000000-0000-4000-8000-000000000001'$$,
  '42501', 'partners é imutável: operação DELETE não permitida.', 'postgres: DELETE direto em partners é recusado pelo gatilho');
select is((select count(*) from public.partners where id = 'f2000000-0000-4000-8000-000000000001'), 1::bigint, 'postgres: o sócio continua lá depois do DELETE recusado');
select is((select count(*) from public.audit_logs where tx_id = pg_current_xact_id())::text, current_setting('test.audit_tx_before'),
  'postgres: DELETE recusado em partners não grava linha em audit_logs');

-- -----------------------------------------------------------------------------
-- ADMINISTRATOR
-- -----------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$delete from public.partners where id = 'f2000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'ADMINISTRATOR: DELETE direto em partners é recusado (sem privilégio)');
select is((select count(*) from public.partners where id = 'f2000000-0000-4000-8000-000000000001'), 1::bigint, 'ADMINISTRATOR: o sócio continua lá depois do DELETE recusado');

select is((select count(*) from public.partner_aliases where id::text like 'f_000000-0000-4000-8000-%'), 2::bigint, 'ADMINISTRATOR: lê 2 linha(s) de partner_aliases');
select is((select count(*) from public.receivers where id::text like 'f_000000-0000-4000-8000-%'), 2::bigint, 'ADMINISTRATOR: lê 2 linha(s) de receivers');
select is((select count(*) from public.receiver_identifiers where id::text like 'f_000000-0000-4000-8000-%'), 2::bigint, 'ADMINISTRATOR: lê 2 linha(s) de receiver_identifiers');
select is((select count(*) from public.clients where id::text like 'f_000000-0000-4000-8000-%'), 2::bigint, 'ADMINISTRATOR: lê 2 linha(s) de clients');
select is((select count(*) from public.client_partners where id::text like 'f_000000-0000-4000-8000-%'), 1::bigint, 'ADMINISTRATOR: lê 1 linha(s) de client_partners');
select is((select count(*) from public.client_aliases where id::text like 'f_000000-0000-4000-8000-%'), 2::bigint, 'ADMINISTRATOR: lê 2 linha(s) de client_aliases');
select throws_ok(format(op.sql, t.name), '42501', null, 'ADMINISTRATOR: escrita direta negada (' || split_part(op.sql, ' ', 1) || ' em ' || t.name || ')')
  from unnest(array['partner_aliases','receivers','receiver_identifiers','clients','client_partners','client_aliases']) t(name)
 cross join (values ('insert into public.%s default values'), ('update public.%s set updated_at = now()'), ('delete from public.%s')) op(sql);

-- -----------------------------------------------------------------------------
-- OPERATOR
-- -----------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is((select count(*) from public.partner_aliases where id::text like 'f_000000-0000-4000-8000-%'), 0::bigint, 'OPERATOR: lê 0 linha(s) de partner_aliases');
select is((select count(*) from public.receivers where id::text like 'f_000000-0000-4000-8000-%'), 0::bigint, 'OPERATOR: lê 0 linha(s) de receivers');
select is((select count(*) from public.receiver_identifiers where id::text like 'f_000000-0000-4000-8000-%'), 0::bigint, 'OPERATOR: lê 0 linha(s) de receiver_identifiers');
select is((select count(*) from public.clients where id::text like 'f_000000-0000-4000-8000-%'), 2::bigint, 'OPERATOR: lê 2 linha(s) de clients');
select is((select count(*) from public.client_partners where id::text like 'f_000000-0000-4000-8000-%'), 1::bigint, 'OPERATOR: lê 1 linha(s) de client_partners');
select is((select count(*) from public.client_aliases where id::text like 'f_000000-0000-4000-8000-%'), 1::bigint, 'OPERATOR: lê 1 linha(s) de client_aliases');
select throws_ok(format(op.sql, t.name), '42501', null, 'OPERATOR: escrita direta negada (' || split_part(op.sql, ' ', 1) || ' em ' || t.name || ')')
  from unnest(array['partner_aliases','receivers','receiver_identifiers','clients','client_partners','client_aliases']) t(name)
 cross join (values ('insert into public.%s default values'), ('update public.%s set updated_at = now()'), ('delete from public.%s')) op(sql);

-- -----------------------------------------------------------------------------
-- VIEWER
-- -----------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select is((select count(*) from public.partner_aliases where id::text like 'f_000000-0000-4000-8000-%'), 0::bigint, 'VIEWER: lê 0 linha(s) de partner_aliases');
select is((select count(*) from public.receivers where id::text like 'f_000000-0000-4000-8000-%'), 0::bigint, 'VIEWER: lê 0 linha(s) de receivers');
select is((select count(*) from public.receiver_identifiers where id::text like 'f_000000-0000-4000-8000-%'), 0::bigint, 'VIEWER: lê 0 linha(s) de receiver_identifiers');
select is((select count(*) from public.clients where id::text like 'f_000000-0000-4000-8000-%'), 2::bigint, 'VIEWER: lê 2 linha(s) de clients');
select is((select count(*) from public.client_partners where id::text like 'f_000000-0000-4000-8000-%'), 1::bigint, 'VIEWER: lê 1 linha(s) de client_partners');
select is((select count(*) from public.client_aliases where id::text like 'f_000000-0000-4000-8000-%'), 1::bigint, 'VIEWER: lê 1 linha(s) de client_aliases');
select throws_ok(format(op.sql, t.name), '42501', null, 'VIEWER: escrita direta negada (' || split_part(op.sql, ' ', 1) || ' em ' || t.name || ')')
  from unnest(array['partner_aliases','receivers','receiver_identifiers','clients','client_partners','client_aliases']) t(name)
 cross join (values ('insert into public.%s default values'), ('update public.%s set updated_at = now()'), ('delete from public.%s')) op(sql);

-- -----------------------------------------------------------------------------
-- PARTNER (Sócio)
-- -----------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);

select is((select count(*) from public.partner_aliases where id::text like 'f_000000-0000-4000-8000-%'), 0::bigint, 'PARTNER (Sócio): lê 0 linha(s) de partner_aliases');
select is((select count(*) from public.receivers where id::text like 'f_000000-0000-4000-8000-%'), 0::bigint, 'PARTNER (Sócio): lê 0 linha(s) de receivers');
select is((select count(*) from public.receiver_identifiers where id::text like 'f_000000-0000-4000-8000-%'), 0::bigint, 'PARTNER (Sócio): lê 0 linha(s) de receiver_identifiers');
select is((select count(*) from public.clients where id::text like 'f_000000-0000-4000-8000-%'), 0::bigint, 'PARTNER (Sócio): lê 0 linha(s) de clients');
select is((select count(*) from public.client_partners where id::text like 'f_000000-0000-4000-8000-%'), 0::bigint, 'PARTNER (Sócio): lê 0 linha(s) de client_partners');
select is((select count(*) from public.client_aliases where id::text like 'f_000000-0000-4000-8000-%'), 0::bigint, 'PARTNER (Sócio): lê 0 linha(s) de client_aliases');
select throws_ok(format(op.sql, t.name), '42501', null, 'PARTNER (Sócio): escrita direta negada (' || split_part(op.sql, ' ', 1) || ' em ' || t.name || ')')
  from unnest(array['partner_aliases','receivers','receiver_identifiers','clients','client_partners','client_aliases']) t(name)
 cross join (values ('insert into public.%s default values'), ('update public.%s set updated_at = now()'), ('delete from public.%s')) op(sql);

-- -----------------------------------------------------------------------------
-- Sem papel
-- -----------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000005","role":"authenticated"}', true);

select is((select count(*) from public.partner_aliases where id::text like 'f_000000-0000-4000-8000-%'), 0::bigint, 'Sem papel: lê 0 linha(s) de partner_aliases');
select is((select count(*) from public.receivers where id::text like 'f_000000-0000-4000-8000-%'), 0::bigint, 'Sem papel: lê 0 linha(s) de receivers');
select is((select count(*) from public.receiver_identifiers where id::text like 'f_000000-0000-4000-8000-%'), 0::bigint, 'Sem papel: lê 0 linha(s) de receiver_identifiers');
select is((select count(*) from public.clients where id::text like 'f_000000-0000-4000-8000-%'), 0::bigint, 'Sem papel: lê 0 linha(s) de clients');
select is((select count(*) from public.client_partners where id::text like 'f_000000-0000-4000-8000-%'), 0::bigint, 'Sem papel: lê 0 linha(s) de client_partners');
select is((select count(*) from public.client_aliases where id::text like 'f_000000-0000-4000-8000-%'), 0::bigint, 'Sem papel: lê 0 linha(s) de client_aliases');
select throws_ok(format(op.sql, t.name), '42501', null, 'Sem papel: escrita direta negada (' || split_part(op.sql, ' ', 1) || ' em ' || t.name || ')')
  from unnest(array['partner_aliases','receivers','receiver_identifiers','clients','client_partners','client_aliases']) t(name)
 cross join (values ('insert into public.%s default values'), ('update public.%s set updated_at = now()'), ('delete from public.%s')) op(sql);

-- -----------------------------------------------------------------------------
-- Inativo
-- -----------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000006","role":"authenticated"}', true);

select is((select count(*) from public.partner_aliases where id::text like 'f_000000-0000-4000-8000-%'), 0::bigint, 'Inativo: lê 0 linha(s) de partner_aliases');
select is((select count(*) from public.receivers where id::text like 'f_000000-0000-4000-8000-%'), 0::bigint, 'Inativo: lê 0 linha(s) de receivers');
select is((select count(*) from public.receiver_identifiers where id::text like 'f_000000-0000-4000-8000-%'), 0::bigint, 'Inativo: lê 0 linha(s) de receiver_identifiers');
select is((select count(*) from public.clients where id::text like 'f_000000-0000-4000-8000-%'), 0::bigint, 'Inativo: lê 0 linha(s) de clients');
select is((select count(*) from public.client_partners where id::text like 'f_000000-0000-4000-8000-%'), 0::bigint, 'Inativo: lê 0 linha(s) de client_partners');
select is((select count(*) from public.client_aliases where id::text like 'f_000000-0000-4000-8000-%'), 0::bigint, 'Inativo: lê 0 linha(s) de client_aliases');
select throws_ok(format(op.sql, t.name), '42501', null, 'Inativo: escrita direta negada (' || split_part(op.sql, ' ', 1) || ' em ' || t.name || ')')
  from unnest(array['partner_aliases','receivers','receiver_identifiers','clients','client_partners','client_aliases']) t(name)
 cross join (values ('insert into public.%s default values'), ('update public.%s set updated_at = now()'), ('delete from public.%s')) op(sql);

-- -----------------------------------------------------------------------------
-- anon: nenhum acesso
-- -----------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok(format('select count(*) from public.%s', t.name), '42501', null, 'anon não lê ' || t.name)
  from unnest(array['partner_aliases','receivers','receiver_identifiers','clients','client_partners','client_aliases']) t(name);
select throws_ok(format(op.sql, t.name), '42501', null, 'anon: escrita direta negada (' || split_part(op.sql, ' ', 1) || ' em ' || t.name || ')')
  from unnest(array['partner_aliases','receivers','receiver_identifiers','clients','client_partners','client_aliases']) t(name)
 cross join (values ('insert into public.%s default values'), ('update public.%s set updated_at = now()'), ('delete from public.%s')) op(sql);


-- =============================================================================
-- FUNÇÕES DE GRAVAÇÃO (migrations 0300 e 0400): save_partner, set_partner_active, save_receiver,
-- set_receiver_active, save_client, set_client_active. Só o Administrador ativo executa (42501 ADMIN_REQUIRED, sem detail);
-- anon não tem EXECUTE. A coluna "função de escrita" da matriz (12.2).
-- =============================================================================
-- "sqlstate|hint" do erro de um comando (ou 'ok') e detail (JSON) do erro.
create function pg_temp.err_of(p_sql text) returns text
language plpgsql as $$
declare v_state text; v_hint text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint;
  return v_state || '|' || coalesce(v_hint, '');
end;
$$;
create function pg_temp.detail_of(p_sql text) returns jsonb
language plpgsql as $$
declare v_detail text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return nullif(v_detail, '')::jsonb;
end;
$$;

-- Seis chamadas, uma por função de escrita; ids dos fixtures acima (nenhuma chega a escrever).
create temp table zz_calls (name text, sql text) on commit drop;
insert into zz_calls values
  ('save_partner',        $$select public.save_partner(null, 'Sócio Negado', array['Apelido Negado'], null)$$),
  ('set_partner_active',  $$select public.set_partner_active('f2000000-0000-4000-8000-000000000002', false, now(), array['f4000000-0000-4000-8000-000000000002']::uuid[])$$),
  ('save_receiver',       $$select public.save_receiver(null, 'f2000000-0000-4000-8000-000000000001', 'Titular Negado', '[{"type":"PIX_KEY","value":"negado@example.com"}]'::jsonb, null)$$),
  ('set_receiver_active', $$select public.set_receiver_active('f4000000-0000-4000-8000-000000000001', false, now())$$),
  ('save_client',         $$select public.save_client(null, 'Cliente Negado', null, null, '10', null, array['f2000000-0000-4000-8000-000000000001']::uuid[], '[]'::jsonb, null)$$),
  ('set_client_active',   $$select public.set_client_active('f6000000-0000-4000-8000-000000000001', false, now())$$);
grant select on zz_calls to authenticated, anon;

-- OPERATOR, VIEWER, PARTNER, sem papel e inativo: negado, sem detail com dados
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(pg_temp.err_of(c.sql), '42501|ADMIN_REQUIRED', 'OPERATOR: ' || c.name || ' negada (ADMIN_REQUIRED)') from zz_calls c order by c.name;
select is(pg_temp.detail_of(c.sql), null, 'OPERATOR: ' || c.name || ' negada sem detail') from zz_calls c order by c.name;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is(pg_temp.err_of(c.sql), '42501|ADMIN_REQUIRED', 'VIEWER: ' || c.name || ' negada (ADMIN_REQUIRED)') from zz_calls c order by c.name;
select is(pg_temp.detail_of(c.sql), null, 'VIEWER: ' || c.name || ' negada sem detail') from zz_calls c order by c.name;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is(pg_temp.err_of(c.sql), '42501|ADMIN_REQUIRED', 'PARTNER (Sócio): ' || c.name || ' negada (ADMIN_REQUIRED)') from zz_calls c order by c.name;
select is(pg_temp.detail_of(c.sql), null, 'PARTNER (Sócio): ' || c.name || ' negada sem detail') from zz_calls c order by c.name;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select is(pg_temp.err_of(c.sql), '42501|ADMIN_REQUIRED', 'Sem papel: ' || c.name || ' negada (ADMIN_REQUIRED)') from zz_calls c order by c.name;
select is(pg_temp.detail_of(c.sql), null, 'Sem papel: ' || c.name || ' negada sem detail') from zz_calls c order by c.name;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
select is(pg_temp.err_of(c.sql), '42501|ADMIN_REQUIRED', 'Inativo: ' || c.name || ' negada (ADMIN_REQUIRED)') from zz_calls c order by c.name;
select is(pg_temp.detail_of(c.sql), null, 'Inativo: ' || c.name || ' negada sem detail') from zz_calls c order by c.name;

-- anon: sem EXECUTE nos invólucros
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
select is(pg_temp.err_of(c.sql), '42501|', 'anon: ' || c.name || ' negada (sem EXECUTE)') from zz_calls c order by c.name;

-- Nada foi escrito pelos papéis negados
reset role;
select is((select count(*) from public.partners where name = 'Sócio Negado'), 0::bigint, 'Papéis negados: nenhum sócio criado');
select is((select count(*) from public.receivers where holder_name = 'Titular Negado'), 0::bigint, 'Papéis negados: nenhum recebedor criado');
select is((select active from public.partners where id = 'f2000000-0000-4000-8000-000000000002'), true, 'Papéis negados: o sócio B continua ativo');
select is((select active from public.receivers where id = 'f4000000-0000-4000-8000-000000000001'), true, 'Papéis negados: o recebedor A1 continua ativo');
select is((select count(*) from public.clients where legal_name = 'Cliente Negado'), 0::bigint, 'Papéis negados: nenhum cliente criado');
select is((select active from public.clients where id = 'f6000000-0000-4000-8000-000000000001'), true, 'Papéis negados: o cliente continua ativo');

-- ADMINISTRATOR: executa as seis (agora, depois das contagens dos blocos acima)
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(pg_temp.err_of($$select public.save_partner(null, 'Sócio Matriz Novo', array['Matriz Novo'], null)$$), 'ok', 'ADMINISTRATOR: save_partner permitida');
select is(pg_temp.err_of($$select public.set_partner_active('f2000000-0000-4000-8000-000000000002', false,
    (select updated_at from public.partners where id = 'f2000000-0000-4000-8000-000000000002'),
    array['f4000000-0000-4000-8000-000000000002']::uuid[])$$), 'ok', 'ADMINISTRATOR: set_partner_active permitida');
select is(pg_temp.err_of($$select public.save_receiver(null, 'f2000000-0000-4000-8000-000000000001', 'Titular Matriz Novo',
    '[{"type":"PIX_KEY","value":"matriz.novo@example.com"}]'::jsonb, null)$$), 'ok', 'ADMINISTRATOR: save_receiver permitida');
select is(pg_temp.err_of($$select public.set_receiver_active('f4000000-0000-4000-8000-000000000001',  false,
    (select updated_at from public.receivers where id = 'f4000000-0000-4000-8000-000000000001'))$$), 'ok', 'ADMINISTRATOR: set_receiver_active permitida');
select is(pg_temp.err_of($$select public.save_client(null, 'Cliente Matriz Novo', null, null, '10', null,
    array['f2000000-0000-4000-8000-000000000001']::uuid[], '[]'::jsonb, null)$$), 'ok', 'ADMINISTRATOR: save_client permitida');
select is(pg_temp.err_of($$select public.set_client_active('f6000000-0000-4000-8000-000000000001', false,
    (select updated_at from public.clients where id = 'f6000000-0000-4000-8000-000000000001'))$$), 'ok', 'ADMINISTRATOR: set_client_active permitida');

-- Buscas (6.4.7): Administrador, Operador e Visualizador leem clientes; só o Administrador lê a lista consolidada.
-- "teste" casa os dois clientes fixture e, com p_status ALL, 3 itens consolidados (2 apelidos de sócio e 1 variação).
select is((select count(*) from public.search_clients('teste', 'ALL')), 2::bigint, 'ADMINISTRATOR: search_clients devolve 2 clientes');
select is((select count(*) from public.search_aliases('teste', null, 'ALL')), 3::bigint, 'ADMINISTRATOR: search_aliases devolve 3 itens (apelidos de sócio e variação)');
select is((select count(*) from public.search_clients('teste', 'ALL', 25, 0, 'f2000000-0000-4000-8000-000000000001')), 1::bigint, 'ADMINISTRATOR: search_clients com filtro de sócio traz o cliente (inativo, indicação ativa)');
select is((select count(*) from public.search_aliases('modelo', 'CLIENT_ALIAS', 'ALL')), 2::bigint, 'ADMINISTRATOR: search_aliases enxerga também o apelido inativo de cliente');

-- Buscas pelos demais papéis: clientes só para Operador e Visualizador; consolidada, nenhuma linha
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.search_clients('teste', 'ALL')), 2::bigint, 'OPERATOR: search_clients devolve 2 cliente(s)');
select is((select count(*) from public.search_aliases('teste', null, 'ALL')), 0::bigint, 'OPERATOR: search_aliases devolve 0 itens');
select is((select count(*) from public.search_clients('teste', 'ALL', 25, 0, 'f2000000-0000-4000-8000-000000000001')), 1::bigint, 'OPERATOR: search_clients aceita o filtro de sócio');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*) from public.search_clients('teste', 'ALL')), 2::bigint, 'VIEWER: search_clients devolve 2 cliente(s)');
select is((select count(*) from public.search_aliases('teste', null, 'ALL')), 0::bigint, 'VIEWER: search_aliases devolve 0 itens');
select is((select count(*) from public.search_clients('teste', 'ALL', 25, 0, 'f2000000-0000-4000-8000-000000000001')), 1::bigint, 'VIEWER: search_clients aceita o filtro de sócio');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is((select count(*) from public.search_clients('teste', 'ALL')), 0::bigint, 'PARTNER (Sócio): search_clients devolve 0 cliente(s)');
select is((select count(*) from public.search_aliases('teste', null, 'ALL')), 0::bigint, 'PARTNER (Sócio): search_aliases devolve 0 itens');
select is((select count(*) from public.search_clients('teste', 'ALL', 25, 0, 'f2000000-0000-4000-8000-000000000001')), 0::bigint, 'PARTNER (Sócio): o filtro de sócio não abre a leitura de clientes');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select is((select count(*) from public.search_clients('teste', 'ALL')), 0::bigint, 'Sem papel: search_clients devolve 0 cliente(s)');
select is((select count(*) from public.search_aliases('teste', null, 'ALL')), 0::bigint, 'Sem papel: search_aliases devolve 0 itens');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
select is((select count(*) from public.search_clients('teste', 'ALL')), 0::bigint, 'Inativo: search_clients devolve 0 cliente(s)');
select is((select count(*) from public.search_aliases('teste', null, 'ALL')), 0::bigint, 'Inativo: search_aliases devolve 0 itens');
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
select is(pg_temp.err_of($$select * from public.search_clients('teste', 'ALL')$$), '42501|', 'anon: search_clients negada (sem EXECUTE)');
select is(pg_temp.err_of($$select * from public.search_aliases('teste', null, 'ALL')$$), '42501|', 'anon: search_aliases negada (sem EXECUTE)');

-- Catálogo: concessões das funções novas
reset role;
select is(
  (select count(*) from unnest(array[
      'public.save_partner(uuid,text,text[],timestamptz,text,uuid)',
      'public.set_partner_active(uuid,boolean,timestamptz,uuid[],text,uuid)',
      'public.save_receiver(uuid,uuid,text,jsonb,timestamptz,text,uuid)',
      'public.set_receiver_active(uuid,boolean,timestamptz,text,uuid)',
      'private.save_partner(uuid,text,text[],timestamptz,text,uuid)',
      'private.set_partner_active(uuid,boolean,timestamptz,uuid[],text,uuid)',
      'private.save_receiver(uuid,uuid,text,jsonb,timestamptz,text,uuid)',
      'private.set_receiver_active(uuid,boolean,timestamptz,text,uuid)',
      'public.save_client(uuid,text,text,text,text,text,uuid[],jsonb,timestamptz,uuid[],text,uuid)',
      'public.set_client_active(uuid,boolean,timestamptz,text,uuid)',
      'public.search_clients(text,text,integer,integer,uuid)',
      'public.search_aliases(text,text,text,integer,integer)',
      'private.save_client(uuid,text,text,text,text,text,uuid[],jsonb,timestamptz,uuid[],text,uuid)',
      'private.set_client_active(uuid,boolean,timestamptz,text,uuid)']) f(sig)
    where has_function_privilege('authenticated', f.sig::regprocedure, 'execute')),
  14::bigint, 'authenticated executa os 8 invólucros públicos e as 6 implementações privadas');
select is(
  (select count(*) from unnest(array[
      'public.save_partner(uuid,text,text[],timestamptz,text,uuid)',
      'public.set_partner_active(uuid,boolean,timestamptz,uuid[],text,uuid)',
      'public.save_receiver(uuid,uuid,text,jsonb,timestamptz,text,uuid)',
      'public.set_receiver_active(uuid,boolean,timestamptz,text,uuid)',
      'private.save_partner(uuid,text,text[],timestamptz,text,uuid)',
      'private.set_partner_active(uuid,boolean,timestamptz,uuid[],text,uuid)',
      'private.save_receiver(uuid,uuid,text,jsonb,timestamptz,text,uuid)',
      'private.set_receiver_active(uuid,boolean,timestamptz,text,uuid)',
      'public.save_client(uuid,text,text,text,text,text,uuid[],jsonb,timestamptz,uuid[],text,uuid)',
      'public.set_client_active(uuid,boolean,timestamptz,text,uuid)',
      'public.search_clients(text,text,integer,integer,uuid)',
      'public.search_aliases(text,text,text,integer,integer)',
      'private.save_client(uuid,text,text,text,text,text,uuid[],jsonb,timestamptz,uuid[],text,uuid)',
      'private.set_client_active(uuid,boolean,timestamptz,text,uuid)']) f(sig)
    where has_function_privilege('anon', f.sig::regprocedure, 'execute')),
  0::bigint, 'anon não executa nenhuma das catorze');
select is(
  (select count(*) from pg_proc p
    where p.oid in ('public.save_partner(uuid,text,text[],timestamptz,text,uuid)'::regprocedure,
                    'public.set_partner_active(uuid,boolean,timestamptz,uuid[],text,uuid)'::regprocedure,
                    'public.save_receiver(uuid,uuid,text,jsonb,timestamptz,text,uuid)'::regprocedure,
                    'public.set_receiver_active(uuid,boolean,timestamptz,text,uuid)'::regprocedure,
                    'private.save_partner(uuid,text,text[],timestamptz,text,uuid)'::regprocedure,
                    'private.set_partner_active(uuid,boolean,timestamptz,uuid[],text,uuid)'::regprocedure,
                    'private.save_receiver(uuid,uuid,text,jsonb,timestamptz,text,uuid)'::regprocedure,
                    'private.set_receiver_active(uuid,boolean,timestamptz,text,uuid)'::regprocedure,
                    'public.save_client(uuid,text,text,text,text,text,uuid[],jsonb,timestamptz,uuid[],text,uuid)'::regprocedure,
                    'public.set_client_active(uuid,boolean,timestamptz,text,uuid)'::regprocedure,
                    'public.search_clients(text,text,integer,integer,uuid)'::regprocedure,
                    'public.search_aliases(text,text,text,integer,integer)'::regprocedure,
                    'private.save_client(uuid,text,text,text,text,text,uuid[],jsonb,timestamptz,uuid[],text,uuid)'::regprocedure,
                    'private.set_client_active(uuid,boolean,timestamptz,text,uuid)'::regprocedure)
      and exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0)),
  0::bigint, 'Nenhuma das catorze tem EXECUTE para PUBLIC');
select is(
  (select string_agg(n.nspname || ':' || p.prosecdef::text, ',' order by n.nspname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.proname in ('save_partner', 'set_partner_active', 'save_receiver', 'set_receiver_active',
                        'save_client', 'set_client_active', 'search_clients', 'search_aliases')),
  'private:true,private:true,private:true,private:true,private:true,private:true,public:false,public:false,public:false,public:false,public:false,public:false,public:false,public:false',
  'As implementações em private são SECURITY DEFINER; os invólucros e as buscas em public são SECURITY INVOKER');
select is(
  (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('search_clients', 'search_aliases') and p.provolatile = 's'),
  2::bigint, 'As duas buscas são STABLE (leitura)');

-- -----------------------------------------------------------------------------
-- Privilégios e políticas (catálogo)
-- -----------------------------------------------------------------------------
reset role;
select is(
  (select count(*) from unnest(array['partner_aliases','receivers','receiver_identifiers','clients','client_partners','client_aliases']) t(name)
    where has_table_privilege('service_role', 'public.' || t.name, 'select,insert,update,delete')
      and not has_table_privilege('service_role', 'public.' || t.name, 'truncate')),
  6::bigint, 'service_role lê e escreve (pelos mesmos triggers) as seis tabelas, sem TRUNCATE');
select is(
  (select count(*) from unnest(array['partner_aliases','receivers','receiver_identifiers','clients','client_partners','client_aliases']) t(name)
    where has_table_privilege('authenticated', 'public.' || t.name, 'select')
      and not has_table_privilege('authenticated', 'public.' || t.name, 'insert,update,delete,truncate,references,trigger')),
  6::bigint, 'authenticated só tem SELECT nas seis tabelas (I-18)');
select is(
  (select count(*) from pg_policies where schemaname = 'public'
     and tablename = any (array['partner_aliases','receivers','receiver_identifiers','clients','client_partners','client_aliases'])
     and (cmd <> 'SELECT' or 'anon' = any (roles))),
  0::bigint, 'As seis tabelas só têm políticas de leitura e nenhuma vale para anon');
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = any (array['partner_aliases','receivers','receiver_identifiers','clients','client_partners','client_aliases'])),
  6::bigint, 'Há exatamente uma política de leitura por tabela nova');


select * from finish();
rollback;
