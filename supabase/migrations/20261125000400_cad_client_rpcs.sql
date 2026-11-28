-- =============================================================================
-- CAD-001 · 0400 · Funções de cliente e de busca
-- Sócios, Recebedores e Clientes · E3b
-- Fonte: docs/features/CAD-001-socios-e-clientes/02-modelagem-dados.md
--        (revisão 4), seções 6.0, 6.1 a 6.6, 7.2, 8, 9, 10.1 (ordem 4) e 11.4 a 11.6.
-- Limites de itens ativos (RAT-D026, 6.6): save_client confere 2 apelidos NAME e 2 DOCUMENT com
-- private.assert_list_limit (definida na 0300), dentro do laço de validação (6.6.3).
-- =============================================================================
-- Mesmo desenho da migration 0300:
--   private.save_client / private.set_client_active   SECURITY DEFINER; primeira instrução
--                   require_admin(); segunda set_audit_context() (motivo opcional, RAT-D021).
--   public.<nome>   invólucro SECURITY INVOKER de uma linha, mesma assinatura.
--   public.search_clients / public.search_aliases   leituras SECURITY INVOKER e STABLE: o RLS
--                   de quem chama vale (6.4.7). Não há implementação em private.
-- authenticated continua sem INSERT/UPDATE/DELETE nas tabelas (I-18).
-- Ordem das travas (9.2): sócios da lista (share, por id) -> cliente (no key update) ->
-- indicações -> apelidos -> travas consultivas por valor.
-- Listas de estado final (p_partner_ids, p_aliases) nulas são RECUSADAS (LIST_REQUIRED, 22023);
-- a lista vazia significa "nenhum item". p_acknowledged_duplicate_ids é uma confirmação (não
-- um estado final): nulo vale vazio e nunca apaga nada.
-- Erros: SQLSTATE + hint estável (6.3); a mensagem em português vem da aplicação.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- private.save_client (6.4.5): dados, sócios indicados e apelidos como estado final, tudo ou nada
-- p_aliases: [{"type":"NAME"|"DOCUMENT","value":"…"}]
-- -----------------------------------------------------------------------------
create function private.save_client(
  p_client_id                  uuid,
  p_legal_name                 text,
  p_trade_name                 text,
  p_document                   text,
  p_default_monthly_value      text,
  p_notes                      text,
  p_partner_ids                uuid[],
  p_aliases                    jsonb,
  p_expected_updated_at        timestamptz,
  p_acknowledged_duplicate_ids uuid[] default null,
  p_reason                     text default null,
  p_correlation_id             uuid default null
) returns public.clients
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_ws         constant text := E' \t\r\n';
  v_client     public.clients;
  v_legal      text := pg_catalog.btrim(p_legal_name, E' \t\r\n');
  v_trade      text := nullif(pg_catalog.btrim(p_trade_name, E' \t\r\n'), '');
  v_notes      text := nullif(pg_catalog.btrim(p_notes, E' \t\r\n'), '');
  v_document   text := private.normalize_document(p_document);
  v_amount     numeric(14, 2);
  v_partner_ids uuid[];
  v_prev_ids   uuid[] := '{}'::uuid[];
  v_inactive   jsonb;
  v_found      int;
  v_items      jsonb;
  v_item       jsonb;
  v_key        text;
  v_type       public.client_alias_type;
  v_val        text;
  v_norm       text;
  v_msg        text;
  v_hint       text;
  v_alias_id   uuid;
  v_pid        uuid;
  v_atypes     public.client_alias_type[] := '{}'::public.client_alias_type[];
  v_atexts     text[] := '{}'::text[];
  v_anorms     text[] := '{}'::text[];
  v_akeys      text[] := '{}'::text[];
  v_n_alias_name     int := 0;
  v_n_alias_document int := 0;
  v_n_type           int;
  v_names     text[];
  v_alias_names text[];
  v_cur_names  text[];
  v_new_names  text[];
  v_match_ids  uuid[];
  v_matches    jsonb;
  v_ack        uuid[];
  v_dup_check  boolean;
  v_is_new     boolean := (p_client_id is null);
  v_children   boolean := false;
  v_n          int;
