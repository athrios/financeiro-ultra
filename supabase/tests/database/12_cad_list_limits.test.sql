-- =============================================================================
-- pgTAP · CAD-001 · Limites de itens ativos por lista (RAT-D026; modelagem 6.6 e 12.2, revisão 4)
-- Sócio: 2 apelidos. Cliente: 2 apelidos NAME e 2 DOCUMENT. Recebedor: 30 formas do nome,
-- 10 chaves Pix e 10 contas. Contam só os ativos; repetidos (mesma chave normalizada) contam uma vez.
-- Erro: 22023 com hint LIST_LIMIT_EXCEEDED e detail {field, list, [alias_type|identifier_type], max}.
-- A conferência fica dentro do laço de validação de cada save_*, antes de trava, versão e escrita.
-- Cada caso usa prefixos próprios (IDENTIFIER_TAKEN, PARTNER_NAME_TAKEN, ALIAS_TAKEN, DOCUMENT_TAKEN).
-- Só dados fictícios (RAT-D019): documentos dos vetores da 12.3, e-mails @example.com.
-- Rastreio: RAT-D026 · QA-CAD-07.
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(86);

-- "sqlstate|hint" do erro de um comando (ou 'ok').
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

-- detail (JSON) do erro de um comando, ou NULL.
create function pg_temp.detail_of(p_sql text) returns jsonb
language plpgsql as $$
declare v_detail text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return v_detail::jsonb;
end;
$$;

-- -----------------------------------------------------------------------------
-- Números (como postgres): private.cad_list_limit e private.assert_list_limit
-- -----------------------------------------------------------------------------
select is(private.cad_list_limit('PARTNER_ALIAS'), 2, 'Teto de PARTNER_ALIAS = 2');
select is(private.cad_list_limit('CLIENT_ALIAS_NAME'), 2, 'Teto de CLIENT_ALIAS_NAME = 2');
select is(private.cad_list_limit('CLIENT_ALIAS_DOCUMENT'), 2, 'Teto de CLIENT_ALIAS_DOCUMENT = 2');
select is(private.cad_list_limit('NAME_VARIANT'), 30, 'Teto de NAME_VARIANT = 30');
select is(private.cad_list_limit('PIX_KEY'), 10, 'Teto de PIX_KEY = 10');
select is(private.cad_list_limit('BANK_ACCOUNT'), 10, 'Teto de BANK_ACCOUNT = 10');
select is(pg_temp.err_of($$select private.cad_list_limit('OUTRA')$$), 'XX000|', 'Chave desconhecida -> XX000');
select is(pg_temp.err_of($$select private.cad_list_limit(null)$$), 'XX000|', 'Chave nula -> XX000');
select is((select provolatile::text from pg_proc where oid = 'private.cad_list_limit(text)'::regprocedure), 'i',
  'cad_list_limit é IMMUTABLE');
select is((select count(*) from pg_proc
            where oid in ('private.cad_list_limit(text)'::regprocedure, 'private.assert_list_limit(text, integer)'::regprocedure)
              and prosecdef), 0::bigint, 'Nenhuma das duas funções é SECURITY DEFINER');
select is(has_function_privilege('authenticated', 'private.cad_list_limit(text)', 'EXECUTE'), false,
  'authenticated não executa cad_list_limit');
select is(has_function_privilege('authenticated', 'private.assert_list_limit(text, integer)', 'EXECUTE'), false,
  'authenticated não executa assert_list_limit');
select is(pg_temp.err_of($$select private.assert_list_limit('PIX_KEY', 10)$$), 'ok', 'assert_list_limit: no teto, passa');
select is(pg_temp.err_of($$select private.assert_list_limit('PIX_KEY', 11)$$), '22023|LIST_LIMIT_EXCEEDED',
  'assert_list_limit: acima do teto -> 22023|LIST_LIMIT_EXCEEDED');

-- -----------------------------------------------------------------------------
-- Fixtures (como postgres) e Administrador de teste
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values ('d1000000-0000-4000-8000-000000000001', 'pgtap-admin-lim@example.com');
select private.set_user_access('pgtap-admin-lim@example.com', 'ADMINISTRATOR', null, true, 'fixture de teste', 'pgtap');

