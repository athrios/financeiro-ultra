/**
 * Texto da divisão 1/n entre os sócios do cliente (RAT-D015, plano R-C12, UI 4.1.4 e 4.2).
 *
 * É só INFORMAÇÃO calculada a partir da contagem: nenhum percentual é gravado, e nenhum valor em
 * reais por sócio aparece aqui (o centavo de ajuste é do rateio, outra feature). Sem float: o
 * percentual é calculado em centésimos, com inteiros.
 */

/** 100/n em centésimos de ponto percentual, arredondado, e se a conta é exata. */
function percentHundredths(count: number): { hundredths: number; exact: boolean } {
  const exact = 10000 % count === 0;
  // arredondamento "metade para cima" só com inteiros: floor((2 * 10000 + n) / (2n))
  const hundredths = Math.floor((20000 + count) / (2 * count));
  return { hundredths, exact };
}

/** 5000 -> "50"; 3333 -> "33,33"; 1250 -> "12,5". */
function formatHundredths(hundredths: number): string {
  const integerPart = Math.floor(hundredths / 100);
  const fraction = String(hundredths % 100)
    .padStart(2, "0")
    .replace(/0+$/, "");
  return fraction ? `${integerPart},${fraction}` : String(integerPart);
}

/** Percentual de cada sócio na divisão igual: "50%", "≈ 33,33%", "12,5%". Contagem inválida: "". */
export function equalSharePercent(count: number): string {
  if (!Number.isInteger(count) || count < 1) return "";
  const { hundredths, exact } = percentHundredths(count);
  return `${exact ? "" : "≈ "}${formatHundredths(hundredths)}%`;
}

/**
 * Prévia da divisão (texto exato da UI 4.1.4):
 * 0 -> "Nenhum sócio escolhido." · 1 -> "1 sócio · divisão: 1/1 (100%)" ·
 * 3 -> "3 sócios · divisão igual: 1/3 para cada um (≈ 33,33%)".
 */
export function describeEqualDivision(count: number): string {
  if (!Number.isInteger(count) || count <= 0) return "Nenhum sócio escolhido.";
  if (count === 1) return "1 sócio · divisão: 1/1 (100%)";
  return `${count} sócios · divisão igual: 1/${count} para cada um (${equalSharePercent(count)})`;
}
