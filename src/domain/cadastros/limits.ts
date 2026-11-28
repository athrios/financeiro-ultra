/**
 * Limites de itens das listas editáveis (RAT-D026, 27/11/2026) e a frase do texto inválido (QA-CAD-05).
 *
 * Os números são REGRA DE NEGÓCIO (RAT-D026), com o banco como autoridade: a função
 * `private.cad_list_limit` (migration 0300) repete os mesmos valores e o teste
 * `limits-sql.test.ts` confere que os dois lados concordam. Aqui a regra é só espelho, para a tela e o
 * zod darem a mensagem no campo antes de chegar ao banco. Contam só os itens ATIVOS, não vazios e
 * distintos pela chave de comparação (o cadastro não apaga, só inativa). Antes da RAT-D026 os números
 * (50/50/50/20/20) eram um limite técnico de proteção (QA-CAD-07). Mudar um número é mudar a regra:
 * exige decisão oficial e migration.
 *
 * Sem dependência de `zod`, de React ou de Next: a tela importa daqui.
 */

/** Teto de itens ativos de cada lista. As chaves são as mesmas de `private.cad_list_limit` (banco). */
export const LIST_LIMITS = {
  /** Apelidos ativos de um sócio. */
  PARTNER_ALIAS: 2,
  /** Apelidos ativos de um cliente do tipo nome. */
  CLIENT_ALIAS_NAME: 2,
  /** Apelidos ativos de um cliente do tipo documento (CPF e CNPJ juntos). */
  CLIENT_ALIAS_DOCUMENT: 2,
  /** Formas do nome ativas de um recebedor. */
  NAME_VARIANT: 30,
  /** Chaves Pix ativas de um recebedor. */
  PIX_KEY: 10,
  /** Contas bancárias ativas de um recebedor. */
  BANK_ACCOUNT: 10,
} as const;

export type ListLimitKey = keyof typeof LIST_LIMITS;

/** Plural e gênero de cada lista: dão a frase do teto ("No máximo 2 apelidos.") e a ajuda ("Até 2 apelidos ativos."). */
const LIST_LIMIT_WORDS: Readonly<Record<ListLimitKey, { plural: string; feminine: boolean }>> = {
  PARTNER_ALIAS: { plural: "apelidos", feminine: false },
  CLIENT_ALIAS_NAME: { plural: "nomes", feminine: false },
  CLIENT_ALIAS_DOCUMENT: { plural: "documentos", feminine: false },
  NAME_VARIANT: { plural: "formas do nome", feminine: true },
  PIX_KEY: { plural: "chaves Pix", feminine: true },
  BANK_ACCOUNT: { plural: "contas", feminine: true },
};

/** Frase para quando o `detail` do banco não diz a lista ou o número. */
export const LIST_LIMIT_GENERIC_MESSAGE = "A lista passou do limite de itens. Inative algum item e tente novamente.";

/**
 * Frase do teto de uma lista, a mesma do zod, do servidor e da tela ("No máximo 2 apelidos."). O número
 * é o `max` dado (o do `detail` do banco); sem ele, o da tabela.
 */
export function listLimitMessage(list: ListLimitKey, max: number = LIST_LIMITS[list]): string {
  return `No máximo ${max} ${LIST_LIMIT_WORDS[list].plural}.`;
}

/** Ajuda de uma lista antes do teto ("Até 2 apelidos ativos."), derivada do mesmo número do teto. */
export function listLimitHelp(list: ListLimitKey, max: number = LIST_LIMITS[list]): string {
  const { plural, feminine } = LIST_LIMIT_WORDS[list];
  return `Até ${max} ${plural} ${feminine ? "ativas" : "ativos"}.`;
}

export const MAX_PARTNER_ALIASES = LIST_LIMITS.PARTNER_ALIAS;
export const MAX_CLIENT_NAME_ALIASES = LIST_LIMITS.CLIENT_ALIAS_NAME;
export const MAX_CLIENT_DOCUMENT_ALIASES = LIST_LIMITS.CLIENT_ALIAS_DOCUMENT;
export const MAX_NAME_VARIANTS = LIST_LIMITS.NAME_VARIANT;
export const MAX_PIX_KEYS = LIST_LIMITS.PIX_KEY;
export const MAX_BANK_ACCOUNTS = LIST_LIMITS.BANK_ACCOUNT;

export const PARTNER_ALIASES_LIMIT_MESSAGE = listLimitMessage("PARTNER_ALIAS");
/** Cliente: uma frase por tipo ("No máximo 2 nomes." e "No máximo 2 documentos."). */
export const CLIENT_NAME_ALIASES_LIMIT_MESSAGE = listLimitMessage("CLIENT_ALIAS_NAME");
export const CLIENT_DOCUMENT_ALIASES_LIMIT_MESSAGE = listLimitMessage("CLIENT_ALIAS_DOCUMENT");
export const NAME_VARIANTS_LIMIT_MESSAGE = listLimitMessage("NAME_VARIANT");
export const PIX_KEYS_LIMIT_MESSAGE = listLimitMessage("PIX_KEY");
export const BANK_ACCOUNTS_LIMIT_MESSAGE = listLimitMessage("BANK_ACCOUNT");