create function pg_temp.pid(p text) returns uuid language sql as $$ select id from public.partners where name = p $$;
create function pg_temp.pv(p text) returns timestamptz language sql as $$ select updated_at from public.partners where name = p $$;
create function pg_temp.cid(p text) returns uuid language sql as $$ select id from public.clients where legal_name = p $$;
create function pg_temp.cv(p text) returns timestamptz language sql as $$ select updated_at from public.clients where legal_name = p $$;
create function pg_temp.rid(p text) returns uuid language sql as $$ select id from public.receivers where holder_name = p $$;
create function pg_temp.rv(p text) returns timestamptz language sql as $$ select updated_at from public.receivers where holder_name = p $$;

-- Atalho para public.save_client com o sócio ativo padrão (só para encurtar as chamadas).
create function pg_temp.scl(
  p_name text, p_aliases jsonb, p_doc text default null, p_id uuid default null,
  p_ver timestamptz default null, p_partners uuid[] default null
) returns setof public.clients language sql as $$
  select * from public.save_client(p_id, p_name, null, p_doc, '100', null,
    coalesce(p_partners, array[pg_temp.pid('Sócio Lim CA')]), p_aliases, p_ver)
$$;

-- Geradores de listas de identificadores (g de p_from a p_to).
create function pg_temp.name_list(p_prefix text, p_from int, p_to int) returns jsonb language sql as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('type', 'NAME_VARIANT', 'value', p_prefix || g) order by g), '[]'::jsonb)
    from generate_series(p_from, p_to) g
$$;
create function pg_temp.pix_list(p_prefix text, p_from int, p_to int) returns jsonb language sql as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('type', 'PIX_KEY', 'value', p_prefix || g || '@example.com') order by g), '[]'::jsonb)
    from generate_series(p_from, p_to) g
$$;
create function pg_temp.acct_list(p_base int, p_from int, p_to int) returns jsonb language sql as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('type', 'BANK_ACCOUNT', 'bank_name', 'Banco Limite',
           'branch', '0001', 'account_number', (p_base + g)::text || '-1') order by g), '[]'::jsonb)
    from generate_series(p_from, p_to) g
$$;

insert into public.partners (id, name, active) values
  ('d2000000-0000-4000-8000-000000000001', 'Sócio Lim CA', true),
  ('d2000000-0000-4000-8000-000000000002', 'Sócio Lim CZ', false),
  ('d2000000-0000-4000-8000-000000000003', 'Sócio Lim R',  true);
insert into public.clients (id, legal_name, default_monthly_value, active) values
  ('d6000000-0000-4000-8000-000000000001', 'Cliente Lim Homônimo', 100, true);
insert into public.client_partners (client_id, partner_id) values
  ('d6000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001');
select private.set_audit_context(null, null, null, null);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- -----------------------------------------------------------------------------
-- Sócio (save_partner): 2 apelidos ativos
-- -----------------------------------------------------------------------------
select is(pg_temp.err_of($$select public.save_partner(null, 'Sócio Lim P1', array['Um Lim A', 'Dois Lim A'], null)$$), 'ok',
  'Sócio: 2 apelidos gravam');
select is((select count(*) from public.partner_aliases where partner_id = pg_temp.pid('Sócio Lim P1') and active), 2::bigint,
  'Sócio: 2 apelidos ativos');

select is(pg_temp.err_of($$select public.save_partner(null, 'Sócio Lim P2', array['X1 Lim', 'X2 Lim', 'X3 Lim'], null)$$),
  '22023|LIST_LIMIT_EXCEEDED', 'Sócio novo com 3 apelidos distintos -> LIST_LIMIT_EXCEEDED');
select is(pg_temp.detail_of($$select public.save_partner(null, 'Sócio Lim P2', array['X1 Lim', 'X2 Lim', 'X3 Lim'], null)$$),
  '{"field":"aliases","list":"PARTNER_ALIAS","max":2}'::jsonb, 'Sócio: detail do teto');
select is((select count(*) from public.partners where name = 'Sócio Lim P2'), 0::bigint, 'Sócio recusado não ficou criado');

select is(pg_temp.err_of($$select public.save_partner(null, 'Sócio Lim P3', array['S. Lim', 's lim.', 'Outro Lim', 'OUTRO LIM!'], null)$$), 'ok',
  'Sócio: repetidos pela chave normalizada contam uma vez (4 itens, 2 distintos)');
select is((select count(*) from public.partner_aliases where partner_id = pg_temp.pid('Sócio Lim P3') and active), 2::bigint,
  'Sócio: os repetidos viraram 2 apelidos ativos');

