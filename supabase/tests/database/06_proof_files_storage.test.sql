-- =============================================================================
-- pgTAP · Comprovantes (proof_files) e Storage (bucket privado proofs)
-- Rastreio: CA-06, CA-10 · I-12, I-13, I-14, I-15, I-16, R-D08.
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(54);

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('f1000000-0000-4000-8000-000000000001', 'pgtap-admin@example.com'),
  ('f1000000-0000-4000-8000-000000000002', 'pgtap-operador@example.com'),
  ('f1000000-0000-4000-8000-000000000003', 'pgtap-visualizador@example.com'),
  ('f1000000-0000-4000-8000-000000000004', 'pgtap-socio@example.com'),
  ('f1000000-0000-4000-8000-000000000005', 'pgtap-sempapel@example.com');
insert into public.partners (id, name) values ('f2000000-0000-4000-8000-000000000001', 'Sócio Teste A');

-- O banco local pode ter o Administrador do seed:dev; o teste só precisa de um Administrador seu.
select private.set_user_access('pgtap-admin@example.com',        'ADMINISTRATOR', null, true, 'fixture', 'pgtap');
select private.set_user_access('pgtap-operador@example.com',     'OPERATOR',      null, true, 'fixture', 'pgtap');
select private.set_user_access('pgtap-visualizador@example.com', 'VIEWER',        null, true, 'fixture', 'pgtap');
select private.set_user_access('pgtap-socio@example.com',        'PARTNER', 'f2000000-0000-4000-8000-000000000001', true, 'fixture', 'pgtap');

-- -----------------------------------------------------------------------------
-- register_proof_file como OPERATOR
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

create temp table reg1 as
  select * from public.register_proof_file(repeat('1', 64), 'application/pdf', 1000, 'comprovante.pdf');

select is((select is_duplicate from reg1), false, 'Primeiro envio: is_duplicate = false');
select is((select upload_status::text from reg1), 'PENDING_UPLOAD', 'Primeiro envio nasce PENDING_UPLOAD');
select matches((select storage_path from reg1), '^[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}\.pdf$',
  'O caminho tem o formato aaaa/mm/<id>.pdf e é definido pelo banco');
select is((select storage_path from reg1), to_char(now() at time zone 'UTC', 'YYYY/MM') || '/' || (select proof_file_id from reg1) || '.pdf',
  'O caminho usa ano/mês do servidor (UTC) e o id do registro');
select doesnt_match((select storage_path from reg1), 'comprovante', 'O caminho nunca contém o nome original (I-13)');
select is((select uploaded_by from public.proof_files where id = (select proof_file_id from reg1)),
  'f1000000-0000-4000-8000-000000000002'::uuid, 'uploaded_by é o usuário do JWT');

-- Hash repetido: devolve o existente (CA-10), inclusive com letras maiúsculas e espaços
create temp table reg2 as
  select * from public.register_proof_file('  ' || repeat('1', 64) || ' ', 'application/pdf', 1000, 'outro-nome.pdf');
select is((select is_duplicate from reg2), true, 'Hash repetido é detectado (CA-10)');
select is((select proof_file_id from reg2), (select proof_file_id from reg1), 'Hash repetido devolve o mesmo registro');
create temp table reg3 as
  select * from public.register_proof_file(upper(repeat('1', 64)), 'application/pdf', 1000, 'outro-nome.pdf');
select is((select is_duplicate from reg3), true, 'O hash em maiúsculas é normalizado e detectado');
select is((select count(*) from public.proof_files where sha256 = repeat('1', 64)), 1::bigint, 'Existe uma única linha por hash');

-- Validações de entrada
select throws_ok($$select * from public.register_proof_file('abc', 'application/pdf', 10, 'x.pdf')$$,
  '23514', null, 'Hash fora do formato SHA-256 é rejeitado');
select throws_ok($$select * from public.register_proof_file(repeat('2', 64), 'text/html', 10, 'x.html')$$,
  '23514', 'Tipo de arquivo não permitido para comprovante.', 'Tipo fora de PDF/JPEG/PNG é rejeitado');
select throws_ok($$select * from public.register_proof_file(repeat('2', 64), 'application/pdf', 4194305, 'x.pdf')$$,
  '23514', null, 'Arquivo acima de 4 MiB é rejeitado');
select lives_ok($$select * from public.register_proof_file(repeat('3', 64), 'image/jpeg', 4194304, null)$$,
  'Arquivo exatamente no limite de 4 MiB é aceito');
select throws_ok($$select * from public.register_proof_file(repeat('4', 64), 'application/pdf', 0, 'x.pdf')$$,
  '23514', null, 'Arquivo vazio é rejeitado');

-- O cliente não escolhe campos controlados (concessão por coluna)
select throws_ok(
  $$insert into public.proof_files (sha256, mime_type, size_bytes, upload_status) values (repeat('5', 64), 'application/pdf', 10, 'STORED')$$,
  '42501', null, 'authenticated não informa upload_status no INSERT');
