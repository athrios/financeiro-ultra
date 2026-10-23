import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { USERS, type UserKey } from "./env";

const ROLES = ["ADMINISTRATOR", "OPERATOR", "VIEWER", "PARTNER"] as const;
type Role = (typeof ROLES)[number];

/**
 * Altera o acesso de um usuário FICTÍCIO do seed pelo procedimento auditado
 * `private.set_user_access`, que só o papel postgres executa (por isso a CLI do Supabase, como
 * faz o `seed:dev`). Sempre contra o Supabase local (`--local`). Entradas fixas e enumeradas:
 * nada vindo de fora entra no SQL.
 */
export function setUserAccess(user: UserKey, role: Role, active: boolean): void {
  if (!ROLES.includes(role)) throw new Error("Papel inválido.");
  const dir = mkdtempSync(join(tmpdir(), "financeiro-ultra-e2e-"));
  const file = join(dir, "acesso.sql");
  try {
    writeFileSync(
      file,
      `select private.set_user_access('${USERS[user]}', '${role}', null, ${active ? "true" : "false"}, null, 'e2e');\n`,
    );
    const result = spawnSync("npx", ["supabase", "db", "query", "--local", "-f", file], {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      shell: process.platform === "win32", // npx.cmd no Windows; os argumentos são constantes
    });
    if (result.status !== 0) {
      throw new Error(`Não consegui alterar o acesso de ${USERS[user]}:\n${result.stdout}\n${result.stderr}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
