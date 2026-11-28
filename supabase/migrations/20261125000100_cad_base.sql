-- =============================================================================
-- CAD-001 · 0100 · Base: tipos, documentos, normalizadores e auxiliares de escrita
-- Sócios, Recebedores e Clientes · E3a, parte 1
-- Fonte: docs/features/CAD-001-socios-e-clientes/02-modelagem-dados.md
--        (revisão 2), seções 2.3, 3.2, 3.3, 6.1, 7.2 e 10.1 (ordem 1).
-- =============================================================================
-- Só acrescenta. Nenhuma migration da FND é editada e nenhum objeto existente
-- muda. As tabelas ficam na migration seguinte (0200) e as funções de escrita
-- (RPCs), nas posteriores.
-- Regras de negócio que esta migration sustenta: RAT-D023 (recebedor), RAT-D024
-- (documento do cliente: CPF ou CNPJ, numérico ou alfanumérico, com DV) e
-- RAT-D025 (sócio só com nome e apelidos).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tipos (2.3)
-- -----------------------------------------------------------------------------
create type public.receiver_identifier_type as enum ('NAME_VARIANT', 'PIX_KEY', 'BANK_ACCOUNT');
create type public.client_alias_type        as enum ('NAME', 'DOCUMENT');

-- -----------------------------------------------------------------------------
-- Documentos (3.2): fonte única das regras de CPF e CNPJ no banco
-- -----------------------------------------------------------------------------

