-- =============================================================================
-- pgTAP · CAD-001 · Clientes, apelidos e indicações (nível de tabela)
-- Constraints do cliente, mensalidade em numeric(14,2), documento único (I-07, I-08),
-- apelidos (I-09, I-10), indicações (I-02 a, I-03), cliente ativo com sócio (I-01, diferido)
-- e bloqueio de DELETE/TRUNCATE (I-14). Tudo inserido como postgres, sem as RPCs.
-- A segunda metade do arquivo (a partir de "FUNÇÕES DE CLIENTE") testa as funções da migration 0400 como Administrador.
-- Rastreio: RAT-D015, RAT-D024, RAT-D025 · I-01, I-02, I-03, I-07 a I-10, I-13, I-14 · CA-10.
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(305);

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

-- Executa um comando e força a checagem dos constraint triggers diferidos (I-01), como o COMMIT faria.
-- Devolve "sqlstate|hint" do erro, ou 'ok'. O erro desfaz o comando (subtransação).
create function pg_temp.i01_of(p_sql text) returns text
language plpgsql as $$
declare v_state text; v_hint text;
begin
  execute p_sql;
  set constraints all immediate;
  set constraints all deferred;
  return 'ok';
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint;
  return v_state || '|' || coalesce(v_hint, '');
end;
$$;

-- -----------------------------------------------------------------------------
-- Fixtures (como postgres; nomes fictícios, RAT-D019; CNPJ de teste do algoritmo)
-- Sócios A, B, C ativos; D inativo; E ativo (usado para a reativação de indicação).
-- Cliente ativo e suas indicações entram na mesma transação (I-01 só confere no COMMIT).
-- -----------------------------------------------------------------------------
insert into public.partners (id, name, active) values
  ('f2000000-0000-4000-8000-000000000001', 'Sócio Teste A', true),
  ('f2000000-0000-4000-8000-000000000002', 'Sócio Teste B', true),
  ('f2000000-0000-4000-8000-000000000003', 'Sócio Teste C', true),
  ('f2000000-0000-4000-8000-000000000004', 'Sócio Teste D', false),
  ('f2000000-0000-4000-8000-000000000005', 'Sócio Teste E', true);

select lives_ok(
  $$insert into public.clients (id, legal_name, trade_name, document, default_monthly_value, active) values
      ('f6000000-0000-4000-8000-000000000001', 'Cliente Modelo Teste Ltda', 'Modelo Fantasia', 'ZZ0TESTE000100', 1500.00, true),
      ('f6000000-0000-4000-8000-000000000002', 'Comércio Teste Ltda',       null,              'ZZ0TESTE000282',  900.00, true),
      ('f6000000-0000-4000-8000-000000000003', 'Pessoa Teste',              null,              null,              350.00, true),
      ('f6000000-0000-4000-8000-000000000004', 'Cliente Antigo Teste Ltda', null,              null,                1.00, false),
      ('f6000000-0000-4000-8000-000000000005', 'Cliente Inativo Doc Teste', null,              '99999999000191',   10.00, false);
    insert into public.client_partners (client_id, partner_id) values
      ('f6000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001'),
      ('f6000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000002'),
      ('f6000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000001'),
      ('f6000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000002'),
      ('f6000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000003'),
      ('f6000000-0000-4000-8000-000000000003', 'f2000000-0000-4000-8000-000000000003')$$,
  'Fixtures: clientes ativos e inativos, com as indicações na mesma transação');

-- -----------------------------------------------------------------------------
-- Mensalidade (I-13): numeric(14,2), > 0, sem float
-- -----------------------------------------------------------------------------
select is((select default_monthly_value::text from public.clients where id = 'f6000000-0000-4000-8000-000000000001'),
  '1500.00', 'Mensalidade lida como texto: "1500.00" (sem float)');
select is((select format_type(a.atttypid, a.atttypmod) from pg_attribute a
            where a.attrelid = 'public.clients'::regclass and a.attname = 'default_monthly_value'),
  'numeric(14,2)', 'default_monthly_value é numeric(14,2)');
select lives_ok(
  $$insert into public.clients (id, legal_name, default_monthly_value, active)
    values ('f6000000-0000-4000-8000-0000000000a1', 'Cliente Valor Exato', 1234.56, false)$$,
  'Mensalidade 1234.56 entra');
select is((select default_monthly_value::text from public.clients where id = 'f6000000-0000-4000-8000-0000000000a1'),
  '1234.56', 'A mensalidade grava exatamente 1234.56 (CA-10)');
select lives_ok(
  $$insert into public.clients (legal_name, default_monthly_value, active) values ('Cliente Teto Teste', 999999999999.99, false)$$,
  'Mensalidade no teto técnico do tipo (999999999999.99) entra');
select throws_ok(
  $$insert into public.clients (legal_name, default_monthly_value, active) values ('Cliente Acima Teto', 1000000000000.00, false)$$,
  '22003', null, 'Mensalidade acima do teto técnico estoura o tipo (22003)');
select throws_ok(
  $$insert into public.clients (legal_name, default_monthly_value, active) values ('Cliente Zero', 0, false)$$,
  '23514', null, 'Mensalidade zero é recusada');
select throws_ok(
  $$insert into public.clients (legal_name, default_monthly_value, active) values ('Cliente Negativo', -1, false)$$,
  '23514', null, 'Mensalidade negativa é recusada');
select throws_ok(
  $$insert into public.clients (legal_name, default_monthly_value, active) values ('Cliente Quase Zero', 0.004, false)$$,
  '23514', null, 'Valor que arredonda para zero é recusado (a conversão estrita por to_money fica nas RPCs)');
select throws_ok(
  $$insert into public.clients (legal_name, default_monthly_value, active) values ('Cliente Sem Valor', null, false)$$,
  '23502', null, 'Mensalidade é obrigatória');

-- -----------------------------------------------------------------------------
-- Nomes, observações, colunas geradas
-- -----------------------------------------------------------------------------
select throws_ok(
  $$insert into public.clients (legal_name, default_monthly_value, active) values (' . ', 10, false)$$,
  '23514', null, 'Razão social vazia depois de normalizar é recusada');
select throws_ok(
  $$insert into public.clients (legal_name, default_monthly_value, active) values (repeat('a', 201), 10, false)$$,
  '23514', null, 'Razão social acima de 200 caracteres é recusada');
select throws_ok(
  $$insert into public.clients (legal_name, trade_name, default_monthly_value, active) values ('Cliente Fantasia Vazia', '', 10, false)$$,
  '23514', null, 'Nome fantasia vazio é recusado (opcional é NULL)');
select throws_ok(
  $$insert into public.clients (legal_name, notes, default_monthly_value, active) values ('Cliente Obs Vazia', '', 10, false)$$,
  '23514', null, 'Observação vazia é recusada (opcional é NULL)');
select throws_ok(
  $$insert into public.clients (legal_name, notes, default_monthly_value, active) values ('Cliente Obs Longa', repeat('a', 2001), 10, false)$$,
  '23514', null, 'Observação acima de 2000 caracteres é recusada');
select lives_ok(
  $$insert into public.clients (legal_name, notes, default_monthly_value, active) values ('Cliente Obs Limite', repeat('a', 2000), 10, false)$$,
  'Observação com 2000 caracteres entra');
select results_eq(
  $$select normalized_name, normalized_trade_name, document_type
      from public.clients where id = 'f6000000-0000-4000-8000-000000000001'$$,
  $$values ('cliente modelo teste ltda'::text, 'modelo fantasia'::text, 'CNPJ'::text)$$,
  'Colunas geradas do cliente: nome, nome fantasia e tipo do documento');
select is((select normalized_trade_name from public.clients where id = 'f6000000-0000-4000-8000-000000000002'), null,
  'Sem nome fantasia, normalized_trade_name é NULL');
select is((select count(*) from public.clients where normalized_name = 'comercio teste ltda'), 1::bigint,
  'O nome do cliente não é único por regra (R-C06), mas aqui só há um');
select lives_ok(
  $$insert into public.clients (legal_name, default_monthly_value, active) values ('Comercio Teste Ltda.', 10, false)$$,
  'Nome repetido por grafia é aceito no banco (só aviso na RPC, R-C15)');
select is(pg_temp.err_of($$update public.clients set id = gen_random_uuid() where id = 'f6000000-0000-4000-8000-000000000004'$$),
  'P0001|IMMUTABLE_FIELD', 'clients: id é imutável');

-- -----------------------------------------------------------------------------
-- Documento único entre ativos e inativos (I-07)
-- -----------------------------------------------------------------------------
select is(pg_temp.err_of($$insert into public.clients (legal_name, document, default_monthly_value, active)
                           values ('Outro Cliente Doc', 'ZZ0TESTE000100', 10, false)$$),
  '23505|DOCUMENT_TAKEN', 'Documento de outro cliente ATIVO -> DOCUMENT_TAKEN');
select is(pg_temp.detail_of($$insert into public.clients (legal_name, document, default_monthly_value, active)
                              values ('Outro Cliente Doc', 'ZZ0TESTE000100', 10, false)$$) #>> '{owner,name}',
  'Cliente Modelo Teste Ltda', 'O detail traz o nome do cliente dono');
