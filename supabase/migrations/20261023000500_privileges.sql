-- =============================================================================
-- 0500 · Privilégios: lista de permissões (corrige F-07)
-- FND-001 / E4 · Fonte: 02-modelagem-dados.md, seção 3.6
-- =============================================================================
-- Revoga tudo e concede só o necessário. Cada feature acrescenta as próprias
-- concessões na sua migration (nunca "grant all"). O teste de catálogo verifica
-- que "anon" não tem nenhum privilégio em public.
-- =============================================================================

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

alter default privileges for role postgres in schema public revoke all     on tables    from anon, authenticated;
alter default privileges for role postgres in schema public revoke all     on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

grant select on public.partners, public.profiles, public.audit_logs, public.proof_files to authenticated;
grant insert (sha256, mime_type, size_bytes, original_name)          on public.proof_files to authenticated;
grant update (upload_status, deleted_at, deleted_by, deletion_reason) on public.proof_files to authenticated;
-- deleted_at/deleted_by são sobrescritos pela guarda (relógio do servidor e auth.uid()).

grant execute on function public.register_proof_file(text, text, bigint, text) to authenticated;
grant execute on function public.complete_proof_file_upload(uuid)               to authenticated;

-- service_role mantém os padrões do Supabase (uso só em scripts locais; plano 10), EXCETO
-- escrita em profiles e audit_logs: sem isto, a chave secreta inseriria perfis com papel sem
-- motivo (I-07) e forjaria linhas de auditoria (I-09). Triggers e procedimentos rodam como postgres.
revoke insert, update, delete, truncate on public.profiles, public.audit_logs from service_role;

-- TRUNCATE não dispara os triggers de linha (auditoria, bloqueio de DELETE): ninguém além do dono
-- das tabelas o recebe, em nenhuma tabela de public, nem nas criadas no futuro (SEG-E45-08).
-- partners, profiles, proof_files e audit_logs ainda têm trigger BEFORE TRUNCATE que bloqueia.
revoke truncate on all tables in schema public from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke truncate on tables from anon, authenticated, service_role;
