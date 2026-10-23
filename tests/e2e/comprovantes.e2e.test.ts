import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setUserAccess } from "./support/access";
import { makeHtml, makeJpeg, makePdf, makePng, makeSizedPdf, sha256 } from "./support/files";
import {
  call,
  dbClientFor,
  signIn,
  signedUrl,
  upload,
  type ApiResult,
  type Envelope,
  type Session,
  type UploadData,
} from "./support/http";
import { USERS, e2eEnv, type UserKey } from "./support/env";

/**
 * Upload e leitura de comprovantes pela API (E7): papéis, validação do arquivo, duplicidade
 * e URL assinada. Roda contra `next start` e o Supabase local (veja vitest.e2e.config.mts).
 *
 * Os comprovantes criados aqui ficam no banco e no bucket (a exclusão é só lógica): cada arquivo
 * tem conteúdo único e `npm run db:reset` limpa tudo.
 */

const MiB = 1024 * 1024;
const sessions = {} as Record<UserKey, Session>;
let adminDb: SupabaseClient;

function expectError(result: ApiResult<Envelope<unknown>>, status: number, code: string): void {
  expect(result.status).toBe(status);
  expect(result.contentType).toMatch(/application\/json/);
  const body = result.json;
  expect(body.ok).toBe(false);
  if (body.ok) return;
  expect(body.error.code).toBe(code);
  // Mensagem em português, sem pilha e sem detalhe técnico.
  expect(body.error.message).toMatch(/[a-záéíóúãõç]{4,}/i);
  expect(result.text).not.toMatch(/\bat .*\(.*:\d+:\d+\)|node_modules|\.ts:\d+|supabase|postgres|violates/i);
}

async function proofRow(sha: string) {
  const { data, error } = await adminDb
    .from("proof_files")
    .select("id, sha256, mime_type, size_bytes, original_name, storage_path, upload_status, uploaded_by, deleted_at")
    .eq("sha256", sha);
  expect(error).toBeNull();
  return data ?? [];
}

async function objectNames(folder: string): Promise<string[]> {
  const { data, error } = await adminDb.storage.from("proofs").list(folder, { limit: 1000 });
  expect(error).toBeNull();
  return (data ?? []).map((object) => object.name);
}

function ok(result: ApiResult<Envelope<UploadData>>): UploadData {
  expect(result.status === 200 || result.status === 201).toBe(true);
  const body = result.json;
  if (!body.ok) throw new Error(`Resposta de erro inesperada: ${result.text}`);
  return body.data;
}

beforeAll(async () => {
  for (const key of Object.keys(USERS) as UserKey[]) sessions[key] = await signIn(key);
  adminDb = await dbClientFor(sessions.admin);
});

describe("upload · arquivos válidos (Operador)", () => {
  const cases = [
    { label: "PDF", name: "extrato março.pdf", type: "application/pdf", make: makePdf, ext: "pdf" },
    { label: "PNG", name: "comprovante.PNG", type: "image/png", make: makePng, ext: "png" },
    { label: "JPEG (.jpeg)", name: "foto.jpeg", type: "image/jpeg", make: makeJpeg, ext: "jpg" },
    { label: "JPEG (.jpg)", name: "foto.jpg", type: "image/jpeg", make: makeJpeg, ext: "jpg" },
  ];

  for (const c of cases) {
    it(`aceita ${c.label}: hash do servidor, caminho do banco e objeto no bucket privado`, async () => {
      const bytes = c.make();
      const result = await upload(sessions.operator, { name: c.name, type: c.type, bytes });
      const data = ok(result);

      expect(result.status).toBe(201);
      expect(data.duplicate).toBe(false);
      expect(data.sha256).toBe(sha256(bytes));
      expect(data.sizeBytes).toBe(bytes.length);
      expect(data.mimeType).toBe(c.type);

      const rows = await proofRow(sha256(bytes));
      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row).toMatchObject({
        id: data.proofFileId,
        mime_type: c.type,
        size_bytes: bytes.length,
        upload_status: "STORED",
        deleted_at: null,
        original_name: c.name,
      });
      // Convenção {aaaa}/{mm}/{id}.{ext}; o nome original nunca entra no caminho.
      expect(row.storage_path.endsWith(`/${data.proofFileId}.${c.ext}`)).toBe(true);
      expect(row.storage_path).toMatch(/^\d{4}\/(0[1-9]|1[0-2])\/[0-9a-f-]{36}\.(pdf|jpg|png)$/);
      expect(row.storage_path).not.toContain("extrato");
      expect(await objectNames(row.storage_path.slice(0, 7))).toContain(`${data.proofFileId}.${c.ext}`);
    });
  }

  it("o Administrador também envia", async () => {
    const result = await upload(sessions.admin, { name: "adm.pdf", type: "application/pdf", bytes: makePdf() });
    expect(ok(result).duplicate).toBe(false);
  });

  it("ignora um hash enviado pelo cliente: o servidor calcula o seu", async () => {
    const bytes = makePng();
    const fake = "0".repeat(64);
    const data = ok(
      await upload(sessions.operator, { name: "a.png", type: "image/png", bytes, extraFields: { sha256: fake, size_bytes: "1" } }),
    );
    expect(data.sha256).toBe(sha256(bytes));
    expect(await proofRow(fake)).toHaveLength(0);
    expect(await proofRow(sha256(bytes))).toHaveLength(1);
  });
});

