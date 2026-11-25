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

## E8b (23/10/2026)

**Bloqueia release:** não. Conferência curta do básico (RAT-D020), somente leitura, sobre a rodada E7 + E8 + ajustes RAT-D021/QA da branch `fnd-001/e7-e8`. Revisão de código e consultas SELECT ao Supabase local; o ambiente de execução (build, next start, e2e) ficou com o QA.

| Item | Severidade | Status |
|---|---|---|
| SEG-E8B-01 Upload e leitura de comprovantes | informativo | ok |
| SEG-E45-03 Hash calculado no servidor | médio | corrigido |
| SEG-E8B-02 Operador pela RPC/storage direto com hash falso | médio | aceito_RAT-D020 |
| SEG-E8B-03 RAT-D021 (motivo opcional) sem afrouxar guardas | informativo | ok |
| SEG-E8B-04 CI e workflow de migrations | informativo | ok |
| SEG-E8B-05 Curinga de Redirect URL de Preview no checklist | baixo | novo |
| SEG-E8B-06 Bootstrap e checklist da E9 | informativo | ok |
| SEG-E8B-07 Segredos e nomes reais no repositório | informativo | ok |

### SEG-E8B-01 · informativo · ok

- **Evidência:** `POST /api/comprovantes` autoriza antes de ler o corpo (`requireProofRole` + `canUploadProof`: só Administrador e Operador; `loadSession` lê o perfil pelo RLS e trata sem perfil, inativo e sem papel como sem acesso; Sócio fica fora da lista). Limite do corpo explícito (Content-Length e contagem de bytes, 4 MiB + 64 KiB) e, no banco, `file_size_limit` do bucket = 4 MiB. Validação pela assinatura binária (`%PDF-` no byte 0, PNG, JPEG) coerente com extensão e tipo declarado. SHA-256 calculado no servidor; o hash do cliente não é usado. Caminho `{aaaa}/{mm}/{id}.{ext}` gerado pelo banco e conferido por CHECK (`proof_files_path_format`); o nome original só fica em coluna de metadado, limitado a 255. Upload com a sessão do usuário e `upsert:false`. Bucket `proofs` privado (confirmado no banco local). Leitura só por `GET /api/comprovantes/{id}/url`: papel conferido no servidor (Administrador, Operador, Visualizador), linha lida pelo RLS, só STORED e não excluído, URL assinada de 60 s, que não vai para o log. Erros em JSON com mensagem fixa em pt-BR; erro inesperado vira a mensagem genérica e a causa fica só no log do servidor. Sem sessão em `/api`, o proxy responde 401 JSON. Nenhum uso de `SUPABASE_SECRET_KEY` nas rotas nem em `src/server/proofs`; `env.ts` recusa a chave fora do ambiente local.
- **Correção ou próximo passo:** Nenhuma.

### SEG-E45-03 · médio · corrigido

- **Evidência:** No caminho da aplicação, o hash é calculado pelo servidor sobre os bytes recebidos (`sha256Hex`) e é ele que vai para `register_proof_file`; o e2e cobre "hash falso do cliente ignorado". Ao concluir, `private.proof_files_guard_update` confere nome, tamanho e tipo em `storage.objects`.
- **Correção ou próximo passo:** Nenhuma. O resto (chamada direta) está no SEG-E8B-02.

### SEG-E8B-02 · médio · aceito_RAT-D020

- **Evidência:** Um Operador autenticado pode chamar `register_proof_file` e o Storage direto, sem passar pela rota, registrando um hash qualquer e enviando conteúdo diferente com o mesmo tamanho e tipo. O banco confere só a coerência entre linha e objeto. Isso está registrado no 04 (E7) e caracterizado pelo e2e "caminho direto". Visualizador, Sócio e sem papel recebem 42501.
- **Correção ou próximo passo:** Aceito pela RAT-D020, sem camada extra. Reduzir exigiria tirar a escrita direta do Operador (decisão de produto). Rever quando houver tela de upload ou dados reais.

### SEG-E8B-03 · informativo · ok

