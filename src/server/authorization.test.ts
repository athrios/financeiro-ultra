import { describe, expect, it } from "vitest";

import { NAV_ITEMS, activeNavHref, findNavItemByHref, navSectionsForRole } from "@/lib/navigation";
import { USER_ROLES, type UserRole } from "@/lib/roles";

import type { ActiveProfile, SessionState } from "./auth";
import {
  canAccessNavItem,
  decideAccess,
  hasRole,
  isAdministrator,
  isPartnerWithoutScope,
  roleLabel,
  userRoleLabel,
} from "./authorization";

function profileOf(role: UserRole, partnerId: string | null = null): ActiveProfile {
  return { userId: "u-1", email: "usuario@example.com", fullName: "Usuário Exemplo", role, partnerId };
}

const active = (role: UserRole): SessionState => ({ status: "active", profile: profileOf(role) });

describe("papéis e rótulos", () => {
  it("mostra rótulos em português, nunca o nome técnico do papel", () => {
    expect(USER_ROLES.map(roleLabel)).toEqual(["Administrador", "Operador", "Visualizador", "Sócio"]);
    for (const role of USER_ROLES) {
      expect(roleLabel(role)).not.toMatch(/ADMIN|OPERATOR|VIEWER|PARTNER/);
    }
  });

  it("userRoleLabel acrescenta o sócio vinculado somente quando informado", () => {
    expect(userRoleLabel("ADMINISTRATOR", "Sócio Alfa")).toBe("Administrador · Sócio Alfa");
    expect(userRoleLabel("ADMINISTRATOR")).toBe("Administrador");
    expect(userRoleLabel("PARTNER", null)).toBe("Sócio");
  });

  it("hasRole, isAdministrator e isPartnerWithoutScope", () => {
    expect(hasRole(profileOf("OPERATOR"), ["ADMINISTRATOR", "OPERATOR"])).toBe(true);
    expect(hasRole(profileOf("VIEWER"), ["ADMINISTRATOR", "OPERATOR"])).toBe(false);
    expect(isAdministrator(profileOf("ADMINISTRATOR"))).toBe(true);
    expect(isAdministrator(profileOf("OPERATOR"))).toBe(false);
    expect(isPartnerWithoutScope(profileOf("PARTNER", "p-1"))).toBe(true);
    expect(isPartnerWithoutScope(profileOf("ADMINISTRATOR", "p-1"))).toBe(false);
  });
});