-- Inativos não contam; reativar com a lista cheia exige inativar outro antes.
select is(pg_temp.err_of($$select public.save_partner(null, 'Sócio Lim P4', array['Lim Um', 'Lim Dois'], null)$$), 'ok', 'Inativos: cria com Um e Dois');
select is(pg_temp.err_of($$select public.save_partner(pg_temp.pid('Sócio Lim P4'), 'Sócio Lim P4', array['Lim Um'], pg_temp.pv('Sócio Lim P4'))$$), 'ok',
  'Inativos: tira Dois (fica inativo)');
select is(pg_temp.err_of($$select public.save_partner(pg_temp.pid('Sócio Lim P4'), 'Sócio Lim P4', array['Lim Um', 'Lim Tres'], pg_temp.pv('Sócio Lim P4'))$$), 'ok',
  'Inativos: Um + Tres grava (o inativo não conta)');
select results_eq(
  $$select count(*) filter (where active), count(*) from public.partner_aliases where partner_id = pg_temp.pid('Sócio Lim P4')$$,
  $$values (2::bigint, 3::bigint)$$, 'Inativos: 2 ativos e 3 linhas');
select is(pg_temp.err_of($$select public.save_partner(pg_temp.pid('Sócio Lim P4'), 'Sócio Lim P4', array['Lim Um', 'Lim Dois', 'Lim Tres'], pg_temp.pv('Sócio Lim P4'))$$),
  '22023|LIST_LIMIT_EXCEEDED', 'Inativos: reativar Dois com a lista cheia (3) é recusado');
select results_eq(
  $$select count(*) filter (where active), count(*) from public.partner_aliases where partner_id = pg_temp.pid('Sócio Lim P4')$$,
  $$values (2::bigint, 3::bigint)$$, 'Inativos: a recusa não mudou nada');
select is(pg_temp.err_of($$select public.save_partner(pg_temp.pid('Sócio Lim P4'), 'Sócio Lim P4', array['Lim Dois', 'Lim Tres'], pg_temp.pv('Sócio Lim P4'))$$), 'ok',
  'Inativos: Dois + Tres (tirando Um) grava');
select results_eq(
  $$select count(*) filter (where active), count(*), bool_or(active) filter (where normalized_value = 'lim dois') from public.partner_aliases where partner_id = pg_temp.pid('Sócio Lim P4')$$,
  $$values (2::bigint, 3::bigint, true)$$, 'Inativos: Dois reativou a mesma linha (2 ativos, 3 linhas)');

-- A conferência vem antes da versão: versão antiga + 3 distintos -> teto, não STALE_VERSION.
select is(pg_temp.err_of($$select public.save_partner(pg_temp.pid('Sócio Lim P1'), 'Sócio Lim P1', array['Um Lim A', 'Dois Lim A'], '2020-01-01 00:00:00+00')$$),
  'P0001|STALE_VERSION', 'Versão antiga com a lista dentro do teto -> STALE_VERSION (controle)');
select is(pg_temp.err_of($$select public.save_partner(pg_temp.pid('Sócio Lim P1'), 'Sócio Lim P1', array['Um Lim A', 'Dois Lim A', 'Tres Lim A'], '2020-01-01 00:00:00+00')$$),
  '22023|LIST_LIMIT_EXCEEDED', 'Versão antiga com 3 distintos -> LIST_LIMIT_EXCEEDED (não STALE_VERSION)');
select is((select count(*) from public.partner_aliases where partner_id = pg_temp.pid('Sócio Lim P1') and active), 2::bigint,
  'A recusa pelo teto não mudou os apelidos do sócio');
select is((select count(*) from public.partner_aliases where partner_id = pg_temp.pid('Sócio Lim P1')), 2::bigint,
  'A recusa pelo teto não criou linha de apelido');

-- Ordem dentro do laço: o primeiro problema na ordem da lista vence.
select is(pg_temp.err_of($$select public.save_partner(null, 'Sócio Lim P6', array['A Lim', 'B Lim', 'C Lim', ''], null)$$),
  '22023|LIST_LIMIT_EXCEEDED', 'Laço: o 3.º distinto vem antes do item vazio -> LIST_LIMIT_EXCEEDED');
select is(pg_temp.err_of($$select public.save_partner(null, 'Sócio Lim P6', array['A Lim', '', 'B Lim', 'C Lim'], null)$$),
  '22023|NAME_REQUIRED', 'Laço: o item vazio vem antes do 3.º distinto -> NAME_REQUIRED');

