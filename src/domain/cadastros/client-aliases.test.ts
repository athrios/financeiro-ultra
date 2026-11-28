import { describe, expect, it } from "vitest";

import {
  activeAliasesSignature,
  activeClientAliases,
  addClientAlias,
  clientAliasItemsFromSaved,
  clientAliasGroupOf,
  clientAliasKey,
  clientAliasesSignature,
  countActiveClientAliases,
  describeClientAliasItem,
  isClientAliasGroupFull,
  reactivateClientAlias,
  removeClientAlias,
  type ClientAliasItem,
} from "./client-aliases";

const saved = clientAliasItemsFromSaved([
  { id: "1", type: "NAME", displayValue: "Modelo Ltda", active: true },
  { id: "2", type: "DOCUMENT", displayValue: "000.000.005-15", active: true },
  { id: "3", type: "NAME", displayValue: "Nome Antigo", active: false },
]);

function added(result: ReturnType<typeof addClientAlias>): ClientAliasItem[] {
  if (!result.ok) throw new Error(`esperava sucesso: ${result.message}`);
  return result.items;
}

describe("itens e descrição", () => {
  it("monta os itens do que veio do banco", () => {
    expect(saved.map((item) => [item.key, item.id, item.type, item.value, item.active])).toEqual([
      ["saved-1", "1", "NAME", "Modelo Ltda", true],
      ["saved-2", "2", "DOCUMENT", "000.000.005-15", true],
      ["saved-3", "3", "NAME", "Nome Antigo", false],
    ]);
  });

  it("apelido de documento aparece com o tipo; o de nome, como digitado", () => {
    expect(describeClientAliasItem(saved[0])).toBe("Modelo Ltda");
    expect(describeClientAliasItem(saved[1])).toBe("CPF 000.000.005-15");
    expect(describeClientAliasItem({ type: "DOCUMENT", value: "99999999000272" })).toBe("CNPJ 99.999.999/0002-72");
  });

  it("a chave de comparação ignora acento, caixa e pontuação (nome) e a máscara (documento)", () => {
    expect(clientAliasKey({ type: "NAME", value: "MODELO, Ltda." })).toBe(clientAliasKey({ type: "NAME", value: "modelo ltda" }));
    expect(clientAliasKey({ type: "DOCUMENT", value: "000.000.005-15" })).toBe(clientAliasKey({ type: "DOCUMENT", value: "00000000515" }));
  });
});

describe("adicionar (UI 4.1.6)", () => {
  it("nome novo entra como item novo", () => {
    const result = addClientAlias(saved, "NAME", "  Modelo Filial ", "novo-1");
    const items = added(result);
    expect(items).toHaveLength(4);
    expect(items[3]).toEqual({ key: "novo-1", id: null, type: "NAME", value: "Modelo Filial", active: true });
  });

  it("campo vazio ou só pontuação: mensagem exata", () => {
    expect(addClientAlias(saved, "NAME", "   ", "k")).toEqual({ ok: false, message: "Digite o apelido antes de adicionar." });
    expect(addClientAlias(saved, "NAME", "...", "k")).toEqual({ ok: false, message: "Digite o apelido antes de adicionar." });
    expect(addClientAlias(saved, "CPF", "", "k")).toEqual({ ok: false, message: "Digite o apelido antes de adicionar." });
  });

  it("já está na lista (mesmo sem acento, caixa ou pontuação)", () => {
    expect(addClientAlias(saved, "NAME", "MODELO LTDA", "k")).toEqual({ ok: false, message: "Este apelido já está na lista." });
    expect(addClientAlias(saved, "CPF", "00000000515", "k")).toEqual({ ok: false, message: "Este apelido já está na lista." });
  });

  it("documento inválido: mensagens da UI 4.1.2", () => {
    expect(addClientAlias(saved, "CPF", "123.456.789-00", "k")).toEqual({ ok: false, message: "CPF inválido. Confira os números." });
    expect(addClientAlias(saved, "CNPJ", "99.999.999/0001-90", "k")).toEqual({
      ok: false,
      message: "CNPJ inválido. Confira os números e as letras.",
    });
    expect(addClientAlias(saved, "CPF", "123", "k")).toEqual({ ok: false, message: "O CPF precisa ter 11 números." });
  });

  it("documento válido entra formatado, como apelido do tipo DOCUMENT", () => {
    const items = added(addClientAlias(saved, "CNPJ", "99999999000272", "novo-2"));
    expect(items[3]).toMatchObject({ type: "DOCUMENT", value: "99.999.999/0002-72", id: null });
  });

  it("nome com mais de 200 caracteres é recusado", () => {
    expect(addClientAlias(saved, "NAME", "a".repeat(201), "k")).toEqual({
      ok: false,
      message: "Um apelido pode ter no máximo 200 caracteres.",
    });
  });

  it("texto igual a um inativo reativa o inativo em vez de criar outro", () => {
    const result = addClientAlias(saved, "NAME", "nome antigo", "k");
    expect(result.ok && result.kind).toBe("reactivated");
    const items = added(result);
    expect(items).toHaveLength(3);
    expect(items[2]).toMatchObject({ id: "3", active: true, value: "Nome Antigo" });
  });
});

