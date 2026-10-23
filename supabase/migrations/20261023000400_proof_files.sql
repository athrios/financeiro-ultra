-- =============================================================================
-- 0400 · Comprovantes: proof_files, RPCs de envio, bucket privado e políticas de storage
-- FND-001 / E4 · Fonte: 02-modelagem-dados.md, seção 3.5 (plano 8)
-- =============================================================================
-- Fluxo em duas fases (tabela e bucket nunca divergem silenciosamente):
--   1. route handler valida e calcula SHA-256;
--   2. rpc register_proof_file (deduplica por hash; define o caminho no banco);
--   3. storage.upload('proofs', storage_path, { upsert: false });
--   4. rpc complete_proof_file_upload (confere o objeto e marca STORED).
-- O banco garante a coerência ENTRE linha e objeto (caminho, tamanho, tipo declarado),
-- mas NÃO confere o conteúdo (R-D18).
-- =============================================================================

create table public.proof_files (
  id                 uuid primary key default gen_random_uuid(),
  storage_bucket     text not null default 'proofs',
  storage_path       text not null,
  sha256             text not null,
  mime_type          text not null,
  size_bytes         bigint not null,
  original_name      text,
  upload_status      public.proof_upload_status not null default 'PENDING_UPLOAD',
  uploaded_by        uuid not null references public.profiles (id),
  created_at         timestamptz not null default now(),
  stored_at          timestamptz,
  extraction_status  public.proof_extraction_status not null default 'NOT_REQUESTED',  -- P-16 (futuro)
  raw_extraction     jsonb,
  confidence_score   numeric(5, 4),
  extracted_at       timestamptz,
  deleted_at         timestamptz,
  deleted_by         uuid references public.profiles (id),
  deletion_reason    text,
  updated_at         timestamptz not null default now(),

  constraint proof_files_bucket             check (storage_bucket = 'proofs'),
  constraint proof_files_sha256_format      check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint proof_files_sha256_key         unique (sha256),                 -- RN-008 (hash)
  constraint proof_files_storage_path_key   unique (storage_path),
  constraint proof_files_mime               check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  constraint proof_files_path_format        check (storage_path ~ ('^[0-9]{4}/[0-9]{2}/' || id::text || '\.(pdf|jpg|png)$')),
  constraint proof_files_path_matches_mime  check (
       (mime_type = 'application/pdf' and storage_path like '%.pdf')
    or (mime_type = 'image/jpeg'      and storage_path like '%.jpg')
    or (mime_type = 'image/png'       and storage_path like '%.png')),
  constraint proof_files_size               check (size_bytes > 0 and size_bytes <= 4194304),   -- 4 MiB provisório (P-15)
  constraint proof_files_original_name_len  check (original_name is null or char_length(original_name) between 1 and 255),
  constraint proof_files_stored_consistency check ((upload_status = 'STORED') = (stored_at is not null)),
  constraint proof_files_confidence_range   check (confidence_score is null or confidence_score between 0 and 1),
  constraint proof_files_deletion_consistency check (
       (deleted_at is null and deleted_by is null and deletion_reason is null)
    -- RAT-D021: o motivo da exclusão é opcional; o CHECK exige só a coerência entre deleted_at e deleted_by.
    -- Motivo em branco (espaços, tabs, quebras de linha) vira NULL no guard de UPDATE.
    or (deleted_at is not null and deleted_by is not null))
);
comment on column public.proof_files.storage_path is
  'Definido pelo banco: {aaaa}/{mm}/{id}.{ext} (aaaa/mm do created_at em UTC). Nunca contém o nome original.';

create index proof_files_uploaded_by_idx on public.proof_files (uploaded_by, created_at desc);
create index proof_files_pending_idx     on public.proof_files (created_at) where upload_status = 'PENDING_UPLOAD';

create trigger proof_files_set_updated_at before update on public.proof_files
  for each row execute function private.set_updated_at();
create trigger proof_files_audit after insert or update or delete on public.proof_files
  for each row execute function private.audit_row_change('proof_file', 'raw_extraction');
alter table public.proof_files enable row level security;

