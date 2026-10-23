import { describe, expect, it } from "vitest";

import { isRecentLinkSession, LINK_SESSION_MAX_AGE_SECONDS } from "./link-session";

const NOW = 1_800_000_000;

describe("isRecentLinkSession", () => {
  it("aceita o método que o Auth local grava para convite e recuperação (otp)", () => {
    expect(isRecentLinkSession({ amr: [{ method: "otp", timestamp: NOW - 20 }] }, NOW)).toBe(true);
  });

  it("aceita convite e recuperação recentes", () => {
    expect(isRecentLinkSession({ amr: [{ method: "invite", timestamp: NOW - 30 }] }, NOW)).toBe(true);
    expect(isRecentLinkSession({ amr: [{ method: "recovery", timestamp: NOW - 600 }] }, NOW)).toBe(true);
  });

  it("recusa convite e recuperação antigos", () => {
    expect(
      isRecentLinkSession({ amr: [{ method: "recovery", timestamp: NOW - LINK_SESSION_MAX_AGE_SECONDS - 1 }] }, NOW),
    ).toBe(false);
  });

  it("recusa sessão aberta por senha, mesmo recente", () => {
    expect(isRecentLinkSession({ amr: [{ method: "password", timestamp: NOW - 5 }] }, NOW)).toBe(false);
  });

  it("recusa outros métodos (oauth, mfa, anônimo)", () => {
    for (const method of ["magiclink", "oauth", "totp", "mfa/totp", "anonymous"]) {
      expect(isRecentLinkSession({ amr: [{ method, timestamp: NOW }] }, NOW)).toBe(false);
    }
  });

  it("recusa claims ausentes, malformados ou sem timestamp", () => {
    expect(isRecentLinkSession(null, NOW)).toBe(false);
    expect(isRecentLinkSession({}, NOW)).toBe(false);
    expect(isRecentLinkSession({ amr: "recovery" }, NOW)).toBe(false);
    expect(isRecentLinkSession({ amr: ["recovery"] }, NOW)).toBe(false);
    expect(isRecentLinkSession({ amr: [{ method: "recovery" }] }, NOW)).toBe(false);
    expect(isRecentLinkSession({ amr: [{ method: "recovery", timestamp: "agora" }] }, NOW)).toBe(false);
    expect(isRecentLinkSession({ amr: [null] }, NOW)).toBe(false);
  });

  it("recusa horário muito no futuro", () => {
    expect(isRecentLinkSession({ amr: [{ method: "invite", timestamp: NOW + 3600 }] }, NOW)).toBe(false);
  });

  it("aceita se qualquer entrada servir", () => {
    expect(
      isRecentLinkSession(
        { amr: [{ method: "password", timestamp: NOW - 99999 }, { method: "recovery", timestamp: NOW - 10 }] },
        NOW,
      ),
    ).toBe(true);
  });
});
