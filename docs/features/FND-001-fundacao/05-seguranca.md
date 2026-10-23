# FND-001 · Segurança

> Registro das revisões do agente `seguranca`. O orquestrador transcreveu os resultados estruturados de cada execução sem mudar classificações; caminhos locais foram trocados por `<scratchpad>`. A E8b e a E9b do plano acrescentam seções a este arquivo.

## Postura de segurança (RAT-D020)

Em 23/10/2026 o responsável decidiu que o sistema é de uso interno e não precisa de muitas camadas de segurança. Fica o básico: login só por convite, papéis garantidos no banco, auditoria, comprovantes em área privada e segredos fora do código. Ficam fora: CAPTCHA e limite próprio de tentativas, CSP mais rígida, proteção contra descobrir se um e-mail tem conta, e-mails de aviso e outras camadas extras. Ver `brain-mensalidades-rateio/11-Decisoes.md`.

## E4 e E5 — revisão completa (23/10/2026)

**Bloqueia o commit:** não. **Achados:** 12 (4 médios, 5 baixos, 3 informativos). Feita antes da RAT-D020; a verificação final abaixo indica o destino de cada achado.

### SEG-E45-01 · médio

- **Evidência:** src\app\(auth-flow)\definir-senha\actions.ts: setPassword só exige getClaims().sub e chama updateUser({ password }) sem pedir a senha atual e sem conferir se a sessão veio de convite ou recuperação (claim amr). page.tsx mostra o formulário para qualquer sessão. supabase\config.toml: [auth.email] secure_password_change = false, e o template password_changed_notification está desligado. Cenário: alguém com acesso a uma sessão aberta (computador destravado ou cookie roubado, ver SEG-E45-04) abre /definir-senha, ou chama a API do Auth direto com a chave publishable, e define uma nova senha. Assim toma a conta de forma persistente e tira o dono, inclusive um Administrador. O dono não recebe aviso.
- **Impacto:** Tomada de conta persistente a partir de um acesso temporário à sessão. Para um Administrador, isso dá controle de acesso e da auditoria.
- **Correção recomendada:** (1) Na página e na action de /definir-senha, aceitar só sessão cujo amr tenha 'recovery', 'invite' ou 'otp' com timestamp recente (ex.: até 15 min). Fora disso, devolver o estado 'expired'. (2) Ligar secure_password_change = true no config.toml e no projeto remoto (E8/E9). Para uma troca de senha comum no futuro, exigir a senha atual ou reauthenticate(). (3) Ligar o e-mail de aviso de senha alterada. (4) Depois de definir a senha, chamar signOut({ scope: 'others' }). Como validar: logar com senha, abrir /definir-senha e postar a action, o resultado deve ser 'Sessão expirada'. Chamar PUT /auth/v1/user com a sessão de senha sem nonce deve falhar. O fluxo de convite e o de recuperação continuam passando.

### SEG-E45-02 · médio

- **Evidência:** src\app\(public)\recuperar-senha\actions.ts: quando classifyAuthError devolve 'rate-limit', a resposta muda para MESSAGES.rateLimit. src\server\auth-errors.ts inclui over_email_send_rate_limit em RATE_LIMIT_CODES. Pelo comportamento conhecido do GoTrue, esse 429 é por usuário: sai quando a conta EXISTE e já recebeu um e-mail dentro de max_frequency (1s no local, 60s por padrão no hospedado). Para e-mail inexistente a resposta é sempre 200. Cenário: o atacante pede a recuperação duas vezes seguidas para um e-mail. Se aparecer 'Muitas solicitações', a conta existe. Isso contradiz a regra 2.6 'sem enumeração'.
- **Impacto:** Enumeração de contas da empresa (e-mails de sócios e operadores), útil para phishing e força bruta dirigida. O impacto é limitado: base pequena e só um vazamento de existência.
- **Correção recomendada:** Na recuperação, tratar over_email_send_rate_limit como 'sent', com a mesma resposta de sucesso e só um log. Mostrar a mensagem de limite apenas para over_request_rate_limit ou para um 429 sem código por usuário, que vale para qualquer e-mail. Cobrir com teste de unidade. Como validar: duas solicitações em menos de 60s para um e-mail existente e para um inexistente devem dar respostas idênticas (estado e mensagem).

### SEG-E45-03 · médio

