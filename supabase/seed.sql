-- =============================================================================
-- Seed de DESENVOLVIMENTO (aplicado apenas em `supabase db reset` local).
-- Somente dados fictícios (RAT-D019). Sem percentuais (RAT-D015: a divisão é
-- sempre 1/n) e sem usuários: usuários e papéis vêm de `npm run seed:dev`,
-- que atribui os papéis por private.set_user_access (com motivo e auditoria).
-- =============================================================================

begin;

-- Origem e motivo da auditoria deste seed (vale até o fim desta transação).
select private.set_audit_context('Seed local de desenvolvimento', 'SCRIPT', null, 'seed.sql');

insert into public.partners (id, name) values
  ('a0000000-0000-4000-8000-000000000001', 'Sócio Exemplo A'),
  ('a0000000-0000-4000-8000-000000000002', 'Sócio Exemplo B'),
  ('a0000000-0000-4000-8000-000000000003', 'Sócio Exemplo C');

commit;
