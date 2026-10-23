import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";
import { USER_ROLES, type UserRole } from "@/lib/roles";

import type { SessionState } from "../auth";
import { canReadProof, canUploadProof, requireProofRole } from "./access";

function active(role: UserRole): SessionState {
  return {
    status: "active",
    profile: { userId: "u-1", email: "pessoa@example.com", fullName: "Pessoa Exemplo", role, partnerId: null },
  };
}

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return (error as AppError).code;
  }
  return "OK";
}

describe("permissão de comprovantes", () => {
  it("enviar: só Administrador e Operador", () => {
    const allowed = USER_ROLES.filter(canUploadProof);
    expect(allowed).toEqual(["ADMINISTRATOR", "OPERATOR"]);
  });

  it("ler: Administrador, Operador e Visualizador; Sócio fora até a P-02b", () => {
    const allowed = USER_ROLES.filter(canReadProof);
    expect(allowed).toEqual(["ADMINISTRATOR", "OPERATOR", "VIEWER"]);
    expect(canReadProof("PARTNER")).toBe(false);
  });

  it("requireProofRole devolve o usuário quando o papel é permitido", () => {
    expect(requireProofRole(active("OPERATOR"), canUploadProof)).toEqual({ userId: "u-1", role: "OPERATOR" });
  });

  it("sem sessão: UNAUTHENTICATED", () => {
    expect(codeOf(() => requireProofRole({ status: "anonymous" }, canUploadProof))).toBe("UNAUTHENTICATED");
  });

  it("sem papel, sem perfil e inativo: FORBIDDEN", () => {
    for (const reason of ["no-role", "no-profile", "inactive"] as const) {
      const session: SessionState = { status: "no-access", email: "pessoa@example.com", reason };
      expect(codeOf(() => requireProofRole(session, canUploadProof))).toBe("FORBIDDEN");
      expect(codeOf(() => requireProofRole(session, canReadProof))).toBe("FORBIDDEN");
    }
  });

  it("Sócio é recusado para enviar e para ler; Visualizador só lê", () => {
    expect(codeOf(() => requireProofRole(active("PARTNER"), canUploadProof))).toBe("FORBIDDEN");
    expect(codeOf(() => requireProofRole(active("PARTNER"), canReadProof))).toBe("FORBIDDEN");
    expect(codeOf(() => requireProofRole(active("VIEWER"), canUploadProof))).toBe("FORBIDDEN");
    expect(codeOf(() => requireProofRole(active("VIEWER"), canReadProof))).toBe("OK");
  });
});
