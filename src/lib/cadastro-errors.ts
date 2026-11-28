/**
 * Contrato de erros dos cadastros (CAD-001, modelagem 6.3 e extensão da E3b).
 *
 * As funções do banco levantam erros com SQLSTATE, `hint` (chave estável em MAIÚSCULAS) e, às
 * vezes, `detail` (JSON). Aqui o `hint` é traduzido para uma mensagem em pt-BR (os textos exatos
 * vêm de `03-ui-ux.md`) e o `detail` é validado com zod antes de ser usado.
 *
 * Regras:
 *  - A mensagem mostrada vem SEMPRE desta tabela; o texto do banco nunca vai para a tela.
 *  - O `detail` só é lido para montar a mensagem e a lista que a tela exibe (dono do documento,
 *    clientes que bloqueiam, recebedores, parecidos). Se vier malformado, a mensagem sai sem ele.
 *  - Um hint só vale com o SQLSTATE do contrato; hint estranho (ex.: texto de ajuda do PostgREST)
 *    é ignorado e o erro cai no mapa por SQLSTATE de `errors.ts`.
 *  - O banco só monta `detail` com dados de terceiros depois de `private.require_admin()`.
 *
 * Sem dependência de Next, banco ou navegador.
 */

import { z } from "zod";

import { LIST_LIMITS, LIST_LIMIT_GENERIC_MESSAGE, listLimitMessage, type ListLimitKey } from "@/domain/cadastros/limits";
import { documentTypeOf, normalizeDocument } from "@/domain/documents/document";

import type { AppErrorCode, DatabaseErrorLike } from "./errors";

// -----------------------------------------------------------------------------------------------
// Tipos públicos
// -----------------------------------------------------------------------------------------------

export const CADASTRO_HINTS = [
  "ADMIN_REQUIRED",
  "NOT_FOUND",
  "VERSION_REQUIRED",
  "STALE_VERSION",
  "NAME_REQUIRED",
  "NAME_TOO_LONG",
  "NOTES_TOO_LONG",
  "INVALID_DOCUMENT",
  "INVALID_AMOUNT",
  "INVALID_PIX_KEY",
  "INVALID_BANK",
  "INVALID_BRANCH",
  "INVALID_ACCOUNT",
  "INVALID_IDENTIFIER",
  "ACTIVE_REQUIRED",
  "LIST_REQUIRED",
  "INVALID_FILTER",
  "DOCUMENT_TAKEN",
  "ALIAS_TAKEN",
  "PARTNER_NAME_TAKEN",
  "IDENTIFIER_TAKEN",
  "PARTNER_INACTIVE",
  "PARTNER_HAS_CLIENTS",
  "RECEIVERS_CHANGED",
  "PARTNER_HAS_ACTIVE_RECEIVERS",
  "CLIENT_WITHOUT_PARTNER",
  "POSSIBLE_DUPLICATE",
  "RECEIVER_PARTNER_IMMUTABLE",
  "IMMUTABLE_FIELD",
  "LIST_LIMIT_EXCEEDED",
] as const;

export type CadastroHint = (typeof CADASTRO_HINTS)[number];

export function isCadastroHint(value: unknown): value is CadastroHint {
  return typeof value === "string" && (CADASTRO_HINTS as readonly string[]).includes(value);
}

/** Tipos de identificador do recebedor (`identifier_type` do banco). */
export type ReceiverIdentifierKind = "NAME_VARIANT" | "PIX_KEY" | "BANK_ACCOUNT";

/** De quem é o cadastro afetado (muda o texto de alguns erros). */
export type CadastroSubject = "partner" | "client" | "receiver";

/**
 * O que quem chama sabe e o banco não diz. Tudo opcional; sem contexto a mensagem sai genérica
 * ("documento", "Este sócio") e nunca errada.
 */
