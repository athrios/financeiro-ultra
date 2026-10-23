import { describe, expect, it } from "vitest";

import { metadata } from "./page";

describe("metadata de /auth/confirm", () => {
  it("não usa no-referrer: o envio do formulário sem JavaScript mandaria Origin null e o Next recusaria a Server Action", () => {
    expect(metadata.referrer).toBe("strict-origin");
  });

  it("não deixa o token ser indexado", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
