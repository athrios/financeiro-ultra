import { describe, expect, it } from "vitest";

import { classifyAuthError, isEmailSendRateLimit } from "./auth-errors";

describe("classifyAuthError", () => {
  it.each([
    [{ code: "over_request_rate_limit", status: 429 }, "rate-limit"],
    [{ code: "over_email_send_rate_limit", status: 429 }, "rate-limit"],
    [{ status: 429 }, "rate-limit"],
    [{ name: "AuthRetryableFetchError", status: 0 }, "network"],
    [{ status: 502 }, "network"],
    [{ status: 500, code: "unexpected_failure" }, "network"],
    [{ code: "invalid_credentials", status: 400 }, "invalid-credentials"],
    [{ status: 400 }, "invalid-credentials"],
    [{ code: "weak_password", status: 422 }, "weak-password"],
    [{ name: "AuthWeakPasswordError", status: 422 }, "weak-password"],
    [{ code: "same_password", status: 422 }, "same-password"],
    [{ code: "otp_expired", status: 403 }, "link-invalid"],
    [{ code: "flow_state_expired", status: 400 }, "link-invalid"],
    [{ name: "AuthSessionMissingError", status: 400 }, "session-missing"],
    [{ code: "session_not_found", status: 403 }, "session-missing"],
    [{ code: "bad_jwt", status: 401 }, "session-missing"],
    [{ code: "algo_novo", status: 418 }, "unexpected"],
  ] as const)("%j -> %s", (error, expected) => {
    expect(classifyAuthError(error)).toBe(expected);
  });

  it("trata ausência de erro como inesperado", () => {
    expect(classifyAuthError(null)).toBe("unexpected");
    expect(classifyAuthError(undefined)).toBe("unexpected");
  });

  it("limite de tentativas tem precedência sobre a rede e as credenciais", () => {
    expect(classifyAuthError({ status: 429, code: "invalid_credentials" })).toBe("rate-limit");
  });
});

describe("isEmailSendRateLimit", () => {
  it("reconhece o limite de envio por conta", () => {
    expect(isEmailSendRateLimit({ code: "over_email_send_rate_limit", status: 429 })).toBe(true);
  });

  it("não confunde com o limite geral de requisições nem com 429 sem código", () => {
    expect(isEmailSendRateLimit({ code: "over_request_rate_limit", status: 429 })).toBe(false);
    expect(isEmailSendRateLimit({ status: 429 })).toBe(false);
    expect(isEmailSendRateLimit(null)).toBe(false);
    expect(isEmailSendRateLimit(undefined)).toBe(false);
  });
});