select is((pg_temp.detail_of($$insert into public.clients (legal_name, document, default_monthly_value, active)
                               values ('Outro Cliente Doc', '99999999000191', 10, false)$$) #>> '{owner,active}')::boolean,
  false, 'Documento de cliente INATIVO também bloqueia, e o detail mostra a situação (U-C02)');
select is(pg_temp.err_of($$update public.clients set document = 'ZZ0TESTE000100' where id = 'f6000000-0000-4000-8000-000000000003'$$),
  '23505|DOCUMENT_TAKEN', 'Trocar o documento para o de outro cliente -> DOCUMENT_TAKEN');
select is(pg_temp.err_of($$update public.clients set document = '00000000272' where id = 'f6000000-0000-4000-8000-000000000003'$$),
  'ok', 'Documento livre pode ser acrescentado a um cliente sem documento');
select is(pg_temp.err_of($$update public.clients set document = null where id = 'f6000000-0000-4000-8000-000000000003'$$),
  'ok', 'Documento pode voltar a NULL (é opcional)');
select is(pg_temp.err_of($$update public.clients set notes = 'x' where id = 'f6000000-0000-4000-8000-000000000001'$$),
  'ok', 'Editar outro campo de cliente com documento não reexamina o documento');

-- -----------------------------------------------------------------------------
-- Apelidos do cliente (I-08, I-09, I-10)
-- -----------------------------------------------------------------------------
select lives_ok(
  $$insert into public.client_aliases (id, client_id, alias_type, alias) values
      ('f7000000-0000-4000-8000-000000000001', 'f6000000-0000-4000-8000-000000000001', 'NAME', 'Modelo'),
      ('f7000000-0000-4000-8000-000000000002', 'f6000000-0000-4000-8000-000000000001', 'DOCUMENT', '000.000.001-91')$$,
  'Apelido NAME e apelido DOCUMENT (CPF com máscara) entram');
select results_eq(
  $$select normalized_value from public.client_aliases where id::text like 'f7000000-%' order by id$$,
  $$values ('modelo'), ('00000000191')$$,
  'normalized_value: nome por normalize_alias, documento canônico');
select is(pg_temp.err_of($$insert into public.client_aliases (client_id, alias_type, alias)
                           values ('f6000000-0000-4000-8000-000000000002', 'NAME', 'MODELO!')$$),
  '23505|ALIAS_TAKEN', 'Apelido NAME ativo de outro cliente -> ALIAS_TAKEN');
select is(pg_temp.detail_of($$insert into public.client_aliases (client_id, alias_type, alias)
                              values ('f6000000-0000-4000-8000-000000000002', 'NAME', 'MODELO!')$$) #>> '{owner,id}',
  'f6000000-0000-4000-8000-000000000001', 'O detail do apelido repetido traz o cliente dono');
select is(pg_temp.err_of($$insert into public.client_aliases (client_id, alias_type, alias)
                           values ('f6000000-0000-4000-8000-000000000002', 'DOCUMENT', '00000000191')$$),
  '23505|ALIAS_TAKEN', 'Apelido DOCUMENT ativo repetido em outro cliente -> ALIAS_TAKEN');
select is(pg_temp.err_of($$insert into public.client_aliases (client_id, alias_type, alias)
                           values ('f6000000-0000-4000-8000-000000000002', 'DOCUMENT', '99.999.999/0001-91')$$),
  '23505|DOCUMENT_TAKEN', 'Apelido DOCUMENT igual ao documento de outro cliente (inativo) -> DOCUMENT_TAKEN');
select is(pg_temp.detail_of($$insert into public.client_aliases (client_id, alias_type, alias)
                              values ('f6000000-0000-4000-8000-000000000002', 'DOCUMENT', '99.999.999/0001-91')$$) ->> 'field',
  'aliases', 'O detail diz que o texto veio do campo de apelidos');
select is(pg_temp.err_of($$insert into public.clients (legal_name, document, default_monthly_value, active)
                           values ('Cliente Doc Apelido', '00000000191', 10, false)$$),
  '23505|DOCUMENT_TAKEN', 'Documento de cliente igual ao apelido DOCUMENT ativo de outro cliente -> DOCUMENT_TAKEN');
select is(pg_temp.err_of($$insert into public.client_aliases (client_id, alias_type, alias)
                           values ('f6000000-0000-4000-8000-000000000001', 'DOCUMENT', 'zz0teste000100')$$),
  'ok', 'Apelido DOCUMENT igual ao documento do PRÓPRIO cliente é aceito');
select is(pg_temp.err_of($$insert into public.client_aliases (client_id, alias_type, alias)
                           values ('f6000000-0000-4000-8000-000000000001', 'DOCUMENT', '00000000192')$$),
  '22023|INVALID_DOCUMENT', 'Apelido DOCUMENT com DV inválido -> INVALID_DOCUMENT');
select is(pg_temp.err_of($$insert into public.client_aliases (client_id, alias_type, alias)
                           values ('f6000000-0000-4000-8000-000000000001', 'NAME', ' . ')$$),
  '22023|NAME_REQUIRED', 'Apelido NAME vazio -> NAME_REQUIRED');
select is(pg_temp.err_of($$insert into public.client_aliases (client_id, alias_type, alias)
                           values ('f6000000-0000-4000-8000-000000000001', 'NAME', repeat('a', 201))$$),
  '22023|NAME_TOO_LONG', 'Apelido NAME acima de 200 caracteres -> NAME_TOO_LONG');
select is(pg_temp.err_of($$insert into public.client_aliases (client_id, alias_type, alias, normalized_value)
                           values ('f6000000-0000-4000-8000-000000000003', 'NAME', 'Pessoa Apelido', 'forjado')$$),
  'ok', 'normalized_value enviado pelo cliente não causa erro');
select is((select normalized_value from public.client_aliases where alias = 'Pessoa Apelido'),
  'pessoa apelido', '... e é ignorado (o trigger recalcula)');

-- Inativo não bloqueia; reativar conflitando bloqueia
update public.client_aliases set active = false where id = 'f7000000-0000-4000-8000-000000000001';
select is(pg_temp.err_of($$insert into public.client_aliases (id, client_id, alias_type, alias)
                           values ('f7000000-0000-4000-8000-000000000003', 'f6000000-0000-4000-8000-000000000002', 'NAME', 'Modelo')$$),
  'ok', 'Apelido inativo de outro cliente não bloqueia o mesmo texto');
select is(pg_temp.err_of($$update public.client_aliases set active = true where id = 'f7000000-0000-4000-8000-000000000001'$$),
  '23505|ALIAS_TAKEN', 'Reativar apelido cujo texto agora é de outro cliente -> ALIAS_TAKEN');
select is(pg_temp.err_of($$update public.client_aliases set alias = 'Outro' where id = 'f7000000-0000-4000-8000-000000000003'$$),
  'P0001|IMMUTABLE_FIELD', 'Apelido do cliente: o texto não muda (I-10)');
select is(pg_temp.err_of($$update public.client_aliases set alias_type = 'DOCUMENT' where id = 'f7000000-0000-4000-8000-000000000003'$$),
  'P0001|IMMUTABLE_FIELD', 'Apelido do cliente: o tipo não muda (I-10)');
select is(pg_temp.err_of($$update public.client_aliases set client_id = 'f6000000-0000-4000-8000-000000000001' where id = 'f7000000-0000-4000-8000-000000000003'$$),
  'P0001|IMMUTABLE_FIELD', 'Apelido do cliente: o dono não muda (I-10)');
select is(pg_temp.err_of($$update public.client_aliases set active = false where id = 'f7000000-0000-4000-8000-000000000003'$$),
  'ok', 'Apelido do cliente: "active" muda');

-- -----------------------------------------------------------------------------
-- Indicações (I-02 a, I-03) e divisão 1/n (RAT-D015)
-- -----------------------------------------------------------------------------
select is((select count(*) from public.client_partners where client_id = 'f6000000-0000-4000-8000-000000000002' and active),
  3::bigint, 'n = número de indicações ativas do cliente (3 sócios => 1/3 na tela)');
select throws_ok(
  $$insert into public.client_partners (client_id, partner_id) values ('f6000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001')$$,
  '23505', null, 'Uma linha por par (cliente, sócio): repetir é recusado (I-03)');
select is(pg_temp.err_of($$insert into public.client_partners (client_id, partner_id)
                           values ('f6000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000004')$$),
  'P0001|PARTNER_INACTIVE', 'Indicar sócio inativo -> PARTNER_INACTIVE (I-02 a)');
select is(pg_temp.detail_of($$insert into public.client_partners (client_id, partner_id)
                              values ('f6000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000004')$$) #>> '{partners,0,name}',
  'Sócio Teste D', 'O detail de PARTNER_INACTIVE traz o nome do sócio');
select throws_ok(
  $$insert into public.client_partners (client_id, partner_id) values (gen_random_uuid(), 'f2000000-0000-4000-8000-000000000001')$$,
  '23503', null, 'Indicação de cliente inexistente é recusada (FK)');
select is(pg_temp.err_of($$update public.client_partners set partner_id = 'f2000000-0000-4000-8000-000000000005'
                            where client_id = 'f6000000-0000-4000-8000-000000000001' and partner_id = 'f2000000-0000-4000-8000-000000000001'$$),
  'P0001|IMMUTABLE_FIELD', 'Indicação: o sócio não muda (I-03)');
select is(pg_temp.err_of($$update public.client_partners set client_id = 'f6000000-0000-4000-8000-000000000003'
                            where client_id = 'f6000000-0000-4000-8000-000000000001' and partner_id = 'f2000000-0000-4000-8000-000000000001'$$),
  'P0001|IMMUTABLE_FIELD', 'Indicação: o cliente não muda (I-03)');

-- Retirar e reindicar reativa a MESMA linha
select is(pg_temp.i01_of($$update public.client_partners set active = false
                            where client_id = 'f6000000-0000-4000-8000-000000000001' and partner_id = 'f2000000-0000-4000-8000-000000000001'$$),
  'ok', 'Retirar um dos dois sócios do cliente ativo é aceito');
select is(pg_temp.i01_of($$update public.client_partners set active = true
                            where client_id = 'f6000000-0000-4000-8000-000000000001' and partner_id = 'f2000000-0000-4000-8000-000000000001'$$),
  'ok', 'Reindicar reativa a linha existente');
select is((select count(*) from public.client_partners where client_id = 'f6000000-0000-4000-8000-000000000001'),
  2::bigint, '... sem criar linha nova (o histórico fica em audit_logs)');

-- Sócio com indicação inativa não bloqueia a inativação; e a reativação da linha exige sócio ativo
insert into public.client_partners (client_id, partner_id, active)
values ('f6000000-0000-4000-8000-000000000004', 'f2000000-0000-4000-8000-000000000005', true);
update public.client_partners set active = false
 where client_id = 'f6000000-0000-4000-8000-000000000004' and partner_id = 'f2000000-0000-4000-8000-000000000005';
update public.partners set active = false where id = 'f2000000-0000-4000-8000-000000000005';
select is(pg_temp.err_of($$update public.client_partners set active = true
                            where client_id = 'f6000000-0000-4000-8000-000000000004' and partner_id = 'f2000000-0000-4000-8000-000000000005'$$),
  'P0001|PARTNER_INACTIVE', 'Reativar indicação de sócio inativo -> PARTNER_INACTIVE');

-- -----------------------------------------------------------------------------
-- I-01: cliente ativo tem ao menos uma indicação ativa (diferido; forçado com SET CONSTRAINTS)
-- -----------------------------------------------------------------------------
select is(pg_temp.i01_of($$insert into public.clients (legal_name, default_monthly_value) values ('Cliente Sem Sócio Teste', 10)$$),
  '23514|CLIENT_WITHOUT_PARTNER', 'Cliente ativo novo sem indicação é recusado (no COMMIT)');
select is(pg_temp.i01_of($$with c as (insert into public.clients (id, legal_name, default_monthly_value)
                                      values ('f6000000-0000-4000-8000-0000000000c1', 'Cliente Com Sócio Teste', 10) returning id)
                           insert into public.client_partners (client_id, partner_id)
                           select id, 'f2000000-0000-4000-8000-000000000001' from c$$),
  'ok', 'Cliente ativo novo com indicação na mesma transação é aceito');
select is(pg_temp.i01_of($$update public.client_partners set active = false
                            where client_id = 'f6000000-0000-4000-8000-000000000003'$$),
  '23514|CLIENT_WITHOUT_PARTNER', 'Retirar o ÚLTIMO sócio de cliente ativo é recusado');
select is(pg_temp.i01_of($$update public.client_partners set active = false
                            where client_id = 'f6000000-0000-4000-8000-000000000002'$$),
  '23514|CLIENT_WITHOUT_PARTNER', 'Retirar todos os sócios de uma vez também é recusado');
select is(pg_temp.i01_of($$update public.client_partners set active = false
                            where client_id = 'f6000000-0000-4000-8000-000000000002' and partner_id <> 'f2000000-0000-4000-8000-000000000003'$$),
  'ok', 'Retirar dois de três sócios deixa o cliente com um e é aceito');
select is(pg_temp.i01_of($$update public.client_partners set active = false
                            where client_id = 'f6000000-0000-4000-8000-000000000002' and partner_id = 'f2000000-0000-4000-8000-000000000003'$$),
  '23514|CLIENT_WITHOUT_PARTNER', 'Retirar o último sócio que sobrou é recusado');
select is(pg_temp.i01_of($$update public.clients set active = true where id = 'f6000000-0000-4000-8000-000000000005'$$),
  '23514|CLIENT_WITHOUT_PARTNER', 'Reativar cliente sem indicação ativa é recusado');
select is(pg_temp.i01_of($$insert into public.client_partners (client_id, partner_id)
                           values ('f6000000-0000-4000-8000-000000000005', 'f2000000-0000-4000-8000-000000000001');
                           update public.clients set active = true where id = 'f6000000-0000-4000-8000-000000000005'$$),
  'ok', 'Reativar cliente depois de indicar um sócio ativo é aceito');
select is(pg_temp.i01_of($$update public.clients set active = false where id = 'f6000000-0000-4000-8000-000000000005'$$),
  'ok', 'Inativar cliente é sempre aceito (as indicações continuam ativas)');
select is((select count(*) from public.client_partners where client_id = 'f6000000-0000-4000-8000-000000000005' and active),
  1::bigint, '... e as indicações do cliente inativo continuam ativas');
select is(pg_temp.i01_of($$update public.client_partners set active = false where client_id = 'f6000000-0000-4000-8000-000000000005'$$),
  'ok', 'Cliente INATIVO pode ficar sem indicação ativa');

-- O estado final está consistente: todo cliente ativo tem sócio ativo.
select is(
  (select count(*) from public.clients c
    where c.active and not exists (select 1 from public.client_partners cp where cp.client_id = c.id and cp.active)),
  0::bigint, 'Nenhum cliente ativo sem indicação ativa ao fim dos testes');
select is(
  (select count(*) from public.client_partners cp join public.partners p on p.id = cp.partner_id
    where cp.active and not p.active),
  0::bigint, 'Nenhuma indicação ativa aponta para sócio inativo');

-- -----------------------------------------------------------------------------
-- DELETE e TRUNCATE (I-14): bloqueados até para postgres
-- -----------------------------------------------------------------------------
select throws_ok($$delete from public.clients$$,         '42501', null, 'DELETE em clients é recusado');
select throws_ok($$delete from public.client_aliases$$,  '42501', null, 'DELETE em client_aliases é recusado');
select throws_ok($$delete from public.client_partners$$, '42501', null, 'DELETE em client_partners é recusado');
select throws_ok($$truncate public.clients cascade$$,         '42501', null, 'TRUNCATE em clients é recusado');
select throws_ok($$truncate public.client_aliases cascade$$,  '42501', null, 'TRUNCATE em client_aliases é recusado');
select throws_ok($$truncate public.client_partners cascade$$, '42501', null, 'TRUNCATE em client_partners é recusado');

-- -----------------------------------------------------------------------------
-- RAT-D015 e RAT-D010 nas tabelas novas
-- -----------------------------------------------------------------------------
select is(
  (select coalesce(string_agg(c.relname || '.' || a.attname, ', '), '')
     from pg_attribute a join pg_class c on c.oid = a.attrelid
    where c.oid in ('public.clients'::regclass, 'public.client_partners'::regclass, 'public.client_aliases'::regclass,
                    'public.receivers'::regclass, 'public.receiver_identifiers'::regclass, 'public.partner_aliases'::regclass)
      and a.attnum > 0 and not a.attisdropped
      and (a.attname ~* '(percent|pct|weight|peso|share|organization|vigenc|valid_from|valid_to|effective)')),
  '', 'Nenhuma coluna de percentual, peso, vigência ou organization_id nas tabelas novas');


-- =============================================================================
-- FUNÇÕES DE CLIENTE (migration 0400) · como Administrador, pelas funções públicas
-- save_client, set_client_active e search_clients (modelagem 6.4.5 a 6.4.7, 11.4, 11.5)
-- Fixtures próprios (prefixo "Rpc"); "aged" = updated_at antigo, para provar quando a versão muda
-- (dentro da transação do pgTAP, now() não avança).
-- Os papéis negados estão em 10; a auditoria das funções, em 11.
-- =============================================================================
insert into auth.users (id, email) values ('e1000000-0000-4000-8000-000000000001', 'pgtap-admin-cli@example.com');
select private.set_user_access('pgtap-admin-cli@example.com', 'ADMINISTRATOR', null, true, 'fixture de teste', 'pgtap');

create function pg_temp.pid(p text) returns uuid language sql as $$ select id from public.partners where name = p $$;
create function pg_temp.cid(p text) returns uuid language sql as $$ select id from public.clients where legal_name = p $$;
create function pg_temp.cv(p text) returns timestamptz language sql as $$ select updated_at from public.clients where legal_name = p $$;
create function pg_temp.ppv(p text) returns timestamptz language sql as $$ select updated_at from public.partners where name = p $$;

-- Atalho para public.save_client (só para encurtar as chamadas).
create function pg_temp.sc(
  p_id uuid, p_name text, p_doc text, p_amount text, p_partners uuid[],
  p_aliases jsonb default '[]'::jsonb, p_ver timestamptz default null, p_ack uuid[] default null,
  p_reason text default null, p_corr uuid default null, p_trade text default null, p_notes text default null
) returns setof public.clients language sql as $$
  select * from public.save_client(p_id, p_name, p_trade, p_doc, p_amount, p_notes, p_partners, p_aliases, p_ver, p_ack, p_reason, p_corr)
$$;

insert into public.partners (id, name, active) values
  ('e2000000-0000-4000-8000-000000000001', 'Sócio Rpc A', true),
  ('e2000000-0000-4000-8000-000000000002', 'Sócio Rpc B', true),
  ('e2000000-0000-4000-8000-000000000003', 'Sócio Rpc C', true),
  ('e2000000-0000-4000-8000-000000000004', 'Sócio Rpc Z', false);
insert into public.clients (id, legal_name, trade_name, document, default_monthly_value, active, updated_at) values
  ('e6000000-0000-4000-8000-000000000001', 'Cliente Rpc Antigo',            null,                null,             500.00, true,  '2020-01-01 00:00:00+00'),
  ('e6000000-0000-4000-8000-000000000002', 'Cliente Rpc Dois',              null,                'ZZ0TESTE000363', 700.00, true,  '2020-01-01 00:00:00+00'),
  ('e6000000-0000-4000-8000-000000000003', 'Cliente Rpc Inativo',           null,                '10000000957',    300.00, false, '2020-01-01 00:00:00+00'),
  ('e6000000-0000-4000-8000-000000000004', 'Cliente Rpc Inativo Indicado',  null,                null,             200.00, false, '2020-01-01 00:00:00+00'),
  ('e6000000-0000-4000-8000-000000000005', 'Cliente Rpc Homônimo Ltda',     'Rpc Fantasia Ltda', null,             100.00, true,  '2020-01-01 00:00:00+00'),
  ('e6000000-0000-4000-8000-000000000006', 'Cliente Rpc Homônimo Ltda',     null,                null,             100.00, false, '2020-01-01 00:00:00+00');
insert into public.client_partners (client_id, partner_id, active) values
  ('e6000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', true),
  ('e6000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', true),
  ('e6000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000002', true),
  ('e6000000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-000000000001', false),
  ('e6000000-0000-4000-8000-000000000005', 'e2000000-0000-4000-8000-000000000001', true);
insert into public.client_aliases (client_id, alias_type, alias) values
  ('e6000000-0000-4000-8000-000000000002', 'NAME', 'Rpc Dois Apelido');
select private.set_audit_context(null, null, null, null);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- -----------------------------------------------------------------------------
-- save_client: criação completa
-- -----------------------------------------------------------------------------
select is((select legal_name from pg_temp.sc(null, '  Cliente Rpc Novo  ', '12.ABC.345/01DE-35', '1234.56',
    array[pg_temp.pid('Sócio Rpc A'), pg_temp.pid('Sócio Rpc B'), pg_temp.pid('Sócio Rpc A')],
    '[{"type":"NAME","value":"Rpc Novo Apelido"},{"type":"DOCUMENT","value":"000.000.002-72"},{"type":"NAME","value":"RPC NOVO APELIDO."}]'::jsonb,
    null, null, null, 'c3000000-0000-4000-8000-000000000001', ' Fantasia Rpc Nova ', '  Observação de teste  ')),
  'Cliente Rpc Novo', 'save_client cria o cliente (nome sem as bordas em branco)');
select results_eq(
  $$select trade_name, document, document_type, default_monthly_value::text, notes, active
      from public.clients where legal_name = 'Cliente Rpc Novo'$$,
  $$values ('Fantasia Rpc Nova'::text, '12ABC34501DE35'::text, 'CNPJ'::text, '1234.56'::text, 'Observação de teste'::text, true)$$,
  'Cliente novo: documento canônico (CNPJ alfanumérico), tipo deduzido, mensalidade exata 1234.56 (CA-10) e nasce ativo');
select is((select count(*) from public.client_partners where client_id = pg_temp.cid('Cliente Rpc Novo')), 2::bigint,
  'Sócio repetido na lista vira uma linha só (2 sócios, 2 linhas)');
select set_eq(
  $$select normalized_value from public.client_aliases where client_id = pg_temp.cid('Cliente Rpc Novo') and active$$,
  $$values ('rpc novo apelido'::text), ('00000000272')$$,
  'Apelidos: repetido por valor normalizado vira um só; o apelido-documento fica canônico');
select is((select alias from public.client_aliases where client_id = pg_temp.cid('Cliente Rpc Novo') and alias_type = 'DOCUMENT'),
  '000.000.002-72', 'O apelido-documento guarda o texto como digitado');

-- Sem documento, CPF, documento só com pontuação, mensalidade pequena
select is((select count(*) from pg_temp.sc(null, 'Cliente Rpc Sem Doc', null, '0.10', array[pg_temp.pid('Sócio Rpc C')])), 1::bigint,
  'save_client sem documento e com mensalidade 0.10');
select results_eq(
  $$select document, document_type, default_monthly_value::text from public.clients where legal_name = 'Cliente Rpc Sem Doc'$$,
  $$values (null::text, null::text, '0.10'::text)$$,
  'Documento opcional: sem documento, sem tipo; 0.10 sai como texto');
select lives_ok($$select * from pg_temp.sc(null, 'Cliente Rpc Doc Em Branco', ' ./- ', '10', array[pg_temp.pid('Sócio Rpc C')])$$,
  'Documento só com pontuação equivale a sem documento');
select is((select document from public.clients where legal_name = 'Cliente Rpc Doc Em Branco'), null, '... e fica NULL');
select is((select document from pg_temp.sc(null, 'Cliente Rpc Cpf', '000.000.005-15', '10', array[pg_temp.pid('Sócio Rpc C')])),
  '00000000515', 'CPF com máscara: gravado canônico');
select is((select document_type from public.clients where legal_name = 'Cliente Rpc Cpf'), 'CPF', '... tipo CPF');
select is((select document from pg_temp.sc(null, 'Cliente Rpc Cnpj Numérico', '99.999.999/0002-72', '10', array[pg_temp.pid('Sócio Rpc C')])),
  '99999999000272', 'CNPJ numérico com máscara: gravado canônico');
select is((select document_type from public.clients where legal_name = 'Cliente Rpc Cnpj Numérico'), 'CNPJ', '... tipo CNPJ');
select is((select document from pg_temp.sc(null, 'Cliente Rpc Cnpj Minúsculo', 'zz0teste000444', '10', array[pg_temp.pid('Sócio Rpc C')])),
  'ZZ0TESTE000444', 'CNPJ alfanumérico em minúsculas: gravado em maiúsculas');

-- -----------------------------------------------------------------------------
-- save_client: documento inválido e repetido (U-C02)
-- -----------------------------------------------------------------------------
select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Doc Ruim', '00000000192', '10', array[pg_temp.pid('Sócio Rpc C')])$$),
  '22023|INVALID_DOCUMENT', 'CPF com DV inválido -> INVALID_DOCUMENT');