describe("upload · arquivo recusado", () => {
  it("tipo disfarçado: PNG com nome e tipo de PDF, e HTML com nome e tipo de imagem", async () => {
    const png = makePng();
    const disguisedPng = await upload(sessions.operator, { name: "falso.pdf", type: "application/pdf", bytes: png });
    expectError(disguisedPng, 415, "VALIDATION");
    expect(await proofRow(sha256(png))).toHaveLength(0);

    const html = makeHtml();
    const disguisedHtml = await upload(sessions.operator, { name: "pagina.png", type: "image/png", bytes: html });
    expectError(disguisedHtml, 415, "VALIDATION");
    expect(await proofRow(sha256(html))).toHaveLength(0);
  });

  it("extensão ou tipo declarado divergentes da assinatura", async () => {
    const pdf = makePdf();
    expectError(await upload(sessions.operator, { name: "a.png", type: "image/png", bytes: pdf }), 415, "VALIDATION");
    expectError(await upload(sessions.operator, { name: "a.pdf", type: "image/png", bytes: pdf }), 415, "VALIDATION");
    expectError(await upload(sessions.operator, { name: "a.pdf", type: "application/octet-stream", bytes: pdf }), 415, "VALIDATION");
    expectError(await upload(sessions.operator, { name: "a.exe", type: "application/pdf", bytes: pdf }), 415, "VALIDATION");
    expect(await proofRow(sha256(pdf))).toHaveLength(0);
  });

  it("arquivo vazio", async () => {
    const result = await upload(sessions.operator, { name: "vazio.pdf", type: "application/pdf", bytes: new Uint8Array() });
    expectError(result, 400, "VALIDATION");
  });

  it("acima do limite de 4 MiB (um byte a mais, 6 MiB e 12 MiB)", async () => {
    for (const size of [4 * MiB + 1, 6 * MiB, 12 * MiB]) {
      const bytes = makeSizedPdf(size);
      const result = await upload(sessions.operator, { name: "grande.pdf", type: "application/pdf", bytes });
      expectError(result, 413, "VALIDATION");
      expect(await proofRow(sha256(bytes))).toHaveLength(0);
    }
  });

  it("exatamente 4 MiB é aceito", async () => {
    const bytes = makeSizedPdf(4 * MiB);
    const result = await upload(sessions.operator, { name: "limite.pdf", type: "application/pdf", bytes });
    expect(ok(result).sizeBytes).toBe(4 * MiB);
  });

  it("sem o campo file, ou fora de multipart", async () => {
    const empty = new FormData();
    empty.set("outro", "x");
    expectError(await call<Envelope<unknown>>("POST", "/api/comprovantes", { session: sessions.operator, body: empty }), 400, "VALIDATION");
    expectError(
      await call<Envelope<unknown>>("POST", "/api/comprovantes", {
        session: sessions.operator,
        body: JSON.stringify({ file: "x" }),
        headers: { "content-type": "application/json" },
      }),
      400,
      "VALIDATION",
    );
  });
});