- **Evidência:** Diff das migrations: saiu só a exigência de motivo (`require_audit_reason` removida; os guardas de `profiles` e `set_user_access` não a chamam mais; o CHECK de exclusão lógica exige só a coerência entre `deleted_at` e `deleted_by`). Motivo em branco (espaço, tab, CR, LF) vira NULL em `set_audit_context`, `audit_insert` e no guard de `proof_files`. Ficaram intactos: a serialização por advisory lock nos guardas de `profiles`, o constraint trigger diferido `profiles_admin_remains` (último Administrador), o trigger de auditoria em INSERT/UPDATE/DELETE de `profiles`, as políticas sem INSERT/UPDATE/DELETE em `profiles` para authenticated e a exclusão de comprovante só pelo Administrador. No banco local: authenticated e service_role sem escrita em `profiles`; authenticated sem UPDATE, DELETE ou TRUNCATE em `audit_logs`; `bootstrap_first_admin` e `set_user_access` sem EXECUTE para anon e authenticated; `require_audit_reason` não existe mais. Autopromoção continua impossível pela API. A auditoria (quem, o que, quando, de onde) é gravada mesmo sem motivo, como provam os pgTAP 03, 04 e 06 relatados pelo dev.
- **Correção ou próximo passo:** Nenhuma. O 02-modelagem-dados.md ainda descreve motivo obrigatório (D-E4-13), o que é divergência de documento e não de segurança.

### SEG-E8B-04 · informativo · ok

- **Evidência:** `ci.yml`: `permissions: contents: read`, checkout com `persist-credentials: false`, gatilhos `push` e `pull_request` (sem `pull_request_target`), nenhum segredo do repositório. As chaves do Supabase local são mascaradas com `::add-mask::` e o arquivo temporário é apagado. A chave secreta local entra só no passo do seed (env do passo); o `next start` não a recebe com o nome que a aplicação lê. `check:bundle` roda depois do build e procura os valores conhecidos (`SUPABASE_SECRET_KEY`, `E2E_SUPABASE_SECRET_KEY` e as service_role), além de `sb_secret_` e JWT com role service_role, sem imprimir o valor. `migrations.yml`: só `workflow_dispatch`; o job exige `github.actor` e `github.triggering_actor` iguais ao responsável e `github.ref == refs/heads/main`; `permissions: contents: read`; segredos só no `env` dos passos que os usam; ordem simulação, `db push` e só depois o deploy hook; `curl` sem eco, com a saída em arquivo; nunca roda `config push`. `vercel.json`: região gru1 e `git.deploymentEnabled.main=false`. Observações que não são achados: (a) confirmar que `athrios` é exatamente o usuário do GitHub do responsável; se não for, o job fica sempre pulado, o que é seguro; (b) o deploy hook publica o último commit da `main` no momento da chamada, não necessariamente o commit migrado, o que não preocupa com um único responsável; (c) as actions são fixadas por tag (`@v4`), e não por SHA.
- **Correção ou próximo passo:** Nenhuma. Na E9b, guardar a evidência da primeira execução real (job pulado para outro usuário, push na main sem deploy, hook publicando Production).

### SEG-E8B-05 · baixo · novo

- **Evidência:** O checklist da E9 (passo 3) manda cadastrar `https://*-<slug>.vercel.app/auth/confirm` como Redirect URL. O curinga também casa com a URL de Production de um projeto de outra conta da Vercel cujo nome termine em `-<slug>` (por exemplo `algo-<slug>.vercel.app`). O risco é baixo porque os modelos de convite e recuperação usam `{{ .SiteURL }}` e não `{{ .RedirectTo }}`, e a aplicação não passa `redirectTo`. Por isso o token não iria para outro domínio. Mesmo assim, a entrada é mais larga do que precisa, e Preview e Production usam o mesmo projeto Supabase (P-05c2).
- **Correção ou próximo passo:** No checklist, preferir só `<site-de-production>/auth/confirm`, mais a URL fixa de branch do Preview quando ela for necessária (`<projeto>-git-<branch>-<slug>.vercel.app/auth/confirm`). Se o curinga continuar, registrar o aceite e manter os modelos com `SiteURL`. Para validar, conferir na tela URL Configuration da E9b que só existem as entradas esperadas.

### SEG-E8B-06 · informativo · ok