-- -----------------------------------------------------------------------------
-- Cliente (save_client): 2 apelidos NAME e 2 DOCUMENT, cada tipo com o seu teto
-- -----------------------------------------------------------------------------
select is(pg_temp.err_of($$select * from pg_temp.scl('Cliente Lim CD',
    '[{"type":"NAME","value":"Nome Lim D1"},{"type":"NAME","value":"Nome Lim D2"},{"type":"DOCUMENT","value":"000.000.001-91"},{"type":"DOCUMENT","value":"ZZ0TESTE000100"}]'::jsonb)$$),
  'ok', 'Cliente: 2 NAME e 2 DOCUMENT (CPF e CNPJ) gravam juntos');
select results_eq(
  $$select alias_type::text, count(*) from public.client_aliases where client_id = pg_temp.cid('Cliente Lim CD') and active group by alias_type order by 1$$,
  $$values ('DOCUMENT'::text, 2::bigint), ('NAME', 2::bigint)$$, 'Cliente: 4 apelidos ativos, 2 de cada tipo');

select is(pg_temp.err_of($$select * from pg_temp.scl('Cliente Lim C2',
    '[{"type":"NAME","value":"Nome Lim B1"},{"type":"NAME","value":"Nome Lim B2"},{"type":"DOCUMENT","value":"000.000.001-91"},{"type":"DOCUMENT","value":"00000000272"},{"type":"NAME","value":"Nome Lim B3"}]'::jsonb)$$),
  '22023|LIST_LIMIT_EXCEEDED', 'Cliente: o 3.º NAME é recusado mesmo com 2 documentos na lista');
select is(pg_temp.detail_of($$select * from pg_temp.scl('Cliente Lim C2',
    '[{"type":"NAME","value":"Nome Lim B1"},{"type":"NAME","value":"Nome Lim B2"},{"type":"DOCUMENT","value":"000.000.001-91"},{"type":"DOCUMENT","value":"00000000272"},{"type":"NAME","value":"Nome Lim B3"}]'::jsonb)$$),
  '{"field":"aliases","list":"CLIENT_ALIAS_NAME","alias_type":"NAME","max":2}'::jsonb, 'Cliente: detail do teto de NAME');

select is(pg_temp.err_of($$select * from pg_temp.scl('Cliente Lim C3',
    '[{"type":"DOCUMENT","value":"000.000.001-91"},{"type":"DOCUMENT","value":"00000000272"},{"type":"DOCUMENT","value":"10000000957"}]'::jsonb)$$),
  '22023|LIST_LIMIT_EXCEEDED', 'Cliente: o 3.º DOCUMENT é recusado');
select is(pg_temp.detail_of($$select * from pg_temp.scl('Cliente Lim C3',
    '[{"type":"DOCUMENT","value":"000.000.001-91"},{"type":"DOCUMENT","value":"00000000272"},{"type":"DOCUMENT","value":"10000000957"}]'::jsonb)$$),
  '{"field":"aliases","list":"CLIENT_ALIAS_DOCUMENT","alias_type":"DOCUMENT","max":2}'::jsonb, 'Cliente: detail do teto de DOCUMENT');

select is(pg_temp.err_of($$select * from pg_temp.scl('Cliente Lim C4',
    '[{"type":"DOCUMENT","value":"000.000.001-91"},{"type":"DOCUMENT","value":"ZZ0TESTE000100"},{"type":"DOCUMENT","value":"ZZ0TESTE000282"}]'::jsonb)$$),
  '22023|LIST_LIMIT_EXCEEDED', '1 CPF + 2 CNPJ somam no mesmo teto de DOCUMENT -> recusado');
select is(pg_temp.detail_of($$select * from pg_temp.scl('Cliente Lim C4',
    '[{"type":"DOCUMENT","value":"000.000.001-91"},{"type":"DOCUMENT","value":"ZZ0TESTE000100"},{"type":"DOCUMENT","value":"ZZ0TESTE000282"}]'::jsonb)$$) ->> 'list',
  'CLIENT_ALIAS_DOCUMENT', '... com a chave CLIENT_ALIAS_DOCUMENT');
select is((select count(*) from public.clients where legal_name in ('Cliente Lim C2', 'Cliente Lim C3', 'Cliente Lim C4')), 0::bigint,
  'Cliente: nenhum cliente criado pelas chamadas recusadas');

