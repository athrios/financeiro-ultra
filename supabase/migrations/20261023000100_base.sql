-- =============================================================================
-- 0100 · Base: schema privado, enums e utilitários
-- FND-001 / E4 · nova linha de base do banco (RAT-D012)
-- Fonte: docs/features/FND-001-fundacao/02-modelagem-dados.md, seção 3.1
-- =============================================================================
-- O schema "private" não é exposto pelo PostgREST: guarda funções auxiliares
-- usadas por triggers e políticas RLS, sem virar endpoint RPC.
-- Nenhum objeto tem organization_id (empresa única, RAT-D010) e nenhuma tabela
-- guarda percentual como parâmetro (RAT-D015).
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Papéis do sistema (RAT-D011) + papel do login dos sócios (plano 6).
-- NULL em profiles.role = "sem papel atribuído" (nenhum acesso).
create type public.app_role as enum ('ADMINISTRATOR', 'OPERATOR', 'VIEWER', 'PARTNER');

create type public.audit_kind   as enum ('ROW_CHANGE', 'EVENT');
create type public.audit_source as enum ('UI', 'IMPORT', 'SYSTEM', 'SCRIPT', 'DIRECT');

create type public.proof_upload_status     as enum ('PENDING_UPLOAD', 'STORED');
create type public.proof_extraction_status as enum ('NOT_REQUESTED', 'PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- -----------------------------------------------------------------------------
-- Utilitários reaproveitados das migrations de 07/10 (sem mudança de comportamento)
-- NÃO reaproveitados: to_percentage, normalize_cnpj, is_valid_cnpj (voltam, se
-- necessário, na feature Clientes) e os enums de 07/10.
-- -----------------------------------------------------------------------------

-- Mantém updated_at coerente sem depender da aplicação.
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Normalização de nomes e apelidos:
-- minúsculas, sem acentos, sem pontuação, espaços colapsados.
-- "Contabil Exemplo Ltda." -> "contabil exemplo ltda"
-- Implementada sem a extensão unaccent para poder ser IMMUTABLE
-- (necessário para coluna gerada e índice único). Os acentos são removidos
-- antes do lower() para não depender do LC_CTYPE do banco.
create function private.normalize_alias(p_alias text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select pg_catalog.btrim(
    pg_catalog.regexp_replace(
      pg_catalog.lower(
        pg_catalog.translate(
          coalesce(p_alias, ''),
          'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝýÿ',
          'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYyy'
        )
      ),
      '[^a-z0-9]+', ' ', 'g'
    )
  );
$$;

-- Bloqueia UPDATE/DELETE (auditoria, snapshots e exclusão física de cadastros).
create function private.prevent_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% é imutável: operação % não permitida.', tg_table_name, tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

-- Conversão estrita de texto para dinheiro.
-- Um cast direto para numeric(p,s) ARREDONDA silenciosamente o excesso de
-- casas decimais; esta função rejeita em vez de arredondar.
create function private.to_money(p_value text)
returns numeric(14, 2)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_raw numeric;
begin
  if p_value is null or p_value !~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then
    raise exception 'Valor monetário inválido: "%".', p_value using errcode = 'invalid_parameter_value';
  end if;
  v_raw := p_value::numeric;
  if v_raw <> pg_catalog.round(v_raw, 2) then
    raise exception 'Valor "%" tem mais de 2 casas decimais.', p_value using errcode = 'invalid_parameter_value';
  end if;
  if v_raw < 0 then
    raise exception 'Valor "%" não pode ser negativo.', p_value using errcode = 'invalid_parameter_value';
  end if;
  return v_raw::numeric(14, 2);
end;
$$;

-- Bloqueio de TRUNCATE (statement-level), usado na auditoria.
create function private.prevent_truncate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% é imutável: TRUNCATE não permitido.', tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;

revoke execute on function private.set_updated_at()        from public;
revoke execute on function private.normalize_alias(text)   from public;
revoke execute on function private.prevent_mutation()      from public;
revoke execute on function private.to_money(text)          from public;
revoke execute on function private.prevent_truncate()      from public;
-- normalize_alias é pura e IMMUTABLE, e é avaliada em colunas geradas e índices:
-- o EXECUTE é verificado para quem escreve a tabela, então as features futuras
-- (escrita por authenticated) dependem dele. Conceder é inofensivo.
grant execute on function private.normalize_alias(text) to authenticated, service_role;
