-- =============================================================================
-- CAD-001 · 0300 · Funções de gravação de sócio e de recebedor
-- Sócios, Recebedores e Clientes · E3a, parte 2
-- Fonte: docs/features/CAD-001-socios-e-clientes/02-modelagem-dados.md
--        (revisão 4), seções 6.1 a 6.6, 7.2, 8, 9 e 10.1 (ordem 3).
-- Limites de itens ativos por lista (RAT-D026, 6.6): private.cad_list_limit guarda os números;
-- private.assert_list_limit levanta LIST_LIMIT_EXCEEDED (22023). A conferência fica dentro do laço
-- de validação de cada save_* (6.6.3), antes de qualquer trava, versão ou escrita.
-- =============================================================================
-- RAT-D026 (27/11/2026): tetos de itens ATIVOS por lista. Única fonte dos números no banco.
-- Espelho: src/domain/cadastros/limits.ts (LIST_LIMITS). O teste src/domain/cadastros/limits-sql.test.ts
-- lê as linhas "when '<CHAVE>' then return <N>;" desta função e compara com o espelho.
create function private.cad_list_limit(p_list text)
returns integer
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
begin
  case p_list
    when 'PARTNER_ALIAS'         then return 2;
    when 'CLIENT_ALIAS_NAME'     then return 2;
    when 'CLIENT_ALIAS_DOCUMENT' then return 2;
    when 'NAME_VARIANT'          then return 30;
    when 'PIX_KEY'               then return 10;
    when 'BANK_ACCOUNT'          then return 10;
    else
      raise exception 'Lista sem teto definido: %', coalesce(p_list, '(nula)')
        using errcode = 'XX000';
  end case;
end;
$$;

-- Levanta LIST_LIMIT_EXCEEDED (6.3) quando p_count passa do teto da lista. Um lugar só para o detail.
create function private.assert_list_limit(p_list text, p_count integer)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_max integer := private.cad_list_limit(p_list);
begin
  if p_count > v_max then
    raise exception 'Lista acima do teto de itens ativos (% > %).', p_list, v_max
      using errcode = 'invalid_parameter_value', hint = 'LIST_LIMIT_EXCEEDED',
            detail = pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
              'field', case when p_list in ('PARTNER_ALIAS', 'CLIENT_ALIAS_NAME', 'CLIENT_ALIAS_DOCUMENT')
                            then 'aliases' else 'identifiers' end,
              'list', p_list,
              'alias_type', case p_list when 'CLIENT_ALIAS_NAME' then 'NAME'
                                        when 'CLIENT_ALIAS_DOCUMENT' then 'DOCUMENT' end,
              'identifier_type', case when p_list in ('NAME_VARIANT', 'PIX_KEY', 'BANK_ACCOUNT') then p_list end,
              'max', v_max))::text;
  end if;
end;
$$;

revoke execute on function private.cad_list_limit(text)             from public;
revoke execute on function private.assert_list_limit(text, integer) from public;
-- Desenho em duas camadas (6.1):
--   private.<nome>  implementação SECURITY DEFINER; primeira instrução: require_admin();
--                   segunda: set_audit_context() (motivo opcional, RAT-D021).
--   public.<nome>   invólucro SECURITY INVOKER de uma linha, mesma assinatura. É o único
--                   ponto que o PostgREST expõe. Nenhuma função SECURITY DEFINER em public.
-- authenticated continua sem INSERT/UPDATE/DELETE nas tabelas (I-18): a escrita só passa
-- por estas funções, e as invariantes (I-01 a I-12) valem nos triggers da migration 0200.
-- Ordem das travas (9.2): sócio -> recebedor -> filhos -> travas consultivas por valor.
-- Erros: SQLSTATE + hint estável (6.3); a mensagem em português vem da aplicação.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- private.save_partner (6.4.1): nome + apelidos como estado final, tudo ou nada
-- -----------------------------------------------------------------------------
create function private.save_partner(
  p_partner_id          uuid,
  p_name                text,
  p_aliases             text[],
  p_expected_updated_at timestamptz,
  p_reason              text default null,
  p_correlation_id      uuid default null
) returns public.partners
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_ws      constant text := E' \t\r\n';
  v_partner public.partners;
  v_name    text := pg_catalog.btrim(p_name, E' \t\r\n');
  v_texts   text[] := '{}'::text[];
  v_norms   text[] := '{}'::text[];
  v_item    text;
  v_norm    text;
  v_alias_id uuid;
  v_changed boolean := false;
  v_n       int;
