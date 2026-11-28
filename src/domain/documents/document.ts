/**
 * CPF e CNPJ (numérico e alfanumérico): normalização, dígitos verificadores e formatação.
 *
 * ESPELHO do banco (CAD-001, modelagem 3.1 a 3.4): `private.normalize_document`,
 * `private.is_valid_cpf`, `private.is_valid_cnpj` e `private.is_valid_document`. O banco é a
 * autoridade e nunca grava documento inválido; este espelho só existe para dar a mensagem certa
 * antes de enviar. A divergência entre os dois é contida pelos vetores compartilhados (12.3),
 * que rodam no pgTAP (`07_cad_documents.test.sql`) e no Vitest (`document.test.ts`).
 *
 * Funções puras, sem dependência de Next, banco ou navegador.
 */

export type DocumentType = "CPF" | "CNPJ";

/** Tamanho da forma canônica de cada tipo. */
export const CPF_LENGTH = 11;
export const CNPJ_LENGTH = 14;

/**
 * "12.ABC.345/01de-35" -> "12ABC34501DE35"; vazio, nulo ou só formatação -> null.
 *
 * Remove só espaços, pontos, barras e hífens e põe as letras ASCII em maiúsculas. Qualquer outro
 * caractere (acento, vírgula, símbolo) permanece, e o documento é recusado por `isValidDocument`
 * em vez de ser descartado em silêncio (modelagem 3.1).
 */
export function normalizeDocument(value: string | null | undefined): string | null {
  const stripped = (value ?? "").replace(/[\s./-]/g, "");
  if (stripped === "") return null;
  return stripped.replace(/[a-z]/g, (letter) => letter.toUpperCase());
}

/** CPF canônico (11 dígitos): módulo 11, pesos 10..2 e 11..2; recusa os 11 dígitos iguais. */
export function isValidCpf(canonical: string | null | undefined): boolean {
  if (canonical == null || !/^[0-9]{11}$/.test(canonical)) return false;
  if (canonical === canonical[0].repeat(CPF_LENGTH)) return false;

  const digits = Array.from(canonical, Number);
  const check = (length: number): number => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += digits[i] * (length + 1 - i);
    const dv = (sum * 10) % 11;
    return dv === 10 ? 0 : dv;
  };
  return check(9) === digits[9] && check(10) === digits[10];
}

const CNPJ_WEIGHTS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;
const CNPJ_WEIGHTS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;

/**
 * CNPJ canônico, numérico ou alfanumérico (`^[0-9A-Z]{12}[0-9]{2}$`). O valor de cada caractere
 * é o código ASCII menos 48 (0..9 valem eles mesmos; A = 17 ... Z = 42); o cálculo novo também
 * valida o CNPJ numérico. Recusa os 14 caracteres iguais.
 */