select is(pg_temp.detail_of($$select * from pg_temp.sc(null, 'Cliente Rpc Doc Ruim', '00000000192', '10', array[pg_temp.pid('Sócio Rpc C')])$$) ->> 'field',
  'document', 'O detail de INVALID_DOCUMENT diz que o campo é o documento');
select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Doc Ruim', 'ZZ0TESTE000101', '10', array[pg_temp.pid('Sócio Rpc C')])$$),
  '22023|INVALID_DOCUMENT', 'CNPJ alfanumérico com DV inválido -> INVALID_DOCUMENT');
select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Doc Ruim', 'ABC', '10', array[pg_temp.pid('Sócio Rpc C')])$$),
  '22023|INVALID_DOCUMENT', 'Documento fora do formato -> INVALID_DOCUMENT');
select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Doc Ruim', 'ÁZ0TESTE000100', '10', array[pg_temp.pid('Sócio Rpc C')])$$),
  '22023|INVALID_DOCUMENT', 'Documento com caractere fora de [0-9A-Z] -> INVALID_DOCUMENT');
select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Doc Ruim', '11111111111', '10', array[pg_temp.pid('Sócio Rpc C')])$$),
  '22023|INVALID_DOCUMENT', 'CPF de dígitos repetidos -> INVALID_DOCUMENT');

select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Doc Repetido', 'zz0teste000.363', '10', array[pg_temp.pid('Sócio Rpc C')])$$),
  '23505|DOCUMENT_TAKEN', 'Documento de outro cliente ATIVO (outra grafia) -> DOCUMENT_TAKEN');
