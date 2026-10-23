import { describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/errors";
import type { AppSupabaseClient } from "@/lib/supabase/types";

import { validateProofFile } from "./proof-file";
import { PROOF_SIGNED_URL_TTL_SECONDS, createProofSignedUrl, storeProofFile } from "./service";

const ID = "3f2b8c1e-5a4d-4e6f-9a7b-0c1d2e3f4a5b";
const PATH = `2026/10/${ID}.pdf`;
const BYTES = new Uint8Array([...Buffer.from("%PDF-1.7\n"), 1, 2, 3]);
const FILE = validateProofFile({ name: "extrato.pdf", declaredType: "application/pdf", bytes: BYTES });

interface Register {
  upload_status: "PENDING_UPLOAD" | "STORED";
  is_duplicate?: boolean;
  deleted?: boolean;
  storage_path?: string;
}

/** Cliente falso: registra as chamadas e devolve o que o teste mandar. */
function fakeClient(options: {
  register?: Register | { error: { code: string; message: string } };
  upload?: { error: { statusCode: string; message: string } | null };
  complete?: { error: { code: string; message: string } | null };
}) {
  const rpc = vi.fn(async (name: string) => {
    if (name === "register_proof_file") {
      const r = options.register ?? { upload_status: "PENDING_UPLOAD" };
      if ("error" in r) return { data: null, error: r.error };
      return {
        data: [
          {
            proof_file_id: ID,
            storage_path: r.storage_path ?? PATH,
            upload_status: r.upload_status,
            deleted: r.deleted ?? false,
            is_duplicate: r.is_duplicate ?? false,
          },
        ],
        error: null,
      };
    }
    return { data: {}, error: options.complete?.error ?? null };
  });
  const upload = vi.fn(async () => ({ data: null, error: options.upload?.error ?? null }));
  const from = vi.fn(() => ({ upload }));
  const client = { rpc, storage: { from } } as unknown as AppSupabaseClient;
  return { client, rpc, upload, from };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return (error as AppError).code;
  }
  return "OK";
}

