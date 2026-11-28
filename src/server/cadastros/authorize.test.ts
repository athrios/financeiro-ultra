import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const getCadastroContext = vi.fn();

vi.mock("@/server/session", () => ({ getSession: () => getSession() }));
vi.mock("./context", () => ({ getCadastroContext: () => getCadastroContext() }));

import { authorizeAdmin } from "./authorize";

const CONTEXT = { supabase: {}, correlationId: "d0000000-0000-4000-8000-0000000000ff" };

function active(role: "ADMINISTRATOR" | "OPERATOR" | "VIEWER" | "PARTNER") {
  return { status: "active", profile: { userId: "u-1", email: "x@example.com", fullName: null, role, partnerId: null } };
}

beforeEach(() => {
  getSession.mockReset();
  getCadastroContext.mockReset();
  getCadastroContext.mockResolvedValue(CONTEXT);
});

describe("authorizeAdmin (autorização dentro de cada Server Action)", () => {
  it("Administrador com perfil ativo passa e recebe o contexto da requisição", async () => {
    getSession.mockResolvedValue(active("ADMINISTRATOR"));
    expect(await authorizeAdmin()).toEqual({ kind: "ok", ctx: CONTEXT, userId: "u-1" });
  });

  it("sem sessão: 'unauthenticated' (a ação leva ao login e não conclui)", async () => {
    getSession.mockResolvedValue({ status: "anonymous" });
    expect(await authorizeAdmin()).toEqual({ kind: "unauthenticated" });
    expect(getCadastroContext).not.toHaveBeenCalled();
  });

  it.each(["OPERATOR", "VIEWER", "PARTNER"] as const)("%s: nega com a mensagem da UI e não abre contexto", async (role) => {
    getSession.mockResolvedValue(active(role));
    expect(await authorizeAdmin()).toEqual({
      kind: "forbidden",
      error: { code: "FORBIDDEN", message: "Você não tem permissão para fazer esta alteração.", hint: "ADMIN_REQUIRED" },
    });
    expect(getCadastroContext).not.toHaveBeenCalled();
  });

  it.each(["no-profile", "no-role", "inactive"] as const)(
    "autenticado sem acesso ativo (%s): nega por padrão",
    async (reason) => {
      getSession.mockResolvedValue({ status: "no-access", email: "x@example.com", reason });
      expect(await authorizeAdmin()).toMatchObject({ kind: "forbidden" });
      expect(getCadastroContext).not.toHaveBeenCalled();
    },
  );
});