/**
 * Frase de saída para quem chega ao teto de uma lista editável (T-41). Só a tela a usa, depois da frase
 * "No máximo N ...": o esquema (zod) e o servidor continuam devolvendo só a frase do limite.
 */
export const LIMIT_REACHED_HINT = "Para adicionar ou reativar, inative ou remova algum item da lista.";

/** Texto com o caractere NUL (`\u0000`): o banco o recusa; a validação diz o campo. */
export const INVALID_TEXT_MESSAGE = "O texto tem um caractere inválido.";

/** Teto, frase do teto e ajuda de cada lista, no formato que `addItem` e a tela esperam (`ListLimit`). */
export const PARTNER_ALIASES_LIMIT = {
  max: MAX_PARTNER_ALIASES,
  message: PARTNER_ALIASES_LIMIT_MESSAGE,
  help: listLimitHelp("PARTNER_ALIAS"),
} as const;
export const NAME_VARIANTS_LIMIT = {
  max: MAX_NAME_VARIANTS,
  message: NAME_VARIANTS_LIMIT_MESSAGE,
  help: listLimitHelp("NAME_VARIANT"),
} as const;
export const PIX_KEYS_LIMIT = {
  max: MAX_PIX_KEYS,
  message: PIX_KEYS_LIMIT_MESSAGE,
  help: listLimitHelp("PIX_KEY"),
} as const;
export const BANK_ACCOUNTS_LIMIT = {
  max: MAX_BANK_ACCOUNTS,
  message: BANK_ACCOUNTS_LIMIT_MESSAGE,
  help: listLimitHelp("BANK_ACCOUNT"),
} as const;

// -----------------------------------------------------------------------------------------------
// Apelidos do cliente: um teto por tipo (nome e documento, CPF e CNPJ juntos)
// -----------------------------------------------------------------------------------------------

/** Grupo de contagem dos apelidos do cliente: igual ao `type` gravado (`NAME` ou `DOCUMENT`). */
export type ClientAliasGroup = "NAME" | "DOCUMENT";

export const CLIENT_NAME_ALIASES_LIMIT = {
  max: MAX_CLIENT_NAME_ALIASES,
  message: CLIENT_NAME_ALIASES_LIMIT_MESSAGE,
} as const;
export const CLIENT_DOCUMENT_ALIASES_LIMIT = {
  max: MAX_CLIENT_DOCUMENT_ALIASES,
  message: CLIENT_DOCUMENT_ALIASES_LIMIT_MESSAGE,
} as const;

/** Teto e frase de cada grupo do cliente. */
export const CLIENT_ALIAS_LIMITS: Readonly<Record<ClientAliasGroup, { max: number; message: string }>> = {
  NAME: CLIENT_NAME_ALIASES_LIMIT,
  DOCUMENT: CLIENT_DOCUMENT_ALIASES_LIMIT,
};

/** Ajuda do cliente antes do teto (uma frase para os dois grupos). */
export const CLIENT_ALIASES_HELP = `Até ${MAX_CLIENT_NAME_ALIASES} nomes e ${MAX_CLIENT_DOCUMENT_ALIASES} documentos ativos. CPF e CNPJ contam juntos.`;

/** Frase de saída por grupo (a genérica, "algum item", não serve: remover um documento não libera vaga de nome). */
export const CLIENT_LIMIT_EXIT: Readonly<Record<ClientAliasGroup, string>> = {
  NAME: "Para adicionar ou reativar um nome, inative ou remova algum nome da lista.",
  DOCUMENT: "Para adicionar ou reativar um documento, inative ou remova algum documento da lista.",
};

/**
 * Dica para trocar o tipo quando só o OUTRO grupo tem vaga (só na linha do limite, nunca no erro).
 * A chave é o grupo que está cheio: com nomes cheios, a dica ensina a incluir um documento.
 */
export const CLIENT_SWITCH_KIND_HINT: Readonly<Record<ClientAliasGroup, string>> = {
  NAME: "Para incluir um documento, escolha CPF ou CNPJ em Tipo.",
  DOCUMENT: "Para incluir um nome, escolha Nome em Tipo.",
};

/** Nota da seção "Apelidos inativos" (um grupo cheio com item inativo): explica o "Reativar" desabilitado. */
export const CLIENT_REACTIVATE_NOTE: Readonly<Record<ClientAliasGroup, string>> = {
  NAME: `${CLIENT_NAME_ALIASES_LIMIT_MESSAGE} Para reativar um nome, inative ou remova algum nome da lista.`,
  DOCUMENT: `${CLIENT_DOCUMENT_ALIASES_LIMIT_MESSAGE} Para reativar um documento, inative ou remova algum documento da lista.`,
};