begin
  perform private.require_admin();
  perform private.set_audit_context(p_reason, 'UI', p_correlation_id);

  -- ---- 1. Validação e normalização das entradas (22023) -------------------------------------
  -- Listas de estado final nulas são recusadas: nulas inativariam todos os itens por descuido.
  if p_partner_ids is null then
    raise exception 'A lista de sócios não foi informada.'
      using errcode = 'invalid_parameter_value', hint = 'LIST_REQUIRED',
            detail = pg_catalog.jsonb_build_object('field', 'partner_ids')::text;
  end if;
  if p_aliases is null or p_aliases = 'null'::jsonb then
    raise exception 'A lista de apelidos não foi informada.'
      using errcode = 'invalid_parameter_value', hint = 'LIST_REQUIRED',
            detail = pg_catalog.jsonb_build_object('field', 'aliases')::text;
  end if;

  if v_legal is null or private.normalize_alias(v_legal) = '' then
    raise exception 'Nome do cliente vazio.'
      using errcode = 'invalid_parameter_value', hint = 'NAME_REQUIRED',
            detail = pg_catalog.jsonb_build_object('field', 'legal_name')::text;
  end if;
  if pg_catalog.char_length(v_legal) > 200 then
    raise exception 'Nome do cliente acima de 200 caracteres.'
      using errcode = 'invalid_parameter_value', hint = 'NAME_TOO_LONG',
            detail = pg_catalog.jsonb_build_object('field', 'legal_name')::text;
  end if;
  if v_trade is not null and private.normalize_alias(v_trade) = '' then
    raise exception 'Nome fantasia sem letras ou números.'
      using errcode = 'invalid_parameter_value', hint = 'NAME_REQUIRED',
            detail = pg_catalog.jsonb_build_object('field', 'trade_name')::text;
  end if;
  if pg_catalog.char_length(v_trade) > 200 then
    raise exception 'Nome fantasia acima de 200 caracteres.'
      using errcode = 'invalid_parameter_value', hint = 'NAME_TOO_LONG',
            detail = pg_catalog.jsonb_build_object('field', 'trade_name')::text;
  end if;
  if pg_catalog.char_length(v_notes) > 2000 then
    raise exception 'Observações acima de 2000 caracteres.'
      using errcode = 'invalid_parameter_value', hint = 'NOTES_TOO_LONG';
  end if;

  -- Documento opcional: forma canônica e DV válido (CPF, CNPJ numérico ou alfanumérico).
  if v_document is not null and not private.is_valid_document(v_document) then
    raise exception 'Documento inválido.'
      using errcode = 'invalid_parameter_value', hint = 'INVALID_DOCUMENT',
            detail = pg_catalog.jsonb_build_object('field', 'document')::text;
  end if;

  -- Mensalidade: texto decimal com ponto, convertido sem arredondar; > 0; teto do numeric(14,2).
  begin
    v_amount := private.to_money(p_default_monthly_value);
  exception when invalid_parameter_value or numeric_value_out_of_range then
    raise exception 'Mensalidade inválida.'
      using errcode = 'invalid_parameter_value', hint = 'INVALID_AMOUNT',
            detail = pg_catalog.jsonb_build_object('field', 'default_monthly_value')::text;
  end;
  if v_amount <= 0 then
    raise exception 'A mensalidade deve ser maior que zero.'
      using errcode = 'invalid_parameter_value', hint = 'INVALID_AMOUNT',
            detail = pg_catalog.jsonb_build_object('field', 'default_monthly_value')::text;
  end if;

  -- Sócios: sem repetição, em ordem de id (a ordem das travas, 9.2).
  if exists (select 1 from pg_catalog.unnest(p_partner_ids) x where x is null) then
    raise exception 'Sócio não encontrado.'
      using errcode = 'P0002', hint = 'NOT_FOUND',
            detail = pg_catalog.jsonb_build_object('field', 'partner_ids')::text;
  end if;
  v_partner_ids := array(select distinct x from pg_catalog.unnest(p_partner_ids) x order by x);

  -- Apelidos: array de {"type","value"}; item desconhecido ou fora do formato -> 22023.
  v_items := p_aliases;
  if pg_catalog.jsonb_typeof(v_items) <> 'array' then
    raise exception 'A lista de apelidos deve ser um array.'
      using errcode = 'invalid_parameter_value', hint = 'INVALID_IDENTIFIER',
            detail = pg_catalog.jsonb_build_object('field', 'aliases')::text;
  end if;

  for v_item in
    select e.value from pg_catalog.jsonb_array_elements(v_items) with ordinality as e(value, ord) order by e.ord
  loop
    if pg_catalog.jsonb_typeof(v_item) <> 'object'
       or pg_catalog.jsonb_typeof(v_item -> 'type') is distinct from 'string'
       or (v_item ->> 'type') not in ('NAME', 'DOCUMENT') then
      raise exception 'Apelido desconhecido ou fora do formato.'
        using errcode = 'invalid_parameter_value', hint = 'INVALID_IDENTIFIER',
              detail = pg_catalog.jsonb_build_object('field', 'aliases')::text;
    end if;
    v_type := (v_item ->> 'type')::public.client_alias_type;

    -- Só "type" e "value", e "value" só texto ou nulo.
    for v_key in select k from pg_catalog.jsonb_object_keys(v_item) k loop
      if v_key <> 'type'
         and (v_key <> 'value'
              or pg_catalog.jsonb_typeof(v_item -> v_key) not in ('string', 'null')) then
        raise exception 'Apelido desconhecido ou fora do formato.'
          using errcode = 'invalid_parameter_value', hint = 'INVALID_IDENTIFIER',
                detail = pg_catalog.jsonb_build_object('field', 'aliases')::text;
      end if;
    end loop;

    v_val := nullif(pg_catalog.btrim(v_item ->> 'value', c_ws), '');

    -- Normalização única (3.2, 3.3); o erro ganha o detail com o valor para a tela.
    begin
      v_norm := private.normalize_client_alias(v_type, v_val);
    exception when sqlstate '22023' then
      get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint;
      raise exception '%', v_msg
        using errcode = 'invalid_parameter_value', hint = v_hint,
              detail = pg_catalog.jsonb_build_object('field', 'aliases', 'value', v_val)::text;
    end;

    if not ((v_type::text || ':' || v_norm) = any (v_akeys)) then
      v_atypes := v_atypes || v_type;
      v_atexts := v_atexts || v_val;
      v_anorms := v_anorms || v_norm;
      v_akeys  := v_akeys  || (v_type::text || ':' || v_norm);
      -- Teto de apelidos ativos por tipo (RAT-D026, 6.6.3): conta só os distintos e para no primeiro acima.
      if v_type = 'NAME' then
        v_n_alias_name := v_n_alias_name + 1;
        v_n_type := v_n_alias_name;
      else
        v_n_alias_document := v_n_alias_document + 1;
        v_n_type := v_n_alias_document;
      end if;
      perform private.assert_list_limit('CLIENT_ALIAS_' || v_type::text, v_n_type);
    end if;
  end loop;

  -- ---- 2. Existência do cliente (leitura sem trava; os ids não são excluídos, I-14) -------------
  if not v_is_new then
    perform 1 from public.clients c where c.id = p_client_id;
    if not found then
      raise exception 'Cliente não encontrado.' using errcode = 'P0002', hint = 'NOT_FOUND';
    end if;
  end if;

  -- ---- 3. Travas: sócios da lista (share, por id) -> cliente (no key update) ------------------
  if pg_catalog.cardinality(v_partner_ids) > 0 then
    perform 1 from public.partners p where p.id = any (v_partner_ids) order by p.id for share;
    select pg_catalog.count(*),
           coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', p.id, 'name', p.name)
                                         order by p.name, p.id) filter (where not p.active), '[]'::jsonb)
      into v_found, v_inactive
      from public.partners p where p.id = any (v_partner_ids);
    if v_found <> pg_catalog.cardinality(v_partner_ids) then
      raise exception 'Sócio não encontrado.'
        using errcode = 'P0002', hint = 'NOT_FOUND',
              detail = pg_catalog.jsonb_build_object('field', 'partner_ids')::text;
    end if;
    if pg_catalog.jsonb_array_length(v_inactive) > 0 then
      raise exception 'Há sócio inativo na lista.'
        using errcode = 'P0001', hint = 'PARTNER_INACTIVE',
              detail = pg_catalog.jsonb_build_object('partners', v_inactive)::text;
    end if;
  end if;

  if not v_is_new then
    select * into v_client from public.clients c where c.id = p_client_id for no key update;
    perform private.assert_version(v_client.updated_at, p_expected_updated_at);
  end if;

  -- ---- 4. Cliente ativo (sempre, no novo) exige ao menos um sócio; inativo pode ficar sem -------
  if (v_is_new or v_client.active) and pg_catalog.cardinality(v_partner_ids) = 0 then
    raise exception 'Cliente ativo precisa de ao menos um sócio indicado.'
      using errcode = 'P0001', hint = 'CLIENT_WITHOUT_PARTNER';
  end if;

  -- ---- 5. Documento novo ou trocado: dono do documento (o trigger repete sob trava) -------------
  if v_document is not null and (v_is_new or v_document is distinct from v_client.document) then
    perform private.assert_client_document_free(v_document, p_client_id, 'document');
  end if;

  -- ---- 6. Aviso de nome repetido (R-C15, 11.4): só no novo ou quando nome, fantasia ou apelidos NAME mudaram.
  --         Também avisa quando um apelido NAME deste cliente é igual ao nome (ou nome fantasia) de OUTRO
  --         cliente (RAT-D024, 26/11/2026): é o inverso do ramo SAME_ALIAS e usa o mesmo rótulo.
  if v_is_new then
    v_dup_check := true;
  else
    v_cur_names := array(select a.normalized_value from public.client_aliases a
                          where a.client_id = v_client.id and a.active and a.alias_type = 'NAME'
                          order by a.normalized_value);
    v_new_names := array(select v_anorms[i] from pg_catalog.generate_subscripts(v_anorms, 1) i
                          where v_atypes[i] = 'NAME' order by v_anorms[i]);
    v_dup_check := private.normalize_alias(v_legal) is distinct from v_client.normalized_name
                or nullif(private.normalize_alias(v_trade), '') is distinct from v_client.normalized_trade_name
                or v_cur_names is distinct from v_new_names;
  end if;

  v_match_ids := '{}'::uuid[];
  if v_dup_check then
    v_names := array(select x from (values (private.normalize_alias(v_legal)),
                                           (nullif(private.normalize_alias(v_trade), ''))) t(x)
                      where x is not null and x <> '');
    v_alias_names := array(select v_anorms[i] from pg_catalog.generate_subscripts(v_anorms, 1) i
                            where v_atypes[i] = 'NAME');
    select coalesce(pg_catalog.array_agg(c.id order by c.normalized_name, c.id), '{}'::uuid[]),
           coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
             'id', c.id, 'name', c.legal_name, 'document', c.document, 'document_type', c.document_type,
             'active', c.active,
             'match', case when c.normalized_name = any (v_names) or c.normalized_trade_name = any (v_names)
                           then 'SAME_NAME' else 'SAME_ALIAS' end)
             order by c.normalized_name, c.id), '[]'::jsonb)
      into v_match_ids, v_matches
      from public.clients c
     where c.id is distinct from p_client_id
       and (c.normalized_name = any (v_names)
            or c.normalized_trade_name = any (v_names)
            or c.normalized_name = any (v_alias_names)
            or c.normalized_trade_name = any (v_alias_names)
            or exists (select 1 from public.client_aliases a
                        where a.client_id = c.id and a.active and a.alias_type = 'NAME'
                          and a.normalized_value = any (v_names)));

    -- A confirmação vale só para a lista exibida: um parecido novo volta a avisar.
    v_ack := array(select distinct x from pg_catalog.unnest(p_acknowledged_duplicate_ids) x where x is not null);
    if not (v_match_ids <@ v_ack) then
      raise exception 'Há cliente com nome parecido.'
        using errcode = 'P0001', hint = 'POSSIBLE_DUPLICATE',
              detail = pg_catalog.jsonb_build_object('matches', v_matches)::text;
    end if;
  end if;

  -- ---- 7. Escreve o cliente --------------------------------------------------------------------
  if v_is_new then
    insert into public.clients (legal_name, trade_name, document, default_monthly_value, notes)
    values (v_legal, v_trade, v_document, v_amount, v_notes)
    returning * into v_client;
  else
    -- O campo "active" não é mudado por esta função.
    if v_legal is distinct from v_client.legal_name
       or v_trade is distinct from v_client.trade_name
       or v_document is distinct from v_client.document
       or v_amount is distinct from v_client.default_monthly_value
       or v_notes is distinct from v_client.notes then
      update public.clients
         set legal_name = v_legal, trade_name = v_trade, document = v_document,
             default_monthly_value = v_amount, notes = v_notes
       where id = v_client.id;
    end if;
    v_prev_ids := coalesce(
      array(select cp.partner_id from public.client_partners cp
             where cp.client_id = v_client.id and cp.active order by cp.partner_id), '{}'::uuid[]);
  end if;

  -- ---- 8. Indicações: inativa as ausentes; mantém, reativa a mesma linha ou inclui -------------
  update public.client_partners cp set active = false
   where cp.client_id = v_client.id and cp.active and not (cp.partner_id = any (v_partner_ids));

  foreach v_pid in array v_partner_ids loop
    if exists (select 1 from public.client_partners cp
                where cp.client_id = v_client.id and cp.partner_id = v_pid and cp.active) then
      continue;
    end if;
    update public.client_partners cp set active = true
     where cp.client_id = v_client.id and cp.partner_id = v_pid and not cp.active;
    if not found then
      insert into public.client_partners (client_id, partner_id) values (v_client.id, v_pid);
    end if;
  end loop;

  if v_prev_ids is distinct from v_partner_ids then
    v_children := true;
    perform private.audit_event('client', v_client.id, 'PARTNERS_CHANGE',
      pg_catalog.jsonb_build_object(
        'previous_partner_ids', pg_catalog.to_jsonb(v_prev_ids),
        'new_partner_ids',      pg_catalog.to_jsonb(v_partner_ids),
        'previous_count',       pg_catalog.cardinality(v_prev_ids),
        'new_count',            pg_catalog.cardinality(v_partner_ids)));
  end if;

  -- ---- 9. Apelidos: inativa os ausentes; mantém, reativa (linha inativa mais recente) ou inclui
  update public.client_aliases a set active = false
   where a.client_id = v_client.id and a.active
     and not ((a.alias_type::text || ':' || a.normalized_value) = any (v_akeys));
  get diagnostics v_n = row_count;
  if v_n > 0 then v_children := true; end if;

  for i in 1 .. pg_catalog.cardinality(v_anorms) loop
    if exists (select 1 from public.client_aliases a
                where a.client_id = v_client.id and a.active
                  and a.alias_type = v_atypes[i] and a.normalized_value = v_anorms[i]) then
      continue;
    end if;
    select a.id into v_alias_id
      from public.client_aliases a
     where a.client_id = v_client.id and not a.active
       and a.alias_type = v_atypes[i] and a.normalized_value = v_anorms[i]
     order by a.created_at desc, a.id
     limit 1;
    if found then
      update public.client_aliases set active = true where id = v_alias_id;
    else
      insert into public.client_aliases (client_id, alias_type, alias, normalized_value)
      values (v_client.id, v_atypes[i], v_atexts[i], v_anorms[i]);
    end if;
    v_children := true;
  end loop;

  -- A versão do cliente vale também para indicações e apelidos (6.2): toca o updated_at.
  if v_children and not v_is_new then
    update public.clients set updated_at = pg_catalog.now() where id = v_client.id;
  end if;

  -- Aviso confirmado (só os parecidos que existiam na hora): fica na auditoria.
  if pg_catalog.cardinality(v_match_ids) > 0 then
    perform private.audit_event('client', v_client.id, 'DUPLICATE_WARNING_ACK',
      pg_catalog.jsonb_build_object('matches', pg_catalog.to_jsonb(v_match_ids)));
  end if;

  select * into v_client from public.clients c where c.id = v_client.id;
  return v_client;