export interface DatabaseErrorContext {
  subject?: CadastroSubject;
  /** Nome do cadastro afetado (ex.: o sócio que se tenta inativar), para a frase de bloqueio. */
  subjectName?: string;
  /** Tipo do documento digitado (11 caracteres = CPF, 14 = CNPJ), para "CPF inválido" etc. */
  documentLabel?: "CPF" | "CNPJ";
  /** `activate`: reativação (set_*_active com true); `deactivate`: inativação; `save`: o resto. */
  operation?: "save" | "activate" | "deactivate";
}

/** Dono do valor que já está em uso (documento, apelido, nome ou identificador). */
export interface ErrorOwner {
  kind: "client" | "partner" | "receiver";
  id: string;
  name: string;
  active: boolean;
  /** Só para dono sócio: por onde o nome colidiu. */
  via?: "NAME" | "ALIAS" | "NAME_VARIANT";
  /** Só para dono recebedor. */
  partnerId?: string;
  partnerName?: string;
}

export interface DuplicateMatch {
  id: string;
  name: string;
  document: string | null;
  documentType: string | null;
  active: boolean;
  match: "SAME_NAME" | "SAME_ALIAS";
}

/** Dados estruturados que a tela usa junto com a mensagem. Discriminado por `hint`. */
export type CadastroErrorDetails =
  | { hint: "STALE_VERSION"; currentUpdatedAt: string | null }
  | {
      hint: "DOCUMENT_TAKEN" | "ALIAS_TAKEN" | "PARTNER_NAME_TAKEN";
      field: string | null;
      value: string | null;
      owner: ErrorOwner;
    }
  | {
      hint: "IDENTIFIER_TAKEN";
      field: string | null;
      /** Qual lista do recebedor tem o valor repetido; `null` se o banco não disse. */
      identifierType: ReceiverIdentifierKind | null;
      value: string | null;
      owner: ErrorOwner;
    }
  | { hint: "PARTNER_INACTIVE"; partners: Array<{ id: string; name: string }> }
  | { hint: "PARTNER_HAS_CLIENTS"; clients: Array<{ id: string; name: string; active: boolean }> }
  | { hint: "RECEIVERS_CHANGED"; receivers: Array<{ id: string; name: string }> }
  | { hint: "POSSIBLE_DUPLICATE"; matches: DuplicateMatch[] }
  /** Lista acima do teto (RAT-D026): qual lista e o teto que o banco aplicou; `null` se o banco não disse. */
  | { hint: "LIST_LIMIT_EXCEEDED"; list: ListLimitKey | null; max: number | null };

export interface MappedCadastroError {
  code: AppErrorCode;
  hint: CadastroHint;
  message: string;
  /** Nome do campo do formulário (camelCase), quando o erro aponta um campo. */
  field?: string;
  details?: CadastroErrorDetails;
}

// -----------------------------------------------------------------------------------------------
// Campos: nome no banco -> nome no formulário
// -----------------------------------------------------------------------------------------------

const FORM_FIELD: Readonly<Record<string, string>> = {
  name: "name",
  aliases: "aliases",
  identifiers: "identifiers",
  holder_name: "holderName",
  legal_name: "legalName",
  trade_name: "tradeName",
  document: "document",
  default_monthly_value: "monthlyValue",
  partner_ids: "partnerIds",
  partner_id: "partnerId",
  notes: "notes",
  status: "status",
  kind: "kind",
  limit: "limit",
  offset: "offset",
};

function formField(dbField: string | null | undefined): string | undefined {
  return dbField ? FORM_FIELD[dbField] : undefined;
}

// -----------------------------------------------------------------------------------------------
// `detail` (JSON do banco) validado com zod
// -----------------------------------------------------------------------------------------------

const uuid = z.string().min(1);

const fieldSchema = z.object({ field: z.string().optional(), value: z.string().nullish() });

const staleSchema = z.object({ current_updated_at: z.string().nullish() });