- **Evidência:** supabase\migrations\20261023000500_privileges.sql concede a authenticated INSERT (sha256, mime_type, size_bytes, original_name) em proof_files e EXECUTE em public.register_proof_file e complete_proof_file_upload. O sha256 é declarado pelo cliente e o banco não confere o conteúdo (R-D18, já registrado). Além disso, private.proof_upload_allowed(name) em 20261023000400_proof_files.sql não amarra o envio a uploaded_by: qualquer Operador envia para o caminho PENDING de outro usuário. Cenário: um Operador chama a RPC pelo PostgREST, sem passar pelo route handler da E7, com o sha256 de um comprovante legítimo que tem em mãos, e envia um arquivo adulterado de mesmo tamanho e mesmo tipo declarado. Quando o comprovante verdadeiro for enviado, a deduplicação (CA-10) devolve is_duplicate=true e aponta para o arquivo adulterado.
- **Impacto:** A integridade da prova de recebimento cai: o comprovante adulterado passa por original. Exige papel de Operador (risco interno). Ainda não há fluxo de negócio usando proof_files (E7).
- **Correção recomendada:** Na E7, antes de qualquer release com upload: (a) tirar de authenticated o INSERT direto e as RPCs, e fazer o registro só por um caminho no servidor que calcula o hash; ou (b) manter o caminho do cliente, mas antes de marcar STORED recalcular o SHA-256 do objeto com um papel confiável (route handler ou Edge Function) e recusar divergência. Também exigir em proof_upload_allowed que f.uploaded_by = auth.uid(). Como validar: um teste pgTAP/HTTP com sha256 falso deve ser recusado, e o upload de um Operador no caminho pendente de outro deve ser negado.

### SEG-E45-04 · baixo

- **Evidência:** src\lib\supabase\server.ts e src\lib\supabase\proxy.ts usam createServerClient sem cookieOptions. O padrão de @supabase/ssr (node_modules/@supabase/ssr/dist/main/utils/constants.js) é httpOnly: false, sameSite: 'lax', maxAge de 400 dias, sem secure explícito. Não existe createBrowserClient no projeto, então o JavaScript do navegador não precisa ler esses cookies. Somado ao 'unsafe-inline' da CSP (D-E5-02), um XSS futuro leria o access token e o refresh token.
- **Impacto:** Agrava qualquer XSS futuro: vira roubo de sessão de longa duração e, com SEG-E45-01, troca de senha. Hoje não achei sink de XSS (nenhum dangerouslySetInnerHTML).
- **Correção recomendada:** Passar cookieOptions { httpOnly: true, sameSite: 'lax', secure: APP_ENV !== 'local' } no servidor e no proxy, e reduzir o maxAge se o produto aceitar. Como validar: curl -i do login/proxy deve mostrar Set-Cookie sb-*-auth-token com HttpOnly (e Secure fora do local), e o login, a renovação e o logout devem continuar funcionando.

### SEG-E45-05 · médio

- **Evidência:** Login, recuperação e confirmação chamam o Auth a partir do servidor Next (Server Actions em src\app\(public)\login\actions.ts e recuperar-senha\actions.ts), sem limite próprio por IP ou por e-mail. Os limites do GoTrue (config.toml [auth.rate_limit]: sign_in_sign_ups = 30, email_sent = 2) são aplicados ao IP que chega no Auth, que passa a ser o do servidor e não o do usuário. Na Vercel (RAT-D016) os IPs de saída são compartilhados. Cenário: um atacante esgota o balde (30 tentativas em 5 min, ou 2 e-mails por hora no SMTP padrão) e todos os usuários ficam sem login ou sem recuperação. Do outro lado, a proteção contra força bruta por atacante deixa de existir.
- **Impacto:** Indisponibilidade de autenticação e recuperação para toda a empresa, com custo baixo para o atacante. Não vaza dados.
- **Correção recomendada:** Antes da E8/E9: limite na aplicação por IP real (x-forwarded-for da Vercel) e por e-mail nas três actions; CAPTCHA (ex.: Turnstile, integrado ao Auth) no login e na recuperação; SMTP próprio com limite adequado (já previsto em D-E5-09); conferir na plataforma hospedada qual IP o Auth enxerga em chamadas vindas do servidor. Como validar: um teste de carga controlado em staging deve mostrar que 31 falhas vindas de um IP não bloqueiam o login de outro IP.

