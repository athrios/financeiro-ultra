/**
 * Esquemas de entrada dos cadastros (CAD-001): sócio, recebedor e cliente.
 *
 * Validam no servidor o que a tela já conferiu (o navegador não é confiável) e devolvem a forma
 * que as funções do banco esperam. As conferências de documento e de dinheiro são ESPELHO: o
 * banco é a autoridade e repete todas (modelagem 3.4). Mensagens em pt-BR, as da UI.
 *
 * Regras que atravessam todos os esquemas:
 *  - `expectedUpdatedAt` é TEXTO, do começo ao fim (6.2): nunca `Date`, nunca `coerce`. O `Date` do
 *    JavaScript corta os microssegundos e daria conflito falso em toda edição.
 *  - a mensalidade chega como o texto digitado ("1.234,56") e sai como texto decimal ("1234.56"),
 *    sem float;
 *  - motivo é opcional (RAT-D021): em branco vira `null` e nunca bloqueia a ação;
 *  - linhas em branco das listas (apelidos, variações, chaves) são descartadas aqui, como a
 *    D-IMPL-08 pede à tela; texto só com pontuação continua indo ao banco, que o recusa;
 *  - texto livre com NUL (U+0000) é recusado com `INVALID_TEXT_MESSAGE`, no campo do texto (o
 *    PostgreSQL não guarda NUL); o texto de BUSCA só perde o NUL, nunca vira erro (QA-CAD-05);
 *  - as listas têm teto de itens ATIVOS (`limits.ts`, RAT-D026; o banco é a autoridade), com "No máximo
 *    N ..." no campo. Contam só os itens não vazios e DISTINTOS pela chave aproximada (a mesma do banco).
 *
 * Sem dependência de Next, banco ou navegador.
 */

import { z } from "zod";

import { parseDocumentInput } from "@/domain/documents/document";
import { parseMoneyInput } from "@/domain/shared/money-input";

import { clientAliasKey } from "./client-aliases";
import { accountKey, countDistinctKeys, normalizePixKey, squeezeAccountText } from "./identifier-keys";
import {
  BANK_ACCOUNTS_LIMIT_MESSAGE,
  CLIENT_ALIAS_LIMITS,
  INVALID_TEXT_MESSAGE,
  MAX_BANK_ACCOUNTS,
  MAX_NAME_VARIANTS,
  MAX_PARTNER_ALIASES,
  MAX_PIX_KEYS,
  NAME_VARIANTS_LIMIT_MESSAGE,
  PARTNER_ALIASES_LIMIT_MESSAGE,
  PIX_KEYS_LIMIT_MESSAGE,
} from "./limits";
import { hasNul, normalizeAlias, stripNul } from "./text";

export { squeezeAccountText };

// -----------------------------------------------------------------------------------------------
// Peças comuns
// -----------------------------------------------------------------------------------------------

export const MAX_NAME_LENGTH = 200;
export const MAX_NOTES_LENGTH = 2000;
export const MAX_PIX_KEY_LENGTH = 100;
export const MAX_BANK_NAME_LENGTH = 100;
/** A tela limita o motivo a 500 caracteres (UI 6); o banco aceita até 2000. */
export const MAX_REASON_LENGTH = 500;
export const MAX_SEARCH_QUERY_LENGTH = 200;

export const VERSION_MESSAGE = "Não foi possível identificar a versão do cadastro. Atualize a página e tente novamente.";

/**
 * Timestamp como o PostgREST entrega (`2026-11-25T14:03:11.123456+00:00`). Só o formato é conferido,
 * e o texto passa intacto: é o token de concorrência otimista e é comparado com microssegundos.
 */
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/;

export const updatedAtTextSchema = z.string({ error: VERSION_MESSAGE }).regex(TIMESTAMP_PATTERN, { error: VERSION_MESSAGE });

const expectedUpdatedAtField = updatedAtTextSchema.nullish().transform((value) => value ?? null);

/** UUID no formato do Postgres (aceita qualquer versão, como o tipo `uuid`). */
const uuidSchema = (message: string) => z.guid({ error: message });

const optionalId = z
  .guid({ error: "Identificador inválido." })
  .nullish()
  .transform((value) => value ?? null);

/** Recusa NUL (U+0000) em texto livre. */
const noNul = (value: string) => !hasNul(value);

