import type { AppSupabaseClient } from "@/lib/supabase/types";

export async function getUseCustomDefaultPercentages(supabase: AppSupabaseClient): Promise<boolean> {
  const { data, error } = await supabase
    .from("finance_settings")
    .select("use_custom_default_percentages")
    .single();

  if (error) {
    throw new Error(`Falha ao carregar a configuração financeira: ${error.message}`);
  }
  return data.use_custom_default_percentages;
}