select is(pg_temp.detail_of($$select * from pg_temp.sc(null, 'Cliente Rpc Doc Repetido', 'ZZ0TESTE000363', '10', array[pg_temp.pid('Sócio Rpc C')])$$) #>> '{owner,name}',
  'Cliente Rpc Dois', 'O detail traz o nome do cliente dono');
select is(pg_temp.detail_of($$select * from pg_temp.sc(null, 'Cliente Rpc Doc Repetido', 'ZZ0TESTE000363', '10', array[pg_temp.pid('Sócio Rpc C')])$$) #>> '{owner,id}',
  'e6000000-0000-4000-8000-000000000002', 'O detail traz o id do cliente dono');
select is(pg_temp.detail_of($$select * from pg_temp.sc(null, 'Cliente Rpc Doc Repetido', 'ZZ0TESTE000363', '10', array[pg_temp.pid('Sócio Rpc C')])$$) ->> 'field',
  'document', '... e o campo');
select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Doc Repetido', '100.000.009-57', '10', array[pg_temp.pid('Sócio Rpc C')])$$),
  '23505|DOCUMENT_TAKEN', 'Documento de cliente INATIVO também bloqueia');
select is((pg_temp.detail_of($$select * from pg_temp.sc(null, 'Cliente Rpc Doc Repetido', '10000000957', '10', array[pg_temp.pid('Sócio Rpc C')])$$) #>> '{owner,active}')::boolean,
  false, '... e o detail mostra que o dono está inativo');
select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Doc Repetido', '00000000272', '10', array[pg_temp.pid('Sócio Rpc C')])$$),
  '23505|DOCUMENT_TAKEN', 'Documento igual ao apelido-documento ATIVO de outro cliente -> DOCUMENT_TAKEN');
select is(pg_temp.err_of($$select * from pg_temp.sc(pg_temp.cid('Cliente Rpc Dois'), 'Cliente Rpc Dois', 'ZZ0TESTE000363', '700.00',
    array[pg_temp.pid('Sócio Rpc A'), pg_temp.pid('Sócio Rpc B')], '[{"type":"NAME","value":"Rpc Dois Apelido"}]'::jsonb, '2020-01-01 00:00:00+00')$$),
  'ok', 'Reenviar o próprio documento na edição não conflita');
select is((select count(*) from public.clients where legal_name = 'Cliente Rpc Doc Repetido'), 0::bigint,
  'Documento repetido: nada foi gravado');

-- Apelidos repetidos em outro cliente
select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Apelido Repetido', null, '10', array[pg_temp.pid('Sócio Rpc C')],
    '[{"type":"NAME","value":"RPC DOIS APELIDO!"}]'::jsonb)$$),
  '23505|ALIAS_TAKEN', 'Apelido NAME ativo de outro cliente -> ALIAS_TAKEN');
select is(pg_temp.detail_of($$select * from pg_temp.sc(null, 'Cliente Rpc Apelido Repetido', null, '10', array[pg_temp.pid('Sócio Rpc C')],
    '[{"type":"NAME","value":"RPC DOIS APELIDO!"}]'::jsonb)$$) #>> '{owner,name}',
  'Cliente Rpc Dois', '... com o dono no detail');
select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Apelido Repetido', null, '10', array[pg_temp.pid('Sócio Rpc C')],
    '[{"type":"DOCUMENT","value":"ZZ0TESTE000363"}]'::jsonb)$$),
  '23505|DOCUMENT_TAKEN', 'Apelido-documento igual ao documento de outro cliente -> DOCUMENT_TAKEN');
select is(pg_temp.detail_of($$select * from pg_temp.sc(null, 'Cliente Rpc Apelido Repetido', null, '10', array[pg_temp.pid('Sócio Rpc C')],
    '[{"type":"DOCUMENT","value":"ZZ0TESTE000363"}]'::jsonb)$$) ->> 'field',
  'aliases', '... com o campo "aliases" no detail');
select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Apelido Repetido', null, '10', array[pg_temp.pid('Sócio Rpc C')],
    '[{"type":"DOCUMENT","value":"000.000.002-72"}]'::jsonb)$$),
  '23505|ALIAS_TAKEN', 'Apelido-documento ativo de outro cliente -> ALIAS_TAKEN');
select is((select count(*) from public.clients where legal_name = 'Cliente Rpc Apelido Repetido'), 0::bigint,
  'Tudo ou nada: o conflito no apelido não deixa o cliente criado');

-- -----------------------------------------------------------------------------
-- save_client: mensalidade (INVALID_AMOUNT)
-- -----------------------------------------------------------------------------
select is(pg_temp.err_of(format($f$select * from pg_temp.sc(null, 'Cliente Rpc Valor', null, %L, array[pg_temp.pid('Sócio Rpc C')])$f$, v.amount)),
  '22023|INVALID_AMOUNT', 'Mensalidade ' || coalesce(v.amount, 'nula') || ' -> INVALID_AMOUNT')
  from (values ('0'), ('0.00'), ('-1'), (null), (''), ('abc'), ('1.234'), ('1,50'), ('1000000000000.00'), ('99999999999999999999')) v(amount);
select is(pg_temp.detail_of($$select * from pg_temp.sc(null, 'Cliente Rpc Valor', null, '0', array[pg_temp.pid('Sócio Rpc C')])$$) ->> 'field',
  'default_monthly_value', 'O detail de INVALID_AMOUNT diz o campo');
select is((select default_monthly_value::text from pg_temp.sc(null, 'Cliente Rpc Valor Teto', null, '999999999999.99', array[pg_temp.pid('Sócio Rpc C')])),
  '999999999999.99', 'Mensalidade no teto técnico do tipo é aceita');
select is((select default_monthly_value::text from pg_temp.sc(null, 'Cliente Rpc Valor Espaços', null, ' 25.5 ', array[pg_temp.pid('Sócio Rpc C')])),
  '25.50', 'Mensalidade com bordas em branco e uma casa: 25.50 (sem arredondar nem perder dado)');
select is((select count(*) from public.clients where legal_name = 'Cliente Rpc Valor'), 0::bigint,
  'Mensalidade inválida: nenhum cliente criado');

-- -----------------------------------------------------------------------------
-- save_client: nomes, observações, listas
-- -----------------------------------------------------------------------------
select is(pg_temp.err_of($$select * from pg_temp.sc(null, '   ', null, '10', array[pg_temp.pid('Sócio Rpc C')])$$), '22023|NAME_REQUIRED', 'Nome em branco -> NAME_REQUIRED');
select is(pg_temp.detail_of($$select * from pg_temp.sc(null, ' . ', null, '10', array[pg_temp.pid('Sócio Rpc C')])$$) ->> 'field', 'legal_name', 'Nome só com pontuação -> NAME_REQUIRED no campo legal_name');
select is(pg_temp.err_of($$select * from pg_temp.sc(null, null, null, '10', array[pg_temp.pid('Sócio Rpc C')])$$), '22023|NAME_REQUIRED', 'Nome nulo -> NAME_REQUIRED');
select is(pg_temp.err_of($$select * from pg_temp.sc(null, repeat('a', 201), null, '10', array[pg_temp.pid('Sócio Rpc C')])$$), '22023|NAME_TOO_LONG', 'Nome acima de 200 -> NAME_TOO_LONG');
select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Fantasia', null, '10', array[pg_temp.pid('Sócio Rpc C')], '[]'::jsonb, null, null, null, null, ' . ')$$),
  '22023|NAME_REQUIRED', 'Nome fantasia só com pontuação -> NAME_REQUIRED');
select is(pg_temp.detail_of($$select * from pg_temp.sc(null, 'Cliente Rpc Fantasia', null, '10', array[pg_temp.pid('Sócio Rpc C')], '[]'::jsonb, null, null, null, null, ' . ')$$) ->> 'field',
  'trade_name', '... no campo trade_name');
select is(pg_temp.err_of(format($f$select * from pg_temp.sc(null, 'Cliente Rpc Fantasia', null, '10', array[pg_temp.pid('Sócio Rpc C')], '[]'::jsonb, null, null, null, null, %L)$f$, repeat('a', 201))),
  '22023|NAME_TOO_LONG', 'Nome fantasia acima de 200 -> NAME_TOO_LONG');
select is(pg_temp.err_of(format($f$select * from pg_temp.sc(null, 'Cliente Rpc Obs', null, '10', array[pg_temp.pid('Sócio Rpc C')], '[]'::jsonb, null, null, null, null, null, %L)$f$, repeat('a', 2001))),
  '22023|NOTES_TOO_LONG', 'Observações acima de 2000 -> NOTES_TOO_LONG');
select lives_ok(format($f$select * from pg_temp.sc(null, 'Cliente Rpc Obs Limite', null, '10', array[pg_temp.pid('Sócio Rpc C')], '[]'::jsonb, null, null, null, null, null, %L)$f$, repeat('a', 2000)),
  'Observações com 2000 caracteres são aceitas');
select lives_ok($$select * from pg_temp.sc(null, 'Cliente Rpc Brancos', null, '10', array[pg_temp.pid('Sócio Rpc C')], '[]'::jsonb, null, null, null, null, '   ', E' 	
 ')$$,
  'Nome fantasia e observações em branco são aceitos');
select results_eq(
  $$select trade_name, notes from public.clients where legal_name = 'Cliente Rpc Brancos'$$,
  $$values (null::text, null::text)$$,
  '... e viram NULL');

select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Lista', null, '10', null)$$), '22023|LIST_REQUIRED', 'Lista de sócios nula -> LIST_REQUIRED');
select is(pg_temp.detail_of($$select * from pg_temp.sc(null, 'Cliente Rpc Lista', null, '10', null)$$) ->> 'field', 'partner_ids', '... no campo partner_ids');
select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Lista', null, '10', array[pg_temp.pid('Sócio Rpc C')], null)$$), '22023|LIST_REQUIRED', 'Lista de apelidos nula -> LIST_REQUIRED');
select is(pg_temp.detail_of($$select * from pg_temp.sc(null, 'Cliente Rpc Lista', null, '10', array[pg_temp.pid('Sócio Rpc C')], null)$$) ->> 'field', 'aliases', '... no campo aliases');
select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Lista', null, '10', array[pg_temp.pid('Sócio Rpc C')], 'null'::jsonb)$$), '22023|LIST_REQUIRED', 'Lista de apelidos JSON null -> LIST_REQUIRED');
select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Lista', null, '10', array[pg_temp.pid('Sócio Rpc C'), null::uuid])$$), 'P0002|NOT_FOUND', 'Sócio nulo dentro da lista -> NOT_FOUND');
select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Lista', null, '10', array[pg_temp.pid('Sócio Rpc C')], '{"type":"NAME","value":"x"}'::jsonb)$$),
  '22023|INVALID_IDENTIFIER', 'Apelidos que não são array -> INVALID_IDENTIFIER');
select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Lista', null, '10', array[pg_temp.pid('Sócio Rpc C')], '["x"]'::jsonb)$$),
  '22023|INVALID_IDENTIFIER', 'Apelido que não é objeto -> INVALID_IDENTIFIER');
select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Lista', null, '10', array[pg_temp.pid('Sócio Rpc C')], '[{"type":"PIX_KEY","value":"x"}]'::jsonb)$$),
  '22023|INVALID_IDENTIFIER', 'Tipo de apelido desconhecido -> INVALID_IDENTIFIER');
select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Lista', null, '10', array[pg_temp.pid('Sócio Rpc C')], '[{"value":"x"}]'::jsonb)$$),
  '22023|INVALID_IDENTIFIER', 'Apelido sem tipo -> INVALID_IDENTIFIER');
select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Lista', null, '10', array[pg_temp.pid('Sócio Rpc C')], '[{"type":"NAME","valor":"x"}]'::jsonb)$$),
  '22023|INVALID_IDENTIFIER', 'Chave desconhecida no apelido -> INVALID_IDENTIFIER');