describe("upload · duplicado", () => {
  it("o mesmo arquivo enviado duas vezes é detectado, sem novo objeto nem nova linha", async () => {
    const bytes = makePdf();
    const first = await upload(sessions.operator, { name: "primeiro.pdf", type: "application/pdf", bytes });
    const firstData = ok(first);
    expect(first.status).toBe(201);

    const row = (await proofRow(sha256(bytes)))[0];
    const folder = row.storage_path.slice(0, 7);
    const before = await objectNames(folder);

    const second = await upload(sessions.operator, { name: "outro-nome.pdf", type: "application/pdf", bytes });
    const secondData = ok(second);
    expect(second.status).toBe(200);
    expect(secondData.duplicate).toBe(true);
    expect(secondData.proofFileId).toBe(firstData.proofFileId);

    expect(await objectNames(folder)).toEqual(before);
    expect(await proofRow(sha256(bytes))).toHaveLength(1);
    expect((await proofRow(sha256(bytes)))[0].original_name).toBe("primeiro.pdf");
  });

  it("outro usuário enviando o mesmo conteúdo também recebe o duplicado", async () => {
    const bytes = makeJpeg();
    const first = ok(await upload(sessions.operator, { name: "a.jpg", type: "image/jpeg", bytes }));
    const second = ok(await upload(sessions.admin, { name: "b.jpg", type: "image/jpeg", bytes }));
    expect(second.duplicate).toBe(true);
    expect(second.proofFileId).toBe(first.proofFileId);
  });

  it("dois envios simultâneos do mesmo arquivo geram um só registro e um só objeto", async () => {
    const bytes = makePng();
    const results = await Promise.all([
      upload(sessions.operator, { name: "x.png", type: "image/png", bytes }),
      upload(sessions.admin, { name: "y.png", type: "image/png", bytes }),
    ]);
    // Um deles pode receber conflito (envio em andamento do outro usuário); nenhum erro inesperado.
    for (const result of results) expect([200, 201, 409]).toContain(result.status);
    expect(results.some((result) => result.status === 201)).toBe(true);
    const rows = await proofRow(sha256(bytes));
    expect(rows).toHaveLength(1);
    expect(await objectNames(rows[0].storage_path.slice(0, 7))).toContain(`${rows[0].id}.png`);
  });
});

describe("upload · papéis", () => {
  const refused: Array<[UserKey, string]> = [
    ["viewer", "Visualizador"],
    ["partner", "Sócio"],
    ["noRole", "usuário sem papel"],
  ];

  for (const [key, label] of refused) {
    it(`${label} é recusado (403) e nada é gravado`, async () => {
      const bytes = makePdf();
      const result = await upload(sessions[key], { name: "a.pdf", type: "application/pdf", bytes });
      expectError(result, 403, "FORBIDDEN");
      expect(await proofRow(sha256(bytes))).toHaveLength(0);
    });
  }

  it("sem sessão: 401 em JSON, sem redirecionar ao login", async () => {
    const bytes = makePdf();
    const result = await upload(null, { name: "a.pdf", type: "application/pdf", bytes });
    expectError(result, 401, "UNAUTHENTICATED");
    expect(await proofRow(sha256(bytes))).toHaveLength(0);
  });

  it("cookie de sessão inválido: 401", async () => {
    const forged = new FormData();
    forged.set("file", new Blob([makePdf() as BlobPart], { type: "application/pdf" }), "a.pdf");
    const result = await call<Envelope<unknown>>("POST", "/api/comprovantes", {
      session: null,
      body: forged,
      headers: { cookie: "sb-127-auth-token=base64-aW52YWxpZG8" },
    });
    expectError(result, 401, "UNAUTHENTICATED");
  });

  it("usuário inativo é recusado (403) para enviar e para ler, mesmo com a sessão ainda válida", async () => {
    const existing = ok(await upload(sessions.operator, { name: "antes.pdf", type: "application/pdf", bytes: makePdf() }));

    setUserAccess("operator", "OPERATOR", false);
    try {
      const bytes = makePdf();
      expectError(await upload(sessions.operator, { name: "a.pdf", type: "application/pdf", bytes }), 403, "FORBIDDEN");
      expect(await proofRow(sha256(bytes))).toHaveLength(0);
      expectError(await signedUrl(sessions.operator, existing.proofFileId), 403, "FORBIDDEN");
    } finally {
      setUserAccess("operator", "OPERATOR", true);
    }

    const again = await upload(sessions.operator, { name: "volta.pdf", type: "application/pdf", bytes: makePdf() });
    expect(ok(again).duplicate).toBe(false);
  });
});

