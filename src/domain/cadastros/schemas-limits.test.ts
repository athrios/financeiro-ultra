/**
 * E10 (aplicação): texto com NUL (QA-CAD-05), mensagem em português do tipo de documento (QA-CAD-06)
 * e teto de itens das listas (QA-CAD-07, hoje regra de negócio RAT-D026). Valores fictícios (RAT-D019).
 */

import { describe, expect, it } from "vitest";

import { parseAliasListParams } from "./alias-view";
import {
  addClientAlias,
  clientAliasGroupOf,
  countActiveClientAliases,
  isClientAliasGroupFull,
  reactivateClientAlias,
  type ClientAliasItem,
} from "./client-aliases";
import { parseClientListParams } from "./client-view";
import { DUPLICATE_ITEM_MESSAGE, EMPTY_ITEM_MESSAGE, addItem, isAtLimit, reactivateItem, type EditableItem } from "./editable-list";
import {
  CLIENT_ALIASES_HELP,
  INVALID_TEXT_MESSAGE,
  LIMIT_REACHED_HINT,
  LIST_LIMITS,
  MAX_BANK_ACCOUNTS,
  MAX_CLIENT_DOCUMENT_ALIASES,
  MAX_CLIENT_NAME_ALIASES,
  MAX_NAME_VARIANTS,
  MAX_PARTNER_ALIASES,
  MAX_PIX_KEYS,
  PARTNER_ALIASES_LIMIT,
  listLimitHelp,
  listLimitMessage,
} from "./limits";
import { parseQueryParam } from "./partner-view";
import { addAccount, reactivateAccount, type AccountItem } from "./receiver-identifiers";
import {
  DOCUMENT_TYPE_MESSAGE,
  buildClientSaveSchema,
  clientSaveSchema,
  fieldErrorsFromZod,
  partnerSaveSchema,
  partnerSetActiveSchema,
  receiverSaveSchema,
  searchAliasesSchema,
  searchClientsSchema,
} from "./schemas";

const PARTNER_A = "a0000000-0000-4000-8000-000000000001";
const VERSION = "2026-11-25T14:03:11.123456+00:00";
const NUL = "\u0000";
// Documentos fictícios (RAT-D019): CPFs 000.000.00x-xx e CNPJs ZZ0TESTE....
const CPF_A = "000.000.001-91";
const CPF_B = "000.000.002-72";
const CNPJ_A = "ZZ0TESTE000100";
const CNPJ_B = "ZZ0TESTE000282";

function errorsOf(result: { success: boolean; error?: Parameters<typeof fieldErrorsFromZod>[0] }) {
  if (result.success || !result.error) throw new Error("esperava falha de validação");
  return fieldErrorsFromZod(result.error);
}

const clientBase = { legalName: "Cliente Modelo Ltda", monthlyValue: "1.500,00", partnerIds: [PARTNER_A], aliases: [] };
const receiverBase = { partnerId: PARTNER_A, holderName: "Titular Fictício A", identifiers: [] };

/** `count` textos diferentes ("Apelido 1"...), para as listas. */
const names = (count: number) => Array.from({ length: count }, (_, index) => `Apelido ${index + 1}`);

