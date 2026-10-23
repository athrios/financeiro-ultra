import { describe, expect, it } from "vitest";

import { apportion, tieBreakOrder } from "./apportion";
import { equalDisplayPercentages, splitEqually } from "./equal-split";
import { cents, parseMoney, sumCents, toMoneyString, type Cents } from "./money";
import { FULL_PERCENT, toPercentageString } from "./percentage";

const SOCIOS = ["alice", "bruno", "clara", "diana", "elisa", "fabio"];

const values = <T>(map: Map<string, T>) => [...map.values()];
const texts = (map: Map<string, Cents>) => values(map).map(toMoneyString);

/** Gerador pseudoaleatório determinístico (mulberry32): semente fixa, sem dependências. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("equalDisplayPercentages (exibição 1/n)", () => {
  it("2 sócios -> 50% cada", () => {
    const result = equalDisplayPercentages(["alice", "bruno"]);
    expect(values(result).map(toPercentageString)).toEqual(["50.0000", "50.0000"]);
  });

  it("3 sócios -> 33,33...% somando exatamente 100%", () => {
    const result = equalDisplayPercentages(["alice", "bruno", "clara"]);
    expect(values(result).map(toPercentageString)).toEqual(["33.3334", "33.3333", "33.3333"]);
    expect(values(result).reduce((sum, value) => sum + value, 0)).toBe(FULL_PERCENT);
  });

  it("4 sócios -> 25% cada", () => {
    const result = equalDisplayPercentages(["alice", "bruno", "clara", "diana"]);
    expect(values(result).map(toPercentageString)).toEqual(["25.0000", "25.0000", "25.0000", "25.0000"]);
  });

  it("soma exatamente 100% e difere no máximo 1 unidade para qualquer n de 1 a 60", () => {
    for (let n = 1; n <= 60; n++) {
      const keys = Array.from({ length: n }, (_, index) => `s${index}`);
      const units = values(equalDisplayPercentages(keys, "rec-1"));
      expect(units.reduce((sum, value) => sum + value, 0)).toBe(FULL_PERCENT);
      expect(Math.max(...units) - Math.min(...units)).toBeLessThanOrEqual(1);
    }
  });
});

describe("splitEqually (valor pela fração exata)", () => {
  it("R$ 1.000,00 / 3 = 333,34 + 333,33 + 333,33", () => {
    const result = splitEqually(parseMoney("1000.00"), ["alice", "bruno", "clara"], "rec-1");
    expect(texts(result).sort()).toEqual(["333.33", "333.33", "333.34"]);
    expect(sumCents(values(result))).toBe(parseMoney("1000.00"));
  });

  it("R$ 1.000,00 / 2 e / 4 não deixam resíduo", () => {
    expect(texts(splitEqually(parseMoney("1000.00"), ["alice", "bruno"], "rec-1"))).toEqual(["500.00", "500.00"]);
    expect(texts(splitEqually(parseMoney("1000.00"), SOCIOS.slice(0, 4), "rec-1"))).toEqual([
      "250.00",
      "250.00",
      "250.00",
      "250.00",
    ]);
  });

  it("valor alto: R$ 100.000,00 / 3 difere no máximo 1 centavo (o rateio por percentual arredondado falhava aqui)", () => {
    const result = splitEqually(parseMoney("100000.00"), ["alice", "bruno", "clara"], "rec-1");
    const parts = values(result);
    expect(texts(result).sort()).toEqual(["33333.33", "33333.33", "33333.34"]);
    expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
    expect(sumCents(parts)).toBe(parseMoney("100000.00"));
  });

  it("R$ 20.000,00 / 3 também fecha em 6.666,67 + 6.666,67 + 6.666,66", () => {
    const result = splitEqually(parseMoney("20000.00"), ["alice", "bruno", "clara"], "rec-1");
    expect(texts(result).sort()).toEqual(["6666.66", "6666.67", "6666.67"]);
  });

  it("R$ 0,01 / 3: um único sócio recebe o centavo", () => {
    const result = splitEqually(parseMoney("0.01"), ["alice", "bruno", "clara"], "rec-1");
    expect(values(result).sort()).toEqual([0, 0, 1]);
    expect(sumCents(values(result))).toBe(1);
  });

  it("valor zero resulta em parcelas zero", () => {
    expect(values(splitEqually(cents(0), ["alice", "bruno"], "rec-1"))).toEqual([0, 0]);
  });

  it("um único sócio recebe tudo", () => {
    expect(values(splitEqually(parseMoney("123.45"), ["alice"], "rec-1"))).toEqual([12345]);
  });

  it("é determinístico e independe da ordem em que os sócios são informados", () => {
    const total = parseMoney("1000.01");
    const a = splitEqually(total, ["alice", "bruno", "clara"], "rec-42");
    const b = splitEqually(total, ["alice", "bruno", "clara"], "rec-42");
    const c = splitEqually(total, ["clara", "alice", "bruno"], "rec-42");
    expect([...b]).toEqual([...a]);
    for (const [key, share] of a) {
      expect(c.get(key)).toBe(share);
    }
  });

  it("o Map devolvido segue a ordem dos sócios informados", () => {
    const result = splitEqually(parseMoney("10.00"), ["clara", "alice", "bruno"], "rec-1");
    expect([...result.keys()]).toEqual(["clara", "alice", "bruno"]);
  });

  it("o centavo residual varia entre recebimentos diferentes", () => {
    const keys = ["alice", "bruno", "clara"];
    const total = parseMoney("1000.00"); // 100000 centavos: sobra 1 centavo
    const winners = new Map<string, number>();
    for (let index = 1; index <= 300; index++) {
      const result = splitEqually(total, keys, `recebimento-${index}`);
      const winner = [...result].filter(([, share]) => share === 33334);
      expect(winner).toHaveLength(1);
      winners.set(winner[0][0], (winners.get(winner[0][0]) ?? 0) + 1);
    }
    expect(winners.size).toBe(3);
    for (const count of winners.values()) {
      expect(count).toBeGreaterThan(40); // distribuição razoavelmente equilibrada (esperado: 100)
    }
  });

  it("casos aleatórios (semente fixa): soma exata e diferença máxima de 1 centavo", () => {
    const random = mulberry32(20261022);
    for (let caso = 0; caso < 2000; caso++) {
      const n = 1 + Math.floor(random() * SOCIOS.length);
      // até numeric(14,2): 99.999.999.999.999 centavos
      const magnitude = Math.floor(random() * 15);
      const total = cents(Math.floor(random() * Math.min(10 ** magnitude, 99_999_999_999_999)));
      const keys = SOCIOS.slice(0, n);
      const parts = values(splitEqually(total, keys, `rec-${caso}`));

      expect(parts).toHaveLength(n);
      expect(parts.reduce((sum, part) => sum + part, 0)).toBe(total);
      expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
      for (const part of parts) {
        expect(part).toBeGreaterThanOrEqual(Math.floor(total / n));
        expect(part).toBeLessThanOrEqual(Math.ceil(total / n));
      }
    }
  });

  it("rejeita entradas inválidas", () => {
    expect(() => splitEqually(parseMoney("10.00"), [], "rec-1")).toThrow(/ao menos um sócio/);
    expect(() => splitEqually(parseMoney("10.00"), ["alice", "alice"], "rec-1")).toThrow(/repetidos/);
    expect(() => splitEqually(cents(-1), ["alice"], "rec-1")).toThrow(RangeError);
    expect(() => equalDisplayPercentages([])).toThrow(/ao menos um sócio/);
  });
});

describe("apportion (maior resto, em shared)", () => {
  it("reparte pelo maior resto com soma exata", () => {
    const result = apportion(
      100,
      [
        { key: "a", weight: 1 },
        { key: "b", weight: 1 },
        { key: "c", weight: 1 },
      ],
      ["a", "b", "c"],
    );
    expect([...result.values()].reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(result.get("a")).toBe(34);
    expect(result.get("b")).toBe(33);
    expect(result.get("c")).toBe(33);
  });

  it("a ordem de desempate com semente é determinística e usa todas as chaves", () => {
    const keys = ["a", "b", "c", "d"];
    expect(tieBreakOrder(keys, "recebimento-1")).toEqual(tieBreakOrder(keys, "recebimento-1"));
    expect([...tieBreakOrder(keys, "recebimento-1")].sort()).toEqual(keys);
    expect(tieBreakOrder(keys)).toEqual(keys);
  });

  it("rejeita entradas inválidas", () => {
    expect(() => apportion(-1, [{ key: "a", weight: 1 }], ["a"])).toThrow(RangeError);
    expect(() => apportion(10, [], [])).toThrow(RangeError);
    expect(() => apportion(10, [{ key: "a", weight: 0 }], ["a"])).toThrow(RangeError);
  });
});
