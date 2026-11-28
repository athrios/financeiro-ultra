/**
 * Lógica do formulário de cliente (CAD-001 E6b, UI 4.1): leitura do `FormData` na Server Action,
 * textos exatos, prévia da divisão, o que muda na confirmação da edição (4.1.8) e a vigência do aviso
 * de nome parecido (4.1.7). Pura: sem Next, sem React, sem banco.
 *
 * O `FormData` é entrada NÃO confiável (a ação é alcançável por POST direto): aqui só se separa o
 * texto de cada campo; a validação de verdade é de `buildClientSaveSchema` e, depois, do banco.
 */

import { describeDocument, documentTypeOf, normalizeDocument, parseDocumentInput, type DocumentType } from "@/domain/documents/document";
import { formatMoneyInput, parseMoneyInput } from "@/domain/shared/money-input";
import type { DuplicateMatch } from "@/lib/cadastro-errors";

import { formatMonthlyValue } from "./client-view";
import { equalSharePercent, describeEqualDivision } from "./division";
import { readField, readFieldList, type FormDataLike } from "./partner-form";

// -----------------------------------------------------------------------------------------------
// Campos e leitura do FormData
// -----------------------------------------------------------------------------------------------

/** Campos que o formulário de cliente mostra; erro em outro campo vira mensagem geral. */
export const CLIENT_FORM_FIELDS = [
  "legalName",
  "tradeName",
  "document",
  "documentType",
  "monthlyValue",
  "notes",
  "partnerIds",
  "aliases",
] as const;

export type ClientFormField = (typeof CLIENT_FORM_FIELDS)[number];

export const CLIENT_FIELD_LABELS: Readonly<Record<ClientFormField, string>> = {
  legalName: "Nome ou razão social",
  tradeName: "Nome fantasia",
  document: "Documento",
  documentType: "Tipo de documento",
  monthlyValue: "Mensalidade padrão",
  notes: "Observações",
  partnerIds: "Sócios do cliente",
  aliases: "Apelidos",
};