### SEG-E45-06 · baixo

- **Evidência:** src\lib\env.ts: APP_ENV tem .default('local'). Em parseServerEnv, a recusa da SUPABASE_SECRET_KEY só vale quando appEnv !== 'local'. Em next.config.ts, HSTS e upgrade-insecure-requests dependem de APP_ENV === 'production'. Se APP_ENV for esquecida no deploy, o sistema falha aberto: aceita a chave secreta no runtime web, não manda HSTS e se identifica como local.
- **Impacto:** Configuração insegura silenciosa em produção. Hoje não há deploy (E8/E9).
- **Correção recomendada:** Exigir APP_ENV explícita quando NODE_ENV === 'production' ou quando VERCEL/VERCEL_ENV existir. Opcionalmente, recusar APP_ENV=local quando VERCEL_ENV=production. Como validar: teste de unidade em env.test.ts com NODE_ENV=production sem APP_ENV deve dar EnvError.

### SEG-E45-07 · baixo

- **Evidência:** src\lib\security-headers.ts: script-src 'self' 'unsafe-inline' sem nonce nem hash (D-E5-02), justificado pela incompatibilidade de nonce com PPR/Cache Components. O header X-Powered-By: Next.js não é desligado (falta poweredByHeader: false em next.config.ts). As compensações estão presentes: object-src 'none', base-uri 'self', form-action 'self', frame-ancestors 'none', connect-src restrito, nosniff, XFO DENY, COOP.
- **Impacto:** A CSP não segura um XSS refletido ou armazenado. Hoje não há sink conhecido. Aceitável como risco registrado.
- **Correção recomendada:** Aceitar formalmente D-E5-02 para a FND. Antes da produção, avaliar experimental.sri ou hashes dos scripts inline. Colocar poweredByHeader: false. Como validar: curl -I deve vir sem X-Powered-By, e, se o SRI for adotado, a CSP não deve ter 'unsafe-inline' em script-src e o build deve funcionar.

### SEG-E45-08 · baixo

- **Evidência:** Consulta somente leitura ao banco local (information_schema.role_table_grants): service_role mantém TRUNCATE, DELETE, INSERT e UPDATE em public.partners e public.proof_files (20261023000500_privileges.sql só revoga em profiles e audit_logs). TRUNCATE não dispara os triggers de linha prevent_mutation (partners_no_delete, proof_files_no_delete) nem audit_row_change, e só audit_logs tem o trigger de TRUNCATE.
- **Impacto:** Quem tem acesso SQL como service_role apagaria comprovantes ou sócios sem trilha. Pelo PostgREST não existe TRUNCATE, então a exploração exige sessão SQL direta. Risco baixo.
- **Correção recomendada:** revoke truncate on all tables in schema public from service_role (e no default privileges), mais um trigger before truncate com private.prevent_truncate em partners e proof_files. Estender o teste de catálogo: nenhuma tabela auditada pode ter TRUNCATE para anon, authenticated ou service_role. Como validar: has_table_privilege('service_role', 'public.proof_files', 'TRUNCATE') = false no pgTAP.

### SEG-E45-09 · baixo

- **Evidência:** docs\legado\07-10\scripts\seed-dev.ts:24 mantém const DEV_PASSWORD = process.env.DEV_SEED_PASSWORD || "<valor antigo omitido>" (senha fixa antiga do ambiente local, já no histórico do git, apontada pela E4). O código ativo (scripts/seed-dev.ts) não tem valor fixo: usa DEV_SEED_PASSWORD ou uma senha aleatória.
- **Impacto:** Só é relevante se esse valor tiver sido reutilizado em algum ambiente não local ou conta pessoal. O arquivo é arquivado e não é executado.
- **Correção recomendada:** O responsável confirma que o valor nunca foi usado fora do Supabase local e não será reutilizado. Com aprovação (RAT-D012), trocar o literal da cópia arquivada por um placeholder ('<removido>'). Reescrever o histórico não é necessário se o valor só serviu ao ambiente local. Como validar: grep do valor no repositório sem ocorrências fora do histórico.

### SEG-E45-10 · informativo

