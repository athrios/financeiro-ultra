-- =============================================================================
-- pgTAP · CAD-001 · Documentos e normalização
-- CPF, CNPJ numérico e alfanumérico (vetores compartilhados, modelagem 12.3),
-- normalização de chave Pix e conta (3.3), CHECK de clients e I-17 (sem documento
-- de sócio nem de titular).
-- Rastreio: RAT-D023, RAT-D024, RAT-D025 · I-07, I-17 · CA-04, CA-10.
-- Fontes dos vetores:
--   * 12.ABC.345/01DE-35: exemplo citado pela modelagem como o da nota técnica da Receita
--     Federal sobre o CNPJ alfanumérico; DVs recalculados de forma independente (soma 459 -> DV1 3;
--     soma 424 -> DV2 5). O texto oficial não pôde ser consultado neste ambiente (ver 04-implementacao.md).
--   * Demais vetores: números fictícios gerados pelo algoritmo (RAT-D019); nenhum documento real.
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(58);

-- Executa um comando e devolve "sqlstate|hint" do erro (ou 'ok'), para conferir o hint do contrato 6.3.
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

-- -----------------------------------------------------------------------------
-- normalize_document (12.3)
-- -----------------------------------------------------------------------------
select is(private.normalize_document('12.ABC.345/01DE-35'), '12ABC34501DE35', 'normalize_document: CNPJ alfanumérico com máscara');
select is(private.normalize_document('zz0teste000100'), 'ZZ0TESTE000100', 'normalize_document: minúsculas viram maiúsculas');
select is(private.normalize_document('99.999.999/0001-91'), '99999999000191', 'normalize_document: CNPJ numérico com máscara');
select is(private.normalize_document('000.000.001-91'), '00000000191', 'normalize_document: CPF com máscara');
select is(private.normalize_document(''), null, 'normalize_document: vazio vira NULL');
select is(private.normalize_document(' ./- '), null, 'normalize_document: só formatação vira NULL');
select is(private.normalize_document(null), null, 'normalize_document: NULL vira NULL');
select is(private.normalize_document('ÁZ0TESTE000100'), 'ÁZ0TESTE000100',
  'normalize_document: caractere estranho não é descartado em silêncio (o documento fica inválido)');

-- -----------------------------------------------------------------------------
-- Validação por vetores (CPF, CNPJ numérico e alfanumérico). Entrada como digitada.
-- -----------------------------------------------------------------------------
select results_eq(
  $$select v.n, private.is_valid_document(private.normalize_document(v.doc))
      from (values
        (1,  '12.ABC.345/01DE-35'),   -- exemplo da nota técnica
        (2,  'zz0teste000100'),
        (3,  'ZZ0TESTE000282'),
        (4,  'ZZ0TESTE000101'),       -- DV errado
        (5,  'ZZ0TESTE0001A0'),       -- letra na posição do DV
        (6,  'ZZ0TESTE00010'),        -- 13 caracteres
        (7,  'ÁZ0TESTE000100'),       -- caractere fora de 0-9A-Z
        (8,  '99.999.999/0001-91'),   -- CNPJ numérico
        (9,  '00000000000000'),       -- repetidos
        (10, 'AAAAAAAAAAAAAA'),       -- repetidos
        (11, '000.000.001-91'),       -- CPF
        (12, '00000000272'),          -- CPF
        (13, '10000000957'),          -- CPF
        (14, '00000000192'),          -- CPF com DV errado
        (15, '11111111111'),          -- CPF repetidos
        (16, 'ZZ0TESTE000363'),
        (17, 'ZZ0TESTE000444'),
        (18, 'EX0A1B2C000119'),
        (19, ''),
        (20, '123456789012345')       -- 15 caracteres
      ) v(n, doc) order by v.n$$,
  $$values (1, true), (2, true), (3, true), (4, false), (5, false), (6, false), (7, false), (8, true),
           (9, false), (10, false), (11, true), (12, true), (13, true), (14, false), (15, false),
           (16, true), (17, true), (18, true), (19, false), (20, false)$$,
  'is_valid_document: os 20 vetores compartilhados (CPF, CNPJ numérico e alfanumérico)');