function requiredText(emptyMessage: string, max: number, tooLongMessage: string) {
  return z
    .string({ error: emptyMessage })
    .trim()
    .min(1, { error: emptyMessage })
    .max(max, { error: tooLongMessage })
    .refine(noNul, { error: INVALID_TEXT_MESSAGE });
}

/** Texto opcional: em branco vira `null`. */
function optionalText(max: number, tooLongMessage: string) {
  return z
    .string()
    .nullish()
    .transform((value) => {
      const text = value?.trim();
      return text ? text : null;
    })
    .pipe(z.string().max(max, { error: tooLongMessage }).refine(noNul, { error: INVALID_TEXT_MESSAGE }).nullable());
}

/**
 * Lista de textos: descarta os em branco e confere o tamanho de cada um e a quantidade. A quantidade
 * conta os valores DISTINTOS (`normalizeAlias`, como o banco): repetidos não ocupam vaga.
 */
function textList(max: number, tooLongMessage: string, maxItems: number, tooManyMessage: string) {
  return z
    .array(z.string({ error: "Item inválido na lista." }), { error: "Lista inválida." })
    .transform((items) => items.map((item) => item.trim()).filter((item) => item !== ""))
    .pipe(
      z
        .array(z.string().max(max, { error: tooLongMessage }).refine(noNul, { error: INVALID_TEXT_MESSAGE }))
        .refine((items) => countDistinctKeys(items, normalizeAlias) <= maxItems, { error: tooManyMessage }),
    );
}

const reasonField = z
  .string()
  .nullish()
  .transform((value) => {
    const text = value?.trim();
    return text ? text : null;
  })
  .pipe(
    z
      .string()
      .max(MAX_REASON_LENGTH, { error: `O motivo pode ter no máximo ${MAX_REASON_LENGTH} caracteres.` })
      .refine(noNul, { error: INVALID_TEXT_MESSAGE })
      .nullable(),
  );

function requireVersionWhenEditing(value: { id: string | null; expectedUpdatedAt: string | null }, ctx: z.RefinementCtx) {
  if (value.id !== null && value.expectedUpdatedAt === null) {
    ctx.addIssue({ code: "custom", path: ["expectedUpdatedAt"], message: VERSION_MESSAGE });
  }
}

// -----------------------------------------------------------------------------------------------
// Sócio
// -----------------------------------------------------------------------------------------------

export const partnerSaveSchema = z
  .object({
    /** Nulo ou ausente = sócio novo. */
    id: optionalId,
    name: requiredText("Informe o nome do sócio.", MAX_NAME_LENGTH, "O nome do sócio pode ter no máximo 200 caracteres."),
    /** Estado final dos apelidos ATIVOS. A lista é obrigatória (nulo inativaria todos). */
    aliases: textList(
      MAX_NAME_LENGTH,
      "Um apelido pode ter no máximo 200 caracteres.",
      MAX_PARTNER_ALIASES,
      PARTNER_ALIASES_LIMIT_MESSAGE,
    ),
    expectedUpdatedAt: expectedUpdatedAtField,
    reason: reasonField,
  })
  .superRefine(requireVersionWhenEditing);

export type PartnerSaveInput = z.infer<typeof partnerSaveSchema>;

/**
 * Inativar ou reativar sócio. `confirmedReceiverIds` são os recebedores ativos que o diálogo
 * mostrou (consulta 11.3); o banco compara como conjunto e recusa se mudou.
 */
export const partnerSetActiveSchema = z.object({
  id: uuidSchema("Identificador do sócio inválido."),
  active: z.boolean({ error: "Não foi possível identificar a ação pedida. Atualize a página e tente novamente." }),
  expectedUpdatedAt: updatedAtTextSchema,
  confirmedReceiverIds: z.array(uuidSchema("Identificador de recebedor inválido.")).default([]),
  reason: reasonField,
});

export type PartnerSetActiveInput = z.infer<typeof partnerSetActiveSchema>;

// -----------------------------------------------------------------------------------------------
// Recebedor
// -----------------------------------------------------------------------------------------------

export const ACCOUNT_CHARS_MESSAGE = "Use só números, hífen e a letra X.";
export const INCOMPLETE_ACCOUNT_MESSAGE = "Preencha banco, agência e conta, ou apague os campos.";

export interface AccountProblem {
  /** Campo da conta com problema; `null` = a conta como um todo (incompleta). */
  field: "bankName" | "branch" | "accountNumber" | null;
  message: string;
}