const ownerSchema = z.object({
  kind: z.enum(["client", "partner", "receiver"]),
  id: uuid,
  name: z.string(),
  active: z.boolean(),
  via: z.enum(["NAME", "ALIAS", "NAME_VARIANT"]).optional(),
  partner_id: z.string().optional(),
  partner_name: z.string().optional(),
});

const takenSchema = z.object({
  field: z.string().nullish(),
  value: z.string().nullish(),
  owner: ownerSchema,
});

const identifierTakenSchema = takenSchema.extend({
  identifier_type: z.enum(["NAME_VARIANT", "PIX_KEY", "BANK_ACCOUNT"]).nullish(),
});

const partnersSchema = z.object({ partners: z.array(z.object({ id: uuid, name: z.string() })) });
const clientsSchema = z.object({
  clients: z.array(z.object({ id: uuid, name: z.string(), active: z.boolean() })),
});
const receiversSchema = z.object({ receivers: z.array(z.object({ id: uuid, name: z.string() })) });
const matchesSchema = z.object({
  matches: z.array(
    z.object({
      id: uuid,
      name: z.string(),
      document: z.string().nullish(),
      document_type: z.string().nullish(),
      active: z.boolean(),
      match: z.enum(["SAME_NAME", "SAME_ALIAS"]),
    }),
  ),
});

/**
 * `detail` do teto de itens (RAT-D026). Tudo opcional e tolerante: a leitura nunca quebra por faltar
 * um campo, e um `list` ou `max` inválido vira `null` (a mensagem cai na frase genérica).
 */
const listLimitSchema = z.object({
  field: z.string().optional().catch(undefined),
  list: z.enum(Object.keys(LIST_LIMITS) as [ListLimitKey, ...ListLimitKey[]]).optional().catch(undefined),
  max: z.number().int().positive().optional().catch(undefined),
  alias_type: z.enum(["NAME", "DOCUMENT"]).optional().catch(undefined),
  identifier_type: z.enum(["NAME_VARIANT", "PIX_KEY", "BANK_ACCOUNT"]).optional().catch(undefined),
});

