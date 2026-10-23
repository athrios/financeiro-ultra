-- =============================================================================
-- Testes de banco (pgTAP): invariantes financeiras, imutabilidade, auditoria e RLS.
-- Executar com: npm run db:test  (supabase test db)
-- Tudo roda dentro de uma transação desfeita ao final (rollback).
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(46);

-- -----------------------------------------------------------------------------
-- Fixtures (como postgres, dono das tabelas)
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('f1000000-0000-4000-8000-000000000001', 'admin-teste@exemplo.test'),
  ('f1000000-0000-4000-8000-000000000002', 'socio-a@exemplo.test'),
  ('f1000000-0000-4000-8000-000000000003', 'socio-sem-indicador@exemplo.test');

insert into public.indicators (id, name) values
  ('f2000000-0000-4000-8000-000000000001', 'Teste A'),
  ('f2000000-0000-4000-8000-000000000002', 'Teste B');

update public.profiles set role = 'ADMIN_FINANCEIRO' where id = 'f1000000-0000-4000-8000-000000000001';
update public.profiles set indicator_id = 'f2000000-0000-4000-8000-000000000001' where id = 'f1000000-0000-4000-8000-000000000002';

-- X: CUSTOM 60/40 com A e B · Y: EQUAL só com B
insert into public.companies (id, name, cnpj, default_amount, distribution_mode) values
  ('f3000000-0000-4000-8000-000000000001', 'Empresa X', '90.123.456/0001-31', 1000.00, 'CUSTOM'),
  ('f3000000-0000-4000-8000-000000000002', 'Empresa Y', '90.234.567/0001-15',  500.00, 'EQUAL');

