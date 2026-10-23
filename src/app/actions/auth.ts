"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getRequestLogger } from "@/server/request-context";

/** Sair (03-ui-ux.md, 2.2): reversível, sem confirmação. Encerra a sessão e volta ao login. */
export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  (await getRequestLogger()).info("auth.sign_out");
  redirect("/login");
}
