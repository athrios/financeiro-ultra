-- =============================================================================
-- Seed de DESENVOLVIMENTO (aplicado apenas em `supabase db reset` local).
-- Somente dados fictícios (RAT-D019). Sem percentuais (RAT-D015: a divisão é
-- sempre 1/n) e sem usuários: usuários e papéis vêm de `npm run seed:dev`,
-- que atribui os papéis por private.set_user_access (com motivo e auditoria).
--
-- CAD-001: sócios com apelidos, recebedores com identificadores e clientes (com
-- e sem documento, com 1, 2 e 3 sócios, e um inativo). Inserção direta como
-- postgres (o seed não tem auth.uid(); as funções de escrita exigem Administrador),
-- tudo na MESMA transação: o gatilho diferido de "cliente ativo tem sócio" só
-- confere no COMMIT. Nenhum CPF; os dois CNPJ alfanuméricos abaixo foram gerados
-- pelo algoritmo e têm DV válido. Os valores diferem de propósito dos usados nos
-- testes pgTAP (que rodam sobre este mesmo banco): sem colisão de documento,
-- apelido, chave Pix ou conta.
-- =============================================================================

begin;

-- Origem e motivo da auditoria deste seed (vale até o fim desta transação).
select private.set_audit_context('Seed local de desenvolvimento', 'SCRIPT', null, 'seed.sql');

insert into public.partners (id, name) values
  ('a0000000-0000-4000-8000-000000000001', 'Sócio Exemplo A'),
  ('a0000000-0000-4000-8000-000000000002', 'Sócio Exemplo B'),
  ('a0000000-0000-4000-8000-000000000003', 'Sócio Exemplo C');

-- Apelidos dos sócios (só nome, sem tipo).
insert into public.partner_aliases (id, partner_id, alias) values
  ('d1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'S. Exemplo A'),
  ('d1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'Exemplo B');

-- Recebedores (sempre de um sócio; o de C está inativo, para a tela de inativos).
insert into public.receivers (id, partner_id, holder_name, active) values
  ('d2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Sócio Exemplo A', true),
  ('d2000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Exemplo A Serviços Ltda', true),
  ('d2000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000002', 'Sócio Exemplo B', true),
  ('d2000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000003', 'Sócio Exemplo C', false);

-- Identificadores: variação de nome, chave Pix (e-mail e chave aleatória) e conta bancária.
insert into public.receiver_identifiers (id, receiver_id, identifier_type, value, bank_name, branch, account_number) values
  ('d3000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'NAME_VARIANT', 'Socio Ex Semente A', null, null, null),
  ('d3000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000001', 'PIX_KEY', 'semente.a@example.com', null, null, null),
  ('d3000000-0000-4000-8000-000000000003', 'd2000000-0000-4000-8000-000000000003', 'PIX_KEY', '00000000-0000-4000-8000-0000000000b1', null, null, null),
  ('d3000000-0000-4000-8000-000000000004', 'd2000000-0000-4000-8000-000000000002', 'BANK_ACCOUNT', null, 'Banco Semente', '0002', '65432-1');

-- Clientes: 2 sócios (1/2 cada), 3 sócios (1/3 cada), 1 sócio (1/1) e um inativo sem sócios.
insert into public.clients (id, legal_name, document, default_monthly_value, active) values
  ('d4000000-0000-4000-8000-000000000001', 'Cliente Modelo Ltda',    'EX0SEED0000127', 1500.00, true),
  ('d4000000-0000-4000-8000-000000000002', 'Comércio Fictício Ltda', 'EX0SEED0000208',  900.00, true),
  ('d4000000-0000-4000-8000-000000000003', 'Pessoa Exemplo',         null,              350.00, true),
  ('d4000000-0000-4000-8000-000000000004', 'Cliente Antigo Ltda',    null,              280.00, false);

insert into public.client_partners (id, client_id, partner_id) values
  ('d6000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001'),
  ('d6000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002'),
  ('d6000000-0000-4000-8000-000000000003', 'd4000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001'),
  ('d6000000-0000-4000-8000-000000000004', 'd4000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002'),
  ('d6000000-0000-4000-8000-000000000005', 'd4000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003'),
  ('d6000000-0000-4000-8000-000000000006', 'd4000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003');

insert into public.client_aliases (id, client_id, alias_type, alias) values
  ('d5000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'NAME', 'Mod. Semente');

commit;