select ok(private.is_valid_cnpj('12ABC34501DE35'), 'is_valid_cnpj: exemplo oficial alfanumérico');
select ok(private.is_valid_cnpj('99999999000191'), 'is_valid_cnpj: o cálculo novo também valida o CNPJ numérico');
select ok(not private.is_valid_cnpj('12abc34501de35'), 'is_valid_cnpj espera o canônico: minúsculas são recusadas');
select ok(not private.is_valid_cnpj(null), 'is_valid_cnpj: NULL é inválido');
select ok(private.is_valid_cpf('00000000191'), 'is_valid_cpf: CPF válido');
select ok(not private.is_valid_cpf('0000000019A'), 'is_valid_cpf: letra é inválida');
select ok(not private.is_valid_cpf(null), 'is_valid_cpf: NULL é inválido');
select ok(not private.is_valid_document(null), 'is_valid_document: NULL é inválido');
select ok(not private.is_valid_document('1234567890'), 'is_valid_document: 10 dígitos é inválido');

-- Dois DVs só com letras na raiz: o valor de cada letra é ASCII - 48 (A = 17).
select is(
  (select count(*) from (values ('12ABC34501DE35'), ('ZZ0TESTE000100'), ('ZZ0TESTE000282'), ('EX0A1B2C000119')) v(d)
    where private.is_valid_cnpj(v.d) and v.d ~ '[A-Z]'),
  4::bigint,
  'Os quatro CNPJ alfanuméricos de teste têm letras e passam no DV');

-- -----------------------------------------------------------------------------
-- Chave Pix (3.3): sem subtipo; CPF e CNPJ aceitos como chave
-- -----------------------------------------------------------------------------
select is(private.normalize_receiver_identifier('PIX_KEY', 'Socio.A@Example.com', null, null, null),
  'socio.a@example.com', 'Pix: e-mail em minúsculas');
select is(private.normalize_receiver_identifier('PIX_KEY', '  Socio.A@Example.com ', null, null, null),
  'socio.a@example.com', 'Pix: e-mail sem espaços nas bordas');
select is(private.normalize_receiver_identifier('PIX_KEY', '+55 (23) 91234-5678', null, null, null),
  '+5523912345678', 'Pix: telefone mantém o + inicial e perde a pontuação');
select is(private.normalize_receiver_identifier('PIX_KEY', '123E4567-E89B-42D3-A456-426614174000', null, null, null),
  '123e4567e89b42d3a456426614174000', 'Pix: chave aleatória perde os hífens');
select is(private.normalize_receiver_identifier('PIX_KEY', '000.000.001-91', null, null, null),
  '00000000191', 'Pix: formato de CPF é aceito como chave (RAT-D023)');
select is(private.normalize_receiver_identifier('PIX_KEY', '123.456.789-00', null, null, null),
  '12345678900', 'Pix: sem subtipo o DV não é conferido (pode ser telefone)');
select is(private.normalize_receiver_identifier('PIX_KEY', '99.999.999/0001-91', null, null, null),
  '99999999000191', 'Pix: formato de CNPJ numérico é aceito como chave');
select is(private.normalize_receiver_identifier('PIX_KEY', '12.ABC.345/01DE-35', null, null, null),
  '12abc34501de35', 'Pix: formato de CNPJ alfanumérico é aceito como chave');
select is(pg_temp.err_of($$select private.normalize_receiver_identifier('PIX_KEY', '   ', null, null, null)$$),
  '22023|INVALID_PIX_KEY', 'Pix: chave em branco -> 22023 INVALID_PIX_KEY');
select is(pg_temp.err_of($$select private.normalize_receiver_identifier('PIX_KEY', ' ./- ', null, null, null)$$),
  '22023|INVALID_PIX_KEY', 'Pix: só pontuação -> INVALID_PIX_KEY');
select is(pg_temp.err_of($$select private.normalize_receiver_identifier('PIX_KEY', repeat('a', 101), null, null, null)$$),
  '22023|INVALID_PIX_KEY', 'Pix: acima de 100 caracteres -> INVALID_PIX_KEY');
select is(pg_temp.err_of($$select private.normalize_receiver_identifier('PIX_KEY', null, null, null, null)$$),
  '22023|INVALID_PIX_KEY', 'Pix: NULL -> INVALID_PIX_KEY');

-- -----------------------------------------------------------------------------
-- Variação de nome e conta bancária (3.3)
-- -----------------------------------------------------------------------------
select is(private.normalize_receiver_identifier('NAME_VARIANT', 'S. Exemplo Á', null, null, null),
  's exemplo a', 'Variação de nome: normalize_alias');
select is(pg_temp.err_of($$select private.normalize_receiver_identifier('NAME_VARIANT', ' .. ', null, null, null)$$),
  '22023|NAME_REQUIRED', 'Variação de nome vazia depois de normalizar -> NAME_REQUIRED');