begin
  perform private.require_admin();
  perform private.set_audit_context(p_reason, 'UI', p_correlation_id);

  -- Validação e normalização das entradas (22023).
  -- Lista nula é recusada: a lista é o ESTADO FINAL, e nula inativaria todos os apelidos por descuido.
  -- A lista vazia ('{}') continua significando "nenhum apelido".
  if p_aliases is null then
    raise exception 'A lista de apelidos não foi informada.'
      using errcode = 'invalid_parameter_value', hint = 'LIST_REQUIRED',
            detail = pg_catalog.jsonb_build_object('field', 'aliases')::text;
  end if;
  if v_name is null or private.normalize_alias(v_name) = '' then
    raise exception 'Nome do sócio vazio.'
      using errcode = 'invalid_parameter_value', hint = 'NAME_REQUIRED',
            detail = pg_catalog.jsonb_build_object('field', 'name')::text;
  end if;
  if pg_catalog.char_length(v_name) > 200 then
    raise exception 'Nome do sócio acima de 200 caracteres.'
      using errcode = 'invalid_parameter_value', hint = 'NAME_TOO_LONG',
            detail = pg_catalog.jsonb_build_object('field', 'name')::text;
  end if;

  -- Apelidos: itens repetidos (mesmo valor normalizado) viram um só.
  foreach v_item in array p_aliases loop
    v_item := pg_catalog.btrim(v_item, c_ws);
    v_norm := private.normalize_alias(v_item);
    if v_item is null or v_norm = '' then
      raise exception 'Apelido vazio.'
        using errcode = 'invalid_parameter_value', hint = 'NAME_REQUIRED',
              detail = pg_catalog.jsonb_build_object('field', 'aliases')::text;
    end if;
    if pg_catalog.char_length(v_item) > 200 then
      raise exception 'Apelido acima de 200 caracteres.'
        using errcode = 'invalid_parameter_value', hint = 'NAME_TOO_LONG',
              detail = pg_catalog.jsonb_build_object('field', 'aliases')::text;
    end if;
    if not (v_norm = any (v_norms)) then
      v_texts := v_texts || v_item;
      v_norms := v_norms || v_norm;
      -- Teto de apelidos ativos (RAT-D026, 6.6.3): conta só os distintos e para no primeiro acima.
      perform private.assert_list_limit('PARTNER_ALIAS', pg_catalog.cardinality(v_norms));
    end if;
  end loop;

  -- Trava do sócio e versão.
  if p_partner_id is null then
    insert into public.partners (name) values (v_name) returning * into v_partner;
  else
    select * into v_partner from public.partners p where p.id = p_partner_id for no key update;
    if not found then
      raise exception 'Sócio não encontrado.' using errcode = 'P0002', hint = 'NOT_FOUND';
    end if;
    perform private.assert_version(v_partner.updated_at, p_expected_updated_at);
    if v_name is distinct from v_partner.name then
      update public.partners set name = v_name where id = v_partner.id;
      v_changed := true;
    end if;
  end if;

  -- Apelidos: inativa os ativos fora da lista; mantém, reativa (a linha inativa mais recente do
  -- mesmo sócio e do mesmo valor) ou inclui os da lista. Sem mudança, nenhuma escrita.
  update public.partner_aliases a set active = false
   where a.partner_id = v_partner.id and a.active and not (a.normalized_value = any (v_norms));
  get diagnostics v_n = row_count;
  if v_n > 0 then v_changed := true; end if;

  for i in 1 .. pg_catalog.cardinality(v_norms) loop
    if exists (select 1 from public.partner_aliases a
                where a.partner_id = v_partner.id and a.active and a.normalized_value = v_norms[i]) then
      continue;
    end if;
    select a.id into v_alias_id
      from public.partner_aliases a
     where a.partner_id = v_partner.id and not a.active and a.normalized_value = v_norms[i]
     order by a.created_at desc, a.id
     limit 1;
    if found then
      update public.partner_aliases set active = true where id = v_alias_id;
    else
      insert into public.partner_aliases (partner_id, alias) values (v_partner.id, v_texts[i]);
    end if;
    v_changed := true;
  end loop;

  -- A versão do sócio vale também para os apelidos (6.2): se só eles mudaram, toca o updated_at.
  if v_changed and p_partner_id is not null then
    update public.partners set updated_at = pg_catalog.now() where id = v_partner.id;
  end if;

  select * into v_partner from public.partners p where p.id = v_partner.id;
  return v_partner;
