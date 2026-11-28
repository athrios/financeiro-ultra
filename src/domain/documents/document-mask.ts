/**
 * Máscaras de digitação de CPF e CNPJ (UI 4.1.2). Só mexem no TEXTO do campo; a conferência dos
 * dígitos é de `document.ts` e do banco. Funções puras, sem Next nem React.
 *
 *  - CPF `000.000.000-00`: só números, até 11.
 *  - CNPJ `AA.AAA.AAA/AAAA-00`: nas 12 primeiras posições aceita letras (A a Z) e números; nas 2
 *    últimas (dígitos verificadores), só números. Minúsculas viram maiúsculas. Até 14 posições.
 *
 * Colar com ou sem pontuação funciona: o texto é reduzido aos caracteres válidos e a máscara é
 * reaplicada. O que não é válido numa posição é descartado (a tela nunca corta um número em silêncio
 * por troca de tipo: trocar de tipo esvazia o campo).
 */

import { CNPJ_LENGTH, CPF_LENGTH, type DocumentType } from "./document";

/** Aplica a máscara dada por tamanhos de grupo e separadores entre eles. */
function applyGroups(chars: string, groups: readonly number[], separators: readonly string[]): string {
  let result = "";
  let position = 0;
  for (let group = 0; group < groups.length; group += 1) {
    const part = chars.slice(position, position + groups[group]);
    if (part === "") break;
    if (group > 0) result += separators[group - 1];
    result += part;
    position += groups[group];
  }
  return result;
}

/** "00000000434" ou "000.000.004-34" ou "abc123" -> "000.000.004-34" (parcial enquanto digita). */
export function maskCpf(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "").slice(0, CPF_LENGTH);
  return applyGroups(digits, [3, 3, 3, 2], [".", ".", "-"]);
}

/** Só os caracteres que o CNPJ aceita em cada posição (letras e números nas 12 primeiras; números nas 2 últimas). */
function cnpjChars(raw: string | null | undefined): string {
  const upper = (raw ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  let result = "";
  for (const char of upper) {
    if (result.length >= CNPJ_LENGTH) break;
    const isCheckDigitPosition = result.length >= CNPJ_LENGTH - 2;
    if (isCheckDigitPosition && !/[0-9]/.test(char)) continue;
    result += char;
  }
  return result;
}

/** "12abc34501de35" -> "12.ABC.345/01DE-35" (parcial enquanto digita). */
export function maskCnpj(raw: string | null | undefined): string {
  return applyGroups(cnpjChars(raw), [2, 3, 3, 4, 2], [".", ".", "/", "-"]);
}

/** Máscara do tipo escolhido na tela. */
export function maskDocument(type: DocumentType, raw: string | null | undefined): string {
  return type === "CPF" ? maskCpf(raw) : maskCnpj(raw);
}

/** Exemplo do campo (UI 4.1.2): nunca no lugar do rótulo. */
export const DOCUMENT_PLACEHOLDERS: Readonly<Record<DocumentType, string>> = {
  CPF: "000.000.000-00",
  CNPJ: "00.000.000/0001-00",
};