select throws_ok(
  $$insert into public.proof_files (sha256, mime_type, size_bytes, uploaded_by) values (repeat('5', 64), 'application/pdf', 10, 'f1000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'authenticated não informa uploaded_by no INSERT');
select throws_ok(
  $$insert into public.proof_files (sha256, mime_type, size_bytes, storage_path) values (repeat('5', 64), 'application/pdf', 10, '2026/10/x.pdf')$$,
  '42501', null, 'authenticated não informa storage_path no INSERT');

-- Metadados imutáveis
select throws_ok($$update public.proof_files set sha256 = repeat('9', 64)$$, '42501', null,
  'authenticated não altera o hash');
select throws_ok($$update public.proof_files set extraction_status = 'DONE'$$, '42501', null,
  'authenticated não escreve campos de extração');
select throws_ok($$delete from public.proof_files$$, '42501', null, 'authenticated não exclui fisicamente');

-- -----------------------------------------------------------------------------
-- complete_proof_file_upload: STORED só com objeto coerente no bucket (I-14)
-- -----------------------------------------------------------------------------
select throws_ok(
  format($$select * from public.complete_proof_file_upload(%L)$$, (select proof_file_id from reg1)),
  '23514', 'Arquivo do comprovante ausente ou diferente do registrado.', 'STORED sem objeto no bucket falha');

-- SEG-E45-03: o envio é amarrado a uploaded_by. Outro usuário com papel de escrita (Administrador)
-- não envia objeto para o caminho pendente de terceiros.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  format($$insert into storage.objects (bucket_id, name, owner_id, metadata) values ('proofs', %L, %L, '{"size": 999, "mimetype": "application/pdf"}')$$,
         (select storage_path from reg1), 'f1000000-0000-4000-8000-000000000001'),
  '42501', null, 'Administrador não envia objeto para o caminho pendente do Operador (uploaded_by)');
select is(
  (select private.proof_upload_allowed((select storage_path from reg1))), false,
  'proof_upload_allowed é falso para quem não registrou o comprovante');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(
  (select private.proof_upload_allowed((select storage_path from reg1))), true,
  'proof_upload_allowed é verdadeiro para o dono do registro pendente');

-- O Operador envia o objeto: política de INSERT aceita só o caminho PENDING_UPLOAD
select lives_ok(
  format($$insert into storage.objects (bucket_id, name, owner_id, metadata) values ('proofs', %L, %L, '{"size": 999, "mimetype": "application/pdf"}')$$,
         (select storage_path from reg1), 'f1000000-0000-4000-8000-000000000002'),
  'OPERATOR envia o objeto no caminho definido pelo banco');
select throws_ok(
  format($$select * from public.complete_proof_file_upload(%L)$$, (select proof_file_id from reg1)),
  '23514', 'Arquivo do comprovante ausente ou diferente do registrado.', 'STORED com objeto de tamanho diferente falha');

reset role;
-- Corrige o objeto (como dono, para preparar o cenário): tamanho igual ao registrado
update storage.objects set metadata = '{"size": 1000, "mimetype": "application/pdf"}'
 where bucket_id = 'proofs' and name = (select storage_path from reg1);
update storage.objects set metadata = '{"size": 1000, "mimetype": "image/png"}'
 where bucket_id = 'proofs' and name = (select storage_path from reg1);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  format($$select * from public.complete_proof_file_upload(%L)$$, (select proof_file_id from reg1)),
  '23514', null, 'STORED com mimetype diferente do registrado falha');
reset role;
update storage.objects set metadata = '{"size": 1000, "mimetype": "application/pdf"}'
 where bucket_id = 'proofs' and name = (select storage_path from reg1);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(
  (select upload_status::text from public.complete_proof_file_upload((select proof_file_id from reg1))),
  'STORED', 'Com objeto de tamanho e tipo iguais, o registro vira STORED');
select ok((select stored_at is not null from public.proof_files where id = (select proof_file_id from reg1)),
  'stored_at é preenchido pelo servidor');
select is(
  (select upload_status::text from public.complete_proof_file_upload((select proof_file_id from reg1))),
  'STORED', 'complete_proof_file_upload é idempotente');
select throws_ok(
  format($$update public.proof_files set upload_status = 'PENDING_UPLOAD' where id = %L$$, (select proof_file_id from reg1)),
  '23514', null, 'STORED não volta para PENDING_UPLOAD');
select throws_ok($$select * from public.complete_proof_file_upload(gen_random_uuid())$$, 'P0002', null,
  'Concluir envio de comprovante inexistente falha');

-- Depois de STORED, o caminho não aceita novo envio (política de INSERT exige PENDING_UPLOAD)
select throws_ok(
  format($$insert into storage.objects (bucket_id, name, owner_id, metadata) values ('proofs', %L, %L, '{"size": 1, "mimetype": "application/pdf"}')$$,
         (select storage_path from reg1), 'f1000000-0000-4000-8000-000000000002'),
  '42501', null, 'Caminho já STORED não aceita novo objeto (sem sobrescrita)');
select throws_ok(
  format($$insert into storage.objects (bucket_id, name, owner_id, metadata) values ('proofs', %L, %L, '{"size": 1, "mimetype": "application/pdf"}')$$,
         '2026/10/00000000-0000-4000-8000-000000000000.pdf', 'f1000000-0000-4000-8000-000000000002'),
  '42501', null, 'OPERATOR não envia objeto em caminho sem registro');