-- Repetidos contam uma vez (edita o cliente CD: mantém 191, tira ZZ0TESTE000100, entra 272).
select is(pg_temp.err_of($$select * from pg_temp.scl('Cliente Lim CD',
    '[{"type":"NAME","value":"Nome Lim D1"},{"type":"DOCUMENT","value":"000.000.001-91"},{"type":"DOCUMENT","value":"00000000191"},{"type":"DOCUMENT","value":"00000000272"}]'::jsonb,
    null, pg_temp.cid('Cliente Lim CD'), pg_temp.cv('Cliente Lim CD'))$$),
  'ok', 'Cliente: 000.000.001-91 e 00000000191 contam 1 (com 00000000272, 2 documentos)');
select is((select count(*) from public.client_aliases where client_id = pg_temp.cid('Cliente Lim CD') and active and alias_type = 'DOCUMENT'), 2::bigint,
  'Cliente: 2 documentos ativos depois da edição');
select is(pg_temp.err_of($$select * from pg_temp.scl('Cliente Lim CF',
    '[{"type":"NAME","value":"Apelido Lim"},{"type":"NAME","value":"apelido lim."},{"type":"NAME","value":"Apelido Lim Dois"}]'::jsonb)$$),
  'ok', 'Cliente: "Apelido Lim" e "apelido lim." contam 1 (2 distintos)');
select is((select count(*) from public.client_aliases where client_id = pg_temp.cid('Cliente Lim CF') and active), 2::bigint,
  'Cliente: 2 apelidos NAME ativos');

-- O documento do próprio cliente não conta.
select is(pg_temp.err_of($$select * from pg_temp.scl('Cliente Lim CE',
    '[{"type":"DOCUMENT","value":"12.ABC.345/01DE-35"},{"type":"DOCUMENT","value":"99.999.999/0001-91"}]'::jsonb, '10000000957')$$),
  'ok', 'Cliente: p_document mais 2 apelidos DOCUMENT gravam');
select results_eq(
  $$select document, (select count(*) from public.client_aliases a where a.client_id = c.id and a.active) from public.clients c where c.legal_name = 'Cliente Lim CE'$$,
  $$values ('10000000957'::text, 2::bigint)$$, 'Cliente: documento próprio e 2 apelidos DOCUMENT ativos');

-- Inativos não contam.
select is(pg_temp.err_of($$select * from pg_temp.scl('Cliente Lim CG',
    '[{"type":"NAME","value":"Inat Lim A"},{"type":"NAME","value":"Inat Lim B"}]'::jsonb)$$), 'ok', 'Cliente inativos: cria com A e B');
select is(pg_temp.err_of($$select * from pg_temp.scl('Cliente Lim CG',
    '[{"type":"NAME","value":"Inat Lim A"}]'::jsonb, null, pg_temp.cid('Cliente Lim CG'), pg_temp.cv('Cliente Lim CG'))$$), 'ok',
  'Cliente inativos: tira B (fica inativo)');
select is(pg_temp.err_of($$select * from pg_temp.scl('Cliente Lim CG',
    '[{"type":"NAME","value":"Inat Lim A"},{"type":"NAME","value":"Inat Lim C"}]'::jsonb, null, pg_temp.cid('Cliente Lim CG'), pg_temp.cv('Cliente Lim CG'))$$), 'ok',
  'Cliente inativos: A + C grava (o inativo não conta)');
select results_eq(
  $$select count(*) filter (where active), count(*) from public.client_aliases where client_id = pg_temp.cid('Cliente Lim CG')$$,
  $$values (2::bigint, 3::bigint)$$, 'Cliente inativos: 2 ativos e 3 linhas');
select is(pg_temp.err_of($$select * from pg_temp.scl('Cliente Lim CG',
    '[{"type":"NAME","value":"Inat Lim A"},{"type":"NAME","value":"Inat Lim B"},{"type":"NAME","value":"Inat Lim C"}]'::jsonb, null, pg_temp.cid('Cliente Lim CG'), pg_temp.cv('Cliente Lim CG'))$$),
  '22023|LIST_LIMIT_EXCEEDED', 'Cliente inativos: reativar B com a lista cheia é recusado');