function parseDetail<T extends z.ZodType>(schema: T, detail: string | null | undefined): z.infer<T> | null {
  if (!detail) return null;
  let json: unknown;
  try {
    json = JSON.parse(detail);
  } catch {
    return null;
  }
  const parsed = schema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

// -----------------------------------------------------------------------------------------------
// Mensagens
// -----------------------------------------------------------------------------------------------

/** "A", "A e B", "A, B e C". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

function documentMessage(label: "CPF" | "CNPJ" | undefined): string {
  if (label === "CPF") return "CPF inválido. Confira os números.";
  if (label === "CNPJ") return "CNPJ inválido. Confira os números e as letras.";
  return "Documento inválido. Confira os números e as letras.";
}

function nameRequiredMessage(field: string | undefined): string {
  switch (field) {
    case "name":
      return "Informe o nome do sócio.";
    case "holder_name":
      return "Informe o nome do titular.";
    case "legal_name":
      return "Informe o nome ou a razão social.";
    case "trade_name":
      return "O nome fantasia não pode ter só pontuação. Preencha ou apague o campo.";
    case "aliases":
      return "Há um apelido em branco ou só com pontuação. Preencha ou remova.";
    case "identifiers":
      return "Há uma forma do nome em branco ou só com pontuação. Preencha ou remova.";
    default:
      return "Informe o nome.";
  }
}

function nameTooLongMessage(field: string | undefined): string {
  switch (field) {
    case "name":
      return "O nome do sócio pode ter no máximo 200 caracteres.";
    case "holder_name":
      return "O nome do titular pode ter no máximo 200 caracteres.";
    case "legal_name":
      return "O nome ou a razão social pode ter no máximo 200 caracteres.";
    case "trade_name":
      return "O nome fantasia pode ter no máximo 200 caracteres.";
    case "aliases":
      return "Um apelido pode ter no máximo 200 caracteres.";
    case "identifiers":
      return "Uma forma do nome pode ter no máximo 200 caracteres.";
    default:
      return "O texto informado é longo demais (máximo de 200 caracteres).";
  }
}

function staleMessage(subject: CadastroSubject | undefined, operation?: DatabaseErrorContext["operation"]): string {
  const noun = subject === "client" ? "cliente" : subject === "partner" ? "sócio" : subject === "receiver" ? "recebedor" : null;
  // T-18: inativar/reativar não é edição; a pessoa não tinha alterações a perder.
  if (operation === "activate" || operation === "deactivate") {
    const done = operation === "activate" ? "A reativação não foi feita." : "A inativação não foi feita.";
    return `${noun ? `Este ${noun}` : "Este cadastro"} foi alterado por outra pessoa. ${done} Atualize a tela e tente de novo.`;
  }
  return noun
    ? `Este ${noun} foi alterado enquanto você editava. Suas alterações não foram salvas.`
    : "Este cadastro foi alterado por outra pessoa enquanto você editava. Suas alterações não foram salvas.";
}

function partnerNameTakenMessage(field: string | null | undefined, owner: ErrorOwner): string {
  const name = owner.name;
  if (field === "identifiers") {
    return `Este nome já é usado pelo sócio ${name}. Use um nome que identifique só este recebedor.`;
  }
  if (field === "aliases") {
    if (owner.via === "NAME") return `Este apelido já é o nome do sócio ${name}.`;
    if (owner.via === "ALIAS") return `Este apelido já pertence ao sócio ${name}.`;
    if (owner.via === "NAME_VARIANT") return `Este apelido já é usado por um recebedor do sócio ${name}.`;
    return `Este apelido já pertence ao sócio ${name}.`;
  }
  // field === "name" (ou desconhecido): nome do sócio.
  if (owner.via === "ALIAS") return `Este nome já é um apelido do sócio ${name}.`;
  if (owner.via === "NAME_VARIANT") return `Este nome já é usado por um recebedor do sócio ${name}.`;
  return owner.active
    ? "Já existe um sócio com este nome. Nomes que só mudam em acento, maiúscula ou pontuação contam como o mesmo."
    : "Já existe um sócio inativo com este nome. Para voltar a usar este cadastro, reative-o.";
}

/** "banco exemplo|1|111111" (valor normalizado da conta) -> "Banco banco exemplo · Ag. 1 · Conta 111111". */
function describeNormalizedAccount(value: string): string | null {
  const parts = value.split("|");
  if (parts.length !== 3 || parts.some((part) => part === "")) return null;
  return `Banco ${parts[0]} · Ag. ${parts[1]} · Conta ${parts[2]}`;
}

/**
 * Identificador repetido (I-12). As frases por tipo são as da UI 7.2; na reativação, a da UI 6.5.
 * Sem o tipo (detail antigo) a frase cobre os três.
 */
function identifierTakenMessage(
  type: ReceiverIdentifierKind | null,
  value: string | null | undefined,
  owner: ErrorOwner,
  operation: DatabaseErrorContext["operation"],
): string {
  const where = owner.partnerName
    ? `no recebedor ${owner.name}, do sócio ${owner.partnerName}`
    : `no recebedor ${owner.name}`;

  if (operation === "activate" && (type === "PIX_KEY" || type === "BANK_ACCOUNT") && value) {
    const what = type === "PIX_KEY" ? `a chave Pix ${value}` : `a conta ${describeNormalizedAccount(value) ?? value}`;
    const by = owner.partnerName
      ? `pelo recebedor ${owner.name}, do sócio ${owner.partnerName}`
      : `pelo recebedor ${owner.name}`;
    return `Não foi possível reativar: ${what} já está em uso ${by}. Retire do cadastro de um dos dois e tente de novo.`;
  }

  switch (type) {
    case "PIX_KEY":
      return `Esta chave Pix já está cadastrada ${where}.`;
    case "BANK_ACCOUNT":
      return `Esta conta já está cadastrada ${where}.`;
    case "NAME_VARIANT":
      return `Esta forma do nome já está cadastrada ${where}.`;
    default:
      return `Esta chave Pix, conta ou forma do nome já está cadastrada ${where}.`;
  }
}

function documentTakenMessage(
  field: string | null | undefined,
  owner: ErrorOwner,
  label: "CPF" | "CNPJ" | undefined,
): string {
  if (field === "aliases") return `Este documento já é o documento do cliente ${owner.name}.`;
  const what = label ?? "documento";
  return owner.active
    ? `Já existe um cliente com este ${what}: ${owner.name}.`
    : `Já existe um cliente inativo com este ${what}: ${owner.name}. Para voltar a usar este cadastro, reative-o.`;
}

// -----------------------------------------------------------------------------------------------
// Tabela de hints
// -----------------------------------------------------------------------------------------------

interface HintInput {
  detail: string | null | undefined;
  context: DatabaseErrorContext;
}

interface HintOutput {
  message: string;
  field?: string;
  details?: CadastroErrorDetails;
}

interface HintSpec {
  /** SQLSTATE com que o banco levanta este hint (contrato 6.3). */
  sqlstates: readonly string[];
  code: AppErrorCode;
  build(input: HintInput): HintOutput;
}

function withField(detail: string | null | undefined): { field: string | undefined; value: string | null | undefined } {
  const parsed = parseDetail(fieldSchema, detail);
  return { field: parsed?.field, value: parsed?.value };
}

function fieldOutput(message: string, dbField: string | undefined): HintOutput {
  const field = formField(dbField);
  return field ? { message, field } : { message };
}

const GENERIC_LIST_MESSAGE = "Não foi possível ler a lista enviada. Atualize a página e tente novamente.";

const HINTS: Readonly<Record<CadastroHint, HintSpec>> = {
  ADMIN_REQUIRED: {
    sqlstates: ["42501"],
    code: "FORBIDDEN",
    build: () => ({ message: "Você não tem permissão para fazer esta alteração." }),
  },

  NOT_FOUND: {
    sqlstates: ["P0002"],
    code: "NOT_FOUND",
    build: ({ detail }) => {
      const { field } = withField(detail);
      if (field === "partner_ids") {
        return fieldOutput("O sócio escolhido não foi encontrado. Atualize a página e escolha de novo.", field);
      }
      if (field === "partner_id") return fieldOutput("O sócio deste recebedor não foi encontrado.", field);
      return { message: "Este cadastro não está mais disponível." };
    },
  },

  VERSION_REQUIRED: {
    sqlstates: ["22023"],
    code: "VALIDATION",
    build: () => ({
      message: "Não foi possível identificar a versão do cadastro. Atualize a página e tente novamente.",
    }),
  },

  STALE_VERSION: {
    sqlstates: ["P0001"],
    code: "CONFLICT",
    build: ({ detail, context }) => {
      const parsed = parseDetail(staleSchema, detail);
      return {
        message: staleMessage(context.subject, context.operation),
        details: { hint: "STALE_VERSION", currentUpdatedAt: parsed?.current_updated_at ?? null },
      };
    },
  },

  NAME_REQUIRED: {
    sqlstates: ["22023"],
    code: "VALIDATION",
    build: ({ detail }) => {
      const { field } = withField(detail);
      return fieldOutput(nameRequiredMessage(field), field);
    },
  },

  NAME_TOO_LONG: {
    sqlstates: ["22023"],
    code: "VALIDATION",
    build: ({ detail }) => {
      const { field } = withField(detail);
      return fieldOutput(nameTooLongMessage(field), field);
    },
  },

  NOTES_TOO_LONG: {
    sqlstates: ["22023"],
    code: "VALIDATION",
    build: () => fieldOutput("As observações podem ter no máximo 2000 caracteres.", "notes"),
  },

  INVALID_DOCUMENT: {
    sqlstates: ["22023"],
    code: "VALIDATION",
    build: ({ detail, context }) => {
      const { field, value } = withField(detail);
      // Documento do campo: o tipo vem do contexto; apelido-documento: do tamanho do valor enviado.
      const label = field === "aliases" ? documentTypeOf(normalizeDocument(value)) ?? undefined : context.documentLabel;
      return fieldOutput(documentMessage(label), field ?? "document");
    },
  },

  INVALID_AMOUNT: {
    sqlstates: ["22023"],
    code: "VALIDATION",
    build: () =>
      fieldOutput(
        "Valor da mensalidade inválido. Informe um valor maior que zero, com no máximo 2 casas depois da vírgula.",
        "default_monthly_value",
      ),
  },

  INVALID_PIX_KEY: {
    sqlstates: ["22023"],
    code: "VALIDATION",
    build: () =>
      fieldOutput("Chave Pix inválida. Digite a chave exatamente como aparece no comprovante.", "identifiers"),
  },

  INVALID_BANK: {
    sqlstates: ["22023"],
    code: "VALIDATION",
    build: () => fieldOutput("Informe o banco da conta, como aparece no comprovante.", "identifiers"),
  },

  INVALID_BRANCH: {
    sqlstates: ["22023"],
    code: "VALIDATION",
    build: () => fieldOutput("Agência inválida. Use só números, hífen e a letra X.", "identifiers"),
  },

  INVALID_ACCOUNT: {
    sqlstates: ["22023"],
    code: "VALIDATION",
    build: () => fieldOutput("Conta inválida. Use só números, hífen e a letra X.", "identifiers"),
  },

  INVALID_IDENTIFIER: {
    sqlstates: ["22023"],
    code: "VALIDATION",
    build: ({ detail }) => {
      const { field } = withField(detail);
      return fieldOutput("Há um item fora do formato na lista. Confira os dados e tente novamente.", field);
    },
  },

  ACTIVE_REQUIRED: {
    sqlstates: ["22023"],
    code: "VALIDATION",
    build: () => ({ message: "Não foi possível identificar a ação pedida. Atualize a página e tente novamente." }),
  },

  LIST_REQUIRED: {
    sqlstates: ["22023"],
    code: "VALIDATION",
    build: ({ detail }) => {
      const { field } = withField(detail);
      return fieldOutput(GENERIC_LIST_MESSAGE, field);
    },
  },

  INVALID_FILTER: {
    sqlstates: ["22023"],
    code: "VALIDATION",
    build: ({ detail }) => {
      const { field } = withField(detail);
      return fieldOutput("O filtro informado não é válido. Ajuste a busca e tente novamente.", field);
    },
  },

  DOCUMENT_TAKEN: {
    sqlstates: ["23505"],
    code: "CONFLICT",
    build: ({ detail, context }) => {
      const parsed = parseDetail(takenSchema, detail);
      if (!parsed) {
        return fieldOutput(`Já existe um cliente com este ${context.documentLabel ?? "documento"}.`, "document");
      }
      const owner = toOwner(parsed.owner);
      return {
        ...fieldOutput(documentTakenMessage(parsed.field, owner, context.documentLabel), parsed.field ?? "document"),
        details: { hint: "DOCUMENT_TAKEN", field: parsed.field ?? null, value: parsed.value ?? null, owner },
      };
    },
  },

  ALIAS_TAKEN: {
    sqlstates: ["23505"],
    code: "CONFLICT",
    build: ({ detail }) => {
      const parsed = parseDetail(takenSchema, detail);
      if (!parsed) return fieldOutput("Este apelido já pertence a outro cliente.", "aliases");
      const owner = toOwner(parsed.owner);
      return {
        ...fieldOutput(`Este apelido já pertence ao cliente ${owner.name}.`, parsed.field ?? "aliases"),
        details: { hint: "ALIAS_TAKEN", field: parsed.field ?? null, value: parsed.value ?? null, owner },
      };
    },
  },

  PARTNER_NAME_TAKEN: {
    sqlstates: ["23505"],
    code: "CONFLICT",
    build: ({ detail }) => {
      const parsed = parseDetail(takenSchema, detail);
      if (!parsed) return { message: "Este nome já pertence a outro sócio." };
      const owner = toOwner(parsed.owner);
      return {
        ...fieldOutput(partnerNameTakenMessage(parsed.field, owner), parsed.field ?? "name"),
        details: { hint: "PARTNER_NAME_TAKEN", field: parsed.field ?? null, value: parsed.value ?? null, owner },
      };
    },
  },

  IDENTIFIER_TAKEN: {
    sqlstates: ["23505"],
    code: "CONFLICT",
    build: ({ detail, context }) => {
      const parsed = parseDetail(identifierTakenSchema, detail);
      if (!parsed) return fieldOutput("Este item já está cadastrado em outro recebedor.", "identifiers");
      const owner = toOwner(parsed.owner);
      const identifierType = parsed.identifier_type ?? null;
      return {
        ...fieldOutput(identifierTakenMessage(identifierType, parsed.value, owner, context.operation), parsed.field ?? "identifiers"),
        details: {
          hint: "IDENTIFIER_TAKEN",
          field: parsed.field ?? null,
          identifierType,
          value: parsed.value ?? null,
          owner,
        },
      };
    },
  },

  PARTNER_INACTIVE: {
    sqlstates: ["P0001"],
    code: "RULE_VIOLATION",
    build: ({ detail, context }) => {
      const parsed = parseDetail(partnersSchema, detail);
      const partners = parsed?.partners ?? [];
      const names = partners.map((partner) => partner.name);
      const details: CadastroErrorDetails = { hint: "PARTNER_INACTIVE", partners };

      if (context.subject === "receiver") {
        const who = names.length === 1 ? `O sócio ${names[0]}` : "O sócio";
        return {
          message: `${who} está inativo. Reative o sócio antes de cadastrar ou reativar um recebedor.`,
          details,
        };
      }
      if (names.length === 0) {
        return fieldOutput("Há sócio inativo na lista. Desmarque-o ou escolha outro.", "partner_ids");
      }
      const message =
        names.length === 1
          ? `O sócio ${names[0]} foi inativado e não pode mais ser indicado. Desmarque-o ou escolha outro.`
          : `Os sócios ${joinNames(names)} foram inativados e não podem mais ser indicados. Desmarque-os ou escolha outros.`;
      return { ...fieldOutput(message, "partner_ids"), details };
    },
  },

  PARTNER_HAS_CLIENTS: {
    sqlstates: ["P0001"],
    code: "RULE_VIOLATION",
    build: ({ detail, context }) => {
      const parsed = parseDetail(clientsSchema, detail);
      const clients = parsed?.clients ?? [];
      const who = context.subjectName ?? "O sócio";
      const count = clients.length;
      const where = count === 0 ? "em clientes" : count === 1 ? "em 1 cliente" : `em ${count} clientes`;
      return {
        message: `${who} ainda está indicado ${where}, entre ativos e inativos. Para inativar, primeiro retire este sócio de todos eles.`,
        details: { hint: "PARTNER_HAS_CLIENTS", clients },
      };
    },
  },

  RECEIVERS_CHANGED: {
    sqlstates: ["P0001"],
    code: "RULE_VIOLATION",
    build: ({ detail }) => {
      const parsed = parseDetail(receiversSchema, detail);
      return {
        message: "A lista de recebedores deste sócio mudou. Confira a lista atualizada e confirme de novo.",
        details: { hint: "RECEIVERS_CHANGED", receivers: parsed?.receivers ?? [] },
      };
    },
  },

  PARTNER_HAS_ACTIVE_RECEIVERS: {
    sqlstates: ["P0001"],
    code: "RULE_VIOLATION",
    build: () => ({
      message: "O sócio ainda tem recebedores ativos. Atualize a página, confira a lista e tente de novo.",
    }),
  },

  CLIENT_WITHOUT_PARTNER: {
    sqlstates: ["P0001", "23514"],
    code: "RULE_VIOLATION",
    build: ({ context }) =>
      context.operation === "activate"
        ? {
            message:
              "Este cliente não tem sócio ativo. Indique pelo menos um sócio na edição e tente reativar de novo.",
          }
        : fieldOutput("Escolha pelo menos um sócio. Todo cliente ativo precisa de um.", "partner_ids"),
  },

  POSSIBLE_DUPLICATE: {
    sqlstates: ["P0001"],
    code: "RULE_VIOLATION",
    build: ({ detail }) => {
      const parsed = parseDetail(matchesSchema, detail);
      const matches: DuplicateMatch[] = (parsed?.matches ?? []).map((match) => ({
        id: match.id,
        name: match.name,
        document: match.document ?? null,
        documentType: match.document_type ?? null,
        active: match.active,
        match: match.match,
      }));
      return {
        message:
          "Já existe um cliente com nome ou apelido igual. Confira se não é o mesmo cliente. Se for outra filial ou outra pessoa com o mesmo nome, você pode salvar mesmo assim.",
        details: { hint: "POSSIBLE_DUPLICATE", matches },
      };
    },
  },

  RECEIVER_PARTNER_IMMUTABLE: {
    sqlstates: ["P0001"],
    code: "RULE_VIOLATION",
    build: () => ({
      message: "O sócio de um recebedor não pode ser trocado. Inative este recebedor e cadastre outro.",
    }),
  },

  IMMUTABLE_FIELD: {
    sqlstates: ["P0001"],
    code: "RULE_VIOLATION",
    build: () => ({ message: "Este dado não pode ser alterado depois de cadastrado." }),
  },

  // O zod recusa antes (o `limits.ts` espelha o banco); isto cobre a chamada direta e a corrida.
  LIST_LIMIT_EXCEEDED: {
    sqlstates: ["22023"],
    code: "VALIDATION",
    build: ({ detail }) => {
      const parsed = parseDetail(listLimitSchema, detail);
      const list = parsed?.list ?? null;
      const max = parsed?.max ?? null;
      const message = list !== null && max !== null ? listLimitMessage(list, max) : LIST_LIMIT_GENERIC_MESSAGE;
      return {
        ...fieldOutput(message, parsed?.field),
        details: { hint: "LIST_LIMIT_EXCEEDED", list, max },
      };
    },
  },
};

function toOwner(owner: z.infer<typeof ownerSchema>): ErrorOwner {
  const result: ErrorOwner = { kind: owner.kind, id: owner.id, name: owner.name, active: owner.active };
  if (owner.via) result.via = owner.via;
  if (owner.partner_id) result.partnerId = owner.partner_id;
  if (owner.partner_name) result.partnerName = owner.partner_name;
  return result;
}

// -----------------------------------------------------------------------------------------------
// Entrada principal
// -----------------------------------------------------------------------------------------------

/**
 * Traduz o hint de um erro do banco. Devolve `null` quando o erro não tem hint do contrato (ou o
 * hint não combina com o SQLSTATE), e o chamador usa o mapa por SQLSTATE.
 */
export function mapCadastroError(
  error: DatabaseErrorLike,
  context: DatabaseErrorContext = {},
): MappedCadastroError | null {
  const hint = error.hint;
  if (!isCadastroHint(hint)) return null;

  const spec = HINTS[hint];
  if (typeof error.code !== "string" || !spec.sqlstates.includes(error.code)) return null;

  const output = spec.build({ detail: error.details, context });
  const mapped: MappedCadastroError = { code: spec.code, hint, message: output.message };
  if (output.field) mapped.field = output.field;
  if (output.details) mapped.details = output.details;
  return mapped;
}
