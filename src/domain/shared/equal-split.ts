import { apportion, tieBreakOrder } from "./apportion";
import { cents, type Cents } from "./money";
import { FULL_PERCENT, percentUnits, type PercentUnits } from "./percentage";

/**
 * Divisão igual 1/n entre os sócios indicados no cliente (RAT-D015).
 *
 * Não existem percentuais armazenados: a regra é sempre 1/n. O valor é
 * dividido pela FRAÇÃO EXATA (pesos inteiros iguais), nunca a partir de um
 * percentual já arredondado (plano 7.3). O centavo residual é distribuído por
 * maior resto, com desempate determinístico por uma chave estável (por
 * exemplo, o id do recebimento), de modo que a sobra não favoreça sempre o
 * mesmo sócio ao longo dos recebimentos.
 *
 * Esta primitiva não conhece interface, banco nem os módulos antigos.
 */

function assertValidKeys(keys: readonly string[]): void {
  if (keys.length === 0) {
    throw new RangeError("Divisão igual exige ao menos um sócio.");
  }
  if (new Set(keys).size !== keys.length) {
    throw new RangeError("Divisão igual não aceita sócios repetidos.");
  }
}

/**
 * Divide `total` (centavos, inteiro não negativo) igualmente entre `keys`.
 *
 * - A soma das parcelas é exatamente `total`.
 * - As parcelas diferem no máximo 1 centavo.
 * - Os `total mod n` centavos residuais vão para as primeiras chaves na ordem
 *   de desempate derivada de `tieBreakKey`. O resultado independe da ordem em
 *   que `keys` é informada; o `Map` devolvido segue a ordem de `keys`.
 */
export function splitEqually(
  total: Cents,
  keys: readonly string[],
  tieBreakKey: string,
): Map<string, Cents> {
  assertValidKeys(keys);
  const shares = apportion(
    total,
    keys.map((key) => ({ key, weight: 1 })),
    tieBreakOrder(keys, tieBreakKey),
  );
  return new Map(keys.map((key) => [key, cents(shares.get(key) as number)]));
}

/**
 * Percentuais de EXIBIÇÃO 1/n, em unidades de 0,0001%, somando exatamente
 * 100% (1_000_000 unidades). 2 sócios -> 50% cada; 3 -> 33,3334% / 33,3333% /
 * 33,3333%; 4 -> 25% cada. São apenas para mostrar: o valor monetário nunca é
 * calculado a partir deles (use `splitEqually`).
 *
 * A unidade residual segue a mesma regra de desempate; sem `tieBreakKey`,
 * vale a ordem de `keys`.
 */
export function equalDisplayPercentages(
  keys: readonly string[],
  tieBreakKey?: string,
): Map<string, PercentUnits> {
  assertValidKeys(keys);
  const shares = apportion(
    FULL_PERCENT,
    keys.map((key) => ({ key, weight: 1 })),
    tieBreakOrder(keys, tieBreakKey),
  );
  return new Map(keys.map((key) => [key, percentUnits(shares.get(key) as number)]));
}
