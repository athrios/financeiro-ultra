import { describe, expect, it } from "vitest";

import { parseAuthLink, parsePasswordMode, passwordModeFor } from "./auth-link";

const HASH = "abcDEF123456_-xyz7890";

describe("parseAuthLink", () => {
  it("aceita convite e recuperação com token_hash válido", () => {
    expect(parseAuthLink({ token_hash: HASH, type: "invite" })).toEqual({ tokenHash: HASH, type: "invite" });
    expect(parseAuthLink({ token_hash: HASH, type: "recovery" })).toEqual({ tokenHash: HASH, type: "recovery" });
  });

  it("rejeita tipos que a aplicação não usa", () => {
    for (const type of ["signup", "magiclink", "email_change", "email", "", undefined, 1]) {
      expect(parseAuthLink({ token_hash: HASH, type })).toBeNull();
    }
  });

  it("rejeita token_hash ausente, curto, longo ou com caracteres fora do formato", () => {
    for (const token_hash of [undefined, "", "curto", "a".repeat(513), "abc def ghi jkl", "abc/../../etc", "<script>alert(1)</script>", ["a", "b"]]) {
      expect(parseAuthLink({ token_hash, type: "invite" })).toBeNull();
    }
  });
});

describe("modo de definir senha", () => {
  it("convite -> convite; recuperação -> recuperacao", () => {
    expect(passwordModeFor("invite")).toBe("convite");
    expect(passwordModeFor("recovery")).toBe("recuperacao");
  });

  it("valor desconhecido na URL usa o texto neutro de recuperação", () => {
    expect(parsePasswordMode("convite")).toBe("convite");
    expect(parsePasswordMode("recuperacao")).toBe("recuperacao");
    expect(parsePasswordMode("qualquer")).toBe("recuperacao");
    expect(parsePasswordMode(undefined)).toBe("recuperacao");
  });
});
