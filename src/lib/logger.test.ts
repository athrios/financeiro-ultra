import { describe, expect, it } from "vitest";

import { createLogger, isSensitiveKey, redact, redactString, REDACTED, type LogSink } from "./logger";

// Valores fictícios (RAT-D019). Os "segredos" abaixo são inventados.
const FAKE_JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.c2lnbmF0dXJhX2ZpY3RpY2lh";
const FAKE_SECRET_KEY = "sb_secret_abcdefghijklmnop";
const FAKE_CPF = "000.000.004-34";

function capture() {
  const lines: Array<{ level: string; parsed: Record<string, unknown>; raw: string }> = [];
  const sink: LogSink = (level, raw) => lines.push({ level, raw, parsed: JSON.parse(raw) as Record<string, unknown> });
  return { lines, sink };
}

const fixedNow = () => new Date("2026-10-23T12:00:00.000Z");

describe("isSensitiveKey", () => {
  it.each([
    "password",
    "senha",
    "Authorization",
    "cookie",
    "access_token",
    "refreshToken",
    "token_hash",
    "apiKey",
    "SUPABASE_SECRET_KEY",
    "cpf",
    "CPF do sócio",
    "agência",
    "agencia",
    "conta_bancaria",
    "bankAccount",
    "chave_pix",
    "raw_extraction",
    "session_id",
  ])("considera %s sensível", (key) => {
    expect(isSensitiveKey(key)).toBe(true);
  });

  it.each(["userId", "correlationId", "event", "path", "status", "contact", "pixel", "content", "tokenHashPresent", "sessionPresent"])(
    "não considera %s sensível",
    (key) => {
      expect(isSensitiveKey(key)).toBe(false);
    },
  );
});

describe("redactString", () => {
  it("redige JWT, Bearer, chave secreta e CPF", () => {
    const text = `falhou com ${FAKE_JWT} e Bearer abcdefgh12345678 chave ${FAKE_SECRET_KEY} cpf ${FAKE_CPF} ou 00000000434`;
    const result = redactString(text);
    expect(result).not.toContain(FAKE_JWT);
    expect(result).not.toContain("abcdefgh12345678");
    expect(result).not.toContain(FAKE_SECRET_KEY);
    expect(result).not.toContain(FAKE_CPF);
    expect(result).not.toContain("00000000434");
    expect(result).toContain(REDACTED);
  });

  it("redige token e senha em parâmetros de URL", () => {
    const result = redactString("https://app.exemplo.test/auth/confirm?token_hash=abc123def&type=invite&next=/");
    expect(result).not.toContain("abc123def");
    expect(result).toContain("type=invite");
  });

  it("redige pares nome=valor de segredo em texto livre (QA-LOG)", () => {
    const casos: Array<[string, string]> = [
      ["falha ao entrar password=Abc12345xyz fim", "Abc12345xyz"],
      ["token=abcdef123456 expirou", "abcdef123456"],
      ["senha: minhaSenha99 incorreta", "minhaSenha99"],
      ["access_token=eyzzz refresh_token=qqq111", "qqq111"],
      ["apiKey=sk_live_998877", "sk_live_998877"],
      ["{\"password\":\"segredo com espaço\",\"ok\":true}", "segredo com espaço"],
      ["client_secret = valorSecreto7", "valorSecreto7"],
      ["cookie: sb-abc-auth-token=base64-AAAA", "base64-AAAA"],
    ];
    for (const [texto, segredo] of casos) {
      const saida = redactString(texto);
      expect(saida, texto).not.toContain(segredo);
      expect(saida, texto).toContain(REDACTED);
    }
  });

  it("redige credenciais embutidas em URL (QA-LOG)", () => {
    const comSenha = redactString("falha em https://admin:S3nh4Forte@db.exemplo.test:5432/app");
    expect(comSenha).not.toContain("S3nh4Forte");
    expect(comSenha).not.toContain("admin");
    expect(comSenha).toContain("db.exemplo.test:5432/app");
    const soToken = redactString("clone https://ghp_ABCDEF123456@git.exemplo.test/repo.git");
    expect(soToken).not.toContain("ghp_ABCDEF123456");
    expect(redactString("postgres://postgres:postgres@127.0.0.1:54322/postgres")).not.toContain("postgres:postgres");
  });

  it("não redige texto comum que só cita a palavra, nem URL sem credenciais", () => {
    expect(redactString("auth.password_set concluído")).toBe("auth.password_set concluído");
    expect(redactString("a senha foi definida")).toBe("a senha foi definida");
    expect(redactString("https://app.exemplo.test/definir-senha?modo=convite")).toBe(
      "https://app.exemplo.test/definir-senha?modo=convite",
    );
  });

  it("mascara e-mails mantendo só a inicial e o domínio", () => {
    expect(redactString("usuario@example.com falhou")).toBe("u***@example.com falhou");
  });

  it("não altera texto comum nem números de outros tamanhos", () => {
    expect(redactString("Competência 10/2026 com 12 recebimentos, valor 123456")).toBe(
      "Competência 10/2026 com 12 recebimentos, valor 123456",
    );
  });

  it("trunca textos muito longos", () => {
    expect(redactString("a".repeat(5000)).length).toBeLessThan(2100);
  });
});