-- A conferência vem antes das travas e do aviso de nome repetido.
select is(pg_temp.err_of($$select * from pg_temp.scl('Cliente Lim CH',
    '[{"type":"NAME","value":"Nome Lim H1"}]'::jsonb, null, null, null, array[pg_temp.pid('Sócio Lim CZ')])$$),
  'P0001|PARTNER_INACTIVE', 'Sócio inativo com 1 apelido -> PARTNER_INACTIVE (controle)');
select is(pg_temp.err_of($$select * from pg_temp.scl('Cliente Lim CH',
    '[{"type":"NAME","value":"Nome Lim H1"},{"type":"NAME","value":"Nome Lim H2"},{"type":"NAME","value":"Nome Lim H3"}]'::jsonb, null, null, null, array[pg_temp.pid('Sócio Lim CZ')])$$),
  '22023|LIST_LIMIT_EXCEEDED', '3 NAME com sócio inativo -> LIST_LIMIT_EXCEEDED (não PARTNER_INACTIVE)');
select is(pg_temp.err_of($$select * from pg_temp.scl('Cliente Lim Homônimo',
    '[{"type":"NAME","value":"Nome Lim J1"}]'::jsonb)$$),
  'P0001|POSSIBLE_DUPLICATE', 'Nome repetido de outro cliente com 1 apelido -> POSSIBLE_DUPLICATE (controle)');
select is(pg_temp.err_of($$select * from pg_temp.scl('Cliente Lim Homônimo',
    '[{"type":"NAME","value":"Nome Lim J1"},{"type":"NAME","value":"Nome Lim J2"},{"type":"NAME","value":"Nome Lim J3"}]'::jsonb)$$),
  '22023|LIST_LIMIT_EXCEEDED', '3 NAME com nome repetido de outro cliente -> LIST_LIMIT_EXCEEDED (não POSSIBLE_DUPLICATE)');

-- -----------------------------------------------------------------------------
-- Recebedor (save_receiver): 30 formas do nome, 10 chaves Pix, 10 contas
-- -----------------------------------------------------------------------------
select is(pg_temp.err_of($$select public.save_receiver(null, pg_temp.pid('Sócio Lim R'), 'Titular Lim R1',
    pg_temp.name_list('Forma Lim ', 1, 30) || pg_temp.pix_list('lim.pix', 1, 10) || pg_temp.acct_list(10000, 1, 10), null)$$),
  'ok', 'Recebedor: 30 NAME_VARIANT + 10 PIX_KEY + 10 BANK_ACCOUNT gravam juntos');
select results_eq(
  $$select identifier_type::text, count(*) from public.receiver_identifiers where receiver_id = pg_temp.rid('Titular Lim R1') and active group by identifier_type order by 1$$,
  $$values ('BANK_ACCOUNT'::text, 10::bigint), ('NAME_VARIANT', 30::bigint), ('PIX_KEY', 10::bigint)$$,
  'Recebedor: 50 ativos, 30 / 10 / 10 por tipo');

select is(pg_temp.err_of($$select public.save_receiver(null, pg_temp.pid('Sócio Lim R'), 'Titular Lim R5', pg_temp.name_list('Forma Lim R5 ', 1, 31), null)$$),
  '22023|LIST_LIMIT_EXCEEDED', 'Recebedor: a 31.ª forma do nome é recusada');
select is(pg_temp.detail_of($$select public.save_receiver(null, pg_temp.pid('Sócio Lim R'), 'Titular Lim R5', pg_temp.name_list('Forma Lim R5 ', 1, 31), null)$$),
  '{"field":"identifiers","list":"NAME_VARIANT","identifier_type":"NAME_VARIANT","max":30}'::jsonb, 'Recebedor: detail do teto de NAME_VARIANT');
select is(pg_temp.err_of($$select public.save_receiver(null, pg_temp.pid('Sócio Lim R'), 'Titular Lim R5', pg_temp.pix_list('lim.r5.pix', 1, 11), null)$$),
  '22023|LIST_LIMIT_EXCEEDED', 'Recebedor: a 11.ª chave Pix é recusada');
select is(pg_temp.detail_of($$select public.save_receiver(null, pg_temp.pid('Sócio Lim R'), 'Titular Lim R5', pg_temp.pix_list('lim.r5.pix', 1, 11), null)$$),
  '{"field":"identifiers","list":"PIX_KEY","identifier_type":"PIX_KEY","max":10}'::jsonb, 'Recebedor: detail do teto de PIX_KEY');