select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Lista', null, '10', array[pg_temp.pid('Sócio Rpc C')], '[{"type":"DOCUMENT","value":191}]'::jsonb)$$),
  '22023|INVALID_IDENTIFIER', 'Valor de apelido que não é texto -> INVALID_IDENTIFIER');
select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Lista', null, '10', array[pg_temp.pid('Sócio Rpc C')], '[{"type":"NAME","value":" . "}]'::jsonb)$$),
  '22023|NAME_REQUIRED', 'Apelido NAME vazio -> NAME_REQUIRED');
select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Lista', null, '10', array[pg_temp.pid('Sócio Rpc C')], '[{"type":"NAME","value":null}]'::jsonb)$$),
  '22023|NAME_REQUIRED', 'Apelido NAME nulo -> NAME_REQUIRED');
select is(pg_temp.err_of(format($f$select * from pg_temp.sc(null, 'Cliente Rpc Lista', null, '10', array[pg_temp.pid('Sócio Rpc C')], jsonb_build_array(jsonb_build_object('type', 'NAME', 'value', %L)))$f$, repeat('a', 201))),
  '22023|NAME_TOO_LONG', 'Apelido NAME acima de 200 -> NAME_TOO_LONG');
select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Lista', null, '10', array[pg_temp.pid('Sócio Rpc C')], '[{"type":"DOCUMENT","value":"00000000192"}]'::jsonb)$$),
  '22023|INVALID_DOCUMENT', 'Apelido DOCUMENT com DV inválido -> INVALID_DOCUMENT');
select is(pg_temp.detail_of($$select * from pg_temp.sc(null, 'Cliente Rpc Lista', null, '10', array[pg_temp.pid('Sócio Rpc C')], '[{"type":"DOCUMENT","value":"00000000192"}]'::jsonb)$$) ->> 'value',
  '00000000192', '... com o valor no detail');
select is((select count(*) from public.clients where legal_name in ('Cliente Rpc Lista', 'Cliente Rpc Fantasia', 'Cliente Rpc Obs')), 0::bigint,
  'Validação: nenhum cliente criado pelas chamadas recusadas');

-- Sócios
select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Sem Sócio', null, '10', '{}'::uuid[])$$), 'P0001|CLIENT_WITHOUT_PARTNER', 'Cliente novo com lista de sócios vazia -> CLIENT_WITHOUT_PARTNER');
select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Sócio Inativo', null, '10', array[pg_temp.pid('Sócio Rpc C'), pg_temp.pid('Sócio Rpc Z')])$$),
  'P0001|PARTNER_INACTIVE', 'Sócio inativo na lista -> PARTNER_INACTIVE');
select is(pg_temp.detail_of($$select * from pg_temp.sc(null, 'Cliente Rpc Sócio Inativo', null, '10', array[pg_temp.pid('Sócio Rpc C'), pg_temp.pid('Sócio Rpc Z')])$$) #>> '{partners,0,name}',
  'Sócio Rpc Z', '... com o nome do sócio no detail');
select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Sócio Fantasma', null, '10', array[pg_temp.pid('Sócio Rpc C'), gen_random_uuid()])$$),
  'P0002|NOT_FOUND', 'Sócio inexistente na lista -> NOT_FOUND');
select is(pg_temp.detail_of($$select * from pg_temp.sc(null, 'Cliente Rpc Sócio Fantasma', null, '10', array[pg_temp.pid('Sócio Rpc C'), gen_random_uuid()])$$) ->> 'field',
  'partner_ids', '... no campo partner_ids');
select is((select count(*) from public.clients where legal_name in ('Cliente Rpc Sem Sócio', 'Cliente Rpc Sócio Inativo', 'Cliente Rpc Sócio Fantasma')), 0::bigint,
  'Tudo ou nada: nenhum cliente nasce sem sócio válido');

-- -----------------------------------------------------------------------------
-- save_client: edição, versão, estado final
-- -----------------------------------------------------------------------------
select is(pg_temp.err_of($$select * from pg_temp.sc(pg_temp.cid('Cliente Rpc Antigo'), 'Cliente Rpc Antigo', null, '500.00', array[pg_temp.pid('Sócio Rpc A')], '[]'::jsonb, '2019-01-01 00:00:00+00')$$),
  'P0001|STALE_VERSION', 'Versão antiga -> STALE_VERSION');
select is(pg_temp.detail_of($$select * from pg_temp.sc(pg_temp.cid('Cliente Rpc Antigo'), 'Cliente Rpc Antigo', null, '500.00', array[pg_temp.pid('Sócio Rpc A')], '[]'::jsonb, '2019-01-01 00:00:00+00')$$) ->> 'current_updated_at' is not null,
  true, 'O detail de STALE_VERSION traz o updated_at atual');
select is(pg_temp.err_of($$select * from pg_temp.sc(pg_temp.cid('Cliente Rpc Antigo'), 'Cliente Rpc Antigo', null, '500.00', array[pg_temp.pid('Sócio Rpc A')], '[]'::jsonb, null)$$),
  '22023|VERSION_REQUIRED', 'Edição sem versão -> VERSION_REQUIRED');
select is(pg_temp.err_of($$select * from pg_temp.sc(gen_random_uuid(), 'Cliente Rpc X', null, '10', array[pg_temp.pid('Sócio Rpc A')], '[]'::jsonb, now())$$),
  'P0002|NOT_FOUND', 'Cliente inexistente -> NOT_FOUND');

-- Sem mudança: nenhuma escrita, nenhuma linha de auditoria, updated_at inalterado
select is((select count(*) from pg_temp.sc('e6000000-0000-4000-8000-000000000001', 'Cliente Rpc Antigo', null, '500', array[pg_temp.pid('Sócio Rpc A')],
    '[]'::jsonb, '2020-01-01 00:00:00+00', null, null, 'c3000000-0000-4000-8000-000000000011')),
  1::bigint, 'save_client sem mudança devolve a linha');
select is((select count(*) from public.audit_logs where correlation_id = 'c3000000-0000-4000-8000-000000000011'), 0::bigint,
  'Salvar sem mudança não gera linha de auditoria');
select is((select updated_at from public.clients where id = 'e6000000-0000-4000-8000-000000000001'),
  '2020-01-01 00:00:00+00'::timestamptz, 'Salvar sem mudança não toca o updated_at');

-- Só a mensalidade muda: UPDATE só com a coluna alterada; sem evento de sócios
select is((select default_monthly_value::text from pg_temp.sc('e6000000-0000-4000-8000-000000000001', 'Cliente Rpc Antigo', null, '600.00', array[pg_temp.pid('Sócio Rpc A')],
    '[]'::jsonb, '2020-01-01 00:00:00+00', null, null, 'c3000000-0000-4000-8000-000000000012')),
  '600.00', 'save_client muda só a mensalidade');
select results_eq(
  $$select entity, action from public.audit_logs where correlation_id = 'c3000000-0000-4000-8000-000000000012' order by seq$$,
  $$values ('client'::text, 'UPDATE'::text)$$,
  'Só o cliente gera linha de auditoria (sem indicação nem evento de sócios)');
select ok((select previous_data ->> 'default_monthly_value' = '500.00' and new_data ->> 'default_monthly_value' = '600.00' and not new_data ? 'updated_at'
             from public.audit_logs where correlation_id = 'c3000000-0000-4000-8000-000000000012'),
  'O UPDATE grava antes e depois da mensalidade, sem updated_at');

-- Troca de sócios: A -> B e C (A fica inativo, a linha continua), depois volta A
select is((select count(*) from pg_temp.sc('e6000000-0000-4000-8000-000000000001', 'Cliente Rpc Antigo', null, '600.00',
    array[pg_temp.pid('Sócio Rpc B'), pg_temp.pid('Sócio Rpc C')], '[]'::jsonb, pg_temp.cv('Cliente Rpc Antigo'), null, 'Troca combinada', 'c3000000-0000-4000-8000-000000000013')),
  1::bigint, 'save_client troca os sócios do cliente');
select results_eq(
  $$select count(*) filter (where active), count(*) from public.client_partners where client_id = 'e6000000-0000-4000-8000-000000000001'$$,
  $$values (2::bigint, 3::bigint)$$,
  'Sócios ausentes da lista ficam inativos (a linha continua); novos entram');
select results_eq(
  $$select new_data -> 'previous_partner_ids', new_data -> 'new_partner_ids', (new_data ->> 'previous_count')::int, (new_data ->> 'new_count')::int
      from public.audit_logs where correlation_id = 'c3000000-0000-4000-8000-000000000013' and kind = 'EVENT' and action = 'PARTNERS_CHANGE'$$,
  $$values ('["e2000000-0000-4000-8000-000000000001"]'::jsonb,
            '["e2000000-0000-4000-8000-000000000002","e2000000-0000-4000-8000-000000000003"]'::jsonb, 1, 2)$$,
  'EVENT PARTNERS_CHANGE guarda os sócios antes e depois e as contagens (RAT-D025)');
select is((select count(*) from public.audit_logs where correlation_id = 'c3000000-0000-4000-8000-000000000013' and reason = 'Troca combinada'), 4::bigint,
  'O motivo vale para todas as linhas da troca (A inativado, B e C incluídos, evento)');
select is((select count(*) from pg_temp.sc('e6000000-0000-4000-8000-000000000001', 'Cliente Rpc Antigo', null, '600.00',
    array[pg_temp.pid('Sócio Rpc A'), pg_temp.pid('Sócio Rpc B'), pg_temp.pid('Sócio Rpc C')], '[]'::jsonb, pg_temp.cv('Cliente Rpc Antigo'))),
  1::bigint, 'save_client reindica o sócio A');
select results_eq(
  $$select count(*) filter (where active), count(*) from public.client_partners where client_id = 'e6000000-0000-4000-8000-000000000001'$$,
  $$values (3::bigint, 3::bigint)$$,
  'Reindicar reativa a MESMA linha (continuam 3 linhas)');
select is(pg_temp.err_of($$select * from pg_temp.sc('e6000000-0000-4000-8000-000000000001', 'Cliente Rpc Antigo', null, '600.00',
    '{}'::uuid[], '[]'::jsonb, pg_temp.cv('Cliente Rpc Antigo'))$$),
  'P0001|CLIENT_WITHOUT_PARTNER', 'Cliente ativo com lista de sócios vazia -> CLIENT_WITHOUT_PARTNER');
select is((select count(*) from public.client_partners where client_id = 'e6000000-0000-4000-8000-000000000001' and active), 3::bigint,
  '... e nenhum sócio foi retirado');
select is(pg_temp.err_of($$select * from pg_temp.sc('e6000000-0000-4000-8000-000000000001', 'Cliente Rpc Antigo', null, '600.00',
    array[pg_temp.pid('Sócio Rpc Z')], '[]'::jsonb, pg_temp.cv('Cliente Rpc Antigo'))$$),
  'P0001|PARTNER_INACTIVE', 'Edição: indicar sócio inativo -> PARTNER_INACTIVE');

-- Listas nulas na edição não apagam nada
select is(pg_temp.err_of($$select * from pg_temp.sc('e6000000-0000-4000-8000-000000000002', 'Cliente Rpc Dois', 'ZZ0TESTE000363', '700.00', null, '[]'::jsonb, '2020-01-01 00:00:00+00')$$),
  '22023|LIST_REQUIRED', 'Edição com sócios nulos -> LIST_REQUIRED');
select is(pg_temp.err_of($$select * from pg_temp.sc('e6000000-0000-4000-8000-000000000002', 'Cliente Rpc Dois', 'ZZ0TESTE000363', '700.00',
    array[pg_temp.pid('Sócio Rpc A'), pg_temp.pid('Sócio Rpc B')], null, '2020-01-01 00:00:00+00')$$),
  '22023|LIST_REQUIRED', 'Edição com apelidos nulos -> LIST_REQUIRED');
select is((select count(*) from public.client_aliases where client_id = 'e6000000-0000-4000-8000-000000000002' and active), 1::bigint,
  'Lista nula recusada: o apelido do cliente não foi inativado');