describe("QA-CAD-05: NUL em texto livre é recusado no campo, em português", () => {
  it("sócio: nome, apelido e motivo", () => {
    expect(errorsOf(partnerSaveSchema.safeParse({ name: `a${NUL}b`, aliases: [] }))).toEqual({ name: INVALID_TEXT_MESSAGE });
    expect(errorsOf(partnerSaveSchema.safeParse({ name: "Sócio", aliases: ["ok", `a${NUL}b`] }))).toEqual({
      "aliases.1": INVALID_TEXT_MESSAGE,
    });
    expect(errorsOf(partnerSaveSchema.safeParse({ name: "Sócio", aliases: [], reason: `a${NUL}b` }))).toEqual({
      reason: INVALID_TEXT_MESSAGE,
    });
  });

  it("sócio: texto só com NUL não vira 'em branco' (o trim não o tira)", () => {
    expect(errorsOf(partnerSaveSchema.safeParse({ name: NUL, aliases: [] }))).toEqual({ name: INVALID_TEXT_MESSAGE });
    expect(errorsOf(partnerSaveSchema.safeParse({ name: "Sócio", aliases: [NUL] }))).toEqual({ "aliases.0": INVALID_TEXT_MESSAGE });
  });

  it("cliente: nome, nome fantasia, observações, motivo e apelido de nome", () => {
    expect(errorsOf(clientSaveSchema.safeParse({ ...clientBase, legalName: `a${NUL}b` }))).toEqual({ legalName: INVALID_TEXT_MESSAGE });
    expect(errorsOf(clientSaveSchema.safeParse({ ...clientBase, tradeName: `a${NUL}b` }))).toEqual({ tradeName: INVALID_TEXT_MESSAGE });
    expect(errorsOf(clientSaveSchema.safeParse({ ...clientBase, notes: `a${NUL}b` }))).toEqual({ notes: INVALID_TEXT_MESSAGE });
    expect(errorsOf(clientSaveSchema.safeParse({ ...clientBase, reason: `a${NUL}b` }))).toEqual({ reason: INVALID_TEXT_MESSAGE });
    expect(errorsOf(clientSaveSchema.safeParse({ ...clientBase, aliases: [{ type: "NAME", value: `a${NUL}b` }] }))).toEqual({
      "aliases.0.value": INVALID_TEXT_MESSAGE,
    });
  });

  it("cliente: documento e apelido-documento com NUL já eram recusados pela conferência do número", () => {
    expect(clientSaveSchema.safeParse({ ...clientBase, document: `000.000.001-9${NUL}` }).success).toBe(false);
    expect(clientSaveSchema.safeParse({ ...clientBase, aliases: [{ type: "DOCUMENT", value: `1${NUL}1` }] }).success).toBe(false);
  });

  it("recebedor: titular, forma do nome, chave Pix e banco; agência e conta caem na conferência de caracteres", () => {
    expect(errorsOf(receiverSaveSchema.safeParse({ ...receiverBase, holderName: `a${NUL}b` }))).toEqual({ holderName: INVALID_TEXT_MESSAGE });
    expect(
      errorsOf(receiverSaveSchema.safeParse({ ...receiverBase, identifiers: [{ type: "NAME_VARIANT", value: `a${NUL}b` }] })),
    ).toEqual({ "identifiers.0.value": INVALID_TEXT_MESSAGE });
    expect(errorsOf(receiverSaveSchema.safeParse({ ...receiverBase, identifiers: [{ type: "PIX_KEY", value: `a${NUL}b` }] }))).toEqual({
      "identifiers.0.value": INVALID_TEXT_MESSAGE,
    });
    expect(
      errorsOf(
        receiverSaveSchema.safeParse({
          ...receiverBase,
          identifiers: [{ type: "BANK_ACCOUNT", bankName: `Ba${NUL}nco`, branch: "0001", accountNumber: "123" }],
        }),
      ),
    ).toEqual({ "identifiers.0.bankName": INVALID_TEXT_MESSAGE });
    for (const bad of [
      { bankName: "Banco", branch: `00${NUL}1`, accountNumber: "123" },
      { bankName: "Banco", branch: "0001", accountNumber: `12${NUL}3` },
    ]) {
      expect(receiverSaveSchema.safeParse({ ...receiverBase, identifiers: [{ type: "BANK_ACCOUNT", ...bad }] }).success).toBe(false);
    }
  });

  it("motivo de inativar também recusa NUL", () => {
    const result = partnerSetActiveSchema.safeParse({ id: PARTNER_A, active: false, expectedUpdatedAt: VERSION, reason: `a${NUL}b` });
    expect(errorsOf(result)).toEqual({ reason: INVALID_TEXT_MESSAGE });
  });

  it("busca: o NUL é tirado e a busca segue (nunca erro)", () => {
    expect(searchClientsSchema.parse({ query: `a${NUL}b` }).query).toBe("ab");
    expect(searchClientsSchema.parse({ query: NUL }).query).toBeNull();
    expect(searchAliasesSchema.parse({ query: ` a${NUL}b ` }).query).toBe("ab");
  });

  it("parâmetros da URL (?q=a%00b) das três listas perdem o NUL", () => {
    expect(parseClientListParams({ q: `a${NUL}b` }).query).toBe("ab");
    expect(parseAliasListParams({ q: [`a${NUL}b`, "x"] }).query).toBe("ab");
    expect(parseQueryParam(`a${NUL}b`)).toBe("ab");
    expect(parseClientListParams({ q: NUL }).query).toBe("");
  });
});