/**
 * Confere uma conta (banco, agência e conta, já aparados) como a UI 7.1 e 7.2 pedem. Os três vazios
 * não é problema (linha em branco). Usada pelo esquema (servidor) e pela tela (ao adicionar), para as
 * duas dizerem a mesma coisa; o banco repete tudo.
 */
export function findAccountProblems(account: { bankName: string; branch: string; accountNumber: string }): AccountProblem[] {
  const filled = [account.bankName, account.branch, account.accountNumber].filter((part) => part !== "").length;
  if (filled === 0) return [];
  if (filled < 3) return [{ field: null, message: INCOMPLETE_ACCOUNT_MESSAGE }];

  const problems: AccountProblem[] = [];
  if (account.bankName.length > MAX_BANK_NAME_LENGTH) {
    problems.push({ field: "bankName", message: "O nome do banco pode ter no máximo 100 caracteres." });
  } else if (hasNul(account.bankName)) {
    problems.push({ field: "bankName", message: INVALID_TEXT_MESSAGE });
  }
  if (!/^[0-9X]{1,6}$/.test(squeezeAccountText(account.branch))) {
    problems.push({ field: "branch", message: ACCOUNT_CHARS_MESSAGE });
  }
  const number = squeezeAccountText(account.accountNumber);
  if (!/^[0-9]*[0-9X]$/.test(number) || number.length > 20) {
    problems.push({ field: "accountNumber", message: ACCOUNT_CHARS_MESSAGE });
  }
  return problems;
}

export type ReceiverIdentifierInput =
  | { type: "NAME_VARIANT"; value: string }
  | { type: "PIX_KEY"; value: string }
  | { type: "BANK_ACCOUNT"; bankName: string; branch: string; accountNumber: string };

/** Um item de identificador como a tela envia; os campos que não são do tipo são ignorados. */
const identifierItem = z
  .object({
    type: z.enum(["NAME_VARIANT", "PIX_KEY", "BANK_ACCOUNT"], { error: "Tipo de identificador inválido." }),
    value: z.string().nullish(),
    bankName: z.string().nullish(),
    branch: z.string().nullish(),
    accountNumber: z.string().nullish(),
  })
  .transform((item): ReceiverIdentifierInput =>
    item.type === "BANK_ACCOUNT"
      ? {
          type: "BANK_ACCOUNT",
          bankName: (item.bankName ?? "").trim(),
          branch: (item.branch ?? "").trim(),
          accountNumber: (item.accountNumber ?? "").trim(),
        }
      : { type: item.type, value: (item.value ?? "").trim() },
  )
  .superRefine((item, ctx) => {
    if (item.type === "NAME_VARIANT") {
      if (item.value.length > MAX_NAME_LENGTH) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "Uma forma do nome pode ter no máximo 200 caracteres." });
      } else if (hasNul(item.value)) {
        ctx.addIssue({ code: "custom", path: ["value"], message: INVALID_TEXT_MESSAGE });
      }
      return;
    }
    if (item.type === "PIX_KEY") {
      if (item.value.length > MAX_PIX_KEY_LENGTH) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "A chave Pix pode ter no máximo 100 caracteres." });
      } else if (hasNul(item.value)) {
        ctx.addIssue({ code: "custom", path: ["value"], message: INVALID_TEXT_MESSAGE });
      }
      return;
    }

    for (const problem of findAccountProblems(item)) {
      ctx.addIssue({ code: "custom", ...(problem.field ? { path: [problem.field] } : {}), message: problem.message });
    }
  });

function isBlankIdentifier(item: ReceiverIdentifierInput): boolean {
  return item.type === "BANK_ACCOUNT"
    ? item.bankName === "" && item.branch === "" && item.accountNumber === ""
    : item.value === "";
}

const IDENTIFIER_LIMITS: Readonly<Record<ReceiverIdentifierInput["type"], { max: number; message: string }>> = {
  NAME_VARIANT: { max: MAX_NAME_VARIANTS, message: NAME_VARIANTS_LIMIT_MESSAGE },
  PIX_KEY: { max: MAX_PIX_KEYS, message: PIX_KEYS_LIMIT_MESSAGE },
  BANK_ACCOUNT: { max: MAX_BANK_ACCOUNTS, message: BANK_ACCOUNTS_LIMIT_MESSAGE },
};

