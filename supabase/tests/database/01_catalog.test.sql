-- =============================================================================
-- pgTAP · Catálogo: RLS em 100% de public, anon sem acesso, privilégios por lista
-- explícita, sem float, sem resíduos de 07/10, bucket privado.
-- Executar com: npm run db:test  (supabase test db)
-- Cada arquivo roda numa transação desfeita ao final.
-- Rastreio: CA-04, CA-05, CA-11, CA-16 · I-01, I-09, I-13, I-16, I-17, I-37.
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(38);

-- -----------------------------------------------------------------------------
-- RLS (I-01 · CA-05)
-- -----------------------------------------------------------------------------
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  '',
  'Toda tabela de public tem RLS ativo (consulta ao catálogo)');

select cmp_ok(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')),
  '>=', 4::bigint,
  'O catálogo enxerga as tabelas da FND (partners, profiles, audit_logs, proof_files)');

select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('v', 'm')),
  0::bigint,
  'Nenhuma view em public na FND (views futuras exigem security_invoker)');

-- -----------------------------------------------------------------------------
-- anon sem nenhum privilégio (CA-05)
-- -----------------------------------------------------------------------------
select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
      and case when c.relkind in ('r', 'p', 'v', 'm')
               then has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate,references,trigger')
                    or has_any_column_privilege('anon', c.oid, 'select,insert,update,references') end),
  0::bigint,
  'anon não tem privilégio em nenhuma tabela de public');

select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'S'
      and case when c.relkind = 'S' then has_sequence_privilege('anon', c.oid, 'usage,select,update') end),
  0::bigint,
  'anon não tem privilégio em nenhuma sequência de public');

select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')),
  0::bigint,
  'anon não executa nenhuma função de public (inclui o grant a PUBLIC)');

select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
      and c.relname <> 'proof_files'
      and case when c.relkind in ('r', 'p', 'v', 'm')
               then has_table_privilege('authenticated', c.oid, 'insert,update,delete,truncate,references,trigger') end),
  0::bigint,
  'authenticated não escreve em nenhuma tabela de public, exceto as colunas concedidas de proof_files');

select is(
  (select count(*) from pg_class c
    where c.oid = 'public.proof_files'::regclass
      and has_table_privilege('authenticated', c.oid, 'insert,update,delete,truncate')),
  0::bigint,
  'authenticated não tem INSERT/UPDATE/DELETE de tabela inteira em proof_files (só por coluna)');

select set_eq(
  $$select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')$$,
  $$values ('register_proof_file'::text), ('complete_proof_file_upload')$$,
  'authenticated executa em public somente as duas RPCs de comprovante (lista explícita)');

select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef),
  0::bigint,
  'Nenhuma função SECURITY DEFINER exposta em public (plano 12)');

select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')),
  0::bigint,
  'Toda função SECURITY DEFINER fixa o search_path');

select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon não usa o schema private');

-- Procedimentos de acesso: só o dono executa.
select is(
  (select count(*) from (values
      ('private.bootstrap_first_admin(text,text)'),
      ('private.set_user_access(text,public.app_role,uuid,boolean,text,text)'),
      ('private.resolve_user_for_access(text)')) f(sig)
    cross join (values ('anon'), ('authenticated'), ('service_role')) r(rol)
    where has_function_privilege(r.rol, f.sig::regprocedure, 'execute')),
  0::bigint,
  'bootstrap_first_admin, set_user_access e resolve_user_for_access: execução negada a anon, authenticated e service_role');

-- Privilégios padrão de objetos futuros (alter default privileges).
create table public.zz_default_acl_probe (id uuid primary key);
select ok(
  not has_table_privilege('anon', 'public.zz_default_acl_probe', 'select,insert,update,delete')
  and not has_table_privilege('authenticated', 'public.zz_default_acl_probe', 'select,insert,update,delete'),
  'Tabela nova em public nasce sem privilégio para anon e authenticated');