describe("redact", () => {
  it("redige por nome de campo em objetos aninhados e listas", () => {
    const result = redact({
      user: { id: "u-1", password: "x", profile: { cpf: FAKE_CPF } },
      headers: [{ authorization: `Bearer ${FAKE_JWT}` }],
      ok: true,
      count: 3,
    }) as Record<string, unknown>;
    expect(JSON.stringify(result)).not.toContain(FAKE_CPF);
    expect(JSON.stringify(result)).not.toContain(FAKE_JWT);
    expect(result).toMatchObject({
      user: { id: "u-1", password: REDACTED, profile: { cpf: REDACTED } },
      ok: true,
      count: 3,
    });
  });

  it("serializa Error com nome, mensagem e stack redigidos", () => {
    const error = new Error(`falha na chave ${FAKE_SECRET_KEY} do usuário ${FAKE_CPF}`);
    const result = JSON.stringify(redact(error));
    expect(result).toContain("falha na chave");
    expect(result).not.toContain(FAKE_SECRET_KEY);
    expect(result).not.toContain(FAKE_CPF);
  });

  it("preserva digest e code do erro", () => {
    const error = Object.assign(new Error("x"), { digest: "123456", code: "42501" });
    expect(redact(error)).toMatchObject({ digest: "123456", code: "42501" });
  });

  it("trata referência circular e profundidade excessiva", () => {
    const circular: Record<string, unknown> = { nome: "a" };
    circular.self = circular;
    expect(redact(circular)).toEqual({ nome: "a", self: "[circular]" });
    let deep: Record<string, unknown> = { fim: true };
    for (let i = 0; i < 20; i += 1) deep = { nivel: deep };
    expect(() => JSON.stringify(redact(deep))).not.toThrow();
  });

  it("converte bigint e descarta função", () => {
    expect(redact({ n: BigInt(10), f: () => 1 })).toEqual({ n: "10", f: undefined });
  });
});