end;
$$;

-- -----------------------------------------------------------------------------
-- private.set_partner_active (6.4.2): inativar (com a cascata dos recebedores) e reativar
-- -----------------------------------------------------------------------------
create function private.set_partner_active(
  p_partner_id             uuid,
  p_active                 boolean,
  p_expected_updated_at    timestamptz,
  p_confirmed_receiver_ids uuid[] default null,
  p_reason                 text default null,
  p_correlation_id         uuid default null
) returns public.partners
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner   public.partners;
  v_clients   jsonb;
  v_receivers jsonb;
  v_current   uuid[];
  v_confirmed uuid[];
begin
  perform private.require_admin();
  perform private.set_audit_context(p_reason, 'UI', p_correlation_id);

  if p_active is null then
    raise exception 'Situação desejada não informada.'
      using errcode = 'invalid_parameter_value', hint = 'ACTIVE_REQUIRED';
  end if;

  select * into v_partner from public.partners p where p.id = p_partner_id for no key update;
  if not found then
    raise exception 'Sócio não encontrado.' using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  -- Idempotência: já está na situação pedida; devolve sem escrever e sem checar a versão.
  if v_partner.active = p_active then
    return v_partner;
  end if;

  perform private.assert_version(v_partner.updated_at, p_expected_updated_at);

  if p_active then
    -- Reativar não reativa recebedores nem indicações (R-S05, 6.5).
    update public.partners set active = true where id = v_partner.id;
  else
    -- RAT-D025: sócio indicado em qualquer cliente, ativo ou inativo, não é inativado.
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', c.id, 'name', c.legal_name, 'active', c.active)
                                order by c.active desc, c.normalized_name, c.id)
      into v_clients
      from public.client_partners cp
      join public.clients c on c.id = cp.client_id
     where cp.partner_id = v_partner.id and cp.active;
    if v_clients is not null then
      raise exception 'O sócio está indicado em cliente e não pode ser inativado.'
        using errcode = 'P0001', hint = 'PARTNER_HAS_CLIENTS',
              detail = pg_catalog.jsonb_build_object('clients', v_clients)::text;
    end if;

    -- RAT-D025: os recebedores ativos são inativados junto, só se a lista confirmada for a atual.
    select coalesce(pg_catalog.array_agg(r.id order by r.id), '{}'::uuid[]),
           coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', r.id, 'name', r.holder_name)
                                         order by r.normalized_holder_name, r.id), '[]'::jsonb)
      into v_current, v_receivers
      from public.receivers r
     where r.partner_id = v_partner.id and r.active;

    v_confirmed := coalesce(
      array(select distinct x from pg_catalog.unnest(p_confirmed_receiver_ids) x where x is not null),
      '{}'::uuid[]);
    if not (v_current <@ v_confirmed and v_confirmed <@ v_current) then
      raise exception 'A lista de recebedores mudou desde a confirmação.'
        using errcode = 'P0001', hint = 'RECEIVERS_CHANGED',
              detail = pg_catalog.jsonb_build_object('receivers', v_receivers)::text;
    end if;

    -- Recebedores primeiro, sócio depois, na mesma transação (I-05 b, I-06).
    update public.receivers r set active = false where r.partner_id = v_partner.id and r.active;
    update public.partners set active = false where id = v_partner.id;
    perform private.audit_event('partner', v_partner.id, 'INACTIVATE',
      pg_catalog.jsonb_build_object('receiver_ids', pg_catalog.to_jsonb(v_current)));
  end if;

  select * into v_partner from public.partners p where p.id = v_partner.id;
  return v_partner;
end;
$$;

