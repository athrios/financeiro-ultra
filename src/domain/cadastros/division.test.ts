import { describe, expect, it } from "vitest";

import { describeEqualDivision, equalSharePercent } from "./division";
import { normalizeAlias } from "./text";

describe("describeEqualDivision (UI 4.1.4)", () => {
  it.each([
    [0, "Nenhum sócio escolhido."],
    [1, "1 sócio · divisão: 1/1 (100%)"],
    [2, "2 sócios · divisão igual: 1/2 para cada um (50%)"],
    [3, "3 sócios · divisão igual: 1/3 para cada um (≈ 33,33%)"],
    [4, "4 sócios · divisão igual: 1/4 para cada um (25%)"],
    [5, "5 sócios · divisão igual: 1/5 para cada um (20%)"],
    [6, "6 sócios · divisão igual: 1/6 para cada um (≈ 16,67%)"],
    [7, "7 sócios · divisão igual: 1/7 para cada um (≈ 14,29%)"],
    [8, "8 sócios · divisão igual: 1/8 para cada um (12,5%)"],
    [10, "10 sócios · divisão igual: 1/10 para cada um (10%)"],
  ])("%i sócios", (count, text) => {
    expect(describeEqualDivision(count)).toBe(text);
  });

  it("contagem inválida vira 'Nenhum sócio escolhido.'", () => {
    expect(describeEqualDivision(-1)).toBe("Nenhum sócio escolhido.");
    expect(describeEqualDivision(2.5)).toBe("Nenhum sócio escolhido.");
    expect(describeEqualDivision(Number.NaN)).toBe("Nenhum sócio escolhido.");
  });
});

describe("equalSharePercent", () => {
  it("só leva '≈' quando a divisão não é exata em duas casas", () => {
    expect(equalSharePercent(1)).toBe("100%");
    expect(equalSharePercent(2)).toBe("50%");
    expect(equalSharePercent(3)).toBe("≈ 33,33%");
    expect(equalSharePercent(16)).toBe("6,25%");
    expect(equalSharePercent(32)).toBe("≈ 3,13%"); // 3,125 não cabe em duas casas
    expect(equalSharePercent(0)).toBe("");
  });
});

describe("normalizeAlias (espelho aproximado, só para filtrar listas)", () => {
  it("minúsculas, sem acento, pontuação vira espaço, espaços colapsados", () => {
    expect(normalizeAlias("  Sócio  Exemplo-Á, Ltda. ")).toBe("socio exemplo a ltda");
    expect(normalizeAlias("Ação & Çedilha")).toBe("acao cedilha");
    expect(normalizeAlias(null)).toBe("");
    expect(normalizeAlias(" ./- ")).toBe("");
  });
});