describe("QA-CAD-06: tipo de documento fora de CPF/CNPJ", () => {
  const cpf = "000.000.001-91";

  it.each(["XYZ", "cpf", "cnpj", "CNPJ ", "RG", "Invalid", 7])("%j devolve a frase em português no campo documentType", (bad) => {
    const result = clientSaveSchema.safeParse({ ...clientBase, document: cpf, documentType: bad });
    const errors = errorsOf(result);
    expect(errors).toEqual({ documentType: DOCUMENT_TYPE_MESSAGE });
    expect(DOCUMENT_TYPE_MESSAGE).toBe("Escolha CPF ou CNPJ.");
    expect(JSON.stringify(errors)).not.toContain("Invalid option");
  });

  it("CPF, CNPJ, nulo e ausente continuam valendo", () => {
    expect(clientSaveSchema.safeParse({ ...clientBase, document: cpf, documentType: "CPF" }).success).toBe(true);
    expect(clientSaveSchema.safeParse({ ...clientBase, document: cpf, documentType: null }).success).toBe(true);
    expect(clientSaveSchema.safeParse({ ...clientBase, document: cpf }).success).toBe(true);
  });

  it("nenhum esquema de cadastro deixa o texto padrão em inglês do zod escapar", () => {
    const samples = [
      partnerSetActiveSchema.safeParse({ id: PARTNER_A, active: "x", expectedUpdatedAt: VERSION }),
      receiverSaveSchema.safeParse({ ...receiverBase, identifiers: [{ type: "OUTRO", value: "x" }] }),
      clientSaveSchema.safeParse({ ...clientBase, aliases: [{ type: "OUTRO", value: "x" }] }),
      searchClientsSchema.safeParse({ status: "TODOS" }),
      searchAliasesSchema.safeParse({ kind: "DOCUMENT" }),
      buildClientSaveSchema().safeParse({ ...clientBase, documentType: "XYZ" }),
    ];
    for (const result of samples) {
      expect(result.success).toBe(false);
      for (const message of Object.values(errorsOf(result))) expect(message).not.toMatch(/Invalid|expected|Expected/);
    }
  });
});