-- -----------------------------------------------------------------------------
-- private.save_receiver (6.4.3): titular + identificadores como estado final, tudo ou nada
-- p_identifiers: [{"type":"NAME_VARIANT"|"PIX_KEY","value":"…"},
--                 {"type":"BANK_ACCOUNT","bank_name":"…","branch":"…","account_number":"…"}]
-- -----------------------------------------------------------------------------
create function private.save_receiver(
  p_receiver_id         uuid,
  p_partner_id          uuid,
  p_holder_name         text,
  p_identifiers         jsonb,
  p_expected_updated_at timestamptz,
  p_reason              text default null,
  p_correlation_id      uuid default null
) returns public.receivers
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_ws         constant text := E' \t\r\n';
  v_receiver   public.receivers;
  v_partner    public.partners;
  v_partner_id uuid;
  v_holder     text := pg_catalog.btrim(p_holder_name, E' \t\r\n');
  v_items      jsonb;
  v_item       jsonb;
  v_key        text;
  v_allowed    text[];
  v_type       public.receiver_identifier_type;
  v_val        text;
  v_bank       text;
  v_branch     text;
  v_acc        text;
  v_norm       text;
  v_msg        text;
  v_hint       text;
  v_ident_id   uuid;
  v_types      public.receiver_identifier_type[] := '{}'::public.receiver_identifier_type[];
  v_vals       text[] := '{}'::text[];
  v_banks      text[] := '{}'::text[];
  v_branches   text[] := '{}'::text[];
  v_accs       text[] := '{}'::text[];
  v_norms      text[] := '{}'::text[];
  v_keys       text[] := '{}'::text[];
  v_n_name_variant int := 0;
  v_n_pix_key      int := 0;
  v_n_bank_account int := 0;
  v_n_type         int;
  v_changed    boolean := false;
  v_n          int;