- **Evidência:** 20261023000200_audit.sql concede a authenticated o EXECUTE de private.audit_event (SECURITY DEFINER), private.set_audit_context e private.require_audit_reason. Hoje isso é seguro porque o schema private não está em [api] schemas nem em extra_search_path (config.toml) e as duas únicas RPCs públicas não repassam entrada a essas funções. Uma RPC INVOKER futura que repasse texto do usuário como entity, action ou p_source permitiria forjar eventos ou origem (SYSTEM/IMPORT) na auditoria.
- **Impacto:** Nenhum hoje. É uma condição para as features futuras.
- **Correção recomendada:** Regra de revisão: nunca expor o schema private; RPCs futuras chamam audit_event e set_audit_context só com literais fixos (entity, action e source). Acrescentar ao teste de catálogo que 'private' não está entre os schemas expostos. Como validar: revisão de código de cada migration nova.

### SEG-E45-11 · informativo

- **Evidência:** /auth/confirm (src\app\(auth-flow)\auth\confirm\actions.ts) troca o token_hash por uma sessão no clique e substitui a sessão que já estiver aberta no navegador (D-E5-05, rota excluída de REDIRECT_WHEN_AUTHENTICATED de propósito). Um atacante interno pode mandar à vítima o próprio link de recuperação: a vítima clica e passa a usar a conta do atacante (login CSRF). Nada no fluxo mostra qual conta foi assumida.
- **Impacto:** Baixo. A conta do atacante tem o papel dele, e o token é gasto pela vítima.
- **Correção recomendada:** Opcional: em /definir-senha, mostrar o e-mail da conta da sessão ('Definindo a senha de f***@dominio') para a pessoa perceber a troca. Como validar: o e-mail mascarado aparece na tela.

### SEG-E45-12 · informativo

- **Evidência:** Controles conferidos e corretos. RLS ligado nas 4 tabelas. anon sem nenhum privilégio em public. Nenhuma função SECURITY DEFINER em public, e todas as funções de public e private com search_path=''. supabase db advisors --local e db lint sem achados. Bucket proofs privado, sem política de UPDATE/DELETE em storage.objects. bootstrap_first_admin, set_user_access e resolve_user_for_access sem EXECUTE para public, anon, authenticated e service_role (D-E4-03 ok). D-E4-01 (assert_admin_remains DEFINER) só lê e lança erro: ok. D-E4-05 e D-E4-06 concedem funções DEFINER ou IMMUTABLE que devolvem só booleano ou texto normalizado, em private não exposto: ok. service_role sem escrita em profiles e audit_logs. audit_logs append-only (UPDATE, DELETE e TRUNCATE bloqueados) e lida só pelo Administrador ativo. Perfil nasce sem papel; guardas exigem motivo e advisory lock; trava do último Administrador. enable_signup=false e anonymous=false. Templates de convite e recuperação usam {{ .SiteURL }}/auth/confirm (link só para o próprio site), e additional_redirect_urls só tem a 3001. safeInternalPath bloqueia //, \\, controles, esquemas e rotas de auth, e o proxy só leva next em GET. A mensagem de login é única para e-mail inexistente e senha errada. O correlation id é gerado no proxy (o do cliente é ignorado). O logger redige token_hash, JWT, sb_secret, e-mail e CPF, e o onRequestError descarta a query. A tela de erro mostra só o digest. A chave secreta não aparece em src (só verificação de ausência em env.server.ts), e a publishable recusa sb_secret e JWT service_role. Para o papel Sócio, o layout não consulta partners e as páginas revalidam com decideAccess (layout e página renderizam em paralelo). O legado fica em docs/legado/07-10/supabase, fora de supabase/migrations; schema_paths está vazio e seed sql_paths=['./seed.sql'], então a CLI não aplica o legado. Nomes do seed são fictícios (Sócio Exemplo A/B/C, @example.com). .env*, supabase/.temp e .acessos/ estão no .gitignore (git check-ignore conferido). npm audit (com dev) = 0 vulnerabilidades. As memórias em .claude/agent-memory não têm segredos.
- **Impacto:** Nenhum.
- **Correção recomendada:** Nenhuma. Manter os testes de catálogo como regressão.

**Não verificado nesta revisão:**