describe("RAT-D026: teto de itens das listas (regra de negócio, banco como autoridade)", () => {
  const nameAliases = (count: number) => names(count).map((value) => ({ type: "NAME" as const, value }));
  const docAlias = (digits: string) => ({ type: "DOCUMENT" as const, value: digits });

  it("os números adotados", () => {
    expect([
      MAX_PARTNER_ALIASES,
      MAX_CLIENT_NAME_ALIASES,
      MAX_CLIENT_DOCUMENT_ALIASES,
      MAX_NAME_VARIANTS,
      MAX_PIX_KEYS,
      MAX_BANK_ACCOUNTS,
    ]).toEqual([2, 2, 2, 30, 10, 10]);
    expect(LIST_LIMITS).toEqual({
      PARTNER_ALIAS: 2,
      CLIENT_ALIAS_NAME: 2,
      CLIENT_ALIAS_DOCUMENT: 2,
      NAME_VARIANT: 30,
      PIX_KEY: 10,
      BANK_ACCOUNT: 10,
    });
  });

  it("frases do teto e da ajuda derivadas do mesmo número", () => {
    expect(listLimitMessage("PARTNER_ALIAS")).toBe("No máximo 2 apelidos.");
    expect(listLimitMessage("CLIENT_ALIAS_NAME")).toBe("No máximo 2 nomes.");
    expect(listLimitMessage("CLIENT_ALIAS_DOCUMENT")).toBe("No máximo 2 documentos.");
    expect(listLimitMessage("NAME_VARIANT")).toBe("No máximo 30 formas do nome.");
    expect(listLimitMessage("PIX_KEY")).toBe("No máximo 10 chaves Pix.");
    expect(listLimitMessage("BANK_ACCOUNT")).toBe("No máximo 10 contas.");
    expect(listLimitMessage("PIX_KEY", 11)).toBe("No máximo 11 chaves Pix.");

    expect(listLimitHelp("PARTNER_ALIAS")).toBe("Até 2 apelidos ativos.");
    expect(listLimitHelp("NAME_VARIANT")).toBe("Até 30 formas do nome ativas.");
    expect(listLimitHelp("PIX_KEY")).toBe("Até 10 chaves Pix ativas.");
    expect(listLimitHelp("BANK_ACCOUNT")).toBe("Até 10 contas ativas.");
    expect(CLIENT_ALIASES_HELP).toBe("Até 2 nomes e 2 documentos ativos. CPF e CNPJ contam juntos.");
    expect(PARTNER_ALIASES_LIMIT.help).toBe("Até 2 apelidos ativos.");
    expect(LIMIT_REACHED_HINT).toBe("Para adicionar ou reativar, inative ou remova algum item da lista.");
  });

  it("apelidos do sócio: 2 passam, o 3o é recusado em 'aliases'", () => {
    expect(partnerSaveSchema.safeParse({ name: "Sócio", aliases: names(2) }).success).toBe(true);
    expect(errorsOf(partnerSaveSchema.safeParse({ name: "Sócio", aliases: names(3) }))).toEqual({ aliases: "No máximo 2 apelidos." });
  });

  it("apelidos do sócio: linhas em branco e repetidos não contam para o teto", () => {
    expect(partnerSaveSchema.safeParse({ name: "Sócio", aliases: [...names(2), " ", ""] }).success).toBe(true);
    // "Apelido 1" e "apelido  1!" são o mesmo pela chave aproximada (sem acento, maiúscula nem pontuação).
    expect(partnerSaveSchema.safeParse({ name: "Sócio", aliases: ["Apelido 1", "apelido  1!", "Apelido 2"] }).success).toBe(true);
    expect(errorsOf(partnerSaveSchema.safeParse({ name: "Sócio", aliases: ["Apelido 1", "apelido 1", "Apelido 2", "Apelido 3"] }))).toEqual({
      aliases: "No máximo 2 apelidos.",
    });
  });

  it("apelidos do cliente: 2 nomes e 2 documentos passam (CPF e CNPJ contam juntos nos documentos)", () => {
    const aliases = [...nameAliases(2), docAlias(CPF_A), docAlias(CNPJ_A)];
    expect(clientSaveSchema.safeParse({ ...clientBase, aliases }).success).toBe(true);
    expect(clientSaveSchema.safeParse({ ...clientBase, aliases: nameAliases(2) }).success).toBe(true);
    expect(clientSaveSchema.safeParse({ ...clientBase, aliases: [docAlias(CPF_A), docAlias(CPF_B)] }).success).toBe(true);
  });

  it("apelidos do cliente: o 3o de cada tipo é recusado, com a frase do tipo, no índice do item", () => {
    expect(errorsOf(clientSaveSchema.safeParse({ ...clientBase, aliases: nameAliases(3) }))).toEqual({
      "aliases.2": "No máximo 2 nomes.",
    });
    // 2 documentos + 1 nome + o 3o documento: o problema vai no índice bruto do 3o documento (3).
    const docs = [docAlias(CPF_A), docAlias(CNPJ_A), { type: "NAME" as const, value: "Nome A" }, docAlias(CPF_B)];
    expect(errorsOf(clientSaveSchema.safeParse({ ...clientBase, aliases: docs }))).toEqual({
      "aliases.3": "No máximo 2 documentos.",
    });
  });

  it("apelidos do cliente: os dois tipos estouram, as duas frases; nome e documento não se misturam na conta", () => {
    const aliases = [...nameAliases(3), docAlias(CPF_A), docAlias(CPF_B), docAlias(CNPJ_A)];
    expect(errorsOf(clientSaveSchema.safeParse({ ...clientBase, aliases }))).toEqual({
      "aliases.2": "No máximo 2 nomes.",
      "aliases.5": "No máximo 2 documentos.",
    });
    // 2 nomes + 2 documentos = 4 itens: o total não é o que conta.
    expect(clientSaveSchema.safeParse({ ...clientBase, aliases: [...nameAliases(2), docAlias(CPF_A), docAlias(CPF_B)] }).success).toBe(true);
  });

  it("apelidos do cliente: repetidos e linhas em branco não contam duas vezes", () => {
    const repeatedNames = [
      { type: "NAME" as const, value: "Maria S." },
      { type: "NAME" as const, value: "maria s" },
      { type: "NAME" as const, value: "Outro Nome" },
      { type: "NAME" as const, value: " " },
    ];
    expect(clientSaveSchema.safeParse({ ...clientBase, aliases: repeatedNames }).success).toBe(true);
    // O mesmo CPF com e sem pontuação é um documento só.
    const repeatedDocs = [docAlias(CPF_A), docAlias("00000000191"), docAlias(CPF_B)];
    expect(clientSaveSchema.safeParse({ ...clientBase, aliases: repeatedDocs }).success).toBe(true);
  });

  it("recebedor: formas do nome (30), chaves Pix (10) e contas (10), cada uma com a sua frase", () => {
    const variants = (count: number) => names(count).map((value) => ({ type: "NAME_VARIANT" as const, value }));
    const pix = (count: number) => names(count).map((value) => ({ type: "PIX_KEY" as const, value: `chave${value.replace(/\D/g, "")}@example.com` }));
    const accounts = (count: number) =>
      names(count).map((_, index) => ({ type: "BANK_ACCOUNT" as const, bankName: "Banco Exemplo", branch: "0001", accountNumber: `${index + 1}` }));

    for (const [ok, over, frase, path] of [
      [variants(30), variants(31), "No máximo 30 formas do nome.", "identifiers.30"],
      [pix(10), pix(11), "No máximo 10 chaves Pix.", "identifiers.10"],
      [accounts(10), accounts(11), "No máximo 10 contas.", "identifiers.10"],
    ] as const) {
      expect(receiverSaveSchema.safeParse({ ...receiverBase, identifiers: ok }).success).toBe(true);
      expect(errorsOf(receiverSaveSchema.safeParse({ ...receiverBase, identifiers: over }))).toEqual({ [path]: frase });
    }
  });

  it("recebedor: o teto é por tipo (30 variações + 10 Pix + 10 contas juntas passam) e ignora itens vazios", () => {
    const identifiers = [
      ...names(30).map((value) => ({ type: "NAME_VARIANT" as const, value })),
      ...names(10).map((value) => ({ type: "PIX_KEY" as const, value: `k${value.replace(/\D/g, "")}` })),
      ...names(10).map((_, index) => ({ type: "BANK_ACCOUNT" as const, bankName: "Banco", branch: "1", accountNumber: `${index + 1}` })),
      { type: "PIX_KEY" as const, value: " " },
    ];
    expect(receiverSaveSchema.safeParse({ ...receiverBase, identifiers }).success).toBe(true);
  });

  it("recebedor: repetidos pela chave aproximada não contam duas vezes", () => {
    const variants = [...names(30), "APELIDO 1", "apelido  1!"].map((value) => ({ type: "NAME_VARIANT" as const, value }));
    expect(receiverSaveSchema.safeParse({ ...receiverBase, identifiers: variants }).success).toBe(true);
    // Chave Pix com e sem máscara é a mesma; conta com zeros à esquerda e separadores também.
    const pix = [...names(10).map((value) => `k${value.replace(/\D/g, "")}`), "K1", "000.000.006-04", "00000000604"];
    expect(
      errorsOf(receiverSaveSchema.safeParse({ ...receiverBase, identifiers: pix.map((value) => ({ type: "PIX_KEY" as const, value })) })),
    ).toEqual({ "identifiers.11": "No máximo 10 chaves Pix." });
    const accounts = [
      ...names(10).map((_, index) => ({ type: "BANK_ACCOUNT" as const, bankName: "Banco Exemplo", branch: "0001", accountNumber: `${index + 1}` })),
      { type: "BANK_ACCOUNT" as const, bankName: "Bãnco  Exemplo", branch: "1", accountNumber: "0.001" },
    ];
    expect(receiverSaveSchema.safeParse({ ...receiverBase, identifiers: accounts }).success).toBe(true);
  });

  it("recebedor: o problema vai no índice bruto do item acima do teto (a tela acha a lista pelo tipo)", () => {
    const identifiers = [
      { type: "PIX_KEY" as const, value: " " },
      ...names(11).map((value) => ({ type: "PIX_KEY" as const, value: `k${value.replace(/\D/g, "")}` })),
    ];
    // 11 chaves não vazias: a 11a está no índice bruto 11 (o item vazio fica no 0).
    expect(errorsOf(receiverSaveSchema.safeParse({ ...receiverBase, identifiers }))).toEqual({ "identifiers.11": "No máximo 10 chaves Pix." });
  });

  it("3.000 itens são recusados com a frase do teto, sem erro inesperado", () => {
    expect(errorsOf(partnerSaveSchema.safeParse({ name: "Sócio", aliases: names(3000) }))).toEqual({ aliases: "No máximo 2 apelidos." });
    expect(errorsOf(clientSaveSchema.safeParse({ ...clientBase, aliases: nameAliases(3000) }))).toEqual({
      "aliases.2": "No máximo 2 nomes.",
    });
    const variants = names(3000).map((value) => ({ type: "NAME_VARIANT" as const, value }));
    expect(errorsOf(receiverSaveSchema.safeParse({ ...receiverBase, identifiers: variants }))).toEqual({
      "identifiers.30": "No máximo 30 formas do nome.",
    });
  });
});

