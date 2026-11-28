import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { deleteUser, inviteUser } from "./support/admin";
import { setUserAccess } from "./support/access";
import { e2eEnv, USERS } from "./support/env";
import { CookieJar } from "./support/http";
import { confirmLinkFrom, noMailFor, waitForMail } from "./support/mail";
import { followPage, getPage, loginByForm, logoutByForm, submitForm } from "./support/pages";

/**
 * CA-08 (E8): smoke de acesso ponta a ponta, SEM navegador (o Playwright não foi aprovado).
 * Cada passo é uma requisição HTTP real ao `next start` e ao Supabase local; os formulários são
 * enviados como um navegador sem JavaScript os enviaria (Server Actions por envio nativo) e os
 * e-mails de convite e recuperação são lidos no Mailpit local. Só usuários fictícios (RAT-D019).
 */

const env = e2eEnv();
const randomPassword = () => `Ex-${randomBytes(9).toString("base64url")}-9`;
const runId = randomBytes(4).toString("hex");

describe("login, guarda de rota e logout", () => {
  it("sem sessão, páginas do sistema redirecionam ao login com o destino preservado", async () => {
    const jar = new CookieJar();
    const home = await getPage(jar, "/");
    expect(home.status).toBe(307);
    expect(home.location).toMatch(/^\/login/);
    const clients = await getPage(jar, "/clientes");
    expect(clients.status).toBe(307);
    expect(clients.location).toBe("/login?next=%2Fclientes");
    const users = await getPage(jar, "/configuracoes/usuarios");
    expect(users.location).toMatch(/^\/login/);
  });

  it("a tela de login é pública e mostra o nome do produto", async () => {
    const page = await getPage(new CookieJar(), "/login");
    expect(page.status).toBe(200);
    expect(page.html).toContain("Financeiro Ultra");
    expect(page.html).toContain('name="password"');
  });

  it("credenciais erradas ou e-mail inexistente recebem a mesma mensagem e não criam sessão", async () => {
    const wrongPassword = new CookieJar();
    const first = await loginByForm(wrongPassword, USERS.admin, "senha-errada-123");
    expect(first.status).toBe(200);
    expect(first.all).toContain("E-mail ou senha inválidos.");
    expect(first.all).not.toContain("senha-errada-123");
    expect(wrongPassword.names()).toHaveLength(0);

    const unknown = await loginByForm(new CookieJar(), "ninguem-aqui@example.com", "qualquer-coisa-12");
    expect(unknown.all).toContain("E-mail ou senha inválidos.");

    const empty = await loginByForm(new CookieJar(), "", "");
    expect(empty.all).toContain("Informe um e-mail válido e a senha.");
  });

  it("Administrador entra, vê o Dashboard e o menu; /login já com sessão volta ao início", async () => {
    const jar = new CookieJar();
    const login = await loginByForm(jar, USERS.admin, env.password);
    expect(login.status).toBe(303);
    expect(login.location).toBe("/");
    expect(jar.names().length).toBeGreaterThan(0);

    const home = await followPage(jar, "/");
    expect(home.status).toBe(200);
    expect(home.html).toContain("<title>Dashboard · Financeiro Ultra</title>");
    expect(home.text).toContain("Administrador");
    expect(home.html).toContain('aria-label="Principal"');
    expect(home.html).toContain('href="/configuracoes/usuarios"');

    const again = await getPage(jar, "/login");
    expect(again.status).toBe(307);
    expect(again.location).toBe("/");
  });

  it("o destino 'next' é respeitado quando interno e ignorado quando externo", async () => {
    const internal = await loginByForm(new CookieJar(), USERS.admin, env.password, "/clientes");
    expect(internal.location).toBe("/clientes");
    for (const evil of ["//evil.example", "https://evil.example/", "/\\evil.example"]) {
      const result = await loginByForm(new CookieJar(), USERS.admin, env.password, evil);
      expect(result.location).toBe("/");
    }
  });

  it("logout encerra a sessão: o cookie some e a guarda volta a redirecionar", async () => {
    const jar = new CookieJar();
    await loginByForm(jar, USERS.operator, env.password);
    expect((await followPage(jar, "/")).status).toBe(200);

    const out = await logoutByForm(jar);
    expect(out.status).toBe(303);
    expect(out.location).toBe("/login");
    expect(jar.names()).toHaveLength(0);

    const after = await getPage(jar, "/");
    expect(after.status).toBe(307);
    expect(after.location).toMatch(/^\/login/);
  });

  it("cookie de sessão inválido é tratado como sem sessão, sem erro 500", async () => {
    const jar = new CookieJar();
    jar.set("sb-127-auth-token", "base64-eyJleHBpcmVkIjp0cnVlfQ");
    const result = await getPage(jar, "/competencias");
    expect(result.status).toBe(307);
    expect(result.location).toMatch(/^\/login/);
  });
});

