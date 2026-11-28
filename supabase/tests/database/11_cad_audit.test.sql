-- =============================================================================
-- pgTAP · CAD-001 · Auditoria das tabelas novas (nível de trigger)
-- Toda escrita nas seis tabelas gera ROW_CHANGE; UPDATE grava só as colunas alteradas
-- (sem updated_at) e UPDATE sem mudança não gera linha; motivo opcional (RAT-D021); nada
-- é redigido nesta feature (modelagem 8, P-20); DELETE bloqueado não deixa rastro.
-- As linhas geradas pelas funções de sócio e recebedor (EVENT, motivo em cascata; migration 0300) e de cliente
-- (PARTNERS_CHANGE, DUPLICATE_WARNING_ACK; migration 0400) estão na seção "Auditoria das funções de gravação".
-- Rastreio: RAT-D009, RAT-D021 · I-14, I-15.
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(81);

-- Contexto de auditoria deste teste (como em um script do responsável).
select private.set_audit_context('Motivo de teste CAD', 'SCRIPT', null, 'pgtap');

-- O banco de teste já tem linhas de auditoria do seed (outras transações): as asserções de nível de tabela
-- olham só as linhas desta transação.
create temp view cur_audit as select * from public.audit_logs where tx_id = pg_current_xact_id();

insert into public.partners (id, name) values
  ('f2000000-0000-4000-8000-000000000001', 'Sócio Teste A'),
  ('f2000000-0000-4000-8000-000000000002', 'Sócio Teste B');

