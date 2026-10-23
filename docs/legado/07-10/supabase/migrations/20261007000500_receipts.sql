-- =============================================================================
-- 0500 · Recebimentos e snapshot da distribuição econômica (receipt_allocations)
-- =============================================================================
-- uploaded_by            = quem ENVIOU o comprovante
-- receiving_indicator_id = quem RECEBEU o dinheiro
-- São conceitos distintos e nunca devem ser inferidos um do outro.
-- =============================================================================

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  competency_id uuid not null references public.competencies (id),
  company_id uuid references public.companies (id),
  amount numeric(14, 2) not null,

  payment_date date,

  receiving_indicator_id uuid references public.indicators (id),

  uploaded_by uuid not null references public.profiles (id),

  original_file_name text,
  storage_path text,
  mime_type text,

  extracted_payer_name text,
  extracted_payer_cnpj text,
  extracted_receiver_name text,
  extracted_amount numeric(14, 2),

  receiver_identification_method public.receiver_identification_method not null default 'UNIDENTIFIED',
  company_identification_method public.company_identification_method not null default 'UNIDENTIFIED',

  status public.receipt_status not null default 'RECEIVED',

  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles (id),

  constraint receipts_amount_positive check (amount > 0),

  -- A empresa do recebimento precisa constar no snapshot da competência.
  constraint receipts_competency_company_fkey
    foreign key (competency_id, company_id)
    references public.competency_companies (competency_id, company_id),

  -- Método de identificação coerente com o vínculo preenchido.
  constraint receipts_receiver_identification_consistency
    check ((receiving_indicator_id is null) = (receiver_identification_method = 'UNIDENTIFIED')),
  constraint receipts_company_identification_consistency
    check ((company_id is null) = (company_identification_method = 'UNIDENTIFIED')),

  -- Confirmado exige empresa, recebedor e carimbo de confirmação; não
  -- confirmado não pode ter carimbo.
  constraint receipts_confirmation_consistency check (
    case when status = 'CONFIRMED'
      then company_id is not null
       and receiving_indicator_id is not null
       and confirmed_at is not null
      else confirmed_at is null and confirmed_by is null
    end
  )
);

-- Cobre a FK composta para o snapshot e a consulta da carteira por competência.
create index receipts_competency_company_idx on public.receipts (competency_id, company_id);
create index receipts_company_idx on public.receipts (company_id);
create index receipts_receiving_indicator_idx on public.receipts (receiving_indicator_id);
create index receipts_uploaded_by_idx on public.receipts (uploaded_by);

alter table public.receipts enable row level security;

-- -----------------------------------------------------------------------------
-- receipt_allocations: snapshot imutável da distribuição no momento da
-- confirmação. Alterações futuras no cadastro não alteram recebimentos antigos.
-- -----------------------------------------------------------------------------
create table public.receipt_allocations (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts (id),
  indicator_id uuid not null references public.indicators (id),
  percentage numeric(7, 4) not null,
  amount numeric(14, 2) not null,
  distribution_source public.distribution_source not null,
  created_at timestamptz not null default now(),

  constraint receipt_allocations_receipt_indicator_key unique (receipt_id, indicator_id),
  constraint receipt_allocations_percentage_range check (percentage > 0 and percentage <= 100),
  constraint receipt_allocations_amount_non_negative check (amount >= 0)
);

create index receipt_allocations_indicator_idx on public.receipt_allocations (indicator_id);

alter table public.receipt_allocations enable row level security;

-- -----------------------------------------------------------------------------
-- Imutabilidade
-- -----------------------------------------------------------------------------

-- Alocações nunca mudam depois de gravadas.
create trigger receipt_allocations_immutable
  before update or delete on public.receipt_allocations
  for each row execute function private.prevent_mutation();

-- Alocações só podem ser criadas para recebimento ainda não confirmado
-- (a confirmação grava alocações e confirma na mesma transação).
create function private.receipt_allocations_guard_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.receipts r
     where r.id = new.receipt_id and r.status = 'CONFIRMED'
  ) then
    raise exception 'Recebimento % já confirmado: a distribuição é imutável.', new.receipt_id
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke execute on function private.receipt_allocations_guard_insert() from public;