/** Chave aproximada do item (a do banco): dois itens com a mesma chave ocupam uma vaga só. Vazia = não conta. */
function identifierKey(item: ReceiverIdentifierInput): string {
  if (item.type === "BANK_ACCOUNT") return accountKey(item);
  return item.type === "PIX_KEY" ? normalizePixKey(item.value) : normalizeAlias(item.value);
}

const identifiersField = z
  .array(identifierItem, { error: "Lista de identificadores inválida." })
  .superRefine((items, ctx) => {
    // Teto por tipo, só dos itens não vazios e distintos. O problema vai no ÍNDICE do primeiro item acima
    // do teto (índice da lista bruta, como os problemas de cada item), para a tela achar a lista.
    const seen: Record<ReceiverIdentifierInput["type"], Set<string>> = {
      NAME_VARIANT: new Set(),
      PIX_KEY: new Set(),
      BANK_ACCOUNT: new Set(),
    };
    const reported = new Set<ReceiverIdentifierInput["type"]>();
    items.forEach((item, index) => {
      if (isBlankIdentifier(item)) return;
      const key = identifierKey(item);
      if (key === "") return;
      seen[item.type].add(key);
      const limit = IDENTIFIER_LIMITS[item.type];
      if (seen[item.type].size > limit.max && !reported.has(item.type)) {
        reported.add(item.type);
        ctx.addIssue({ code: "custom", path: [index], message: limit.message });
      }
    });
  })
  .transform((items) => items.filter((item) => !isBlankIdentifier(item)));

export const receiverSaveSchema = z
  .object({
    /** Nulo ou ausente = recebedor novo. */
    id: optionalId,
    /** Obrigatório no novo; na edição é o do recebedor (o sócio não muda, R-R02). */
    partnerId: optionalId,
    holderName: requiredText(
      "Informe o nome do titular.",
      MAX_NAME_LENGTH,
      "O nome do titular pode ter no máximo 200 caracteres.",
    ),
    /** Estado final dos identificadores ATIVOS: variações, chaves Pix e contas. */
    identifiers: identifiersField,
    expectedUpdatedAt: expectedUpdatedAtField,
    reason: reasonField,
  })
  .superRefine((value, ctx) => {
    requireVersionWhenEditing(value, ctx);
    if (value.id === null && value.partnerId === null) {
      ctx.addIssue({ code: "custom", path: ["partnerId"], message: "Escolha o sócio do recebedor." });
    }
  });

export type ReceiverSaveInput = z.infer<typeof receiverSaveSchema>;

export const receiverSetActiveSchema = z.object({
  id: uuidSchema("Identificador do recebedor inválido."),
  active: z.boolean({ error: "Não foi possível identificar a ação pedida. Atualize a página e tente novamente." }),
  expectedUpdatedAt: updatedAtTextSchema,
  reason: reasonField,
});

export type ReceiverSetActiveInput = z.infer<typeof receiverSetActiveSchema>;

// -----------------------------------------------------------------------------------------------
// Cliente
// -----------------------------------------------------------------------------------------------

export const DOCUMENT_TYPE_MESSAGE = "Escolha CPF ou CNPJ.";
export const NO_PARTNER_MESSAGE = "Escolha pelo menos um sócio. Todo cliente ativo precisa de um.";

export type ClientAliasInput = { type: "NAME" | "DOCUMENT"; value: string };

/** Apelido do cliente: `NAME` (texto) ou `DOCUMENT` (CPF/CNPJ de quem paga em nome dele, R-A08). */
const clientAliasItem = z
  .object({
    type: z.enum(["NAME", "DOCUMENT"], { error: "Tipo de apelido inválido." }),
    value: z.string().nullish(),
  })
  .transform((item) => ({ type: item.type, value: (item.value ?? "").trim() }))
  .superRefine((item, ctx) => {
    if (item.value === "") return; // linha vazia: descartada depois
    if (item.type === "NAME" && item.value.length > MAX_NAME_LENGTH) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "Um apelido pode ter no máximo 200 caracteres." });
    } else if (item.type === "NAME" && hasNul(item.value)) {
      ctx.addIssue({ code: "custom", path: ["value"], message: INVALID_TEXT_MESSAGE });
    }
    if (item.type === "DOCUMENT") {
      const parsed = parseDocumentInput(item.value);
      if (!parsed.ok) ctx.addIssue({ code: "custom", path: ["value"], message: parsed.message });
    }
  });

