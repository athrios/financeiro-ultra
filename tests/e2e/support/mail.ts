import { e2eEnv } from "./env";

/** E-mails do Supabase local (Mailpit). Nada é enviado de verdade; a API só lê o que o Auth local gerou. */

interface MailSummary {
  ID: string;
  Subject: string;
  Created: string;
  To: Array<{ Address: string }>;
}

export interface MailMessage {
  subject: string;
  html: string;
  text: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function mailJson<T>(path: string): Promise<T | null> {
  const response = await fetch(`${e2eEnv().mailpitUrl}${path}`, { signal: AbortSignal.timeout(5000) });
  return response.ok ? ((await response.json()) as T) : null;
}

/** Espera chegar um e-mail para `to` criado depois de `since`. Devolve null se não chegar. */
export async function waitForMail(to: string, since: Date, timeoutMs = 10_000): Promise<MailMessage | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = await mailJson<{ messages?: MailSummary[] }>("/api/v1/messages?limit=50");
    const found = (list?.messages ?? []).find(
      (message) => message.To.some((recipient) => recipient.Address === to) && new Date(message.Created) >= since,
    );
    if (found) {
      const full = await mailJson<{ Subject: string; HTML?: string; Text?: string }>(`/api/v1/message/${found.ID}`);
      if (full) return { subject: full.Subject, html: full.HTML ?? "", text: full.Text ?? "" };
    }
    await sleep(400);
  }
  return null;
}

/** Garante que NENHUM e-mail para `to` chegou depois de `since` (espera um pouco antes de concluir). */
export async function noMailFor(to: string, since: Date, waitMs = 2000): Promise<boolean> {
  await sleep(waitMs);
  const list = await mailJson<{ messages?: MailSummary[] }>("/api/v1/messages?limit=50");
  return !(list?.messages ?? []).some(
    (message) => message.To.some((recipient) => recipient.Address === to) && new Date(message.Created) >= since,
  );
}

/** Extrai o link de /auth/confirm do e-mail (caminho + consulta, sem o domínio). */
export function confirmLinkFrom(message: MailMessage): { path: string; type: string } | null {
  const match = /https?:\/\/[^\s"'<>]*\/auth\/confirm\?token_hash=[A-Za-z0-9_-]+&(?:amp;)?type=(invite|recovery)/.exec(
    `${message.html} ${message.text}`,
  );
  if (!match) return null;
  const url = new URL(match[0].replace(/&amp;/g, "&"));
  return { path: `${url.pathname}${url.search}`, type: match[1] };
}
