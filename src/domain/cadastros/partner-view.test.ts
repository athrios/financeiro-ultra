import { describe, expect, it } from "vitest";

import {
  blockedDescription,
  cascadeDescription,
  describeClientCounts,
  inactivatedMessage,
  parsePartnerFlash,
  parseQueryParam,
  parseStatusParam,
  partnerActionLabel,
  partnerActiveVariant,
  partnerClientsHref,
  partnerDetailHref,
  partnerDialogTitle,
  partnersEmptyKind,
  partnersListHref,
  statusParamOf,
} from "./partner-view";

describe("filtros da URL", () => {
  it("status: desconhecido ou ausente vira Ativos; os três valores valem", () => {
    expect(parseStatusParam(undefined)).toBe("ACTIVE");
    expect(parseStatusParam("lixo")).toBe("ACTIVE");
    expect(parseStatusParam("constructor")).toBe("ACTIVE");
    expect(parseStatusParam("ativos")).toBe("ACTIVE");
    expect(parseStatusParam("inativos")).toBe("INACTIVE");
    expect(parseStatusParam(["todos", "ativos"])).toBe("ALL");
    expect(statusParamOf("ALL")).toBe("todos");
    expect(statusParamOf("INACTIVE")).toBe("inativos");
    expect(statusParamOf("ACTIVE")).toBe("ativos");
  });

  it("busca: apara, pega o primeiro valor e limita o tamanho", () => {
    expect(parseQueryParam("  alfa  ")).toBe("alfa");
    expect(parseQueryParam(["a", "b"])).toBe("a");
    expect(parseQueryParam(undefined)).toBe("");
    expect(parseQueryParam("x".repeat(500))).toHaveLength(200);
  });

  it("o caminho da lista omite o padrão", () => {
    expect(partnersListHref({})).toBe("/configuracoes/socios");
    expect(partnersListHref({ status: "ACTIVE" })).toBe("/configuracoes/socios");
    expect(partnersListHref({ q: "alfa", status: "INACTIVE" })).toBe("/configuracoes/socios?q=alfa&status=inativos");
    expect(partnersListHref({ q: "a&b" })).toBe("/configuracoes/socios?q=a%26b");
  });
});

describe("aviso de sucesso depois do redirecionamento", () => {
  it("os textos exatos da UI", () => {
    expect(parsePartnerFlash("criado")?.message).toBe("Sócio cadastrado. Agora você pode cadastrar os recebedores dele.");
    expect(parsePartnerFlash("salvo")?.message).toBe("Alterações salvas.");
    expect(parsePartnerFlash("reativado")?.message).toBe("Sócio reativado.");
    expect(parsePartnerFlash("inativado")?.message).toBe("Sócio inativado.");
    expect(parsePartnerFlash("inativado", "1")?.message).toBe("Sócio inativado. 1 recebedor inativado junto.");
    expect(parsePartnerFlash("inativado", "3")?.message).toBe("Sócio inativado. 3 recebedores inativados junto.");
    expect(parsePartnerFlash("ja-inativo")).toEqual({
      tone: "info",
      message: "Este sócio já está inativo. A tela foi atualizada.",
    });
    expect(parsePartnerFlash("ja-ativo")?.message).toBe("Este sócio já está ativo. A tela foi atualizada.");
  });

  it("chave desconhecida ou ausente não mostra nada, e a mensagem nunca vem da URL", () => {
    expect(parsePartnerFlash(undefined)).toBeNull();
    expect(parsePartnerFlash("<script>")).toBeNull();
    expect(parsePartnerFlash("Alterações salvas.")).toBeNull();
    expect(parsePartnerFlash("inativado", "<b>")?.message).toBe("Sócio inativado.");
    expect(parsePartnerFlash("inativado", "-5")?.message).toBe("Sócio inativado.");
  });

  it("o caminho do detalhe leva a chave (e a contagem, quando houver)", () => {
    expect(partnerDetailHref("p1")).toBe("/configuracoes/socios/p1");
    expect(partnerDetailHref("p1", { key: "criado" })).toBe("/configuracoes/socios/p1?aviso=criado");
    expect(partnerDetailHref("p1", { key: "inativado", count: 2 })).toBe("/configuracoes/socios/p1?aviso=inativado&n=2");
    expect(partnerDetailHref("p1", { key: "inativado", count: 0 })).toBe("/configuracoes/socios/p1?aviso=inativado");
    expect(inactivatedMessage(0)).toBe("Sócio inativado.");
  });
});

