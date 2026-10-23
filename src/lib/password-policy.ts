/**
 * Política de senha (03-ui-ux.md, 2.5.2 e 9.4). PROPOSTA do desenvolvedor, a confirmar pela
 * `seguranca`: o Brain e o plano não fixam o valor.
 *
 * Linha adotada (NIST SP 800-63B): comprimento mínimo, aceita frases longas e colagem do
 * gerenciador de senhas, SEM exigir combinações arbitrárias de caracteres. O máximo de 72 é
 * o limite do bcrypt usado pelo Supabase Auth (contado em bytes).
 *
 * A mesma regra vale no navegador (lista de requisitos) e no servidor (Server Action). O
 * `minimum_password_length` do Auth deve ser igual (config.toml local; painel/`config push`
 * no ambiente hospedado, checklist da E8).
 */

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_BYTES = 72;

export interface PasswordRule {
  id: "min-length" | "max-length" | "not-blank";
  label: string;
  met: boolean;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function evaluatePassword(password: string): PasswordRule[] {
  return [
    {
      id: "min-length",
      label: `Pelo menos ${PASSWORD_MIN_LENGTH} caracteres`,
      met: Array.from(password).length >= PASSWORD_MIN_LENGTH,
    },
    {
      id: "max-length",
      label: `No máximo ${PASSWORD_MAX_BYTES} caracteres`,
      met: byteLength(password) <= PASSWORD_MAX_BYTES,
    },
    {
      id: "not-blank",
      label: "Não pode ser formada só por espaços",
      met: password.trim() !== "",
    },
  ];
}

export function isPasswordValid(password: string): boolean {
  return evaluatePassword(password).every((rule) => rule.met);
}