select is(pg_temp.err_of($$select public.save_receiver(null, pg_temp.pid('Sócio Lim R'), 'Titular Lim R5', pg_temp.acct_list(30000, 1, 11), null)$$),
  '22023|LIST_LIMIT_EXCEEDED', 'Recebedor: a 11.ª conta é recusada');
select is(pg_temp.detail_of($$select public.save_receiver(null, pg_temp.pid('Sócio Lim R'), 'Titular Lim R5', pg_temp.acct_list(30000, 1, 11), null)$$),
  '{"field":"identifiers","list":"BANK_ACCOUNT","identifier_type":"BANK_ACCOUNT","max":10}'::jsonb, 'Recebedor: detail do teto de BANK_ACCOUNT');
select is((select count(*) from public.receivers where holder_name = 'Titular Lim R5'), 0::bigint,
  'Recebedor: nenhum recebedor criado pelas chamadas recusadas');

-- Repetidos contam uma vez: 2 chaves Pix repetidas + 9 outras = 10; 2 contas repetidas + 9 outras = 10.
select is(pg_temp.err_of($$select public.save_receiver(null, pg_temp.pid('Sócio Lim R'), 'Titular Lim R2',
    '[{"type":"PIX_KEY","value":"Lim.A@Example.com"},{"type":"PIX_KEY","value":"lim.a@example.com"},
      {"type":"BANK_ACCOUNT","bank_name":"Banco Limite","branch":"0001","account_number":"12345-6"},
      {"type":"BANK_ACCOUNT","bank_name":"banco limite","branch":"1","account_number":"123456"}]'::jsonb
    || pg_temp.pix_list('lim.r2.pix', 1, 9) || pg_temp.acct_list(20000, 1, 9), null)$$),
  'ok', 'Recebedor: Pix e contas repetidos contam uma vez (10 chaves e 10 contas gravam)');
select results_eq(
  $$select identifier_type::text, count(*) from public.receiver_identifiers where receiver_id = pg_temp.rid('Titular Lim R2') and active group by identifier_type order by 1$$,
  $$values ('BANK_ACCOUNT'::text, 10::bigint), ('PIX_KEY', 10::bigint)$$, 'Recebedor: 10 chaves Pix e 10 contas ativas');

-- Inativos não contam.
select is(pg_temp.err_of($$select public.save_receiver(null, pg_temp.pid('Sócio Lim R'), 'Titular Lim R3', pg_temp.pix_list('lim.r3.pix', 1, 10), null)$$), 'ok',
  'Recebedor inativos: cria com 10 chaves');
select is(pg_temp.err_of($$select public.save_receiver(pg_temp.rid('Titular Lim R3'), pg_temp.pid('Sócio Lim R'), 'Titular Lim R3', pg_temp.pix_list('lim.r3.pix', 1, 9), pg_temp.rv('Titular Lim R3'))$$),
  'ok', 'Recebedor inativos: salva com 9 (a 10.ª fica inativa)');
select is(pg_temp.err_of($$select public.save_receiver(pg_temp.rid('Titular Lim R3'), pg_temp.pid('Sócio Lim R'), 'Titular Lim R3',
    pg_temp.pix_list('lim.r3.pix', 1, 9) || pg_temp.pix_list('lim.r3.novo', 1, 1), pg_temp.rv('Titular Lim R3'))$$),
  'ok', 'Recebedor inativos: 9 + uma nova grava (a inativa não conta)');
select results_eq(
  $$select count(*) filter (where active), count(*) from public.receiver_identifiers where receiver_id = pg_temp.rid('Titular Lim R3')$$,
  $$values (10::bigint, 11::bigint)$$, 'Recebedor inativos: 10 ativos e 11 linhas');
select is(pg_temp.err_of($$select public.save_receiver(pg_temp.rid('Titular Lim R3'), pg_temp.pid('Sócio Lim R'), 'Titular Lim R3',
    pg_temp.pix_list('lim.r3.pix', 1, 10) || pg_temp.pix_list('lim.r3.novo', 1, 1), pg_temp.rv('Titular Lim R3'))$$),
  '22023|LIST_LIMIT_EXCEEDED', 'Recebedor inativos: as 10 + a reativada (11) é recusado');
select results_eq(
  $$select count(*) filter (where active), count(*) from public.receiver_identifiers where receiver_id = pg_temp.rid('Titular Lim R3')$$,
  $$values (10::bigint, 11::bigint)$$, 'Recebedor inativos: a recusa não mudou nada');

