-- =============================================================================
-- pgTAP · Matriz de papéis (plano 6): permitido × negado por papel
-- Papéis: ADMINISTRATOR, OPERATOR, VIEWER, PARTNER (negado por padrão até P-02b),
-- sem papel e inativo. Mais anon.
-- Rastreio: CA-05, CA-06, CA-08, CA-09 · I-06, I-07, I-09.
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(44);

-- -----------------------------------------------------------------------------
-- Fixtures (como postgres)
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

select private.set_user_access('pgtap-admin@example.com',       'ADMINISTRATOR', null, true,  'fixture de teste', 'pgtap');
select private.set_user_access('pgtap-operador@example.com',    'OPERATOR',      null, true,  'fixture de teste', 'pgtap');
select private.set_user_access('pgtap-visualizador@example.com','VIEWER',        null, true,  'fixture de teste', 'pgtap');
select private.set_user_access('pgtap-socio@example.com',       'PARTNER',       'f2000000-0000-4000-8000-000000000001', true, 'fixture de teste', 'pgtap');
select private.set_user_access('pgtap-inativo@example.com',     'OPERATOR',      null, false, 'fixture de teste', 'pgtap');

-- Um comprovante existente (registrado pelo Operador, com o JWT dele, mas ainda como postgres).
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
insert into public.proof_files (sha256, mime_type, size_bytes, original_name)
values (repeat('a', 64), 'application/pdf', 1000, 'comprovante-teste.pdf');
select set_config('request.jwt.claims', '', true);