end;
$$;

-- -----------------------------------------------------------------------------
-- private.set_client_active (6.4.6): inativar e reativar o cadastro
-- -----------------------------------------------------------------------------
create function private.set_client_active(
  p_client_id           uuid,
  p_active              boolean,
  p_expected_updated_at timestamptz,
  p_reason              text default null,
  p_correlation_id      uuid default null
) returns public.clients
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client public.clients;
begin
  perform private.require_admin();
  perform private.set_audit_context(p_reason, 'UI', p_correlation_id);

  if p_active is null then
    raise exception 'Situação desejada não informada.'
      using errcode = 'invalid_parameter_value', hint = 'ACTIVE_REQUIRED';
  end if;

  select * into v_client from public.clients c where c.id = p_client_id for no key update;
  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  -- Idempotência: já está na situação pedida; devolve sem escrever e sem checar a versão.
  if v_client.active = p_active then
    return v_client;
  end if;

  perform private.assert_version(v_client.updated_at, p_expected_updated_at);

  -- Reativar exige ao menos uma indicação ativa (e toda indicação ativa é de sócio ativo, I-02).
  -- O trigger diferido de I-01 repete a checagem no COMMIT. Inativar não tem condição: as
  -- indicações continuam ativas e continuam impedindo a inativação desses sócios (RAT-D025).
  if p_active and not exists (select 1 from public.client_partners cp
                               where cp.client_id = v_client.id and cp.active) then
    raise exception 'Cliente ativo precisa de ao menos um sócio indicado.'
      using errcode = 'P0001', hint = 'CLIENT_WITHOUT_PARTNER';
  end if;

  update public.clients set active = p_active where id = v_client.id;

  select * into v_client from public.clients c where c.id = v_client.id;
  return v_client;
