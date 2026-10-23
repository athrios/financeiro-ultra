import { describe, expect, it } from "vitest";

import { PROOF_REQUEST_MAX_BYTES, readBodyWithLimit } from "./body";
import { PROOF_MAX_BYTES, ProofFileError } from "./proof-file";

function post(body: BodyInit | null, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/comprovantes", { method: "POST", body, headers, duplex: "half" } as RequestInit);
}

/** Corpo em pedaços, sem Content-Length (como um envio em chunked). */
function chunked(total: number, chunk = 64 * 1024): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= total) return controller.close();
      const size = Math.min(chunk, total - sent);
      sent += size;
      controller.enqueue(new Uint8Array(size).fill(1));
    },
  });
}

async function failure(promise: Promise<unknown>): Promise<ProofFileError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ProofFileError);
    return error as ProofFileError;
  }
  throw new Error("Era esperado um erro.");
}

describe("readBodyWithLimit", () => {
  it("o limite do corpo é o do arquivo mais uma folga pequena de multipart", () => {
    expect(PROOF_REQUEST_MAX_BYTES).toBeGreaterThan(PROOF_MAX_BYTES);
    expect(PROOF_REQUEST_MAX_BYTES - PROOF_MAX_BYTES).toBeLessThanOrEqual(128 * 1024);
  });

  it("lê o corpo inteiro quando cabe no limite", async () => {
    const body = await readBodyWithLimit(post(new Uint8Array([1, 2, 3, 4])), 10);
    expect([...body]).toEqual([1, 2, 3, 4]);
  });

  it("corpo vazio ou ausente devolve zero bytes", async () => {
    expect((await readBodyWithLimit(post(null), 10)).length).toBe(0);
    expect((await readBodyWithLimit(post(new Uint8Array()), 10)).length).toBe(0);
  });

  it("aceita exatamente o limite", async () => {
    expect((await readBodyWithLimit(post(new Uint8Array(10)), 10)).length).toBe(10);
  });

  it("recusa com 413 pelo Content-Length, sem ler o corpo", async () => {
    const request = post(new Uint8Array(11), { "content-length": "11" });
    const error = await failure(readBodyWithLimit(request, 10));
    expect(error.status).toBe(413);
    expect(error.reason).toBe("TOO_LARGE");
  });

  it("recusa com 413 quando o corpo passa do limite sem Content-Length, interrompendo a leitura", async () => {
    const error = await failure(readBodyWithLimit(post(chunked(1024 * 1024)), 100 * 1024));
    expect(error.status).toBe(413);
  });

  it("um Content-Length que mente (menor que o corpo real) não fura o limite", async () => {
    const request = post(chunked(1024 * 1024), { "content-length": "5" });
    const error = await failure(readBodyWithLimit(request, 100 * 1024));
    expect(error.status).toBe(413);
  });
});
