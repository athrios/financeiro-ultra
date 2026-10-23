/**
 * Rateio inteiro pelo método do maior resto (Hamilton).
 *
 * Reparte `total` unidades inteiras proporcionalmente a pesos inteiros:
 *   - cada parte recebe o piso da sua cota exata;
 *   - as unidades que sobram vão, uma a uma, para os maiores restos;
 *   - empates de resto seguem `tieBreakOrder`.
 *
 * Garantias: a soma das partes é exatamente `total`, e nenhuma parte se
 * afasta mais de 1 unidade da cota exata. Usa BigInt no produto
 * total × peso para não estourar a faixa de inteiros seguros.
 */
export interface WeightedItem {
  key: string;
  weight: number;
}

export function apportion(
  total: number,
  items: readonly WeightedItem[],
  tieBreakOrder: readonly string[],
): Map<string, number> {
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new RangeError(`Total do rateio deve ser inteiro não negativo: ${total}`);
  }
  if (items.length === 0) {
    throw new RangeError("Rateio sem itens.");
  }

  const totalWeight = items.reduce((sum, item) => {
    if (!Number.isSafeInteger(item.weight) || item.weight < 0) {
      throw new RangeError(`Peso inválido para ${item.key}: ${item.weight}`);
    }
    return sum + BigInt(item.weight);
  }, BigInt(0));

  if (totalWeight === BigInt(0)) {
    throw new RangeError("A soma dos pesos do rateio é zero.");
  }

  const tieRank = new Map(tieBreakOrder.map((key, index) => [key, index]));
  const bigTotal = BigInt(total);

  const quotas = items.map((item) => {
    const numerator = bigTotal * BigInt(item.weight);
    return {
      key: item.key,
      floor: numerator / totalWeight,
      remainder: numerator % totalWeight,
    };
  });

  const assigned = quotas.reduce((sum, quota) => sum + quota.floor, BigInt(0));
  let leftover = Number(bigTotal - assigned);

  const byPriority = [...quotas].sort((a, b) => {
    if (a.remainder !== b.remainder) {
      return a.remainder > b.remainder ? -1 : 1;
    }
    return (tieRank.get(a.key) ?? Infinity) - (tieRank.get(b.key) ?? Infinity);
  });

  const result = new Map<string, number>();
  for (const quota of byPriority) {
    const extra = leftover > 0 ? 1 : 0;
    leftover -= extra;
    result.set(quota.key, Number(quota.floor) + extra);
  }
  return result;
}

/**
 * Ordem de desempate determinística.
 * Sem `seed`, mantém a ordem recebida. Com `seed` (ex.: id do recebimento),
 * embaralha de forma reprodutível, para que sobras de arredondamento não
 * favoreçam sistematicamente o mesmo sócio ao longo dos recebimentos.
 */
export function tieBreakOrder(keys: readonly string[], seed?: string): string[] {
  if (seed === undefined) {
    return [...keys];
  }
  return [...keys].sort((a, b) => {
    const hashA = fnv1a(`${seed}:${a}`);
    const hashB = fnv1a(`${seed}:${b}`);
    return hashA !== hashB ? hashA - hashB : a.localeCompare(b);
  });
}

/** FNV-1a 32 bits: hash simples e estável (não criptográfico). */
function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}
