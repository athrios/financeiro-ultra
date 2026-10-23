import "server-only";

import { AppError, mapDatabaseError } from "@/lib/errors";
import type { AppSupabaseClient } from "@/lib/supabase/types";

import {
  isConformingProofStoragePath,
  isUuid,
  type ProofMimeType,
  type ValidatedProofFile,
} from "./proof-file";

/** Bucket privado (migration 0400). Nunca público. */
export const PROOF_BUCKET = "proofs";

/** Validade da URL assinada de leitura. Curta de propósito: a URL é gerada a cada pedido. */
export const PROOF_SIGNED_URL_TTL_SECONDS = 60;

export interface StoredProof {
  proofFileId: string;
  /** true quando o mesmo conteúdo (mesmo SHA-256) já estava registrado: nenhum objeto novo foi gravado. */
  duplicate: boolean;
  mimeType: ProofMimeType;
  sizeBytes: number;
  sha256: string;
}

function statusCodeOf(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "statusCode" in error) {
    const value = (error as { statusCode?: unknown }).statusCode;
    return value === undefined || value === null ? undefined : String(value);
  }
  return undefined;
}

/**
 * Envio mediado pelo servidor, em duas fases (migration 0400):
 *   1. register_proof_file: deduplica pelo SHA-256 calculado aqui e o banco define o caminho;
 *   2. upload ao bucket privado com a SESSÃO do usuário (RLS do storage), sem sobrescrita;
 *   3. complete_proof_file_upload: o banco confere em storage.objects que o objeto existe com
 *      o tamanho e o tipo registrados e marca STORED.
 *
 * Nunca usa a chave secreta: tudo passa pelas políticas do usuário. `file` já foi validado.
 */
export async function storeProofFile(
  supabase: AppSupabaseClient,
  file: ValidatedProofFile,
  bytes: Uint8Array,
): Promise<StoredProof> {
  const { data: registered, error: registerError } = await supabase.rpc("register_proof_file", {
    p_sha256: file.sha256,
    p_mime_type: file.mimeType,
    p_size_bytes: file.sizeBytes,
    p_original_name: file.originalName ?? `comprovante.${file.extension}`,
  });
  if (registerError) throw mapDatabaseError(registerError);
  const record = registered?.[0];
  if (!record) throw new AppError("UNEXPECTED", { cause: "register_proof_file sem retorno" });

  const result: StoredProof = {
    proofFileId: record.proof_file_id,
    duplicate: record.is_duplicate,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    sha256: file.sha256,
  };

  if (record.deleted) {
    throw new AppError("CONFLICT", {
      message: "Este arquivo já foi enviado antes e o comprovante foi excluído.",
    });
  }
  // Já guardado: nenhum objeto novo, nenhuma gravação.
  if (record.upload_status === "STORED") return result;

  // Defesa em profundidade: o banco define o caminho; o servidor confere a convenção antes de enviar.
  if (!isConformingProofStoragePath(record.storage_path, record.proof_file_id, file.mimeType)) {
    throw new AppError("UNEXPECTED", { cause: `Caminho fora da convenção: ${record.storage_path}` });
  }

  // Registro pendente (envio novo, ou um envio anterior interrompido): envia o objeto.
  const { error: uploadError } = await supabase.storage
    .from(PROOF_BUCKET)
    .upload(record.storage_path, bytes, { contentType: file.mimeType, upsert: false });

  if (uploadError) {
    const status = statusCodeOf(uploadError);
    if (status === "409") {
      // Objeto já existe (envio anterior que parou antes de concluir): só falta concluir o registro.
    } else if (record.is_duplicate && (status === "403" || status === "401")) {
      // Pendente de outro usuário: a política do storage só deixa o dono do registro enviar.
      throw new AppError("CONFLICT", {
        message: "Este arquivo já está sendo enviado por outro usuário. Tente novamente em instantes.",
        cause: uploadError,
      });
    } else {
      throw new AppError("UNEXPECTED", { cause: uploadError });
    }
  }

  const { error: completeError } = await supabase.rpc("complete_proof_file_upload", {
    p_proof_file_id: record.proof_file_id,
  });
  if (completeError) throw mapDatabaseError(completeError);

  return result;
}

export interface ProofSignedUrl {
  url: string;
  expiresInSeconds: number;
}

/**
 * URL assinada de curta duração para ler o comprovante. A leitura da linha e a geração da URL
 * usam a sessão do usuário: sem permissão de leitura (RLS), o registro "não existe" para ele.
 * Comprovante excluído ou ainda não concluído não gera URL.
 */
export async function createProofSignedUrl(supabase: AppSupabaseClient, proofFileId: string): Promise<ProofSignedUrl> {
  if (!isUuid(proofFileId)) throw new AppError("NOT_FOUND");

  const { data: row, error } = await supabase
    .from("proof_files")
    .select("storage_path, upload_status, deleted_at")
    .eq("id", proofFileId)
    .maybeSingle();
  if (error) throw mapDatabaseError(error);
  if (!row || row.deleted_at !== null || row.upload_status !== "STORED") throw new AppError("NOT_FOUND");

  const { data, error: signError } = await supabase.storage
    .from(PROOF_BUCKET)
    .createSignedUrl(row.storage_path, PROOF_SIGNED_URL_TTL_SECONDS);
  if (signError || !data?.signedUrl) throw new AppError("NOT_FOUND", { cause: signError });

  return { url: data.signedUrl, expiresInSeconds: PROOF_SIGNED_URL_TTL_SECONDS };
}