- **Evidência:** `bootstrap-first-admin.sql` só tem marcadores (`<EMAIL-DO-ADMINISTRADOR>`, `<IDENTIFICACAO-DE-QUEM-EXECUTA>`), com aviso para não versionar a versão preenchida; o script de conferência não mostra e-mail. O checklist manda desligar o auto-cadastro, testar o `signup_disabled` (CA-15), não usar `localhost` nem `*.vercel.app/**`, não cadastrar a chave secreta, a service_role nem a string de conexão na Vercel (inclusive removendo as que a integração criar) e não rodar `config push`. Os modelos de e-mail usam `token_hash` com `SiteURL`.
- **Correção ou próximo passo:** Nenhuma, além do SEG-E8B-05.

### SEG-E8B-07 · informativo · ok

- **Evidência:** Busca nos 60 arquivos alterados ou novos da rodada (sem `.acessos`): nenhuma chave `sb_secret_`/`sb_publishable_` real, nenhum JWT real, nenhuma URL de projeto hospedado ou de deploy hook, nenhuma senha local usada nos testes desta rodada. Só aparecem valores fictícios nos testes do detector. Não há e-mail pessoal; o único identificador real é o usuário do GitHub do repositório, que já estava no plano. `.env.local` e `.acessos/` continuam ignorados pelo git.
- **Correção ou próximo passo:** Nenhuma.

**Não verificado nesta conferência:**

- Execução real da CI e do workflow de migrations no GitHub, do deploy hook e do `vercel.json` (dependem da E9).
- Configuração hospedada (Supabase Auth e variáveis da Vercel), que fica para a E9b.
- Não reexecutei o e2e nem o pgTAP (ambiente com uso exclusivo do QA). Confiei no relato do dev e em duas consultas SELECT ao banco local.
- Controle positivo do payload RSC com dados de negócio, porque ainda não há tela que mostre comprovantes.

### Revalidação (23/10/2026)

**Bloqueia release:** não. Rodada curta, somente leitura de código e documentos (sem build, servidor, reset ou seed; o ambiente estava com o QA).

| Item | Severidade | Status |
|---|---|---|
| SEG-E8B-05 Curinga de Redirect URL no checklist | baixo | corrigido |
| B-01/B2 Troca de `no-referrer` por `strict-origin` em `/auth/confirm` | informativo | ok |
| 02-modelagem-dados.md sincronizado (revisão 4) | informativo | ok |

- **SEG-E8B-05:** o passo 3 do `checklist-e9.md` agora pede só `<site-de-production>/auth/confirm` e, se necessário, a URL fixa de branch do Preview, e proíbe de forma explícita `*.vercel.app/**` e `*-<slug>.vercel.app/...`, com o motivo. Os modelos de e-mail continuam com `{{ .SiteURL }}`. Ainda falta conferir na tela URL Configuration durante a E9b.
- **B-01/B2:** a mudança se resume ao `referrer` do metadata da página. `strict-origin` manda no máximo o domínio, nunca o caminho nem a query com o `token_hash`, e não manda nada em downgrade de HTTPS para HTTP. Então a intenção do `no-referrer` (token fora do Referer) continua valendo. O `robots` noindex/nofollow ficou. A proteção de origem das Server Actions não foi afrouxada: não há `serverActions.allowedOrigins` no `next.config`, e a correção faz o navegador mandar o Origin verdadeiro em vez de `null`, sem desligar a checagem. A ação `confirmAuthLink` não mudou: revalida o formato com `parseAuthLink`, chama `verifyOtp` só no clique, tem destino fixo (`/definir-senha?modo=...`) sem parâmetro de redirecionamento e não registra o token no log. O teste de unidade novo trava `strict-origin` e o noindex. Também conferido o B3: o aviso `senha-definida` saiu de `/login` sem deixar referência.
- **02 sincronizado:** conferido por amostragem contra as migrations. `require_audit_reason` aparece como retirada, e as funções `SECURITY DEFINER` usam `search_path = ''`. Em `bootstrap_first_admin` e `set_user_access`, o EXECUTE está revogado de `public`, `anon`, `authenticated` e `service_role`. O bootstrap roda em uma única instrução. TRUNCATE está revogado e há triggers `BEFORE TRUNCATE`. Para `proof_upload_allowed`, o documento exige `uploaded_by = auth.uid()`. O bucket é privado e não tem UPDATE/DELETE em `storage.objects`. Os grants de `audit_event`/`set_audit_context` para `authenticated` batem com a migration `0200`. Não encontrei nada no documento menos restritivo que o implementado.

**Não verificado nesta revalidação:** não repeti a prova em navegador real antes da hidratação (fica com o QA) e não confrontei o 02 linha a linha com as migrations. A configuração hospedada continua para a E9b.