const clientAliasesField = z
  .array(clientAliasItem, { error: "Lista de apelidos inválida." })
  .superRefine((items, ctx) => {
    // Teto por tipo (RAT-D026): nomes e documentos (CPF e CNPJ juntos) contam à parte, só os itens não
    // vazios e distintos. O problema vai no ÍNDICE bruto do primeiro item acima do teto do tipo, com a
    // frase do tipo.
    const seen: Record<ClientAliasInput["type"], Set<string>> = { NAME: new Set(), DOCUMENT: new Set() };
    const reported = new Set<ClientAliasInput["type"]>();
    items.forEach((item, index) => {
      if (item.value === "") return;
      const key = clientAliasKey(item);
      if (key === "N:" || key === "D:") return; // só pontuação ou número ilegível: o item já tem o erro próprio
      seen[item.type].add(key);
      const limit = CLIENT_ALIAS_LIMITS[item.type];
      if (seen[item.type].size > limit.max && !reported.has(item.type)) {
        reported.add(item.type);
        ctx.addIssue({ code: "custom", path: [index], message: limit.message });
      }
    });
  })
  .transform((items) => items.filter((item) => item.value !== "") as ClientAliasInput[]);

export interface ClientSaveSchemaOptions {
  /**
   * Cliente inativo pode ficar sem sócio (R-C10); o ativo, nunca. O esquema não sabe a situação do
   * cliente: quem chama passa `true` só ao editar um cliente inativo. O banco confere de novo.
   */
  allowEmptyPartners?: boolean;
}

/**
 * Cadastro e edição de cliente. Saída pronta para `save_client`: documento canônico (ou `null`),
 * mensalidade em texto decimal ("1234.56"), listas sem linhas em branco e versão em texto.
 */
export function buildClientSaveSchema(options: ClientSaveSchemaOptions = {}) {
  return z
    .object({
      /** Nulo ou ausente = cliente novo. */
      id: optionalId,
      legalName: requiredText(
        "Informe o nome ou a razão social.",
        MAX_NAME_LENGTH,
        "O nome ou a razão social pode ter no máximo 200 caracteres.",
      ),
      tradeName: optionalText(MAX_NAME_LENGTH, "O nome fantasia pode ter no máximo 200 caracteres."),
      /** Tipo escolhido na tela (rádio). Sem ele, o tipo vem do tamanho do número. */
      documentType: z.enum(["CPF", "CNPJ"], { error: DOCUMENT_TYPE_MESSAGE }).nullish(),
      /** Número como digitado; vazio = sem documento (opcional, RAT-D024). */
      document: z.string().nullish(),
      /** Mensalidade como digitada ("1.234,56"). */
      monthlyValue: z.string({ error: "Informe o valor da mensalidade." }),
      notes: optionalText(MAX_NOTES_LENGTH, "As observações podem ter no máximo 2000 caracteres."),
      partnerIds: z
        .array(uuidSchema("Identificador de sócio inválido."), { error: "Lista de sócios inválida." })
        .transform((ids) => [...new Set(ids)]),
      aliases: clientAliasesField,
      expectedUpdatedAt: expectedUpdatedAtField,
      /** Clientes do aviso de nome repetido que o Administrador confirmou (R-C15). */
      acknowledgedDuplicateIds: z.array(uuidSchema("Identificador de cliente inválido.")).default([]),
      reason: reasonField,
    })
    .superRefine((value, ctx) => {
      // Todas as conferências juntas, para a tela mostrar todos os erros de uma vez.
      requireVersionWhenEditing(value, ctx);
      if (!options.allowEmptyPartners && value.partnerIds.length === 0) {
        ctx.addIssue({ code: "custom", path: ["partnerIds"], message: NO_PARTNER_MESSAGE });
      }

      const expected = value.documentType ?? undefined;
      const document = parseDocumentInput(value.document, expected);
      if (!document.ok) {
        ctx.addIssue({ code: "custom", path: ["document"], message: document.message });
      } else if (document.canonical === null && expected) {
        ctx.addIssue({
          code: "custom",
          path: ["document"],
          message: `Digite o número do ${expected} ou escolha “Sem documento”.`,
        });
      }

      const money = parseMoneyInput(value.monthlyValue);
      if (!money.ok) ctx.addIssue({ code: "custom", path: ["monthlyValue"], message: money.message });
    })
    .transform((value) => {
      // Só roda se o superRefine não achou problema: documento e mensalidade são válidos.
      const document = parseDocumentInput(value.document, value.documentType ?? undefined);
      const money = parseMoneyInput(value.monthlyValue);
      if (!document.ok || !money.ok) return z.NEVER;

      return {
        id: value.id,
        legalName: value.legalName,
        tradeName: value.tradeName,
        document: document.canonical,
        documentType: document.type,
        monthlyValue: money.decimal,
        notes: value.notes,
        partnerIds: value.partnerIds,
        aliases: value.aliases,
        expectedUpdatedAt: value.expectedUpdatedAt,
        acknowledgedDuplicateIds: [...new Set(value.acknowledgedDuplicateIds)],
        reason: value.reason,
      };
    });
}