describe("remover, inativar e reativar", () => {
  it("item novo some; item salvo só fica inativo", () => {
    const withNew = added(addClientAlias(saved, "NAME", "Outro", "novo-1"));
    expect(removeClientAlias(withNew, "novo-1")).toHaveLength(3);
    const inactivated = removeClientAlias(saved, "saved-1");
    expect(inactivated).toHaveLength(3);
    expect(inactivated[0]).toMatchObject({ id: "1", active: false });
  });

  it("reativar volta o item e a lista ativa é a que vai ao servidor", () => {
    const reactivated = reactivateClientAlias(saved, "saved-3");
    expect(activeClientAliases(reactivated).map((item) => item.value)).toEqual(["Modelo Ltda", "000.000.005-15", "Nome Antigo"]);
    expect(activeClientAliases(saved).map((item) => item.type)).toEqual(["NAME", "DOCUMENT"]);
  });
});

describe("assinaturas", () => {
  it("a completa muda com qualquer alteração; a dos ativos só com o que o aviso confere", () => {
    expect(clientAliasesSignature(removeClientAlias(saved, "saved-1"))).not.toBe(clientAliasesSignature(saved));
    // Reativar e inativar o mesmo item não muda o conjunto ativo.
    const roundTrip = reactivateClientAlias(removeClientAlias(saved, "saved-1"), "saved-1");
    expect(activeAliasesSignature(roundTrip)).toBe(activeAliasesSignature(saved));
    expect(activeAliasesSignature(removeClientAlias(saved, "saved-1"))).not.toBe(activeAliasesSignature(saved));
  });
});

describe("limite por tipo (RAT-D026): 2 nomes e 2 documentos ativos", () => {
  const item = (type: "NAME" | "DOCUMENT", value: string, active = true): ClientAliasItem => ({
    key: `k-${value}`,
    id: null,
    type,
    value,
    active,
  });
  const twoNames = [item("NAME", "Nome A"), item("NAME", "Nome B")];
  const twoDocs = [item("DOCUMENT", "000.000.001-91"), item("DOCUMENT", "ZZ0TESTE000100")];

  it("com 2 nomes ativos o 3o é recusado com a frase de nomes e a marca de teto; documento ainda entra", () => {
    expect(addClientAlias(twoNames, "NAME", "Nome C", "novo")).toEqual({ ok: false, message: "No máximo 2 nomes.", atLimit: true });
    expect(addClientAlias(twoNames, "CPF", "000.000.002-72", "novo")).toMatchObject({ ok: true, kind: "added" });
  });

  it("com 1 CPF e 1 CNPJ ativos o 3o documento é recusado, de qualquer tipo; nome ainda entra", () => {
    const refused = { ok: false, message: "No máximo 2 documentos.", atLimit: true };
    expect(addClientAlias(twoDocs, "CPF", "000.000.002-72", "novo")).toEqual(refused);
    expect(addClientAlias(twoDocs, "CNPJ", "ZZ0TESTE000282", "novo")).toEqual(refused);
    expect(addClientAlias(twoDocs, "NAME", "Nome A", "novo")).toMatchObject({ ok: true, kind: "added" });
  });

  it("os inativos não contam: com 1 ativo e 3 inativos ainda cabe mais um", () => {
    const items = [item("NAME", "Nome A"), item("NAME", "Nome B", false), item("NAME", "Nome C", false), item("NAME", "Nome D", false)];
    expect(addClientAlias(items, "NAME", "Nome E", "novo")).toMatchObject({ ok: true, kind: "added" });
  });

  it("a recusa de teto vem depois das conferências do campo (em branco, repetido, documento inválido)", () => {
    expect(addClientAlias(twoNames, "NAME", "  ", "novo")).toEqual({ ok: false, message: "Digite o apelido antes de adicionar." });
    expect(addClientAlias(twoNames, "NAME", "nome a", "novo")).toEqual({ ok: false, message: "Este apelido já está na lista." });
    expect(addClientAlias(twoDocs, "CPF", "000.000.001-92", "novo")).toMatchObject({ ok: false });
    expect(addClientAlias(twoDocs, "CPF", "000.000.001-92", "novo")).not.toHaveProperty("atLimit");
  });

  it("digitar um apelido igual a um inativo reativa, mas só se o grupo tem vaga", () => {
    const inactive = item("NAME", "Nome C", false);
    expect(addClientAlias([...twoNames, inactive], "NAME", "Nome C", "novo")).toEqual({
      ok: false,
      message: "No máximo 2 nomes.",
      atLimit: true,
    });
    expect(addClientAlias([twoNames[0], inactive], "NAME", "Nome C", "novo")).toMatchObject({ ok: true, kind: "reactivated" });
  });

  it("o botão Reativar segue o grupo do próprio item, não o tipo escolhido", () => {
    const items = [...twoNames, item("NAME", "Nome C", false), item("DOCUMENT", "000.000.001-91"), item("DOCUMENT", "ZZ0TESTE000100", false)];
    expect(reactivateClientAlias(items, "k-Nome C")).toEqual(items);
    expect(reactivateClientAlias(items, "k-ZZ0TESTE000100").find((entry) => entry.key === "k-ZZ0TESTE000100")?.active).toBe(true);
  });

  it("contagem por grupo e grupo cheio", () => {
    const items = [...twoNames, item("DOCUMENT", "000.000.001-91"), item("DOCUMENT", "ZZ0TESTE000100", false)];
    expect(countActiveClientAliases(items, "NAME")).toBe(2);
    expect(countActiveClientAliases(items, "DOCUMENT")).toBe(1);
    expect(isClientAliasGroupFull(items, "NAME")).toBe(true);
    expect(isClientAliasGroupFull(items, "DOCUMENT")).toBe(false);
    expect(clientAliasGroupOf("CPF")).toBe("DOCUMENT");
    expect(clientAliasGroupOf("DOCUMENT")).toBe("DOCUMENT");
    expect(clientAliasGroupOf("NAME")).toBe("NAME");
  });
});