-- -----------------------------------------------------------------------------
-- ADMINISTRATOR: lê tudo; não escreve pela API
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is((select count(*) from public.partners where name like 'Sócio Teste%'), 2::bigint, 'ADMINISTRATOR lê partners');
select is((select count(*) from public.profiles where id::text like 'f1000000-%'), 6::bigint, 'ADMINISTRATOR lê todos os perfis (não só o próprio)');
select cmp_ok((select count(*) from public.audit_logs), '>', 0::bigint, 'ADMINISTRATOR lê a auditoria');
select is((select count(*) from public.proof_files where uploaded_by::text like 'f1000000-%'), 1::bigint, 'ADMINISTRATOR lê proof_files');
select throws_ok($$update public.profiles set role = 'VIEWER' where id = 'f1000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'ADMINISTRATOR não altera perfis pela API (só pelo procedimento auditado)');
select throws_ok($$insert into public.partners (name) values ('Novo')$$,
  '42501', null, 'ADMINISTRATOR não grava partners pela API na FND');
select throws_ok($$delete from public.profiles where id = 'f1000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'ADMINISTRATOR não exclui perfis pela API');

-- -----------------------------------------------------------------------------
-- OPERATOR: lê negócio, só o próprio perfil, sem auditoria
-- -----------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is((select count(*) from public.partners where name like 'Sócio Teste%'), 2::bigint, 'OPERATOR lê partners');
select is((select count(*) from public.profiles), 1::bigint, 'OPERATOR lê apenas o próprio perfil');
select is((select count(*) from public.audit_logs), 0::bigint, 'OPERATOR não lê a auditoria');
select is((select count(*) from public.proof_files where uploaded_by::text like 'f1000000-%'), 1::bigint, 'OPERATOR lê proof_files');
select throws_ok($$update public.profiles set role = 'ADMINISTRATOR' where id = 'f1000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'OPERATOR não se autopromove');
select throws_ok($$insert into public.audit_logs (kind, entity, entity_id, action, source, request_role)
                    values ('EVENT', 'x', gen_random_uuid(), 'FORGED', 'UI', 'authenticated')$$,
  '42501', null, 'OPERATOR não forja linha de auditoria');

-- -----------------------------------------------------------------------------
-- VIEWER: leitura geral, sem auditoria, sem envio de comprovante
-- -----------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select is((select count(*) from public.partners where name like 'Sócio Teste%'), 2::bigint, 'VIEWER lê partners');
select is((select count(*) from public.profiles), 1::bigint, 'VIEWER lê apenas o próprio perfil');
select is((select count(*) from public.audit_logs), 0::bigint, 'VIEWER não lê a auditoria');
select is((select count(*) from public.proof_files where uploaded_by::text like 'f1000000-%'), 1::bigint, 'VIEWER lê proof_files (M-04: segue a matriz aprovada)');
select throws_ok($$select * from public.register_proof_file(repeat('b', 64), 'application/pdf', 10, 'x.pdf')$$,
  '42501', null, 'VIEWER não registra comprovante');

-- -----------------------------------------------------------------------------
-- PARTNER: negado por padrão até P-02b (CA-06), lê só o próprio perfil
-- -----------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);

select is((select count(*) from public.partners), 0::bigint, 'PARTNER não lê partners (negado por padrão)');
select is((select count(*) from public.profiles), 1::bigint, 'PARTNER lê apenas o próprio perfil');
select is((select role::text from public.profiles), 'PARTNER', 'O próprio perfil do PARTNER mostra o papel (estado "sem escopo")');
select is((select count(*) from public.audit_logs), 0::bigint, 'PARTNER não lê a auditoria');
select is((select count(*) from public.proof_files), 0::bigint, 'PARTNER não lê proof_files');
select throws_ok($$select * from public.register_proof_file(repeat('b', 64), 'application/pdf', 10, 'x.pdf')$$,
  '42501', null, 'PARTNER não registra comprovante');
select throws_ok($$update public.profiles set partner_id = 'f2000000-0000-4000-8000-000000000002' where id = 'f1000000-0000-4000-8000-000000000004'$$,
  '42501', null, 'PARTNER não troca o próprio vínculo');

-- -----------------------------------------------------------------------------
-- Sem papel (role nulo): autentica, mas não acessa nada (CA-08)
-- -----------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000005","role":"authenticated"}', true);

select is((select count(*) from public.partners), 0::bigint, 'Sem papel não lê partners');
select is((select count(*) from public.profiles), 1::bigint, 'Sem papel lê apenas o próprio perfil');
select is((select role::text from public.profiles), null, 'O próprio perfil sem papel mostra role nulo (estado "sem vínculo")');
select is((select count(*) from public.audit_logs), 0::bigint, 'Sem papel não lê a auditoria');
select is((select count(*) from public.proof_files), 0::bigint, 'Sem papel não lê proof_files');
select throws_ok($$select * from public.register_proof_file(repeat('b', 64), 'application/pdf', 10, 'x.pdf')$$,
  '42501', null, 'Sem papel não registra comprovante');

-- -----------------------------------------------------------------------------
-- Inativo (Operador desativado): nada
-- -----------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000006","role":"authenticated"}', true);

select is((select count(*) from public.partners), 0::bigint, 'Inativo não lê partners');
select is((select active from public.profiles), false, 'Inativo lê o próprio perfil e vê active = false (estado "bloqueado")');
select is((select count(*) from public.proof_files), 0::bigint, 'Inativo não lê proof_files');
select throws_ok($$select * from public.register_proof_file(repeat('b', 64), 'application/pdf', 10, 'x.pdf')$$,
  '42501', null, 'Inativo não registra comprovante');

-- -----------------------------------------------------------------------------
-- anon: nenhum acesso
-- -----------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);

select throws_ok($$select count(*) from public.partners$$,     '42501', null, 'anon não lê partners');
select throws_ok($$select count(*) from public.profiles$$,     '42501', null, 'anon não lê profiles');
select throws_ok($$select count(*) from public.audit_logs$$,   '42501', null, 'anon não lê audit_logs');
select throws_ok($$select count(*) from public.proof_files$$,  '42501', null, 'anon não lê proof_files');
select throws_ok($$select * from public.register_proof_file(repeat('b', 64), 'application/pdf', 10, 'x.pdf')$$,
  '42501', null, 'anon não executa register_proof_file');
select throws_ok($$select * from public.complete_proof_file_upload(gen_random_uuid())$$,
  '42501', null, 'anon não executa complete_proof_file_upload');

-- -----------------------------------------------------------------------------
-- service_role não escreve em profiles nem em audit_logs (I-07, I-09)
-- -----------------------------------------------------------------------------
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select throws_ok($$insert into public.audit_logs (kind, entity, entity_id, action, source, request_role)
                    values ('EVENT', 'x', gen_random_uuid(), 'FORGED', 'SYSTEM', 'service_role')$$,
  '42501', null, 'service_role não forja linha de auditoria');
select throws_ok($$update public.profiles set role = 'ADMINISTRATOR' where id = 'f1000000-0000-4000-8000-000000000005'$$,
  '42501', null, 'service_role não altera perfis');
select throws_ok($$delete from public.profiles where id = 'f1000000-0000-4000-8000-000000000005'$$,
  '42501', null, 'service_role não exclui perfis');

reset role;
select * from finish();
rollback;