select is(pg_temp.err_of($$select private.normalize_receiver_identifier('NAME_VARIANT', repeat('a', 201), null, null, null)$$),
  '22023|NAME_TOO_LONG', 'Variação de nome acima de 200 -> NAME_TOO_LONG');

select is(private.normalize_receiver_identifier('BANK_ACCOUNT', null, 'Banco Exemplo', '0001', '12345-6'),
  'banco exemplo|1|123456', 'Conta: vetor da modelagem (zeros à esquerda e hífen saem)');
select is(private.normalize_receiver_identifier('BANK_ACCOUNT', null, 'Banco Exemplo', '0000', '000-0'),
  'banco exemplo|0|0', 'Conta: tudo zero vira "0"');
select is(private.normalize_receiver_identifier('BANK_ACCOUNT', null, 'Banco Exemplo', '1234x', '98765-X'),
  'banco exemplo|1234X|98765X', 'Conta: X em maiúscula na agência e no dígito da conta');
select is(pg_temp.err_of($$select private.normalize_receiver_identifier('BANK_ACCOUNT', null, ' . ', '0001', '12345-6')$$),
  '22023|INVALID_BANK', 'Conta: banco vazio -> INVALID_BANK');
select is(pg_temp.err_of($$select private.normalize_receiver_identifier('BANK_ACCOUNT', null, 'Banco Exemplo', 'ab12', '12345-6')$$),
  '22023|INVALID_BRANCH', 'Conta: letra na agência -> INVALID_BRANCH');
select is(pg_temp.err_of($$select private.normalize_receiver_identifier('BANK_ACCOUNT', null, 'Banco Exemplo', '1234567', '1')$$),
  '22023|INVALID_BRANCH', 'Conta: agência com mais de 6 caracteres -> INVALID_BRANCH');
select is(pg_temp.err_of($$select private.normalize_receiver_identifier('BANK_ACCOUNT', null, 'Banco Exemplo', '0001', '12X45')$$),
  '22023|INVALID_ACCOUNT', 'Conta: X fora da última posição -> INVALID_ACCOUNT');
select is(pg_temp.err_of($$select private.normalize_receiver_identifier('BANK_ACCOUNT', null, 'Banco Exemplo', '0001', repeat('1', 21))$$),
  '22023|INVALID_ACCOUNT', 'Conta: mais de 20 caracteres depois de normalizar -> INVALID_ACCOUNT');
select is(pg_temp.err_of($$select private.normalize_receiver_identifier('BANK_ACCOUNT', null, 'Banco Exemplo', '0001', null)$$),
  '22023|INVALID_ACCOUNT', 'Conta: NULL -> INVALID_ACCOUNT');

-- Apelido do cliente
select is(private.normalize_client_alias('NAME', 'Cliente Modelo Fictício Ltda.'), 'cliente modelo ficticio ltda', 'Apelido NAME: normalize_alias');
select is(private.normalize_client_alias('DOCUMENT', '12.ABC.345/01DE-35'), '12ABC34501DE35', 'Apelido DOCUMENT: documento canônico');
select is(pg_temp.err_of($$select private.normalize_client_alias('DOCUMENT', '00000000192')$$),
  '22023|INVALID_DOCUMENT', 'Apelido DOCUMENT com DV errado -> INVALID_DOCUMENT');
select is(pg_temp.err_of($$select private.normalize_client_alias('NAME', ' .. ')$$),
  '22023|NAME_REQUIRED', 'Apelido NAME vazio -> NAME_REQUIRED');

-- -----------------------------------------------------------------------------
-- CHECK de clients (I-07): canônico e DV válido, inserindo como postgres
-- -----------------------------------------------------------------------------
select throws_ok(
  $$insert into public.clients (legal_name, document, default_monthly_value) values ('Cliente Teste Doc 1', '000.000.001-91', 10)$$,
  '23514', null, 'clients: documento com máscara é recusado (só a forma canônica)');
select throws_ok(
  $$insert into public.clients (legal_name, document, default_monthly_value) values ('Cliente Teste Doc 2', '00000000192', 10)$$,
  '23514', null, 'clients: CPF com DV inválido é recusado');
select throws_ok(
  $$insert into public.clients (legal_name, document, default_monthly_value) values ('Cliente Teste Doc 3', 'ZZ0TESTE000101', 10)$$,
  '23514', null, 'clients: CNPJ alfanumérico com DV inválido é recusado');
