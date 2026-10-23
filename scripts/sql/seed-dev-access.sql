-- =============================================================================
-- Atribuição de papéis do SEED LOCAL (fase 2 do `npm run seed:dev`).
-- Executado por: supabase db query --local -f scripts/sql/seed-dev-access.sql
-- (conexão como postgres, só no banco local). Apenas e-mails fictícios do domínio
-- reservado example.com (RAT-D019).
--
-- Uma única instrução: a CLI envia o arquivo como comando preparado e não aceita
-- várias instruções. A instrução roda numa única transação, na ordem abaixo
-- (o Administrador primeiro). Cada chamada define motivo, origem SCRIPT e rótulo
-- 'seed-dev' e grava ROW_CHANGE + EVENT ACCESS_CHANGE na auditoria. É idempotente.
-- O usuário sem papel (semvinculo@example.com) é criado pelo script e não recebe papel.
-- =============================================================================
select
  private.set_user_access('admin@example.com',        'ADMINISTRATOR', null, true,
    'Seed local de desenvolvimento', 'seed-dev'),
  private.set_user_access('operador@example.com',     'OPERATOR',      null, true,
    'Seed local de desenvolvimento', 'seed-dev'),
  private.set_user_access('visualizador@example.com', 'VIEWER',        null, true,
    'Seed local de desenvolvimento', 'seed-dev'),
  private.set_user_access('socio@example.com',        'PARTNER',
    'a0000000-0000-4000-8000-000000000001', true,
    'Seed local de desenvolvimento', 'seed-dev');