describe("acesso por situação do usuário", () => {
  afterAll(() => {
    // Devolve o Operador do seed ao estado ativo, mesmo se um teste falhar no meio.
    setUserAccess("operator", "OPERATOR", true);
    // Tempo próprio de 90 s: setUserAccess roda `supabase db query` (cerca de 10 s com a máquina ocupada, mais no Windows), acima do hookTimeout global de 30 s.
  }, 90_000);

  it("usuário sem papel entra, mas só vê 'Sem acesso ativo' em qualquer rota, sem menu nem módulos", async () => {
    const jar = new CookieJar();
    const login = await loginByForm(jar, USERS.noRole, env.password);
    expect(login.status).toBe(303);
    for (const path of ["/", "/competencias", "/recebimentos", "/configuracoes/usuarios"]) {
      const page = await followPage(jar, path);
      expect(page.status, path).toBe(200);
      expect(page.text, path).toContain("Sem acesso ativo");
      expect(page.html, path).not.toContain('aria-label="Principal"');
    }
  });

  it("Sócio entra, mas não recebe dados de negócio (negar por padrão até a P-02b)", async () => {
    const jar = new CookieJar();
    await loginByForm(jar, USERS.partner, env.password);
    for (const path of ["/", "/recebimentos", "/configuracoes/socios"]) {
      const page = await followPage(jar, path);
      expect(page.text, path).toContain("Acesso de sócio ainda não disponível");
      expect(page.html, path).not.toContain('aria-label="Principal"');
    }
  });

  it("Visualizador não acessa a administração de usuários", async () => {
    const jar = new CookieJar();
    await loginByForm(jar, USERS.viewer, env.password);
    const page = await followPage(jar, "/configuracoes/usuarios");
    expect(page.text).toContain("não permite acessar esta área");
  });

  it("usuário inativado continua autenticando, mas perde o acesso na hora; ao reativar, volta", async () => {
    const jar = new CookieJar();
    await loginByForm(jar, USERS.operator, env.password);
    expect((await followPage(jar, "/")).text).not.toContain("Sem acesso ativo");

    setUserAccess("operator", "OPERATOR", false);
    const blocked = await followPage(jar, "/competencias");
    expect(blocked.text).toContain("Sem acesso ativo");
    expect(blocked.html).not.toContain('aria-label="Principal"');

    // Um login novo, com o usuário ainda inativo, cai no mesmo bloqueio.
    const fresh = new CookieJar();
    await loginByForm(fresh, USERS.operator, env.password);
    expect((await followPage(fresh, "/")).text).toContain("Sem acesso ativo");

    setUserAccess("operator", "OPERATOR", true);
    expect((await followPage(jar, "/")).text).not.toContain("Sem acesso ativo");
    // Tempo próprio de 90 s: cada setUserAccess roda `supabase db query` (cerca de 10 s com a máquina ocupada), duas vezes aqui.
  }, 90_000);
});

