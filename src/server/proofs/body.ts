import { PROOF_MAX_BYTES, ProofFileError, PROOF_MAX_LABEL } from "./proof-file";

/**
 * Limite do CORPO da requisição de upload: o arquivo (até PROOF_MAX_BYTES) mais a folga do
 * multipart (fronteiras e cabeçalhos das partes). O limite exato do arquivo é conferido
 * depois, na validação.
 *
 * Por que ler o corpo aqui: o Next não rejeita corpo grande; com proxy ativo ele guarda só os
 * primeiros 10 MB (`proxyClientMaxBodySize`) e segue em frente com o corpo cortado. Então o
 * limite precisa ser do próprio handler: confere o Content-Length e conta os bytes lidos,
 * interrompendo a leitura ao passar do limite.
 */
export const PROOF_REQUEST_MAX_BYTES = PROOF_MAX_BYTES + 64 * 1024;

function tooLarge(): ProofFileError {
  return new ProofFileError("TOO_LARGE", `O arquivo é maior que o limite de ${PROOF_MAX_LABEL}.`, 413);
}

export async function readBodyWithLimit(request: Request, maxBytes: number = PROOF_REQUEST_MAX_BYTES): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    // Recusa sem ler. Cancela o corpo para o servidor não ficar recebendo o resto.
    await request.body?.cancel().catch(() => undefined);
    throw tooLarge();
  }
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
