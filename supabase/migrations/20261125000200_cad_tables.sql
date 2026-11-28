-- =============================================================================
-- CAD-001 · 0200 · Tabelas de sócios, recebedores e clientes, guardas e RLS
-- Sócios, Recebedores e Clientes · E3a, parte 1
-- Fonte: docs/features/CAD-001-socios-e-clientes/02-modelagem-dados.md
--        (revisão 2), seções 2.4 a 2.10, 4, 5, 7, 8, 9 e 10.1 (ordem 2).
-- =============================================================================
-- Seis tabelas novas. `partners` não ganha coluna alguma (RAT-D025: sócio só com
-- nome e apelidos): só ganha o trigger de guarda `partners_guard`.
-- Sem organization_id (RAT-D010), sem percentual (RAT-D015), sem CPF/CNPJ de
-- sócio nem de titular de recebedor (RAT-D023, RAT-D025).
-- Escrita: nenhuma política e nenhum grant de escrita para authenticated (I-18);
-- a aplicação escreve pelas funções das próximas migrations. As invariantes
-- abaixo valem para qualquer caminho de escrita (RPC, seed, SQL, service_role).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- partner_aliases (2.5): apelidos do sócio. Sempre uma variação de nome, sem tipo.
-- -----------------------------------------------------------------------------
create table public.partner_aliases (
  id               uuid primary key default gen_random_uuid(),
  partner_id       uuid not null references public.partners (id) on delete restrict,
  alias            text not null,
  normalized_value text not null generated always as (private.normalize_alias(alias)) stored,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint partner_aliases_alias_length check (char_length(alias) between 1 and 200),
  constraint partner_aliases_not_blank    check (normalized_value <> '')
);
comment on table public.partner_aliases is
  'Apelidos (variações do nome) do sócio. Desativar, nunca excluir. Sem tipo: um apelido-documento guardaria o CPF/CNPJ do sócio (RAT-D025).';

-- -----------------------------------------------------------------------------
-- receivers (2.6): recebedor, sempre de um sócio, e imutável nessa relação
-- -----------------------------------------------------------------------------
create table public.receivers (
  id                     uuid primary key default gen_random_uuid(),
  partner_id             uuid not null references public.partners (id) on delete restrict,
  holder_name            text not null,
  normalized_holder_name text not null generated always as (private.normalize_alias(holder_name)) stored,
  active                 boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint receivers_holder_name_length    check (char_length(holder_name) between 1 and 200),
  constraint receivers_holder_name_not_blank check (normalized_holder_name <> '')
);
comment on table public.receivers is
  'Recebedor: titular da conta que recebe (RAT-D023). Sempre ligado a um sócio, que nunca muda. Sem CPF/CNPJ do titular e sem observação.';

-- -----------------------------------------------------------------------------
-- receiver_identifiers (2.7): variações do nome, chaves Pix e contas do recebedor
-- -----------------------------------------------------------------------------
create table public.receiver_identifiers (
  id               uuid primary key default gen_random_uuid(),
  receiver_id      uuid not null references public.receivers (id) on delete restrict,
  identifier_type  public.receiver_identifier_type not null,
  value            text,
  bank_name        text,
  branch           text,
  account_number   text,
  normalized_value text not null,   -- calculado pelo trigger receiver_identifiers_prepare
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint receiver_identifiers_shape check (
    (identifier_type in ('NAME_VARIANT', 'PIX_KEY') and value is not null
       and bank_name is null and branch is null and account_number is null)
    or (identifier_type = 'BANK_ACCOUNT' and value is null
       and bank_name is not null and branch is not null and account_number is not null)
  ),
  constraint receiver_identifiers_value_length check (
    value is null
    or (identifier_type = 'NAME_VARIANT' and char_length(value) between 1 and 200)
    or (identifier_type = 'PIX_KEY'      and char_length(value) between 1 and 100)
  ),
  constraint receiver_identifiers_bank_length    check (bank_name is null or char_length(bank_name) between 1 and 100),
  constraint receiver_identifiers_branch_length  check (branch is null or char_length(branch) between 1 and 20),
  constraint receiver_identifiers_account_length check (account_number is null or char_length(account_number) between 1 and 30),
  constraint receiver_identifiers_not_blank      check (normalized_value <> '')
);
comment on table public.receiver_identifiers is
  'Identificadores do recebedor, um por linha e tipados (RAT-D023). Imutáveis, salvo "active". O valor normalizado é calculado pelo trigger.';