insert into public.company_indicators (company_id, indicator_id, custom_percentage) values
  ('f3000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 60.0000),
  ('f3000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000002', 40.0000),
  ('f3000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000002', null);

insert into public.indicator_receipt_aliases (indicator_id, alias) values
  ('f2000000-0000-4000-8000-000000000002', 'Alias de Teste Único');

-- Distribuição padrão conhecida, independente do seed: A 60% / B 40%.
update public.indicators set default_percentage = null where default_percentage is not null;
update public.indicators set default_percentage = 60 where id = 'f2000000-0000-4000-8000-000000000001';
update public.indicators set default_percentage = 40 where id = 'f2000000-0000-4000-8000-000000000002';
update public.finance_settings set use_custom_default_percentages = true;

-- Valida já as constraints DEFERRED (normalmente checadas no COMMIT).
set constraints all immediate;

-- -----------------------------------------------------------------------------
-- Cadastro: CNPJ, aliases, percentuais
-- -----------------------------------------------------------------------------
select throws_ok(
  $$insert into public.companies (name, cnpj, default_amount) values ('Inválida', '11.111.111/1111-11', 10)$$,
  '23514', null, 'CNPJ com dígito verificador inválido é rejeitado');

select throws_ok(
  $$insert into public.companies (name, cnpj, default_amount) values ('Duplicada', '90123456000131', 10)$$,
  '23505', null, 'CNPJ normalizado é único (formatos diferentes, mesmo número)');

select is(
  (select normalized_cnpj from public.companies where id = 'f3000000-0000-4000-8000-000000000001'),
  '90123456000131', 'normalized_cnpj contém apenas dígitos');

select throws_ok(
  $$insert into public.indicator_receipt_aliases (indicator_id, alias) values ('f2000000-0000-4000-8000-000000000001', 'ALIAS  de teste, único!')$$,
  '23505', null, 'alias ativo não pode pertencer a dois indicadores (comparação normalizada)');

select lives_ok(
  $$insert into public.indicator_receipt_aliases (indicator_id, alias, active) values ('f2000000-0000-4000-8000-000000000001', 'Alias de Teste Único', false)$$,
  'alias inativo pode repetir um normalizado ativo');

select is(
  public.resolve_receiver_indicator('ALIAS DE TESTE ÚNICO'),
  'f2000000-0000-4000-8000-000000000002'::uuid, 'alias resolve o indicador recebedor');

select throws_ok(
  $$update public.company_indicators set custom_percentage = 50 where company_id = 'f3000000-0000-4000-8000-000000000001' and indicator_id = 'f2000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'distribuição CUSTOM que não soma 100% é rejeitada (sem normalizar)');

select throws_ok(
  $$update public.indicators set default_percentage = 10 where id = 'f2000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'distribuição padrão ativa que não soma 100% é rejeitada');

select throws_ok(
  $$select private.to_percentage('33.33335')$$,
  '22023', null, 'percentual com mais de 4 casas é rejeitado, não arredondado');

-- -----------------------------------------------------------------------------
-- Como ADMIN_FINANCEIRO
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$select public.save_company_distribution('f3000000-0000-4000-8000-000000000001', 'CUSTOM', '[{"indicator_id":"f2000000-0000-4000-8000-000000000001","custom_percentage":"70"},{"indicator_id":"f2000000-0000-4000-8000-000000000002","custom_percentage":"20"}]')$$,
  '23514', null, 'save_company_distribution rejeita CUSTOM com soma 90%');

select throws_ok(
  $$select public.set_default_distribution(true, '[{"indicator_id":"f2000000-0000-4000-8000-000000000001","percentage":"60"},{"indicator_id":"f2000000-0000-4000-8000-000000000002","percentage":"30"}]')$$,
  '23514', null, 'set_default_distribution rejeita soma 90%');

select throws_ok(
  $$select public.open_competency('2030-01-15')$$,
  '22023', null, 'competência precisa ser o primeiro dia do mês');

select lives_ok(
  $$select public.open_competency('2030-01-01')$$,
  'admin abre a competência');

select is(
  (select cc.expected_amount from public.competency_companies cc
     join public.competencies c on c.id = cc.competency_id
    where c.reference_month = '2030-01-01' and cc.company_id = 'f3000000-0000-4000-8000-000000000001'),
  1000.00::numeric(14, 2), 'abertura gera snapshot do valor esperado');

select throws_ok(
  $$select public.open_competency('2030-01-01')$$,
  '23505', null, 'competência não pode ser aberta duas vezes');

update public.companies set default_amount = 2000.00 where id = 'f3000000-0000-4000-8000-000000000001';

select is(
  (select cc.expected_amount from public.competency_companies cc
     join public.competencies c on c.id = cc.competency_id
    where c.reference_month = '2030-01-01' and cc.company_id = 'f3000000-0000-4000-8000-000000000001'),
  1000.00::numeric(14, 2), 'alterar a mensalidade não altera o snapshot da competência');

-- Recebimentos da Empresa X (R$ 1.000, recebido por A)
insert into public.receipts (id, competency_id, company_id, company_identification_method, amount,
                             receiving_indicator_id, receiver_identification_method, uploaded_by, status)
select ('f4000000-0000-4000-8000-00000000000' || n)::uuid, c.id, 'f3000000-0000-4000-8000-000000000001', 'MANUAL', 1000.00,
       'f2000000-0000-4000-8000-000000000001', 'MANUAL', 'f1000000-0000-4000-8000-000000000001', 'AWAITING_CONFIRMATION'
  from public.competencies c, generate_series(1, 2) n
 where c.reference_month = '2030-01-01';

-- confirm_receipt grava as alocações e depois confirma; as invariantes do
-- snapshot são verificadas no COMMIT. Volta ao modo diferido (o de produção).
set constraints all deferred;

select throws_ok(
  $$select public.confirm_receipt('f4000000-0000-4000-8000-000000000001', 'COMPANY_CUSTOM', '[{"indicator_id":"f2000000-0000-4000-8000-000000000001","percentage":"100","amount":"1000.00"}]')$$,
  '23514', null, 'confirmação exige exatamente os indicadores da empresa');

select throws_ok(
  $$select public.confirm_receipt('f4000000-0000-4000-8000-000000000001', 'COMPANY_CUSTOM', '[{"indicator_id":"f2000000-0000-4000-8000-000000000001","percentage":"60","amount":"600.00"},{"indicator_id":"f2000000-0000-4000-8000-000000000002","percentage":"40","amount":"300.00"}]')$$,
  '23514', null, 'soma das parcelas precisa ser o valor recebido');

select throws_ok(
  $$select public.confirm_receipt('f4000000-0000-4000-8000-000000000001', 'EQUAL', '[{"indicator_id":"f2000000-0000-4000-8000-000000000001","percentage":"50","amount":"500.00"},{"indicator_id":"f2000000-0000-4000-8000-000000000002","percentage":"50","amount":"500.00"}]')$$,
  '23514', null, 'fonte da distribuição precisa ser compatível com o modo da empresa');

select lives_ok(
  $$select public.confirm_receipt('f4000000-0000-4000-8000-000000000001', 'COMPANY_CUSTOM', '[{"indicator_id":"f2000000-0000-4000-8000-000000000001","percentage":"60.0000","amount":"600.00"},{"indicator_id":"f2000000-0000-4000-8000-000000000002","percentage":"40.0000","amount":"400.00"}]')$$,
  'confirmação válida grava snapshot e confirma');

select lives_ok(
  $$set constraints all immediate$$,
  'invariantes do snapshot passam na verificação de COMMIT');

select is(
  (select count(*) from public.receipt_allocations where receipt_id = 'f4000000-0000-4000-8000-000000000001'),
  2::bigint, 'snapshot da distribuição gravado');

select throws_ok(
  $$update public.receipts set amount = 1.00 where id = 'f4000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'recebimento confirmado é imutável');

select throws_ok(
  $$update public.receipt_allocations set amount = 0 where receipt_id = 'f4000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'snapshot da distribuição é imutável');

select throws_ok(
  $$select public.confirm_receipt('f4000000-0000-4000-8000-000000000001', 'COMPANY_CUSTOM', '[{"indicator_id":"f2000000-0000-4000-8000-000000000001","percentage":"60.0000","amount":"600.00"},{"indicator_id":"f2000000-0000-4000-8000-000000000002","percentage":"40.0000","amount":"400.00"}]')$$,
  '22023', null, 'recebimento não pode ser confirmado duas vezes');

select throws_ok(
  $$update public.receipts set status = 'CONFIRMED', confirmed_at = now() where id = 'f4000000-0000-4000-8000-000000000002'$$,
  '23514', null, 'não é possível confirmar sem gravar a distribuição (bypass da RPC)');

select is(
  (select sum(amount) from public.financial_ledger where reference_month = '2030-01-01'),
  0.00::numeric, 'ledger da competência soma zero');

-- Liquidações
select throws_ok(
  $$insert into public.settlements (competency_id, from_indicator_id, to_indicator_id, amount, settlement_date)
    select id, 'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 10, '2030-01-31' from public.competencies where reference_month = '2030-01-01'$$,
  '23514', null, 'liquidação exige indicadores distintos');

select throws_ok(
  $$insert into public.settlements (competency_id, from_indicator_id, to_indicator_id, amount, settlement_date)
    select id, 'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000002', 0, '2030-01-31' from public.competencies where reference_month = '2030-01-01'$$,
  '23514', null, 'liquidação exige valor positivo');

select lives_ok(
  $$insert into public.settlements (competency_id, from_indicator_id, to_indicator_id, amount, settlement_date)
    select id, 'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000002', 150.00, '2030-01-31' from public.competencies where reference_month = '2030-01-01'$$,
  'liquidação parcial registrada');

select throws_ok(
  $$delete from public.settlements$$,
  '42501', null, 'liquidações são append-only');

select is(
  (select sum(amount) from public.financial_ledger where reference_month = '2030-01-01'),
  0.00::numeric, 'ledger continua somando zero após liquidação');

select is(
  (select sum(amount) from public.financial_ledger
    where reference_month = '2030-01-01' and indicator_id = 'f2000000-0000-4000-8000-000000000001'),
  -250.00::numeric, 'saldo de A = direito 600 − recebido 1000 + pago 150');

select ok(
  exists (select 1 from public.audit_logs
           where entity_type = 'receipt' and action = 'CONFIRM'
             and entity_id = 'f4000000-0000-4000-8000-000000000001'
             and user_id = 'f1000000-0000-4000-8000-000000000001'),
  'confirmação de recebimento auditada com o usuário');

select ok(
  exists (select 1 from public.audit_logs
           where entity_type = 'company' and action = 'UPDATE'
             and entity_id = 'f3000000-0000-4000-8000-000000000001'
             and new_data ? 'default_amount'),
  'alteração de valor da empresa auditada');

-- -----------------------------------------------------------------------------
-- Como SOCIO (indicador A)
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(
  (select count(*) from public.companies
    where id in ('f3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000002')),
  1::bigint, 'SOCIO vê apenas empresas em que é indicador');

select is_empty($$select 1 from public.indicator_receipt_aliases$$, 'SOCIO não lê aliases');

select is_empty($$select 1 from public.audit_logs$$, 'SOCIO não lê auditoria');

select is(
  (select count(*) from public.receipt_allocations),
  1::bigint, 'SOCIO vê apenas a própria parcela do snapshot');

select throws_ok(
  $$insert into public.companies (name, cnpj, default_amount) values ('Tentativa', '90.345.678/0001-07', 10)$$,
  '42501', null, 'SOCIO não cadastra empresas');

select throws_ok(
  $$select public.open_competency('2030-02-01')$$,
  '42501', null, 'SOCIO não abre competências');

select throws_ok(
  $$insert into public.receipt_allocations (receipt_id, indicator_id, percentage, amount, distribution_source)
    values ('f4000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000001', 100, 1000, 'EQUAL')$$,
  '42501', null, 'SOCIO não grava distribuição');

update public.profiles set role = 'ADMIN_FINANCEIRO' where id = 'f1000000-0000-4000-8000-000000000002';

select is(
  (select role from public.profiles where id = 'f1000000-0000-4000-8000-000000000002'),
  'SOCIO'::public.user_role, 'SOCIO não consegue se promover a admin');

-- SOCIO sem indicador vinculado
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select is_empty($$select 1 from public.companies$$, 'SOCIO sem indicador não vê empresas');

-- -----------------------------------------------------------------------------
-- Anônimo e admin inativo
-- -----------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);

select throws_ok($$select 1 from public.companies$$, '42501', null, 'anon não tem acesso às tabelas');

reset role;
update public.profiles set active = false where id = 'f1000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is_empty($$select 1 from public.companies$$, 'admin inativo perde o acesso');

reset role;

select * from finish();
rollback;