begin
  perform private.require_admin();
  perform private.set_audit_context(p_reason, 'UI', p_correlation_id);

  -- Lista nula (SQL ou JSON null) é recusada: a lista é o ESTADO FINAL, e nula inativaria todos os
  -- identificadores por descuido. A lista vazia ('[]') continua significando "nenhum identificador".
  if p_identifiers is null or p_identifiers = 'null'::jsonb then
    raise exception 'A lista de identificadores não foi informada.'
      using errcode = 'invalid_parameter_value', hint = 'LIST_REQUIRED',
            detail = pg_catalog.jsonb_build_object('field', 'identifiers')::text;
  end if;

  -- Titular (RAT-D023): obrigatório, até 200 caracteres.
  if v_holder is null or private.normalize_alias(v_holder) = '' then
    raise exception 'Nome do titular vazio.'
      using errcode = 'invalid_parameter_value', hint = 'NAME_REQUIRED',
            detail = pg_catalog.jsonb_build_object('field', 'holder_name')::text;
  end if;
  if pg_catalog.char_length(v_holder) > 200 then
    raise exception 'Nome do titular acima de 200 caracteres.'
      using errcode = 'invalid_parameter_value', hint = 'NAME_TOO_LONG',
            detail = pg_catalog.jsonb_build_object('field', 'holder_name')::text;
  end if;

  -- Identificadores: item desconhecido ou fora do formato -> 22023.
  v_items := p_identifiers;
  if pg_catalog.jsonb_typeof(v_items) <> 'array' then
    raise exception 'A lista de identificadores deve ser um array.'
      using errcode = 'invalid_parameter_value', hint = 'INVALID_IDENTIFIER',
            detail = pg_catalog.jsonb_build_object('field', 'identifiers')::text;
  end if;

  for v_item in
    select e.value from pg_catalog.jsonb_array_elements(v_items) with ordinality as e(value, ord) order by e.ord
  loop
    if pg_catalog.jsonb_typeof(v_item) <> 'object'
       or pg_catalog.jsonb_typeof(v_item -> 'type') is distinct from 'string'
       or (v_item ->> 'type') not in ('NAME_VARIANT', 'PIX_KEY', 'BANK_ACCOUNT') then
      raise exception 'Identificador desconhecido ou fora do formato.'
        using errcode = 'invalid_parameter_value', hint = 'INVALID_IDENTIFIER',
              detail = pg_catalog.jsonb_build_object('field', 'identifiers')::text;
    end if;
    v_type := (v_item ->> 'type')::public.receiver_identifier_type;
    v_allowed := case when v_type = 'BANK_ACCOUNT'
                      then array['bank_name', 'branch', 'account_number'] else array['value'] end;

    -- Só as chaves do tipo, e só texto ou nulo (um número JSON perderia os zeros à esquerda).
    for v_key in select k from pg_catalog.jsonb_object_keys(v_item) k loop
      if v_key <> 'type'
         and (not (v_key = any (v_allowed))
              or pg_catalog.jsonb_typeof(v_item -> v_key) not in ('string', 'null')) then
        raise exception 'Identificador desconhecido ou fora do formato.'
          using errcode = 'invalid_parameter_value', hint = 'INVALID_IDENTIFIER',
                detail = pg_catalog.jsonb_build_object('field', 'identifiers')::text;
      end if;
    end loop;

    v_val    := nullif(pg_catalog.btrim(v_item ->> 'value', c_ws), '');
    v_bank   := nullif(pg_catalog.btrim(v_item ->> 'bank_name', c_ws), '');
    v_branch := nullif(pg_catalog.btrim(v_item ->> 'branch', c_ws), '');
    v_acc    := nullif(pg_catalog.btrim(v_item ->> 'account_number', c_ws), '');

    -- Normalização única (3.3); o erro ganha o detail com o valor para a tela.
    begin
      v_norm := private.normalize_receiver_identifier(v_type, v_val, v_bank, v_branch, v_acc);
    exception when sqlstate '22023' then
      get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint;
      raise exception '%', v_msg
        using errcode = 'invalid_parameter_value', hint = v_hint,
              detail = pg_catalog.jsonb_build_object('field', 'identifiers',
                'value', coalesce(v_val, pg_catalog.concat_ws(' / ', v_bank, v_branch, v_acc)))::text;
    end;

    if not ((v_type::text || ':' || v_norm) = any (v_keys)) then
      v_types    := v_types || v_type;
      v_vals     := v_vals || v_val;
      v_banks    := v_banks || v_bank;
      v_branches := v_branches || v_branch;
      v_accs     := v_accs || v_acc;
      v_norms    := v_norms || v_norm;
      v_keys     := v_keys || (v_type::text || ':' || v_norm);
      -- Teto de itens ativos por tipo (RAT-D026, 6.6.3): conta só os distintos e para no primeiro acima.
      if v_type = 'NAME_VARIANT' then
        v_n_name_variant := v_n_name_variant + 1;
        v_n_type := v_n_name_variant;
      elsif v_type = 'PIX_KEY' then
        v_n_pix_key := v_n_pix_key + 1;
        v_n_type := v_n_pix_key;
      else
        v_n_bank_account := v_n_bank_account + 1;
        v_n_type := v_n_bank_account;
      end if;
      perform private.assert_list_limit(v_type::text, v_n_type);
    end if;
  end loop;

  -- Travas: sócio (share) -> recebedor (no key update) (9.2).
  if p_receiver_id is null then
    if p_partner_id is null then
      raise exception 'Sócio do recebedor não informado.'
        using errcode = 'P0002', hint = 'NOT_FOUND',
              detail = pg_catalog.jsonb_build_object('field', 'partner_id')::text;
    end if;
    select * into v_partner from public.partners p where p.id = p_partner_id for share;
    if not found then
      raise exception 'Sócio não encontrado.'
        using errcode = 'P0002', hint = 'NOT_FOUND',
              detail = pg_catalog.jsonb_build_object('field', 'partner_id')::text;
    end if;
    if not v_partner.active then
      raise exception 'O sócio está inativo.'
        using errcode = 'P0001', hint = 'PARTNER_INACTIVE',
              detail = pg_catalog.jsonb_build_object('partners', pg_catalog.jsonb_build_array(
                         pg_catalog.jsonb_build_object('id', v_partner.id, 'name', v_partner.name)))::text;
    end if;
    insert into public.receivers (partner_id, holder_name)
    values (v_partner.id, v_holder) returning * into v_receiver;
  else
    -- O sócio do recebedor não muda (I-04): lê sem trava, trava o sócio e só então o recebedor.
    select r.partner_id into v_partner_id from public.receivers r where r.id = p_receiver_id;
    if not found then
      raise exception 'Recebedor não encontrado.' using errcode = 'P0002', hint = 'NOT_FOUND';
    end if;
    perform 1 from public.partners p where p.id = v_partner_id for share;
    select * into v_receiver from public.receivers r where r.id = p_receiver_id for no key update;
    if p_partner_id is not null and p_partner_id is distinct from v_receiver.partner_id then
      raise exception 'O sócio do recebedor não muda.'
        using errcode = 'P0001', hint = 'RECEIVER_PARTNER_IMMUTABLE';
    end if;
    perform private.assert_version(v_receiver.updated_at, p_expected_updated_at);
    if v_holder is distinct from v_receiver.holder_name then
      update public.receivers set holder_name = v_holder where id = v_receiver.id;
      v_changed := true;
    end if;
  end if;

  -- Identificadores: inativa os ausentes; mantém, reativa (a linha inativa mais recente do mesmo
  -- recebedor, tipo e valor) ou inclui os da lista. Sem mudança, nenhuma escrita.
  update public.receiver_identifiers ri set active = false
   where ri.receiver_id = v_receiver.id and ri.active
     and not ((ri.identifier_type::text || ':' || ri.normalized_value) = any (v_keys));
  get diagnostics v_n = row_count;
  if v_n > 0 then v_changed := true; end if;

  for i in 1 .. pg_catalog.cardinality(v_norms) loop
    if exists (select 1 from public.receiver_identifiers ri
                where ri.receiver_id = v_receiver.id and ri.active
                  and ri.identifier_type = v_types[i] and ri.normalized_value = v_norms[i]) then
      continue;
    end if;
    select ri.id into v_ident_id
      from public.receiver_identifiers ri
     where ri.receiver_id = v_receiver.id and not ri.active
       and ri.identifier_type = v_types[i] and ri.normalized_value = v_norms[i]
     order by ri.created_at desc, ri.id
     limit 1;
    if found then
      update public.receiver_identifiers set active = true where id = v_ident_id;
    else
      insert into public.receiver_identifiers
        (receiver_id, identifier_type, value, bank_name, branch, account_number, normalized_value)
      values (v_receiver.id, v_types[i], v_vals[i], v_banks[i], v_branches[i], v_accs[i], v_norms[i]);
    end if;
    v_changed := true;
  end loop;

  -- A versão do recebedor vale também para os identificadores (6.2).
  if v_changed and p_receiver_id is not null then
    update public.receivers set updated_at = pg_catalog.now() where id = v_receiver.id;
  end if;

  select * into v_receiver from public.receivers r where r.id = v_receiver.id;
  return v_receiver;