## Pendências de segurança

- **SEG-E45-03** (médio): **corrigido na E7** (hash calculado no servidor). O caminho direto pela RPC é o SEG-E8B-02, aceito pela RAT-D020.
- **SEG-E8B-05** (baixo): **corrigido no checklist em 23/10/2026** (sem curinga). Falta conferir a tela URL Configuration na E9b.
- **SEG-E45-09** (baixo): **encerrado em 23/10/2026.** O responsável confirmou que o valor nunca foi usado fora do ambiente local. A cópia arquivada fica como está (RAT-D012).
- **SEG-E45-12** (baixo): **aceito pela RAT-D020 em 23/10/2026**, sem correção por ora. A recomendação era opcional: reduzir jwt_expiry (por exemplo 900 s) ou, nas ações sensíveis futuras (E6+), conferir a sessão no Auth (getUser) em vez de só getClaims.

## E9b · Render e dependências (25/11/2026)

**Bloqueia release:** não. **Liberado para o deploy no Render**, com dados fictícios, desde que o responsável siga o `checklist-e9.md` e guarde as evidências do SEG-E9B-08. Dados reais continuam presos à P-05c2 (SEG-E9B-07). Conferência curta (RAT-D020), sobre as mudanças ainda não commitadas da branch `fnd-001/e9`: `render.yaml`, `.node-version`, `src/lib/env.ts`, `src/lib/env.server.ts`, `next.config.ts`, `package.json`/lock, `migrations.yml`, README, checklist e plano (revisão 12). Além da leitura, rodei testes locais com `next start` simulando o Render, os testes unitários e o `npm audit`, e varri a árvore atual e todo o histórico (`git rev-list --all`, 4 commits).

| Item | Severidade | Status |
|---|---|---|
| SEG-E9B-01 Proteção do `APP_ENV` no Render, cookies `Secure` e HSTS | informativo | ok |
| SEG-E9B-02 `render.yaml` e `migrations.yml` sem segredo | informativo | ok |
| SEG-E9B-03 Dependências (`npm audit`) | informativo | ok |
| SEG-E9B-04 Documentação de Auth e variáveis | informativo | ok |
| SEG-E9B-05 Repositório público | médio | aceito pelo responsável (25/11/2026) |
| SEG-E9B-06 Limites do Supabase Auth por IP, com o IP do servidor | médio | fora_do_escopo_RAT-D020 (já era SEG-E45-05) |
| SEG-E9B-07 Plano gratuito do Render | baixo sem dados reais; alto com dados reais | aberto, preso à P-05c2 |
| SEG-E9B-08 Configuração nos painéis (Render, Supabase, GitHub) | informativo | pendente de evidência |

### SEG-E9B-01 · informativo · ok

- **Evidência:**
  - **Regra.** `isHosted` considera `VERCEL`, `VERCEL_ENV` ou `RENDER`. No Render, `deployEnvIssues` exige `APP_ENV` e recusa `local` (com `trim`), sem depender de `VERCEL_ENV`. Qualquer valor não vazio de `RENDER` conta como hospedagem, inclusive `false`, o que é falha fechada. `getServerEnv` repassa `RENDER`.
  - **Build.** `assertDeployEnv` roda no topo do `next.config.ts`. Agora valida também as duas variáveis públicas, com a mesma recusa de `sb_secret_` e de JWT `service_role`. As mensagens não repetem valores.
  - **Provas ao vivo** (com o build local que já existia):
    - `RENDER=true next start` sem `APP_ENV` dá "APP_ENV: obrigatória…" e o processo sai com código 1, sem atender `/login`;
    - com `APP_ENV=local`, dá "o valor 'local' não é permitido no Render" e também sai com 1;
    - com `APP_ENV=production` e a chave secreta presente no ambiente, o hook de instrumentação recusa e todas as respostas viram 500.
  - **Testes.** `env`, `security-headers` e `supabase/*` passaram (4 arquivos, 43 testes).
  - **Sem regressão.** Na Vercel, o Preview com `local` continua aceito e a Production com `local` continua recusada. A única mudança é que `assertDeployEnv` passa a exigir as variáveis públicas, o que é mais restritivo. No build local e na CI nada muda: sem `VERCEL`/`RENDER`, `assertDeployEnv({})` não acusa nada, e a CI usa `APP_ENV=local` sem essas variáveis.
  - **Cabeçalhos.** Confirmei que são fixados no build: com o build local, um `next start` com `APP_ENV=production` não mandou HSTS. No Render isso não é problema, porque o `render.yaml` fixa `APP_ENV=production` por `value`, valendo no build e na execução. Com `production` entram HSTS (`max-age=31536000`, sem `includeSubDomains`, o que é o certo num subdomínio de `onrender.com`) e `upgrade-insecure-requests`.
  - **Cookies.** O `Secure` depende de `process.env.APP_ENV`, lido em tempo de execução (não é embutido no bundle), e não do protocolo que chega ao `next start`. Por isso o TLS terminar no balanceador do Render não o afeta.