describe("leitura · URL assinada", () => {
  let proofId: string;
  let bytes: Uint8Array;

  beforeAll(async () => {
    bytes = makePdf();
    proofId = ok(await upload(sessions.operator, { name: "leitura.pdf", type: "application/pdf", bytes })).proofFileId;
  });

  for (const key of ["admin", "operator", "viewer"] as const) {
    it(`${key === "viewer" ? "Visualizador" : key === "admin" ? "Administrador" : "Operador"} recebe a URL assinada e ela entrega o arquivo`, async () => {
      const result = await signedUrl(sessions[key], proofId);
      expect(result.status).toBe(200);
      expect(result.headers.get("cache-control")).toMatch(/no-store/);
      const body = result.json;
      if (!body.ok) throw new Error(result.text);
      expect(body.data.expiresInSeconds).toBeLessThanOrEqual(300);

      // O token da URL expira em poucos minutos.
      const token = new URL(body.data.url).searchParams.get("token") ?? "";
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()) as { exp: number; iat?: number };
      expect(payload.exp * 1000 - Date.now()).toBeLessThanOrEqual(300_000);

      // A URL funciona sem cookie nem chave: é a única credencial.
      const file = await fetch(body.data.url);
      expect(file.status).toBe(200);
      const downloaded = new Uint8Array(await file.arrayBuffer());
      expect(sha256(downloaded)).toBe(sha256(bytes));
    });
  }

  it("Sócio e usuário sem papel são recusados (P-02b)", async () => {
    expectError(await signedUrl(sessions.partner, proofId), 403, "FORBIDDEN");
    expectError(await signedUrl(sessions.noRole, proofId), 403, "FORBIDDEN");
  });

  it("sem sessão: 401", async () => {
    expectError(await signedUrl(null, proofId), 401, "UNAUTHENTICATED");
  });

  it("identificador inexistente ou que não é UUID: 404, sem detalhe", async () => {
    expectError(await signedUrl(sessions.admin, "00000000-0000-4000-8000-000000000000"), 404, "NOT_FOUND");
    expectError(await signedUrl(sessions.admin, "nao-e-um-uuid"), 404, "NOT_FOUND");
  });

  it("o bucket é privado: o endereço público do objeto não entrega o arquivo", async () => {
    const row = (await proofRow(sha256(bytes)))[0];
    const { supabaseUrl } = e2eEnv();
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/proofs/${row.storage_path}`;
    const response = await fetch(publicUrl);
    expect(response.status).not.toBe(200);
    // E sem URL assinada nem sessão, o endereço autenticado também não.
    const authenticated = await fetch(`${supabaseUrl}/storage/v1/object/authenticated/proofs/${row.storage_path}`);
    expect(authenticated.status).not.toBe(200);
  });
});

describe("caminho direto pela API do Supabase (sem passar pelo servidor)", () => {
  // RAT-D020: sem camadas extras. O banco só garante a coerência entre a linha e o objeto
  // (existência, tamanho e tipo declarado). Quem tem papel de Operador e chama a RPC e o storage
  // direto consegue registrar um hash que não é o do conteúdo: risco residual (04, seção E7).
  it("o banco recusa concluir o envio sem o objeto, ou com tamanho diferente do registrado", async () => {
    const operatorDb = await dbClientFor(sessions.operator);
    const fakeHash = sha256(new Uint8Array(Buffer.from(`direto-${Date.now()}-${Math.random()}`)));
    const registered = await operatorDb.rpc("register_proof_file", {
      p_sha256: fakeHash,
      p_mime_type: "application/pdf",
      p_size_bytes: 20,
      p_original_name: "direto.pdf",
    });
    expect(registered.error).toBeNull();
    const record = (registered.data as Array<{ proof_file_id: string; storage_path: string }>)[0];

    const withoutObject = await operatorDb.rpc("complete_proof_file_upload", { p_proof_file_id: record.proof_file_id });
    expect(withoutObject.error?.code).toBe("23514");

    const wrongSize = await operatorDb.storage
      .from("proofs")
      .upload(record.storage_path, new Uint8Array(Buffer.from("tamanho diferente do registrado")), {
        contentType: "application/pdf",
        upsert: false,
      });
    expect(wrongSize.error).toBeNull();
    const withWrongSize = await operatorDb.rpc("complete_proof_file_upload", { p_proof_file_id: record.proof_file_id });
    expect(withWrongSize.error?.code).toBe("23514");

    // Sem sobrescrita: o objeto enviado não pode ser trocado por outro.
    const overwrite = await operatorDb.storage
      .from("proofs")
      .upload(record.storage_path, new Uint8Array(20), { contentType: "application/pdf", upsert: false });
    expect(overwrite.error).not.toBeNull();
  });

  it("o Visualizador e o Sócio não registram nem enviam pela API direta", async () => {
    for (const key of ["viewer", "partner", "noRole"] as const) {
      const db = await dbClientFor(sessions[key]);
      const registered = await db.rpc("register_proof_file", {
        p_sha256: sha256(makePdf()),
        p_mime_type: "application/pdf",
        p_size_bytes: 10,
        p_original_name: "x.pdf",
      });
      expect(registered.error?.code, key).toBe("42501");
    }
  });
});

afterAll(() => {
  // Nada a limpar: comprovantes não são apagados (só exclusão lógica). `npm run db:reset` zera o ambiente.
});
