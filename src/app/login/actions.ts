"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadSession } from "@/server/auth";

export interface LoginState {
  error: string | null;
  email: string;
}

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export async function signIn(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const parsed = credentialsSchema.safeParse({ email, password: formData.get("password") });
  if (!parsed.success) {
    return { error: "Informe um e-mail válido e a senha.", email };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { error: "E-mail ou senha inválidos.", email };
  }

  // Autenticar não basta: é preciso ter perfil ativo.
  const session = await loadSession(supabase);
  if (session.status !== "active") {
    await supabase.auth.signOut();
    return { error: "Seu usuário não possui acesso ativo. Procure o financeiro.", email };
  }

  redirect("/");
}