- **Correção ou próximo passo:** Nenhuma. Se `APP_ENV` mudar no painel, fazer novo build (já está no checklist, passo 4.5).

### SEG-E9B-02 · informativo · ok

- **Evidência:**
  - **`render.yaml`.** Só `APP_ENV=production` e `LOG_LEVEL=info` têm valor. `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` usam `sync: false`. Não há chave secreta, `service_role`, string de conexão nem `NODE_VERSION`. `autoDeployTrigger: 'off'`, sem bloco `previews` (padrão desligado), `plan: free`, `region: virginia`, `branch: main`.
  - **`migrations.yml`.** O passo do deploy hook lê `RENDER_DEPLOY_HOOK_URL` só por `env:`, sem `-v`, sem `set -x` e sem `echo` da URL. A resposta do Render (id do deploy) vai para arquivo e só aparecem os primeiros 400 bytes, sem dado sensível. O GitHub mascara o valor do segredo no log.
  - **Sem mudança.** Continuam iguais: `workflow_dispatch`; checagem de `actor`/`triggering_actor` igual a `athrios` e `ref` igual a `main`; `permissions: contents: read`; `persist-credentials: false`; ordem simulação → `db push` → hook. O `ci.yml` continua sem segredos e sem `pull_request_target`.
  - **Observações que não são achados.** A linha do `curl` perdeu a quebra `\` e ficou com espaços no meio: é só cosmético e funciona. Um Blueprint do Render sincroniza com a `main`, então mudar o `render.yaml` na `main` muda a configuração do serviço. Só o responsável tem escrita no repositório.
- **Correção ou próximo passo:** Nenhuma. Opcional: refazer a quebra de linha do `curl` na próxima edição do workflow.

### SEG-E9B-03 · informativo · ok

- **Evidência:**
  - `npm audit --omit=dev`, rodado nesta revisão: **0 vulnerabilidades**.
  - `npm ls` mostra `next@16.4.6`, `eslint-config-next@16.4.6` e `zod@4.6.7` no topo, deduplicado no runtime. Isso resolve os 7 avisos moderados do Next 16.4.2 e o alto do zod <4.6.6.
  - O `npm audit` completo ainda mostra 14 avisos (11 moderados, 3 altos), todos em dependências de desenvolvimento: o CLI `shadcn` (com `zod@3.25.76` aninhado e `@shadcn/registry`), `hono`/`@hono/node-server` (vindos do SDK MCP do shadcn), `minimatch` e `typescript-eslint`.
  - Nenhum deles é carregado pelo `next start`. No Render eles são instalados pelo `npm ci` do build, mas não são executados: o `next build` não roda ESLint nem shadcn.
- **Correção ou próximo passo:** Nenhuma para o deploy. Atualizar `shadcn` e `typescript-eslint` quando saírem versões corrigidas, numa rodada de manutenção.

### SEG-E9B-04 · informativo · ok

- **Evidência:**
  - **Auth.** README, `checklist-e9.md` (passo 3) e `01-plano.md` §10 pedem o Site URL na raiz `https://<serviço>.onrender.com`, sem `/auth/confirm`, com o motivo. A Redirect URL é **só** `https://<serviço>.onrender.com/auth/confirm`. Os três proíbem curinga (citam `https://*.onrender.com/**`, com o motivo) e `localhost`.
  - **Segredos.** Os três mandam não cadastrar `SUPABASE_SECRET_KEY`, `service_role` nem string de conexão no Render. Os únicos segredos citados são os do GitHub Actions do workflow (token, ref e senha do banco), que não vão para o app.
  - **Exemplos.** Usam marcadores (`<URL-DO-PROJETO>`, `<CHAVE-PUBLICAVEL>`, `<URL-DO-HOOK>`), e a URL do hook é tratada como segredo. Os modelos de e-mail continuam com `{{ .SiteURL }}`.
  - **Divergência de documento, não de segurança.** O `01-plano.md` §10 (linhas 400 e 438) ainda diz que o `render.yaml` define `NODE_VERSION=22` e lista `NODE_VERSION` como configuração do Render. O `render.yaml`, o README e o checklist mandam **não** defini-la. O efeito é nulo, porque o valor seria o mesmo.
