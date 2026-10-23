import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadSession } from "@/server/auth";
import { canReadProof, requireProofRole } from "@/server/proofs/access";
import { jsonError, jsonOk } from "@/server/proofs/http";
import { createProofSignedUrl } from "@/server/proofs/service";
import { getRequestLogger } from "@/server/request-context";

/**
 * GET /api/comprovantes/{id}/url · URL assinada de curta duração para ler o comprovante (E7).
 *
 * A permissão é conferida no servidor antes de gerar a URL (Administrador, Operador e
 * Visualizador; Sócio e usuário sem papel são recusados até a decisão P-02b). O bucket é
 * privado: não existe outro caminho de leitura. A URL não é gravada em log.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const logger = await getRequestLogger();
  try {
    const { id } = await context.params;
    const supabase = await createSupabaseServerClient();
    const actor = requireProofRole(await loadSession(supabase), canReadProof);

    const signed = await createProofSignedUrl(supabase, id);
    logger.info("proof.signed_url", { proofFileId: id, userId: actor.userId });
    return jsonOk(signed);
  } catch (error) {
    return jsonError(error, logger);
  }
}
