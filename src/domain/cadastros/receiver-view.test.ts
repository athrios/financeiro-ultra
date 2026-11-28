import { describe, expect, it } from "vitest";

import { parsePartnerFlash, partnerDetailHref } from "./partner-view";
import {
  blockedReceiverDescription,
  describeVariantCount,
  reactivateReceiverDescription,
  receiverActionLabel,
  receiverActiveVariant,
  receiverDialogTitle,
  receiverFailureSummary,
  receiverHref,
  receiverNewHref,
  receiverPartnerContext,
  receiverPendingLabel,
  receiverUnexpectedMessage,
  receiversEmptyMessage,
  receiversFilterHref,
} from "./receiver-view";

const PARTNER = "a0000000-0000-4000-8000-000000000001";
const RECEIVER = "d2000000-0000-4000-8000-000000000001";

describe("endereços", () => {
  it("rotas R1 e R2 da UI 2.1 e filtro do cartão (Ativos é o padrão e some da URL)", () => {
    expect(receiverNewHref(PARTNER)).toBe(`/configuracoes/socios/${PARTNER}/recebedores/novo`);
    expect(receiverHref(PARTNER, RECEIVER)).toBe(`/configuracoes/socios/${PARTNER}/recebedores/${RECEIVER}`);
    expect(receiversFilterHref(PARTNER, "ACTIVE")).toBe(`/configuracoes/socios/${PARTNER}`);
    expect(receiversFilterHref(PARTNER, "INACTIVE")).toBe(`/configuracoes/socios/${PARTNER}?recebedores=inativos`);
    expect(receiversFilterHref(PARTNER, "ALL")).toBe(`/configuracoes/socios/${PARTNER}?recebedores=todos`);
  });
});

describe("avisos de sucesso do recebedor (chaves fixas)", () => {
  it.each([
    ["recebedor-criado", "success", "Recebedor cadastrado."],
    ["recebedor-salvo", "success", "Alterações salvas."],
    ["recebedor-inativado", "success", "Recebedor inativado."],
    ["recebedor-reativado", "success", "Recebedor reativado."],
    ["recebedor-ja-inativo", "info", "Este recebedor já está inativo. A tela foi atualizada."],
    ["recebedor-ja-ativo", "info", "Este recebedor já está ativo. A tela foi atualizada."],
  ] as const)("%s", (key, tone, message) => {
    expect(parsePartnerFlash(key)).toEqual({ tone, message });
    expect(partnerDetailHref(PARTNER, { key })).toBe(`/configuracoes/socios/${PARTNER}?aviso=${key}`);
  });

  it("chave desconhecida ou forjada não mostra nada", () => {
    expect(parsePartnerFlash("recebedor-<script>")).toBeNull();
    expect(parsePartnerFlash("Recebedor cadastrado.")).toBeNull();
  });
});

describe("cartão Recebedores", () => {
  it("variações do nome no singular e no plural; nada quando zero", () => {
    expect(describeVariantCount(0)).toBeNull();
    expect(describeVariantCount(1)).toBe("1 variação do nome");
    expect(describeVariantCount(3)).toBe("3 variações do nome");
  });

  it("estado vazio por filtro", () => {
    expect(receiversEmptyMessage("ACTIVE")).toEqual({
      title: "Este sócio ainda não tem recebedores.",
      text: "Cadastre as contas e os nomes pelos quais este sócio recebe, para o sistema reconhecer os comprovantes.",
    });
    expect(receiversEmptyMessage("INACTIVE")).toEqual({ title: "Nenhum recebedor inativo.", text: null });
  });

  it("T-26: Ativos vazio com recebedores inativos não diz que o sócio não tem recebedores", () => {
    expect(receiversEmptyMessage("ACTIVE", true).title).toBe("Este sócio não tem recebedores ativos.");
    expect(receiversEmptyMessage("ACTIVE", false).title).toBe("Este sócio ainda não tem recebedores.");
    expect(receiversEmptyMessage("ALL", true).title).toBe("Este sócio ainda não tem recebedores.");
    expect(receiversEmptyMessage("INACTIVE", true).title).toBe("Nenhum recebedor inativo.");
  });
});

describe("inativar e reativar (UI 6.5)", () => {
  it("a variante: reativar com sócio inativo é bloqueio", () => {
    expect(receiverActiveVariant({ active: true, partnerActive: true })).toBe("deactivate");
    expect(receiverActiveVariant({ active: true, partnerActive: false })).toBe("deactivate");
    expect(receiverActiveVariant({ active: false, partnerActive: true })).toBe("reactivate");
    expect(receiverActiveVariant({ active: false, partnerActive: false })).toBe("blocked");
  });

  it("textos exatos", () => {
    expect(receiverDialogTitle("deactivate", "Titular Fictício A")).toBe("Inativar o recebedor Titular Fictício A?");
    expect(receiverDialogTitle("reactivate", "Titular Fictício A")).toBe("Reativar o recebedor Titular Fictício A?");
    expect(receiverDialogTitle("blocked", "Titular Fictício A")).toBe("Não é possível reativar Titular Fictício A");
    expect(reactivateReceiverDescription("Sócio Exemplo A")).toBe("Ele volta a ser usado para reconhecer comprovantes do sócio Sócio Exemplo A.");
    expect(blockedReceiverDescription("Sócio Exemplo A")).toBe(
      "O sócio Sócio Exemplo A está inativo. Reative o sócio antes de reativar o recebedor.",
    );
    expect(receiverActionLabel("deactivate")).toBe("Inativar recebedor");
    expect(receiverActionLabel("reactivate")).toBe("Reativar recebedor");
    expect(receiverPendingLabel("deactivate")).toBe("Inativando…");
    expect(receiverPendingLabel("reactivate")).toBe("Reativando…");
    expect(receiverUnexpectedMessage(true)).toBe("Não foi possível reativar o recebedor agora. Tente novamente em instantes.");
  });
});

describe("formulário (UI 7)", () => {
  it("faixa de contexto: novo só com a primeira frase; edição com as duas", () => {
    expect(receiverPartnerContext("Sócio Exemplo A", false)).toBe("Este recebedor pertence a Sócio Exemplo A e não pode mudar de sócio.");
    expect(receiverPartnerContext("Sócio Exemplo A", true)).toBe(
      "Este recebedor pertence a Sócio Exemplo A e não pode mudar de sócio. Para passar a conta a outro sócio, inative este recebedor e cadastre outro.",
    );
  });

  it("resumo de falha no singular e no plural", () => {
    expect(receiverFailureSummary(1)).toBe("Não foi possível salvar. Corrija o campo destacado.");
    expect(receiverFailureSummary(3)).toBe("Não foi possível salvar. Corrija os 3 campos destacados.");
  });
});