-- BEFORE INSERT: o banco define os campos controlados. O cliente só informa
-- sha256, mime_type, size_bytes e original_name (concessão por coluna na 0500).
create function private.proof_files_before_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.uploaded_by       := auth.uid();
  if new.uploaded_by is null then
    raise exception 'Envio de comprovante exige usuário autenticado.' using errcode = 'insufficient_privilege';
  end if;
  -- Divergência D-E4-02: tipo inválido falha aqui com mensagem própria; sem isto o CASE abaixo
  -- geraria caminho nulo e o erro apareceria como violação de NOT NULL em storage_path.
  if new.mime_type is null or new.mime_type not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'Tipo de arquivo não permitido para comprovante.' using errcode = 'check_violation';
  end if;
  new.upload_status     := 'PENDING_UPLOAD';
  new.stored_at         := null;
  new.created_at        := now();
  new.extraction_status := 'NOT_REQUESTED';
  new.raw_extraction    := null;  new.confidence_score := null;  new.extracted_at := null;
  new.deleted_at        := null;  new.deleted_by := null;        new.deletion_reason := null;
  new.sha256            := pg_catalog.lower(new.sha256);
  new.storage_path      := pg_catalog.to_char(new.created_at at time zone 'UTC', 'YYYY/MM') || '/' || new.id::text
                           || case new.mime_type when 'application/pdf' then '.pdf'
                                                 when 'image/jpeg'      then '.jpg'
                                                 when 'image/png'       then '.png' end;
  return new;
end;
$$;

-- BEFORE UPDATE: imutáveis + transições válidas.
-- SECURITY DEFINER para conferir storage.objects independentemente do RLS do chamador.
create function private.proof_files_guard_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.id, new.storage_bucket, new.storage_path, new.sha256, new.mime_type, new.size_bytes,
      new.original_name, new.uploaded_by, new.created_at)
     is distinct from
     (old.id, old.storage_bucket, old.storage_path, old.sha256, old.mime_type, old.size_bytes,
      old.original_name, old.uploaded_by, old.created_at) then
    raise exception 'Metadados do comprovante são imutáveis.' using errcode = 'insufficient_privilege';
  end if;

  if new.upload_status is distinct from old.upload_status then
    if not (old.upload_status = 'PENDING_UPLOAD' and new.upload_status = 'STORED') then
      raise exception 'Transição de envio inválida: % → %.', old.upload_status, new.upload_status
        using errcode = 'check_violation';
    end if;
    if not exists (
      select 1 from storage.objects o
       where o.bucket_id = 'proofs' and o.name = new.storage_path
         and (o.metadata ->> 'size')::bigint = new.size_bytes
         and o.metadata ->> 'mimetype' = new.mime_type) then
      raise exception 'Arquivo do comprovante ausente ou diferente do registrado.' using errcode = 'check_violation';
    end if;
    new.stored_at := now();
  end if;

  if old.deleted_at is not null
     and (new.deleted_at, new.deleted_by, new.deletion_reason)
         is distinct from (old.deleted_at, old.deleted_by, old.deletion_reason) then
    raise exception 'Exclusão lógica é definitiva.' using errcode = 'insufficient_privilege';
  end if;
  if old.deleted_at is null and new.deleted_at is not null then
    if not private.is_admin() then
      raise exception 'Somente o Administrador exclui comprovantes.' using errcode = 'insufficient_privilege';
    end if;
    new.deleted_at := now();
    new.deleted_by := auth.uid();
    -- RAT-D021: motivo opcional; em branco vira NULL, informado é gravado sem as bordas em branco.
    new.deletion_reason := nullif(pg_catalog.btrim(new.deletion_reason, E' \t\r\n'), '');
  end if;

  -- Campos de extração: sem escrita pela aplicação na FND (a feature de leitura automática define quem grava).
  if (new.extraction_status, new.raw_extraction, new.confidence_score, new.extracted_at)
     is distinct from (old.extraction_status, old.raw_extraction, old.confidence_score, old.extracted_at)
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Campos de extração não são editáveis pela aplicação.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger proof_files_before_insert before insert on public.proof_files
  for each row execute function private.proof_files_before_insert();
create trigger proof_files_guard_update before update on public.proof_files
  for each row execute function private.proof_files_guard_update();
create trigger proof_files_no_delete before delete on public.proof_files
  for each row execute function private.prevent_mutation();       -- exclusão só lógica
create trigger proof_files_no_truncate before truncate on public.proof_files
  for each statement execute function private.prevent_truncate();  -- SEG-E45-08
revoke execute on function private.proof_files_before_insert() from public;
revoke execute on function private.proof_files_guard_update() from public;