-- -----------------------------------------------------------------------------
-- clients (2.8)
-- -----------------------------------------------------------------------------
create table public.clients (
  id                    uuid primary key default gen_random_uuid(),
  legal_name            text not null,
  normalized_name       text not null generated always as (private.normalize_alias(legal_name)) stored,
  trade_name            text,
  normalized_trade_name text generated always as (nullif(private.normalize_alias(trade_name), '')) stored,
  document              text,   -- só a forma canônica; opcional; único entre ativos e inativos (RAT-D024)
  document_type         text generated always as (
                          case when document is null then null
                               when char_length(document) = 11 then 'CPF'
                               else 'CNPJ' end) stored,
  default_monthly_value numeric(14, 2) not null,
  notes                 text,
  active                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint clients_legal_name_length      check (char_length(legal_name) between 1 and 200),
  constraint clients_legal_name_not_blank   check (normalized_name <> ''),
  constraint clients_trade_name_length      check (trade_name is null or char_length(trade_name) between 1 and 200),
  constraint clients_document_canonical     check (document is null or document = private.normalize_document(document)),
  constraint clients_document_valid         check (document is null or private.is_valid_document(document)),
  constraint clients_monthly_value_positive check (default_monthly_value > 0),
  constraint clients_notes_length           check (notes is null or char_length(notes) between 1 and 2000)
);
comment on table public.clients is
  'Cliente. Documento (CPF ou CNPJ, numérico ou alfanumérico) opcional, só canônico e com DV válido. Mensalidade em numeric(14,2), nunca float. Ativo exige ao menos uma indicação ativa (I-01).';

-- -----------------------------------------------------------------------------
-- client_aliases (2.9)
-- -----------------------------------------------------------------------------
create table public.client_aliases (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.clients (id) on delete restrict,
  alias_type       public.client_alias_type not null,
  alias            text not null,
  normalized_value text not null,   -- calculado pelo trigger client_aliases_prepare
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint client_aliases_alias_length check (char_length(alias) between 1 and 200),
  constraint client_aliases_not_blank    check (normalized_value <> '')
);
comment on table public.client_aliases is
  'Apelidos do cliente: NAME (outra forma do nome) e DOCUMENT (CPF/CNPJ de quem paga em nome do cliente). Imutáveis, salvo "active".';

-- -----------------------------------------------------------------------------
-- client_partners (2.10): só a associação. n = indicações ativas; divisão sempre 1/n (RAT-D015)
-- -----------------------------------------------------------------------------
create table public.client_partners (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients (id) on delete restrict,
  partner_id uuid not null references public.partners (id) on delete restrict,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint client_partners_pair_key unique (client_id, partner_id)
);
comment on table public.client_partners is
  'Sócios indicados no cliente (uma linha por par). Sem percentual, peso ou vigência: a divisão é 1/n pelas linhas ativas (RAT-D015).';

-- -----------------------------------------------------------------------------
-- Índices (seção 5). partners_normalized_name_key já existe (FND).
-- -----------------------------------------------------------------------------
create unique index partner_aliases_active_key on public.partner_aliases (normalized_value) where active;
create index partner_aliases_partner_id_idx on public.partner_aliases (partner_id);

create index receivers_partner_id_idx on public.receivers (partner_id, active);

create unique index receiver_identifiers_active_key
  on public.receiver_identifiers (identifier_type, normalized_value) where active;
create index receiver_identifiers_receiver_id_idx on public.receiver_identifiers (receiver_id);

create unique index clients_document_key on public.clients (document) where document is not null;
create index clients_normalized_name_idx on public.clients (normalized_name);
create index clients_normalized_trade_name_idx on public.clients (normalized_trade_name)
  where normalized_trade_name is not null;

create unique index client_aliases_active_key on public.client_aliases (alias_type, normalized_value) where active;
create index client_aliases_client_id_idx on public.client_aliases (client_id);

-- client_partners_pair_key (client_id, partner_id) já cobre o prefixo client_id.
create index client_partners_partner_id_idx on public.client_partners (partner_id);