export function isClientFormField(value: string | undefined): value is ClientFormField {
  return value !== undefined && (CLIENT_FORM_FIELDS as readonly string[]).includes(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Entrada bruta de `buildClientSaveSchema`. Apelidos vão em dois campos paralelos (`aliasType` e
 * `aliasValue`, um par por apelido ativo), sem `JSON.parse` de entrada não confiável; listas de
 * tamanhos diferentes viram "lista inválida" no esquema.
 */
export function readClientSaveForm(form: FormDataLike) {
  const types = readFieldList(form, "aliasType");
  const values = readFieldList(form, "aliasValue");
  const aliases = types.length === values.length ? types.map((type, index) => ({ type, value: values[index] })) : undefined;

  return {
    id: readField(form, "id"),
    legalName: text(form.get("legalName")) ?? "",
    tradeName: text(form.get("tradeName")),
    documentType: readField(form, "documentType"),
    document: text(form.get("document")),
    monthlyValue: text(form.get("monthlyValue")) ?? "",
    notes: text(form.get("notes")),
    partnerIds: readFieldList(form, "partnerIds"),
    aliases,
    expectedUpdatedAt: readField(form, "expectedUpdatedAt"),
    acknowledgedDuplicateIds: readFieldList(form, "acknowledgedDuplicateIds"),
    reason: readField(form, "reason"),
  };
}

/** Entrada bruta de `clientSetActiveSchema` (E6c). `active` só vale "true" ou "false". */
export function readClientSetActiveForm(form: FormDataLike) {
  const active = text(form.get("active"));
  return {
    id: readField(form, "id") ?? "",
    active: active === "true" ? true : active === "false" ? false : undefined,
    expectedUpdatedAt: readField(form, "expectedUpdatedAt") ?? "",
    reason: readField(form, "reason"),
  };
}

/** Texto do resumo de erros do topo (UI 4.1.9). */
export function describeErrorSummary(fieldCount: number, generalMessage: string): string {
  if (fieldCount <= 0) return generalMessage;
  if (fieldCount === 1) return "Não foi possível salvar. Corrija o campo destacado.";
  return `Não foi possível salvar. Corrija os ${fieldCount} campos destacados.`;
}

export interface ErrorSummaryItem {
  field: ClientFormField;
  label: string;
  message: string;
}

/** Erros por campo, na ordem do formulário (a ordem de `CLIENT_FORM_FIELDS`). */
export function listFieldErrors(fieldErrors: Partial<Record<ClientFormField, string>>): ErrorSummaryItem[] {
  return CLIENT_FORM_FIELDS.flatMap((field) => {
    const message = fieldErrors[field];
    return message ? [{ field, label: CLIENT_FIELD_LABELS[field], message }] : [];
  });
}

// -----------------------------------------------------------------------------------------------
// Documento (UI 4.1.2)
// -----------------------------------------------------------------------------------------------

export type DocumentChoice = "NONE" | DocumentType;

export const DOCUMENT_CHOICE_LABELS: Readonly<Record<DocumentChoice, string>> = {
  NONE: "Sem documento",
  CPF: "CPF",
  CNPJ: "CNPJ",
};

export const DOCUMENT_HELP = "Opcional. Sem documento, o cliente é identificado só pelo nome.";
export const CNPJ_HELP = "Aceita CNPJ só com números e CNPJ com letras e números.";

/** Mensagem do campo de documento, ou `null` se estiver certo. Só para a tela; o banco repete tudo. */
export function validateDocumentField(choice: DocumentChoice, value: string): string | null {
  if (choice === "NONE") return null;
  const parsed = parseDocumentInput(value, choice);
  if (!parsed.ok) return parsed.message;
  if (parsed.canonical === null) return `Digite o número do ${choice} ou escolha “Sem documento”.`;
  return null;
}

/** "Abrir cliente" ou "Abrir cliente inativo" (UI 4.1.2). */
export function ownerLinkLabel(owner: { active: boolean }): string {
  return owner.active ? "Abrir cliente" : "Abrir cliente inativo";
}

// -----------------------------------------------------------------------------------------------
// Mensalidade (UI 4.1.3)
// -----------------------------------------------------------------------------------------------

export const MONTHLY_HELP = "Valor padrão deste cliente. Mudar aqui não altera recebimentos já registrados.";

/** O campo aceita só dígitos, ponto e vírgula: o resto (inclusive "R$") é tirado ao digitar e ao colar. */
export function sanitizeMoneyText(value: string): string {
  return value.replace(/[^0-9.,]/g, "");
}

/** Ao sair do campo: valor legível vira "1.234,56"; ilegível fica como está (a mensagem explica). */
export function reformatMoneyText(value: string): string {
  const parsed = parseMoneyInput(value);
  return parsed.ok ? formatMoneyInput(parsed.decimal) : value;
}

/** Linha de conferência "Valor lido: R$ 1.234,56" (UI 4.1.3); `null` se ainda não dá para ler. */
export function describeMoneyReading(value: string): string | null {
  const parsed = parseMoneyInput(value);
  return parsed.ok ? `Valor lido: ${formatMonthlyValue(parsed.decimal)}` : null;
}

/** Mensagem do campo de mensalidade, ou `null` se estiver certo. */
export function validateMoneyField(value: string): string | null {
  const parsed = parseMoneyInput(value);
  return parsed.ok ? null : parsed.message;
}

// -----------------------------------------------------------------------------------------------
// Conferência local (UI 4.1.9: depois do primeiro envio, ao sair do campo; e antes do diálogo 4.1.8)
// -----------------------------------------------------------------------------------------------

export const LEGAL_NAME_REQUIRED_MESSAGE = "Informe o nome ou a razão social.";
export const NO_PARTNER_FORM_MESSAGE = "Escolha pelo menos um sócio. Todo cliente ativo precisa de um.";

export interface ClientLocalValues {
  legalName: string;
  choice: DocumentChoice;
  document: string;
  monthlyValue: string;
  partnerCount: number;
  /** Cliente ativo exige sócio; o inativo pode ficar sem (R-C10). */
  clientActive: boolean;
}

/** Erros que a tela consegue ver sozinha. O servidor (e o banco) repetem tudo e são a autoridade. */
export function validateClientLocally(values: ClientLocalValues): Partial<Record<ClientFormField, string>> {
  const errors: Partial<Record<ClientFormField, string>> = {};
  if (values.legalName.trim() === "") errors.legalName = LEGAL_NAME_REQUIRED_MESSAGE;
  const documentError = validateDocumentField(values.choice, values.document);
  if (documentError) errors.document = documentError;
  const moneyError = validateMoneyField(values.monthlyValue);
  if (moneyError) errors.monthlyValue = moneyError;
  if (values.clientActive && values.partnerCount === 0) errors.partnerIds = NO_PARTNER_FORM_MESSAGE;
  return errors;
}

// -----------------------------------------------------------------------------------------------
// Sócios (UI 4.1.4)
// -----------------------------------------------------------------------------------------------

export const PARTNERS_HELP =
  "Escolha quem participa deste cliente. A mensalidade é sempre dividida em partes iguais entre os sócios escolhidos.";
export const DIVISION_FIXED_NOTE = "A divisão é sempre igual. Não há percentual para editar.";
export const PARTNERS_CHANGE_NOTE = "A troca de sócios vale daqui em diante. O que já foi recebido e rateado não muda.";
export const NO_ACTIVE_PARTNERS_MESSAGE = "Não há sócios ativos. Cadastre um sócio para poder salvar este cliente.";
export const NO_ACTIVE_PARTNERS_REASON = "Cadastre um sócio para poder salvar este cliente.";

export interface PartnerPreview {
  text: string;
  /** Segunda linha (só com zero sócios em cliente ativo). */
  extra: string | null;
  tone: "neutral" | "warning" | "info";
}

/**
 * Prévia da divisão logo abaixo da lista (UI 4.1.4). Nenhum valor em reais por sócio e nenhuma linha
 * "Total 100%". Zero sócios: aviso em cliente ativo; informativo, sem erro, em cliente inativo.
 */
export function describePartnerPreview(count: number, clientActive: boolean): PartnerPreview {
  if (count <= 0) {
    return clientActive
      ? { text: "Nenhum sócio escolhido.", extra: "Todo cliente ativo precisa de pelo menos um sócio.", tone: "warning" }
      : { text: "Nenhum sócio. Para reativar o cliente, indique pelo menos um sócio.", extra: null, tone: "info" };
  }
  return { text: describeEqualDivision(count), extra: null, tone: "neutral" };
}

export interface PartnerChoice {
  id: string;
  name: string;
  active: boolean;
}

// -----------------------------------------------------------------------------------------------
// Confirmação da edição (UI 4.1.8)
// -----------------------------------------------------------------------------------------------

export interface ClientConfirmationBaseline {
  /** Sócios com indicação ativa quando o formulário abriu. */
  partnerIds: readonly string[];
  /** Documento canônico gravado, ou `null`. */
  document: string | null;
}

export interface ClientConfirmationCurrent {
  partnerIds: readonly string[];
  choice: DocumentChoice;
  /** O que está no campo de número (com ou sem máscara). */
  documentText: string;
}

export interface ClientConfirmationChanges {
  partners: { before: string[]; after: string[]; division: string | null } | null;
  document: { before: string; after: string } | null;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && new Set(a).size === new Set([...a, ...b]).size;
}

/** "sem documento" ou "CPF 000.000.001-91", como a UI 4.1.8 escreve. */
function describeDocumentForDialog(canonical: string | null): string {
  return canonical === null ? "sem documento" : describeDocument(canonical);
}

/** Documento do campo, canônico, quando o tipo e o número batem; senão `null`. */
function currentCanonicalDocument(current: ClientConfirmationCurrent): string | null {
  if (current.choice === "NONE") return null;
  return normalizeDocument(current.documentText);
}

/**
 * O que mudou nos sócios e no documento (e só isso pede o diálogo de confirmação). `nameOf` traduz o
 * id de sócio no nome; ids desconhecidos aparecem como "Sócio não encontrado" (nunca como o UUID).
 */
export function computeConfirmationChanges(
  baseline: ClientConfirmationBaseline,
  current: ClientConfirmationCurrent,
  nameOf: (id: string) => string | null,
): ClientConfirmationChanges {
  const nameList = (ids: readonly string[]) =>
    ids.map((id) => nameOf(id) ?? "Sócio não encontrado").sort((a, b) => a.localeCompare(b, "pt-BR"));

  const partnersChanged = !sameSet(baseline.partnerIds, current.partnerIds);
  const partners = partnersChanged
    ? {
        before: nameList(baseline.partnerIds),
        after: nameList(current.partnerIds),
        division: current.partnerIds.length >= 2
          ? `A divisão passa a ser igual entre ${current.partnerIds.length} sócios: 1/${current.partnerIds.length} para cada um (${equalSharePercent(current.partnerIds.length)}).`
          : current.partnerIds.length === 1
            ? "A divisão passa a ser de um só sócio: 1/1 (100%)."
            : null,
      }
    : null;

  const after = currentCanonicalDocument(current);
  const documentChanged = after !== baseline.document;
  let document: ClientConfirmationChanges["document"] = null;
  if (documentChanged) {
    // Número ainda ilegível (tamanho estranho): mostra como foi digitado, com o tipo escolhido.
    let afterText: string;
    if (after === null) afterText = "sem documento";
    else if (documentTypeOf(after) === null) afterText = `${current.choice} ${current.documentText.trim()}`;
    else afterText = describeDocument(after);
    document = { before: describeDocumentForDialog(baseline.document), after: afterText };
  }

  return { partners, document };
}

export function needsConfirmation(changes: ClientConfirmationChanges): boolean {
  return changes.partners !== null || changes.document !== null;
}

export function confirmationTitle(name: string): string {
  return `Confirmar as alterações em ${name}?`;
}

export const DOCUMENT_CHANGE_NOTE = "O documento é usado para reconhecer comprovantes.";
export const STALE_IN_DIALOG_MESSAGE =
  "Este cliente foi alterado por outra pessoa enquanto você revisava. Suas alterações não foram salvas.";

// -----------------------------------------------------------------------------------------------
// Aviso de nome parecido (UI 4.1.7)
// -----------------------------------------------------------------------------------------------

export const DUPLICATE_TITLE = "Já existe um cliente com nome ou apelido igual";
export const DUPLICATE_TEXT =
  "Confira se não é o mesmo cliente. Se for outra filial ou outra pessoa com o mesmo nome, você pode salvar mesmo assim.";

export function duplicateReasonLabel(match: Pick<DuplicateMatch, "match">): string {
  return match.match === "SAME_ALIAS" ? "apelido igual ao nome" : "mesmo nome";
}

/** Documento do cliente parecido, ou "Sem documento". */
export function duplicateDocumentText(match: Pick<DuplicateMatch, "document">): string {
  return describeDocument(match.document);
}

/**
 * Assinatura do que o aviso confirma: o nome e os apelidos ativos. A confirmação vale só para ela
 * (UI 4.1.7): se mudar, o aviso some e o salvamento volta a conferir.
 */
export function duplicateScopeSignature(name: string, aliasesSignature: string): string {
  return JSON.stringify([name.trim(), aliasesSignature]);
}

// -----------------------------------------------------------------------------------------------
// Conflito de edição: "O que você tinha digitado" (UI 8.1)
// -----------------------------------------------------------------------------------------------

/** Limite das observações (o mesmo de `schemas.ts`, não importado para não levar o `zod` ao navegador). */
export const CLIENT_NOTES_MAX = 2000;

/** Os valores do formulário, no formato do que a pessoa vê (para comparar e para o resumo do conflito). */
export interface ClientFormValues {
  legalName: string;
  tradeName: string;
  choice: DocumentChoice;
  document: string;
  monthlyValue: string;
  notes: string;
  partnerIds: readonly string[];
  /** Apelidos ativos, como aparecem na lista ("Modelo Ltda", "CPF 000.000.001-91"). */
  aliases: readonly string[];
}

export interface TypedValue {
  label: string;
  text: string;
}

/** Os campos que a pessoa alterou em relação ao que abriu, para ela refazer depois de "Carregar versão atual". */
export function listChangedValues(
  base: ClientFormValues,
  current: ClientFormValues,
  nameOf: (id: string) => string | null,
): TypedValue[] {
  const names = (ids: readonly string[]) =>
    ids.map((id) => nameOf(id) ?? "Sócio não encontrado").sort((a, b) => a.localeCompare(b, "pt-BR"));
  const documentText = (values: ClientFormValues) =>
    values.choice === "NONE" ? "Sem documento" : `${values.choice} ${values.document.trim()}`.trim();
  const list = (items: readonly string[]) => (items.length > 0 ? items.join(", ") : "—");
  const text = (value: string) => (value.trim() === "" ? "—" : value.trim());

  const changed: TypedValue[] = [];
  if (base.legalName.trim() !== current.legalName.trim()) changed.push({ label: CLIENT_FIELD_LABELS.legalName, text: text(current.legalName) });
  if (base.tradeName.trim() !== current.tradeName.trim()) changed.push({ label: CLIENT_FIELD_LABELS.tradeName, text: text(current.tradeName) });
  if (documentText(base) !== documentText(current)) changed.push({ label: CLIENT_FIELD_LABELS.document, text: documentText(current) });
  if (base.monthlyValue.trim() !== current.monthlyValue.trim()) changed.push({ label: CLIENT_FIELD_LABELS.monthlyValue, text: text(current.monthlyValue) });
  if (!sameSet(base.partnerIds, current.partnerIds)) changed.push({ label: CLIENT_FIELD_LABELS.partnerIds, text: list(names(current.partnerIds)) });
  if (JSON.stringify([...base.aliases].sort()) !== JSON.stringify([...current.aliases].sort())) {
    changed.push({ label: CLIENT_FIELD_LABELS.aliases, text: list(current.aliases) });
  }
  if (base.notes.trim() !== current.notes.trim()) changed.push({ label: CLIENT_FIELD_LABELS.notes, text: text(current.notes) });
  return changed;
}