end;
$$;

-- -----------------------------------------------------------------------------
-- Invólucros públicos de escrita (6.1): SECURITY INVOKER, uma linha, mesma assinatura.
-- -----------------------------------------------------------------------------
create function public.save_client(
  p_client_id                  uuid,
  p_legal_name                 text,
  p_trade_name                 text,
  p_document                   text,
  p_default_monthly_value      text,
  p_notes                      text,
  p_partner_ids                uuid[],
  p_aliases                    jsonb,
  p_expected_updated_at        timestamptz,
  p_acknowledged_duplicate_ids uuid[] default null,
  p_reason                     text default null,
  p_correlation_id             uuid default null
) returns public.clients
language sql
security invoker
set search_path = ''
as $$
  select * from private.save_client(p_client_id, p_legal_name, p_trade_name, p_document,
                                    p_default_monthly_value, p_notes, p_partner_ids, p_aliases,
                                    p_expected_updated_at, p_acknowledged_duplicate_ids,
                                    p_reason, p_correlation_id);
$$;

create function public.set_client_active(
  p_client_id           uuid,
  p_active              boolean,
  p_expected_updated_at timestamptz,
  p_reason              text default null,
  p_correlation_id      uuid default null
) returns public.clients
language sql
security invoker
set search_path = ''
as $$
  select * from private.set_client_active(p_client_id, p_active, p_expected_updated_at, p_reason, p_correlation_id);