-- -----------------------------------------------------------------------------
-- Auxiliares de unicidade entre tabelas (4.2): travas consultivas por valor +
-- checagem do dono. SECURITY DEFINER para enxergar todas as linhas, qualquer que
-- seja o papel de quem escreve. O detail com o dono só chega a quem escreve, e a
-- escrita passa por private.require_admin() antes (6.3). Não chamam set_audit_context.
-- -----------------------------------------------------------------------------

-- Espaço de nomes do sócio (I-11): um texto normalizado que seja nome de sócio, apelido ativo
-- de sócio ou variação de nome ativa de recebedor aponta para UM único sócio.
-- p_field só diz à tela de que campo veio o texto (detail); não muda a regra.
create function private.assert_partner_name_free(p_text text, p_partner_id uuid, p_field text default 'name')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner record;
begin
  if p_text is null or p_text = '' then
    return;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('cad.partner_name:' || p_text));

  select p.id, p.name, p.active, 'NAME'::text as via into v_owner
    from public.partners p
   where p.normalized_name = p_text and p.id is distinct from p_partner_id
   limit 1;
  if not found then
    select p.id, p.name, p.active, 'ALIAS'::text as via into v_owner
      from public.partner_aliases pa
      join public.partners p on p.id = pa.partner_id
     where pa.active and pa.normalized_value = p_text and pa.partner_id is distinct from p_partner_id
     limit 1;
  end if;
  if not found then
    select p.id, p.name, p.active, 'NAME_VARIANT'::text as via into v_owner
      from public.receiver_identifiers ri
      join public.receivers r on r.id = ri.receiver_id
      join public.partners p on p.id = r.partner_id
     where ri.active and ri.identifier_type = 'NAME_VARIANT' and ri.normalized_value = p_text
       and r.partner_id is distinct from p_partner_id
     limit 1;
  end if;

  if found then
    raise exception 'O nome já pertence a outro sócio.'
      using errcode = 'unique_violation', hint = 'PARTNER_NAME_TAKEN',
            detail = pg_catalog.jsonb_build_object(
              'field', p_field, 'value', p_text,
              'owner', pg_catalog.jsonb_build_object(
                'kind', 'partner', 'id', v_owner.id, 'name', v_owner.name,
                'active', v_owner.active, 'via', v_owner.via))::text;
  end if;
end;
$$;

-- Documento do cliente (I-07, I-08): não pode ser de outro cliente (ativo ou inativo) nem
-- apelido DOCUMENT ativo de outro cliente.
create function private.assert_client_document_free(p_doc text, p_client_id uuid, p_field text default 'document')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner record;
begin
  if p_doc is null or p_doc = '' then
    return;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('cad.client_document:' || p_doc));

  select c.id, c.legal_name, c.active into v_owner
    from public.clients c
   where c.document = p_doc and c.id is distinct from p_client_id
   limit 1;
  if not found then
    select c.id, c.legal_name, c.active into v_owner
      from public.client_aliases a
      join public.clients c on c.id = a.client_id
     where a.active and a.alias_type = 'DOCUMENT' and a.normalized_value = p_doc
       and a.client_id is distinct from p_client_id
     limit 1;
  end if;

  if found then
    raise exception 'O documento já pertence a outro cliente.'
      using errcode = 'unique_violation', hint = 'DOCUMENT_TAKEN',
            detail = pg_catalog.jsonb_build_object(
              'field', p_field,
              'owner', pg_catalog.jsonb_build_object(
                'kind', 'client', 'id', v_owner.id, 'name', v_owner.legal_name, 'active', v_owner.active))::text;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Guardas (4.2). Todas SECURITY DEFINER, search_path fixo.
-- -----------------------------------------------------------------------------