-- Funções das políticas de storage (SECURITY DEFINER: leem proof_files sem depender do RLS).
create function private.proof_upload_allowed(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.proof_files f
                  where f.storage_path = p_name and f.upload_status = 'PENDING_UPLOAD' and f.deleted_at is null
                    and f.uploaded_by = (select auth.uid()));   -- só o dono do registro pendente envia (SEG-E45-03)
$$;
create function private.proof_readable(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.proof_files f where f.storage_path = p_name and f.deleted_at is null);
$$;
revoke execute on function private.proof_upload_allowed(text) from public;
revoke execute on function private.proof_readable(text)       from public;
grant  execute on function private.proof_upload_allowed(text) to authenticated;
grant  execute on function private.proof_readable(text)       to authenticated;

-- -----------------------------------------------------------------------------
-- RPCs (SECURITY INVOKER: RLS e guardas valem; nenhuma RPC pública SECURITY DEFINER na FND).
-- -----------------------------------------------------------------------------

-- Registra o comprovante (ou devolve o já existente pelo hash: CA-10).
create function public.register_proof_file(
  p_sha256 text, p_mime_type text, p_size_bytes bigint, p_original_name text
) returns table (
  proof_file_id uuid, storage_path text, upload_status public.proof_upload_status,
  deleted boolean, is_duplicate boolean
)
language plpgsql set search_path = '' as $$
#variable_conflict use_column
declare
  v_sha text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_sha256, '')));
  v_row public.proof_files;
begin
  if not private.can_operate() then
    raise exception 'Sem permissão para enviar comprovantes.' using errcode = 'insufficient_privilege';
  end if;

  select f.* into v_row from public.proof_files f where f.sha256 = v_sha;
  if found then
    return query select v_row.id, v_row.storage_path, v_row.upload_status, v_row.deleted_at is not null, true;
    return;
  end if;

  begin
    insert into public.proof_files (sha256, mime_type, size_bytes, original_name)
    values (v_sha, p_mime_type, p_size_bytes, p_original_name)
    returning * into v_row;
    return query select v_row.id, v_row.storage_path, v_row.upload_status, false, false;
  exception when unique_violation then
    -- Envio concorrente do mesmo arquivo: relê o registro vencedor.
    select f.* into v_row from public.proof_files f where f.sha256 = v_sha;
    if not found then
      raise;
    end if;
    return query select v_row.id, v_row.storage_path, v_row.upload_status, v_row.deleted_at is not null, true;
  end;
end;
$$;

-- Marca o envio como concluído (idempotente). A guarda confere o objeto no bucket.
create function public.complete_proof_file_upload(p_proof_file_id uuid)
returns public.proof_files
language plpgsql set search_path = '' as $$
declare
  v_row public.proof_files;
begin
  if not private.can_operate() then
    raise exception 'Sem permissão para concluir o envio de comprovantes.' using errcode = 'insufficient_privilege';
  end if;

  select f.* into v_row from public.proof_files f where f.id = p_proof_file_id;
  if not found then
    raise exception 'Comprovante não encontrado.' using errcode = 'no_data_found';
  end if;
  if v_row.upload_status = 'STORED' then
    return v_row;
  end if;

  update public.proof_files set upload_status = 'STORED'
   where id = p_proof_file_id
   returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function public.register_proof_file(text, text, bigint, text) from public;
revoke execute on function public.complete_proof_file_upload(uuid)               from public;

-- -----------------------------------------------------------------------------
-- RLS de proof_files
-- -----------------------------------------------------------------------------
create policy proof_files_select on public.proof_files
  for select to authenticated using ((select private.can_read_business()));       -- M-04
create policy proof_files_insert on public.proof_files
  for insert to authenticated
  with check ((select private.can_operate()) and uploaded_by = (select auth.uid()));
create policy proof_files_update on public.proof_files
  for update to authenticated
  using ((select private.can_operate())) with check ((select private.can_operate()));

-- -----------------------------------------------------------------------------
-- Bucket privado (criado pela migration, não pelo config.toml: uma só fonte)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', false, 4194304, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Políticas em storage.objects (só o bucket proofs).
create policy proofs_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'proofs' and (select private.can_operate()) and private.proof_upload_allowed(name));
create policy proofs_select on storage.objects
  for select to authenticated
  using (bucket_id = 'proofs' and (select private.can_read_business()) and private.proof_readable(name));
-- Sem UPDATE e sem DELETE: sem sobrescrita (upsert: false) e sem exclusão física pela API.