-- Só apelidos mudam: o updated_at do cliente muda
select is((select count(*) from pg_temp.sc('e6000000-0000-4000-8000-000000000002', 'Cliente Rpc Dois', 'ZZ0TESTE000363', '700.00',
    array[pg_temp.pid('Sócio Rpc A'), pg_temp.pid('Sócio Rpc B')],
    '[{"type":"NAME","value":"Rpc Dois Apelido"},{"type":"NAME","value":"Rpc Dois Outro"}]'::jsonb, '2020-01-01 00:00:00+00', null, null, 'c3000000-0000-4000-8000-000000000014')),
  1::bigint, 'save_client só com apelido novo grava');
select cmp_ok((select updated_at from public.clients where id = 'e6000000-0000-4000-8000-000000000002'), '>', '2020-01-01 00:00:00+00'::timestamptz,
  'Mudar só os apelidos toca o updated_at do cliente (versão dos filhos)');
select results_eq(
  $$select entity, action from public.audit_logs where correlation_id = 'c3000000-0000-4000-8000-000000000014' order by seq$$,
  $$values ('client_alias'::text, 'CREATE'::text)$$,
  'Só o apelido gera linha de auditoria (o toque no updated_at não gera)');

-- Estado final dos apelidos: retirar inativa; devolver reativa a MESMA linha
select is((select count(*) from pg_temp.sc('e6000000-0000-4000-8000-000000000002', 'Cliente Rpc Dois', 'ZZ0TESTE000363', '700.00',
    array[pg_temp.pid('Sócio Rpc A'), pg_temp.pid('Sócio Rpc B')], '[]'::jsonb, pg_temp.cv('Cliente Rpc Dois'))),
  1::bigint, 'save_client com lista de apelidos vazia');
select results_eq(
  $$select count(*) filter (where active), count(*) from public.client_aliases where client_id = 'e6000000-0000-4000-8000-000000000002'$$,
  $$values (0::bigint, 2::bigint)$$,
  'Lista vazia = nenhum apelido: inativa todos; as linhas continuam');
select is((select count(*) from pg_temp.sc('e6000000-0000-4000-8000-000000000002', 'Cliente Rpc Dois', 'ZZ0TESTE000363', '700.00',
    array[pg_temp.pid('Sócio Rpc A'), pg_temp.pid('Sócio Rpc B')], '[{"type":"NAME","value":"RPC DOIS APELIDO"}]'::jsonb, pg_temp.cv('Cliente Rpc Dois'))),
  1::bigint, 'save_client devolve o apelido (outra grafia)');
select results_eq(
  $$select count(*) filter (where active), count(*), min(alias) filter (where normalized_value = 'rpc dois apelido') from public.client_aliases where client_id = 'e6000000-0000-4000-8000-000000000002'$$,
  $$values (1::bigint, 2::bigint, 'Rpc Dois Apelido'::text)$$,
  'A reativação reutiliza a mesma linha (texto original preservado)');

-- Tudo ou nada na edição: o conflito do apelido desfaz a troca de mensalidade e de sócios
select is(pg_temp.err_of($$select * from pg_temp.sc('e6000000-0000-4000-8000-000000000002', 'Cliente Rpc Dois Novo', 'ZZ0TESTE000363', '999.00',
    array[pg_temp.pid('Sócio Rpc C')], '[{"type":"NAME","value":"Rpc Novo Apelido"}]'::jsonb, pg_temp.cv('Cliente Rpc Dois'))$$),
  '23505|ALIAS_TAKEN', 'Conflito de apelido na edição é recusado');
select results_eq(
  $$select legal_name, default_monthly_value::text, (select count(*) from public.client_partners cp where cp.client_id = c.id and cp.active)
      from public.clients c where id = 'e6000000-0000-4000-8000-000000000002'$$,
  $$values ('Cliente Rpc Dois'::text, '700.00'::text, 2::bigint)$$,
  'Tudo ou nada: nome, mensalidade e sócios não mudaram');

-- Cliente inativo pode ficar sem sócios; reativar não é feito pelo save_client
select is(pg_temp.err_of($$select * from pg_temp.sc('e6000000-0000-4000-8000-000000000003', 'Cliente Rpc Inativo', '10000000957', '300.00', '{}'::uuid[], '[]'::jsonb, '2020-01-01 00:00:00+00')$$),
  'ok', 'Cliente inativo pode ser salvo sem sócios (R-C10)');
select is((select active from public.clients where id = 'e6000000-0000-4000-8000-000000000003'), false, 'save_client não muda o campo "active"');
select is(pg_temp.err_of($$select * from pg_temp.sc('e6000000-0000-4000-8000-000000000003', 'Cliente Rpc Inativo', '10000000957', '300.00',
    array[pg_temp.pid('Sócio Rpc A')], '[]'::jsonb, pg_temp.cv('Cliente Rpc Inativo'))$$),
  'ok', 'Cliente inativo pode receber sócio sem ser reativado');
select is((select active from public.clients where id = 'e6000000-0000-4000-8000-000000000003'), false, '... e continua inativo');

-- -----------------------------------------------------------------------------
-- Aviso de nome repetido (R-C15, 11.4): POSSIBLE_DUPLICATE e a lista confirmada
-- Fixtures: "Cliente Rpc Homônimo Ltda" existe duas vezes (um ativo, com fantasia "Rpc Fantasia Ltda", e um inativo);
-- "Cliente Rpc Dois" tem o apelido NAME "Rpc Dois Apelido".
-- -----------------------------------------------------------------------------
select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Homonimo Ltda.', null, '10', array[pg_temp.pid('Sócio Rpc C')])$$),
  'P0001|POSSIBLE_DUPLICATE', 'Nome igual (por grafia) ao de outros clientes, ativo e inativo -> POSSIBLE_DUPLICATE');
select is(jsonb_array_length(pg_temp.detail_of($$select * from pg_temp.sc(null, 'Cliente Rpc Homonimo Ltda.', null, '10', array[pg_temp.pid('Sócio Rpc C')])$$) -> 'matches'),
  2, 'O detail lista os dois clientes parecidos (inclusive o inativo)');
select results_eq(
  $$select m ->> 'id', m ->> 'name', m ->> 'match', (m ->> 'active')::boolean
      from jsonb_array_elements(pg_temp.detail_of($q$select * from pg_temp.sc(null, 'Cliente Rpc Homonimo Ltda.', null, '10', array[pg_temp.pid('Sócio Rpc C')])$q$) -> 'matches') with ordinality e(m, ord)
     order by ord$$,
  $$values ('e6000000-0000-4000-8000-000000000005'::text, 'Cliente Rpc Homônimo Ltda'::text, 'SAME_NAME'::text, true),
           ('e6000000-0000-4000-8000-000000000006', 'Cliente Rpc Homônimo Ltda', 'SAME_NAME', false)$$,
  'Cada parecido traz id, nome, tipo do casamento e situação');
select is((select count(*) from public.clients where normalized_name = 'cliente rpc homonimo ltda'), 2::bigint,
  'POSSIBLE_DUPLICATE não grava nada');
select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Homonimo Ltda.', null, '10', array[pg_temp.pid('Sócio Rpc C')],
    '[]'::jsonb, null, array['e6000000-0000-4000-8000-000000000005']::uuid[])$$),
  'P0001|POSSIBLE_DUPLICATE', 'Confirmação parcial (falta um dos parecidos) -> POSSIBLE_DUPLICATE');
select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Homonimo Ltda.', null, '10', array[pg_temp.pid('Sócio Rpc C')],
    '[]'::jsonb, null, '{}'::uuid[])$$),
  'P0001|POSSIBLE_DUPLICATE', 'Lista de confirmação vazia -> POSSIBLE_DUPLICATE');
select is((select count(*) from pg_temp.sc(null, 'Cliente Rpc Homonimo Ltda.', null, '10', array[pg_temp.pid('Sócio Rpc C')],
    '[]'::jsonb, null, array['e6000000-0000-4000-8000-000000000005', 'e6000000-0000-4000-8000-000000000006', gen_random_uuid()]::uuid[],
    null, 'c3000000-0000-4000-8000-000000000021')), 1::bigint,
  'Com todos os parecidos confirmados (e mais um id sem relação), o cliente é criado');
select is((select count(*) from public.clients where normalized_name = 'cliente rpc homonimo ltda'), 3::bigint, '... e agora há três com o mesmo nome');
select results_eq(
  $$select new_data -> 'matches' from public.audit_logs
     where correlation_id = 'c3000000-0000-4000-8000-000000000021' and kind = 'EVENT' and action = 'DUPLICATE_WARNING_ACK'$$,
  $$values ('["e6000000-0000-4000-8000-000000000005","e6000000-0000-4000-8000-000000000006"]'::jsonb)$$,
  'EVENT DUPLICATE_WARNING_ACK guarda só os parecidos que existiam (não o id sem relação)');
select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Homonimo Ltda', null, '10', array[pg_temp.pid('Sócio Rpc C')],
    '[]'::jsonb, null, array['e6000000-0000-4000-8000-000000000005', 'e6000000-0000-4000-8000-000000000006']::uuid[])$$),
  'P0001|POSSIBLE_DUPLICATE', 'Um parecido novo (o que acabou de ser criado) volta a avisar: a confirmação vale só para a lista exibida');

select is(pg_temp.detail_of($$select * from pg_temp.sc(null, 'Rpc Fantasia Ltda', null, '10', array[pg_temp.pid('Sócio Rpc C')])$$) #>> '{matches,0,id}',
  'e6000000-0000-4000-8000-000000000005', 'Nome igual ao nome fantasia de outro cliente -> POSSIBLE_DUPLICATE (SAME_NAME)');
select is(pg_temp.detail_of($$select * from pg_temp.sc(null, 'Cliente Rpc Novo Fantasia', null, '10', array[pg_temp.pid('Sócio Rpc C')], '[]'::jsonb, null, null, null, null, 'Cliente Rpc Dois')$$) #>> '{matches,0,id}',
  'e6000000-0000-4000-8000-000000000002', 'Nome fantasia igual ao nome de outro cliente também avisa');
select results_eq(
  $$select m ->> 'id', m ->> 'match'
      from jsonb_array_elements(pg_temp.detail_of($q$select * from pg_temp.sc(null, 'RPC DOIS APELIDO', null, '10', array[pg_temp.pid('Sócio Rpc C')])$q$) -> 'matches') m$$,
  $$values ('e6000000-0000-4000-8000-000000000002'::text, 'SAME_ALIAS'::text)$$,
  'Nome igual ao apelido NAME ativo de outro cliente -> SAME_ALIAS');
select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Dois', 'ZZ0TESTE000363', '10', array[pg_temp.pid('Sócio Rpc C')])$$),
  '23505|DOCUMENT_TAKEN', 'Documento repetido vem antes do aviso de nome repetido');
select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Dois', '000.000.004-34', '10', array[pg_temp.pid('Sócio Rpc C')])$$),
  'P0001|POSSIBLE_DUPLICATE', 'O aviso vale também para cliente que traz documento (R-C15)');

-- Edição: só avisa quando nome, fantasia ou apelidos NAME mudam
select is((select default_monthly_value::text from pg_temp.sc('e6000000-0000-4000-8000-000000000005', 'Cliente Rpc Homônimo Ltda', null, '150.00',
    array[pg_temp.pid('Sócio Rpc A')], '[]'::jsonb, '2020-01-01 00:00:00+00', null, null, null, 'Rpc Fantasia Ltda')),
  '150.00', 'Editar só a mensalidade de cliente com homônimo não avisa');
select is(pg_temp.err_of($$select * from pg_temp.sc(pg_temp.cid('Cliente Rpc Antigo'), 'Cliente Rpc Dois', null, '600.00',
    array[pg_temp.pid('Sócio Rpc A'), pg_temp.pid('Sócio Rpc B'), pg_temp.pid('Sócio Rpc C')], '[]'::jsonb, pg_temp.cv('Cliente Rpc Antigo'))$$),
  'P0001|POSSIBLE_DUPLICATE', 'Renomear para o nome de outro cliente avisa');