describe("matriz de visibilidade do menu (03-ui-ux.md, 2.3)", () => {
  const hrefsFor = (role: UserRole) => navSectionsForRole(role).flatMap((section) => section.items.map((item) => item.href));

  it("Administrador vê todos os módulos, na ordem e nos grupos especificados", () => {
    const sections = navSectionsForRole("ADMINISTRATOR");
    expect(sections.map((section) => section.label)).toEqual([null, "Operação", "Fechamento", "Cadastros", "Configurações"]);
    expect(sections.flatMap((section) => section.items.map((item) => item.label))).toEqual([
      "Dashboard",
      "Competências",
      "Recebimentos",
      "Importar comprovantes",
      "Pendências de reconhecimento",
      "Apuração",
      "Compensações",
      "Clientes",
      "Sócios",
      "Usuários",
      "Apelidos",
      "Parâmetros do sistema",
    ]);
  });

  it("Operador vê os módulos operacionais e nenhuma configuração", () => {
    const hrefs = hrefsFor("OPERATOR");
    expect(hrefs).toContain("/importar-comprovantes");
    expect(hrefs.some((href) => href.startsWith("/configuracoes"))).toBe(false);
  });

  it("Visualizador não vê Importar comprovantes nem Configurações", () => {
    const hrefs = hrefsFor("VIEWER");
    expect(hrefs).not.toContain("/importar-comprovantes");
    expect(hrefs.some((href) => href.startsWith("/configuracoes"))).toBe(false);
    expect(hrefs).toContain("/recebimentos");
    expect(hrefs).toContain("/pendencias");
  });

  it("Sócio não vê nenhum módulo (P-02b: negar por padrão)", () => {
    expect(navSectionsForRole("PARTNER")).toEqual([]);
    expect(navSectionsForRole(null)).toEqual([]);
  });

  it("não existe item 'Regras de divisão' nem vocabulário vetado no menu (RAT-D015, RAT-D017)", () => {
    const text = NAV_ITEMS.map((item) => `${item.label} ${item.description}`).join(" ");
    expect(text).not.toMatch(/regras de divis|parte|indicador|empresa|percentual/i);
    expect(findNavItemByHref("/configuracoes/socios")?.label).toBe("Sócios");
  });

  it("só o Dashboard, Clientes (E6a), Sócios (E5a) e Apelidos (E7) estão liberados; o resto é placeholder; rotas únicas", () => {
    const available = NAV_ITEMS.filter((item) => item.available).map((item) => item.href);
    expect(available).toEqual(["/", "/clientes", "/configuracoes/socios", "/configuracoes/aliases"]);
    expect(new Set(NAV_ITEMS.map((item) => item.href)).size).toBe(NAV_ITEMS.length);
  });

  it('o menu diz "Apelidos" (R-G05) e mantém a rota /configuracoes/aliases', () => {
    const item = findNavItemByHref("/configuracoes/aliases");
    expect(item?.label).toBe("Apelidos");
    expect(NAV_ITEMS.map((i) => i.label)).not.toContain("Aliases");
  });

  it("activeNavHref escolhe o item mais específico", () => {
    expect(activeNavHref("/")).toBe("/");
    expect(activeNavHref("/recebimentos")).toBe("/recebimentos");
    expect(activeNavHref("/configuracoes/socios")).toBe("/configuracoes/socios");
    expect(activeNavHref("/recebimentos/abc")).toBe("/recebimentos");
    expect(activeNavHref("/rota-inexistente")).toBeNull();
  });
});

describe("canAccessNavItem", () => {
  it("segue a matriz e nega ao Sócio qualquer módulo", () => {
    const socios = findNavItemByHref("/configuracoes/socios")!;
    expect(canAccessNavItem(profileOf("ADMINISTRATOR"), socios)).toBe(true);
    expect(canAccessNavItem(profileOf("OPERATOR"), socios)).toBe(false);
    for (const item of NAV_ITEMS) {
      expect(canAccessNavItem(profileOf("PARTNER", "p-1"), item)).toBe(false);
    }
  });
});

describe("decideAccess (regra única de acesso, J1)", () => {
  it("sem sessão: anônimo", () => {
    expect(decideAccess({ status: "anonymous" }, "/")).toEqual({ kind: "anonymous" });
  });

  it("autenticado sem perfil ativo (sem perfil, sem papel ou inativo) cai sempre em no-access", () => {
    for (const reason of ["no-profile", "no-role", "inactive"] as const) {
      const session: SessionState = { status: "no-access", email: "usuario@example.com", reason };
      expect(decideAccess(session, "/")).toEqual({ kind: "no-access", reason });
      expect(decideAccess(session, "/recebimentos")).toEqual({ kind: "no-access", reason });
    }
  });

  it("Sócio ativo cai em partner-no-scope em qualquer rota, sem redirecionamento em laço", () => {
    for (const href of ["/", "/recebimentos", "/configuracoes/socios", "/nao-existe"]) {
      expect(decideAccess(active("PARTNER"), href)).toEqual({ kind: "partner-no-scope" });
    }
  });

  it("perfil ativo acessa o Dashboard", () => {
    for (const role of ["ADMINISTRATOR", "OPERATOR", "VIEWER"] as const) {
      expect(decideAccess(active(role), "/")).toEqual({ kind: "allowed" });
    }
  });

  it("área não permitida ao papel vira forbidden (sem permissão), com o papel", () => {
    expect(decideAccess(active("VIEWER"), "/importar-comprovantes")).toEqual({ kind: "forbidden", role: "VIEWER" });
    expect(decideAccess(active("OPERATOR"), "/configuracoes/usuarios")).toEqual({ kind: "forbidden", role: "OPERATOR" });
    expect(decideAccess(active("ADMINISTRATOR"), "/configuracoes/usuarios")).toEqual({ kind: "allowed" });
  });
});