-- O "alter default privileges ... in schema public revoke execute on functions from public" remove só
-- o que o Supabase concede por padrão (anon/authenticated); o EXECUTE de PUBLIC das funções novas vem do
-- padrão global do PostgreSQL e não sai assim. Por isso toda migration com função faz
-- "revoke execute ... from public" explícito, e as duas listas abaixo (public e private) são a rede de
-- segurança: função nova sem revoke aparece aqui e falha o teste.
select set_eq(
  $$select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute')$$,
  $$values ('audit_event'::text), ('set_audit_context'), ('has_role'), ('is_admin'),
           ('can_operate'), ('can_read_business'), ('current_partner_id'), ('proof_upload_allowed'),
           ('proof_readable'), ('normalize_alias')$$,
  'authenticated executa em private somente a lista explícita (RLS, RPCs invoker e coluna gerada)');

-- -----------------------------------------------------------------------------
-- Tipos monetários e percentuais (I-17 · CA-11 · I-37)
-- -----------------------------------------------------------------------------
select is(
  (select coalesce(string_agg(c.relname || '.' || a.attname, ', '), '')
     from pg_attribute a
     join pg_class c on c.oid = a.attrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') and a.attnum > 0 and not a.attisdropped
      and a.atttypid in ('float4'::regtype, 'float8'::regtype)),
  '',
  'Nenhuma coluna real/double precision em public');

select is(
  (select coalesce(string_agg(c.relname || '.' || a.attname, ', '), '')
     from pg_attribute a
     join pg_class c on c.oid = a.attrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped
      and (a.attname ilike '%percent%' or a.attname ilike '%pct%')),
  '',
  'Nenhuma coluna de percentual na FND (RAT-D015; as futuras só no snapshot de receipt_allocations)');

-- -----------------------------------------------------------------------------
-- Resíduos de 07/10 e escopo (CA-16 · RAT-D010)
-- -----------------------------------------------------------------------------
select is(
  (select coalesce(string_agg(c.relname, ', '), '')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
      and c.relname in ('indicators', 'indicator_receipt_aliases', 'finance_settings', 'companies',
                        'company_indicators', 'competencies', 'competency_companies', 'receipts',
                        'receipt_allocations', 'settlements', 'financial_ledger')),
  '',
  'Nenhuma tabela ou view de 07/10 existe no schema ativo');

select is(
  (select coalesce(string_agg(c.relname || '.' || a.attname, ', '), '')
     from pg_attribute a
     join pg_class c on c.oid = a.attrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped
      and a.attname in ('distribution_mode', 'default_percentage', 'custom_percentage',
                        'indicator_id', 'organization_id', 'use_custom_default_percentages')),
  '',
  'Nenhuma coluna de 07/10 nem organization_id (empresa única, RAT-D010)');

select is(
  (select count(*) from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname in ('user_role', 'distribution_mode', 'competency_status', 'distribution_source')),
  0::bigint,
  'Nenhum enum de 07/10 (user_role, distribution_mode, ...) existe');

select set_eq(
  $$select e.enumlabel::text from pg_enum e where e.enumtypid = 'public.app_role'::regtype$$,
  $$values ('ADMINISTRATOR'::text), ('OPERATOR'), ('VIEWER'), ('PARTNER')$$,
  'app_role tem exatamente os quatro papéis de RAT-D011 + Sócio');

-- -----------------------------------------------------------------------------
-- Auditoria: regra "toda tabela auditada tem id uuid" (3.4 · R-D21)
-- -----------------------------------------------------------------------------
select is(
  (select count(distinct t.tgrelid) from pg_trigger t
    where t.tgfoid = 'private.audit_row_change'::regproc and not t.tgisinternal),
  3::bigint,
  'Três tabelas auditadas na FND: partners, profiles, proof_files');

select is(
  (select coalesce(string_agg(t.tgrelid::regclass::text, ', '), '')
     from pg_trigger t
    where t.tgfoid = 'private.audit_row_change'::regproc and not t.tgisinternal
      and not exists (
        select 1 from pg_attribute a
         where a.attrelid = t.tgrelid and a.attname = 'id' and a.atttypid = 'uuid'::regtype and not a.attisdropped)),
  '',
  'Toda tabela com audit_row_change tem coluna id do tipo uuid');

select ok(
  exists (select 1 from pg_trigger where tgrelid = 'public.audit_logs'::regclass and tgname = 'audit_logs_immutable' and not tgisinternal)
  and exists (select 1 from pg_trigger where tgrelid = 'public.audit_logs'::regclass and tgname = 'audit_logs_no_truncate' and not tgisinternal),
  'audit_logs tem os triggers contra UPDATE/DELETE e contra TRUNCATE');

