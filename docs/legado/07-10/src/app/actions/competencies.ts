"use server";

import { revalidatePath } from "next/cache";

import { parseMonthParam } from "@/domain/competencies";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdmin, loadSession } from "@/server/auth";
import { openCompetency } from "@/server/competencies";

export interface OpenCompetencyState {
  error: string | null;
}

export async function openCompetencyAction(
  _previous: OpenCompetencyState,
  formData: FormData,
): Promise<OpenCompetencyState> {
  const reference = parseMonthParam(String(formData.get("referenceMonth") ?? ""));
  if (!reference) {
    return { error: "Competência inválida." };
  }

  const supabase = await createSupabaseServerClient();
  const session = await loadSession(supabase);
  // Verificação de interface; o banco também exige ADMIN_FINANCEIRO (RPC + RLS).
  if (session.status !== "active" || !isAdmin(session.profile)) {
    return { error: "Apenas o administrador financeiro pode abrir competências." };
  }

  const result = await openCompetency(supabase, reference);
  if (!result.ok) {
    return { error: result.message };
  }

  revalidatePath("/");
  return { error: null };
}