describe("storeProofFile", () => {
  it("arquivo novo: registra, envia sem sobrescrita ao bucket privado e conclui", async () => {
    const { client, rpc, upload, from } = fakeClient({});
    const result = await storeProofFile(client, FILE, BYTES);

    expect(result).toMatchObject({ proofFileId: ID, duplicate: false, sha256: FILE.sha256, sizeBytes: BYTES.length });
    expect(rpc.mock.calls[0]).toEqual([
      "register_proof_file",
      { p_sha256: FILE.sha256, p_mime_type: "application/pdf", p_size_bytes: BYTES.length, p_original_name: "extrato.pdf" },
    ]);
    expect(from).toHaveBeenCalledWith("proofs");
    expect(upload).toHaveBeenCalledWith(PATH, BYTES, { contentType: "application/pdf", upsert: false });
    expect(rpc.mock.calls[1]).toEqual(["complete_proof_file_upload", { p_proof_file_id: ID }]);
  });

  it("duplicado já guardado: não envia objeto novo nem conclui de novo", async () => {
    const { client, rpc, upload } = fakeClient({ register: { upload_status: "STORED", is_duplicate: true } });
    const result = await storeProofFile(client, FILE, BYTES);

    expect(result.duplicate).toBe(true);
    expect(upload).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("duplicado de comprovante excluído: conflito, sem envio", async () => {
    const { client, upload } = fakeClient({ register: { upload_status: "STORED", is_duplicate: true, deleted: true } });
    await expect(storeProofFile(client, FILE, BYTES)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(upload).not.toHaveBeenCalled();
  });

  it("duplicado pendente do próprio usuário (envio interrompido): reenvia e conclui", async () => {
    const { client, upload, rpc } = fakeClient({ register: { upload_status: "PENDING_UPLOAD", is_duplicate: true } });
    const result = await storeProofFile(client, FILE, BYTES);

    expect(result.duplicate).toBe(true);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenLastCalledWith("complete_proof_file_upload", { p_proof_file_id: ID });
  });

  it("objeto já existe no bucket (409): só conclui o registro", async () => {
    const { client, rpc } = fakeClient({
      register: { upload_status: "PENDING_UPLOAD", is_duplicate: true },
      upload: { error: { statusCode: "409", message: "The resource already exists" } },
    });
    await expect(storeProofFile(client, FILE, BYTES)).resolves.toMatchObject({ duplicate: true });
    expect(rpc).toHaveBeenLastCalledWith("complete_proof_file_upload", { p_proof_file_id: ID });
  });

  it("duplicado pendente de outro usuário (storage nega): conflito com mensagem em português", async () => {
    const { client } = fakeClient({
      register: { upload_status: "PENDING_UPLOAD", is_duplicate: true },
      upload: { error: { statusCode: "403", message: "new row violates row-level security policy" } },
    });
    const error = await storeProofFile(client, FILE, BYTES).catch((e: unknown) => e as AppError);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("CONFLICT");
    expect((error as AppError).message).toMatch(/outro usuário/);
  });

  it("falha do storage em envio novo vira erro inesperado, sem concluir o registro", async () => {
    const { client, rpc } = fakeClient({ upload: { error: { statusCode: "500", message: "boom" } } });
    expect(await codeOf(storeProofFile(client, FILE, BYTES))).toBe("UNEXPECTED");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("caminho fora da convenção devolvido pelo banco: recusa antes de enviar", async () => {
    const { client, upload } = fakeClient({ register: { upload_status: "PENDING_UPLOAD", storage_path: "../x/arquivo.pdf" } });
    expect(await codeOf(storeProofFile(client, FILE, BYTES))).toBe("UNEXPECTED");
    expect(upload).not.toHaveBeenCalled();
  });

  it("sem permissão no banco (42501) vira FORBIDDEN", async () => {
    const { client } = fakeClient({ register: { error: { code: "42501", message: "Sem permissão para enviar comprovantes." } } });
    expect(await codeOf(storeProofFile(client, FILE, BYTES))).toBe("FORBIDDEN");
  });

  it("recusa do banco ao concluir (arquivo diferente do registrado) vira erro de validação", async () => {
    const { client } = fakeClient({ complete: { error: { code: "23514", message: "Arquivo do comprovante ausente ou diferente do registrado." } } });
    expect(await codeOf(storeProofFile(client, FILE, BYTES))).toBe("VALIDATION");
  });
});

describe("createProofSignedUrl", () => {
  function clientWithRow(row: unknown, sign: { data: { signedUrl: string } | null; error: unknown } = { data: { signedUrl: "http://x/sign" }, error: null }) {
    const createSignedUrl = vi.fn(async () => sign);
    const maybeSingle = vi.fn(async () => ({ data: row, error: null }));
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const client = {
      from: vi.fn(() => ({ select })),
      storage: { from: vi.fn(() => ({ createSignedUrl })) },
    } as unknown as AppSupabaseClient;
    return { client, createSignedUrl };
  }

  it("gera URL de curta duração para comprovante guardado", async () => {
    const { client, createSignedUrl } = clientWithRow({ storage_path: PATH, upload_status: "STORED", deleted_at: null });
    const result = await createProofSignedUrl(client, ID);
    expect(result).toEqual({ url: "http://x/sign", expiresInSeconds: PROOF_SIGNED_URL_TTL_SECONDS });
    expect(createSignedUrl).toHaveBeenCalledWith(PATH, PROOF_SIGNED_URL_TTL_SECONDS);
    expect(PROOF_SIGNED_URL_TTL_SECONDS).toBeLessThanOrEqual(300);
  });

  it("registro invisível pelo RLS, excluído ou pendente: não existe", async () => {
    for (const row of [
      null,
      { storage_path: PATH, upload_status: "STORED", deleted_at: "2026-10-23T00:00:00Z" },
      { storage_path: PATH, upload_status: "PENDING_UPLOAD", deleted_at: null },
    ]) {
      const { client, createSignedUrl } = clientWithRow(row);
      expect(await codeOf(createProofSignedUrl(client, ID))).toBe("NOT_FOUND");
      expect(createSignedUrl).not.toHaveBeenCalled();
    }
  });

  it("identificador que não é UUID não chega ao banco", async () => {
    const { client } = clientWithRow(null);
    expect(await codeOf(createProofSignedUrl(client, "../../etc"))).toBe("NOT_FOUND");
    expect((client.from as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("falha ao assinar vira NOT_FOUND", async () => {
    const { client } = clientWithRow({ storage_path: PATH, upload_status: "STORED", deleted_at: null }, { data: null, error: { message: "x" } });
    expect(await codeOf(createProofSignedUrl(client, ID))).toBe("NOT_FOUND");
  });
});