-- partners: id e created_at imutáveis; espaço de nomes (I-11); inativação só sem indicação
-- ativa (em cliente ativo ou inativo, RAT-D025) e sem recebedor ativo (I-02 b, I-05 b).
create function private.partners_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clients   jsonb;
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
      raise exception 'Identidade do sócio é imutável.'
        using errcode = 'P0001', hint = 'IMMUTABLE_FIELD';
    end if;
  end if;

  if tg_op = 'INSERT' or private.normalize_alias(new.name) is distinct from old.normalized_name then
    perform private.assert_partner_name_free(private.normalize_alias(new.name), new.id, 'name');
  end if;

  if tg_op = 'UPDATE' and old.active and not new.active then
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', c.id, 'name', c.legal_name, 'active', c.active)
                                order by c.active desc, c.normalized_name)
      into v_clients
      from public.client_partners cp
      join public.clients c on c.id = cp.client_id
     where cp.partner_id = new.id and cp.active;
    if v_clients is not null then
      raise exception 'O sócio está indicado em cliente e não pode ser inativado.'
        using errcode = 'P0001', hint = 'PARTNER_HAS_CLIENTS',
              detail = pg_catalog.jsonb_build_object('clients', v_clients)::text;
    end if;

    if exists (select 1 from public.receivers r where r.partner_id = new.id and r.active) then
      raise exception 'O sócio tem recebedor ativo e não pode ser inativado.'
        using errcode = 'P0001', hint = 'PARTNER_HAS_ACTIVE_RECEIVERS';
    end if;
  end if;

  return new;
end;
$$;

-- partner_aliases: I-10 (só "active" muda) e I-11 (ao incluir ativo ou reativar).
create function private.partner_aliases_prepare()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.created_at is distinct from old.created_at
       or new.partner_id is distinct from old.partner_id or new.alias is distinct from old.alias then
      raise exception 'Apelido só muda a situação (ativo ou inativo).'
        using errcode = 'P0001', hint = 'IMMUTABLE_FIELD';
    end if;
  end if;

  if new.active and (tg_op = 'INSERT' or not old.active) then
    perform private.assert_partner_name_free(private.normalize_alias(new.alias), new.partner_id, 'aliases');
  end if;
  return new;
end;
$$;

-- receivers: I-04 (sócio e identidade imutáveis) e I-05 a (recebedor ativo só de sócio ativo).
create function private.receivers_prepare()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner record;
begin
  if tg_op = 'UPDATE' then
    if new.partner_id is distinct from old.partner_id then
      raise exception 'O sócio do recebedor não muda.'
        using errcode = 'P0001', hint = 'RECEIVER_PARTNER_IMMUTABLE';
    end if;
    if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
      raise exception 'Identidade do recebedor é imutável.'
        using errcode = 'P0001', hint = 'IMMUTABLE_FIELD';
    end if;
  end if;

  if new.active and (tg_op = 'INSERT' or not old.active) then
    select p.id, p.name, p.active into v_partner
      from public.partners p where p.id = new.partner_id for share;
    if found and not v_partner.active then
      raise exception 'O sócio está inativo.'
        using errcode = 'P0001', hint = 'PARTNER_INACTIVE',
              detail = pg_catalog.jsonb_build_object('partners', pg_catalog.jsonb_build_array(
                         pg_catalog.jsonb_build_object('id', v_partner.id, 'name', v_partner.name)))::text;
    end if;
  end if;
  return new;
end;
$$;

-- receiver_identifiers: valida e calcula normalized_value (o enviado é ignorado), I-10 e
-- unicidade do valor ativo por tipo (I-12); variação de nome também entra no espaço de nomes do sócio (I-11).
create function private.receiver_identifiers_prepare()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner_id uuid;
  v_owner      record;
