"use server";

import { refresh } from "next/cache";

export interface RecheckState {
  /** Quantas verificações já foram feitas (muda a cada clique, mesmo sem alteração). */
  checks: number;
}

/**
 * "Verificar novamente" (03-ui-ux.md, 2.7.1): pede ao Next que recarregue a rota atual.
 * O layout relê sessão e perfil; se o acesso foi liberado, a tela de estado dá lugar ao
 * sistema. Não recebe nem devolve dado de negócio, e não precisa de autorização própria:
 * quem decide o acesso é o servidor, a cada leitura de perfil, e o RLS.
 */
export async function recheckAccess(previous: RecheckState): Promise<RecheckState> {
  refresh();
  return { checks: previous.checks + 1 };
}