describe("auto-cadastro desligado", () => {
  const headers = { apikey: env.publishableKey, "content-type": "application/json" };

  for (const [name, endpoint, extra] of [
    ["cadastro com senha", "/auth/v1/signup", { password: randomPassword() }],
    ["link mágico/OTP criando usuário", "/auth/v1/otp", { create_user: true }],
  ] as const) {
    it(`${name} é recusado pelo Auth e não envia e-mail`, async () => {
      const email = `cadastro-${runId}-${endpoint.slice(-6)}@example.com`;
      const since = new Date(Date.now() - 1000);
      const response = await fetch(`${env.supabaseUrl}${endpoint}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ email, ...extra }),
      });
      const body = (await response.json()) as { error_code?: string };
      expect(response.status).toBe(422);
      expect(body.error_code).toBe("signup_disabled");
      expect(await noMailFor(email, since, 1000)).toBe(true);
    });
  }

  it("a tela de login não oferece cadastro", async () => {
    const page = await getPage(new CookieJar(), "/login");
    expect(page.text).not.toMatch(/criar conta|cadastre-se|registrar/i);
  });
});

describe("convite -> /auth/confirm -> definir senha -> entrar, e recuperação de senha", () => {
  const email = `convite-${runId}@example.com`;
  const firstPassword = randomPassword();
  const recoveredPassword = randomPassword();
  let userId = "";

  beforeAll(async () => {
    userId = await inviteUser(email);
  });

  afterAll(async () => {
    if (userId) await deleteUser(userId);
  });

  it("convite -> e-mail no Mailpit -> abrir o link não gasta o token -> clicar -> definir senha -> entrar", async () => {
    // O convite foi criado no beforeAll; o e-mail precisa estar no Mailpit.
    const mail = await waitForMail(email, new Date(Date.now() - 60_000));
    expect(mail).not.toBeNull();
    expect(mail!.html).toContain("Financeiro Ultra");
    const link = confirmLinkFrom(mail!);
    expect(link?.type).toBe("invite");
    expect(new URL(`http://x${link!.path}`).pathname).toBe("/auth/confirm");

    const jar = new CookieJar();
    // Abrir duas vezes (como um verificador de e-mail faria) não consome o token nem cria sessão.
    const open1 = await getPage(jar, link!.path);
    const open2 = await getPage(jar, link!.path);
    expect(open1.text).toContain("Aceitar convite");
    expect(open2.text).toContain("Aceitar convite");
    expect(open1.html).toContain("noindex");
    expect(jar.names()).toHaveLength(0);

    // Sem sessão, definir senha não mostra o formulário.
    const anonymous = await getPage(new CookieJar(), "/definir-senha?modo=convite");
    expect(anonymous.html).not.toContain('name="password"');

    const confirm = await submitForm(jar, link!.path, {});
    expect(confirm.status).toBe(303);
    expect(confirm.location).toBe("/definir-senha?modo=convite");
    expect(jar.names().length).toBeGreaterThan(0);

    const form = "/definir-senha?modo=convite";
    const page = await getPage(jar, form);
    expect(page.html).toContain('name="password"');
    const short = await submitForm(jar, form, { password: "curta", confirm: "curta" });
    expect(short.all).toContain("não atende às regras");
    const mismatch = await submitForm(jar, form, { password: firstPassword, confirm: `${firstPassword}x` });
    expect(mismatch.all).toContain("não coincidem");
    const done = await submitForm(jar, form, { password: firstPassword, confirm: firstPassword });
    expect(done.all).toContain('"status":"done"');

    // O mesmo link não vale uma segunda vez.
    const reuse = await submitForm(new CookieJar(), link!.path, {});
    expect(reuse.status).not.toBe(303);
    expect(reuse.all).toContain('"status":"invalid"');

    // Entrar com a senha definida: usuário novo nasce sem papel (negar por padrão).
    const entered = new CookieJar();
    const login = await loginByForm(entered, email, firstPassword);
    expect(login.status).toBe(303);
    expect((await followPage(entered, "/")).text).toContain("Sem acesso ativo");
  });

  it("recuperação: e-mail no Mailpit -> clicar -> nova senha -> a antiga deixa de valer", async () => {
    const since = new Date(Date.now() - 1000);
    const request = await submitForm(new CookieJar(), "/recuperar-senha", { email });
    expect(request.all).toContain('"status":"sent"');

    const mail = await waitForMail(email, since);
    expect(mail).not.toBeNull();
    const link = confirmLinkFrom(mail!);
    expect(link?.type).toBe("recovery");

    const jar = new CookieJar();
    const confirm = await submitForm(jar, link!.path, {});
    expect(confirm.status).toBe(303);
    expect(confirm.location).toBe("/definir-senha?modo=recuperacao");

    const form = "/definir-senha?modo=recuperacao";
    const done = await submitForm(jar, form, { password: recoveredPassword, confirm: recoveredPassword });
    expect(done.all).toContain('"status":"done"');

    const old = await loginByForm(new CookieJar(), email, firstPassword);
    expect(old.status).toBe(200);
    expect(old.all).toContain("E-mail ou senha inválidos.");
    const fresh = await loginByForm(new CookieJar(), email, recoveredPassword);
    expect(fresh.status).toBe(303);

    const reuse = await submitForm(new CookieJar(), link!.path, {});
    expect(reuse.status).not.toBe(303);
    expect(reuse.all).toContain('"status":"invalid"');
  });

  it("recuperação para e-mail desconhecido responde igual e não envia e-mail", async () => {
    const unknown = `ninguem-${runId}@example.com`;
    const since = new Date(Date.now() - 1000);
    const known = await submitForm(new CookieJar(), "/recuperar-senha", { email });
    const other = await submitForm(new CookieJar(), "/recuperar-senha", { email: unknown });
    expect(other.status).toBe(known.status);
    expect(other.all).toContain('"status":"sent"');
    expect(await noMailFor(unknown, since)).toBe(true);
  });

  it("/auth/confirm com parâmetros inválidos mostra link inválido, sem erro 500 e sem sessão", async () => {
    for (const path of [
      "/auth/confirm",
      "/auth/confirm?token_hash=abc&type=invite",
      "/auth/confirm?token_hash=abcdefgh1234&type=signup",
      `/auth/confirm?token_hash=${"a".repeat(600)}&type=invite`,
    ]) {
      const jar = new CookieJar();
      const page = await getPage(jar, path);
      expect(page.status, path).toBe(200);
      expect(page.text, path).not.toContain("Aceitar convite");
      expect(jar.names(), path).toHaveLength(0);
    }
  });
});