-- A conferência vem antes da versão.
select is(pg_temp.err_of($$select public.save_receiver(pg_temp.rid('Titular Lim R3'), pg_temp.pid('Sócio Lim R'), 'Titular Lim R3',
    pg_temp.pix_list('lim.r3.pix', 1, 1), '2020-01-01 00:00:00+00')$$),
  'P0001|STALE_VERSION', 'Versão antiga com a lista dentro do teto -> STALE_VERSION (controle)');
select is(pg_temp.err_of($$select public.save_receiver(pg_temp.rid('Titular Lim R3'), pg_temp.pid('Sócio Lim R'), 'Titular Lim R3',
    pg_temp.pix_list('lim.r3.pix', 1, 11), '2020-01-01 00:00:00+00')$$),
  '22023|LIST_LIMIT_EXCEEDED', 'Versão antiga com 11 chaves -> LIST_LIMIT_EXCEEDED (não STALE_VERSION)');

-- -----------------------------------------------------------------------------
-- Lista enorme, sem estouro de tempo (QA-CAD-07): o laço para no primeiro item acima do teto
-- -----------------------------------------------------------------------------
set local statement_timeout = '2s';

select is(pg_temp.err_of($$select public.save_partner(null, 'Sócio Lim Massa',
    (select array_agg('Apelido Massa ' || g) from generate_series(1, 3000) g), null)$$),
  '22023|LIST_LIMIT_EXCEEDED', 'Massa: 3.000 apelidos distintos de sócio -> LIST_LIMIT_EXCEEDED');
select is(pg_temp.err_of($$select * from pg_temp.scl('Cliente Lim Massa',
    (select jsonb_agg(jsonb_build_object('type', 'NAME', 'value', 'Apelido Massa ' || g)) from generate_series(1, 3000) g))$$),
  '22023|LIST_LIMIT_EXCEEDED', 'Massa: 3.000 apelidos NAME distintos de cliente -> LIST_LIMIT_EXCEEDED');
select is(pg_temp.err_of($$select public.save_receiver(null, pg_temp.pid('Sócio Lim R'), 'Titular Lim Massa',
    pg_temp.pix_list('massa.pix', 1, 3000), null)$$),
  '22023|LIST_LIMIT_EXCEEDED', 'Massa: 3.000 chaves Pix distintas -> LIST_LIMIT_EXCEEDED');

select is(pg_temp.err_of($$select public.save_partner(null, 'Sócio Lim Massa Rep',
    (select array_agg('Mesmo Apelido Massa'::text) from generate_series(1, 3000) g), null)$$),
  'ok', 'Massa: 3.000 repetições do mesmo apelido de sócio gravam');
select is((select count(*) from public.partner_aliases where partner_id = pg_temp.pid('Sócio Lim Massa Rep') and active), 1::bigint,
  'Massa: as repetições do sócio viraram 1 apelido');
select is(pg_temp.err_of($$select public.save_receiver(null, pg_temp.pid('Sócio Lim R'), 'Titular Lim Massa Rep',
    (select jsonb_agg(jsonb_build_object('type', 'PIX_KEY', 'value', 'massa.rep@example.com')) from generate_series(1, 3000) g), null)$$),
  'ok', 'Massa: 3.000 repetições da mesma chave Pix gravam');
select is((select count(*) from public.receiver_identifiers where receiver_id = pg_temp.rid('Titular Lim Massa Rep') and active), 1::bigint,
  'Massa: as repetições do recebedor viraram 1 chave');

set local statement_timeout = 0;

-- -----------------------------------------------------------------------------
-- Dados do banco dentro do teto (como postgres): cobre o seed e o que este arquivo criou
-- -----------------------------------------------------------------------------
reset role;

select is((
  select count(*) from (
    select 'PARTNER_ALIAS' as list, partner_id as owner, count(*) as n
      from public.partner_aliases where active group by partner_id
    union all
    select 'CLIENT_ALIAS_' || alias_type::text, client_id, count(*)
      from public.client_aliases where active group by client_id, alias_type
    union all
    select identifier_type::text, receiver_id, count(*)
      from public.receiver_identifiers where active group by receiver_id, identifier_type
  ) x where x.n > private.cad_list_limit(x.list)
), 0::bigint, 'Nenhum dono do banco (seed incluído) passa do teto de itens ativos');

select * from finish();
rollback;