begin
  if tg_op = 'INSERT' then
    new.normalized_value := private.normalize_receiver_identifier(
      new.identifier_type, new.value, new.bank_name, new.branch, new.account_number);
  else
    if new.id is distinct from old.id or new.created_at is distinct from old.created_at
       or new.receiver_id is distinct from old.receiver_id
       or new.identifier_type is distinct from old.identifier_type
       or new.value is distinct from old.value
       or new.bank_name is distinct from old.bank_name
       or new.branch is distinct from old.branch
       or new.account_number is distinct from old.account_number
       or new.normalized_value is distinct from old.normalized_value then
      raise exception 'Identificador só muda a situação (ativo ou inativo).'
        using errcode = 'P0001', hint = 'IMMUTABLE_FIELD';
    end if;
  end if;

  if new.active and (tg_op = 'INSERT' or not old.active) then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(
      'cad.receiver_identifier:' || new.identifier_type::text || ':' || new.normalized_value));

    select r.id, r.holder_name, r.partner_id, r.active, p.name as partner_name into v_owner
      from public.receiver_identifiers ri
      join public.receivers r on r.id = ri.receiver_id
      join public.partners p on p.id = r.partner_id
     where ri.active and ri.identifier_type = new.identifier_type
       and ri.normalized_value = new.normalized_value
       and ri.id is distinct from new.id
     limit 1;
    if found then
      raise exception 'O identificador já pertence a outro recebedor.'
        using errcode = 'unique_violation', hint = 'IDENTIFIER_TAKEN',
              detail = pg_catalog.jsonb_build_object(
                'field', 'identifiers', 'identifier_type', new.identifier_type::text,
                'value', new.normalized_value,
                'owner', pg_catalog.jsonb_build_object(
                  'kind', 'receiver', 'id', v_owner.id, 'name', v_owner.holder_name,
                  'partner_id', v_owner.partner_id, 'partner_name', v_owner.partner_name,
                  'active', v_owner.active))::text;
    end if;

    if new.identifier_type = 'NAME_VARIANT' then
      select r.partner_id into v_partner_id from public.receivers r where r.id = new.receiver_id;
      if found then
        perform private.assert_partner_name_free(new.normalized_value, v_partner_id, 'identifiers');
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- clients: id e created_at imutáveis; documento incluído ou trocado (I-07, I-08).
create function private.clients_prepare()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
      raise exception 'Identidade do cliente é imutável.'
        using errcode = 'P0001', hint = 'IMMUTABLE_FIELD';
    end if;
  end if;

  if new.document is not null and (tg_op = 'INSERT' or new.document is distinct from old.document) then
    perform private.assert_client_document_free(new.document, new.id, 'document');
  end if;
  return new;
end;
$$;

-- client_aliases: valida e calcula normalized_value (o enviado é ignorado), I-10, I-09 e I-08.
create function private.client_aliases_prepare()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner record;
begin
  if tg_op = 'INSERT' then
    new.normalized_value := private.normalize_client_alias(new.alias_type, new.alias);
  else
    if new.id is distinct from old.id or new.created_at is distinct from old.created_at
       or new.client_id is distinct from old.client_id
       or new.alias_type is distinct from old.alias_type
       or new.alias is distinct from old.alias
       or new.normalized_value is distinct from old.normalized_value then
      raise exception 'Apelido só muda a situação (ativo ou inativo).'
        using errcode = 'P0001', hint = 'IMMUTABLE_FIELD';
    end if;
  end if;

  if new.active and (tg_op = 'INSERT' or not old.active) then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(
      'cad.client_alias:' || new.alias_type::text || ':' || new.normalized_value));

    select c.id, c.legal_name, c.active into v_owner
      from public.client_aliases a
      join public.clients c on c.id = a.client_id
     where a.active and a.alias_type = new.alias_type and a.normalized_value = new.normalized_value
       and a.id is distinct from new.id
     limit 1;
    if found then
      raise exception 'O apelido já pertence a outro cliente.'
        using errcode = 'unique_violation', hint = 'ALIAS_TAKEN',
              detail = pg_catalog.jsonb_build_object(
                'field', 'aliases', 'value', new.normalized_value,
                'owner', pg_catalog.jsonb_build_object(
                  'kind', 'client', 'id', v_owner.id, 'name', v_owner.legal_name, 'active', v_owner.active))::text;
    end if;

    if new.alias_type = 'DOCUMENT' then
      perform private.assert_client_document_free(new.normalized_value, new.client_id, 'aliases');
    end if;
  end if;
  return new;
end;
$$;

