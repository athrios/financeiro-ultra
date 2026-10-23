/**
 * CA-12: confirma que nenhuma chave secreta do Supabase foi parar no bundle do navegador.
 *
 *   npm run check:bundle                       # confere .next/static
 *   npx tsx scripts/check-bundle-secrets.ts <pasta>
 *
 * Usa os valores presentes no ambiente (SUPABASE_SECRET_KEY, E2E_SUPABASE_SECRET_KEY,
 * SUPABASE_SERVICE_ROLE_KEY, E2E_SERVICE_ROLE_KEY) e também padrões (sb_secret_..., JWT
 * service_role). Falha se achar algo ou se não houver arquivo para conferir. Nunca imprime o valor.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { findSecrets } from "./lib/bundle-secrets";

const KNOWN = ["SUPABASE_SECRET_KEY", "E2E_SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "E2E_SERVICE_ROLE_KEY"];

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

const target = process.argv[2] ?? ".next/static";
const known = Object.fromEntries(KNOWN.map((name) => [name, process.env[name]]));

let scanned = 0;
const problems: string[] = [];
try {
  for (const file of walk(target)) {
    scanned += 1;
    const content = readFileSync(file, "utf8");
    for (const finding of findSecrets(content, known)) {
      problems.push(`${file}: ${finding.kind}${finding.detail ? ` (${finding.detail})` : ""}`);
    }
  }
} catch (error) {
  console.error(`Não consegui ler ${target}: ${(error as Error).message}. Rode npm run build antes.`);
  process.exit(2);
}

if (scanned === 0) {
  console.error(`Nenhum arquivo em ${target}: a checagem não conferiu nada.`);
  process.exit(2);
}
if (problems.length > 0) {
  console.error(`CA-12 FALHOU: segredo no bundle do navegador (${problems.length} achado(s)).`);
  for (const line of problems) console.error(` - ${line}`);
  process.exit(1);
}
const configured = KNOWN.filter((name) => (process.env[name] ?? "").length >= 16);
console.log(`CA-12 ok: ${scanned} arquivos em ${target} sem chave secreta (valores conferidos: ${configured.join(", ") || "nenhum no ambiente; só padrões"}).`);
