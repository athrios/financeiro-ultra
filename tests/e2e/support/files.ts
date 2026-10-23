import { createHash, randomBytes } from "node:crypto";

/**
 * Arquivos de teste com assinatura verdadeira e conteúdo ÚNICO a cada chamada.
 * O hash é único no banco (RN-008) e comprovantes não são apagados: sem o sufixo aleatório, a
 * segunda execução dos testes encontraria o arquivo da primeira como "duplicado".
 */
function nonce(): Buffer {
  return randomBytes(24);
}

function concat(...parts: Array<Uint8Array | Buffer>): Uint8Array {
  return new Uint8Array(Buffer.concat(parts));
}

export function makePdf(): Uint8Array {
  return concat(Buffer.from("%PDF-1.4\n% comprovante de teste\n"), nonce(), Buffer.from("\n%%EOF\n"));
}

export function makePng(): Uint8Array {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return concat(signature, Buffer.from("IHDR"), nonce(), Buffer.from("IEND"));
}

export function makeJpeg(): Uint8Array {
  return concat(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), nonce(), Buffer.from([0xff, 0xd9]));
}

export function makeHtml(): Uint8Array {
  return concat(Buffer.from("<html><body>"), Buffer.from(nonce().toString("hex")), Buffer.from("</body></html>"));
}

/** Arquivo com a assinatura de PDF e o tamanho pedido (zeros depois do cabeçalho; único pelo início). */
export function makeSizedPdf(size: number): Uint8Array {
  const out = new Uint8Array(size);
  const head = concat(Buffer.from("%PDF-1.4\n"), nonce());
  out.set(head.subarray(0, Math.min(head.length, size)));
  return out;
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