-- UPDATE/DELETE em storage.objects: nenhuma política => nenhuma linha afetada
create temp table affected_update as
  with u as (update storage.objects set name = name || 'x' where bucket_id = 'proofs' returning 1) select count(*) as n from u;
select is((select n from affected_update), 0::bigint, 'OPERATOR não renomeia nem sobrescreve objetos do bucket');
-- DELETE em storage.objects: o Supabase bloqueia a exclusão direta por SQL (storage.protect_delete);
-- pela API a política inexistente nega (catálogo, 01_catalog) e o teste HTTP da E4 confirma.

-- -----------------------------------------------------------------------------
-- Leitura por papel: tabela e objetos
-- -----------------------------------------------------------------------------
select is((select count(*) from storage.objects where bucket_id = 'proofs'), 1::bigint, 'OPERATOR lê o objeto');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*) from storage.objects where bucket_id = 'proofs'), 1::bigint, 'VIEWER lê o objeto (M-04: segue a matriz aprovada)');
select throws_ok(
  format($$insert into storage.objects (bucket_id, name, owner_id, metadata) values ('proofs', %L, %L, '{"size": 1, "mimetype": "application/pdf"}')$$,
         '2026/10/00000000-0000-4000-8000-000000000000.pdf', 'f1000000-0000-4000-8000-000000000003'),
  '42501', null, 'VIEWER não envia objeto');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is((select count(*) from storage.objects where bucket_id = 'proofs'), 0::bigint, 'PARTNER não lê objetos (CA-06)');
select is((select count(*) from public.proof_files), 0::bigint, 'PARTNER não lê proof_files (CA-06)');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select is((select count(*) from storage.objects where bucket_id = 'proofs'), 0::bigint, 'Usuário sem papel não lê objetos');

reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
select is((select count(*) from storage.objects where bucket_id = 'proofs'), 0::bigint, 'anon não lê objetos');

-- -----------------------------------------------------------------------------
-- Exclusão lógica: só o Administrador, com motivo, definitiva (I-15)
-- -----------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  format($$update public.proof_files set deleted_at = now(), deleted_by = %L, deletion_reason = 'duplicado' where id = %L$$,
         'f1000000-0000-4000-8000-000000000002', (select proof_file_id from reg1)),
  '42501', 'Somente o Administrador exclui comprovantes.', 'OPERATOR não exclui logicamente');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  format($$update public.proof_files set deleted_at = now(), deleted_by = %L, deletion_reason = '   ' where id = %L$$,
         'f1000000-0000-4000-8000-000000000001', (select proof_file_id from reg1)),
  '23514', null, 'Exclusão lógica sem motivo falha');
select throws_ok(
  format($$update public.proof_files set deleted_at = now(), deleted_by = %L, deletion_reason = null where id = %L$$,
         'f1000000-0000-4000-8000-000000000001', (select proof_file_id from reg1)),
  '23514', null, 'Exclusão lógica com motivo NULL falha (QA-B1: NULL não passa no CHECK)');
select throws_ok(
  format($$update public.proof_files set deleted_at = now() where id = %L$$, (select proof_file_id from reg1)),
  '23514', null, 'Exclusão lógica sem informar o motivo falha (QA-B1)');
select lives_ok(
  format($$update public.proof_files set deleted_at = '2000-01-01', deleted_by = %L, deletion_reason = 'duplicado' where id = %L$$,
         'f1000000-0000-4000-8000-000000000099', (select proof_file_id from reg1)),
  'ADMINISTRATOR exclui logicamente com motivo (data e autor informados são sobrescritos pelo servidor)');
select is(
  (select deleted_by from public.proof_files where id = (select proof_file_id from reg1)),
  'f1000000-0000-4000-8000-000000000001'::uuid, 'deleted_by é o Administrador do JWT, não o valor enviado');
select ok(
  (select deleted_at > now() - interval '1 minute' from public.proof_files where id = (select proof_file_id from reg1)),
  'deleted_at é o relógio do servidor, não o valor enviado');
select throws_ok(
  format($$update public.proof_files set deletion_reason = 'outro' where id = %L$$, (select proof_file_id from reg1)),
  '42501', 'Exclusão lógica é definitiva.', 'A exclusão lógica é definitiva');

-- Reenvio do mesmo arquivo excluído devolve o registro (deleted = true)
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select results_eq(
  $$select deleted, is_duplicate from public.register_proof_file(repeat('1', 64), 'application/pdf', 1000, 'x.pdf')$$,
  $$values (true, true)$$, 'Reenvio de arquivo excluído logicamente devolve o registro existente (deleted = true)');
select is((select count(*) from storage.objects where bucket_id = 'proofs'), 0::bigint,
  'O objeto de um comprovante excluído logicamente deixa de ser legível pela API');

reset role;
select throws_ok($$delete from public.proof_files$$, '42501', null, 'Exclusão física falha também como postgres');

select * from finish();
rollback;