- **Correção ou próximo passo:** Alinhar o §10 do plano quando o responsável autorizar a edição. A conferência da tela URL Configuration (o resto do SEG-E8B-05) fica no SEG-E9B-08.

### SEG-E9B-05 · médio · aceito pelo responsável (25/11/2026)

- **Evidência:**
  - **Decisão.** O repositório `athrios/financeiro-ultra` é **público** por escolha do responsável ("Deixar público", 25/11/2026; R-26 do plano).
  - **Varredura.** Cobri a árvore atual, com as mudanças não commitadas, e todas as revisões do histórico (`git rev-list --all`, 4 commits). Padrões buscados:
    - chaves e tokens: `sb_secret_…`, JWT `eyJ….eyJ…`, `SUPABASE_SECRET_KEY=` com valor, `sbp_…`, `gh[pousr]_…`;
    - ref de projeto: `[a-z]{20}\.supabase\.co`;
    - deploy hooks: `api.render.com/deploy/srv-`, `hooks.vercel.com`;
    - credenciais: `postgres://usuário:senha@` e atribuições de senha, token ou segredo;
    - e-mails.
  - **Resultado: nenhum segredo real.** Só aparecem:
    - valores fictícios dos testes (`bundle-secrets.test.ts`, `env.test.ts`, `logger.test.ts`): `sb_secret_` de exemplo, JWT de exemplo e `postgres:postgres@127.0.0.1` do Supabase local;
    - as variáveis `env(...)` do `config.toml`;
    - os marcadores `<slug>`/`<serviço>`;
    - os e-mails `@email.com`/`@exemplo.com`.
  - **Arquivos ignorados.** `.env*` (exceto `.env.example`, sem valores), `/.acessos/` e `supabase/.temp` nunca foram versionados.
  - **O que fica exposto:**
    1. todo o código, as migrations (políticas RLS, funções, grants, triggers), os testes e os seeds fictícios;
    2. os workflows e o usuário do GitHub `athrios`, que é a trava do workflow de migrations;
    3. o e-mail pessoal do responsável como autor dos commits (metadado do git, em todos os commits);
    4. o Brain, o plano, os riscos e esta revisão de segurança, com as fraquezas aceitas: SEG-E8B-02; SEG-E45-05 e SEG-E9B-06 (sem limite próprio de tentativas); SEG-E45-12 (token válido até 1 h depois do logout);
    5. as memórias dos agentes em `.claude/agent-memory/`;
    6. a senha antiga, só do ambiente local, em `docs/legado` (SEG-E45-09, encerrado);
    7. o nome do serviço (`financeiro-ultra`) e as regiões (Virginia no Render, São Paulo no banco). Com o nome, a URL `https://financeiro-ultra.onrender.com` é provável, se o nome estava livre.
  - **Contexto.**
    - A URL e a chave publicável do Supabase já ficam visíveis, por desenho, para quem abre o site (cabeçalho CSP `connect-src` e bundle JS). Não pôr o ref no repositório é higiene, não proteção.
    - Os logs do GitHub Actions passam a ser públicos (com os segredos mascarados).
    - A proteção real continua sendo o login só por convite, o auto-cadastro desligado, os papéis no banco e a RLS (RAT-D020).
- **Correção ou próximo passo:** Risco **aceito pelo responsável em 25/11/2026**. Manter a regra: nada de segredo, ref, URL real ou e-mail real em arquivo versionado. Sugestões opcionais, sem custo e sem bloqueio:
  - ligar **Secret scanning** e **Push protection** do GitHub (gratuitos em repositório público);
  - usar o e-mail `noreply` do GitHub nos próximos commits (o histórico já publicado não muda);
  - manter no padrão a aprovação de workflows de colaboradores externos e de primeira contribuição.

  Se um segredo vazar, a correção é **trocar o segredo**, não reescrever o histórico.