describe("variante do diálogo de inativar e reativar", () => {
  it("reativar quando inativo; bloqueio com qualquer cliente; cascata só sem clientes e com recebedores", () => {
    expect(partnerActiveVariant({ active: false, clientCount: 0, receiverCount: 0 })).toBe("reactivate");
    expect(partnerActiveVariant({ active: false, clientCount: 5, receiverCount: 5 })).toBe("reactivate");
    expect(partnerActiveVariant({ active: true, clientCount: 1, receiverCount: 0 })).toBe("blocked");
    expect(partnerActiveVariant({ active: true, clientCount: 2, receiverCount: 3 })).toBe("blocked");
    expect(partnerActiveVariant({ active: true, clientCount: 0, receiverCount: 2 })).toBe("cascade");
    expect(partnerActiveVariant({ active: true, clientCount: 0, receiverCount: 0 })).toBe("plain");
  });

  it("textos exatos do bloqueio (singular e plural)", () => {
    expect(blockedDescription("Sócio Ex. Alfa", 1)).toBe(
      "Sócio Ex. Alfa ainda está indicado em 1 cliente, entre ativos e inativos. Para inativar, primeiro retire este sócio de todos eles.",
    );
    expect(blockedDescription("Sócio Ex. Alfa", 3)).toContain("em 3 clientes, entre ativos e inativos");
  });

  it("textos exatos da cascata e rótulos dos botões", () => {
    expect(cascadeDescription(1)).toBe("O recebedor ativo deste sócio será inativado junto:");
    expect(cascadeDescription(4)).toBe("Os 4 recebedores ativos deste sócio serão inativados junto:");
    expect(partnerActionLabel("cascade", 1)).toBe("Inativar sócio e 1 recebedor");
    expect(partnerActionLabel("cascade", 3)).toBe("Inativar sócio e 3 recebedores");
    expect(partnerActionLabel("plain", 0)).toBe("Inativar sócio");
    expect(partnerActionLabel("reactivate", 0)).toBe("Reativar sócio");
  });

  it("títulos dos diálogos", () => {
    expect(partnerDialogTitle("blocked", "Sócio Ex. Alfa")).toBe("Não é possível inativar Sócio Ex. Alfa");
    expect(partnerDialogTitle("cascade", "Sócio Ex. Alfa")).toBe("Inativar Sócio Ex. Alfa?");
    expect(partnerDialogTitle("plain", "Sócio Ex. Alfa")).toBe("Inativar Sócio Ex. Alfa?");
    expect(partnerDialogTitle("reactivate", "Sócio Ex. Alfa")).toBe("Reativar Sócio Ex. Alfa?");
  });
});

describe("cartão de clientes do sócio", () => {
  it("contagem com singular e plural", () => {
    expect(describeClientCounts(2, 1)).toBe("3 clientes: 2 ativos e 1 inativo.");
    expect(describeClientCounts(1, 0)).toBe("1 cliente: 1 ativo e 0 inativos.");
    expect(describeClientCounts(0, 0)).toBe("0 clientes: 0 ativos e 0 inativos.");
  });

  it("o link de clientes do sócio carrega o filtro de sócio e todos os status", () => {
    expect(partnerClientsHref("abc")).toBe("/clientes?socio=abc&status=todos");
  });
});

describe("lista de sócios vazia (T-23)", () => {
  it("Ativos vazio com inativos existentes: 'Nenhum sócio ativo.'; 'cadastrado' só sem sócio nenhum", () => {
    expect(partnersEmptyKind({ status: "ACTIVE", query: "", hasInactive: true })).toBe("NO_ACTIVE");
    expect(partnersEmptyKind({ status: "ACTIVE", query: "", hasInactive: false })).toBe("NONE");
    expect(partnersEmptyKind({ status: "ALL", query: "", hasInactive: false })).toBe("NONE");
    expect(partnersEmptyKind({ status: "INACTIVE", query: "", hasInactive: false })).toBe("NO_INACTIVE");
    expect(partnersEmptyKind({ status: "ACTIVE", query: "x", hasInactive: true })).toBe("NO_MATCH");
  });
});
