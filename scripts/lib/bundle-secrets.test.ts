import { describe, expect, it } from "vitest";

import { findSecrets } from "./bundle-secrets";

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
const jwt = (role: string) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ iss: "supabase-demo", role })}.assinatura-ficticia-123`;

describe("findSecrets (CA-12)", () => {
  it("não acusa nada em um bundle só com a chave publicável e o JWT anon", () => {
    const bundle = `const a="sb_publishable_ABCDEFGHIJKLMNOPQRSTUV";const b="${jwt("anon")}";`;
    expect(findSecrets(bundle)).toEqual([]);
  });

  it("acusa uma chave sb_secret_ qualquer", () => {
    expect(findSecrets('x="sb_secret_ABCDEFGHIJKLMNOPQRSTUVWX"')).toEqual([{ kind: "chave-secreta-sb" }]);
  });

  it("acusa um JWT com papel service_role", () => {
    expect(findSecrets(`x="${jwt("service_role")}"`)).toEqual([{ kind: "jwt-service-role" }]);
  });

  it("acusa o valor exato de um segredo conhecido, dizendo só o nome da variável", () => {
    const found = findSecrets("minha-chave-privada-12345678", { SUPABASE_SECRET_KEY: "minha-chave-privada-12345678" });
    expect(found).toEqual([{ kind: "valor-conhecido", detail: "SUPABASE_SECRET_KEY" }]);
    expect(JSON.stringify(found)).not.toContain("minha-chave-privada");
  });

  it("ignora segredos conhecidos ausentes ou curtos demais", () => {
    expect(findSecrets("abc curto abc", { A: undefined, B: "", C: "curto" })).toEqual([]);
  });

  it("não quebra com JWT malformado", () => {
    expect(findSecrets("eyJhbGciOiJIUzI1NiJ9.eyJnaWRvIjoxMjM0NTY3ODkwMTIzNDU.semassinatura123")).toEqual([]);
  });
});
