-- =============================================================================
-- pgTAP · CAD-001 · Sócios, apelidos, recebedores e identificadores (nível de tabela)
-- Constraints, unicidades, espaço de nomes do sócio (I-11), identificadores (I-12),
-- recebedor com sócio imutável (I-04, I-05), inativação do sócio (I-02 b, I-05 b) e
-- bloqueio de DELETE/TRUNCATE (I-14). Tudo inserido como postgres, sem as RPCs.
-- A segunda metade do arquivo (a partir de "FUNÇÕES DE GRAVAÇÃO") testa as funções da migration 0300 como Administrador.
-- Rastreio: RAT-D023, RAT-D025 · I-02, I-04, I-05, I-10, I-11, I-12, I-14.
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(226);

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
-- Fixtures (como postgres; só nomes fictícios, RAT-D019)
-- -----------------------------------------------------------------------------
insert into public.partners (id, name) values
  ('f2000000-0000-4000-8000-000000000001', 'Sócio Teste A'),
  ('f2000000-0000-4000-8000-000000000002', 'Sócio Teste B'),
  ('f2000000-0000-4000-8000-000000000003', 'Sócio Teste C'),
  ('f2000000-0000-4000-8000-000000000004', 'Sócio Teste D');

-- -----------------------------------------------------------------------------
-- Índices e constraints (catálogo)
-- -----------------------------------------------------------------------------
select ok(
  (select count(*) from pg_indexes
    where schemaname = 'public'
      and indexname in ('partner_aliases_active_key', 'receiver_identifiers_active_key',
                        'client_aliases_active_key', 'clients_document_key')
      and indexdef like 'CREATE UNIQUE INDEX%' and indexdef like '%WHERE%') = 4,
  'Índices únicos parciais: apelido do sócio, identificador, apelido do cliente e documento');

select ok(
  (select count(*) from pg_indexes
    where schemaname = 'public'
      and indexname in ('partner_aliases_partner_id_idx', 'receivers_partner_id_idx',
                        'receiver_identifiers_receiver_id_idx', 'clients_normalized_name_idx',
                        'clients_normalized_trade_name_idx', 'client_aliases_client_id_idx',
                        'client_partners_partner_id_idx')) = 7,
  'Índices de FK e de busca da seção 5 existem');

-- -----------------------------------------------------------------------------
-- partners_guard: espaço de nomes do sócio (I-11)
-- -----------------------------------------------------------------------------
select is(pg_temp.err_of($$insert into public.partners (name) values ('Socio Teste A.')$$),
  '23505|PARTNER_NAME_TAKEN', 'Nome de sócio repetido por grafia (acento e ponto) -> PARTNER_NAME_TAKEN');

select lives_ok(
  $$update public.partners set name = 'SÓCIO TESTE A' where id = 'f2000000-0000-4000-8000-000000000001'$$,
  'Trocar a grafia do próprio nome não conflita consigo mesmo');

select lives_ok(
  $$insert into public.partner_aliases (id, partner_id, alias) values
      ('f3000000-0000-4000-8000-0000000000a1', 'f2000000-0000-4000-8000-000000000001', 'Apelido Alfa')$$,
  'Apelido novo do sócio A é aceito');

select is((select normalized_value from public.partner_aliases where id = 'f3000000-0000-4000-8000-0000000000a1'),
  'apelido alfa', 'partner_aliases.normalized_value é gerado por normalize_alias');

select is(pg_temp.err_of($$insert into public.partner_aliases (partner_id, alias)
                           values ('f2000000-0000-4000-8000-000000000002', 'apelido ALFA!')$$),
  '23505|PARTNER_NAME_TAKEN', 'Apelido ativo de outro sócio -> PARTNER_NAME_TAKEN');

select is(pg_temp.err_of($$insert into public.partner_aliases (partner_id, alias)
                           values ('f2000000-0000-4000-8000-000000000002', 'socio teste a')$$),
  '23505|PARTNER_NAME_TAKEN', 'Apelido igual ao nome de outro sócio -> PARTNER_NAME_TAKEN');

select is(pg_temp.detail_of($$insert into public.partner_aliases (partner_id, alias)
                              values ('f2000000-0000-4000-8000-000000000002', 'socio teste a')$$) #>> '{owner,id}',
  'f2000000-0000-4000-8000-000000000001', 'O detail traz o sócio dono (id)');

select is(pg_temp.detail_of($$insert into public.partner_aliases (partner_id, alias)
                              values ('f2000000-0000-4000-8000-000000000002', 'socio teste a')$$) #>> '{owner,via}',
  'NAME', 'O detail diz por onde o texto pertence ao dono (nome do sócio)');

select is(pg_temp.detail_of($$insert into public.partner_aliases (partner_id, alias)
                              values ('f2000000-0000-4000-8000-000000000002', 'socio teste a')$$) ->> 'field',
  'aliases', 'O detail diz de qual campo veio o texto');

select lives_ok(
  $$insert into public.partner_aliases (partner_id, alias)
    values ('f2000000-0000-4000-8000-000000000001', 'Sócio Teste A')$$,
  'Apelido igual ao nome do PRÓPRIO sócio é aceito (sem ambiguidade)');

select is(pg_temp.err_of($$insert into public.partners (name) values ('Apelido Alfa')$$),
  '23505|PARTNER_NAME_TAKEN', 'Sócio novo com o nome de um apelido ativo de outro sócio -> PARTNER_NAME_TAKEN');

select is(pg_temp.err_of($$update public.partners set name = 'apelido alfa' where id = 'f2000000-0000-4000-8000-000000000002'$$),
  '23505|PARTNER_NAME_TAKEN', 'Renomear sócio para o apelido de outro -> PARTNER_NAME_TAKEN');

-- Apelido inativo não bloqueia; reativar conflitando bloqueia.
update public.partner_aliases set active = false where id = 'f3000000-0000-4000-8000-0000000000a1';
select lives_ok(
  $$insert into public.partner_aliases (id, partner_id, alias) values
      ('f3000000-0000-4000-8000-0000000000b1', 'f2000000-0000-4000-8000-000000000002', 'apelido alfa')$$,
  'Apelido inativo de outro sócio não bloqueia o mesmo texto');
select is(pg_temp.err_of($$update public.partner_aliases set active = true where id = 'f3000000-0000-4000-8000-0000000000a1'$$),
  '23505|PARTNER_NAME_TAKEN', 'Reativar apelido cujo texto agora é de outro sócio -> PARTNER_NAME_TAKEN');

-- Imutabilidade (I-10)
select is(pg_temp.err_of($$update public.partner_aliases set alias = 'outro' where id = 'f3000000-0000-4000-8000-0000000000b1'$$),
  'P0001|IMMUTABLE_FIELD', 'Apelido do sócio: o texto não muda (I-10)');
select is(pg_temp.err_of($$update public.partner_aliases set partner_id = 'f2000000-0000-4000-8000-000000000001' where id = 'f3000000-0000-4000-8000-0000000000b1'$$),
  'P0001|IMMUTABLE_FIELD', 'Apelido do sócio: o dono não muda (I-10)');
select is(pg_temp.err_of($$update public.partner_aliases set active = false where id = 'f3000000-0000-4000-8000-0000000000b1'$$),
  'ok', 'Apelido do sócio: "active" muda');
select is(pg_temp.err_of($$update public.partners set id = gen_random_uuid() where id = 'f2000000-0000-4000-8000-000000000004'$$),
  'P0001|IMMUTABLE_FIELD', 'partners: id é imutável');

select throws_ok($$insert into public.partner_aliases (partner_id, alias) values ('f2000000-0000-4000-8000-000000000001', ' . ')$$,
  '23514', null, 'Apelido do sócio vazio depois de normalizar é recusado');
select throws_ok($$insert into public.partner_aliases (partner_id, alias) values ('f2000000-0000-4000-8000-000000000001', repeat('a', 201))$$,
  '23514', null, 'Apelido do sócio acima de 200 caracteres é recusado');