describe("createLogger", () => {
  it("escreve uma linha JSON com time, level, event e correlationId", () => {
    const { lines, sink } = capture();
    const logger = createLogger({ level: "info", sink, now: fixedNow }).child({ correlationId: "c-1" });
    logger.info("auth.login_succeeded", { userId: "u-1" });
    expect(lines).toHaveLength(1);
    expect(lines[0].parsed).toEqual({
      correlationId: "c-1",
      userId: "u-1",
      time: "2026-10-23T12:00:00.000Z",
      level: "info",
      event: "auth.login_succeeded",
    });
  });

  it("respeita o nível mínimo", () => {
    const { lines, sink } = capture();
    const logger = createLogger({ level: "warn", sink, now: fixedNow });
    logger.debug("a");
    logger.info("b");
    logger.warn("c");
    logger.error("d");
    expect(lines.map((line) => line.parsed.event)).toEqual(["c", "d"]);
  });

  it("nunca grava segredos, tokens, CPF nem dados bancários na linha final", () => {
    const { lines, sink } = capture();
    const logger = createLogger({ level: "debug", sink, now: fixedNow });
    logger.error("falha", {
      password: "senha-fictícia",
      token_hash: "hash-fictício",
      detail: `token ${FAKE_JWT} e chave ${FAKE_SECRET_KEY}`,
      socio: { cpf: FAKE_CPF, agencia: "0001", conta: "12345-6", chavePix: "chave" },
      error: new Error(`CPF ${FAKE_CPF}`),
    });
    const raw = lines[0].raw;
    for (const leaked of ["senha-fictícia", "hash-fictício", FAKE_JWT, FAKE_SECRET_KEY, FAKE_CPF, "12345-6", "0001"]) {
      expect(raw).not.toContain(leaked);
    }
  });

  it("dados do chamador não sobrescrevem time, level nem event", () => {
    const { lines, sink } = capture();
    const logger = createLogger({ level: "info", sink, now: fixedNow });
    logger.info("evento", { time: "falso", level: "debug", event: "outro" });
    expect(lines[0].parsed).toMatchObject({ time: "2026-10-23T12:00:00.000Z", level: "info", event: "evento" });
  });

  it("child acumula contexto sem alterar o logger original", () => {
    const { lines, sink } = capture();
    const root = createLogger({ level: "info", sink, now: fixedNow });
    const child = root.child({ correlationId: "c-2" });
    root.info("a");
    child.info("b");
    expect(lines[0].parsed).not.toHaveProperty("correlationId");
    expect(lines[1].parsed).toHaveProperty("correlationId", "c-2");
  });

  it("usa console.error para erros e console.warn para avisos quando não há sink", () => {
    const logger = createLogger({ level: "debug", now: fixedNow });
    expect(() => logger.debug("teste de console")).not.toThrow();
  });
});

describe("CNPJ no log (SEG-CAD-01)", () => {
  const NUMERIC = "99.999.999/0002-72";
  const NUMERIC_BARE = "99999999000272";
  const ALPHA = "12.ABC.345/01DE-35";
  const ALPHA_BARE = "12ABC34501DE35";
  const ALPHA_LOWER = "12abc34501de35";

  it.each([NUMERIC, NUMERIC_BARE, ALPHA, ALPHA_BARE, ALPHA_LOWER])("redige o CNPJ %s dentro de um texto", (cnpj) => {
    const result = redactString(`Key (document)=(${cnpj}) already exists; dono ${cnpj}.`);
    expect(result).not.toContain(cnpj);
    expect(result).toContain(REDACTED);
  });

  it("não redige UUID, id comum nem texto curto (ids não são dado pessoal)", () => {
    const uuid = "6f1d7a4e-0b1c-4d2e-8f3a-9b8c7d6e5f40";
    const text = `id ${uuid} operation cadastros.save_client request abcdefghijkl12345`;
    expect(redactString(text)).toBe(text);
  });

  it("redige o campo document, documento e cnpj pelo nome, mesmo sem padrão no valor", () => {
    expect(isSensitiveKey("document")).toBe(true);
    expect(isSensitiveKey("documento")).toBe(true);
    expect(isSensitiveKey("cnpj")).toBe(true);
    expect(redact({ document: "qualquer", documento: "x", cnpj: "y", id: "ok" })).toEqual({
      document: REDACTED,
      documento: REDACTED,
      cnpj: REDACTED,
      id: "ok",
    });
  });

  it("o CNPJ numérico dentro de um objeto de log sai redigido na linha inteira", () => {
    const { lines, sink } = capture();
    const logger = createLogger({ level: "info", sink, now: fixedNow });
    logger.error("falha", { cause: { message: `valor ${NUMERIC_BARE} e ${ALPHA}`, details: { document: NUMERIC_BARE } } });
    for (const leaked of [NUMERIC, NUMERIC_BARE, ALPHA, ALPHA_BARE]) expect(lines[0].raw).not.toContain(leaked);
  });
});
