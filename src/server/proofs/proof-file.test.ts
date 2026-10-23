import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";

import {
  PROOF_MAX_BYTES,
  ProofFileError,
  buildProofStoragePath,
  detectProofMimeType,
  fileNameExtension,
  isConformingProofStoragePath,
  isUuid,
  normalizeDeclaredType,
  sanitizeOriginalName,
  sha256Hex,
  validateProofFile,
} from "./proof-file";

const ID = "3f2b8c1e-5a4d-4e6f-9a7b-0c1d2e3f4a5b";

function bytesOf(prefix: number[], total = prefix.length + 16): Uint8Array {
  const out = new Uint8Array(total);
  out.set(prefix);
  for (let i = prefix.length; i < total; i += 1) out[i] = (i * 7) % 251;
  return out;
}

const PDF = bytesOf([...Buffer.from("%PDF-1.7\n")]);
const PNG = bytesOf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = bytesOf([0xff, 0xd8, 0xff, 0xe0]);
const HTML = new Uint8Array(Buffer.from("<html><script>alert(1)</script></html>"));

function rejection(fn: () => unknown): ProofFileError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ProofFileError);
    return error as ProofFileError;
  }
  throw new Error("Era esperado um erro de validação.");
}

describe("detectProofMimeType", () => {
  it("reconhece PDF, PNG e JPEG pela assinatura", () => {
    expect(detectProofMimeType(PDF)).toBe("application/pdf");
    expect(detectProofMimeType(PNG)).toBe("image/png");
    expect(detectProofMimeType(JPEG)).toBe("image/jpeg");
  });

  it("não reconhece HTML, texto, vazio e assinaturas incompletas", () => {
    expect(detectProofMimeType(HTML)).toBeNull();
    expect(detectProofMimeType(new Uint8Array())).toBeNull();
    expect(detectProofMimeType(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBeNull(); // %PDF sem o hífen
    expect(detectProofMimeType(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull(); // PNG truncado
    expect(detectProofMimeType(new Uint8Array([0xff, 0xd8]))).toBeNull(); // JPEG truncado
  });

  it("exige o cabeçalho do PDF no primeiro byte", () => {
    const withJunk = new Uint8Array([0x0a, ...PDF]);
    expect(detectProofMimeType(withJunk)).toBeNull();
  });
});

describe("validateProofFile · arquivos válidos", () => {
  it("aceita PDF, PNG e JPEG com extensão, tipo declarado e assinatura coerentes", () => {
    const pdf = validateProofFile({ name: "extrato.pdf", declaredType: "application/pdf", bytes: PDF });
    expect(pdf).toMatchObject({ mimeType: "application/pdf", extension: "pdf", sizeBytes: PDF.length });

    const png = validateProofFile({ name: "foto.PNG", declaredType: "image/png", bytes: PNG });
    expect(png).toMatchObject({ mimeType: "image/png", extension: "png" });

    const jpg = validateProofFile({ name: "foto.jpg", declaredType: "image/jpeg", bytes: JPEG });
    expect(jpg).toMatchObject({ mimeType: "image/jpeg", extension: "jpg" });
  });

  it(".jpeg vale como JPEG e o caminho usa .jpg", () => {
    const jpeg = validateProofFile({ name: "foto.jpeg", declaredType: "image/jpeg", bytes: JPEG });
    expect(jpeg.extension).toBe("jpg");
  });

  it("aceita parâmetros e caixa no tipo declarado", () => {
    const ok = validateProofFile({ name: "a.pdf", declaredType: " Application/PDF ; foo=bar", bytes: PDF });
    expect(ok.mimeType).toBe("application/pdf");
  });

  it("aceita exatamente o limite de tamanho", () => {
    const big = new Uint8Array(PROOF_MAX_BYTES);
    big.set(PDF.subarray(0, 8));
    expect(validateProofFile({ name: "a.pdf", declaredType: "application/pdf", bytes: big }).sizeBytes).toBe(
      PROOF_MAX_BYTES,
    );
  });
});

describe("validateProofFile · hash", () => {
  it("calcula o SHA-256 no servidor, em hexadecimal minúsculo de 64 caracteres", () => {
    const result = validateProofFile({ name: "a.pdf", declaredType: "application/pdf", bytes: PDF });
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.sha256).toBe(createHash("sha256").update(PDF).digest("hex"));
    expect(sha256Hex(PDF)).toBe(result.sha256);
  });

  it("o mesmo conteúdo dá o mesmo hash, mesmo com outro nome", () => {
    const a = validateProofFile({ name: "um.pdf", declaredType: "application/pdf", bytes: PDF });
    const b = validateProofFile({ name: "outro.pdf", declaredType: "application/pdf", bytes: PDF.slice() });
    expect(a.sha256).toBe(b.sha256);
  });

  it("conteúdo diferente muda o hash", () => {
    const other = PDF.slice();
    other[other.length - 1] ^= 0xff;
    const a = validateProofFile({ name: "a.pdf", declaredType: "application/pdf", bytes: PDF });
    const b = validateProofFile({ name: "a.pdf", declaredType: "application/pdf", bytes: other });
    expect(a.sha256).not.toBe(b.sha256);
  });
});

describe("validateProofFile · recusas", () => {
  it("recusa arquivo vazio", () => {
    const error = rejection(() => validateProofFile({ name: "a.pdf", declaredType: "application/pdf", bytes: new Uint8Array() }));
    expect(error.reason).toBe("EMPTY");
    expect(error.status).toBe(400);
    expect(error.message).toMatch(/vazio/);
  });

  it("recusa arquivo acima do limite (um byte a mais)", () => {
    const big = new Uint8Array(PROOF_MAX_BYTES + 1);
    big.set(PDF.subarray(0, 8));
    const error = rejection(() => validateProofFile({ name: "a.pdf", declaredType: "application/pdf", bytes: big }));
    expect(error.reason).toBe("TOO_LARGE");
    expect(error.status).toBe(413);
    expect(error.message).toMatch(/4 MB/);
  });

  it("recusa extensão fora de PDF, PNG e JPEG", () => {
    for (const name of ["a.exe", "a.html", "a.svg", "a.gif", "a", "a.", ".pdf", "a.pdf.exe"]) {
      const error = rejection(() => validateProofFile({ name, declaredType: "application/pdf", bytes: PDF }));
      expect(error.reason, name).toBe("TYPE_NOT_ALLOWED");
      expect(error.status, name).toBe(415);
    }
  });

  it("recusa tipo declarado ausente ou fora da lista", () => {
    for (const declaredType of [undefined, null, "", "application/octet-stream", "image/gif", "text/html", "image/jpg"]) {
      const error = rejection(() => validateProofFile({ name: "a.pdf", declaredType, bytes: PDF }));
      expect(error.reason, String(declaredType)).toBe("TYPE_NOT_ALLOWED");
    }
  });

  it("recusa conteúdo sem assinatura conhecida, mesmo com nome e tipo corretos", () => {
    const error = rejection(() => validateProofFile({ name: "a.png", declaredType: "image/png", bytes: HTML }));
    expect(error.reason).toBe("TYPE_NOT_ALLOWED");
  });

  it("recusa arquivo disfarçado: assinatura de um tipo, extensão ou tipo declarado de outro", () => {
    const cases: Array<[string, string, Uint8Array]> = [
      ["a.pdf", "application/pdf", PNG], // PNG com cara de PDF
      ["a.png", "image/png", PDF], // PDF com cara de PNG
      ["a.jpg", "image/jpeg", PNG],
      ["a.png", "image/png", JPEG],
      ["a.pdf", "image/png", PDF], // extensão e conteúdo coerentes, tipo declarado não
    ];
    for (const [name, declaredType, bytes] of cases) {
      const error = rejection(() => validateProofFile({ name, declaredType, bytes }));
      expect(error.reason, `${name} ${declaredType}`).toBe("TYPE_MISMATCH");
    }
  });

  it("o erro é um AppError de validação, em português e sem stack no texto", () => {
    const error = rejection(() => validateProofFile({ name: "a.pdf", declaredType: "application/pdf", bytes: new Uint8Array() }));
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("VALIDATION");
    expect(error.field).toBe("file");
    expect(error.message).not.toMatch(/\bat\s.+\(.+:\d+:\d+\)/);
  });
});

describe("nome original", () => {
  it("fileNameExtension usa o último segmento e ignora o diretório", () => {
    expect(fileNameExtension("C:\\docs\\Extrato.Final.PDF")).toBe("pdf");
    expect(fileNameExtension("../../etc/passwd")).toBeNull();
    expect(fileNameExtension("semponto")).toBeNull();
  });

  it("sanitizeOriginalName tira diretórios e caracteres de controle e limita a 255", () => {
    expect(sanitizeOriginalName("C:\\x\\..\\comprovante março.pdf")).toBe("comprovante março.pdf");
    expect(sanitizeOriginalName("a\u0000b\nc.pdf")).toBe("abc.pdf");
    expect(sanitizeOriginalName("   ")).toBeNull();
    expect(sanitizeOriginalName(undefined)).toBeNull();
    expect(Array.from(sanitizeOriginalName(`${"x".repeat(400)}.pdf`) ?? "")).toHaveLength(255);
  });

  it("o nome original nunca vira parte do caminho", () => {
    const path = buildProofStoragePath(ID, new Date("2026-10-23T12:00:00Z"), "application/pdf");
    expect(path).toBe(`2026/10/${ID}.pdf`);
    expect(path).not.toMatch(/extrato|\.\./);
  });

  it("normalizeDeclaredType", () => {
    expect(normalizeDeclaredType("Image/PNG; q=1")).toBe("image/png");
    expect(normalizeDeclaredType(null)).toBe("");
  });
});

describe("caminho de armazenamento", () => {
  it("segue {aaaa}/{mm}/{id}.{ext}, com mês de dois dígitos em UTC", () => {
    expect(buildProofStoragePath(ID, new Date("2026-01-31T23:59:59Z"), "image/png")).toBe(`2026/01/${ID}.png`);
    expect(buildProofStoragePath(ID, new Date("2026-12-01T00:00:00Z"), "image/jpeg")).toBe(`2026/12/${ID}.jpg`);
    // 31/12 às 23h30 em UTC-3 já é 01/01 em UTC: o caminho usa sempre UTC, como o banco.
    expect(buildProofStoragePath(ID, new Date("2026-12-31T23:30:00-03:00"), "application/pdf")).toBe(`2027/01/${ID}.pdf`);
  });

  it("isConformingProofStoragePath confere id, extensão e formato", () => {
    expect(isConformingProofStoragePath(`2026/10/${ID}.pdf`, ID, "application/pdf")).toBe(true);
    expect(isConformingProofStoragePath(`2026/10/${ID}.jpg`, ID, "image/jpeg")).toBe(true);
    expect(isConformingProofStoragePath(`2026/10/${ID}.png`, ID, "application/pdf")).toBe(false); // extensão de outro tipo
    expect(isConformingProofStoragePath(`2026/13/${ID}.pdf`, ID, "application/pdf")).toBe(false); // mês inválido
    expect(isConformingProofStoragePath(`2026/10/outro.pdf`, ID, "application/pdf")).toBe(false);
    expect(isConformingProofStoragePath(`../2026/10/${ID}.pdf`, ID, "application/pdf")).toBe(false);
    expect(isConformingProofStoragePath(`2026/10/${ID}.pdf`, "nao-e-uuid", "application/pdf")).toBe(false);
  });

  it("isUuid", () => {
    expect(isUuid(ID)).toBe(true);
    expect(isUuid("123")).toBe(false);
    expect(isUuid(`${ID}x`)).toBe(false);
  });
});