-- -----------------------------------------------------------------------------
-- Recebedores: sócio obrigatório, imutável e ativo (I-04, I-05 a)
-- -----------------------------------------------------------------------------
select lives_ok(
  $$insert into public.receivers (id, partner_id, holder_name) values
      ('f4000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'Titular Fictício A1'),
      ('f4000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000001', 'titular ficticio a1'),
      ('f4000000-0000-4000-8000-000000000003', 'f2000000-0000-4000-8000-000000000002', 'Titular Fictício B1')$$,
  'Recebedores novos entram; o mesmo titular pode repetir (não é único)');
select is((select normalized_holder_name from public.receivers where id = 'f4000000-0000-4000-8000-000000000001'),
  'titular ficticio a1', 'receivers.normalized_holder_name é gerado');
select throws_ok($$insert into public.receivers (partner_id, holder_name) values (null, 'Sem Sócio')$$,
  '23502', null, 'Recebedor sem sócio é recusado (NOT NULL)');
select throws_ok($$insert into public.receivers (partner_id, holder_name) values (gen_random_uuid(), 'Sócio Inexistente')$$,
  '23503', null, 'Recebedor de sócio inexistente é recusado (FK)');
select throws_ok($$insert into public.receivers (partner_id, holder_name) values ('f2000000-0000-4000-8000-000000000001', ' . ')$$,
  '23514', null, 'Titular vazio depois de normalizar é recusado');
select throws_ok($$insert into public.receivers (partner_id, holder_name) values ('f2000000-0000-4000-8000-000000000001', repeat('a', 201))$$,
  '23514', null, 'Titular acima de 200 caracteres é recusado');
select is(pg_temp.err_of($$update public.receivers set partner_id = 'f2000000-0000-4000-8000-000000000002' where id = 'f4000000-0000-4000-8000-000000000001'$$),
  'P0001|RECEIVER_PARTNER_IMMUTABLE', 'O sócio do recebedor não muda (I-04)');
select is(pg_temp.err_of($$update public.receivers set id = gen_random_uuid() where id = 'f4000000-0000-4000-8000-000000000001'$$),
  'P0001|IMMUTABLE_FIELD', 'receivers: id é imutável');

-- Sócio C: com recebedor inativo, inativação do sócio e reativação do recebedor
insert into public.receivers (id, partner_id, holder_name, active)
values ('f4000000-0000-4000-8000-000000000004', 'f2000000-0000-4000-8000-000000000003', 'Titular Fictício C1', false);
update public.partners set active = false where id = 'f2000000-0000-4000-8000-000000000003';
select is(pg_temp.err_of($$insert into public.receivers (partner_id, holder_name) values ('f2000000-0000-4000-8000-000000000003', 'Titular Novo C')$$),
  'P0001|PARTNER_INACTIVE', 'Recebedor ativo de sócio inativo -> PARTNER_INACTIVE (I-05 a)');
select is(pg_temp.detail_of($$insert into public.receivers (partner_id, holder_name) values ('f2000000-0000-4000-8000-000000000003', 'Titular Novo C')$$) #>> '{partners,0,id}',
  'f2000000-0000-4000-8000-000000000003', 'O detail de PARTNER_INACTIVE lista o sócio');
select is(pg_temp.err_of($$update public.receivers set active = true where id = 'f4000000-0000-4000-8000-000000000004'$$),
  'P0001|PARTNER_INACTIVE', 'Reativar recebedor de sócio inativo -> PARTNER_INACTIVE');
select lives_ok($$insert into public.receivers (partner_id, holder_name, active) values ('f2000000-0000-4000-8000-000000000003', 'Titular Inativo C2', false)$$,
  'Recebedor INATIVO de sócio inativo é aceito');
update public.partners set active = true where id = 'f2000000-0000-4000-8000-000000000003';
select is(pg_temp.err_of($$update public.receivers set active = true where id = 'f4000000-0000-4000-8000-000000000004'$$),
  'ok', 'Com o sócio reativado, o recebedor também pode ser reativado');

-- -----------------------------------------------------------------------------
-- Identificadores (I-10, I-12, I-11)
-- -----------------------------------------------------------------------------
select lives_ok(
  $$insert into public.receiver_identifiers (id, receiver_id, identifier_type, value, bank_name, branch, account_number) values
      ('f5000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000001', 'NAME_VARIANT', 'S. Teste A', null, null, null),
      ('f5000000-0000-4000-8000-000000000002', 'f4000000-0000-4000-8000-000000000001', 'PIX_KEY', 'Socio.A@Example.com', null, null, null),
      ('f5000000-0000-4000-8000-000000000003', 'f4000000-0000-4000-8000-000000000001', 'PIX_KEY', '+55 (23) 91234-5678', null, null, null),
      ('f5000000-0000-4000-8000-000000000004', 'f4000000-0000-4000-8000-000000000001', 'BANK_ACCOUNT', null, 'Banco Exemplo', '0001', '12345-6'),
      ('f5000000-0000-4000-8000-000000000005', 'f4000000-0000-4000-8000-000000000001', 'BANK_ACCOUNT', null, 'Banco Exemplo', '0002', '654321-0')$$,
  'Um recebedor tem uma variação, duas chaves Pix e duas contas (U-C04)');
select results_eq(
  $$select normalized_value from public.receiver_identifiers where id::text like 'f5000000-%' order by id$$,
  $$values ('s teste a'), ('socio.a@example.com'), ('+5523912345678'), ('banco exemplo|1|123456'), ('banco exemplo|2|6543210')$$,
  'normalized_value é calculado pelo trigger para cada tipo');
insert into public.receiver_identifiers (id, receiver_id, identifier_type, value, normalized_value)
values ('f5000000-0000-4000-8000-0000000000f1', 'f4000000-0000-4000-8000-000000000001', 'PIX_KEY', 'Chave.Forjada@Example.com', 'forjado');
select is((select normalized_value from public.receiver_identifiers where id = 'f5000000-0000-4000-8000-0000000000f1'),
  'chave.forjada@example.com', 'O normalized_value enviado pelo cliente é ignorado');
select lives_ok(
  $$insert into public.receiver_identifiers (receiver_id, identifier_type, value)
    values ('f4000000-0000-4000-8000-000000000001', 'PIX_KEY', '000.000.001-91')$$,
  'Chave Pix com formato de CPF é aceita e guardada só como chave Pix (RAT-D023)');
select throws_ok(
  $$insert into public.receiver_identifiers (receiver_id, identifier_type, value, bank_name)
    values ('f4000000-0000-4000-8000-000000000001', 'PIX_KEY', 'x@example.com', 'Banco Exemplo')$$,
  '23514', null, 'Forma: chave Pix com banco preenchido é recusada');
select throws_ok(
  $$insert into public.receiver_identifiers (receiver_id, identifier_type, value, bank_name, branch, account_number)
    values ('f4000000-0000-4000-8000-000000000001', 'BANK_ACCOUNT', 'x', 'Banco Exemplo', '0001', '1')$$,
  '23514', null, 'Forma: conta com "value" preenchido é recusada');
select throws_ok(
  $$insert into public.receiver_identifiers (receiver_id, identifier_type, bank_name, branch, account_number)
    values ('f4000000-0000-4000-8000-000000000001', 'BANK_ACCOUNT', null, '0001', '1')$$,
  '22023', null, 'Forma: conta sem banco é recusada pela validação (INVALID_BANK)');
select is(pg_temp.err_of($$insert into public.receiver_identifiers (receiver_id, identifier_type, value)
                           values ('f4000000-0000-4000-8000-000000000001', 'NAME_VARIANT', null)$$),
  '22023|NAME_REQUIRED', 'Variação sem texto -> NAME_REQUIRED');
select throws_ok(
  $$insert into public.receiver_identifiers (receiver_id, identifier_type, value)
    values ('f4000000-0000-4000-8000-000000000001', 'PIX_KEY', repeat('a', 101))$$,
  '22023', null, 'Chave Pix acima de 100 caracteres é recusada');

-- I-12: valor ativo único por tipo entre todos os recebedores
select is(pg_temp.err_of($$insert into public.receiver_identifiers (receiver_id, identifier_type, value)
                           values ('f4000000-0000-4000-8000-000000000003', 'PIX_KEY', 'SOCIO.A@EXAMPLE.COM')$$),
  '23505|IDENTIFIER_TAKEN', 'Chave Pix ativa de outro recebedor -> IDENTIFIER_TAKEN');
select is(pg_temp.detail_of($$insert into public.receiver_identifiers (receiver_id, identifier_type, value)
                              values ('f4000000-0000-4000-8000-000000000003', 'PIX_KEY', 'SOCIO.A@EXAMPLE.COM')$$) #>> '{owner,name}',
  'Titular Fictício A1', 'O detail traz o titular dono');
select is(pg_temp.detail_of($$insert into public.receiver_identifiers (receiver_id, identifier_type, value)
                              values ('f4000000-0000-4000-8000-000000000003', 'PIX_KEY', 'SOCIO.A@EXAMPLE.COM')$$) #>> '{owner,partner_name}',
  'SÓCIO TESTE A', 'O detail traz o sócio do titular dono');
select is(pg_temp.err_of($$insert into public.receiver_identifiers (receiver_id, identifier_type, bank_name, branch, account_number)
                           values ('f4000000-0000-4000-8000-000000000003', 'BANK_ACCOUNT', 'BANCO EXEMPLO', '1', '123456')$$),
  '23505|IDENTIFIER_TAKEN', 'Mesma conta (banco, agência e conta normalizados) em outro recebedor -> IDENTIFIER_TAKEN');
select is(pg_temp.detail_of($$insert into public.receiver_identifiers (receiver_id, identifier_type, value)
                              values ('f4000000-0000-4000-8000-000000000003', 'PIX_KEY', 'SOCIO.A@EXAMPLE.COM')$$) ->> 'identifier_type',
  'PIX_KEY', 'O detail de IDENTIFIER_TAKEN traz identifier_type = PIX_KEY');
select is(pg_temp.detail_of($$insert into public.receiver_identifiers (receiver_id, identifier_type, bank_name, branch, account_number)
                              values ('f4000000-0000-4000-8000-000000000003', 'BANK_ACCOUNT', 'BANCO EXEMPLO', '1', '123456')$$) ->> 'identifier_type',
  'BANK_ACCOUNT', 'O detail de IDENTIFIER_TAKEN traz identifier_type = BANK_ACCOUNT');
select lives_ok(
  $$insert into public.receiver_identifiers (receiver_id, identifier_type, value)
    values ('f4000000-0000-4000-8000-000000000001', 'NAME_VARIANT', 'socio.a@example.com'),
           ('f4000000-0000-4000-8000-000000000001', 'PIX_KEY', '12345'),
           ('f4000000-0000-4000-8000-000000000001', 'NAME_VARIANT', '12345')$$,
  'O mesmo texto em tipos diferentes não conflita (a unicidade é por tipo)');
select is(pg_temp.err_of($$insert into public.receiver_identifiers (receiver_id, identifier_type, value)
                           values ('f4000000-0000-4000-8000-000000000002', 'NAME_VARIANT', 'S TESTE A')$$),
  '23505|IDENTIFIER_TAKEN', 'Variação de nome ativa repetida em outro recebedor do MESMO sócio -> IDENTIFIER_TAKEN');
select is(pg_temp.detail_of($$insert into public.receiver_identifiers (receiver_id, identifier_type, value)
                              values ('f4000000-0000-4000-8000-000000000002', 'NAME_VARIANT', 'S TESTE A')$$) ->> 'identifier_type',
  'NAME_VARIANT', 'O detail de IDENTIFIER_TAKEN traz identifier_type = NAME_VARIANT');

-- Inativo não bloqueia; reativar conflitando bloqueia
insert into public.receiver_identifiers (id, receiver_id, identifier_type, value)
values ('f5000000-0000-4000-8000-0000000000e1', 'f4000000-0000-4000-8000-000000000001', 'PIX_KEY', 'chave.temp@example.com');
update public.receiver_identifiers set active = false where id = 'f5000000-0000-4000-8000-0000000000e1';
select lives_ok(
  $$insert into public.receiver_identifiers (id, receiver_id, identifier_type, value)
    values ('f5000000-0000-4000-8000-0000000000e2', 'f4000000-0000-4000-8000-000000000003', 'PIX_KEY', 'chave.temp@example.com')$$,
  'Chave Pix inativa de outro recebedor não bloqueia o mesmo valor');
select is(pg_temp.err_of($$update public.receiver_identifiers set active = true where id = 'f5000000-0000-4000-8000-0000000000e1'$$),
  '23505|IDENTIFIER_TAKEN', 'Reativar identificador cujo valor agora é de outro recebedor -> IDENTIFIER_TAKEN');

-- I-10
select is(pg_temp.err_of($$update public.receiver_identifiers set value = 'outra@example.com' where id = 'f5000000-0000-4000-8000-000000000002'$$),
  'P0001|IMMUTABLE_FIELD', 'Identificador: a coluna "value" não muda (I-10)');
select is(pg_temp.err_of($$update public.receiver_identifiers set normalized_value = 'x' where id = 'f5000000-0000-4000-8000-000000000002'$$),
  'P0001|IMMUTABLE_FIELD', 'Identificador: o valor normalizado não muda');
select is(pg_temp.err_of($$update public.receiver_identifiers set receiver_id = 'f4000000-0000-4000-8000-000000000003' where id = 'f5000000-0000-4000-8000-000000000002'$$),
  'P0001|IMMUTABLE_FIELD', 'Identificador: o recebedor dono não muda');
select is(pg_temp.err_of($$update public.receiver_identifiers set active = false where id = 'f5000000-0000-4000-8000-000000000003'$$),
  'ok', 'Identificador: "active" muda');

-- I-11: variação de nome no espaço de nomes do sócio
insert into public.partner_aliases (partner_id, alias) values ('f2000000-0000-4000-8000-000000000001', 'Alfa Dois');
select is(pg_temp.err_of($$insert into public.receiver_identifiers (receiver_id, identifier_type, value)
                           values ('f4000000-0000-4000-8000-000000000003', 'NAME_VARIANT', 'ALFA DOIS')$$),
  '23505|PARTNER_NAME_TAKEN', 'Variação de nome igual ao apelido de OUTRO sócio -> PARTNER_NAME_TAKEN');
select is(pg_temp.err_of($$insert into public.receiver_identifiers (receiver_id, identifier_type, value)
                           values ('f4000000-0000-4000-8000-000000000003', 'NAME_VARIANT', 'Sócio Teste A')$$),
  '23505|PARTNER_NAME_TAKEN', 'Variação de nome igual ao nome de outro sócio -> PARTNER_NAME_TAKEN');
select is(pg_temp.err_of($$insert into public.receiver_identifiers (receiver_id, identifier_type, value)
                           values ('f4000000-0000-4000-8000-000000000001', 'NAME_VARIANT', 'ALFA DOIS')$$),
  'ok', 'Variação de nome igual ao apelido do MESMO sócio é aceita');
select is(pg_temp.err_of($$insert into public.partner_aliases (partner_id, alias) values ('f2000000-0000-4000-8000-000000000002', 'S. Teste A')$$),
  '23505|PARTNER_NAME_TAKEN', 'Apelido de sócio igual à variação de nome de recebedor de OUTRO sócio -> PARTNER_NAME_TAKEN');
select is(pg_temp.detail_of($$insert into public.partner_aliases (partner_id, alias) values ('f2000000-0000-4000-8000-000000000002', 'S. Teste A')$$) #>> '{owner,via}',
  'NAME_VARIANT', 'O detail indica que o dono é uma variação de nome de recebedor');
select is(pg_temp.err_of($$insert into public.partners (name) values ('s teste a')$$),
  '23505|PARTNER_NAME_TAKEN', 'Sócio novo com o nome de uma variação de recebedor de outro sócio -> PARTNER_NAME_TAKEN');

-- -----------------------------------------------------------------------------
-- Inativação do sócio (I-02 b, I-05 b): precisa de clientes; inseridos como postgres
-- -----------------------------------------------------------------------------
insert into public.clients (id, legal_name, default_monthly_value, active) values
  ('f6000000-0000-4000-8000-000000000001', 'Cliente Teste Ativo', 100, true),
  ('f6000000-0000-4000-8000-000000000002', 'Cliente Teste Inativo', 100, false);
insert into public.client_partners (client_id, partner_id) values
  ('f6000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001'),
  ('f6000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000002');

select is(pg_temp.err_of($$update public.partners set active = false where id = 'f2000000-0000-4000-8000-000000000001'$$),
  'P0001|PARTNER_HAS_CLIENTS', 'Sócio indicado em cliente ATIVO não é inativado');
select is(pg_temp.detail_of($$update public.partners set active = false where id = 'f2000000-0000-4000-8000-000000000001'$$) #>> '{clients,0,name}',
  'Cliente Teste Ativo', 'O detail lista os clientes que bloqueiam');
select is(pg_temp.err_of($$update public.partners set active = false where id = 'f2000000-0000-4000-8000-000000000002'$$),
  'P0001|PARTNER_HAS_CLIENTS', 'Sócio indicado só em cliente INATIVO também não é inativado (RAT-D025)');
select is((pg_temp.detail_of($$update public.partners set active = false where id = 'f2000000-0000-4000-8000-000000000002'$$) #>> '{clients,0,active}')::boolean,
  false, 'O detail mostra que o cliente bloqueante está inativo');

insert into public.receivers (id, partner_id, holder_name)
values ('f4000000-0000-4000-8000-000000000005', 'f2000000-0000-4000-8000-000000000004', 'Titular Fictício D1');
select is(pg_temp.err_of($$update public.partners set active = false where id = 'f2000000-0000-4000-8000-000000000004'$$),
  'P0001|PARTNER_HAS_ACTIVE_RECEIVERS', 'Sócio com recebedor ativo não é inativado pelo trigger (defesa)');
update public.receivers set active = false where id = 'f4000000-0000-4000-8000-000000000005';
select is(pg_temp.err_of($$update public.partners set active = false where id = 'f2000000-0000-4000-8000-000000000004'$$),
  'ok', 'Sócio sem indicação e sem recebedor ativo é inativado');
select is(pg_temp.err_of($$update public.partners set active = true where id = 'f2000000-0000-4000-8000-000000000004'$$),
  'ok', 'Reativar o sócio não é bloqueado');
select is((select active from public.receivers where id = 'f4000000-0000-4000-8000-000000000005'), false,
  'Reativar o sócio não reativa os recebedores');
select is(pg_temp.err_of($$update public.partners set updated_at = now() where id = 'f2000000-0000-4000-8000-000000000001'$$),
  'ok', 'Tocar o updated_at do sócio (versão dos filhos) passa pela guarda');

-- -----------------------------------------------------------------------------
-- DELETE e TRUNCATE (I-14): bloqueados até para postgres
-- -----------------------------------------------------------------------------
select throws_ok($$delete from public.partner_aliases$$,       '42501', null, 'DELETE em partner_aliases é recusado');
select throws_ok($$delete from public.receivers$$,             '42501', null, 'DELETE em receivers é recusado');
select throws_ok($$delete from public.receiver_identifiers$$,  '42501', null, 'DELETE em receiver_identifiers é recusado');
select throws_ok($$truncate public.partner_aliases cascade$$,       '42501', null, 'TRUNCATE em partner_aliases é recusado');
select throws_ok($$truncate public.receivers cascade$$,             '42501', null, 'TRUNCATE em receivers é recusado');
select throws_ok($$truncate public.receiver_identifiers cascade$$,  '42501', null, 'TRUNCATE em receiver_identifiers é recusado');

-- =============================================================================
-- FUNÇÕES DE GRAVAÇÃO (migration 0300) · como Administrador, pelas funções públicas
-- save_partner, set_partner_active, save_receiver, set_receiver_active (modelagem 6.4.1 a 6.4.4)
-- Fixtures próprios (prefixo "Rpc"); "aged" = updated_at antigo, para provar quando a versão muda
-- (dentro da transação do pgTAP, now() não avança).
-- Os papéis negados estão em 10; a auditoria das funções, em 11.
-- =============================================================================
insert into auth.users (id, email) values ('a1000000-0000-4000-8000-000000000001', 'pgtap-admin-rpc@example.com');
select private.set_user_access('pgtap-admin-rpc@example.com', 'ADMINISTRATOR', null, true, 'fixture de teste', 'pgtap');

create function pg_temp.pid(p text) returns uuid language sql as $$ select id from public.partners where name = p $$;
create function pg_temp.pv(p text) returns timestamptz language sql as $$ select updated_at from public.partners where name = p $$;
create function pg_temp.rid(p text) returns uuid language sql as $$ select id from public.receivers where holder_name = p $$;
create function pg_temp.rv(p text) returns timestamptz language sql as $$ select updated_at from public.receivers where holder_name = p $$;

insert into public.partners (id, name, active, updated_at) values
  ('a2000000-0000-4000-8000-000000000001', 'Sócio Rpc Antigo',     true,  '2020-01-01 00:00:00+00'),
  ('a2000000-0000-4000-8000-000000000002', 'Sócio Rpc Cli',        true,  '2020-01-01 00:00:00+00'),
  ('a2000000-0000-4000-8000-000000000003', 'Sócio Rpc CliInativo', true,  '2020-01-01 00:00:00+00'),
  ('a2000000-0000-4000-8000-000000000004', 'Sócio Rpc Casc',       true,  '2020-01-01 00:00:00+00'),
  ('a2000000-0000-4000-8000-000000000005', 'Sócio Rpc Livre',      true,  '2020-01-01 00:00:00+00'),
  ('a2000000-0000-4000-8000-000000000006', 'Sócio Rpc Inativo',    false, '2020-01-01 00:00:00+00'),
  ('a2000000-0000-4000-8000-000000000007', 'Sócio Rpc Rec',        true,  '2020-01-01 00:00:00+00');
insert into public.clients (id, legal_name, default_monthly_value, active) values
  ('a6000000-0000-4000-8000-000000000001', 'Cliente Rpc Ativo',   100, true),
  ('a6000000-0000-4000-8000-000000000002', 'Cliente Rpc Inativo', 100, false);
insert into public.client_partners (client_id, partner_id) values
  ('a6000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002'),
  ('a6000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000003');
insert into public.receivers (id, partner_id, holder_name, active, updated_at) values
  ('a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000004', 'Titular Rpc Casc 1',   true,  '2020-01-01 00:00:00+00'),
  ('a4000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000004', 'Titular Rpc Casc 2',   true,  '2020-01-01 00:00:00+00'),
  ('a4000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000004', 'Titular Rpc Casc 3',   false, '2020-01-01 00:00:00+00'),
  ('a4000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000006', 'Titular Rpc Inativo',  false, '2020-01-01 00:00:00+00'),
  ('a4000000-0000-4000-8000-000000000005', 'a2000000-0000-4000-8000-000000000007', 'Titular Rpc Antigo',   true,  '2020-01-01 00:00:00+00');
insert into public.receiver_identifiers (receiver_id, identifier_type, value) values
  ('a4000000-0000-4000-8000-000000000005', 'PIX_KEY', 'antigo.rpc@example.com'),
  ('a4000000-0000-4000-8000-000000000005', 'NAME_VARIANT', 'Antigo Rpc');
select private.set_audit_context(null, null, null, null);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- -----------------------------------------------------------------------------
-- save_partner
-- -----------------------------------------------------------------------------
select is((select name from public.save_partner(null, '  Sócio Rpc Alfa ', array['S. Alfa', 'Alfa Rpc', 's alfa.'], null)),
  'Sócio Rpc Alfa', 'save_partner cria o sócio (nome sem as bordas em branco)');
select is((select count(*) from public.partner_aliases where partner_id = pg_temp.pid('Sócio Rpc Alfa') and active), 2::bigint,
  'save_partner: apelidos repetidos (mesmo valor normalizado) viram um só');
select is((select active from public.partners where name = 'Sócio Rpc Alfa'), true, 'O sócio novo nasce ativo');

select is(pg_temp.err_of($$select public.save_partner(null, 'socio rpc alfa.', '{}'::text[], null)$$),
  '23505|PARTNER_NAME_TAKEN', 'Nome repetido por grafia -> PARTNER_NAME_TAKEN');
select is(pg_temp.detail_of($$select public.save_partner(null, 'socio rpc alfa.', '{}'::text[], null)$$) #>> '{owner,id}',
  pg_temp.pid('Sócio Rpc Alfa')::text, 'O detail traz o sócio dono do nome');

select is((select name from public.save_partner(null, 'Sócio Rpc Beta', array['Beta Rpc'], null)),
  'Sócio Rpc Beta', 'save_partner cria um segundo sócio');
select is(pg_temp.err_of($$select public.save_partner(pg_temp.pid('Sócio Rpc Alfa'), 'Sócio Rpc Alfa', array['S. Alfa', 'Socio Rpc Beta'], pg_temp.pv('Sócio Rpc Alfa'))$$),
  '23505|PARTNER_NAME_TAKEN', 'Apelido igual ao nome de outro sócio -> PARTNER_NAME_TAKEN');
select is(pg_temp.detail_of($$select public.save_partner(pg_temp.pid('Sócio Rpc Alfa'), 'Sócio Rpc Alfa', array['S. Alfa', 'Socio Rpc Beta'], pg_temp.pv('Sócio Rpc Alfa'))$$) ->> 'field',
  'aliases', 'O detail diz que o texto veio dos apelidos');
select is(pg_temp.err_of($$select public.save_partner(pg_temp.pid('Sócio Rpc Alfa'), 'Sócio Rpc Alfa', array['S. Alfa', 'BETA RPC'], pg_temp.pv('Sócio Rpc Alfa'))$$),
  '23505|PARTNER_NAME_TAKEN', 'Apelido igual ao apelido ativo de outro sócio -> PARTNER_NAME_TAKEN');
select is(pg_temp.err_of($$select public.save_partner(pg_temp.pid('Sócio Rpc Alfa'), 'Sócio Rpc Alfa', array['S. Alfa', 'Sócio Rpc Alfa'], pg_temp.pv('Sócio Rpc Alfa'))$$),
  'ok', 'Apelido igual ao nome do PRÓPRIO sócio é aceito');
select is((select count(*) from public.partner_aliases where partner_id = pg_temp.pid('Sócio Rpc Alfa') and active), 2::bigint,
  'O apelido igual ao próprio nome ficou ativo (2 ativos; Alfa Rpc saiu da lista)');

-- Estado final: retirar da lista inativa a linha (nunca exclui); devolver o texto reativa a MESMA linha.
select is((select count(*) from public.save_partner(pg_temp.pid('Sócio Rpc Alfa'), 'Sócio Rpc Alfa', array['S. Alfa'], pg_temp.pv('Sócio Rpc Alfa'))), 1::bigint,
  'save_partner devolve a linha do sócio');
select results_eq(
  $$select count(*) filter (where active), count(*) from public.partner_aliases where partner_id = pg_temp.pid('Sócio Rpc Alfa')$$,
  $$values (1::bigint, 3::bigint)$$,
  'Retirar apelidos da lista os inativa; as linhas continuam existindo');
select is(pg_temp.err_of($$select public.save_partner(pg_temp.pid('Sócio Rpc Alfa'), 'Sócio Rpc Alfa', array['S. Alfa', 'ALFA RPC'], pg_temp.pv('Sócio Rpc Alfa'))$$),
  'ok', 'Devolver o texto de um apelido inativo (outra grafia) o reativa');
select results_eq(
  $$select count(*) filter (where active), count(*), min(alias) filter (where normalized_value = 'alfa rpc') from public.partner_aliases where partner_id = pg_temp.pid('Sócio Rpc Alfa')$$,
  $$values (2::bigint, 3::bigint, 'Alfa Rpc'::text)$$,
  'A reativação reutiliza a mesma linha (nenhuma linha nova; texto original preservado)');

-- Sem mudança: nenhuma escrita, nenhuma linha de auditoria, updated_at inalterado (fixture antigo).
select is((select count(*) from public.save_partner('a2000000-0000-4000-8000-000000000001', 'Sócio Rpc Antigo', '{}'::text[], '2020-01-01 00:00:00+00', null, 'c1000000-0000-4000-8000-000000000001')),
  1::bigint, 'save_partner sem mudança devolve a linha');
select is((select count(*) from public.audit_logs where correlation_id = 'c1000000-0000-4000-8000-000000000001'), 0::bigint,
  'Salvar sem mudança não gera linha de auditoria');
select is((select updated_at from public.partners where id = 'a2000000-0000-4000-8000-000000000001'),
  '2020-01-01 00:00:00+00'::timestamptz, 'Salvar sem mudança não toca o updated_at');

-- Só apelidos mudaram: o updated_at do sócio muda; o sócio em si não gera UPDATE.
select is((select count(*) from public.save_partner('a2000000-0000-4000-8000-000000000001', 'Sócio Rpc Antigo', array['Apelido Rpc Antigo'], '2020-01-01 00:00:00+00', null, 'c1000000-0000-4000-8000-000000000002')),
  1::bigint, 'save_partner só com apelido novo grava');
select cmp_ok((select updated_at from public.partners where id = 'a2000000-0000-4000-8000-000000000001'), '>', '2020-01-01 00:00:00+00'::timestamptz,
  'Mudar só os apelidos toca o updated_at do sócio (versão dos filhos)');
select results_eq(
  $$select entity, action from public.audit_logs where correlation_id = 'c1000000-0000-4000-8000-000000000002' order by seq$$,
  $$values ('partner_alias'::text, 'CREATE'::text)$$,
  'Só o apelido gera linha de auditoria (o toque no updated_at não gera)');

-- Renomear: UPDATE do sócio só com as colunas alteradas.
select is((select name from public.save_partner(pg_temp.pid('Sócio Rpc Beta'), 'Sócio Rpc Beta Renomeado', array['Beta Rpc'], pg_temp.pv('Sócio Rpc Beta'), null, 'c1000000-0000-4000-8000-000000000003')),
  'Sócio Rpc Beta Renomeado', 'save_partner renomeia o sócio');
select ok((select new_data ? 'name' and not new_data ? 'updated_at' from public.audit_logs
            where correlation_id = 'c1000000-0000-4000-8000-000000000003' and entity = 'partner'),
  'O UPDATE do sócio grava o nome novo, sem updated_at');

-- Versão e validações
select is(pg_temp.err_of($$select public.save_partner(pg_temp.pid('Sócio Rpc Alfa'), 'Sócio Rpc Alfa', array['S. Alfa'], '2019-01-01 00:00:00+00')$$),
  'P0001|STALE_VERSION', 'Versão antiga -> STALE_VERSION');
select is(pg_temp.detail_of($$select public.save_partner(pg_temp.pid('Sócio Rpc Alfa'), 'Sócio Rpc Alfa', array['S. Alfa'], '2019-01-01 00:00:00+00')$$) ->> 'current_updated_at' is not null,
  true, 'O detail de STALE_VERSION traz o updated_at atual');
select is(pg_temp.err_of($$select public.save_partner(pg_temp.pid('Sócio Rpc Alfa'), 'Sócio Rpc Alfa', array['S. Alfa'], null)$$),
  '22023|VERSION_REQUIRED', 'Edição sem versão -> VERSION_REQUIRED');
select is(pg_temp.err_of($$select public.save_partner(null, '   ', '{}'::text[], null)$$), '22023|NAME_REQUIRED', 'Nome em branco -> NAME_REQUIRED');
select is(pg_temp.err_of($$select public.save_partner(null, ' . - ', '{}'::text[], null)$$), '22023|NAME_REQUIRED', 'Nome só com pontuação -> NAME_REQUIRED');
select is(pg_temp.err_of($$select public.save_partner(null, repeat('a', 201), '{}'::text[], null)$$), '22023|NAME_TOO_LONG', 'Nome acima de 200 -> NAME_TOO_LONG');
select is(pg_temp.err_of($$select public.save_partner(null, 'Sócio Rpc Gama', array['Gama', ' '], null)$$), '22023|NAME_REQUIRED', 'Apelido em branco -> NAME_REQUIRED');
select is(pg_temp.err_of($$select public.save_partner(null, 'Sócio Rpc Gama', array[repeat('a', 201)], null)$$), '22023|NAME_TOO_LONG', 'Apelido acima de 200 -> NAME_TOO_LONG');
select is((select count(*) from public.partners where name like 'Sócio Rpc Gama%'), 0::bigint, 'Gravação tudo ou nada: o erro no apelido não deixa o sócio criado');
select is(pg_temp.err_of($$select public.save_partner(gen_random_uuid(), 'Sócio Rpc X', '{}'::text[], now())$$), 'P0002|NOT_FOUND', 'Id inexistente -> NOT_FOUND');

-- Tudo ou nada na edição: o conflito do apelido desfaz também a troca do nome.
select is(pg_temp.err_of($$select public.save_partner(pg_temp.pid('Sócio Rpc Alfa'), 'Sócio Rpc Alfa Novo', array['S. Alfa', 'Beta Rpc'], pg_temp.pv('Sócio Rpc Alfa'))$$),
  '23505|PARTNER_NAME_TAKEN', 'Conflito de apelido na edição é recusado');
select is((select count(*) from public.partners where name = 'Sócio Rpc Alfa'), 1::bigint, 'Tudo ou nada: o nome não mudou quando o apelido falhou');

-- Lista nula é RECUSADA (não apaga apelidos por descuido); a lista vazia significa "nenhum apelido".
select is(pg_temp.err_of($$select public.save_partner(pg_temp.pid('Sócio Rpc Beta Renomeado'), 'Sócio Rpc Beta Renomeado', null, pg_temp.pv('Sócio Rpc Beta Renomeado'))$$),
  '22023|LIST_REQUIRED', 'save_partner com lista de apelidos nula -> LIST_REQUIRED');
select is(pg_temp.detail_of($$select public.save_partner(pg_temp.pid('Sócio Rpc Beta Renomeado'), 'Sócio Rpc Beta Renomeado', null, pg_temp.pv('Sócio Rpc Beta Renomeado'))$$) ->> 'field',
  'aliases', 'O detail de LIST_REQUIRED diz que a lista é a de apelidos');
select is((select count(*) from public.partner_aliases where partner_id = pg_temp.pid('Sócio Rpc Beta Renomeado') and active), 1::bigint,
  'Lista nula recusada: nenhum apelido foi inativado');
select is((select count(*) from public.save_partner(pg_temp.pid('Sócio Rpc Beta Renomeado'), 'Sócio Rpc Beta Renomeado', '{}'::text[], pg_temp.pv('Sócio Rpc Beta Renomeado'))), 1::bigint,
  'save_partner com lista vazia');
select is((select count(*) from public.partner_aliases where partner_id = pg_temp.pid('Sócio Rpc Beta Renomeado') and active), 0::bigint,
  'Lista vazia significa nenhum apelido: inativa todos');
select is(pg_temp.err_of($$select public.save_partner('a2000000-0000-4000-8000-000000000006', 'Sócio Rpc Inativo', array['Apelido Inativo Rpc'], '2020-01-01 00:00:00+00')$$),
  'ok', 'Sócio inativo pode ser editado (UI 5.2)');

-- -----------------------------------------------------------------------------
-- set_partner_active: inativação bloqueada por indicação
-- -----------------------------------------------------------------------------
select is(pg_temp.err_of($$select public.set_partner_active('a2000000-0000-4000-8000-000000000002', false, '2020-01-01 00:00:00+00')$$),
  'P0001|PARTNER_HAS_CLIENTS', 'Sócio indicado em cliente ATIVO -> PARTNER_HAS_CLIENTS');
select is(pg_temp.detail_of($$select public.set_partner_active('a2000000-0000-4000-8000-000000000002', false, '2020-01-01 00:00:00+00')$$) #>> '{clients,0,name}',
  'Cliente Rpc Ativo', 'O detail lista o cliente que bloqueia');
select is(pg_temp.err_of($$select public.set_partner_active('a2000000-0000-4000-8000-000000000003', false, '2020-01-01 00:00:00+00')$$),
  'P0001|PARTNER_HAS_CLIENTS', 'Sócio indicado só em cliente INATIVO também é bloqueado (RAT-D025)');
select is((pg_temp.detail_of($$select public.set_partner_active('a2000000-0000-4000-8000-000000000003', false, '2020-01-01 00:00:00+00')$$) #>> '{clients,0,active}')::boolean,
  false, 'O detail mostra que o cliente bloqueante está inativo');
select is((select active from public.partners where id = 'a2000000-0000-4000-8000-000000000002'), true, 'Bloqueado: o sócio continua ativo');

-- Cascata dos recebedores (RAT-D025): só se a lista confirmada for a atual
select is(pg_temp.err_of($$select public.set_partner_active('a2000000-0000-4000-8000-000000000004', false, '2020-01-01 00:00:00+00', array['a4000000-0000-4000-8000-000000000001']::uuid[])$$),
  'P0001|RECEIVERS_CHANGED', 'Lista confirmada incompleta -> RECEIVERS_CHANGED');
select is(jsonb_array_length(pg_temp.detail_of($$select public.set_partner_active('a2000000-0000-4000-8000-000000000004', false, '2020-01-01 00:00:00+00', array['a4000000-0000-4000-8000-000000000001']::uuid[])$$) -> 'receivers'),
  2, 'O detail de RECEIVERS_CHANGED traz a lista atual (2 recebedores ativos)');
select is(pg_temp.err_of($$select public.set_partner_active('a2000000-0000-4000-8000-000000000004', false, '2020-01-01 00:00:00+00')$$),
  'P0001|RECEIVERS_CHANGED', 'Lista confirmada nula (= vazia) com recebedores ativos -> RECEIVERS_CHANGED');
select is(pg_temp.err_of($$select public.set_partner_active('a2000000-0000-4000-8000-000000000004', false, '2020-01-01 00:00:00+00', array['a4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000003']::uuid[])$$),
  'P0001|RECEIVERS_CHANGED', 'Lista confirmada com recebedor que não está ativo -> RECEIVERS_CHANGED');
select is((select count(*) from public.receivers where partner_id = 'a2000000-0000-4000-8000-000000000004' and active), 2::bigint,
  'Recusado: nenhum recebedor foi inativado');
select is((select active from public.partners where id = 'a2000000-0000-4000-8000-000000000004'), true, 'Recusado: o sócio continua ativo');

select is((select active from public.set_partner_active('a2000000-0000-4000-8000-000000000004', false, '2020-01-01 00:00:00+00',
            array['a4000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001']::uuid[])),
  false, 'Inativação com a lista confirmada (qualquer ordem, repetidos ignorados): sócio inativo');
select is((select count(*) from public.receivers where partner_id = 'a2000000-0000-4000-8000-000000000004' and active), 0::bigint,
  'Os dois recebedores ativos foram inativados junto');
select is((select active from public.receivers where id = 'a4000000-0000-4000-8000-000000000003'), false, 'O recebedor que já estava inativo continua inativo');

-- Idempotência e versão
select is((select active from public.set_partner_active('a2000000-0000-4000-8000-000000000004', false, '2019-01-01 00:00:00+00', null, null, 'c1000000-0000-4000-8000-000000000004')),
  false, 'Repetir a inativação devolve a linha, mesmo com versão antiga (duplo clique não vira conflito)');
select is((select count(*) from public.audit_logs where correlation_id = 'c1000000-0000-4000-8000-000000000004'), 0::bigint,
  'Repetir a inativação não escreve nada');
select is(pg_temp.err_of($$select public.set_partner_active('a2000000-0000-4000-8000-000000000004', true, '2019-01-01 00:00:00+00')$$),
  'P0001|STALE_VERSION', 'Reativar com versão antiga -> STALE_VERSION');
select is(pg_temp.err_of($$select public.set_partner_active('a2000000-0000-4000-8000-000000000004', true, null)$$),
  '22023|VERSION_REQUIRED', 'Reativar sem versão -> VERSION_REQUIRED');
select is((select active from public.set_partner_active('a2000000-0000-4000-8000-000000000004', true, pg_temp.pv('Sócio Rpc Casc'))),
  true, 'Reativar o sócio');
select is((select count(*) from public.receivers where partner_id = 'a2000000-0000-4000-8000-000000000004' and active), 0::bigint,
  'Reativar o sócio NÃO reativa os recebedores (R-S05)');
select is((select active from public.set_partner_active('a2000000-0000-4000-8000-000000000004', true, '2019-01-01 00:00:00+00')),
  true, 'Reativar quem já está ativo devolve a linha sem checar a versão');

-- Sócio sem indicação e sem recebedor: inativa sem lista; validações
select is(pg_temp.err_of($$select public.set_partner_active('a2000000-0000-4000-8000-000000000005', false, null)$$),
  '22023|VERSION_REQUIRED', 'Inativar sem versão -> VERSION_REQUIRED');
select is(pg_temp.err_of($$select public.set_partner_active('a2000000-0000-4000-8000-000000000005', false, '2019-01-01 00:00:00+00')$$),
  'P0001|STALE_VERSION', 'Inativar com versão antiga -> STALE_VERSION');
select is(pg_temp.err_of($$select public.set_partner_active('a2000000-0000-4000-8000-000000000005', null, '2020-01-01 00:00:00+00')$$),
  '22023|ACTIVE_REQUIRED', 'Situação desejada nula -> ACTIVE_REQUIRED');
select is(pg_temp.err_of($$select public.set_partner_active(gen_random_uuid(), false, now())$$), 'P0002|NOT_FOUND', 'Sócio inexistente -> NOT_FOUND');
select is((select active from public.set_partner_active('a2000000-0000-4000-8000-000000000005', false, '2020-01-01 00:00:00+00')),
  false, 'Sócio sem indicação e sem recebedor ativo é inativado sem lista');

-- -----------------------------------------------------------------------------
-- save_receiver
-- -----------------------------------------------------------------------------
select is((select holder_name from public.save_receiver(null, pg_temp.pid('Sócio Rpc Alfa'), ' Titular Rpc Alfa 1 ', '[
    {"type":"NAME_VARIANT","value":"Alfa Titular"},
    {"type":"PIX_KEY","value":"Alfa.Rpc@Example.com"},
    {"type":"PIX_KEY","value":"+55 (23) 90000-1111"},
    {"type":"PIX_KEY","value":"alfa.rpc@example.com"},
    {"type":"BANK_ACCOUNT","bank_name":"Banco Exemplo","branch":"0001","account_number":"11111-1"},
    {"type":"BANK_ACCOUNT","bank_name":"Banco Exemplo","branch":"0002","account_number":"22222-2"}]'::jsonb, null)),
  'Titular Rpc Alfa 1', 'save_receiver cria o recebedor com variação, 2 chaves Pix e 2 contas (U-C04)');
select set_eq(
  $$select identifier_type::text, normalized_value from public.receiver_identifiers where receiver_id = pg_temp.rid('Titular Rpc Alfa 1')$$,
  $$values ('NAME_VARIANT'::text, 'alfa titular'), ('PIX_KEY', 'alfa.rpc@example.com'), ('PIX_KEY', '+5523900001111'),
           ('BANK_ACCOUNT', 'banco exemplo|1|111111'), ('BANK_ACCOUNT', 'banco exemplo|2|222222')$$,
  'Cinco identificadores ativos; a chave repetida (outra grafia) virou uma só; valores normalizados');
select is((select partner_id from public.receivers where holder_name = 'Titular Rpc Alfa 1'), pg_temp.pid('Sócio Rpc Alfa'),
  'O recebedor ficou ligado ao sócio informado');

select is(pg_temp.err_of($$select public.save_receiver(null, pg_temp.pid('Sócio Rpc Beta Renomeado'), 'Titular Rpc Beta X', '[{"type":"PIX_KEY","value":"ALFA.RPC@example.com"}]'::jsonb, null)$$),
  '23505|IDENTIFIER_TAKEN', 'Chave Pix ativa de outro recebedor -> IDENTIFIER_TAKEN');
select is(pg_temp.detail_of($$select public.save_receiver(null, pg_temp.pid('Sócio Rpc Beta Renomeado'), 'Titular Rpc Beta X', '[{"type":"PIX_KEY","value":"ALFA.RPC@example.com"}]'::jsonb, null)$$) #>> '{owner,name}',
  'Titular Rpc Alfa 1', 'O detail traz o titular dono da chave');
select is(pg_temp.detail_of($$select public.save_receiver(null, pg_temp.pid('Sócio Rpc Beta Renomeado'), 'Titular Rpc Beta X', '[{"type":"PIX_KEY","value":"ALFA.RPC@example.com"}]'::jsonb, null)$$) #>> '{owner,partner_name}',
  'Sócio Rpc Alfa', 'O detail traz o sócio do titular dono');
select is(pg_temp.detail_of($$select public.save_receiver(null, pg_temp.pid('Sócio Rpc Beta Renomeado'), 'Titular Rpc Beta X', '[{"type":"PIX_KEY","value":"ALFA.RPC@example.com"}]'::jsonb, null)$$) ->> 'identifier_type',
  'PIX_KEY', 'save_receiver: o detail de IDENTIFIER_TAKEN traz identifier_type');
select is(pg_temp.err_of($$select public.save_receiver(null, pg_temp.pid('Sócio Rpc Beta Renomeado'), 'Titular Rpc Beta X', '[{"type":"BANK_ACCOUNT","bank_name":"BANCO EXEMPLO","branch":"1","account_number":"11111-1"}]'::jsonb, null)$$),
  '23505|IDENTIFIER_TAKEN', 'Mesma conta (banco, agência e conta normalizados) em outro recebedor -> IDENTIFIER_TAKEN');
select is((select count(*) from public.receivers where holder_name = 'Titular Rpc Beta X'), 0::bigint, 'Tudo ou nada: o recebedor não ficou criado');

select is(pg_temp.err_of($$select public.save_receiver(null, pg_temp.pid('Sócio Rpc Beta Renomeado'), 'Titular Rpc Beta X', '[{"type":"NAME_VARIANT","value":"S Alfa"}]'::jsonb, null)$$),
  '23505|PARTNER_NAME_TAKEN', 'Variação igual ao apelido de OUTRO sócio -> PARTNER_NAME_TAKEN');
select is(pg_temp.detail_of($$select public.save_receiver(null, pg_temp.pid('Sócio Rpc Beta Renomeado'), 'Titular Rpc Beta X', '[{"type":"NAME_VARIANT","value":"S Alfa"}]'::jsonb, null)$$) ->> 'field',
  'identifiers', 'O detail diz que o texto veio dos identificadores');
select is((select holder_name from public.save_receiver(null, pg_temp.pid('Sócio Rpc Alfa'), 'Titular Rpc Alfa 2', '[{"type":"NAME_VARIANT","value":"S Alfa"}]'::jsonb, null)),
  'Titular Rpc Alfa 2', 'Variação igual ao apelido do MESMO sócio é aceita');

select is(pg_temp.err_of($$select public.save_receiver(null, 'a2000000-0000-4000-8000-000000000006', 'Titular Rpc Novo', '[]'::jsonb, null)$$),
  'P0001|PARTNER_INACTIVE', 'Recebedor novo de sócio inativo -> PARTNER_INACTIVE');
select is(pg_temp.detail_of($$select public.save_receiver(null, 'a2000000-0000-4000-8000-000000000006', 'Titular Rpc Novo', '[]'::jsonb, null)$$) #>> '{partners,0,id}',
  'a2000000-0000-4000-8000-000000000006', 'O detail de PARTNER_INACTIVE lista o sócio');
select is(pg_temp.err_of($$select public.save_receiver(null, gen_random_uuid(), 'Titular Rpc Novo', '[]'::jsonb, null)$$), 'P0002|NOT_FOUND', 'Sócio inexistente -> NOT_FOUND');
select is(pg_temp.err_of($$select public.save_receiver(null, null, 'Titular Rpc Novo', '[]'::jsonb, null)$$), 'P0002|NOT_FOUND', 'Recebedor novo sem sócio -> NOT_FOUND');
select is(pg_temp.err_of($$select public.save_receiver(gen_random_uuid(), null, 'Titular Rpc Novo', '[]'::jsonb, now())$$), 'P0002|NOT_FOUND', 'Recebedor inexistente -> NOT_FOUND');

-- Sócio imutável; nulo ou o mesmo sócio na edição é aceito
select is(pg_temp.err_of($$select public.save_receiver(pg_temp.rid('Titular Rpc Alfa 2'), pg_temp.pid('Sócio Rpc Beta Renomeado'), 'Titular Rpc Alfa 2', '[{"type":"NAME_VARIANT","value":"S Alfa"}]'::jsonb, pg_temp.rv('Titular Rpc Alfa 2'))$$),
  'P0001|RECEIVER_PARTNER_IMMUTABLE', 'Trocar o sócio do recebedor -> RECEIVER_PARTNER_IMMUTABLE');
select is(pg_temp.err_of($$select public.save_receiver(pg_temp.rid('Titular Rpc Alfa 2'), pg_temp.pid('Sócio Rpc Alfa'), 'Titular Rpc Alfa 2', '[{"type":"NAME_VARIANT","value":"S Alfa"}]'::jsonb, pg_temp.rv('Titular Rpc Alfa 2'))$$),
  'ok', 'Edição com o mesmo sócio é aceita');
select is(pg_temp.err_of($$select public.save_receiver(pg_temp.rid('Titular Rpc Alfa 2'), null, 'Titular Rpc Alfa 2', '[{"type":"NAME_VARIANT","value":"S Alfa"}]'::jsonb, pg_temp.rv('Titular Rpc Alfa 2'))$$),
  'ok', 'Edição com o sócio nulo é aceita');

-- Estado final dos identificadores: inativa os ausentes e reativa a mesma linha
select is((select count(*) from public.save_receiver(pg_temp.rid('Titular Rpc Alfa 1'), null, 'Titular Rpc Alfa 1',
    '[{"type":"NAME_VARIANT","value":"Alfa Titular"},{"type":"PIX_KEY","value":"alfa.rpc@example.com"}]'::jsonb, pg_temp.rv('Titular Rpc Alfa 1'))),
  1::bigint, 'save_receiver devolve a linha do recebedor');
select results_eq(
  $$select count(*) filter (where active), count(*) from public.receiver_identifiers where receiver_id = pg_temp.rid('Titular Rpc Alfa 1')$$,
  $$values (2::bigint, 5::bigint)$$,
  'Identificadores ausentes da lista foram inativados; nenhuma linha foi excluída');
select is(pg_temp.err_of($$select public.save_receiver(pg_temp.rid('Titular Rpc Alfa 1'), null, 'Titular Rpc Alfa 1',
    '[{"type":"NAME_VARIANT","value":"Alfa Titular"},{"type":"PIX_KEY","value":"alfa.rpc@example.com"},
      {"type":"BANK_ACCOUNT","bank_name":"banco exemplo","branch":"1","account_number":"11111.1"}]'::jsonb, pg_temp.rv('Titular Rpc Alfa 1'))$$),
  'ok', 'Devolver uma conta inativa (outra grafia) a reativa');
select results_eq(
  $$select count(*) filter (where active), count(*) from public.receiver_identifiers where receiver_id = pg_temp.rid('Titular Rpc Alfa 1')$$,
  $$values (3::bigint, 5::bigint)$$,
  'A reativação reutiliza a mesma linha (continuam 5 linhas)');

-- Sem mudança e toque no updated_at (fixture antigo, com 2 identificadores)
select is((select count(*) from public.save_receiver('a4000000-0000-4000-8000-000000000005', null, 'Titular Rpc Antigo',
    '[{"type":"PIX_KEY","value":"antigo.rpc@example.com"},{"type":"NAME_VARIANT","value":"Antigo Rpc"}]'::jsonb,
    '2020-01-01 00:00:00+00', null, 'c1000000-0000-4000-8000-000000000011')), 1::bigint, 'save_receiver sem mudança devolve a linha');
select is((select count(*) from public.audit_logs where correlation_id = 'c1000000-0000-4000-8000-000000000011'), 0::bigint,
  'Salvar o recebedor sem mudança não gera auditoria');
select is((select updated_at from public.receivers where id = 'a4000000-0000-4000-8000-000000000005'),
  '2020-01-01 00:00:00+00'::timestamptz, 'Salvar o recebedor sem mudança não toca o updated_at');
select is((select count(*) from public.save_receiver('a4000000-0000-4000-8000-000000000005', null, 'Titular Rpc Antigo',
    '[{"type":"PIX_KEY","value":"antigo.rpc@example.com"}]'::jsonb, '2020-01-01 00:00:00+00', null, 'c1000000-0000-4000-8000-000000000012')),
  1::bigint, 'save_receiver só com identificador a menos grava');
select cmp_ok((select updated_at from public.receivers where id = 'a4000000-0000-4000-8000-000000000005'), '>', '2020-01-01 00:00:00+00'::timestamptz,
  'Mudar só os identificadores toca o updated_at do recebedor (versão dos filhos)');
select results_eq(
  $$select entity, action from public.audit_logs where correlation_id = 'c1000000-0000-4000-8000-000000000012' order by seq$$,
  $$values ('receiver_identifier'::text, 'UPDATE'::text)$$,
  'Só o identificador gera linha de auditoria');

-- Titular novo
select is((select holder_name from public.save_receiver(pg_temp.rid('Titular Rpc Alfa 2'), null, 'Titular Rpc Alfa Dois',
    '[{"type":"NAME_VARIANT","value":"S Alfa"}]'::jsonb, pg_temp.rv('Titular Rpc Alfa 2'))),
  'Titular Rpc Alfa Dois', 'save_receiver troca o titular');

-- Tudo ou nada: o conflito do 2º item desfaz o titular novo e o 1º item
select is((select holder_name from public.save_receiver(null, pg_temp.pid('Sócio Rpc Beta Renomeado'), 'Titular Rpc Beta 1',
    '[{"type":"PIX_KEY","value":"beta.rpc@example.com"}]'::jsonb, null)),
  'Titular Rpc Beta 1', 'Recebedor do sócio B criado');
select is(pg_temp.err_of($$select public.save_receiver(pg_temp.rid('Titular Rpc Alfa 1'), null, 'Titular Rpc Alfa Um',
    '[{"type":"NAME_VARIANT","value":"Alfa Titular"},{"type":"PIX_KEY","value":"alfa.rpc@example.com"},
      {"type":"PIX_KEY","value":"novo.rpc@example.com"},{"type":"PIX_KEY","value":"BETA.rpc@example.com"}]'::jsonb, pg_temp.rv('Titular Rpc Alfa 1'))$$),
  '23505|IDENTIFIER_TAKEN', 'Conflito num dos itens da lista -> IDENTIFIER_TAKEN');
select is((select count(*) from public.receivers where holder_name = 'Titular Rpc Alfa 1'), 1::bigint,
  'Tudo ou nada: o titular não mudou');
select is((select count(*) from public.receiver_identifiers where normalized_value = 'novo.rpc@example.com'), 0::bigint,
  'Tudo ou nada: o item válido anterior ao conflito não foi gravado');

-- Chave Pix com formato de CPF e de CNPJ alfanumérico (RAT-D023): guardada só como chave Pix
select lives_ok(
  $$select public.save_receiver(null, pg_temp.pid('Sócio Rpc Beta Renomeado'), 'Titular Rpc Beta Pix',
      '[{"type":"PIX_KEY","value":"000.000.002-72"},{"type":"PIX_KEY","value":"12.ABC.345/01DE-35"}]'::jsonb, null)$$,
  'Chave Pix com formato de CPF e de CNPJ alfanumérico é aceita');
select set_eq(
  $$select normalized_value from public.receiver_identifiers where receiver_id = pg_temp.rid('Titular Rpc Beta Pix')$$,
  $$values ('00000000272'::text), ('12abc34501de35')$$,
  'A chave com formato de CPF ou CNPJ fica guardada só como chave Pix, sem pontuação');

-- Lista nula (SQL ou JSON null) é RECUSADA; a lista vazia significa "nenhum identificador"; recebedor inativo pode ser editado
select is(pg_temp.err_of($$select public.save_receiver(pg_temp.rid('Titular Rpc Beta Pix'), null, 'Titular Rpc Beta Pix', null, pg_temp.rv('Titular Rpc Beta Pix'))$$),
  '22023|LIST_REQUIRED', 'save_receiver com lista nula -> LIST_REQUIRED');
select is(pg_temp.err_of($$select public.save_receiver(pg_temp.rid('Titular Rpc Beta Pix'), null, 'Titular Rpc Beta Pix', 'null'::jsonb, pg_temp.rv('Titular Rpc Beta Pix'))$$),
  '22023|LIST_REQUIRED', 'save_receiver com JSON null -> LIST_REQUIRED');
select is(pg_temp.detail_of($$select public.save_receiver(pg_temp.rid('Titular Rpc Beta Pix'), null, 'Titular Rpc Beta Pix', null, pg_temp.rv('Titular Rpc Beta Pix'))$$) ->> 'field',
  'identifiers', 'O detail de LIST_REQUIRED diz que a lista é a de identificadores');
select is((select count(*) from public.receiver_identifiers where receiver_id = pg_temp.rid('Titular Rpc Beta Pix') and active), 2::bigint,
  'Lista nula recusada: nenhum identificador foi inativado');
select is((select count(*) from public.save_receiver(pg_temp.rid('Titular Rpc Beta Pix'), null, 'Titular Rpc Beta Pix', '[]'::jsonb, pg_temp.rv('Titular Rpc Beta Pix'))),
  1::bigint, 'save_receiver com lista vazia');
select is((select count(*) from public.receiver_identifiers where receiver_id = pg_temp.rid('Titular Rpc Beta Pix') and active), 0::bigint,
  'Lista vazia significa nenhum identificador: inativa todos');
select is(pg_temp.err_of($$select public.save_receiver('a4000000-0000-4000-8000-000000000004', null, 'Titular Rpc Inativo',
    '[{"type":"NAME_VARIANT","value":"Inativo Rpc"}]'::jsonb, '2020-01-01 00:00:00+00')$$),
  'ok', 'Recebedor inativo (de sócio inativo) pode ser editado (UI 7.3)');

-- Versão e validações
select is(pg_temp.err_of($$select public.save_receiver(pg_temp.rid('Titular Rpc Alfa 1'), null, 'Titular Rpc Alfa 1', '[]'::jsonb, '2019-01-01 00:00:00+00')$$),
  'P0001|STALE_VERSION', 'Recebedor: versão antiga -> STALE_VERSION');
select is(pg_temp.err_of($$select public.save_receiver(pg_temp.rid('Titular Rpc Alfa 1'), null, 'Titular Rpc Alfa 1', '[]'::jsonb, null)$$),
  '22023|VERSION_REQUIRED', 'Recebedor: edição sem versão -> VERSION_REQUIRED');
select is(pg_temp.err_of($$select public.save_receiver(null, pg_temp.pid('Sócio Rpc Alfa'), '  ', '[]'::jsonb, null)$$), '22023|NAME_REQUIRED', 'Titular em branco -> NAME_REQUIRED');
select is(pg_temp.err_of($$select public.save_receiver(null, pg_temp.pid('Sócio Rpc Alfa'), repeat('a', 201), '[]'::jsonb, null)$$), '22023|NAME_TOO_LONG', 'Titular acima de 200 -> NAME_TOO_LONG');

select is(pg_temp.err_of($$select public.save_receiver(null, pg_temp.pid('Sócio Rpc Alfa'), 'Titular Rpc V', '[{"type":"PIX_KEY","value":"  "}]'::jsonb, null)$$), '22023|INVALID_PIX_KEY', 'Chave Pix em branco -> INVALID_PIX_KEY');
select is(pg_temp.err_of($$select public.save_receiver(null, pg_temp.pid('Sócio Rpc Alfa'), 'Titular Rpc V', jsonb_build_array(jsonb_build_object('type', 'PIX_KEY', 'value', repeat('a', 101))), null)$$), '22023|INVALID_PIX_KEY', 'Chave Pix acima de 100 -> INVALID_PIX_KEY');
select is(pg_temp.err_of($$select public.save_receiver(null, pg_temp.pid('Sócio Rpc Alfa'), 'Titular Rpc V', '[{"type":"NAME_VARIANT","value":" . "}]'::jsonb, null)$$), '22023|NAME_REQUIRED', 'Variação vazia -> NAME_REQUIRED');
select is(pg_temp.err_of($$select public.save_receiver(null, pg_temp.pid('Sócio Rpc Alfa'), 'Titular Rpc V', jsonb_build_array(jsonb_build_object('type', 'NAME_VARIANT', 'value', repeat('a', 201))), null)$$), '22023|NAME_TOO_LONG', 'Variação acima de 200 -> NAME_TOO_LONG');
select is(pg_temp.err_of($$select public.save_receiver(null, pg_temp.pid('Sócio Rpc Alfa'), 'Titular Rpc V', '[{"type":"BANK_ACCOUNT","bank_name":" ","branch":"1","account_number":"1"}]'::jsonb, null)$$), '22023|INVALID_BANK', 'Conta sem banco -> INVALID_BANK');
select is(pg_temp.err_of($$select public.save_receiver(null, pg_temp.pid('Sócio Rpc Alfa'), 'Titular Rpc V', '[{"type":"BANK_ACCOUNT","bank_name":"Banco Exemplo","branch":"A1","account_number":"1"}]'::jsonb, null)$$), '22023|INVALID_BRANCH', 'Agência com letra fora de X -> INVALID_BRANCH');
select is(pg_temp.err_of($$select public.save_receiver(null, pg_temp.pid('Sócio Rpc Alfa'), 'Titular Rpc V', '[{"type":"BANK_ACCOUNT","bank_name":"Banco Exemplo","branch":"1","account_number":"12,3"}]'::jsonb, null)$$), '22023|INVALID_ACCOUNT', 'Conta com vírgula -> INVALID_ACCOUNT');
select is(pg_temp.err_of($$select public.save_receiver(null, pg_temp.pid('Sócio Rpc Alfa'), 'Titular Rpc V', '[{"type":"BANK_ACCOUNT","bank_name":"Banco Exemplo","branch":"1"}]'::jsonb, null)$$), '22023|INVALID_ACCOUNT', 'Conta sem número -> INVALID_ACCOUNT');
select is(pg_temp.detail_of($$select public.save_receiver(null, pg_temp.pid('Sócio Rpc Alfa'), 'Titular Rpc V', '[{"type":"BANK_ACCOUNT","bank_name":"Banco Exemplo","branch":"A1","account_number":"1"}]'::jsonb, null)$$) ->> 'field',
  'identifiers', 'O erro de identificador traz o campo no detail');

select is(pg_temp.err_of($$select public.save_receiver(null, pg_temp.pid('Sócio Rpc Alfa'), 'Titular Rpc V', '{"type":"PIX_KEY","value":"x"}'::jsonb, null)$$), '22023|INVALID_IDENTIFIER', 'Lista que não é array -> INVALID_IDENTIFIER');
select is(pg_temp.err_of($$select public.save_receiver(null, pg_temp.pid('Sócio Rpc Alfa'), 'Titular Rpc V', '["x"]'::jsonb, null)$$), '22023|INVALID_IDENTIFIER', 'Item que não é objeto -> INVALID_IDENTIFIER');
select is(pg_temp.err_of($$select public.save_receiver(null, pg_temp.pid('Sócio Rpc Alfa'), 'Titular Rpc V', '[{"type":"CARTAO","value":"x"}]'::jsonb, null)$$), '22023|INVALID_IDENTIFIER', 'Tipo desconhecido -> INVALID_IDENTIFIER');
select is(pg_temp.err_of($$select public.save_receiver(null, pg_temp.pid('Sócio Rpc Alfa'), 'Titular Rpc V', '[{"value":"x"}]'::jsonb, null)$$), '22023|INVALID_IDENTIFIER', 'Item sem tipo -> INVALID_IDENTIFIER');
select is(pg_temp.err_of($$select public.save_receiver(null, pg_temp.pid('Sócio Rpc Alfa'), 'Titular Rpc V', '[{"type":"PIX_KEY","valor":"x"}]'::jsonb, null)$$), '22023|INVALID_IDENTIFIER', 'Chave desconhecida no item -> INVALID_IDENTIFIER');
select is(pg_temp.err_of($$select public.save_receiver(null, pg_temp.pid('Sócio Rpc Alfa'), 'Titular Rpc V', '[{"type":"BANK_ACCOUNT","value":"x","bank_name":"B","branch":"1","account_number":"1"}]'::jsonb, null)$$), '22023|INVALID_IDENTIFIER', 'Conta com "value" -> INVALID_IDENTIFIER');
select is(pg_temp.err_of($$select public.save_receiver(null, pg_temp.pid('Sócio Rpc Alfa'), 'Titular Rpc V', '[{"type":"BANK_ACCOUNT","bank_name":"B","branch":1,"account_number":"1"}]'::jsonb, null)$$), '22023|INVALID_IDENTIFIER', 'Agência como número JSON (perderia os zeros) -> INVALID_IDENTIFIER');
select is((select count(*) from public.receivers where holder_name = 'Titular Rpc V'), 0::bigint, 'Nenhum recebedor ficou criado pelas chamadas inválidas');

-- -----------------------------------------------------------------------------
-- set_receiver_active
-- -----------------------------------------------------------------------------
select is((select active from public.set_receiver_active(pg_temp.rid('Titular Rpc Alfa Dois'), false, pg_temp.rv('Titular Rpc Alfa Dois'))),
  false, 'Inativar o recebedor');
select is((select count(*) from public.receiver_identifiers where receiver_id = pg_temp.rid('Titular Rpc Alfa Dois') and active), 1::bigint,
  'Os identificadores do recebedor inativo continuam ativos (6.5)');
select is((select active from public.set_receiver_active(pg_temp.rid('Titular Rpc Alfa Dois'), false, '2019-01-01 00:00:00+00', 'c1000000-0000-4000-8000-000000000021')),
  false, 'Repetir a inativação devolve a linha, mesmo com versão antiga');
select is((select count(*) from public.audit_logs where correlation_id = 'c1000000-0000-4000-8000-000000000021'), 0::bigint,
  'Repetir a inativação do recebedor não escreve nada');
select is(pg_temp.err_of($$select public.set_receiver_active(pg_temp.rid('Titular Rpc Alfa Dois'), true, '2019-01-01 00:00:00+00')$$),
  'P0001|STALE_VERSION', 'Reativar o recebedor com versão antiga -> STALE_VERSION');
select is(pg_temp.err_of($$select public.set_receiver_active(pg_temp.rid('Titular Rpc Alfa Dois'), true, null)$$),
  '22023|VERSION_REQUIRED', 'Reativar o recebedor sem versão -> VERSION_REQUIRED');
select is((select active from public.set_receiver_active(pg_temp.rid('Titular Rpc Alfa Dois'), true, pg_temp.rv('Titular Rpc Alfa Dois'))),
  true, 'Reativar o recebedor de sócio ativo');

select is(pg_temp.err_of($$select public.set_receiver_active('a4000000-0000-4000-8000-000000000004', true, pg_temp.rv('Titular Rpc Inativo'))$$),
  'P0001|PARTNER_INACTIVE', 'Reativar recebedor de sócio inativo -> PARTNER_INACTIVE');
select is(pg_temp.detail_of($$select public.set_receiver_active('a4000000-0000-4000-8000-000000000004', true, pg_temp.rv('Titular Rpc Inativo'))$$) #>> '{partners,0,id}',
  'a2000000-0000-4000-8000-000000000006', 'O detail de PARTNER_INACTIVE lista o sócio');
select is((select active from public.set_partner_active('a2000000-0000-4000-8000-000000000006', true, pg_temp.pv('Sócio Rpc Inativo'))), true, 'Reativar o sócio inativo');
select is((select active from public.set_receiver_active('a4000000-0000-4000-8000-000000000004', true, pg_temp.rv('Titular Rpc Inativo'))),
  true, 'Com o sócio reativado, o recebedor pode ser reativado');

select is(pg_temp.err_of($$select public.set_receiver_active(pg_temp.rid('Titular Rpc Alfa Dois'), null, now())$$), '22023|ACTIVE_REQUIRED', 'Recebedor: situação nula -> ACTIVE_REQUIRED');
select is(pg_temp.err_of($$select public.set_receiver_active(gen_random_uuid(), false, now())$$), 'P0002|NOT_FOUND', 'Recebedor inexistente -> NOT_FOUND');

-- Os fixtures não ficaram com indicação ou recebedor órfãos
reset role;
select is((select count(*) from public.receivers r join public.partners p on p.id = r.partner_id where r.active and not p.active), 0::bigint,
  'Nenhum recebedor ativo ficou com sócio inativo');

select * from finish();
rollback;
