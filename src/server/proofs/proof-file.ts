import { createHash } from "node:crypto";

import { AppError } from "@/lib/errors";

/**
 * Validação de arquivo de comprovante, feita SEMPRE no servidor (plano, seção 8; SEG-E45-03).
 *
 * Nada que o navegador declara é confiado: o tipo real vem da assinatura binária dos
 * primeiros bytes, e o SHA-256 é calculado aqui sobre os bytes recebidos. O nome original
 * serve só como metadado (`original_name`) e nunca entra no caminho do arquivo.
 *
 * Módulo puro (sem Next, sem Supabase): testável com Vitest.
 */

/** Tamanho máximo provisório: 4 MiB (P-15 em aberto). Igual ao CHECK de `proof_files` e ao bucket. */
export const PROOF_MAX_BYTES = 4 * 1024 * 1024;

export type ProofMimeType = "application/pdf" | "image/jpeg" | "image/png";
export type ProofExtension = "pdf" | "jpg" | "png";

/** Extensão do caminho de armazenamento para cada tipo (CHECK `proof_files_path_matches_mime`). */
const EXTENSION_BY_MIME: Readonly<Record<ProofMimeType, ProofExtension>> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/** Extensões aceitas no nome do arquivo enviado (".jpeg" e ".jpg" são o mesmo tipo). */
const MIME_BY_NAME_EXTENSION: Readonly<Record<string, ProofMimeType>> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

export type ProofFileErrorReason =
  | "EMPTY"
  | "TOO_LARGE"
  | "TYPE_NOT_ALLOWED"
  | "TYPE_MISMATCH"
  | "NO_FILE";

/** Erro de validação do arquivo. Mensagem em pt-BR e sem detalhes internos; `status` sugere o HTTP. */
export class ProofFileError extends AppError {
  readonly reason: ProofFileErrorReason;
  readonly status: 400 | 413 | 415;

  constructor(reason: ProofFileErrorReason, message: string, status: 400 | 413 | 415) {
    super("VALIDATION", { message, field: "file" });
    this.name = "ProofFileError";
    this.reason = reason;
    this.status = status;
  }
}

export const PROOF_MAX_LABEL = `${PROOF_MAX_BYTES / (1024 * 1024)} MB`;

/**
 * Tipo real do conteúdo, pela assinatura binária no início do arquivo.
 * O PDF só vale com o cabeçalho `%PDF-` no byte 0 (nada de lixo antes dele).
 */
export function detectProofMimeType(bytes: Uint8Array): ProofMimeType | null {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) {
    return "application/pdf";
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= png.length && png.every((byte, index) => bytes[index] === byte)) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  return null;
}

/** Extensão (minúscula, sem ponto) do último segmento do nome, ou null. */
export function fileNameExtension(name: string): string | null {
  const base = name.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return null;
  return base.slice(dot + 1).toLowerCase();
}

/** Tipo declarado sem parâmetros (`image/png; charset=...`) e em minúsculas. */
export function normalizeDeclaredType(declared: string | null | undefined): string {
  return (declared ?? "").split(";")[0].trim().toLowerCase();
}

/**
 * Nome original para o metadado: só o último segmento, sem caracteres de controle,
 * no máximo 255 caracteres (CHECK do banco). Nunca é usado em caminho.
 */
export function sanitizeOriginalName(name: string | null | undefined): string | null {
  const base = (name ?? "").split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (clean === "") return null;
  return Array.from(clean).slice(0, 255).join("");
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export interface ProofFileInput {
  /** Nome informado pelo cliente (só metadado). */
  name: string;
  /** Tipo declarado pelo cliente (Content-Type da parte do arquivo). */
  declaredType: string | null | undefined;
  bytes: Uint8Array;
}

export interface ValidatedProofFile {
  mimeType: ProofMimeType;
  extension: ProofExtension;
  sizeBytes: number;
  /** SHA-256 em hexadecimal minúsculo, calculado sobre os bytes recebidos. */
  sha256: string;
  originalName: string | null;
}

/**
 * Valida o arquivo e calcula o hash. Recusa: vazio, acima do limite, extensão ou tipo
 * declarado fora de PDF/PNG/JPEG, e qualquer divergência entre extensão, tipo declarado
 * e assinatura binária (arquivo disfarçado).
 */
export function validateProofFile(input: ProofFileInput): ValidatedProofFile {
  const size = input.bytes.length;
  if (size === 0) {
    throw new ProofFileError("EMPTY", "O arquivo está vazio. Escolha um comprovante válido.", 400);
  }
  if (size > PROOF_MAX_BYTES) {
    throw new ProofFileError("TOO_LARGE", `O arquivo é maior que o limite de ${PROOF_MAX_LABEL}.`, 413);
  }

  const notAllowed = "Tipo de arquivo não permitido. Envie um comprovante em PDF, PNG ou JPEG.";
  const extension = fileNameExtension(input.name);
  const byExtension = extension ? MIME_BY_NAME_EXTENSION[extension] : undefined;
  if (!byExtension) {
    throw new ProofFileError("TYPE_NOT_ALLOWED", notAllowed, 415);
  }

  const declared = normalizeDeclaredType(input.declaredType);
  if (declared !== "application/pdf" && declared !== "image/jpeg" && declared !== "image/png") {
    throw new ProofFileError("TYPE_NOT_ALLOWED", notAllowed, 415);
  }

  const detected = detectProofMimeType(input.bytes);
  if (!detected) {
    throw new ProofFileError("TYPE_NOT_ALLOWED", notAllowed, 415);
  }
  if (detected !== byExtension || detected !== declared) {
    throw new ProofFileError(
      "TYPE_MISMATCH",
      "O conteúdo do arquivo não corresponde à extensão ou ao tipo informado.",
      415,
    );
  }

  return {
    mimeType: detected,
    extension: EXTENSION_BY_MIME[detected],
    sizeBytes: size,
    sha256: sha256Hex(input.bytes),
    originalName: sanitizeOriginalName(input.name),
  };
}

/** Caminho no bucket: `{aaaa}/{mm}/{proof_file_id}.{ext}` (aaaa/mm em UTC). Sem o nome original. */
export function buildProofStoragePath(id: string, createdAt: Date, mimeType: ProofMimeType): string {
  const year = String(createdAt.getUTCFullYear()).padStart(4, "0");
  const month = String(createdAt.getUTCMonth() + 1).padStart(2, "0");
  return `${year}/${month}/${id}.${EXTENSION_BY_MIME[mimeType]}`;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export function isUuid(value: string): boolean {
  return new RegExp(`^${UUID}$`, "i").test(value);
}

/**
 * O caminho que o banco devolveu segue a convenção para este comprovante e tipo?
 * O banco define o caminho; o servidor confere antes de enviar o objeto (defesa em profundidade).
 */
export function isConformingProofStoragePath(path: string, id: string, mimeType: ProofMimeType): boolean {
  if (!isUuid(id)) return false;
  const extension = EXTENSION_BY_MIME[mimeType];
  return new RegExp(`^[0-9]{4}/(0[1-9]|1[0-2])/${id.toLowerCase()}\\.${extension}$`).test(path);
}