- Testes HTTP dinâmicos (o QA é o único que roda next start): flags reais do Set-Cookie, recusa de Server Action com Origin diferente do Host e comportamento sem cabeçalho Origin (o aviso 'Missing origin header' sugere que a requisição segue).
- Payload RSC em execução para o papel Sócio e para usuário sem papel: conferi só por leitura de código (layout, decideAccess, ModulePage, DashboardPage). A ausência de dados no payload veio do smoke declarado pela E5.
- Enumeração na recuperação (SEG-E45-02): baseada no comportamento conhecido do GoTrue (429 over_email_send_rate_limit por usuário). Não disparei e-mails no Auth local para não interferir no QA.
- IP enxergado pelo Auth em chamadas vindas do servidor e efeito dos limites na plataforma hospedada (SEG-E45-05): depende da Vercel e do Supabase remoto (E8/E9).
- Configuração do projeto Supabase remoto (site_url, redirect URLs, SMTP, secure_password_change, expiração de OTP) e variáveis da Vercel: fora do escopo e sem acesso.
- Execução dos 220 testes pgTAP e dos 191 de unidade: não rodei (é tarefa do QA). Li os padrões de risco dos testes (sem disable trigger nem session_replication_role).
- Comportamento visual e com JavaScript no navegador (mensagem de erro do login e CSP real em produção).
- Conteúdo de .env.local e .acessos/: não lidos, por política.
- Revisão linha a linha de todo o 02-modelagem-dados.md e do 03-ui-ux.md contra o código: conferi só as seções ligadas ao foco de segurança.

## E4 e E5 — verificação final após as correções (23/10/2026)

**Bloqueia o commit:** não. Verificação leve, de acordo com a RAT-D020, sobre a rodada de correções registrada em `04-implementacao.md`.

| Item | Severidade | Status |
|---|---|---|
| SEG-E45-01 | médio | corrigido |
| SEG-E45-04 | baixo | corrigido |
| SEG-E45-03 | médio | aberto |
| SEG-E45-06/07/08/10 | baixo | corrigido |
| AUTZ-BASICO | informativo | ok |
| SEGREDOS | informativo | ok |
| SEG-E45-09 | baixo | aberto |
| SEG-E45-12 | baixo | novo |
| REGRESSOES-RODADA | informativo | ok |
| FORA-ESCOPO-RAT-D020 | informativo | fora_do_escopo_RAT-D020 |

### SEG-E45-01 · médio · corrigido

- **Evidência:** src\lib\link-session.ts aceita só amr otp/invite/recovery de até 15 min. Page e action de src\app\(auth-flow)\definir-senha usam essa regra e a action chama signOut({scope:'others'}) depois de trocar a senha. Prova ao vivo em <scratchpad>\sec\live.cjs: (D1) com sessão de login por senha, o GET /definir-senha não mostra o campo de senha; (D4) um POST com os IDs da action tirados de uma sessão legítima de recuperação, mas enviado com a sessão por senha do admin, não trocou a senha: o login com a senha nova deu 400 e a senha antiga continua valendo (200); o log registrou auth.set_password_without_link_session. (D2/D3) O link de recuperação legítimo abre o formulário. config.toml: secure_password_change=true e [auth.email.notification.password_changed] enabled=false (D-E5-12 revertido, RAT-D020); o modelo password_changed.html foi removido.
- **Correção ou próximo passo:** Nenhuma. Para validar de novo, repetir live.cjs D1 a D5.

### SEG-E45-04 · baixo · corrigido

- **Evidência:** src\lib\supabase\cookie-options.ts (httpOnly true, sameSite lax, secure fora do local) é usado por server.ts e proxy.ts. Nenhum createBrowserClient no src. Ao vivo, o Set-Cookie do login traz sb-*-auth-token com 'HttpOnly; SameSite=lax' (C1 a C3). O logout por formulário devolve 303 para /login, remove os cookies sb-* e o GET / seguinte vai para /login (307).
- **Correção ou próximo passo:** Nenhuma.

### SEG-E45-03 · médio · aberto

- **Evidência:** Parte corrigida: em 20261023000400_proof_files.sql, private.proof_upload_allowed agora exige uploaded_by = auth.uid() e o bucket continua privado, sem UPDATE/DELETE em storage.objects. A exclusão lógica só é feita pelo Administrador, é definitiva e exige motivo: CHECK com coalesce (QA-B1) e guarda de trigger. Ainda falta: o sha256 continua sendo declarado pelo cliente (dedupe pode ser envenenada por um Operador). O próprio dev registrou isso como pré-requisito BLOQUEANTE de qualquer release com upload (E7). Hoje não existe tela de upload.
- **Correção ou próximo passo:** Na E7, calcular o sha256 no servidor sobre o objeto enviado e conferi-lo antes de passar para STORED, recusando se divergir. Validar com um teste pgTAP ou de integração: registrar com um hash e enviar outro conteúdo deve falhar.

