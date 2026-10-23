-- =============================================================================
-- Seed de DESENVOLVIMENTO (aplicado apenas em `supabase db reset` local).
-- Dados estruturais fictícios: indicadores, aliases, empresas e distribuição.
-- Usuários, competências e recebimentos são criados por `npm run seed:dev`,
-- que passa pelas RPCs e pelo domínio da aplicação.
-- =============================================================================

begin;

-- Indicadores (distribuição padrão 50 / 25 / 25)
insert into public.indicators (id, name, default_percentage) values
  ('a0000000-0000-4000-8000-000000000001', 'Clara', 50.0000),
  ('a0000000-0000-4000-8000-000000000002', 'Bruno',   25.0000),
  ('a0000000-0000-4000-8000-000000000003', 'Alice',  25.0000);

-- Aliases de recebimento
insert into public.indicator_receipt_aliases (indicator_id, alias) values
  ('a0000000-0000-4000-8000-000000000001', 'Clara'),
  ('a0000000-0000-4000-8000-000000000001', 'Clara Exemplo'),
  ('a0000000-0000-4000-8000-000000000001', 'Contabil Exemplo'),
  ('a0000000-0000-4000-8000-000000000001', 'Contabil Exemplo Ltda.'),
  ('a0000000-0000-4000-8000-000000000002', 'Bruno'),
  ('a0000000-0000-4000-8000-000000000003', 'Alice');

-- Distribuição padrão por percentuais (soma = 100, validado no COMMIT)
update public.finance_settings set use_custom_default_percentages = true;

-- Empresas (CNPJs fictícios com dígitos verificadores válidos)
insert into public.companies (id, name, cnpj, default_amount, distribution_mode, active) values
  -- INHERIT com o conjunto completo -> usa o padrão 50/25/25
  ('c0000000-0000-4000-8000-000000000001', 'Padaria Pão Dourado Ltda',   '11.222.333/0001-81',  500.00, 'INHERIT', true),
  -- INHERIT com Clara + Bruno -> padrão soma 75% para o conjunto -> igualitária
  ('c0000000-0000-4000-8000-000000000002', 'Mercado Bom Preço ME',       '22.333.444/0001-81',  350.00, 'INHERIT', true),
  -- EQUAL explícito
  ('c0000000-0000-4000-8000-000000000003', 'Clínica Sorriso Ltda',       '33.444.555/0001-81',  900.00, 'EQUAL',   true),
  -- CUSTOM 70/30
  ('c0000000-0000-4000-8000-000000000004', 'Auto Peças Rodovia Ltda',    '44.555.666/0001-81', 1200.00, 'CUSTOM',  true),
  -- CUSTOM 60/40
  ('c0000000-0000-4000-8000-000000000005', 'Construtora Horizonte S.A.', '55.666.777/0001-81', 2500.00, 'CUSTOM',  true),
  -- INHERIT só com Alice -> padrão 25% não fecha 100 -> igualitária (100%)
  ('c0000000-0000-4000-8000-000000000006', 'Studio Bela Forma',          '66.777.888/0001-81',  280.00, 'INHERIT', true),
  -- EQUAL com Bruno + Alice
  ('c0000000-0000-4000-8000-000000000007', 'Tech Nova Sistemas Ltda',    '77.888.999/0001-81',  750.00, 'EQUAL',   true),
  -- Inativa: não entra em novas competências
  ('c0000000-0000-4000-8000-000000000008', 'Comércio Antigo Ltda',       '88.999.000/0001-98',  400.00, 'INHERIT', false);

insert into public.company_indicators (company_id, indicator_id, custom_percentage) values
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', null),
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', null),
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', null),

  ('c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', null),
  ('c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', null),

  ('c0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', null),
  ('c0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000002', null),
  ('c0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003', null),

  ('c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 70.0000),
  ('c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000003', 30.0000),

  ('c0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000002', 60.0000),
  ('c0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 40.0000),

  ('c0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000003', null),

  ('c0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000002', null),
  ('c0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000003', null),

  ('c0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000001', null);

commit;