/** Esquema padrão: cliente ativo, ao menos um sócio. */
export const clientSaveSchema = buildClientSaveSchema();

export type ClientSaveInput = z.infer<typeof clientSaveSchema>;

export const clientSetActiveSchema = z.object({
  id: uuidSchema("Identificador do cliente inválido."),
  active: z.boolean({ error: "Não foi possível identificar a ação pedida. Atualize a página e tente novamente." }),
  expectedUpdatedAt: updatedAtTextSchema,
  reason: reasonField,
});

export type ClientSetActiveInput = z.infer<typeof clientSetActiveSchema>;

// -----------------------------------------------------------------------------------------------
// Buscas
// -----------------------------------------------------------------------------------------------

export const ROW_STATUSES = ["ACTIVE", "INACTIVE", "ALL"] as const;
export type RowStatus = (typeof ROW_STATUSES)[number];

const queryField = z
  .string()
  .nullish()
  .transform((value) => {
    // NUL na busca é tirado, nunca erro: a busca não grava nada e não pode derrubar a página (QA-CAD-05).
    const text = value === null || value === undefined ? undefined : stripNul(value).trim();
    return text ? text : null;
  })
  .pipe(z.string().max(MAX_SEARCH_QUERY_LENGTH, { error: "A busca pode ter no máximo 200 caracteres." }).nullable());

const statusField = z.enum(ROW_STATUSES, { error: "Situação inválida." }).default("ACTIVE");

const limitField = (fallback: number) =>
  z.number({ error: "Limite inválido." }).int({ error: "Limite inválido." }).min(1, { error: "Limite inválido." }).max(100, { error: "Limite inválido." }).default(fallback);

const offsetField = z.number({ error: "Página inválida." }).int({ error: "Página inválida." }).min(0, { error: "Página inválida." }).default(0);

export const searchClientsSchema = z.object({
  query: queryField,
  status: statusField,
  limit: limitField(25),
  offset: offsetField,
  /** Só os clientes com indicação ativa deste sócio (E6a). Vazio ou ausente: sem filtro. */
  partnerId: uuidSchema("Identificador do sócio inválido.").nullish().transform((value) => value ?? null),
});

export type SearchClientsInput = z.infer<typeof searchClientsSchema>;

export const ALIAS_KINDS = ["PARTNER_ALIAS", "CLIENT_ALIAS", "NAME_VARIANT", "PIX_KEY", "BANK_ACCOUNT"] as const;
export type AliasKind = (typeof ALIAS_KINDS)[number];

export const searchAliasesSchema = z.object({
  query: queryField,
  kind: z.enum(ALIAS_KINDS, { error: "Tipo inválido." }).nullish().transform((value) => value ?? null),
  status: statusField,
  limit: limitField(50),
  offset: offsetField,
});

export type SearchAliasesInput = z.infer<typeof searchAliasesSchema>;

/** Página (1, 2, 3...) -> deslocamento da busca. Páginas inválidas viram a primeira. */
export function pageToOffset(page: number, pageSize: number): number {
  return Number.isInteger(page) && page > 1 ? (page - 1) * pageSize : 0;
}

// -----------------------------------------------------------------------------------------------
// Erros de campo para a tela
// -----------------------------------------------------------------------------------------------

/** Primeira mensagem de cada caminho, com o caminho em texto ("aliases.1.value"). */
export type FieldErrors = Record<string, string>;

export function fieldErrorsFromZod(error: z.ZodError): FieldErrors {
  const result: FieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path.map(String).join(".") || "_form";
    if (!(path in result)) result[path] = issue.message;
  }
  return result;
}
