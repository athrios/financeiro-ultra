/**
 * Espelho aproximado de `private.normalize_alias` (banco): minúsculas, sem acento, tudo que não é
 * letra ou número vira espaço, espaços colapsados e aparados.
 *
 * Serve SÓ para filtrar listas curtas na própria aplicação (ex.: "Buscar sócio" por nome ou
 * apelido). A autoridade é o banco: unicidade e comparações de cadastro nunca usam esta função.
 * Difere do banco apenas em letras fora da tabela de acentos dele (aqui o NFD as reduz à letra base).
 */
export function normalizeAlias(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** O PostgreSQL não guarda o caractere NUL (`\u0000`) em `text` nem em `jsonb`. */
export const NUL_CHAR = "\u0000";

export function hasNul(value: string | null | undefined): boolean {
  return (value ?? "").includes(NUL_CHAR);
}

/** Tira os NUL de um texto de busca (a busca não grava nada: removê-los basta). */
export function stripNul(value: string): string {
  return value.split(NUL_CHAR).join("");
}