-- '12.ABC.345/01de-35' -> '12ABC34501DE35'; NULL ou só formatação -> NULL.
-- Remove só espaços, pontos, barras e hífens; qualquer outro caractere permanece
-- e faz o documento ser recusado por is_valid_document (nunca é descartado em silêncio).
create function private.normalize_document(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(pg_catalog.upper(
           pg_catalog.regexp_replace(coalesce(p_value, ''), '[[:space:]./-]', '', 'g')), '');
$$;

-- CPF: 11 dígitos, DV pelo módulo 11 (pesos 10..2 e 11..2); recusa os 11 dígitos iguais.
create function private.is_valid_cpf(p_doc text)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_sum int;
  v_dv  int;
begin
  if p_doc is null or p_doc !~ '^[0-9]{11}$'
     or p_doc = pg_catalog.repeat(pg_catalog.substr(p_doc, 1, 1), 11) then
    return false;
  end if;

  v_sum := 0;
  for i in 1..9 loop
    v_sum := v_sum + pg_catalog.substr(p_doc, i, 1)::int * (11 - i);
  end loop;
  v_dv := (v_sum * 10) % 11;
  if v_dv = 10 then v_dv := 0; end if;
  if v_dv <> pg_catalog.substr(p_doc, 10, 1)::int then
    return false;
  end if;

  v_sum := 0;
  for i in 1..10 loop
    v_sum := v_sum + pg_catalog.substr(p_doc, i, 1)::int * (12 - i);
  end loop;
  v_dv := (v_sum * 10) % 11;
  if v_dv = 10 then v_dv := 0; end if;
  return v_dv = pg_catalog.substr(p_doc, 11, 1)::int;
end;
$$;

-- CNPJ numérico e alfanumérico (o cálculo novo também valida o antigo, porque cada
-- dígito vale ele mesmo): 12 posições [0-9A-Z] e 2 DVs numéricos. Valor do caractere =
-- código ASCII - 48 ('0'..'9' -> 0..9; 'A' -> 17 ... 'Z' -> 42). DV1 com pesos
-- 5,4,3,2,9,8,7,6,5,4,3,2 sobre as 12 posições; DV2 com pesos 6,5,4,3,2,9,8,7,6,5,4,3,2
-- sobre as 13; resto < 2 -> 0, senão 11 - resto. Recusa os 14 caracteres iguais.
create function private.is_valid_cnpj(p_doc text)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  w1 constant int[] := array[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  w2 constant int[] := array[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  v_sum int;
  v_dv  int;
begin
  if p_doc is null or p_doc !~ '^[0-9A-Z]{12}[0-9]{2}$'
     or p_doc = pg_catalog.repeat(pg_catalog.substr(p_doc, 1, 1), 14) then
    return false;
  end if;

  v_sum := 0;
  for i in 1..12 loop
    v_sum := v_sum + (pg_catalog.ascii(pg_catalog.substr(p_doc, i, 1)) - 48) * w1[i];
  end loop;
  v_dv := case when v_sum % 11 < 2 then 0 else 11 - v_sum % 11 end;
  if v_dv <> pg_catalog.substr(p_doc, 13, 1)::int then
    return false;
  end if;

  v_sum := 0;
  for i in 1..13 loop
    v_sum := v_sum + (pg_catalog.ascii(pg_catalog.substr(p_doc, i, 1)) - 48) * w2[i];
  end loop;
  v_dv := case when v_sum % 11 < 2 then 0 else 11 - v_sum % 11 end;
  return v_dv = pg_catalog.substr(p_doc, 14, 1)::int;
end;
$$;

-- Espera o documento já canônico (resultado de normalize_document).
create function private.is_valid_document(p_doc text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case pg_catalog.char_length(p_doc)
           when 11 then private.is_valid_cpf(p_doc)
           when 14 then private.is_valid_cnpj(p_doc)
           else false
         end;
$$;

-- -----------------------------------------------------------------------------
-- Normalizadores de apelido do cliente e de identificador do recebedor (3.3)
-- Puros (IMMUTABLE): devolvem o valor normalizado ou levantam 22023 com o hint
-- da tabela 3.3 / 6.3. A mensagem é genérica e não repete o valor recebido; a
-- tela usa só o hint.
-- -----------------------------------------------------------------------------

-- NAME -> normalize_alias; DOCUMENT -> normalize_document + DV válido.
create function private.normalize_client_alias(p_type public.client_alias_type, p_alias text)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_value text;
begin
  if p_type is null then
    raise exception 'Tipo de apelido não informado.'
      using errcode = 'invalid_parameter_value', hint = 'NAME_REQUIRED';
  end if;
  if p_alias is not null and pg_catalog.char_length(p_alias) > 200 then
    raise exception 'Apelido acima de 200 caracteres.'
      using errcode = 'invalid_parameter_value', hint = 'NAME_TOO_LONG';
  end if;

  if p_type = 'DOCUMENT' then
    v_value := private.normalize_document(p_alias);
    if v_value is null or not private.is_valid_document(v_value) then
      raise exception 'Documento do apelido inválido.'
        using errcode = 'invalid_parameter_value', hint = 'INVALID_DOCUMENT';
    end if;
    return v_value;
  end if;

  v_value := private.normalize_alias(p_alias);
  if v_value = '' then
    raise exception 'Apelido vazio.'
      using errcode = 'invalid_parameter_value', hint = 'NAME_REQUIRED';
  end if;
  return v_value;
end;
$$;

-- NAME_VARIANT -> normalize_alias.
-- PIX_KEY      -> com "@": lower(btrim); senão minúsculas, sem espaços, pontos, parênteses,
--                 barras e hífens (o "+" inicial do telefone permanece).
--                 Chave com formato de CPF ou CNPJ é aceita e guardada só como chave Pix (RAT-D023);
--                 sem subtipo, o DV não é conferido.
-- BANK_ACCOUNT -> banco normalizado | agência | conta; agência e conta só [0-9X] em maiúsculas,
--                 sem zeros à esquerda ('0' se sobrar vazio).
-- Dos caracteres da agência e da conta, só espaço, ponto e hífen são separadores aceitos;
-- qualquer outro caractere (letra, vírgula) é recusado em vez de descartado em silêncio.
create function private.normalize_receiver_identifier(
  p_type      public.receiver_identifier_type,
  p_value     text,
  p_bank_name text,
  p_branch    text,
  p_account   text
) returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_value  text;
  v_bank   text;
  v_branch text;
  v_acc    text;
begin
  if p_type is null then
    raise exception 'Tipo de identificador não informado.'
      using errcode = 'invalid_parameter_value', hint = 'NAME_REQUIRED';
  end if;

  if p_type = 'NAME_VARIANT' then
    if p_value is not null and pg_catalog.char_length(p_value) > 200 then
      raise exception 'Variação de nome acima de 200 caracteres.'
        using errcode = 'invalid_parameter_value', hint = 'NAME_TOO_LONG';
    end if;
    v_value := private.normalize_alias(p_value);
    if v_value = '' then
      raise exception 'Variação de nome vazia.'
        using errcode = 'invalid_parameter_value', hint = 'NAME_REQUIRED';
    end if;
    return v_value;
  end if;

  if p_type = 'PIX_KEY' then
    if p_value is null or pg_catalog.char_length(pg_catalog.btrim(p_value)) not between 1 and 100 then
      raise exception 'Chave Pix vazia ou acima de 100 caracteres.'
        using errcode = 'invalid_parameter_value', hint = 'INVALID_PIX_KEY';
    end if;
    if pg_catalog.strpos(p_value, '@') > 0 then
      v_value := pg_catalog.lower(pg_catalog.btrim(p_value));
    else
      v_value := pg_catalog.regexp_replace(pg_catalog.lower(p_value), '[[:space:]./()-]', '', 'g');
    end if;
    if v_value = '' then
      raise exception 'Chave Pix vazia.'
        using errcode = 'invalid_parameter_value', hint = 'INVALID_PIX_KEY';
    end if;
    return v_value;
  end if;

  -- BANK_ACCOUNT
  if p_bank_name is null or pg_catalog.char_length(p_bank_name) > 100 then
    raise exception 'Banco vazio ou acima de 100 caracteres.'
      using errcode = 'invalid_parameter_value', hint = 'INVALID_BANK';
  end if;
  v_bank := private.normalize_alias(p_bank_name);
  if v_bank = '' then
    raise exception 'Banco vazio.'
      using errcode = 'invalid_parameter_value', hint = 'INVALID_BANK';
  end if;

  if p_branch is null or pg_catalog.char_length(p_branch) > 20 then
    raise exception 'Agência inválida.'
      using errcode = 'invalid_parameter_value', hint = 'INVALID_BRANCH';
  end if;
  v_branch := pg_catalog.upper(pg_catalog.regexp_replace(p_branch, '[[:space:]./-]', '', 'g'));
  if v_branch !~ '^[0-9X]+$' then
    raise exception 'Agência inválida.'
      using errcode = 'invalid_parameter_value', hint = 'INVALID_BRANCH';
  end if;
  v_branch := coalesce(nullif(pg_catalog.regexp_replace(v_branch, '^0+', ''), ''), '0');
  if pg_catalog.char_length(v_branch) not between 1 and 6 then
    raise exception 'Agência inválida.'
      using errcode = 'invalid_parameter_value', hint = 'INVALID_BRANCH';
  end if;

  if p_account is null or pg_catalog.char_length(p_account) > 30 then
    raise exception 'Conta inválida.'
      using errcode = 'invalid_parameter_value', hint = 'INVALID_ACCOUNT';
  end if;
  v_acc := pg_catalog.upper(pg_catalog.regexp_replace(p_account, '[[:space:]./-]', '', 'g'));
  if v_acc !~ '^[0-9]*[0-9X]$' then
    raise exception 'Conta inválida.'
      using errcode = 'invalid_parameter_value', hint = 'INVALID_ACCOUNT';
  end if;
  v_acc := coalesce(nullif(pg_catalog.regexp_replace(v_acc, '^0+', ''), ''), '0');
  if pg_catalog.char_length(v_acc) not between 1 and 20 then
    raise exception 'Conta inválida.'
      using errcode = 'invalid_parameter_value', hint = 'INVALID_ACCOUNT';
  end if;

  return v_bank || '|' || v_branch || '|' || v_acc;
end;
$$;

-- -----------------------------------------------------------------------------
-- Auxiliares de escrita (6.1, 6.2)
-- Chamadas só pelas funções SECURITY DEFINER das próximas migrations; sem grant.
-- -----------------------------------------------------------------------------

-- Barreira de papel no banco (RAT-D011, RAT-D020): só o Administrador ativo escreve cadastros.
create function private.require_admin()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Somente o Administrador altera cadastros.'
      using errcode = 'insufficient_privilege', hint = 'ADMIN_REQUIRED';
  end if;
end;
$$;

-- Concorrência otimista (6.2): compara o updated_at atual com o que a tela leu, de forma exata
-- (microssegundos). STABLE (e não IMMUTABLE, como no rascunho da modelagem) porque monta o detail
-- com jsonb_build_object sobre timestamptz.
create function private.assert_version(p_current timestamptz, p_expected timestamptz)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_expected is null then
    raise exception 'Versão do registro não informada.'
      using errcode = 'invalid_parameter_value', hint = 'VERSION_REQUIRED';
  end if;
  if p_current is distinct from p_expected then
    raise exception 'O registro foi alterado por outra pessoa.'
      using errcode = 'P0001', hint = 'STALE_VERSION',
            detail = pg_catalog.jsonb_build_object('current_updated_at', p_current)::text;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- revoke / grant (7.2)
-- -----------------------------------------------------------------------------
revoke execute on function private.normalize_document(text)  from public;
revoke execute on function private.is_valid_cpf(text)        from public;
revoke execute on function private.is_valid_cnpj(text)       from public;
revoke execute on function private.is_valid_document(text)   from public;
revoke execute on function private.normalize_client_alias(public.client_alias_type, text) from public;
revoke execute on function private.normalize_receiver_identifier(public.receiver_identifier_type, text, text, text, text) from public;
revoke execute on function private.require_admin()           from public;
revoke execute on function private.assert_version(timestamptz, timestamptz) from public;

-- Usadas em CHECK (escrita por postgres/service_role) e em search_clients (authenticated, SECURITY INVOKER).
grant execute on function private.normalize_document(text)  to authenticated, service_role;
grant execute on function private.is_valid_cpf(text)        to authenticated, service_role;
grant execute on function private.is_valid_cnpj(text)       to authenticated, service_role;
grant execute on function private.is_valid_document(text)   to authenticated, service_role;
-- normalize_client_alias, normalize_receiver_identifier, require_admin e assert_version: sem grant
-- (só as funções SECURITY DEFINER e os triggers, que rodam como dono, as chamam).
