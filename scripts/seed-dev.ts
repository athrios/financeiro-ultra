/**
 * Seed de DESENVOLVIMENTO (Supabase local), em duas fases (modelagem 7.2, passo 8).
 *
 *   npm run db:reset   # migrations + supabase/seed.sql (sócios fictícios, sem usuários)
 *   npm run seed:dev   # usuários fictícios + papéis
 *
 * Fase 1: cria (ou reaproveita) os usuários fictícios pela API admin do Auth LOCAL,
 *         com a chave secreta local. O trigger do Auth cria os perfis SEM papel.
 * Fase 2: atribui os papéis executando scripts/sql/seed-dev-access.sql com
 *         `supabase db query --local -f` (conexão como postgres, que é o único papel
 *         com EXECUTE em private.set_user_access). Cada atribuição exige motivo e
 *         fica na auditoria (origem SCRIPT, rótulo 'seed-dev').
 *
 * Recusa qualquer alvo que não seja o Supabase local: a URL precisa ser 127.0.0.1 ou
 * localhost, e o comando da CLI fixa --local (nunca --linked nem --db-url).
 * Só dados fictícios (RAT-D019). A senha NÃO está no código: use DEV_SEED_PASSWORD no
 * .env.local ou deixe o script gerar uma senha aleatória e exibi-la no final.
 */
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/types/database.types";

const ACCESS_SQL = "scripts/sql/seed-dev-access.sql";

/** Usuários fictícios (domínio reservado example.com). O papel é atribuído na fase 2. */
const USERS = [
  { email: "admin@example.com", fullName: "Administrador Exemplo" },
  { email: "operador@example.com", fullName: "Operador Exemplo" },
  { email: "visualizador@example.com", fullName: "Visualizador Exemplo" },
  { email: "socio@example.com", fullName: "Sócio Exemplo A" },
  { email: "semvinculo@example.com", fullName: "Usuário Sem Vínculo Exemplo" },
] as const;

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Defina ${name} em .env.local (veja .env.example).`);
  return value;
}

const LOCAL_HOSTNAMES = ["127.0.0.1", "localhost"];
function isLocalUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      LOCAL_HOSTNAMES.includes(parsed.hostname)
    );
  } catch {
    return false;
  }
}

const url = env("NEXT_PUBLIC_SUPABASE_URL");
if (!isLocalUrl(url)) {
  throw new Error("seed:dev só roda contra o Supabase local (127.0.0.1 ou localhost).");
}

const generatedPassword = !process.env.DEV_SEED_PASSWORD;
const password = process.env.DEV_SEED_PASSWORD || randomBytes(18).toString("base64url");

const service = createClient<Database>(url, env("SUPABASE_SECRET_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function ensureUser(email: string, fullName: string): Promise<string> {
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (created.data.user?.id) return created.data.user.id;

  if (created.error?.code !== "email_exists") {
    throw new Error(`Criar usuário ${email}: ${created.error?.message}`);
  }
  // Já existe (segunda execução sem db:reset): reaproveita e alinha a senha.
  const list = await service.auth.admin.listUsers({ perPage: 1000 });
  if (list.error) throw new Error(`Listar usuários: ${list.error.message}`);
  const existing = list.data.users.find((user) => user.email === email);
  if (!existing) throw new Error(`Usuário ${email} não encontrado.`);
  const updated = await service.auth.admin.updateUserById(existing.id, { password });
  if (updated.error) throw new Error(`Atualizar senha de ${email}: ${updated.error.message}`);
  return existing.id;
}

/** Fase 2: papéis pelo procedimento auditado. Argumentos fixos; --local sempre. */
function assignRoles(): void {
  const result = spawnSync("npx", ["supabase", "db", "query", "--local", "-f", ACCESS_SQL], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    shell: process.platform === "win32", // npx.cmd no Windows; os argumentos acima são constantes
  });
  if (result.status !== 0) {
    throw new Error(`Atribuição de papéis falhou:\n${result.stdout}\n${result.stderr}`);
  }
}

async function verifyRoles(): Promise<void> {
  const publishableKey = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  for (const { email } of USERS) {
    const client = createClient<Database>(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signIn = await client.auth.signInWithPassword({ email, password });
    if (signIn.error) throw new Error(`Login ${email}: ${signIn.error.message}`);

    const profile = await client
      .from("profiles")
      .select("role, active, partner_id")
      .eq("id", signIn.data.user.id)
      .single();
    if (profile.error) throw new Error(`Perfil ${email}: ${profile.error.message}`);

    const partners = await client.from("partners").select("id");
    if (partners.error) throw new Error(`Sócios ${email}: ${partners.error.message}`);

    console.log(
      `  ${email.padEnd(28)} papel=${String(profile.data.role).padEnd(14)} ` +
        `ativo=${profile.data.active} sócios visíveis=${partners.data.length}`,
    );
    await client.auth.signOut();
  }
}

async function main(): Promise<void> {
  console.log("Fase 1: usuários fictícios (Auth local)");
  for (const { email, fullName } of USERS) {
    await ensureUser(email, fullName);
  }

  console.log("Fase 2: papéis (private.set_user_access, como postgres, com motivo)");
  assignRoles();

  console.log("Verificação pelo RLS (cada usuário lê o próprio perfil e os sócios):");
  await verifyRoles();

  console.log("\nCredenciais de desenvolvimento (somente Supabase local):");
  for (const { email } of USERS) console.log(`  ${email}`);
  console.log(
    generatedPassword
      ? `  senha (gerada nesta execução): ${password}`
      : "  senha: a definida em DEV_SEED_PASSWORD",
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
