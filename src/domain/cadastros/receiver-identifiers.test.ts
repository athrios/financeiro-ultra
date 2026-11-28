import { describe, expect, it } from "vitest";

import {
  accountKey,
  accountsFromSaved,
  accountsSignature,
  activeAccounts,
  addAccount,
  describeAccount,
  listsFromIdentifiers,
  normalizePixKey,
  reactivateAccount,
  removeAccount,
} from "./receiver-identifiers";

describe("normalizePixKey (espelho do banco)", () => {
  it("e-mail: só minúsculas e espaços das pontas; os pontos continuam", () => {
    expect(normalizePixKey("  Alfa.Teste@Example.COM ")).toBe("alfa.teste@example.com");
    expect(normalizePixKey("a.b@example.com")).not.toBe(normalizePixKey("ab@example.com"));
  });

  it("CPF, CNPJ e telefone com máscara comparam iguais ao sem máscara", () => {
    expect(normalizePixKey("000.000.006-04")).toBe("00000000604");
    expect(normalizePixKey("(23) 99999-0000")).toBe("23999990000");
    expect(normalizePixKey("EX.0TE.STE/0002-00")).toBe("ex0teste000200");
  });
});

describe("conta bancária na tela", () => {
  const saved = accountsFromSaved([
    { id: "c1", bankName: "Banco Exemplo", branch: "0001", accountNumber: "12345-6", active: true },
    { id: "c2", bankName: "Banco Antigo", branch: "2", accountNumber: "9", active: false },
  ]);

  it("accountKey ignora acento, maiúscula, separadores e zeros à esquerda", () => {
    expect(accountKey({ bankName: "Bãnco  Exemplo", branch: "0.001", accountNumber: "012345-6" })).toBe(
      accountKey({ bankName: "banco exemplo", branch: "1", accountNumber: "123456" }),
    );
    expect(accountKey({ bankName: "B", branch: "000", accountNumber: "0" })).toBe("b|0|0");
  });

  it("describeAccount usa o texto da UI", () => {
    expect(describeAccount({ bankName: "Banco Exemplo", branch: "0001", accountNumber: "12345-6" })).toBe(
      "Banco Banco Exemplo · Ag. 0001 · Conta 12345-6",
    );
  });

  it("adiciona conta nova (aparada) como item novo e ativo", () => {
    const result = addAccount(saved, { bankName: " Banco Beta ", branch: " 0002 ", accountNumber: " 777-X " }, "novo-1");
    expect(result).toMatchObject({ ok: true, kind: "added" });
    if (result.ok) {
      expect(result.items.at(-1)).toEqual({
        key: "novo-1", id: null, active: true, bankName: "Banco Beta", branch: "0002", accountNumber: "777-X",
      });
    }
  });

  it("conta pela metade e linha toda vazia: 'Preencha banco, agência e conta, ou apague os campos.'", () => {
    for (const draft of [
      { bankName: "Banco", branch: "", accountNumber: "" },
      { bankName: "", branch: "1", accountNumber: "2" },
      { bankName: "", branch: "", accountNumber: "" },
    ]) {
      expect(addAccount(saved, draft, "k")).toMatchObject({
        ok: false,
        message: "Preencha banco, agência e conta, ou apague os campos.",
      });
    }
  });

  it("caracteres inválidos em agência e conta: 'Use só números, hífen e a letra X.'", () => {
    expect(addAccount(saved, { bankName: "B", branch: "AB1", accountNumber: "1" }, "k")).toMatchObject({
      ok: false, message: "Use só números, hífen e a letra X.", field: "branch",
    });
    expect(addAccount(saved, { bankName: "B", branch: "1", accountNumber: "1X2" }, "k")).toMatchObject({
      ok: false, message: "Use só números, hífen e a letra X.", field: "accountNumber",
    });
  });

  it("conta repetida entre as ativas: 'Esta conta já está na lista.'", () => {
    expect(addAccount(saved, { bankName: "banco exemplo", branch: "1", accountNumber: "123456" }, "k")).toEqual({
      ok: false, message: "Esta conta já está na lista.", field: null,
    });
  });

  it("conta igual a uma inativa a reativa em vez de criar outra", () => {
    const result = addAccount(saved, { bankName: "Banco Antigo", branch: "02", accountNumber: "09" }, "k");
    expect(result).toMatchObject({ ok: true, kind: "reactivated" });
    if (result.ok) {
      expect(result.items).toHaveLength(2);
      expect(result.items.find((item) => item.key === "saved-c2")?.active).toBe(true);
    }
  });

  it("remover: conta nova some; conta salva só fica inativa; reativar volta", () => {
    const added = addAccount(saved, { bankName: "B", branch: "1", accountNumber: "1" }, "novo-1");
    if (!added.ok) throw new Error("esperado ok");
    expect(removeAccount(added.items, "novo-1")).toHaveLength(2);
    const inactivated = removeAccount(saved, "saved-c1");
    expect(inactivated.find((item) => item.key === "saved-c1")).toMatchObject({ active: false, id: "c1" });
    expect(reactivateAccount(inactivated, "saved-c1").find((item) => item.key === "saved-c1")?.active).toBe(true);
  });

  it("activeAccounts devolve só as ativas e accountsSignature muda com a lista", () => {
    expect(activeAccounts(saved)).toEqual([{ bankName: "Banco Exemplo", branch: "0001", accountNumber: "12345-6" }]);
    expect(accountsSignature(saved)).not.toBe(accountsSignature(removeAccount(saved, "saved-c1")));
  });
});

describe("listsFromIdentifiers", () => {
  it("separa por tipo, mantém a ordem e a situação", () => {
    const lists = listsFromIdentifiers([
      { id: "1", active: true, type: "NAME_VARIANT", value: "S. Alfa" },
      { id: "2", active: true, type: "PIX_KEY", value: "alfa@example.com" },
      { id: "3", active: false, type: "PIX_KEY", value: "velha@example.com" },
      { id: "4", active: true, type: "BANK_ACCOUNT", bankName: "Banco Exemplo", branch: "1", accountNumber: "2" },
    ]);
    expect(lists.variants).toEqual([{ key: "saved-1", id: "1", value: "S. Alfa", active: true }]);
    expect(lists.pixKeys.map((item) => [item.value, item.active])).toEqual([
      ["alfa@example.com", true],
      ["velha@example.com", false],
    ]);
    expect(lists.accounts).toEqual([
      { key: "saved-4", id: "4", active: true, bankName: "Banco Exemplo", branch: "1", accountNumber: "2" },
    ]);
  });
});