$$;

-- -----------------------------------------------------------------------------
-- public.search_clients (6.4.7, 11.5): leitura SECURITY INVOKER; o RLS de quem chama vale.
-- Administrador, Operador e Visualizador leem; Sócio, sem papel e inativo recebem 0 linhas;
-- anon não tem EXECUTE. A mensalidade sai em texto (nunca número JSON, 2.8).
-- p_partner_id (E6a, P-E4-02): só os clientes com indicação ATIVA daquele sócio, no filtro de
-- situação pedido (ativos, inativos ou todos). Combina com o texto; sócio desconhecido -> 0 linhas.
-- -----------------------------------------------------------------------------
create function public.search_clients(
  p_query      text default null,
  p_status     text default 'ACTIVE',
  p_limit      int  default 25,
  p_offset     int  default 0,
  p_partner_id uuid default null
) returns table (
  id uuid, legal_name text, trade_name text, document text, document_type text,
  default_monthly_value text, active boolean, partner_count int, updated_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_status text := coalesce(p_status, 'ACTIVE');
  v_limit  int  := coalesce(p_limit, 25);
  v_offset int  := coalesce(p_offset, 0);
  v_name   text := private.normalize_alias(p_query);
  v_doc    text := private.normalize_document(p_query);
  v_like   text;
  v_dlike  text;
begin
  if v_status not in ('ACTIVE', 'INACTIVE', 'ALL') then
    raise exception 'Situação do filtro inválida.'
      using errcode = 'invalid_parameter_value', hint = 'INVALID_FILTER',
            detail = pg_catalog.jsonb_build_object('field', 'status')::text;
  end if;
  if v_limit < 1 or v_limit > 100 then
    raise exception 'O limite deve ficar entre 1 e 100.'
      using errcode = 'invalid_parameter_value', hint = 'INVALID_FILTER',
            detail = pg_catalog.jsonb_build_object('field', 'limit')::text;
  end if;
  if v_offset < 0 then
    raise exception 'O deslocamento não pode ser negativo.'
      using errcode = 'invalid_parameter_value', hint = 'INVALID_FILTER',
            detail = pg_catalog.jsonb_build_object('field', 'offset')::text;
  end if;

  -- normalize_alias já tira "%" e "_" (curingas de LIKE); o documento só entra se for [0-9A-Z]{1,14}.
  if v_doc is not null and v_doc !~ '^[0-9A-Z]{1,14}$' then
    v_doc := null;
  end if;
  v_like  := case when v_name <> '' then '%' || v_name || '%' end;
  v_dlike := case when v_doc is not null then v_doc || '%' end;

  return query
    select c.id, c.legal_name, c.trade_name, c.document, c.document_type,
           c.default_monthly_value::text, c.active,
           (select pg_catalog.count(*)::int from public.client_partners cp
             where cp.client_id = c.id and cp.active),
           c.updated_at,
           pg_catalog.count(*) over ()
      from public.clients c
     where (v_status = 'ALL' or (v_status = 'ACTIVE') = c.active)
       and (p_partner_id is null
            or exists (select 1 from public.client_partners cp
                        where cp.client_id = c.id and cp.partner_id = p_partner_id and cp.active))
       and (   (v_like is null and v_dlike is null)
            or c.normalized_name like v_like
            or c.normalized_trade_name like v_like
            or c.document like v_dlike
            or exists (select 1 from public.client_aliases a
                        where a.client_id = c.id and a.active
                          and ((a.alias_type = 'NAME'     and a.normalized_value like v_like)
                            or (a.alias_type = 'DOCUMENT' and a.normalized_value like v_dlike))))
     order by c.normalized_name, c.id
     limit v_limit offset v_offset;
end;
$$;

-- -----------------------------------------------------------------------------
-- public.search_aliases (6.4.7, 11.6): lista consolidada de apelidos, variações, chaves Pix e contas.
-- Só o Administrador recebe linhas: o RLS de partner_aliases, receivers e receiver_identifiers já é
-- de administrador; a parte de clientes também é cortada aqui para a tela não mostrar resultado parcial.
-- Casamento (a modelagem só fixa a assinatura): apelidos e variações de nome pelo valor normalizado
-- ("contém"); apelido-documento por prefixo do documento canônico; chave Pix e conta pelo valor
-- normalizado ("contém"): o texto em minúsculas contra o valor guardado, ou o texto só alfanumérico
-- contra o valor guardado também só alfanumérico (QA-CAD-01: `sementeaexamplecom` acha
-- `semente.a@example.com`; a pontuação da chave de e-mail fica no valor guardado). Só itens ativos casam
-- quando p_status = 'ACTIVE' (padrão); p_status filtra a situação do ITEM.
-- -----------------------------------------------------------------------------
create function public.search_aliases(
  p_query  text default null,
  p_kind   text default null,
  p_status text default 'ACTIVE',
  p_limit  int  default 50,
  p_offset int  default 0
) returns table (
  kind text, item_id uuid, display_value text, active boolean,
  owner_kind text, owner_id uuid, owner_name text, owner_active boolean,
  partner_id uuid, partner_name text, total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_status text := coalesce(p_status, 'ACTIVE');
  v_limit  int  := coalesce(p_limit, 50);
  v_offset int  := coalesce(p_offset, 0);
  v_name   text := private.normalize_alias(p_query);
  v_doc    text := private.normalize_document(p_query);
  v_raw    text := pg_catalog.lower(pg_catalog.btrim(p_query, E' \t\r\n'));
  v_like   text;   -- nomes
  v_dlike  text;   -- documento (prefixo)
  v_xlike  text;   -- texto bruto em minúsculas, para Pix e conta
  v_alike  text;   -- só alfanumérico em minúsculas, para Pix e conta
begin
  if v_status not in ('ACTIVE', 'INACTIVE', 'ALL') then
    raise exception 'Situação do filtro inválida.'
      using errcode = 'invalid_parameter_value', hint = 'INVALID_FILTER',
            detail = pg_catalog.jsonb_build_object('field', 'status')::text;
  end if;
  if p_kind is not null and p_kind not in ('PARTNER_ALIAS', 'CLIENT_ALIAS', 'NAME_VARIANT', 'PIX_KEY', 'BANK_ACCOUNT') then
    raise exception 'Tipo do filtro inválido.'
      using errcode = 'invalid_parameter_value', hint = 'INVALID_FILTER',
            detail = pg_catalog.jsonb_build_object('field', 'kind')::text;
  end if;
  if v_limit < 1 or v_limit > 100 then
    raise exception 'O limite deve ficar entre 1 e 100.'
      using errcode = 'invalid_parameter_value', hint = 'INVALID_FILTER',
            detail = pg_catalog.jsonb_build_object('field', 'limit')::text;
  end if;
  if v_offset < 0 then
    raise exception 'O deslocamento não pode ser negativo.'
      using errcode = 'invalid_parameter_value', hint = 'INVALID_FILTER',
            detail = pg_catalog.jsonb_build_object('field', 'offset')::text;
  end if;

  if not private.is_admin() then
    return;
  end if;

  if v_doc is not null and v_doc !~ '^[0-9A-Z]{1,14}$' then
    v_doc := null;
  end if;
  v_like  := case when v_name <> '' then '%' || v_name || '%' end;
  v_dlike := case when v_doc is not null then v_doc || '%' end;
  -- Curingas de LIKE escapados no texto bruto.
  v_xlike := case when v_raw is not null and v_raw <> ''
                  then '%' || pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(v_raw, '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
  v_alike := case when pg_catalog.regexp_replace(v_raw, '[^0-9a-z]', '', 'g') <> ''
                  then '%' || pg_catalog.regexp_replace(v_raw, '[^0-9a-z]', '', 'g') || '%' end;

  return query
    with items as (
      select 'PARTNER_ALIAS'::text as kind, pa.id as item_id, pa.alias as display_value, pa.active as active,
             pa.normalized_value as nv, 'N'::text as match_by,
             'PARTNER'::text as owner_kind, p.id as owner_id, p.name as owner_name, p.active as owner_active,
             p.id as partner_id, p.name as partner_name
        from public.partner_aliases pa
        join public.partners p on p.id = pa.partner_id
       where p_kind is null or p_kind = 'PARTNER_ALIAS'
      union all
      select 'CLIENT_ALIAS', a.id, a.alias, a.active,
             a.normalized_value, case when a.alias_type = 'DOCUMENT' then 'D' else 'N' end,
             'CLIENT', c.id, c.legal_name, c.active,
             null::uuid, null::text
        from public.client_aliases a
        join public.clients c on c.id = a.client_id
       where p_kind is null or p_kind = 'CLIENT_ALIAS'
      union all
      select ri.identifier_type::text,
             ri.id,
             case when ri.identifier_type = 'BANK_ACCOUNT'
                  then ri.bank_name || ' / ' || ri.branch || ' / ' || ri.account_number
                  else ri.value end,
             ri.active,
             ri.normalized_value, case when ri.identifier_type = 'NAME_VARIANT' then 'N' else 'X' end,
             'RECEIVER', r.id, r.holder_name, r.active,
             p.id, p.name
        from public.receiver_identifiers ri
        join public.receivers r on r.id = ri.receiver_id
        join public.partners p on p.id = r.partner_id
       where p_kind is null or p_kind = ri.identifier_type::text
    )
    select i.kind, i.item_id, i.display_value, i.active,
           i.owner_kind, i.owner_id, i.owner_name, i.owner_active,
           i.partner_id, i.partner_name,
           pg_catalog.count(*) over ()
      from items i
     where (v_status = 'ALL' or (v_status = 'ACTIVE') = i.active)
       and (   (v_like is null and v_dlike is null and v_xlike is null)
            or (i.match_by = 'N' and i.nv like v_like)
            or (i.match_by = 'D' and i.nv like v_dlike)
            or (i.match_by = 'X' and (i.nv like v_xlike escape '\'
                                      or pg_catalog.regexp_replace(i.nv, '[^0-9a-z]', '', 'g') like v_alike escape '\')))
     order by pg_catalog.lower(i.display_value), i.kind, i.item_id
     limit v_limit offset v_offset;
end;
$$;

-- -----------------------------------------------------------------------------
-- Concessões explícitas (7.2): só authenticated; anon e PUBLIC nada.
-- -----------------------------------------------------------------------------
revoke execute on function private.save_client(uuid, text, text, text, text, text, uuid[], jsonb, timestamptz, uuid[], text, uuid) from public;
revoke execute on function private.set_client_active(uuid, boolean, timestamptz, text, uuid) from public;
grant execute on function private.save_client(uuid, text, text, text, text, text, uuid[], jsonb, timestamptz, uuid[], text, uuid) to authenticated;
grant execute on function private.set_client_active(uuid, boolean, timestamptz, text, uuid) to authenticated;

revoke execute on function public.save_client(uuid, text, text, text, text, text, uuid[], jsonb, timestamptz, uuid[], text, uuid) from public, anon;
revoke execute on function public.set_client_active(uuid, boolean, timestamptz, text, uuid) from public, anon;
revoke execute on function public.search_clients(text, text, int, int, uuid) from public, anon;
revoke execute on function public.search_aliases(text, text, text, int, int) from public, anon;
grant execute on function public.save_client(uuid, text, text, text, text, text, uuid[], jsonb, timestamptz, uuid[], text, uuid) to authenticated;
grant execute on function public.set_client_active(uuid, boolean, timestamptz, text, uuid) to authenticated;
grant execute on function public.search_clients(text, text, int, int, uuid) to authenticated;
grant execute on function public.search_aliases(text, text, text, int, int) to authenticated;