export function isValidCnpj(canonical: string | null | undefined): boolean {
  if (canonical == null || !/^[0-9A-Z]{12}[0-9]{2}$/.test(canonical)) return false;
  if (canonical === canonical[0].repeat(CNPJ_LENGTH)) return false;

  const values = Array.from(canonical, (char) => char.charCodeAt(0) - 48);
  const check = (weights: readonly number[]): number => {
    let sum = 0;
    for (let i = 0; i < weights.length; i += 1) sum += values[i] * weights[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return check(CNPJ_WEIGHTS_1) === values[12] && check(CNPJ_WEIGHTS_2) === values[13];
}

/** Espera o documento já canônico (`normalizeDocument`). 11 caracteres = CPF; 14 = CNPJ. */
export function isValidDocument(canonical: string | null | undefined): boolean {
  if (canonical == null) return false;
  if (canonical.length === CPF_LENGTH) return isValidCpf(canonical);
  if (canonical.length === CNPJ_LENGTH) return isValidCnpj(canonical);
  return false;
}

/**
 * Tipo deduzido do documento canônico (plano R-C02b): 11 caracteres = CPF, 14 = CNPJ, outro
 * tamanho ou vazio = nenhum. Não confere os dígitos verificadores.
 */
export function documentTypeOf(canonical: string | null | undefined): DocumentType | null {
  if (canonical == null) return null;
  if (canonical.length === CPF_LENGTH) return "CPF";
  if (canonical.length === CNPJ_LENGTH) return "CNPJ";
  return null;
}

// ---------------------------------------------------------------------------------------------
// Formatação para exibição
// ---------------------------------------------------------------------------------------------

/** "00000000191" -> "000.000.001-91". Fora do formato, devolve o texto como veio. */
export function formatCpf(canonical: string): string {
  const match = /^(\d{3})(\d{3})(\d{3})(\d{2})$/.exec(canonical);
  return match ? `${match[1]}.${match[2]}.${match[3]}-${match[4]}` : canonical;
}

/** "12ABC34501DE35" -> "12.ABC.345/01DE-35"; "99999999000191" -> "99.999.999/0001-91". */
export function formatCnpj(canonical: string): string {
  const match = /^([0-9A-Z]{2})([0-9A-Z]{3})([0-9A-Z]{3})([0-9A-Z]{4})(\d{2})$/.exec(canonical);
  return match ? `${match[1]}.${match[2]}.${match[3]}/${match[4]}-${match[5]}` : canonical;
}

/** Formata pelo tamanho (11 = CPF, 14 = CNPJ). Documento nulo ou de outro tamanho: devolve como veio ("" se nulo). */
export function formatDocument(canonical: string | null | undefined): string {
  if (canonical == null) return "";
  if (canonical.length === CPF_LENGTH) return formatCpf(canonical);
  if (canonical.length === CNPJ_LENGTH) return formatCnpj(canonical);
  return canonical;
}

/** "CPF 000.000.001-91" / "CNPJ 12.ABC.345/01DE-35"; sem documento, "Sem documento" (UI 4.2). */
export function describeDocument(canonical: string | null | undefined): string {
  const type = documentTypeOf(canonical);
  if (type === null || canonical == null) return "Sem documento";
  return `${type} ${formatDocument(canonical)}`;
}

// ---------------------------------------------------------------------------------------------
// Validação de entrada para a mensagem do campo (UI 4.1.2)
// ---------------------------------------------------------------------------------------------

export const DOCUMENT_MESSAGES = {
  cpfIncomplete: "O CPF precisa ter 11 números.",
  cpfInvalid: "CPF inválido. Confira os números.",
  cnpjIncomplete: "O CNPJ precisa ter 14 caracteres, entre números e letras.",
  cnpjInvalid: "CNPJ inválido. Confira os números e as letras.",
  unknownLength: "Informe um CPF (11 números) ou um CNPJ (14 caracteres).",
} as const;

export type DocumentInputResult =
  /** `canonical` é null quando o campo está vazio (cliente sem documento). */
  | { ok: true; canonical: string | null; type: DocumentType | null }
  | { ok: false; reason: "INCOMPLETE" | "INVALID"; type: DocumentType | null; message: string };

/**
 * Valida o texto digitado de um documento opcional.
 *
 * - Vazio ou só formatação: válido, sem documento.
 * - `expected` é o tipo escolhido na tela (rádio "CPF" ou "CNPJ"); sem ele, o tipo vem do tamanho.
 * - Mensagens exatas da UI 4.1.2. Só serve para a tela: o banco repete a conferência.
 */
export function parseDocumentInput(raw: string | null | undefined, expected?: DocumentType): DocumentInputResult {
  const canonical = normalizeDocument(raw);
  if (canonical === null) return { ok: true, canonical: null, type: null };

  const type = expected ?? documentTypeOf(canonical);
  if (type === null) {
    return { ok: false, reason: "INCOMPLETE", type: null, message: DOCUMENT_MESSAGES.unknownLength };
  }

  if (type === "CPF") {
    if (!/^[0-9]{11}$/.test(canonical)) {
      return { ok: false, reason: "INCOMPLETE", type, message: DOCUMENT_MESSAGES.cpfIncomplete };
    }
    return isValidCpf(canonical)
      ? { ok: true, canonical, type }
      : { ok: false, reason: "INVALID", type, message: DOCUMENT_MESSAGES.cpfInvalid };
  }

  if (canonical.length !== CNPJ_LENGTH) {
    return { ok: false, reason: "INCOMPLETE", type, message: DOCUMENT_MESSAGES.cnpjIncomplete };
  }
  return isValidCnpj(canonical)
    ? { ok: true, canonical, type }
    : { ok: false, reason: "INVALID", type, message: DOCUMENT_MESSAGES.cnpjInvalid };
}