-- client_partners: I-03 (par e identidade imutáveis), trava do cliente (serializa o I-01) e
-- I-02 a (indicação ativa só de sócio ativo). Ordem das travas: sócio, depois cliente (9.2).
create function private.client_partners_prepare()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner record;
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.created_at is distinct from old.created_at
       or new.client_id is distinct from old.client_id or new.partner_id is distinct from old.partner_id then
      raise exception 'A indicação só muda a situação (ativa ou inativa).'
        using errcode = 'P0001', hint = 'IMMUTABLE_FIELD';
    end if;
  end if;

  if new.active and (tg_op = 'INSERT' or not old.active) then
    select p.id, p.name, p.active into v_partner
      from public.partners p where p.id = new.partner_id for share;
    if found and not v_partner.active then
      raise exception 'O sócio está inativo e não pode ser indicado.'
        using errcode = 'P0001', hint = 'PARTNER_INACTIVE',
              detail = pg_catalog.jsonb_build_object('partners', pg_catalog.jsonb_build_array(
                         pg_catalog.jsonb_build_object('id', v_partner.id, 'name', v_partner.name)))::text;
    end if;
  end if;

  perform 1 from public.clients c where c.id = new.client_id for no key update;
  return new;
end;
$$;

-- I-01: cliente ativo tem ao menos uma indicação ativa. Roda diferido (no COMMIT), por isso
-- cliente e indicações podem entrar na mesma transação. Serve aos dois constraint triggers.
create function private.assert_client_has_partner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id uuid;
begin
  -- Os dois constraint triggers usam esta função; a coluna do cliente muda conforme a tabela.
  -- (Um "case" com new.client_id e new.id na mesma expressão falharia: o campo ausente é resolvido na compilação.)
  if tg_table_name = 'clients' then
    v_client_id := new.id;
  else
    v_client_id := new.client_id;
  end if;

  if exists (select 1 from public.clients c where c.id = v_client_id and c.active)
     and not exists (select 1 from public.client_partners cp where cp.client_id = v_client_id and cp.active) then
    raise exception 'Cliente ativo precisa de ao menos um sócio indicado.'
      using errcode = 'check_violation', hint = 'CLIENT_WITHOUT_PARTNER';
  end if;
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Triggers (2.2, 4, 8)
-- Antes: set_updated_at e *_prepare. Depois: auditoria (ROW_CHANGE) e I-01 diferido.
-- Exclusão física e TRUNCATE bloqueados em todas (I-14).
-- -----------------------------------------------------------------------------

-- partners (existente): só ganha a guarda.
create trigger partners_guard before insert or update on public.partners
  for each row execute function private.partners_guard();

create trigger partner_aliases_prepare before insert or update on public.partner_aliases
  for each row execute function private.partner_aliases_prepare();
create trigger partner_aliases_set_updated_at before update on public.partner_aliases
  for each row execute function private.set_updated_at();
create trigger partner_aliases_audit after insert or update or delete on public.partner_aliases
  for each row execute function private.audit_row_change('partner_alias');
create trigger partner_aliases_no_delete before delete on public.partner_aliases
  for each row execute function private.prevent_mutation();
create trigger partner_aliases_no_truncate before truncate on public.partner_aliases
  for each statement execute function private.prevent_truncate();

create trigger receivers_prepare before insert or update on public.receivers
  for each row execute function private.receivers_prepare();
create trigger receivers_set_updated_at before update on public.receivers
  for each row execute function private.set_updated_at();
create trigger receivers_audit after insert or update or delete on public.receivers
  for each row execute function private.audit_row_change('receiver');
create trigger receivers_no_delete before delete on public.receivers
  for each row execute function private.prevent_mutation();
create trigger receivers_no_truncate before truncate on public.receivers
  for each statement execute function private.prevent_truncate();

create trigger receiver_identifiers_prepare before insert or update on public.receiver_identifiers
  for each row execute function private.receiver_identifiers_prepare();
create trigger receiver_identifiers_set_updated_at before update on public.receiver_identifiers
  for each row execute function private.set_updated_at();
create trigger receiver_identifiers_audit after insert or update or delete on public.receiver_identifiers
  for each row execute function private.audit_row_change('receiver_identifier');
create trigger receiver_identifiers_no_delete before delete on public.receiver_identifiers
  for each row execute function private.prevent_mutation();
create trigger receiver_identifiers_no_truncate before truncate on public.receiver_identifiers
  for each statement execute function private.prevent_truncate();

create trigger clients_prepare before insert or update on public.clients
  for each row execute function private.clients_prepare();
create trigger clients_set_updated_at before update on public.clients
  for each row execute function private.set_updated_at();
create trigger clients_audit after insert or update or delete on public.clients
  for each row execute function private.audit_row_change('client');
