import { describe, expect, it } from "vitest";

import {
  DUPLICATE_ITEM_MESSAGE,
  EMPTY_ITEM_MESSAGE,
  activeValues,
  addItem,
  itemsFromSaved,
  itemsSignature,
  reactivateItem,
  removeItem,
} from "./editable-list";
import { normalizePixKey } from "./receiver-identifiers";

const saved = itemsFromSaved([
  { id: "a1", value: "Sócio Ex. Alfa", active: true },
  { id: "a2", value: "Alfa Antigo", active: false },
]);

describe("addItem", () => {
  it("adiciona o texto aparado como item novo e ativo", () => {
    const result = addItem(saved, "  Alfa Consultoria  ", "novo-1");
    expect(result).toMatchObject({ ok: true, kind: "added", value: "Alfa Consultoria" });
    if (result.ok) {
      expect(result.items.at(-1)).toEqual({ key: "novo-1", id: null, value: "Alfa Consultoria", active: true });
      expect(result.items).toHaveLength(3);
    }
  });

  it("recusa vazio, só espaços e só pontuação com a mensagem da UI", () => {
    for (const text of ["", "   ", "...", "-"]) {
      expect(addItem(saved, text, "k")).toEqual({ ok: false, message: EMPTY_ITEM_MESSAGE });
    }
    expect(EMPTY_ITEM_MESSAGE).toBe("Digite o apelido antes de adicionar.");
  });

  it("recusa texto repetido entre os ativos, ignorando acento, maiúscula e pontuação", () => {
    expect(addItem(saved, "socio ex alfa", "k")).toEqual({ ok: false, message: DUPLICATE_ITEM_MESSAGE });
    expect(addItem(saved, "SÓCIO EX. ALFA!", "k")).toEqual({ ok: false, message: DUPLICATE_ITEM_MESSAGE });
    expect(DUPLICATE_ITEM_MESSAGE).toBe("Este apelido já está na lista.");
  });

  it("texto igual ao de um item inativo reativa o item, sem criar outro", () => {
    const result = addItem(saved, "alfa antigo", "k");
    expect(result).toMatchObject({ ok: true, kind: "reactivated", value: "Alfa Antigo" });
    if (result.ok) {
      expect(result.items).toHaveLength(2);
      expect(result.items[1]).toMatchObject({ id: "a2", active: true });
    }
  });

  it("não altera a lista de entrada", () => {
    const before = itemsSignature(saved);
    addItem(saved, "Outro", "k");
    removeItem(saved, "saved-a1");
    expect(itemsSignature(saved)).toBe(before);
  });
});

describe("removeItem e reactivateItem", () => {
  it("item novo é descartado (Remover)", () => {
    const withNew = addItem(saved, "Novo", "novo-1");
    if (!withNew.ok) throw new Error("esperava ok");
    const after = removeItem(withNew.items, "novo-1");
    expect(after.map((item) => item.value)).toEqual(["Sócio Ex. Alfa", "Alfa Antigo"]);
  });

  it("item salvo só fica inativo (Inativar) e pode ser reativado", () => {
    const inactivated = removeItem(saved, "saved-a1");
    expect(inactivated[0]).toMatchObject({ id: "a1", active: false });
    expect(activeValues(inactivated)).toEqual([]);
    const back = reactivateItem(inactivated, "saved-a1");
    expect(activeValues(back)).toEqual(["Sócio Ex. Alfa"]);
  });
});

describe("activeValues e itemsSignature", () => {
  it("envia só os ativos, na ordem da lista", () => {
    const withNew = addItem(saved, "Zeta", "n1");
    if (!withNew.ok) throw new Error("esperava ok");
    expect(activeValues(withNew.items)).toEqual(["Sócio Ex. Alfa", "Zeta"]);
  });

  it("a assinatura muda ao adicionar, inativar ou reativar", () => {
    const base = itemsSignature(saved);
    const added = addItem(saved, "Zeta", "n1");
    if (!added.ok) throw new Error("esperava ok");
    expect(itemsSignature(added.items)).not.toBe(base);
    expect(itemsSignature(removeItem(saved, "saved-a1"))).not.toBe(base);
    expect(itemsSignature(reactivateItem(saved, "saved-a2"))).not.toBe(base);
  });
});

describe("addItem com opções da lista (chaves Pix e formas do nome do recebedor)", () => {
  const pix = itemsFromSaved([{ id: "p1", value: "Alfa.Teste@example.com", active: true }]);
  const options = {
    normalize: normalizePixKey,
    emptyMessage: "Digite a chave Pix antes de adicionar.",
    duplicateMessage: "Esta chave Pix já está na lista.",
  };

  it("usa as mensagens da lista, não as de apelido", () => {
    expect(addItem(pix, "  ", "k", options)).toEqual({ ok: false, message: "Digite a chave Pix antes de adicionar." });
    expect(addItem(pix, "alfa.teste@EXAMPLE.com", "k", options)).toEqual({ ok: false, message: "Esta chave Pix já está na lista." });
  });

  it("compara pela normalização da lista: e-mail com ponto diferente NÃO é repetido; telefone com máscara é", () => {
    expect(addItem(pix, "alfateste@example.com", "k", options)).toMatchObject({ ok: true, kind: "added" });
    const phone = itemsFromSaved([{ id: "p2", value: "23999990000", active: true }]);
    expect(addItem(phone, "(23) 99999-0000", "k", options)).toMatchObject({ ok: false });
  });
});

describe("teto de itens (RAT-D026)", () => {
  const limit = { max: 2, message: "No máximo 2 apelidos." };
  const two = itemsFromSaved([
    { id: "b1", value: "Apelido 1", active: true },
    { id: "b2", value: "Apelido 2", active: true },
    { id: "b3", value: "Apelido 3", active: false },
  ]);

  it("incluir no teto: recusado, com a frase e a marca de teto", () => {
    expect(addItem(two, "Apelido 4", "novo", { limit })).toEqual({ ok: false, message: "No máximo 2 apelidos.", atLimit: true });
  });

  it("reativar por digitação no teto: recusado; com vaga, reativa", () => {
    expect(addItem(two, "Apelido 3", "novo", { limit })).toEqual({ ok: false, message: "No máximo 2 apelidos.", atLimit: true });
    const withVacancy = removeItem(two, "saved-b2");
    expect(addItem(withVacancy, "Apelido 3", "novo", { limit })).toMatchObject({ ok: true, kind: "reactivated" });
  });

  it("repetido e em branco vêm antes do teto e não levam a marca", () => {
    expect(addItem(two, "apelido 1", "novo", { limit })).toEqual({ ok: false, message: DUPLICATE_ITEM_MESSAGE });
    expect(addItem(two, " ", "novo", { limit })).toEqual({ ok: false, message: EMPTY_ITEM_MESSAGE });
  });

  it("reactivateItem com o teto: no teto a lista volta como estava", () => {
    expect(reactivateItem(two, "saved-b3", limit)).toEqual(two);
    const withVacancy = removeItem(two, "saved-b2");
    expect(reactivateItem(withVacancy, "saved-b3", limit).find((item) => item.key === "saved-b3")?.active).toBe(true);
  });

  it("reactivateItem de um item ativo ou inexistente não muda nada", () => {
    expect(reactivateItem(two, "saved-b1", limit)).toEqual(two);
    expect(reactivateItem(two, "nao-existe", limit)).toEqual(two);
  });
});
