/**
 * Detecção de chaves secretas do Supabase em texto que vai para o navegador (CA-12).
 * Lógica pura, sem acesso a disco: o script `check-bundle-secrets.ts` percorre o bundle e usa isto.
 * Nunca devolve o valor encontrado, só a natureza do achado (o resultado pode ir para o log da CI).
 */

export type FindingKind = "valor-conhecido" | "chave-secreta-sb" | "jwt-service-role";

export interface Finding {
  kind: FindingKind;
  /** Para "valor-conhecido": o nome da variável cujo valor apareceu. */
  detail?: string;
}

/** Valores curtos geram falso positivo; abaixo disso não são tratados como segredo. */
const MIN_SECRET_LENGTH = 16;

const SB_SECRET = /sb_secret_[A-Za-z0-9_-]{16,}/;
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;

function jwtRole(payloadBase64Url: string): string | null {
  try {
    const json = Buffer.from(payloadBase64Url, "base64url").toString("utf8");
    const role = (JSON.parse(json) as { role?: unknown }).role;
    return typeof role === "string" ? role : null;
  } catch {
    return null;
  }
}

/**
 * Procura, em `content`, (a) os valores exatos dos segredos conhecidos, (b) qualquer chave
 * `sb_secret_...` e (c) qualquer JWT cujo papel seja `service_role`.
 */
export function findSecrets(content: string, knownSecrets: Record<string, string | undefined> = {}): Finding[] {
  const findings: Finding[] = [];

  for (const [name, value] of Object.entries(knownSecrets)) {
    if (value && value.length >= MIN_SECRET_LENGTH && content.includes(value)) {
      findings.push({ kind: "valor-conhecido", detail: name });
    }
  }
  if (SB_SECRET.test(content)) findings.push({ kind: "chave-secreta-sb" });

  for (const match of content.matchAll(JWT)) {
    if (jwtRole(match[1]) === "service_role") {
      findings.push({ kind: "jwt-service-role" });
      break;
    }
  }
  return findings;
}