select is(pg_temp.err_of($$select * from pg_temp.sc(pg_temp.cid('Cliente Rpc Antigo'), 'Cliente Rpc Antigo', null, '600.00',
    array[pg_temp.pid('Sócio Rpc A'), pg_temp.pid('Sócio Rpc B'), pg_temp.pid('Sócio Rpc C')],
    '[{"type":"NAME","value":"Rpc Antigo Apelido"}]'::jsonb, pg_temp.cv('Cliente Rpc Antigo'))$$),
  'ok', 'Apelido NAME novo sem coincidência com outro cliente não avisa');

-- Aviso por apelido (RAT-D024, 26/11/2026): um apelido NAME deste cliente igual ao nome (ou nome fantasia)
-- de OUTRO cliente também gera POSSIBLE_DUPLICATE; não bloqueia e se confirma pela mesma lista.
select is(pg_temp.err_of($$select * from pg_temp.sc(null, 'Cliente Rpc Alias Novo', null, '10', array[pg_temp.pid('Sócio Rpc C')],
    '[{"type":"NAME","value":"CLIENTE RPC DOIS."}]'::jsonb)$$),
  'P0001|POSSIBLE_DUPLICATE', 'Apelido NAME igual ao nome de outro cliente -> POSSIBLE_DUPLICATE');
select results_eq(
  $$select m ->> 'id', m ->> 'name', m ->> 'match', (m ->> 'active')::boolean
      from jsonb_array_elements(pg_temp.detail_of($q$select * from pg_temp.sc(null, 'Cliente Rpc Alias Novo', null, '10', array[pg_temp.pid('Sócio Rpc C')],
        '[{"type":"NAME","value":"Cliente Rpc Dois"}]'::jsonb)$q$) -> 'matches') m$$,
  $$values ('e6000000-0000-4000-8000-000000000002'::text, 'Cliente Rpc Dois'::text, 'SAME_ALIAS'::text, true)$$,
  '... o detail traz o outro cliente com o rótulo SAME_ALIAS');
select is(pg_temp.detail_of($$select * from pg_temp.sc(null, 'Cliente Rpc Alias Novo', null, '10', array[pg_temp.pid('Sócio Rpc C')],
    '[{"type":"NAME","value":"rpc fantasia ltda"}]'::jsonb)$$) #>> '{matches,0,id}',
  'e6000000-0000-4000-8000-000000000005', 'Apelido NAME igual ao nome fantasia de outro cliente também avisa');
select results_eq(
  $$select m ->> 'id', (m ->> 'active')::boolean
      from jsonb_array_elements(pg_temp.detail_of($q$select * from pg_temp.sc(null, 'Cliente Rpc Alias Novo', null, '10', array[pg_temp.pid('Sócio Rpc C')],
        '[{"type":"NAME","value":"Cliente Rpc Inativo"}]'::jsonb)$q$) -> 'matches') m$$,
  $$values ('e6000000-0000-4000-8000-000000000003'::text, false)$$,
  'O aviso por apelido alcança também o cliente inativo');
select is((select count(*) from public.clients where legal_name = 'Cliente Rpc Alias Novo'), 0::bigint, 'POSSIBLE_DUPLICATE por apelido não grava nada');
select is((select legal_name from pg_temp.sc(null, 'Cliente Rpc Alias Novo', null, '10', array[pg_temp.pid('Sócio Rpc C')],
    '[{"type":"NAME","value":"Cliente Rpc Dois"}]'::jsonb, null, array['e6000000-0000-4000-8000-000000000002']::uuid[],
    null, 'c3000000-0000-4000-8000-000000000051')),
  'Cliente Rpc Alias Novo', 'Confirmado o aviso por apelido, o cliente é criado');
select results_eq(
  $$select new_data -> 'matches' from public.audit_logs
     where correlation_id = 'c3000000-0000-4000-8000-000000000051' and kind = 'EVENT' and action = 'DUPLICATE_WARNING_ACK'$$,
  $$values ('["e6000000-0000-4000-8000-000000000002"]'::jsonb)$$,
  '... e a confirmação fica na auditoria (DUPLICATE_WARNING_ACK)');
select is((select count(*) from pg_temp.sc(pg_temp.cid('Cliente Rpc Alias Novo'), 'Cliente Rpc Alias Novo', null, '20',
    array[pg_temp.pid('Sócio Rpc C')], '[{"type":"NAME","value":"Cliente Rpc Dois"}]'::jsonb, pg_temp.cv('Cliente Rpc Alias Novo'))), 1::bigint,
  'Editar só a mensalidade de cliente cujo apelido repete o nome de outro não avisa de novo');
select is(pg_temp.err_of($$select * from pg_temp.sc(pg_temp.cid('Cliente Rpc Antigo'), 'Cliente Rpc Antigo', null, '600.00',
    array[pg_temp.pid('Sócio Rpc A'), pg_temp.pid('Sócio Rpc B'), pg_temp.pid('Sócio Rpc C')],
    '[{"type":"NAME","value":"Rpc Antigo Apelido"},{"type":"NAME","value":"Cliente Rpc Dois"}]'::jsonb, pg_temp.cv('Cliente Rpc Antigo'))$$),
  'P0001|POSSIBLE_DUPLICATE', 'Editar: acrescentar apelido NAME igual ao nome de outro cliente avisa');
select is((select count(*) from public.client_aliases where client_id = pg_temp.cid('Cliente Rpc Antigo') and normalized_value = 'cliente rpc dois'), 0::bigint,
  '... e não grava o apelido');

-- -----------------------------------------------------------------------------
-- search_clients (11.5): como Administrador (as demais funções de papel estão em 10)
-- -----------------------------------------------------------------------------
select is((select count(*) from public.search_clients('homonimo', 'ALL')), 3::bigint, 'Busca por nome sem acento e sem caixa (3 homônimos)');
select is((select count(*) from public.search_clients('HOMÔNIMO', 'ACTIVE')), 2::bigint, 'Filtro ACTIVE: só os ativos');
select is((select count(*) from public.search_clients('homonimo', 'INACTIVE')), 1::bigint, 'Filtro INACTIVE: só o inativo');
select is((select count(*) from public.search_clients('homonimo')), 2::bigint, 'Situação padrão é ACTIVE');
select is((select id from public.search_clients('fantasia rpc nova', 'ALL')), pg_temp.cid('Cliente Rpc Novo'), 'Busca pelo nome fantasia');
select is((select id from public.search_clients('12.ABC.345/01DE-35', 'ALL')), pg_temp.cid('Cliente Rpc Novo'), 'Busca pelo documento com pontuação');
select is((select id from public.search_clients('12abc34501', 'ALL')), pg_temp.cid('Cliente Rpc Novo'), 'Busca pelo começo do documento, sem pontuação e em minúsculas');
select is((select id from public.search_clients('000.000.005', 'ALL')), pg_temp.cid('Cliente Rpc Cpf'), 'Busca pelo começo do CPF');
select is((select id from public.search_clients('novo apelido', 'ALL')), pg_temp.cid('Cliente Rpc Novo'), 'Busca pelo apelido NAME');
select is((select id from public.search_clients('000.000.002-72', 'ALL')), pg_temp.cid('Cliente Rpc Novo'), 'Busca pelo apelido-documento (CPF com pontuação)');
select is((select count(*) from public.search_clients('dois outro', 'ALL')), 0::bigint, 'Apelido inativo não encontra o cliente');
select is((select count(*) from public.search_clients('zzzz inexistente rpc', 'ALL')), 0::bigint, 'Busca sem resultado');
select results_eq(
  $$select partner_count, default_monthly_value, pg_typeof(default_monthly_value)::text, document_type, active
      from public.search_clients('cliente rpc novo', 'ALL') where legal_name = 'Cliente Rpc Novo'$$,
  $$values (2, '1234.56'::text, 'text'::text, 'CNPJ'::text, true)$$,
  'Linha da busca: partner_count, mensalidade como TEXTO, tipo do documento e situação');
select is((select partner_count from public.search_clients('rpc antigo', 'ALL') where legal_name = 'Cliente Rpc Antigo'), 3,
  'partner_count conta só as indicações ativas');
select results_eq(
  $$select legal_name from public.search_clients('inativo', 'ALL') where legal_name like 'Cliente Rpc Inativo%'$$,
  $$values ('Cliente Rpc Inativo'::text), ('Cliente Rpc Inativo Indicado')$$,
  'Ordenado por nome normalizado');
select is((select count(*) from public.search_clients('inativo', 'ACTIVE') where legal_name like 'Cliente Rpc Inativo%'), 0::bigint,
  'ACTIVE esconde os inativos');
select is((select max(total_count) from public.search_clients('%', 'ALL')), (select max(total_count) from public.search_clients(null, 'ALL')),
  'Curinga "%" não é curinga: equivale a busca vazia');
select is((select max(total_count) from public.search_clients('_', 'ALL')), (select max(total_count) from public.search_clients(null, 'ALL')),
  'Curinga "_" não é curinga: equivale a busca vazia');
select is((select count(*) from public.search_clients('cliente rpc _ntigo', 'ALL')), 0::bigint, '"_" no meio do texto não casa com um caractere qualquer');
select is((select max(total_count) from public.search_clients(null, 'ALL')),
  (select count(*) from public.clients), 'Sem texto, ALL devolve todos os clientes que o papel enxerga');

select is((select count(*) from public.search_clients('rpc', 'ALL', 2, 0)), 2::bigint, 'Paginação: limite 2');
select is((select max(total_count) from public.search_clients('rpc', 'ALL', 2, 0)),
  (select count(*) from public.clients c
    where c.normalized_name like '%rpc%' or c.normalized_trade_name like '%rpc%'
       or exists (select 1 from public.client_aliases a where a.client_id = c.id and a.active and a.alias_type = 'NAME' and a.normalized_value like '%rpc%')),
  'total_count é o total antes do limite');
select is((select id from public.search_clients('rpc', 'ALL', 1, 1)), (select id from public.search_clients('rpc', 'ALL', 2, 0) offset 1),
  'O deslocamento continua a mesma ordem');
select is((select count(*) from public.search_clients('rpc', 'ALL', 10, 1000)), 0::bigint, 'Deslocamento além do fim devolve zero linhas');
select is(pg_temp.err_of($$select * from public.search_clients('rpc', 'TODOS')$$), '22023|INVALID_FILTER', 'Situação desconhecida -> INVALID_FILTER');

-- Filtro por sócio (E6a, P-E4-02): indicação ATIVA do sócio, no filtro de situação pedido
select set_eq(
  $$select id from public.search_clients(null, 'ALL', 100, 0, pg_temp.pid('Sócio Rpc A'))$$,
  $$select cp.client_id from public.client_partners cp where cp.partner_id = pg_temp.pid('Sócio Rpc A') and cp.active$$,
  'Filtro por sócio: os clientes com indicação ativa daquele sócio (ativos e inativos)');
select is((select count(*) from public.search_clients(null, 'ACTIVE', 100, 0, pg_temp.pid('Sócio Rpc A')) where id = 'e6000000-0000-4000-8000-000000000003'), 0::bigint,
  'Filtro por sócio + ACTIVE: o cliente inativo não vem');
select is((select count(*) from public.search_clients(null, 'INACTIVE', 100, 0, pg_temp.pid('Sócio Rpc A')) where id = 'e6000000-0000-4000-8000-000000000003'), 1::bigint,
  'Filtro por sócio + INACTIVE: o cliente inativo (indicação ativa) vem');
select is((select count(*) from public.search_clients(null, 'ALL', 100, 0, pg_temp.pid('Sócio Rpc A')) where id = 'e6000000-0000-4000-8000-000000000004'), 0::bigint,
  'Filtro por sócio: indicação inativa não conta');
select is((select count(*) from public.search_clients(null, 'ALL', 100, 0, gen_random_uuid())), 0::bigint, 'Filtro por sócio desconhecido: nenhuma linha');
select is((select count(*) from public.search_clients('homonimo', 'ALL', 25, 0, pg_temp.pid('Sócio Rpc A'))), 1::bigint,
  'O filtro de sócio combina com o texto da busca');