### SEG-E45-06/07/08/10 · baixo · corrigido

- **Evidência:** (06) src\lib\env.ts exige APP_ENV explícita na Vercel e recusa local com VERCEL_ENV=production. (07) curl -sI /login sem X-Powered-By, com nosniff, X-Frame-Options DENY e Referrer-Policy. (08) 20261023000500_privileges.sql revoga TRUNCATE de anon/authenticated/service_role e dos default privileges, e partners, profiles e proof_files ganharam BEFORE TRUNCATE. (10) O teste de config garante que private fica fora da API. npm run db:test rodado nesta verificação: PASS, 6 arquivos, 229 testes.
- **Correção ou próximo passo:** Nenhuma.

### AUTZ-BASICO · informativo · ok

- **Evidência:** authenticated não tem INSERT/UPDATE em profiles, então não há autopromoção (só SELECT, mais as colunas permitidas em proof_files). A guarda profiles_guard_insert/update exige motivo de auditoria e o constraint trigger diferido profiles_admin_remains impede ficar sem nenhum Administrador ativo. RLS: partners para can_read_business, audit_logs só Administrador. seed:dev confirma 'sócios visíveis' 3/3/3 para Administrador, Operador e Visualizador e 0 para Sócio e para usuário sem papel. Ao vivo (live2.cjs): nas 12 rotas de (app), o Sócio e o usuário sem papel não mostram nomes ou ids de outros sócios nem e-mails de outros usuários, nem no HTML nem no payload RSC (text/x-component, seguindo o redirect _rsc do Next 16). A string 'ADMINISTRATOR' que aparece para o Visualizador é só o metadado de papéis do menu, sem dado.
- **Correção ou próximo passo:** Nenhuma. Repetir a prova de payload RSC quando a E6/E7 passar a renderizar dados de negócio (ver nao_verificado).

### SEGREDOS · informativo · ok

- **Evidência:** Busca em 286 arquivos versionados ou não ignorados (sem .acessos, node_modules e .next): só chaves fictícias de teste em src\lib\logger.test.ts. Nenhum e-mail real (só example.com e um comentário padrão do config.toml). Nenhum nome real em .claude\agent-memory, docs, scripts, src, supabase ou no Brain. Seeds usam 'Exemplo'. Build novo (npm run build OK): a chave secreta local (sb_secret e o JWT service_role) não aparece em nenhum arquivo de .next, nem no servidor nem no static, e não há referências a SUPABASE_SECRET_KEY nem DEV_SEED_PASSWORD em .next/static. No src, SUPABASE_SECRET_KEY só aparece em env.server.ts/env.ts, para recusá-la fora do local. As 3 cópias novas em docs\legado\07-10 não têm segredos. O log do next start não tem senha, JWT nem token_hash.
- **Correção ou próximo passo:** Nenhuma.

### SEG-E45-09 · baixo · aberto

- **Evidência:** docs\legado\07-10\scripts\seed-dev.ts:24 ainda tem o valor fixo antigo de reserva para DEV_SEED_PASSWORD (só senha local, que já está no histórico do git). Registrado como pendente de confirmação do responsável. O código ativo gera senha aleatória.
- **Correção ou próximo passo:** Com aprovação do responsável (RAT-D012), trocar o literal na cópia arquivada por um marcador ou registrar o aceite. Se esse valor já foi usado em algum ambiente não local, trocar a senha lá.

### SEG-E45-12 · baixo · novo

- **Evidência:** Prova logout.cjs: depois do logout (303 /login, cookies apagados), um GET / com o cookie antigo copiado antes do logout devolve 200. A sessão é validada com getClaims (src\server\auth.ts, proxy.ts), que confere só a assinatura do JWT. O refresh token é revogado, mas o access token vale até expirar (jwt_expiry=3600). Para explorar é preciso já ter o cookie (HttpOnly) e a janela é de no máximo 1h. É o comportamento padrão do Supabase e não é regressão desta rodada.
- **Correção ou próximo passo:** Opcional, a critério do responsável (RAT-D020): reduzir jwt_expiry (por exemplo 900 s) ou, nas ações sensíveis futuras (E6+), conferir a sessão no Auth (getUser) em vez de só getClaims. Para validar, repetir logout.cjs: o cookie antigo deve dar 307 para /login depois do prazo escolhido.