select throws_ok(
  $$insert into public.clients (legal_name, document, default_monthly_value) values ('Cliente Teste Doc 4', 'zz0teste000100', 10)$$,
  '23514', null, 'clients: documento em minúsculas é recusado (não canônico)');

select lives_ok(
  $$insert into public.clients (id, legal_name, document, default_monthly_value) values
      ('c0000000-0000-4000-8000-000000000001', 'Cliente Teste CPF',   '00000000191',    10),
      ('c0000000-0000-4000-8000-000000000002', 'Cliente Teste CNPJ',  '99999999000191', 10),
      ('c0000000-0000-4000-8000-000000000003', 'Cliente Teste ALFA',  'ZZ0TESTE000100', 10),
      ('c0000000-0000-4000-8000-000000000004', 'Cliente Teste ALFA2', '12ABC34501DE35', 10),
      ('c0000000-0000-4000-8000-000000000005', 'Cliente Teste Livre', null,            10)$$,
  'clients: CPF, CNPJ numérico e CNPJ alfanumérico canônicos e válidos entram; sem documento também');

select results_eq(
  $$select document_type from public.clients where id::text like 'c0000000-%' order by id$$,
  $$values ('CPF'), ('CNPJ'), ('CNPJ'), ('CNPJ'), (null::text)$$,
  'clients.document_type é deduzido do documento (CPF, CNPJ, ou nulo sem documento)');

-- -----------------------------------------------------------------------------
-- I-17 e privilégios das funções (catálogo)
-- -----------------------------------------------------------------------------
select is(
  (select coalesce(string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname), '')
     from pg_attribute a
     join pg_class c on c.oid = a.attrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('partners', 'partner_aliases', 'receivers', 'receiver_identifiers')
      and a.attnum > 0 and not a.attisdropped
      and (a.attname ~* '(^|_)(document|doc|cpf|cnpj|tax_id|taxid|tax)(_|$)')),
  '',
  'I-17: sócio, apelido do sócio, recebedor e identificador não têm coluna de documento (CPF/CNPJ)');

select is(
  (select count(*) from (values
      ('private.normalize_client_alias(public.client_alias_type,text)'),
      ('private.normalize_receiver_identifier(public.receiver_identifier_type,text,text,text,text)'),
      ('private.require_admin()'),
      ('private.assert_version(timestamptz,timestamptz)'),
      ('private.assert_partner_name_free(text,uuid,text)'),
      ('private.assert_client_document_free(text,uuid,text)'),
      ('private.partners_guard()'),
      ('private.client_partners_prepare()'),
      ('private.assert_client_has_partner()')) f(sig)
    cross join (values ('anon'), ('authenticated'), ('service_role')) r(rol)
    where has_function_privilege(r.rol, f.sig::regprocedure, 'execute')),
  0::bigint,
  'Normalizadores de identificador, require_admin, assert_version, guardas e auxiliares: execução negada a anon, authenticated e service_role');

select is(
  (select count(*) from (values
      ('private.normalize_document(text)'), ('private.is_valid_cpf(text)'),
      ('private.is_valid_cnpj(text)'), ('private.is_valid_document(text)')) f(sig)
    cross join (values ('authenticated'), ('service_role')) r(rol)
    where has_function_privilege(r.rol, f.sig::regprocedure, 'execute')),
  8::bigint,
  'Funções de documento: authenticated e service_role executam (usadas em CHECK e em search_clients)');

select ok(
  not exists (select 1 from (values ('private.normalize_document(text)'), ('private.is_valid_cpf(text)'),
                                    ('private.is_valid_cnpj(text)'), ('private.is_valid_document(text)')) f(sig)
               where has_function_privilege('anon', f.sig::regprocedure, 'execute')),
  'Funções de documento: anon não executa');

-- Todas as funções novas da CAD-001 são imutáveis/estáveis conforme o desenho (puras onde usadas em CHECK).
select is(
  (select count(*) from pg_proc p
    where p.pronamespace = 'private'::regnamespace
      and p.proname in ('normalize_document', 'is_valid_cpf', 'is_valid_cnpj', 'is_valid_document')
      and p.provolatile = 'i' and p.proparallel = 's' and not p.prosecdef),
  4::bigint,
  'Funções de documento: IMMUTABLE, PARALLEL SAFE e SECURITY INVOKER (podem entrar em CHECK)');

select * from finish();
rollback;
