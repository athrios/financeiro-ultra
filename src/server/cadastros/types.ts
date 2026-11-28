import type { AppSupabaseClient } from "@/lib/supabase/types";

/**
 * O que toda escrita dos cadastros precisa: o cliente da sessão e o correlation id da requisição.
 * Separado de `context.ts` (que depende do Next) para as funções poderem ser testadas sem servidor.
 */
export interface CadastroContext {
  supabase: AppSupabaseClient;
  correlationId: string | null;
}

/**
 * Resultado de uma escrita: só o que a tela precisa para seguir (ir ao detalhe, refazer a próxima
 * edição). `updatedAt` é o novo token de concorrência, em TEXTO com microssegundos, nunca `Date`.
 */
export interface WriteResult {
  id: string;
  active: boolean;
  updatedAt: string;
}

/** Itens de lista de apelidos, variações etc. */
export interface TextItem {
  id: string;
  value: string;
  active: boolean;
}
