import { beforeEach, describe, expect, it, vi } from "vitest";

const resetPasswordForEmail = vi.fn();
const warn = vi.fn();
const info = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { resetPasswordForEmail } }),
}));
vi.mock("@/server/request-context", () => ({
  getRequestLogger: async () => ({ warn, info }),
}));

import { requestPasswordReset, type RecoveryState } from "./actions";

const initial: RecoveryState = { status: "idle", email: "", tone: "danger", message: null, field: null, sentCount: 0 };

function form(email: string): FormData {
  const data = new FormData();
  data.set("email", email);
  return data;
}

describe("requestPasswordReset (sem enumeração de contas)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sucesso do Auth: estado sent", async () => {
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    const state = await requestPasswordReset(initial, form("a@example.com"));
    expect(state).toMatchObject({ status: "sent", message: null, sentCount: 1 });
  });

  it("over_email_send_rate_limit (por conta) dá a MESMA resposta de sucesso e só registra em log", async () => {
    resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });
    const ok = await requestPasswordReset(initial, form("existe@example.com"));
    resetPasswordForEmail.mockResolvedValueOnce({
      data: {},
      error: { status: 429, code: "over_email_send_rate_limit", name: "AuthApiError" },
    });
    const limited = await requestPasswordReset(initial, form("existe@example.com"));
    expect(limited).toEqual({ ...ok, email: "existe@example.com" });
    expect(limited.status).toBe("sent");
    expect(limited.message).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      "auth.recovery_request_failed",
      expect.objectContaining({ code: "over_email_send_rate_limit" }),
    );
  });

  it("e-mail inexistente (200) e existente em limite (429 por conta) são indistinguíveis", async () => {
    resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });
    const inexistente = await requestPasswordReset(initial, form("x@example.com"));
    resetPasswordForEmail.mockResolvedValueOnce({
      data: {},
      error: { status: 429, code: "over_email_send_rate_limit" },
    });
    const existente = await requestPasswordReset(initial, form("x@example.com"));
    expect(existente).toEqual(inexistente);
  });

  it("limite geral (over_request_rate_limit) mostra a mensagem de limite, igual para qualquer e-mail", async () => {
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: { status: 429, code: "over_request_rate_limit" } });
    const a = await requestPasswordReset(initial, form("a@example.com"));
    const b = await requestPasswordReset(initial, form("b@example.com"));
    expect(a.status).toBe("error");
    expect(a.message).toContain("Muitas solicitações");
    expect({ ...a, email: "" }).toEqual({ ...b, email: "" });
  });

  it("429 sem código também mostra a mensagem de limite", async () => {
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: { status: 429 } });
    const state = await requestPasswordReset(initial, form("a@example.com"));
    expect(state.message).toContain("Muitas solicitações");
  });

  it("falha de rede mostra a mensagem de rede", async () => {
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: { name: "AuthRetryableFetchError", status: 0 } });
    const state = await requestPasswordReset(initial, form("a@example.com"));
    expect(state.message).toContain("Não foi possível enviar");
  });

  it("e-mail inválido não chama o Auth", async () => {
    const state = await requestPasswordReset(initial, form("nao-e-email"));
    expect(state.field).toBe("email");
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });
});
