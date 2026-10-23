-- =============================================================================
-- 0700 · Endurecimento de privilégios
-- =============================================================================
-- O RLS já bloqueia o acesso, mas os GRANTs padrão do Supabase concedem tudo
-- a "anon" e "authenticated". Aqui reduzimos os privilégios de tabela ao
-- mínimo necessário (defesa em profundidade): o sistema não tem nenhum dado
-- público, e operações que só devem ocorrer via RPC perdem o GRANT direto.
-- =============================================================================

-- Nenhum acesso anônimo a dados financeiros.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- TRUNCATE/REFERENCES/TRIGGER ignoram RLS ou não fazem sentido via API.
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- Auditoria: somente leitura (gravação apenas por trigger SECURITY DEFINER).
revoke insert, update, delete on public.audit_logs from authenticated;

-- Snapshot da distribuição: gravação apenas via confirm_receipt.
revoke insert, update, delete on public.receipt_allocations from authenticated;

-- Liquidações: append-only.
revoke update, delete on public.settlements from authenticated;

-- Configuração: linha única, sem INSERT/DELETE via API.
revoke insert, delete on public.finance_settings from authenticated;

-- Perfis: criados pelo trigger do Auth e removidos em cascata.
revoke insert, delete on public.profiles from authenticated;

-- Ledger: somente leitura.
revoke insert, update, delete on public.financial_ledger from authenticated;

-- Objetos futuros criados por migrations não nascem acessíveis ao anon.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- -----------------------------------------------------------------------------
-- RLS da auditoria
-- -----------------------------------------------------------------------------
create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated
  using ((select private.is_admin()));
