-- =============================================================================
-- Conferência (somente leitura) depois do bootstrap do primeiro Administrador.
-- Rode no editor SQL do painel. Não contém e-mail nem dado pessoal.
--
-- Esperado logo após o primeiro bootstrap (usuário que já tinha perfil):
--   administradores_ativos        1
--   BOOTSTRAP_ADMIN (EVENT)       1   origem SCRIPT, rótulo = o que você informou
--   UPDATE profiles (ROW_CHANGE)  1   origem SCRIPT, motivo "Bootstrap do primeiro Administrador"
-- Se o usuário não tinha perfil, também aparece 1 CREATE em profiles.
-- =============================================================================
select 'administradores_ativos' as item, count(*)::text as valor, null::text as origem, null::text as rotulo, null::text as motivo
from public.profiles
where role = 'ADMINISTRATOR' and active
union all
select kind::text || ' ' || action || ' ' || entity, count(*)::text, min(source::text), min(actor_label), min(reason)
from public.audit_logs
where entity = 'profile' and (action = 'BOOTSTRAP_ADMIN' or source = 'SCRIPT')
group by kind, action, entity
order by 1;
