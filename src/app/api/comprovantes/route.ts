import { AppError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadSession } from "@/server/auth";
import { canUploadProof, requireProofRole } from "@/server/proofs/access";
import { readBodyWithLimit } from "@/server/proofs/body";
import { jsonError, jsonOk } from "@/server/proofs/http";
import { ProofFileError, validateProofFile } from "@/server/proofs/proof-file";
import { storeProofFile } from "@/server/proofs/service";
import { getRequestLogger } from "@/server/request-context";

/**
 * POST /api/comprovantes · upload de comprovante mediado pelo servidor (plano, seção 8; E7).
 *
 * Route handler (e não Server Action) porque a Server Action aceita 1 MB por padrão e o corpo
 * do upload pode chegar a 4 MiB. O limite é explícito (`readBodyWithLimit`).
 *
 * Corpo: multipart/form-data com o campo `file`. Sessão pelo cookie. Papéis: Administrador e
 * Operador. Resposta: `{ ok: true, data: { proofFileId, duplicate, ... } }` (201 novo, 200
 * duplicado) ou `{ ok: false, error: { code, message } }` com mensagem em pt-BR e sem stack.
 *
 * O cookie de sessão é SameSite=Lax: um POST de outro site não leva a sessão.
 */
export async function POST(request: Request) {
  const logger = await getRequestLogger();
  try {
    const supabase = await createSupabaseServerClient();
    // Autoriza ANTES de ler o corpo: quem não pode enviar não faz o servidor receber o arquivo.
    const actor = requireProofRole(await loadSession(supabase), canUploadProof);

    const contentType = request.headers.get("content-type") ?? "";
    if (!/^multipart\/form-data\s*;/i.test(contentType)) {
      throw new ProofFileError("NO_FILE", 'Envie o comprovante em um formulário com o campo "file".', 400);
    }

    const body = await readBodyWithLimit(request);
    let form: FormData;
    try {
      form = await new Response(body as BodyInit, { headers: { "content-type": contentType } }).formData();
    } catch (cause) {
      throw new AppError("VALIDATION", { message: "O formulário de envio está malformado.", field: "file", cause });
    }

    const part = form.get("file");
    if (!(part instanceof File)) {
      throw new ProofFileError("NO_FILE", "Nenhum arquivo foi enviado. Escolha o comprovante e tente novamente.", 400);
    }

    const bytes = new Uint8Array(await part.arrayBuffer());
    const validated = validateProofFile({ name: part.name, declaredType: part.type, bytes });

    const stored = await storeProofFile(supabase, validated, bytes);
    logger.info("proof.upload", {
      proofFileId: stored.proofFileId,
      duplicate: stored.duplicate,
      userId: actor.userId,
      sizeBytes: stored.sizeBytes,
      mimeType: stored.mimeType,
    });
    return jsonOk(stored, stored.duplicate ? 200 : 201);
  } catch (error) {
    return jsonError(error, logger);
  }
}
