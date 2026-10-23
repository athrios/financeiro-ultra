-- =============================================================================
-- Bootstrap do PRIMEIRO Administrador (FND-001, E8; contrato em 02-modelagem-dados.md, seção 6).
--
-- O sistema nasce sem nenhum Administrador. Este script promove, uma única vez, o usuário que
-- você já convidou pelo painel do Supabase. Ele roda DEPOIS do workflow de migrations (que cria
-- private.bootstrap_first_admin) e depois de o convite ter sido enviado.
--
-- COMO USAR (ambiente hospedado, E9):
--   1. No painel do Supabase: Authentication > Users > Invite user, com o seu e-mail. Pode aceitar
--      o convite antes ou depois; o e-mail não precisa estar confirmado para o bootstrap.
--   2. Copie ESTE arquivo para o editor SQL do painel (SQL Editor). NÃO salve a versão preenchida
--      neste repositório e não a envie a ninguém: o e-mail real não pode ser versionado (RAT-D019).
--   3. Troque os dois marcadores abaixo, mantendo as aspas simples:
--        <EMAIL-DO-ADMINISTRADOR>          -> o e-mail do convite
--        <IDENTIFICACAO-DE-QUEM-EXECUTA>   -> ex.: responsavel-produto via painel
--   4. Execute uma vez. Resultado esperado: PROMOTED (primeira vez) ou ALREADY_ADMIN (repetição;
--      não escreve nada).
--   5. Confira com scripts/sql/bootstrap-first-admin-verify.sql e guarde o resultado como
--      evidência da E9b (sem o e-mail).
--
-- O QUE ELE FAZ: valida o e-mail, cria o perfil se faltar, torna o usuário Administrador ativo e
-- registra na auditoria (ator = o rótulo acima, origem SCRIPT, evento BOOTSTRAP_ADMIN). O motivo
-- da auditoria é fixo ("Bootstrap do primeiro Administrador"); informar motivo aqui é opcional
-- (RAT-D021). NÃO serve para criar um segundo Administrador: se já houver outro ativo, falha com
-- "Já existe Administrador"; para isso use private.set_user_access. Mesmo com os marcadores
-- intactos, falha com "E-mail inválido" e não grava nada.
--
-- Só o dono do banco (postgres) executa a função; o editor SQL do painel tem esse acesso. Uma
-- única instrução: a função já é atômica e a CLI (`supabase db query`) só aceita uma.
-- =============================================================================
select private.bootstrap_first_admin(
  '<EMAIL-DO-ADMINISTRADOR>',
  '<IDENTIFICACAO-DE-QUEM-EXECUTA>'
);