create trigger clients_no_delete before delete on public.clients
  for each row execute function private.prevent_mutation();
create trigger clients_no_truncate before truncate on public.clients
  for each statement execute function private.prevent_truncate();

create trigger client_aliases_prepare before insert or update on public.client_aliases
  for each row execute function private.client_aliases_prepare();
create trigger client_aliases_set_updated_at before update on public.client_aliases
  for each row execute function private.set_updated_at();
create trigger client_aliases_audit after insert or update or delete on public.client_aliases
  for each row execute function private.audit_row_change('client_alias');
create trigger client_aliases_no_delete before delete on public.client_aliases
  for each row execute function private.prevent_mutation();
create trigger client_aliases_no_truncate before truncate on public.client_aliases
  for each statement execute function private.prevent_truncate();

create trigger client_partners_prepare before insert or update on public.client_partners
  for each row execute function private.client_partners_prepare();
create trigger client_partners_set_updated_at before update on public.client_partners
  for each row execute function private.set_updated_at();
create trigger client_partners_audit after insert or update or delete on public.client_partners
  for each row execute function private.audit_row_change('client_partner');
create trigger client_partners_no_delete before delete on public.client_partners
  for each row execute function private.prevent_mutation();
create trigger client_partners_no_truncate before truncate on public.client_partners
  for each statement execute function private.prevent_truncate();

-- I-01 (diferido): cliente ativo com ao menos uma indicação ativa.
create constraint trigger clients_require_partner
  after insert or update of active on public.clients
  deferrable initially deferred
  for each row when (new.active)
  execute function private.assert_client_has_partner();
create constraint trigger client_partners_keep_partner
  after update of active on public.client_partners
  deferrable initially deferred
  for each row when (old.active and not new.active)
  execute function private.assert_client_has_partner();

-- -----------------------------------------------------------------------------
-- revoke das funções novas (guardas, auxiliares e triggers): só o dono executa
-- -----------------------------------------------------------------------------
revoke execute on function private.assert_partner_name_free(text, uuid, text)   from public;
revoke execute on function private.assert_client_document_free(text, uuid, text) from public;
revoke execute on function private.partners_guard()              from public;
revoke execute on function private.partner_aliases_prepare()     from public;
revoke execute on function private.receivers_prepare()           from public;
revoke execute on function private.receiver_identifiers_prepare() from public;
revoke execute on function private.clients_prepare()             from public;
revoke execute on function private.client_aliases_prepare()      from public;
revoke execute on function private.client_partners_prepare()     from public;
revoke execute on function private.assert_client_has_partner()   from public;

-- -----------------------------------------------------------------------------
-- RLS e concessões (7.1, 7.2): só leitura; nenhuma política de escrita (I-18)
-- -----------------------------------------------------------------------------
alter table public.partner_aliases      enable row level security;
alter table public.receivers            enable row level security;
alter table public.receiver_identifiers enable row level security;
alter table public.clients              enable row level security;
alter table public.client_aliases       enable row level security;
alter table public.client_partners      enable row level security;

create policy partner_aliases_select_admin on public.partner_aliases
  for select to authenticated
  using ((select private.is_admin()));

create policy receivers_select_admin on public.receivers
  for select to authenticated
  using ((select private.is_admin()));

create policy receiver_identifiers_select_admin on public.receiver_identifiers
  for select to authenticated
  using ((select private.is_admin()));

create policy clients_select_business on public.clients
  for select to authenticated
  using ((select private.can_read_business()));

create policy client_partners_select_business on public.client_partners
  for select to authenticated
  using ((select private.can_read_business()));

-- Apelidos inativos do cliente só para o Administrador (UI U-C16).
create policy client_aliases_select_business on public.client_aliases
  for select to authenticated
  using ((select private.is_admin()) or (active and (select private.can_read_business())));

-- Nenhum INSERT/UPDATE/DELETE para authenticated; anon não recebe nada (privilégios padrão da 0500).
-- O papel Sócio (PARTNER), sem papel e inativo não passam em is_admin() nem em can_read_business(): 0 linhas.
grant select on public.partner_aliases, public.receivers, public.receiver_identifiers,
                public.clients, public.client_aliases, public.client_partners to authenticated;