end;
$$;

-- -----------------------------------------------------------------------------
-- private.set_receiver_active (6.4.4): reativar exige sócio ativo (trava o sócio antes)
-- -----------------------------------------------------------------------------
create function private.set_receiver_active(
  p_receiver_id         uuid,
  p_active              boolean,
  p_expected_updated_at timestamptz,
  p_reason              text default null,
  p_correlation_id      uuid default null
) returns public.receivers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receiver   public.receivers;
  v_partner    public.partners;
  v_partner_id uuid;
begin
  perform private.require_admin();
  perform private.set_audit_context(p_reason, 'UI', p_correlation_id);

  if p_active is null then
    raise exception 'Situação desejada não informada.'
      using errcode = 'invalid_parameter_value', hint = 'ACTIVE_REQUIRED';
  end if;

  -- O sócio do recebedor não muda (I-04): lê sem trava e, ao reativar, trava o sócio antes (9.2).
  select r.partner_id into v_partner_id from public.receivers r where r.id = p_receiver_id;
  if not found then
    raise exception 'Recebedor não encontrado.' using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  if p_active then
    select * into v_partner from public.partners p where p.id = v_partner_id for share;
  end if;
  select * into v_receiver from public.receivers r where r.id = p_receiver_id for no key update;

  -- Idempotência: já está na situação pedida; devolve sem escrever e sem checar a versão.
  if v_receiver.active = p_active then
    return v_receiver;
  end if;

  perform private.assert_version(v_receiver.updated_at, p_expected_updated_at);

  if p_active and not v_partner.active then
    raise exception 'O sócio está inativo.'
      using errcode = 'P0001', hint = 'PARTNER_INACTIVE',
            detail = pg_catalog.jsonb_build_object('partners', pg_catalog.jsonb_build_array(
                       pg_catalog.jsonb_build_object('id', v_partner.id, 'name', v_partner.name)))::text;
  end if;

  -- Os identificadores continuam como estão (6.5).
  update public.receivers set active = p_active where id = v_receiver.id;

  select * into v_receiver from public.receivers r where r.id = v_receiver.id;
  return v_receiver;