### REGRESSOES-RODADA · informativo · ok

- **Evidência:** D-E4-10 (uploaded_by na política), D-E4-11 (coalesce no CHECK) e D-E4-12 (TRUNCATE) conferidos no SQL; db:test 229 PASS. D-E5-11 (largura da sidebar) não afeta segurança. D-E5-12: aviso desligado e modelo removido (supabase\templates só tem invite.html e recovery.html). D-E5-13: a janela de 15 min usa o timestamp do amr, que não renova no refresh, então falha fechada. D-E5-14: amr 'otp' também valeria para um login futuro por código de e-mail, que exige a mesma prova de posse do e-mail; hoje não existe. Atenção: a migration 20261023000400 foi editada no lugar. É aceitável enquanto não tiver sido aplicada em nenhum ambiente remoto.
- **Correção ou próximo passo:** Antes da E8/E9, confirmar que nenhuma migration foi aplicada fora do local. Daí em diante, só migrations novas.

### FORA-ESCOPO-RAT-D020 · informativo · fora_do_escopo_RAT-D020

- **Evidência:** SEG-E45-02 (enumeração na recuperação: o dev já trata over_email_send_rate_limit como sucesso), SEG-E45-05 (limite próprio de tentativas/CAPTCHA), SEG-E45-11 (e-mail mascarado em /definir-senha), D-E5-02 (CSP com unsafe-inline, sem nonce), aviso de senha alterada por e-mail e MFA. Ficam fora pela decisão do responsável de 23/10/2026 (sistema interno). Lembrete: na Vercel o endereço é público, então o login por convite e a RLS continuam sendo a barreira, e foram conferidos acima.
- **Correção ou próximo passo:** Nenhuma nesta fase. Registrar formalmente como RAT-D020.

**Não verificado nesta verificação:**

- Controle positivo do payload RSC: na FND as telas de (app) ainda são placeholders e nem o Administrador vê dados de sócios nelas, então a prova de 'Sócio sem dados' cobre só o que existe hoje. Repetir quando a E6/E7 renderizar dados.
- Fluxo de convite ponta a ponta e /auth/confirm com tokens inválidos ou repetidos não foram refeitos ao vivo nesta rodada leve (o dev cobriu no suite2.cjs). Só a recuperação foi exercitada.
- Upload real ao bucket proofs via Storage API não foi exercitado ao vivo. Confiei no pgTAP 06 (PASS) e na leitura do SQL.
- Configuração remota (Supabase hospedado e Vercel) não foi verificada: secure_password_change, enable_signup=false, redirect URLs, APP_ENV e ausência da chave secreta nas variáveis da Vercel.
- Efeito colateral local: o seed:dev foi rodado com uma DEV_SEED_PASSWORD aleatória própria; as senhas dos 5 usuários fictícios locais mudaram (o valor está em <scratchpad>\sec\pw.secret). O servidor next start (PID 61628) foi encerrado e a porta 3001 está livre. O Supabase local continua rodando.

## Pendências de segurança

- **SEG-E45-03** (médio, aberto): Na E7, calcular o sha256 no servidor sobre o objeto enviado e conferi-lo antes de passar para STORED, recusando se divergir. Validar com um teste pgTAP ou de integração: registrar com um hash e enviar outro conteúdo deve falhar.
- **SEG-E45-09** (baixo, aberto): Com aprovação do responsável (RAT-D012), trocar o literal na cópia arquivada por um marcador ou registrar o aceite. Se esse valor já foi usado em algum ambiente não local, trocar a senha lá.
- **SEG-E45-12** (baixo, novo): Opcional, a critério do responsável (RAT-D020): reduzir jwt_expiry (por exemplo 900 s) ou, nas ações sensíveis futuras (E6+), conferir a sessão no Auth (getUser) em vez de só getClaims. Para validar, repetir logout.cjs: o cookie antigo deve dar 307 para /login depois do prazo escolhido.
