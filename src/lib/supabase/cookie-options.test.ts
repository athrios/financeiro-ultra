import { describe, expect, it } from "vitest";

import { supabaseCookieOptions } from "./cookie-options";

describe("supabaseCookieOptions", () => {
  it("sempre httpOnly e sameSite lax", () => {
    for (const env of [undefined, "", "local", "staging", "production"]) {
      const options = supabaseCookieOptions(env);
      expect(options.httpOnly).toBe(true);
      expect(options.sameSite).toBe("lax");
    }
  });

  it("secure fora do ambiente local", () => {
    expect(supabaseCookieOptions("production").secure).toBe(true);
    expect(supabaseCookieOptions("staging").secure).toBe(true);
  });

  it("não usa secure no local (HTTP), inclusive com APP_ENV ausente ou vazia", () => {
    expect(supabaseCookieOptions("local").secure).toBe(false);
    expect(supabaseCookieOptions(undefined).secure).toBe(false);
    expect(supabaseCookieOptions("  ").secure).toBe(false);
  });
});