end;
$$;

-- -----------------------------------------------------------------------------
-- Invólucros públicos (6.1): SECURITY INVOKER, uma linha, mesma assinatura.
-- O papel é checado dentro da função de private; o RLS de quem chama não esconde nada
-- porque a escrita é toda feita pela implementação (dona postgres).
-- -----------------------------------------------------------------------------
create function public.save_partner(
  p_partner_id          uuid,
  p_name                text,
  p_aliases             text[],
  p_expected_updated_at timestamptz,
  p_reason              text default null,
  p_correlation_id      uuid default null
) returns public.partners
language sql
security invoker
set search_path = ''
as $$
  select * from private.save_partner(p_partner_id, p_name, p_aliases, p_expected_updated_at, p_reason, p_correlation_id);
$$;

create function public.set_partner_active(
  p_partner_id             uuid,
  p_active                 boolean,
  p_expected_updated_at    timestamptz,
  p_confirmed_receiver_ids uuid[] default null,
  p_reason                 text default null,
  p_correlation_id         uuid default null
) returns public.partners
language sql
security invoker
set search_path = ''
as $$
  select * from private.set_partner_active(p_partner_id, p_active, p_expected_updated_at,
                                           p_confirmed_receiver_ids, p_reason, p_correlation_id);
$$;

create function public.save_receiver(
  p_receiver_id         uuid,
  p_partner_id          uuid,
  p_holder_name         text,
  p_identifiers         jsonb,
  p_expected_updated_at timestamptz,
  p_reason              text default null,
  p_correlation_id      uuid default null
) returns public.receivers
language sql
security invoker
set search_path = ''
as $$
  select * from private.save_receiver(p_receiver_id, p_partner_id, p_holder_name, p_identifiers,
                                      p_expected_updated_at, p_reason, p_correlation_id);
$$;

create function public.set_receiver_active(
  p_receiver_id         uuid,
  p_active              boolean,
  p_expected_updated_at timestamptz,
  p_reason              text default null,
  p_correlation_id      uuid default null
) returns public.receivers
language sql
security invoker
set search_path = ''
as $$
  select * from private.set_receiver_active(p_receiver_id, p_active, p_expected_updated_at, p_reason, p_correlation_id);
$$;

-- -----------------------------------------------------------------------------
-- Concessões explícitas (7.2): só authenticated; anon e PUBLIC nada.
-- -----------------------------------------------------------------------------
revoke execute on function private.save_partner(uuid, text, text[], timestamptz, text, uuid) from public;
revoke execute on function private.set_partner_active(uuid, boolean, timestamptz, uuid[], text, uuid) from public;
revoke execute on function private.save_receiver(uuid, uuid, text, jsonb, timestamptz, text, uuid) from public;
revoke execute on function private.set_receiver_active(uuid, boolean, timestamptz, text, uuid) from public;
grant execute on function private.save_partner(uuid, text, text[], timestamptz, text, uuid) to authenticated;
grant execute on function private.set_partner_active(uuid, boolean, timestamptz, uuid[], text, uuid) to authenticated;
grant execute on function private.save_receiver(uuid, uuid, text, jsonb, timestamptz, text, uuid) to authenticated;
grant execute on function private.set_receiver_active(uuid, boolean, timestamptz, text, uuid) to authenticated;

revoke execute on function public.save_partner(uuid, text, text[], timestamptz, text, uuid) from public, anon;
revoke execute on function public.set_partner_active(uuid, boolean, timestamptz, uuid[], text, uuid) from public, anon;
revoke execute on function public.save_receiver(uuid, uuid, text, jsonb, timestamptz, text, uuid) from public, anon;
revoke execute on function public.set_receiver_active(uuid, boolean, timestamptz, text, uuid) from public, anon;
grant execute on function public.save_partner(uuid, text, text[], timestamptz, text, uuid) to authenticated;
grant execute on function public.set_partner_active(uuid, boolean, timestamptz, uuid[], text, uuid) to authenticated;
grant execute on function public.save_receiver(uuid, uuid, text, jsonb, timestamptz, text, uuid) to authenticated;
grant execute on function public.set_receiver_active(uuid, boolean, timestamptz, text, uuid) to authenticated;