-- -----------------------------------------------------------------------------
-- Escritas: uma por tabela
-- -----------------------------------------------------------------------------
insert into public.partner_aliases (id, partner_id, alias)
values ('f3000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'Apelido Teste A1');
insert into public.receivers (id, partner_id, holder_name)
values ('f4000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'Titular Fictício A1');
insert into public.receiver_identifiers (id, receiver_id, identifier_type, value)
values ('f5000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000001', 'PIX_KEY', 'Socio.A@Example.com');
insert into public.clients (id, legal_name, document, default_monthly_value)
values ('f6000000-0000-4000-8000-000000000001', 'Cliente Modelo Teste Ltda', 'ZZ0TESTE000100', 1500.00);
insert into public.client_partners (id, client_id, partner_id)
values ('f8000000-0000-4000-8000-000000000001', 'f6000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001');
insert into public.client_aliases (id, client_id, alias_type, alias)
values ('f7000000-0000-4000-8000-000000000001', 'f6000000-0000-4000-8000-000000000001', 'DOCUMENT', '000.000.001-91');

-- -----------------------------------------------------------------------------
-- CREATE nas seis entidades (I-15)
-- -----------------------------------------------------------------------------
select results_eq(
  $$select entity, action, kind::text from pg_temp.cur_audit
     where entity in ('partner_alias', 'receiver', 'receiver_identifier', 'client', 'client_partner', 'client_alias')
     order by entity$$,
  $$values ('client'::text, 'CREATE'::text, 'ROW_CHANGE'::text),
           ('client_alias', 'CREATE', 'ROW_CHANGE'),
           ('client_partner', 'CREATE', 'ROW_CHANGE'),
           ('partner_alias', 'CREATE', 'ROW_CHANGE'),
           ('receiver', 'CREATE', 'ROW_CHANGE'),
           ('receiver_identifier', 'CREATE', 'ROW_CHANGE')$$,
  'Cada insert nas seis tabelas gera exatamente um ROW_CHANGE CREATE, com o nome da entidade');

select is(
  (select count(*) from pg_temp.cur_audit a
    where a.entity in ('partner_alias', 'receiver', 'receiver_identifier', 'client', 'client_partner', 'client_alias')
      and a.entity_id::text not like 'f_000000-0000-4000-8000-000000000001'),
  0::bigint, 'entity_id é o id da linha (uuid) em cada registro');

select results_eq(
  $$select reason, source::text, actor_label, request_role from pg_temp.cur_audit
     where entity = 'client' and action = 'CREATE'$$,
  $$values ('Motivo de teste CAD'::text, 'SCRIPT'::text, 'pgtap'::text, 'direct:postgres'::text)$$,
  'O motivo, a origem e o rótulo do executor vêm do contexto de auditoria');

select is(
  (select count(distinct tx_id) from pg_temp.cur_audit
    where entity in ('partner_alias', 'receiver', 'receiver_identifier', 'client', 'client_partner', 'client_alias')),
  1::bigint, 'As escritas da mesma transação compartilham o tx_id');

-- Conteúdo gravado: nada é redigido nesta feature (modelagem 8; P-20 antes de dados reais)
select is((select new_data ->> 'document' from pg_temp.cur_audit where entity = 'client' and action = 'CREATE'),
  'ZZ0TESTE000100', 'CREATE do cliente grava o documento (sem redação; a redação é decisão da P-20)');
select is((select new_data ->> 'default_monthly_value' from pg_temp.cur_audit where entity = 'client' and action = 'CREATE'),
  '1500.00', 'CREATE do cliente grava a mensalidade como número exato (1500.00)');
select is((select new_data ->> 'normalized_value' from pg_temp.cur_audit where entity = 'client_alias' and action = 'CREATE'),
  '00000000191', 'CREATE do apelido-documento grava o valor canônico');
select is((select new_data ->> 'value' from pg_temp.cur_audit where entity = 'receiver_identifier' and action = 'CREATE'),
  'Socio.A@Example.com', 'CREATE do identificador grava a chave Pix como digitada');
select is((select new_data ->> 'normalized_value' from pg_temp.cur_audit where entity = 'receiver_identifier' and action = 'CREATE'),
  'socio.a@example.com', '... e o valor normalizado calculado pelo trigger');
select is((select new_data ->> 'partner_id' from pg_temp.cur_audit where entity = 'client_partner' and action = 'CREATE'),
  'f2000000-0000-4000-8000-000000000001', 'CREATE da indicação grava o sócio');
select ok(not exists (select 1 from pg_temp.cur_audit
                       where entity in ('partner_alias', 'receiver', 'receiver_identifier', 'client', 'client_partner', 'client_alias')
                         and (new_data::text ~ '\[omitido\]' or previous_data::text ~ '\[omitido\]')),
  'Nenhuma coluna das seis tabelas é redigida na auditoria');

-- -----------------------------------------------------------------------------
-- UPDATE: só as colunas alteradas, sem updated_at; sem mudança, sem linha
-- -----------------------------------------------------------------------------
create temp table marks (name text primary key, seq bigint);
insert into marks select 'before_update', max(seq) from pg_temp.cur_audit;

update public.clients set default_monthly_value = 1600.50, notes = 'Observação de teste'
 where id = 'f6000000-0000-4000-8000-000000000001';

select results_eq(
  $$select previous_data, new_data from pg_temp.cur_audit
     where entity = 'client' and action = 'UPDATE'$$,
  $$values ('{"notes": null, "default_monthly_value": 1500.00}'::jsonb,
            '{"notes": "Observação de teste", "default_monthly_value": 1600.50}'::jsonb)$$,
  'UPDATE do cliente grava só as colunas alteradas, com antes e depois (mensalidade e observação)');
select ok(not exists (select 1 from pg_temp.cur_audit where entity = 'client' and action = 'UPDATE'
                        and (new_data ? 'updated_at' or previous_data ? 'updated_at')),
  'UPDATE não grava updated_at');

insert into marks select 'after_update', max(seq) from pg_temp.cur_audit;
update public.clients set notes = notes, legal_name = legal_name where id = 'f6000000-0000-4000-8000-000000000001';
update public.clients set updated_at = now() where id = 'f6000000-0000-4000-8000-000000000001';
update public.partner_aliases set active = active where id = 'f3000000-0000-4000-8000-000000000001';
select is((select max(seq) from pg_temp.cur_audit), (select seq from marks where name = 'after_update'),
  'UPDATE sem mudança real (nem só tocar o updated_at) não gera linha de auditoria');

-- Troca de situação (inativar e reativar)
update public.partner_aliases set active = false where id = 'f3000000-0000-4000-8000-000000000001';
select results_eq(
  $$select previous_data, new_data from pg_temp.cur_audit where entity = 'partner_alias' and action = 'UPDATE'$$,
  $$values ('{"active": true}'::jsonb, '{"active": false}'::jsonb)$$,
  'Inativar apelido grava só active: true -> false');
update public.receivers set active = false where id = 'f4000000-0000-4000-8000-000000000001';
select results_eq(
  $$select previous_data, new_data from pg_temp.cur_audit where entity = 'receiver' and action = 'UPDATE'$$,
  $$values ('{"active": true}'::jsonb, '{"active": false}'::jsonb)$$,
  'Inativar recebedor grava só active: true -> false');
update public.receiver_identifiers set active = false where id = 'f5000000-0000-4000-8000-000000000001';
select is((select count(*) from pg_temp.cur_audit where entity = 'receiver_identifier' and action = 'UPDATE'),
  1::bigint, 'Inativar identificador gera uma linha UPDATE');
update public.client_aliases set active = false where id = 'f7000000-0000-4000-8000-000000000001';
select is((select count(*) from pg_temp.cur_audit where entity = 'client_alias' and action = 'UPDATE'),
  1::bigint, 'Inativar apelido do cliente gera uma linha UPDATE');

-- Sócio: a guarda não interfere na auditoria existente
update public.partners set active = false where id = 'f2000000-0000-4000-8000-000000000002';
select results_eq(
  $$select previous_data, new_data from pg_temp.cur_audit
     where entity = 'partner' and action = 'UPDATE' and entity_id = 'f2000000-0000-4000-8000-000000000002'$$,
  $$values ('{"active": true}'::jsonb, '{"active": false}'::jsonb)$$,
  'Inativar sócio (sem indicação nem recebedor) continua auditado como UPDATE de active');

-- Motivo opcional (RAT-D021): sem motivo, a escrita conclui e a linha traz reason nulo
select private.set_audit_context('   ', 'SCRIPT', null, 'pgtap');
insert into marks select 'no_reason', max(seq) from pg_temp.cur_audit;
insert into public.partner_aliases (id, partner_id, alias)
values ('f3000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000001', 'Apelido Teste A2');
select is((select reason from pg_temp.cur_audit where entity = 'partner_alias' and entity_id = 'f3000000-0000-4000-8000-000000000002'),
  null, 'Motivo só com espaços vira nulo e a escrita conclui (RAT-D021)');

-- Correlação informada aparece nas linhas
select private.set_audit_context('Com correlação', 'SCRIPT', 'c0c0c0c0-0000-4000-8000-0000000000aa', 'pgtap');
insert into public.client_aliases (id, client_id, alias_type, alias)
values ('f7000000-0000-4000-8000-000000000002', 'f6000000-0000-4000-8000-000000000001', 'NAME', 'Modelo');
select is((select correlation_id::text from pg_temp.cur_audit where entity = 'client_alias' and entity_id = 'f7000000-0000-4000-8000-000000000002'),
  'c0c0c0c0-0000-4000-8000-0000000000aa', 'O correlation_id informado no contexto vai para a linha');

-- -----------------------------------------------------------------------------
-- Exclusão física bloqueada e sem rastro (I-14)
-- -----------------------------------------------------------------------------
insert into marks select 'before_delete', max(seq) from pg_temp.cur_audit;
select throws_ok($$delete from public.partner_aliases$$,       '42501', null, 'DELETE em partner_aliases é recusado');
select throws_ok($$delete from public.receivers$$,             '42501', null, 'DELETE em receivers é recusado');
select throws_ok($$delete from public.receiver_identifiers$$,  '42501', null, 'DELETE em receiver_identifiers é recusado');
select throws_ok($$delete from public.clients$$,               '42501', null, 'DELETE em clients é recusado');
select throws_ok($$delete from public.client_aliases$$,        '42501', null, 'DELETE em client_aliases é recusado');
select throws_ok($$delete from public.client_partners$$,       '42501', null, 'DELETE em client_partners é recusado');
select is((select max(seq) from pg_temp.cur_audit), (select seq from marks where name = 'before_delete'),
  'DELETE recusado não deixa linha de auditoria');

-- -----------------------------------------------------------------------------
-- Catálogo: o trigger de auditoria está nas seis tabelas, com o nome da entidade certo
-- -----------------------------------------------------------------------------
select set_eq(
  $$select t.tgrelid::regclass::text || ':' || (regexp_match(pg_get_triggerdef(t.oid), $re$audit_row_change\('([a-z_]+)'\)$re$))[1]
      from pg_trigger t
     where t.tgfoid = 'private.audit_row_change'::regproc and not t.tgisinternal
       and t.tgrelid::regclass::text in ('partner_aliases', 'receivers', 'receiver_identifiers', 'clients', 'client_aliases', 'client_partners')$$,
  $$values ('partner_aliases:partner_alias'::text), ('receivers:receiver'), ('receiver_identifiers:receiver_identifier'),
           ('clients:client'), ('client_aliases:client_alias'), ('client_partners:client_partner')$$,
  'Os seis triggers de auditoria usam os nomes de entidade partner_alias, receiver, receiver_identifier, client, client_alias, client_partner');

select is(
  (select count(*) from pg_trigger t
    where t.tgrelid::regclass::text in ('partner_aliases', 'receivers', 'receiver_identifiers', 'clients', 'client_aliases', 'client_partners')
      and not t.tgisinternal and t.tgfoid = 'private.prevent_mutation'::regproc and (t.tgtype & 8) <> 0 and (t.tgtype & 2) <> 0),
  6::bigint, 'Cada tabela nova tem trigger BEFORE DELETE por linha que bloqueia (prevent_mutation)');

select is(
  (select count(*) from pg_trigger t
    where t.tgrelid::regclass::text in ('partner_aliases', 'receivers', 'receiver_identifiers', 'clients', 'client_aliases', 'client_partners')
      and not t.tgisinternal and t.tgfoid = 'private.prevent_truncate'::regproc and (t.tgtype & 32) <> 0 and (t.tgtype & 1) = 0),
  6::bigint, 'Cada tabela nova tem trigger BEFORE TRUNCATE por statement que bloqueia (prevent_truncate)');

select is(
  (select count(*) from pg_trigger t
    where t.tgrelid::regclass::text in ('partner_aliases', 'receivers', 'receiver_identifiers', 'clients', 'client_aliases', 'client_partners')
      and not t.tgisinternal and t.tgfoid = 'private.set_updated_at'::regproc),
  6::bigint, 'Cada tabela nova tem o trigger set_updated_at');

select is(
  (select count(*) from pg_trigger t
    where t.tgrelid = 'public.partners'::regclass and t.tgname = 'partners_guard' and not t.tgisinternal),
  1::bigint, 'partners ganha o trigger partners_guard, sem coluna nova');

-- -----------------------------------------------------------------------------
-- Auditoria das funções de gravação (migrations 0300 e 0400; modelagem 8). Chamadas como Administrador
-- (source = UI), cada uma com correlation_id próprio; as linhas são lidas depois, como postgres.
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('b1000000-0000-4000-8000-000000000001', 'pgtap-admin-aud@example.com'),
  ('b1000000-0000-4000-8000-000000000002', 'pgtap-operador-aud@example.com');
select private.set_user_access('pgtap-admin-aud@example.com',    'ADMINISTRATOR', null, true, 'fixture de teste', 'pgtap');
select private.set_user_access('pgtap-operador-aud@example.com', 'OPERATOR',      null, true, 'fixture de teste', 'pgtap');

create function pg_temp.pv(p text) returns timestamptz language sql as $$ select updated_at from public.partners where name = p $$;
create function pg_temp.rv(p text) returns timestamptz language sql as $$ select updated_at from public.receivers where holder_name = p $$;
create function pg_temp.cv(p text) returns timestamptz language sql as $$ select updated_at from public.clients where legal_name = p $$;
create function pg_temp.cid(p text) returns uuid language sql as $$ select c.id from public.clients c where c.legal_name = p order by (select min(a.seq) from public.audit_logs a where a.entity = 'client' and a.entity_id = c.id) limit 1 $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- A: cria sócio com 2 apelidos, com motivo
select count(*) as a from public.save_partner(null, 'Sócio Aud Alfa', array['Aud Alfa 1', 'Aud Alfa 2'], null, 'Cadastro inicial', 'c2000000-0000-4000-8000-00000000000a');
-- B: edita (renomeia e retira um apelido), sem motivo
select count(*) as b from public.save_partner((select id from public.partners where name = 'Sócio Aud Alfa'), 'Sócio Aud Alfa Dois',
  array['Aud Alfa 1'], pg_temp.pv('Sócio Aud Alfa'), null, 'c2000000-0000-4000-8000-00000000000b');
-- C: motivo só com espaços, tabs e quebras de linha
select count(*) as c from public.save_partner((select id from public.partners where name = 'Sócio Aud Alfa Dois'), 'Sócio Aud Alfa Dois',
  array['Aud Alfa 1', 'Aud Alfa 3'], pg_temp.pv('Sócio Aud Alfa Dois'), E' \t\r\n ', 'c2000000-0000-4000-8000-00000000000c');
-- D (preparo): sócio com dois recebedores
select count(*) as d0 from public.save_partner(null, 'Sócio Aud Casc', '{}'::text[], null);
select count(*) as d1 from public.save_receiver(null, (select id from public.partners where name = 'Sócio Aud Casc'), 'Titular Aud Casc 1',
  '[{"type":"PIX_KEY","value":"casc1.aud@example.com"},{"type":"NAME_VARIANT","value":"Casc Um"}]'::jsonb, null, 'Cadastro do recebedor', 'c2000000-0000-4000-8000-0000000000f1');
select count(*) as d2 from public.save_receiver(null, (select id from public.partners where name = 'Sócio Aud Casc'), 'Titular Aud Casc 2', '[]'::jsonb, null);
-- D: inativa o sócio, com a cascata, com motivo
select count(*) as d from public.set_partner_active((select id from public.partners where name = 'Sócio Aud Casc'), false, pg_temp.pv('Sócio Aud Casc'),
  array(select id from public.receivers where partner_id = (select id from public.partners where name = 'Sócio Aud Casc') and active),
  'Encerramento da parceria', 'c2000000-0000-4000-8000-00000000000d');
-- E: reativa o sócio, sem motivo
select count(*) as e from public.set_partner_active((select id from public.partners where name = 'Sócio Aud Casc'), true, pg_temp.pv('Sócio Aud Casc'),
  null, null, 'c2000000-0000-4000-8000-00000000000e');
-- F: edita o recebedor (troca o titular, retira um identificador, inclui outro), com motivo
select count(*) as f from public.save_receiver((select id from public.receivers where holder_name = 'Titular Aud Casc 1'), null, 'Titular Aud Casc Um',
  '[{"type":"PIX_KEY","value":"casc1.aud@example.com"},{"type":"BANK_ACCOUNT","bank_name":"Banco Exemplo","branch":"0001","account_number":"99999-9"}]'::jsonb,
  pg_temp.rv('Titular Aud Casc 1'), 'Ajuste de dados', 'c2000000-0000-4000-8000-0000000000f2');
-- H: inativa e reativa o recebedor
select count(*) as h1 from public.set_receiver_active((select id from public.receivers where holder_name = 'Titular Aud Casc 2'), true,
  pg_temp.rv('Titular Aud Casc 2'), 'Recebedor reativado', 'c2000000-0000-4000-8000-0000000000f3');
select count(*) as h2 from public.set_receiver_active((select id from public.receivers where holder_name = 'Titular Aud Casc 2'), false,
  pg_temp.rv('Titular Aud Casc 2'), null, 'c2000000-0000-4000-8000-0000000000f4');

-- K1: cria cliente com dois sócios e um apelido, com motivo
select count(*) as k1 from public.save_client(null, 'Cliente Aud Um', 'Fantasia Aud', '12.ABC.345/01DE-35', '100.50', 'obs',
  array[(select id from public.partners where name = 'Sócio Aud Alfa Dois'), (select id from public.partners where name = 'Sócio Aud Casc')],
  '[{"type":"NAME","value":"Aud Um Apelido"}]'::jsonb, null, null, 'Cadastro do cliente', 'c2000000-0000-4000-8000-0000000000a1');
-- K2: renomeia, muda a mensalidade, retira um sócio e o apelido, com motivo
select count(*) as k2 from public.save_client(pg_temp.cid('Cliente Aud Um'), 'Cliente Aud Um Novo', 'Fantasia Aud', '12ABC34501DE35', '120.00', 'obs',
  array[(select id from public.partners where name = 'Sócio Aud Alfa Dois')], '[]'::jsonb, pg_temp.cv('Cliente Aud Um'), null,
  'Revisão contratual', 'c2000000-0000-4000-8000-0000000000a2');
-- K3: muda só a mensalidade, sem motivo
select count(*) as k3 from public.save_client(pg_temp.cid('Cliente Aud Um Novo'), 'Cliente Aud Um Novo', 'Fantasia Aud', '12ABC34501DE35', '121.00', 'obs',
  array[(select id from public.partners where name = 'Sócio Aud Alfa Dois')], '[]'::jsonb, pg_temp.cv('Cliente Aud Um Novo'), null,
  null, 'c2000000-0000-4000-8000-0000000000a3');
-- K4: novo cliente com o mesmo nome, com o aviso confirmado e motivo
select count(*) as k4 from public.save_client(null, 'Cliente Aud Um Novo', null, null, '50.00', null,
  array[(select id from public.partners where name = 'Sócio Aud Alfa Dois')], '[]'::jsonb, null,
  array[pg_temp.cid('Cliente Aud Um Novo')], 'Filial com o mesmo nome', 'c2000000-0000-4000-8000-0000000000a4');
-- K5 e K6: inativa (com motivo) e reativa (sem motivo)
select count(*) as k5 from public.set_client_active(pg_temp.cid('Cliente Aud Um Novo'), false, pg_temp.cv('Cliente Aud Um Novo'),
  'Cliente encerrou', 'c2000000-0000-4000-8000-0000000000a5');
select count(*) as k6 from public.set_client_active(pg_temp.cid('Cliente Aud Um Novo'), true, pg_temp.cv('Cliente Aud Um Novo'),
  null, 'c2000000-0000-4000-8000-0000000000a6');

-- Operador: negado antes de qualquer escrita e de qualquer auditoria
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.save_partner(null, 'Sócio Aud Negado', null, null, 'tentativa', 'c2000000-0000-4000-8000-0000000000f9')$$,
  '42501', null, 'Operador não grava sócio (42501)');
select throws_ok($$select public.save_client(null, 'Cliente Aud Negado', null, null, '10', null, '{}'::uuid[], '[]'::jsonb, null, null, 'tentativa', 'c2000000-0000-4000-8000-0000000000f8')$$,
  '42501', null, 'Operador não grava cliente (42501)');
reset role;

-- A
select results_eq(
  $$select entity, action, kind::text, count(*)::int from public.audit_logs
     where correlation_id = 'c2000000-0000-4000-8000-00000000000a' group by 1, 2, 3 order by 1, 2$$,
  $$values ('partner'::text, 'CREATE'::text, 'ROW_CHANGE'::text, 1), ('partner_alias', 'CREATE', 'ROW_CHANGE', 2)$$,
  'save_partner (novo): CREATE do sócio e um CREATE por apelido');
select is((select count(*) from public.audit_logs
            where correlation_id = 'c2000000-0000-4000-8000-00000000000a'
              and (source <> 'UI' or actor_role is distinct from 'ADMINISTRATOR'
                   or actor_user_id is distinct from 'b1000000-0000-4000-8000-000000000001'
                   or request_role <> 'authenticated' or reason is distinct from 'Cadastro inicial')),
  0::bigint, 'save_partner: origem UI, ator, papel e motivo gravados em todas as linhas');
select is((select count(distinct tx_id) from public.audit_logs where correlation_id = 'c2000000-0000-4000-8000-00000000000a'),
  1::bigint, 'save_partner: tudo na mesma transação (tx_id)');

-- B
select results_eq(
  $$select entity, action, count(*)::int from public.audit_logs
     where correlation_id = 'c2000000-0000-4000-8000-00000000000b' group by 1, 2 order by 1, 2$$,
  $$values ('partner'::text, 'UPDATE'::text, 1), ('partner_alias', 'UPDATE', 1)$$,
  'save_partner (edição): UPDATE do sócio e UPDATE do apelido retirado');
select is((select new_data ->> 'name' from public.audit_logs where correlation_id = 'c2000000-0000-4000-8000-00000000000b' and entity = 'partner'),
  'Sócio Aud Alfa Dois', 'save_partner: o UPDATE do sócio grava o nome novo');
select is((select (previous_data ->> 'active') || '>' || (new_data ->> 'active') from public.audit_logs
            where correlation_id = 'c2000000-0000-4000-8000-00000000000b' and entity = 'partner_alias'),
  'true>false', 'save_partner: o apelido retirado grava active de true para false');
select is((select count(*) from public.audit_logs where correlation_id = 'c2000000-0000-4000-8000-00000000000b' and reason is not null),
  0::bigint, 'Sem motivo: reason nulo e a ação conclui (RAT-D021)');

-- C
select is((select count(*) from public.audit_logs where correlation_id = 'c2000000-0000-4000-8000-00000000000c'),
  1::bigint, 'save_partner com motivo em branco: a ação conclui e grava a linha do apelido novo');
select is((select count(*) from public.audit_logs where correlation_id = 'c2000000-0000-4000-8000-00000000000c' and reason is not null),
  0::bigint, 'Motivo só com espaços, tabs e quebras de linha vira nulo');

-- D
select results_eq(
  $$select entity, action, kind::text, count(*)::int from public.audit_logs
     where correlation_id = 'c2000000-0000-4000-8000-00000000000d' group by 1, 2, 3 order by 1, 2$$,
  $$values ('partner'::text, 'INACTIVATE'::text, 'EVENT'::text, 1), ('partner', 'UPDATE', 'ROW_CHANGE', 1), ('receiver', 'UPDATE', 'ROW_CHANGE', 2)$$,
  'set_partner_active (inativar): UPDATE de cada recebedor da cascata, UPDATE do sócio e o EVENT INACTIVATE');
select is((select count(distinct tx_id) from public.audit_logs where correlation_id = 'c2000000-0000-4000-8000-00000000000d'),
  1::bigint, 'Inativação do sócio: cascata e sócio na mesma transação');
select is((select count(*) from public.audit_logs
            where correlation_id = 'c2000000-0000-4000-8000-00000000000d' and reason is distinct from 'Encerramento da parceria'),
  0::bigint, 'Inativação do sócio: o motivo vai para TODAS as linhas da operação (RAT-D021)');
select is((select new_data -> 'receiver_ids' from public.audit_logs where correlation_id = 'c2000000-0000-4000-8000-00000000000d' and kind = 'EVENT'),
  (select to_jsonb(array_agg(id order by id)) from public.receivers where partner_id = (select id from public.partners where name = 'Sócio Aud Casc')),
  'O EVENT INACTIVATE traz os ids dos recebedores inativados');
select is((select (previous_data ->> 'active') || '>' || (new_data ->> 'active') from public.audit_logs
            where correlation_id = 'c2000000-0000-4000-8000-00000000000d' and entity = 'partner' and action = 'UPDATE'),
  'true>false', 'O UPDATE do sócio grava active de true para false');

-- E
select results_eq(
  $$select entity, action, kind::text, count(*)::int from public.audit_logs
     where correlation_id = 'c2000000-0000-4000-8000-00000000000e' group by 1, 2, 3 order by 1, 2$$,
  $$values ('partner'::text, 'UPDATE'::text, 'ROW_CHANGE'::text, 1)$$,
  'set_partner_active (reativar): só o UPDATE do sócio (recebedores não são reativados)');
select is((select count(*) from public.audit_logs where correlation_id = 'c2000000-0000-4000-8000-00000000000e' and reason is not null),
  0::bigint, 'Reativar sem motivo: reason nulo');

-- Recebedor novo, edição e inativação
select results_eq(
  $$select entity, action, count(*)::int from public.audit_logs
     where correlation_id = 'c2000000-0000-4000-8000-0000000000f1' group by 1, 2 order by 1, 2$$,
  $$values ('receiver'::text, 'CREATE'::text, 1), ('receiver_identifier', 'CREATE', 2)$$,
  'save_receiver (novo): CREATE do recebedor e um CREATE por identificador');
select is((select count(*) from public.audit_logs
            where correlation_id = 'c2000000-0000-4000-8000-0000000000f1' and reason is distinct from 'Cadastro do recebedor'),
  0::bigint, 'save_receiver (novo): motivo em todas as linhas');
select results_eq(
  $$select entity, action, count(*)::int from public.audit_logs
     where correlation_id = 'c2000000-0000-4000-8000-0000000000f2' group by 1, 2 order by 1, 2$$,
  $$values ('receiver'::text, 'UPDATE'::text, 1), ('receiver_identifier', 'CREATE', 1), ('receiver_identifier', 'UPDATE', 1)$$,
  'save_receiver (edição): UPDATE do titular, UPDATE do identificador retirado e CREATE do novo');
select is((select count(*) from public.audit_logs
            where correlation_id = 'c2000000-0000-4000-8000-0000000000f2' and reason is distinct from 'Ajuste de dados'),
  0::bigint, 'save_receiver (edição): motivo em todas as linhas');
select is((select new_data ->> 'normalized_value' from public.audit_logs
            where correlation_id = 'c2000000-0000-4000-8000-0000000000f2' and entity = 'receiver_identifier' and action = 'CREATE'),
  'banco exemplo|1|999999', 'A conta nova grava o valor normalizado calculado pelo trigger');
select results_eq(
  $$select action, previous_data::text, new_data::text from public.audit_logs
     where correlation_id = 'c2000000-0000-4000-8000-0000000000f3' and entity = 'receiver'$$,
  $$values ('UPDATE'::text, '{"active": false}'::text, '{"active": true}'::text)$$,
  'set_receiver_active: um UPDATE só com a coluna active');
select is((select reason from public.audit_logs where correlation_id = 'c2000000-0000-4000-8000-0000000000f3' and entity = 'receiver'),
  'Recebedor reativado', 'set_receiver_active: motivo gravado');
select is((select count(*) from public.audit_logs where correlation_id = 'c2000000-0000-4000-8000-0000000000f4' and reason is not null),
  0::bigint, 'set_receiver_active sem motivo: reason nulo');

-- K1: criação do cliente
select results_eq(
  $$select entity, action, kind::text, count(*)::int from public.audit_logs
     where correlation_id = 'c2000000-0000-4000-8000-0000000000a1' group by 1, 2, 3 order by 1, 2$$,
  $$values ('client'::text, 'CREATE'::text, 'ROW_CHANGE'::text, 1), ('client', 'PARTNERS_CHANGE', 'EVENT', 1),
           ('client_alias', 'CREATE', 'ROW_CHANGE', 1), ('client_partner', 'CREATE', 'ROW_CHANGE', 2)$$,
  'save_client (novo): CREATE do cliente, um CREATE por sócio e por apelido, e o EVENT PARTNERS_CHANGE');
select is((select count(*) from public.audit_logs
            where correlation_id = 'c2000000-0000-4000-8000-0000000000a1'
              and (source <> 'UI' or actor_role is distinct from 'ADMINISTRATOR'
                   or actor_user_id is distinct from 'b1000000-0000-4000-8000-000000000001'
                   or request_role <> 'authenticated' or reason is distinct from 'Cadastro do cliente')),
  0::bigint, 'save_client: origem UI, ator, papel e motivo em todas as linhas');
select is((select count(distinct tx_id) from public.audit_logs where correlation_id = 'c2000000-0000-4000-8000-0000000000a1'),
  1::bigint, 'save_client: tudo na mesma transação (tx_id)');
select results_eq(
  $$select new_data ->> 'document', new_data ->> 'default_monthly_value', new_data ->> 'document_type' from public.audit_logs
     where correlation_id = 'c2000000-0000-4000-8000-0000000000a1' and entity = 'client' and kind = 'ROW_CHANGE'$$,
  $$values ('12ABC34501DE35'::text, '100.50'::text, 'CNPJ'::text)$$,
  'save_client: o CREATE grava documento canônico, mensalidade exata e tipo');
select results_eq(
  $$select new_data -> 'previous_partner_ids', jsonb_array_length(new_data -> 'new_partner_ids'), (new_data ->> 'previous_count')::int, (new_data ->> 'new_count')::int
      from public.audit_logs where correlation_id = 'c2000000-0000-4000-8000-0000000000a1' and kind = 'EVENT'$$,
  $$values ('[]'::jsonb, 2, 0, 2)$$,
  'save_client (novo): PARTNERS_CHANGE vai de lista vazia para os 2 sócios');

-- K2: edição com troca de sócios e motivo
select results_eq(
  $$select entity, action, kind::text, count(*)::int from public.audit_logs
     where correlation_id = 'c2000000-0000-4000-8000-0000000000a2' group by 1, 2, 3 order by 1, 2$$,
  $$values ('client'::text, 'PARTNERS_CHANGE'::text, 'EVENT'::text, 1), ('client', 'UPDATE', 'ROW_CHANGE', 1),
           ('client_alias', 'UPDATE', 'ROW_CHANGE', 1), ('client_partner', 'UPDATE', 'ROW_CHANGE', 1)$$,
  'save_client (edição): UPDATE do cliente, do sócio retirado e do apelido retirado, e o EVENT PARTNERS_CHANGE');
select is((select count(*) from public.audit_logs where correlation_id = 'c2000000-0000-4000-8000-0000000000a2' and reason is distinct from 'Revisão contratual'),
  0::bigint, 'save_client (troca de sócios): o motivo vai para TODAS as linhas (RAT-D025, RAT-D021)');
select results_eq(
  $$select previous_data ->> 'legal_name', new_data ->> 'legal_name', previous_data ->> 'default_monthly_value', new_data ->> 'default_monthly_value'
      from public.audit_logs where correlation_id = 'c2000000-0000-4000-8000-0000000000a2' and entity = 'client' and action = 'UPDATE'$$,
  $$values ('Cliente Aud Um'::text, 'Cliente Aud Um Novo'::text, '100.50'::text, '120.00'::text)$$,
  'save_client (edição): o UPDATE do cliente grava antes e depois do nome e da mensalidade');
select results_eq(
  $$select (new_data ->> 'previous_count')::int, (new_data ->> 'new_count')::int, jsonb_array_length(new_data -> 'previous_partner_ids'), jsonb_array_length(new_data -> 'new_partner_ids')
      from public.audit_logs where correlation_id = 'c2000000-0000-4000-8000-0000000000a2' and kind = 'EVENT'$$,
  $$values (2, 1, 2, 1)$$,
  'A troca de sócios fica na auditoria com os sócios antes e depois e as contagens (RAT-D025)');
select is((select (previous_data ->> 'active') || '>' || (new_data ->> 'active') from public.audit_logs
            where correlation_id = 'c2000000-0000-4000-8000-0000000000a2' and entity = 'client_partner'),
  'true>false', 'O sócio retirado grava active de true para false (a linha continua)');

-- K3: só a mensalidade, sem motivo
select results_eq(
  $$select entity, action, count(*)::int from public.audit_logs where correlation_id = 'c2000000-0000-4000-8000-0000000000a3' group by 1, 2$$,
  $$values ('client'::text, 'UPDATE'::text, 1)$$,
  'save_client (só a mensalidade): um UPDATE do cliente e nenhum evento');
select is((select count(*) from public.audit_logs where correlation_id = 'c2000000-0000-4000-8000-0000000000a3' and reason is not null),
  0::bigint, 'save_client sem motivo: reason nulo e a ação conclui (RAT-D021)');

-- K4: aviso de nome repetido confirmado
select results_eq(
  $$select entity, action, kind::text, count(*)::int from public.audit_logs
     where correlation_id = 'c2000000-0000-4000-8000-0000000000a4' group by 1, 2, 3 order by 1, 2$$,
  $$values ('client'::text, 'CREATE'::text, 'ROW_CHANGE'::text, 1), ('client', 'DUPLICATE_WARNING_ACK', 'EVENT', 1),
           ('client', 'PARTNERS_CHANGE', 'EVENT', 1), ('client_partner', 'CREATE', 'ROW_CHANGE', 1)$$,
  'save_client (aviso confirmado): CREATE, indicação, PARTNERS_CHANGE e DUPLICATE_WARNING_ACK');
select is((select new_data -> 'matches' from public.audit_logs where correlation_id = 'c2000000-0000-4000-8000-0000000000a4' and action = 'DUPLICATE_WARNING_ACK'),
  (select to_jsonb(array[entity_id]) from public.audit_logs where correlation_id = 'c2000000-0000-4000-8000-0000000000a1' and entity = 'client' and action = 'CREATE'),
  'DUPLICATE_WARNING_ACK guarda os ids dos parecidos confirmados');
select is((select count(*) from public.audit_logs where correlation_id = 'c2000000-0000-4000-8000-0000000000a4' and reason is distinct from 'Filial com o mesmo nome'),
  0::bigint, 'Aviso confirmado: o motivo vai para todas as linhas');

-- K5 e K6: inativar e reativar
select results_eq(
  $$select action, previous_data::text, new_data::text, reason from public.audit_logs
     where correlation_id = 'c2000000-0000-4000-8000-0000000000a5'$$,
  $$values ('UPDATE'::text, '{"active": true}'::text, '{"active": false}'::text, 'Cliente encerrou'::text)$$,
  'set_client_active (inativar): um UPDATE só com a coluna active, com motivo');
select results_eq(
  $$select action, previous_data::text, new_data::text, reason from public.audit_logs
     where correlation_id = 'c2000000-0000-4000-8000-0000000000a6'$$,
  $$values ('UPDATE'::text, '{"active": false}'::text, '{"active": true}'::text, null::text)$$,
  'set_client_active (reativar sem motivo): um UPDATE só com active e reason nulo');

-- Operador negado: nada gravado
select is((select count(*) from public.audit_logs where correlation_id = 'c2000000-0000-4000-8000-0000000000f9'),
  0::bigint, 'Chamada negada não deixa linha de auditoria');
select is((select count(*) from public.partners where name = 'Sócio Aud Negado'), 0::bigint, 'Chamada negada não cria o sócio');
select is((select count(*) from public.audit_logs where correlation_id = 'c2000000-0000-4000-8000-0000000000f8'), 0::bigint,
  'save_client negado não deixa linha de auditoria');
select is((select count(*) from public.clients where legal_name = 'Cliente Aud Negado'), 0::bigint, 'save_client negado não cria o cliente');

select is(
  (select count(*) from pg_trigger t
    where t.tgfoid in ('private.assert_client_has_partner'::regproc) and t.tgisinternal = false
      and t.tgconstraint <> 0 and t.tgdeferrable and t.tginitdeferred),
  2::bigint, 'I-01: dois constraint triggers diferidos (clients e client_partners)');

select * from finish();
rollback;