### SEG-E9B-06 · médio · fora_do_escopo_RAT-D020

- **Evidência:**
  - O login, a recuperação e a confirmação chamam o Supabase Auth a partir do servidor (Server Actions). Por isso os limites do Auth por IP (tentativas de login e envio de e-mail) valem para o **IP de saída do Render**, o mesmo para todos os usuários.
  - Como já era na Vercel (SEG-E45-05), um atacante que esgote o limite deixa todos sem login ou sem recuperação por alguns minutos. É indisponibilidade, sem vazamento, e não há limite por atacante.
  - Com o repositório público, isso fica documentado para qualquer um. Sem dados reais, o impacto é baixo.
- **Correção ou próximo passo:** Nenhuma nesta fase: a RAT-D020 tira do escopo o limite próprio e o CAPTCHA. Rever se houver abuso real ou quando entrarem dados reais. SMTP próprio (P-25) reduz o gargalo de e-mails.

### SEG-E9B-07 · baixo sem dados reais; alto com dados reais · aberto, preso à P-05c2

- **Evidência:** O `render.yaml` usa `plan: free`. O Render não recomenda esse plano para produção: 512 MB, dorme após cerca de 15 minutos sem uso, sem garantia de serviço (R-24, R-25). Somado ao Supabase Free sem backup automático (R-18), não serve para dados reais. Não afeta a confidencialidade.
- **Correção ou próximo passo:** Plano pago (hospedagem e Supabase) e backup antes de qualquer dado real (P-05c2). Até lá, só dados fictícios. Este item **bloqueia a entrada de dados reais**, não o deploy de teste.

### SEG-E9B-08 · informativo · pendente de evidência

- **Evidência:** Não foi possível ver daqui a configuração dos painéis. Pelo checklist, faltam estas evidências (sem segredos):
  1. o Web Service criado à mão no Render **apagado** antes do Blueprint. Um serviço manual tem deploy automático por padrão e configuração própria;
  2. a lista dos **nomes** das variáveis do serviço, sem `SUPABASE_SECRET_KEY`, `service_role`, string de conexão nem `NODE_VERSION`;
  3. deploy automático desligado, um push na `main` que não publicou nada e Pull Request Previews desligados;
  4. a tela URL Configuration do Supabase com o Site URL na raiz e uma única Redirect URL `/auth/confirm`, sem curinga e sem `localhost`. Isso fecha o SEG-E8B-05;
  5. auto-cadastro desligado (resposta `signup_disabled` do passo 9), senha mínima 10 e `secure_password_change`;
  6. a resposta de `/login` em produção com `Strict-Transport-Security` e, depois do login, cookies de sessão com `Secure; HttpOnly; SameSite=Lax`;
  7. quando o Actions voltar, o job pulado para outro usuário.

  Dois cuidados:
  - não ligar o cache de borda (edge caching) do Render para o serviço sem nova revisão;
  - se o login acusar origem inválida de Server Action atrás do balanceador, não contornar com um `serverActions.allowedOrigins` largo.
- **Correção ou próximo passo:** O responsável junta essas evidências fora do repositório e as entrega para uma conferência curta depois do primeiro deploy.

**Não verificado nesta conferência:**

- Painéis do Render, do Supabase hospedado e do GitHub, e deploy real: estão no SEG-E9B-08.
- Comportamento do balanceador do Render com `X-Forwarded-Host`/`Host` e a checagem de origem das Server Actions atrás dele: ficam para o smoke do passo 8, que exercita o login.
- e2e, pgTAP e um build novo com `RENDER=true`. O dev relatou que o build falha logo no início; eu provei a falha na subida.
- Transferência internacional de dados pessoais pelo servidor em Virginia (LGPD). Não é achado técnico: fica para o responsável avaliar antes dos dados reais, junto da P-05c2, como **DECISÃO PENDENTE** se for o caso.

**Pendências após a E9b:**

- SEG-E9B-08: evidências dos painéis, com o resto do SEG-E8B-05.
- SEG-E9B-07: bloqueia dados reais até a P-05c2.
- SEG-E9B-04: alinhar o `NODE_VERSION` no plano.
- SEG-E9B-05 e SEG-E9B-06: aceitos, sem ação.