select is((select max(total_count) from public.search_clients(null, 'ALL', 1, 0, pg_temp.pid('Sócio Rpc A'))),
  (select count(*) from public.client_partners cp where cp.partner_id = pg_temp.pid('Sócio Rpc A') and cp.active), 'total_count respeita o filtro de sócio');
select is((select count(*) from public.search_clients(null, 'ALL', 100, 0, null)), (select count(*) from public.search_clients(null, 'ALL', 100, 0)),
  'Sócio nulo é o mesmo que sem filtro');
select is(pg_temp.err_of($$select * from public.search_clients('rpc', 'ALL', 0)$$), '22023|INVALID_FILTER', 'Limite 0 -> INVALID_FILTER');
select is(pg_temp.err_of($$select * from public.search_clients('rpc', 'ALL', 101)$$), '22023|INVALID_FILTER', 'Limite 101 -> INVALID_FILTER');
select is(pg_temp.err_of($$select * from public.search_clients('rpc', 'ALL', 10, -1)$$), '22023|INVALID_FILTER', 'Deslocamento negativo -> INVALID_FILTER');
select is(pg_temp.detail_of($$select * from public.search_clients('rpc', 'ALL', 101)$$) ->> 'field', 'limit', '... com o campo no detail');

-- -----------------------------------------------------------------------------
-- search_aliases (11.6): lista consolidada, só o Administrador recebe linhas
-- -----------------------------------------------------------------------------
select is((select count(*) from public.save_partner(null, 'Sócio Rpc Busca', array['Apelido Rpc Busca'], null)), 1::bigint, 'Fixture: sócio com apelido para a busca consolidada');
select is((select count(*) from public.save_receiver(null, pg_temp.pid('Sócio Rpc Busca'), 'Titular Rpc Busca',
    '[{"type":"NAME_VARIANT","value":"Variação Rpc Busca"},{"type":"PIX_KEY","value":"busca.rpc@example.com"},
      {"type":"PIX_KEY","value":"6F1D7A4E-8B2C-4D3E-9A1B-0C2D3E4F5A6B"},
      {"type":"BANK_ACCOUNT","bank_name":"Banco Rpc Busca","branch":"0001","account_number":"98765-4"}]'::jsonb, null)), 1::bigint,
  'Fixture: recebedor com variação, chave Pix e conta');

select set_eq(
  $$select kind from public.search_aliases('busca', null, 'ACTIVE')$$,
  $$values ('PARTNER_ALIAS'::text), ('NAME_VARIANT'), ('PIX_KEY'), ('BANK_ACCOUNT')$$,
  'Consolidada: apelido de sócio, variação, chave Pix e conta encontrados pela mesma busca');
select results_eq(
  $$select kind, display_value, active, owner_kind, owner_name, owner_active, partner_name
      from public.search_aliases('busca.rpc', 'PIX_KEY', 'ACTIVE')$$,
  $$values ('PIX_KEY'::text, 'busca.rpc@example.com'::text, true, 'RECEIVER'::text, 'Titular Rpc Busca'::text, true, 'Sócio Rpc Busca'::text)$$,
  'Chave Pix: dono (recebedor) e sócio do recebedor');
select results_eq(
  $$select kind, display_value, owner_kind, owner_name, partner_name from public.search_aliases('98765-4', 'BANK_ACCOUNT')$$,
  $$values ('BANK_ACCOUNT'::text, 'Banco Rpc Busca / 0001 / 98765-4'::text, 'RECEIVER'::text, 'Titular Rpc Busca'::text, 'Sócio Rpc Busca'::text)$$,
  'Conta: encontrada pelo número e exibida com banco, agência e conta');
select is((select count(*) from public.search_aliases('987654', 'BANK_ACCOUNT')), 1::bigint, 'Conta encontrada pelo número só com dígitos');
-- QA-CAD-01: chave Pix de e-mail casa ignorando pontuação, acento e maiúscula (a ajuda da tela promete isso)
select is((select count(*) from public.search_aliases('buscarpcexamplecom', 'PIX_KEY')), 1::bigint, 'Pix e-mail: casa sem ponto e sem arroba (buscarpcexamplecom)');
select is((select count(*) from public.search_aliases('busca rpc@example com', 'PIX_KEY')), 1::bigint, 'Pix e-mail: casa com espaço no lugar do ponto');
select is((select count(*) from public.search_aliases('BUSCA.RPC', 'PIX_KEY')), 1::bigint, 'Pix e-mail: casa em maiúsculas');
select is((select count(*) from public.search_aliases('rpcexample', 'PIX_KEY')), 1::bigint, 'Pix e-mail: casa trecho que atravessa o arroba sem a pontuação');
select is((select count(*) from public.search_aliases('buscarpcoutro', 'PIX_KEY')), 0::bigint, 'Pix e-mail: texto que não está na chave continua sem casar');
select is((select count(*) from public.search_aliases('6f1d7a4e8b2c', 'PIX_KEY')), 1::bigint, 'Pix UUID: continua casando sem hífen');
select is((select count(*) from public.search_aliases('6F1D7A4E-8B2C', 'PIX_KEY')), 1::bigint, 'Pix UUID: continua casando com hífen e em maiúsculas');
select results_eq(
  $$select kind, owner_kind, owner_name, partner_id is null from public.search_aliases('rpc dois apelido', 'CLIENT_ALIAS')$$,
  $$values ('CLIENT_ALIAS'::text, 'CLIENT'::text, 'Cliente Rpc Dois'::text, true)$$,
  'Apelido de cliente: dono é o cliente e não há sócio');
select is((select display_value from public.search_aliases('000.000.002-72', 'CLIENT_ALIAS')), '000.000.002-72',
  'Apelido-documento encontrado pelo documento com pontuação');
select results_eq(
  $$select owner_kind, owner_name from public.search_aliases('variacao rpc', 'NAME_VARIANT')$$,
  $$values ('RECEIVER'::text, 'Titular Rpc Busca'::text)$$,
  'Variação de nome: dono é o recebedor');
select is((select count(*) from public.search_aliases('busca', null, 'ACTIVE', 1, 0)), 1::bigint, 'search_aliases: limite 1');
select is((select max(total_count) from public.search_aliases('busca', null, 'ACTIVE', 1, 0)), 4::bigint, 'search_aliases: total_count antes do limite');

select is((select count(*) from public.save_partner(pg_temp.pid('Sócio Rpc Busca'), 'Sócio Rpc Busca', '{}'::text[], pg_temp.ppv('Sócio Rpc Busca'))), 1::bigint,
  'Retira o apelido do sócio (fica inativo)');
select is((select count(*) from public.search_aliases('apelido rpc busca', 'PARTNER_ALIAS', 'ACTIVE')), 0::bigint, 'Filtro ACTIVE não traz o item inativo');
select is((select count(*) from public.search_aliases('apelido rpc busca', 'PARTNER_ALIAS', 'INACTIVE')), 1::bigint, 'Filtro INACTIVE traz o item inativo');
select is((select active from public.search_aliases('apelido rpc busca', 'PARTNER_ALIAS', 'ALL')), false, 'Filtro ALL traz o item e a situação dele');
select is(pg_temp.err_of($$select * from public.search_aliases('busca', 'CARTAO')$$), '22023|INVALID_FILTER', 'Tipo desconhecido -> INVALID_FILTER');
select is(pg_temp.err_of($$select * from public.search_aliases('busca', null, 'TODOS')$$), '22023|INVALID_FILTER', 'Situação desconhecida -> INVALID_FILTER');
select is(pg_temp.err_of($$select * from public.search_aliases('busca', null, 'ACTIVE', 101)$$), '22023|INVALID_FILTER', 'Limite 101 -> INVALID_FILTER');

-- -----------------------------------------------------------------------------
-- set_client_active (6.4.6)
-- -----------------------------------------------------------------------------
select is((select active from public.set_client_active(pg_temp.cid('Cliente Rpc Antigo'), false, pg_temp.cv('Cliente Rpc Antigo'), null, 'c3000000-0000-4000-8000-000000000031')),
  false, 'set_client_active inativa o cliente');
select is((select count(*) from public.client_partners where client_id = pg_temp.cid('Cliente Rpc Antigo') and active), 3::bigint,
  'Inativar o cliente mantém as indicações ativas (6.5)');
select results_eq(
  $$select entity, action from public.audit_logs where correlation_id = 'c3000000-0000-4000-8000-000000000031' order by seq$$,
  $$values ('client'::text, 'UPDATE'::text)$$,
  'Inativar gera só o UPDATE do cliente');
select is((select count(*) from public.set_client_active(pg_temp.cid('Cliente Rpc Antigo'), false, null, null, 'c3000000-0000-4000-8000-000000000032')),
  1::bigint, 'Já inativo: devolve a linha mesmo sem versão (idempotente)');
select is((select count(*) from public.audit_logs where correlation_id = 'c3000000-0000-4000-8000-000000000032'), 0::bigint,
  '... e não grava nada');
select is(pg_temp.err_of($$select * from public.set_client_active(pg_temp.cid('Cliente Rpc Antigo'), true, '2019-01-01 00:00:00+00')$$),
  'P0001|STALE_VERSION', 'Reativar com versão antiga -> STALE_VERSION');
select is(pg_temp.err_of($$select * from public.set_client_active(pg_temp.cid('Cliente Rpc Antigo'), true, null)$$),
  '22023|VERSION_REQUIRED', 'Reativar sem versão -> VERSION_REQUIRED');
select is(pg_temp.err_of($$select * from public.set_client_active(pg_temp.cid('Cliente Rpc Antigo'), null, now())$$),
  '22023|ACTIVE_REQUIRED', 'Situação nula -> ACTIVE_REQUIRED');
select is(pg_temp.err_of($$select * from public.set_client_active(gen_random_uuid(), true, now())$$),
  'P0002|NOT_FOUND', 'Cliente inexistente -> NOT_FOUND');
select is((select active from public.set_client_active(pg_temp.cid('Cliente Rpc Antigo'), true, pg_temp.cv('Cliente Rpc Antigo'))),
  true, 'Reativar cliente com sócios indicados funciona');

select is(pg_temp.err_of($$select * from public.set_client_active('e6000000-0000-4000-8000-000000000004', true, '2020-01-01 00:00:00+00')$$),
  'P0001|CLIENT_WITHOUT_PARTNER', 'Reativar cliente cuja única indicação está inativa -> CLIENT_WITHOUT_PARTNER');
select is(pg_temp.err_of($$select * from public.set_client_active('e6000000-0000-4000-8000-000000000006', true, '2020-01-01 00:00:00+00')$$),
  'P0001|CLIENT_WITHOUT_PARTNER', 'Reativar cliente sem nenhuma indicação -> CLIENT_WITHOUT_PARTNER');
select is((select active from public.clients where id = 'e6000000-0000-4000-8000-000000000006'), false, 'A recusa não reativa o cliente');
select is(pg_temp.err_of($$select * from pg_temp.sc('e6000000-0000-4000-8000-000000000004', 'Cliente Rpc Inativo Indicado', null, '200.00',
    array[pg_temp.pid('Sócio Rpc B')], '[]'::jsonb, '2020-01-01 00:00:00+00')$$),
  'ok', 'Indicar um sócio ativo ao cliente inativo (save_client)');
select is((select active from public.set_client_active('e6000000-0000-4000-8000-000000000004', true, pg_temp.cv('Cliente Rpc Inativo Indicado'))),
  true, '... e então a reativação é aceita');

-- Sócio indicado em cliente continua protegido (RAT-D025)
select is(pg_temp.err_of($$select * from public.set_partner_active(pg_temp.pid('Sócio Rpc B'), false, pg_temp.ppv('Sócio Rpc B'))$$),
  'P0001|PARTNER_HAS_CLIENTS', 'Sócio indicado em cliente ativo não é inativado');

select * from finish();
rollback;