select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'audit_logs'
      and (has_table_privilege('authenticated', c.oid, 'insert,update,delete,truncate')
           or has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate'))),
  0::bigint,
  'audit_logs: authenticated só lê; anon nada');

select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('audit_logs', 'profiles')
      and has_table_privilege('service_role', c.oid, 'insert,update,delete,truncate')),
  0::bigint,
  'service_role sem escrita em audit_logs e profiles (I-07, I-09)');

-- -----------------------------------------------------------------------------
-- TRUNCATE (SEG-E45-08): não dispara triggers de linha (auditoria, bloqueio de DELETE)
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and (has_table_privilege('anon', c.oid, 'truncate')
           or has_table_privilege('authenticated', c.oid, 'truncate')
           or has_table_privilege('service_role', c.oid, 'truncate'))),
  '',
  'Nenhuma tabela de public concede TRUNCATE a anon, authenticated ou service_role');

select is(
  (select coalesce(string_agg(r.relid::regclass::text, ', ' order by r.relid::regclass::text), '')
     from (select t.tgrelid as relid from pg_trigger t
            where t.tgfoid = 'private.audit_row_change'::regproc and not t.tgisinternal
           union select 'public.audit_logs'::regclass) r
    where not exists (
      select 1 from pg_trigger b
       where b.tgrelid = r.relid and not b.tgisinternal
         and b.tgfoid = 'private.prevent_truncate'::regproc
         and (b.tgtype & 2) <> 0 and (b.tgtype & 32) <> 0 and (b.tgtype & 1) = 0)),
  '',
  'Toda tabela auditada (e audit_logs) tem trigger BEFORE TRUNCATE por statement que bloqueia');

select throws_ok(
  $$truncate table public.proof_files$$, '42501', null,
  'TRUNCATE em proof_files é bloqueado até para o dono da tabela');

select throws_ok(
  $$truncate table public.partners cascade$$, '42501', null,
  'TRUNCATE ... CASCADE a partir de partners também é bloqueado (triggers de partners e profiles)');

-- -----------------------------------------------------------------------------
-- Bucket privado e políticas de storage (I-16)
-- -----------------------------------------------------------------------------
select results_eq(
  $$select public, file_size_limit, allowed_mime_types::text[] from storage.buckets where id = 'proofs'$$,
  $$values (false, 4194304::bigint, array['application/pdf', 'image/jpeg', 'image/png'])$$,
  'Bucket proofs é privado, limita 4 MiB e aceita PDF/JPEG/PNG');

select is(
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
    and policyname like 'proofs\_%' and cmd = 'INSERT'),
  1::bigint, 'Existe exatamente uma política de INSERT do bucket proofs');

select is(
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
    and policyname like 'proofs\_%' and cmd = 'SELECT'),
  1::bigint, 'Existe exatamente uma política de SELECT do bucket proofs');

select is(
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
    and cmd in ('UPDATE', 'DELETE', 'ALL')
    and (coalesce(qual, '') || coalesce(with_check, '') ilike '%proofs%')),
  0::bigint,
  'Nenhuma política de UPDATE, DELETE ou ALL em storage.objects alcança o bucket proofs (sem sobrescrita nem exclusão pela API)');

select is(
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
    and policyname like 'proofs\_%' and 'anon' = any (roles)),
  0::bigint, 'Nenhuma política do bucket proofs vale para anon');

-- -----------------------------------------------------------------------------
-- Restrições estruturais de proof_files (I-12, I-13)
-- -----------------------------------------------------------------------------
select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.proof_files'::regclass and conname = 'proof_files_sha256_key' and contype = 'u'),
  'sha256 é único em proof_files (RN-008)');

select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.proof_files'::regclass and conname = 'proof_files_path_format' and contype = 'c'),
  'O caminho do arquivo tem formato fixo definido por CHECK (I-13)');

select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_partner_role_requires_partner' and contype = 'c')
  and exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'profiles_partner_id_key'),
  'PARTNER exige partner_id e cada sócio tem no máximo um login (I-04, I-05)');

select * from finish();
rollback;
