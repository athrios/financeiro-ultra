/**
 * Chaves de comparação dos identificadores do recebedor (espelho APROXIMADO do banco): servem à
 * mensagem imediata da tela e à contagem do teto de itens (RAT-D026). A normalização e a unicidade de
 * verdade são do banco (`private.normalize_receiver_identifier`).
 *
 * Fica num arquivo próprio para o esquema (`schemas.ts`) e a lógica de tela (`receiver-identifiers.ts`)
 * usarem as mesmas funções sem importar um ao outro. Sem Next, sem React, sem banco.
 */

import { normalizeAlias } from "./text";

export interface AccountValue {
  bankName: string;
  branch: string;
  accountNumber: string;
}

/** Separadores aceitos em agência e conta (D-IMPL-04): espaço, ponto, hífen e barra. */
export function squeezeAccountText(value: string): string {
  return value.replace(/[\s./-]/g, "").toUpperCase();
}

/**
 * Espelho de `normalize_receiver_identifier` para `PIX_KEY`: com "@" só minúsculas e espaços das
 * pontas; sem "@" tira espaço, ponto, barra, parênteses e hífen (CPF, CNPJ e telefone com máscara
 * comparam iguais).
 */
export function normalizePixKey(value: string): string {
  if (value.includes("@")) return value.trim().toLowerCase();
  return value.toLowerCase().replace(/[\s./()-]/g, "");
}

function withoutLeadingZeros(value: string): string {
  return value.replace(/^0+/, "") || "0";
}

/** Comparação de contas (espelho de "banco|agência|conta" do banco): sem acento, separadores nem zeros à esquerda. */
export function accountKey(account: AccountValue): string {
  return [
    normalizeAlias(account.bankName),
    withoutLeadingZeros(squeezeAccountText(account.branch)),
    withoutLeadingZeros(squeezeAccountText(account.accountNumber)),
  ].join("|");
}

/** Quantos valores DISTINTOS há, pela chave dada; chave vazia não conta (o banco recusa o item). */
export function countDistinctKeys<T>(values: Iterable<T>, keyOf: (value: T) => string): number {
  const keys = new Set<string>();
  for (const value of values) {
    const key = keyOf(value);
    if (key !== "") keys.add(key);
  }
  return keys.size;
}