create trigger receipt_allocations_guard_insert
  before insert on public.receipt_allocations
  for each row execute function private.receipt_allocations_guard_insert();

-- Recebimento confirmado: campos financeiros congelados e remoção proibida.
create function private.receipts_guard_confirmed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'CONFIRMED' then
    if tg_op = 'DELETE' then
      raise exception 'Recebimento % confirmado não pode ser removido.', old.id
        using errcode = 'insufficient_privilege';
    end if;

    if new.status is distinct from old.status
       or new.amount is distinct from old.amount
       or new.competency_id is distinct from old.competency_id
       or new.company_id is distinct from old.company_id
       or new.receiving_indicator_id is distinct from old.receiving_indicator_id
       or new.payment_date is distinct from old.payment_date
       or new.confirmed_at is distinct from old.confirmed_at
       or new.confirmed_by is distinct from old.confirmed_by then
      raise exception 'Recebimento % confirmado: dados financeiros são imutáveis.', old.id
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function private.receipts_guard_confirmed() from public;

create trigger receipts_guard_confirmed
  before update or delete on public.receipts
  for each row execute function private.receipts_guard_confirmed();

-- No COMMIT: todo recebimento confirmado tem alocações que somam exatamente
-- 100% e exatamente o valor recebido; nenhum não confirmado tem alocações.
create function private.assert_receipt_allocations_consistent(p_receipt_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_status public.receipt_status;
  v_amount numeric(14, 2);
  v_count int;
  v_pct_sum numeric;
  v_amount_sum numeric;
begin
  select r.status, r.amount into v_status, v_amount
    from public.receipts r
   where r.id = p_receipt_id;

  if not found then
    return;
  end if;

  select count(*), coalesce(sum(a.percentage), 0), coalesce(sum(a.amount), 0)
    into v_count, v_pct_sum, v_amount_sum
    from public.receipt_allocations a
   where a.receipt_id = p_receipt_id;

  if v_status = 'CONFIRMED' then
    if v_count = 0 then
      raise exception 'Recebimento % confirmado sem distribuição econômica.', p_receipt_id
        using errcode = 'check_violation';
    end if;
    if v_pct_sum <> 100 then
      raise exception 'Distribuição do recebimento % soma % (deve ser 100%%).', p_receipt_id, v_pct_sum || '%'
        using errcode = 'check_violation';
    end if;
    if v_amount_sum <> v_amount then
      raise exception 'Distribuição do recebimento % soma R$ % (valor recebido R$ %).', p_receipt_id, v_amount_sum, v_amount
        using errcode = 'check_violation';
    end if;
  elsif v_count > 0 then
    raise exception 'Recebimento % possui distribuição sem estar confirmado.', p_receipt_id
      using errcode = 'check_violation';
  end if;
end;
$$;

create function private.receipts_assert_allocations()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.assert_receipt_allocations_consistent(new.id);
  return null;
end;
$$;

create function private.receipt_allocations_assert_consistent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.assert_receipt_allocations_consistent(new.receipt_id);
  return null;
end;
$$;

revoke execute on function private.assert_receipt_allocations_consistent(uuid) from public;
grant execute on function private.assert_receipt_allocations_consistent(uuid) to authenticated;
revoke execute on function private.receipts_assert_allocations() from public;
revoke execute on function private.receipt_allocations_assert_consistent() from public;

create constraint trigger receipts_allocations_consistent
  after insert or update of status, amount on public.receipts
  deferrable initially deferred
  for each row execute function private.receipts_assert_allocations();

create constraint trigger receipt_allocations_consistent
  after insert on public.receipt_allocations
  deferrable initially deferred
  for each row execute function private.receipt_allocations_assert_consistent();

-- -----------------------------------------------------------------------------
-- RPC: confirm_receipt
-- A DECISÃO da distribuição é tomada pelo domínio da aplicação
-- (src/domain/distribution). Esta função apenas VERIFICA invariantes e grava
-- o snapshot + confirmação de forma atômica:
--   * recebimento não confirmado, com empresa e recebedor identificados;
--   * competência aberta;
--   * indicadores das alocações = indicadores atuais da empresa;
--   * fonte da distribuição compatível com o modo da empresa;
--   * percentuais conferem com o cadastro (CUSTOM/DEFAULT);
--   * soma dos percentuais = 100 e soma dos valores = valor do recebimento.
-- p_allocations: [{"indicator_id": "...", "percentage": "50.0000", "amount": "500.00"}]
-- SECURITY DEFINER: receipt_allocations não tem política de INSERT, então
-- este é o único caminho para gravar a distribuição.
-- -----------------------------------------------------------------------------
create function public.confirm_receipt(
  p_receipt_id uuid,
  p_distribution_source public.distribution_source,
  p_allocations jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.receipts;
  v_competency_status public.competency_status;
  v_mode public.distribution_mode;
  v_use_custom_defaults boolean;
  v_list constant jsonb := coalesce(p_allocations, '[]'::jsonb);
  v_count int;
  v_distinct int;
  v_pct_sum numeric;
  v_amount_sum numeric;
  v_company_indicator_count int;
  v_matching int;
  v_mismatched_pct int;
  v_pct_min numeric;
  v_pct_max numeric;
begin
  if not private.is_admin() then
    raise exception 'Apenas ADMIN_FINANCEIRO pode confirmar recebimentos.'
      using errcode = 'insufficient_privilege';
  end if;

  if jsonb_typeof(v_list) <> 'array' or jsonb_array_length(v_list) = 0 then
    raise exception 'p_allocations deve ser um array JSON não vazio.' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_receipt from public.receipts r where r.id = p_receipt_id for update;
  if not found then
    raise exception 'Recebimento % não encontrado.', p_receipt_id using errcode = 'no_data_found';
  end if;

  if v_receipt.status = 'CONFIRMED' then
    raise exception 'Recebimento % já está confirmado.', p_receipt_id using errcode = 'invalid_parameter_value';
  end if;
  if v_receipt.company_id is null then
    raise exception 'Recebimento % sem empresa identificada.', p_receipt_id using errcode = 'invalid_parameter_value';
  end if;
  if v_receipt.receiving_indicator_id is null then
    raise exception 'Recebimento % sem recebedor identificado.', p_receipt_id using errcode = 'invalid_parameter_value';
  end if;

  select c.status into v_competency_status
    from public.competencies c where c.id = v_receipt.competency_id;
  if v_competency_status <> 'OPEN' then
    raise exception 'A competência do recebimento % está fechada.', p_receipt_id using errcode = 'invalid_parameter_value';
  end if;

  select c.distribution_mode into v_mode
    from public.companies c where c.id = v_receipt.company_id
    for share;

  select fs.use_custom_default_percentages into v_use_custom_defaults
    from public.finance_settings fs limit 1;

  -- Fonte compatível com o modo da empresa
  if not (
       (v_mode = 'CUSTOM' and p_distribution_source = 'COMPANY_CUSTOM')
    or (v_mode = 'EQUAL' and p_distribution_source = 'EQUAL')
    or (v_mode = 'INHERIT' and p_distribution_source = 'EQUAL')
    or (v_mode = 'INHERIT' and p_distribution_source = 'DEFAULT_PERCENTAGE' and v_use_custom_defaults)
  ) then
    raise exception 'Fonte de distribuição % incompatível com o modo % da empresa.', p_distribution_source, v_mode
      using errcode = 'check_violation';
  end if;

  with requested as (
    select (e ->> 'indicator_id')::uuid as indicator_id,
           private.to_percentage(e ->> 'percentage') as percentage,
           private.to_money(e ->> 'amount') as amount
      from jsonb_array_elements(v_list) e
  )
  select count(*),
         count(distinct r.indicator_id),
         coalesce(sum(r.percentage), 0),
         coalesce(sum(r.amount), 0),
         min(r.percentage),
         max(r.percentage),
         count(ci.id),
         count(*) filter (
           where (p_distribution_source = 'COMPANY_CUSTOM' and r.percentage is distinct from ci.custom_percentage)
              or (p_distribution_source = 'DEFAULT_PERCENTAGE' and r.percentage is distinct from i.default_percentage)
         )
    into v_count, v_distinct, v_pct_sum, v_amount_sum, v_pct_min, v_pct_max, v_matching, v_mismatched_pct
    from requested r
    left join public.company_indicators ci
      on ci.company_id = v_receipt.company_id and ci.indicator_id = r.indicator_id
    left join public.indicators i
      on i.id = r.indicator_id;

  select count(*) into v_company_indicator_count
    from public.company_indicators ci
   where ci.company_id = v_receipt.company_id;

  if v_count <> v_distinct then
    raise exception 'Indicador repetido na distribuição.' using errcode = 'invalid_parameter_value';
  end if;

  if v_matching <> v_count or v_count <> v_company_indicator_count then
    raise exception 'Os indicadores da distribuição não correspondem aos indicadores atuais da empresa. Recalcule a distribuição.'
      using errcode = 'check_violation';
  end if;

  if v_mismatched_pct > 0 then
    raise exception 'Percentuais da distribuição não conferem com o cadastro atual. Recalcule a distribuição.'
      using errcode = 'check_violation';
  end if;

  -- Divisão igualitária: percentuais diferem no máximo pela menor unidade (0,0001).
  if p_distribution_source = 'EQUAL' and v_pct_max - v_pct_min > 0.0001 then
    raise exception 'Distribuição igualitária com percentuais desiguais.' using errcode = 'check_violation';
  end if;

  if v_pct_sum <> 100 then
    raise exception 'A soma dos percentuais é % (deve ser exatamente 100%%).', v_pct_sum || '%'
      using errcode = 'check_violation';
  end if;

  if v_amount_sum <> v_receipt.amount then
    raise exception 'A soma das parcelas (R$ %) difere do valor recebido (R$ %).', v_amount_sum, v_receipt.amount
      using errcode = 'check_violation';
  end if;

  insert into public.receipt_allocations (receipt_id, indicator_id, percentage, amount, distribution_source)
  select p_receipt_id,
         (e ->> 'indicator_id')::uuid,
         private.to_percentage(e ->> 'percentage'),
         private.to_money(e ->> 'amount'),
         p_distribution_source
    from jsonb_array_elements(v_list) e;

  update public.receipts
     set status = 'CONFIRMED',
         confirmed_at = now(),
         confirmed_by = auth.uid()
   where id = p_receipt_id;
end;
$$;

revoke execute on function public.confirm_receipt(uuid, public.distribution_source, jsonb) from public, anon;
grant execute on function public.confirm_receipt(uuid, public.distribution_source, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Auditoria
-- -----------------------------------------------------------------------------
create trigger receipts_audit
  after insert or update or delete on public.receipts
  for each row execute function private.audit_row_change('receipt');

create trigger receipt_allocations_audit
  after insert on public.receipt_allocations
  for each row execute function private.audit_row_change('receipt_allocation');

-- -----------------------------------------------------------------------------
-- RLS
-- ADMIN: leitura total e revisão. SOCIO: leitura dos recebimentos que enviou,
-- que recebeu, de empresas em que é indicador, ou em que tem participação.
-- SOCIO ainda não insere/altera: o envio de comprovantes virá em etapa
-- própria (via RPC dedicada), não por escrita direta na tabela.
-- -----------------------------------------------------------------------------
create policy receipts_select on public.receipts
  for select to authenticated
  using (
    (select private.is_admin())
    or (
      (select private.has_active_profile())
      and (
        uploaded_by = (select auth.uid())
        or receiving_indicator_id = (select private.current_indicator_id())
        or private.is_linked_to_company(company_id)
      )
    )
  );

create policy receipts_insert_admin on public.receipts
  for insert to authenticated
  with check ((select private.is_admin()));

create policy receipts_update_admin on public.receipts
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy receipts_delete_admin on public.receipts
  for delete to authenticated
  using ((select private.is_admin()));

-- Sem políticas de INSERT/UPDATE/DELETE: gravação apenas via confirm_receipt.
create policy receipt_allocations_select on public.receipt_allocations
  for select to authenticated
  using (
    (select private.is_admin())
    or indicator_id = (select private.current_indicator_id())
  );