describe("RAT-D026: a tela para no teto (funções de decisão)", () => {
  const item = (index: number, active = true): EditableItem => ({ key: `k${index}`, id: null, value: `Apelido ${index}`, active });
  const clientItem = (type: "NAME" | "DOCUMENT", value: string, active = true): ClientAliasItem => ({
    key: `c-${type}-${value}`,
    id: null,
    type,
    value,
    active,
  });

  it("isAtLimit conta só os ativos", () => {
    const items = [item(1), item(100, false), item(101, false)];
    expect(isAtLimit(items, PARTNER_ALIASES_LIMIT)).toBe(false);
    expect(isAtLimit([...items, item(200)], PARTNER_ALIASES_LIMIT)).toBe(true);
    expect(isAtLimit(items, undefined)).toBe(false);
  });

  it("addItem: o 2o entra, o 3o é recusado com a frase e a marca de teto; reativar no teto também", () => {
    const options = { limit: PARTNER_ALIASES_LIMIT };
    let items: EditableItem[] = [];
    for (let index = 1; index <= 2; index += 1) {
      const result = addItem(items, `Texto ${index}`, `n${index}`, options);
      if (!result.ok) throw new Error(result.message);
      items = result.items;
    }
    expect(addItem(items, "Texto 3", "n3", options)).toEqual({ ok: false, message: "No máximo 2 apelidos.", atLimit: true });

    const withInactive = [items[0], { ...items[1], active: false }];
    const atLimit = [...withInactive, item(900)];
    expect(addItem(atLimit, items[1].value, "n4", options)).toEqual({ ok: false, message: "No máximo 2 apelidos.", atLimit: true });
    expect(addItem(withInactive, items[1].value, "n4", options)).toMatchObject({ ok: true, kind: "reactivated" });
  });

  it("addItem: texto em branco e repetido vêm antes do teto, sem a marca de teto", () => {
    const options = { limit: PARTNER_ALIASES_LIMIT };
    const items = [item(1), item(2)];
    expect(addItem(items, "  ", "n", options)).toEqual({ ok: false, message: EMPTY_ITEM_MESSAGE });
    expect(addItem(items, "apelido 1", "n", options)).toEqual({ ok: false, message: DUPLICATE_ITEM_MESSAGE });
  });

  it("addItem sem teto não limita", () => {
    const items = Array.from({ length: 80 }, (_, index) => item(index));
    expect(addItem(items, "Novo texto", "novo").ok).toBe(true);
  });

  it("reactivateItem: no teto a reativação é recusada e a lista volta como estava", () => {
    const limit = PARTNER_ALIASES_LIMIT;
    const full = [item(1), item(2), item(3, false)];
    expect(reactivateItem(full, "k3", limit)).toEqual(full);
    const withVacancy = [item(1), item(2, false), item(3, false)];
    expect(reactivateItem(withVacancy, "k3", limit).map((entry) => entry.active)).toEqual([true, false, true]);
    // Sem teto informado, comporta-se como antes.
    expect(reactivateItem(full, "k3").map((entry) => entry.active)).toEqual([true, true, true]);
  });

  it("cliente: o 3o nome é recusado, e os documentos continuam com vaga", () => {
    const items = [clientItem("NAME", "Nome A"), clientItem("NAME", "Nome B")];
    expect(addClientAlias(items, "NAME", "Outro nome", "novo")).toEqual({ ok: false, message: "No máximo 2 nomes.", atLimit: true });
    expect(addClientAlias(items.slice(1), "NAME", "Outro nome", "novo").ok).toBe(true);
    expect(addClientAlias(items, "CPF", CPF_A, "novo")).toMatchObject({ ok: true, kind: "added" });
  });

  it("cliente: o 3o documento é recusado (CPF e CNPJ juntos), e os nomes continuam com vaga", () => {
    const items = [clientItem("DOCUMENT", CPF_A), clientItem("DOCUMENT", CNPJ_A)];
    expect(addClientAlias(items, "CPF", CPF_B, "novo")).toEqual({
      ok: false,
      message: "No máximo 2 documentos.",
      atLimit: true,
    });
    expect(addClientAlias(items, "CNPJ", CNPJ_B, "novo")).toMatchObject({ ok: false, atLimit: true });
    expect(addClientAlias(items, "NAME", "Um nome", "novo")).toMatchObject({ ok: true, kind: "added" });
  });

  it("cliente: repetido e em branco vêm antes do teto; reativar por digitação conta como inclusão", () => {
    const items = [clientItem("NAME", "Nome A"), clientItem("NAME", "Nome B"), clientItem("NAME", "Nome C", false)];
    expect(addClientAlias(items, "NAME", "nome a", "novo")).toEqual({ ok: false, message: DUPLICATE_ITEM_MESSAGE });
    expect(addClientAlias(items, "NAME", " ", "novo")).toEqual({ ok: false, message: EMPTY_ITEM_MESSAGE });
    expect(addClientAlias(items, "NAME", "Nome C", "novo")).toEqual({ ok: false, message: "No máximo 2 nomes.", atLimit: true });
    expect(addClientAlias(items.slice(0, 1).concat(items[2]), "NAME", "Nome C", "novo")).toMatchObject({ ok: true, kind: "reactivated" });
  });

  it("cliente: contagem só dos ativos, por grupo", () => {
    const items = [
      clientItem("NAME", "Nome A"),
      clientItem("NAME", "Nome B", false),
      clientItem("DOCUMENT", CPF_A),
      clientItem("DOCUMENT", CNPJ_A),
    ];
    expect(countActiveClientAliases(items, "NAME")).toBe(1);
    expect(countActiveClientAliases(items, "DOCUMENT")).toBe(2);
    expect(isClientAliasGroupFull(items, "NAME")).toBe(false);
    expect(isClientAliasGroupFull(items, "DOCUMENT")).toBe(true);
    expect(clientAliasGroupOf("CPF")).toBe("DOCUMENT");
    expect(clientAliasGroupOf("CNPJ")).toBe("DOCUMENT");
    expect(clientAliasGroupOf("NAME")).toBe("NAME");
  });

  it("cliente: reativação recusada com o tipo do próprio item cheio, aceita com o outro tipo cheio", () => {
    const items = [
      clientItem("NAME", "Nome A"),
      clientItem("NAME", "Nome B"),
      clientItem("NAME", "Nome C", false),
      clientItem("DOCUMENT", CPF_A),
      clientItem("DOCUMENT", CNPJ_A, false),
    ];
    // Nomes cheios: o nome inativo não volta.
    expect(reactivateClientAlias(items, "c-NAME-Nome C")).toEqual(items);
    // Documentos com vaga: o documento inativo volta, mesmo com os nomes cheios.
    expect(reactivateClientAlias(items, `c-DOCUMENT-${CNPJ_A}`).map((entry) => entry.active)).toEqual([true, true, false, true, true]);
    // Documentos cheios: um CPF inativo não volta.
    const docsFull = [clientItem("DOCUMENT", CPF_A), clientItem("DOCUMENT", CNPJ_A), clientItem("DOCUMENT", CPF_B, false)];
    expect(reactivateClientAlias(docsFull, "c-DOCUMENT-000.000.002-72")).toEqual(docsFull);
  });

  it("apelido do cliente com NUL é recusado na tela com a frase do campo", () => {
    expect(addClientAlias([], "NAME", `a${NUL}b`, "novo")).toEqual({ ok: false, message: INVALID_TEXT_MESSAGE });
  });

  it("contas: a 11a é recusada; reativar no teto também", () => {
    const items: AccountItem[] = Array.from({ length: 10 }, (_, index) => ({
      key: `k${index}`,
      id: null,
      active: true,
      bankName: "Banco Exemplo",
      branch: "0001",
      accountNumber: `${index + 1}`,
    }));
    const draft = { bankName: "Banco Exemplo", branch: "0001", accountNumber: "999" };
    expect(addAccount(items, draft, "novo")).toEqual({ ok: false, message: "No máximo 10 contas.", field: null, atLimit: true });
    expect(addAccount(items.slice(1), draft, "novo").ok).toBe(true);

    const withInactive = [...items, { ...items[0], key: "inativa", accountNumber: "777", active: false }];
    expect(reactivateAccount(withInactive, "inativa")).toEqual(withInactive);
    expect(reactivateAccount([...items.slice(1), withInactive[10]], "inativa").at(-1)?.active).toBe(true);
  });
});
