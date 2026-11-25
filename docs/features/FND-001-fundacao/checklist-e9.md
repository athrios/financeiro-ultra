# FND-001 · E9 · Checklist do responsável

Para você, nos painéis. Segue a postura de uso interno (RAT-D020): só o básico, em ordem. Cada passo diz **o que guardar como evidência** para a revisão E9b (`seguranca`). Evidência = captura de tela ou texto copiado **sem senha, token ou chave**.

Antes de começar, tenha à mão: o repositório `athrios/financeiro-ultra` (**público**: nunca cole segredo, ref do projeto, URL real do serviço ou e-mail real em arquivo do repositório), o código na `main` e a decisão sobre o **provedor de SMTP e o domínio (P-25)**. Hospedagem: **Render** (RAT-D022). Nos exemplos, `<serviço>` é o nome do seu serviço no Render.

## Decisões que ainda afetam a E9

| ID | O que decidir | Efeito na E9 |
|---|---|---|
| **P-25** | Provedor de SMTP e domínio | **Bloqueia** os passos 3 e 6: sem SMTP próprio o convite e a recuperação ficam limitados a poucos e-mails por hora. Para um teste rápido pode-se usar o envio padrão do Supabase, sabendo que é limitado |
| **P-24** | Gestão de usuários pelo painel do Supabase ou pela aplicação | Na FND: **painel**. Por isso nenhuma chave secreta vai para o Render (passo 4) |
| **P-05c2** | Banco de homologação separado e planos pagos | Antes de **dados reais**. Enquanto o banco for único, só dados fictícios. O plano gratuito do Render dorme depois de cerca de 15 minutos sem uso (o primeiro acesso demora cerca de 1 minuto) e o próprio Render não o recomenda para produção; o Supabase Free não tem backup automático |

## Ordem com a opção B (sem GitHub Actions)

Decisão de 24/10/2026 (plano, revisão 11): o GitHub Actions está bloqueado pela cobrança da conta. Por isso a CI e o workflow de migrations não rodam por enquanto, e você mesmo aplica as migrations pelo CLI, a partir da pasta do projeto. Na revisão 12 (25/11/2026) a hospedagem passou da Vercel para o **Render**. Siga esta ordem; os passos citados estão detalhados mais abaixo.

1. **Passo 1:** criar o projeto Supabase.
2. **Logo em seguida, parte do passo 3:** desligar o auto-cadastro, senha mínima 10 e `secure_password_change`.
3. **Migrations pelo CLI** (substituem os passos 2 e 6 por enquanto). **Você já aplicou a linha de base**; os comandos ficam aqui para conferir ou repetir numa próxima migration. No terminal, na pasta do projeto:
   ```bash
   npx supabase login
   npx supabase link --project-ref <REF-DO-PROJETO>
   npx supabase db push --dry-run
   npx supabase db push
   ```
   - O `login` abre o navegador. O `link` pede a senha do banco: digite você, sem colar em arquivo.
   - O `--dry-run` deve listar só as migrations que ainda faltam (na linha de base, as 5, de `20261023000100_base.sql` a `20261023000500_privileges.sql`).
   - **Não use** `--include-seed` (o seed é só do ambiente local) nem `supabase config push`.
   - Conferência, só leitura: `npx supabase migration list --linked` (as 5 aparecem como aplicadas no remoto) e `npx supabase db advisors --linked --type security --level warn` (sem achados).
4. **Passo 4:** apagar o Web Service criado à mão no Render e criar o serviço pelo **Blueprint**, informando as duas variáveis públicas do Supabase.
5. **Resto do passo 3:** Site URL (na raiz, sem caminho) e Redirect URLs com o endereço do Render, modelos de e-mail e SMTP (P-25).
6. **Passo 5:** publicar pelo **Manual Deploy** do Render (ou pelo deploy hook, se preferir o terminal: `curl.exe -X POST "<URL-DO-HOOK>"`; no PowerShell, use `curl.exe`; no Git Bash, `curl`). A URL do hook é segredo: não a cole em arquivo.
7. **Passos 7, 8 e 9:** convite e primeiro Administrador, smoke em Production e cadastro recusado.
8. **Passos 2 e 6:** ficam para quando a cobrança do GitHub for resolvida, para as próximas migrations.

Evidência extra para a E9b: a saída do `migration list --linked` e do `db advisors --linked`.

## 1. Projeto Supabase

1. Criar o projeto no Supabase, região **São Paulo (`sa-east-1`)**. Não muda depois.
2. **Não** conectar a integração GitHub do Supabase e **não** ativar o Branching (aplicariam migrations sozinhos).
3. Anotar a **URL do projeto**, a **chave publicável** (Project Settings > API Keys), o **ref** do projeto e a **senha do banco** (guarde num gerenciador de senhas).

Evidência: captura da tela de configurações mostrando a região São Paulo e a integração GitHub/Branching desligados.

## 2. Segredos do GitHub

**Só é preciso quando o GitHub Actions voltar a funcionar**; por enquanto, pule este passo. Em Settings > Secrets and variables > Actions do repositório, criar (os nomes são exatamente estes):

| Segredo | Valor |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Token de acesso pessoal do Supabase (menor escopo possível) |
| `SUPABASE_PROJECT_REF` | O ref do projeto |
| `SUPABASE_DB_PASSWORD` | A senha do banco |
| `RENDER_DEPLOY_HOOK_URL` | URL do deploy hook do Render, criada no passo 5 |

Só você tem permissão de escrita no repositório. Nada disso entra em arquivo versionado (o repositório é público).

Evidência: lista de nomes dos segredos (os valores não aparecem na tela).

## 3. Supabase Auth (pelo painel, Authentication)

**Não rode `supabase config push`**: o `config.toml` do repositório é do ambiente local (`127.0.0.1:3001`) e sobrescreveria a configuração hospedada.

1. **Sign In / Providers:** o provedor E-mail ligado e **"Allow new users to sign up" desligado** (auto-cadastro desligado).
2. **Senha:** tamanho mínimo 10; **exigir a senha atual/reautenticação para trocar a senha** (`secure_password_change`).
3. **URL Configuration:**
   - **Site URL = a raiz do serviço, sem caminho nenhum:** `https://<serviço>.onrender.com`. Não acrescente `/auth/confirm`: os modelos de e-mail já acrescentam, e com o caminho no Site URL o link ficaria duplicado (`/auth/confirm/auth/confirm`) e quebraria. Quando houver domínio próprio (P-25), troque pelo domínio;
   - **Redirect URLs = só** `https://<serviço>.onrender.com/auth/confirm`;
   - **sem `localhost`** e **sem curinga** (nunca `https://*.onrender.com/**`: qualquer site hospedado no Render poderia receber os tokens de convite e de recuperação).
4. **Email Templates:** colar o assunto e o HTML de **Invite user** (`supabase/templates/invite.html`, assunto "Você foi convidado para o Financeiro Ultra") e de **Reset password** (`supabase/templates/recovery.html`, assunto "Redefinir sua senha do Financeiro Ultra"). Os links usam `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=...`.
5. **SMTP próprio** (P-25): Authentication > SMTP Settings, com o provedor e o remetente escolhidos.

Evidência: capturas das telas de Sign In (cadastro desligado), URL Configuration e Email Templates; depois do passo 9, o resultado do teste de cadastro recusado.

## 4. Render (criar pelo Blueprint)

Só depois dos passos 1 a 3 (você precisa da URL do projeto Supabase e da chave publicável).

1. **Antes de tudo**, no painel do Render, apague o Web Service criado à mão (o build dele falhou por falta das variáveis). Assim não sobra serviço duplicado.
2. Painel do Render > **New > Blueprint** > escolha o repositório `athrios/financeiro-ultra` (o app do Render já está instalado na conta `athrios`). O arquivo `render.yaml` da raiz define o resto:

   | O que | Valor fixado no `render.yaml` |
   |---|---|
   | Região | `virginia` (o Render não tem região na América do Sul; **não muda depois**) |
   | Plano | free |
   | Branch | `main` |
   | Build | `npm ci && npm run build` |
   | Start | `npm run start:render` (usa a porta `PORT` do Render) |
   | Health check | `/login` |
   | Variáveis | `APP_ENV=production`, `LOG_LEVEL=info` |
   | Deploy automático | **desligado**: a publicação é manual |

   O Node 22 vem do arquivo `.node-version`. **Não cadastre `NODE_VERSION` no painel.**
3. O painel pede só duas variáveis. Preencha:

   | Variável | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `<URL-DO-PROJETO>` (URL do projeto Supabase) |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `<CHAVE-PUBLICAVEL>` (chave publicável) |

   **Não cadastre `SUPABASE_SECRET_KEY`, `service_role` nem string de conexão do banco.** O app recusa subir se achar a chave secreta fora do ambiente local.
4. Se faltar variável, o build falha logo no início, listando o que falta (mensagem "Configuração de ambiente inválida"). Corrija no painel e faça novo deploy.
5. **`NEXT_PUBLIC_*` e `APP_ENV` são fixados no build:** mudar qualquer uma no painel exige um **novo deploy** (Manual Deploy). Só reiniciar o serviço não basta.
6. O `vercel.json` do repositório é só referência e não tem efeito no Render.

Evidência: lista de **nomes** das variáveis do serviço (sem valores) e a região do serviço (Virginia).

## 5. Publicar (deploy manual ou deploy hook)

O deploy automático está desligado de propósito: a Production só muda quando você manda, depois de a migration estar aplicada.

- **Pelo painel:** serviço no Render > **Manual Deploy > Deploy latest commit**.
- **Pelo deploy hook** (opcional; é o que o workflow de migrations usará quando o GitHub Actions voltar): Settings do serviço > Deploy Hook, copiar a URL para o segredo `RENDER_DEPLOY_HOOK_URL` (passo 2) e, se quiser testar pelo terminal, `curl.exe -X POST "<URL-DO-HOOK>"`. A URL é segredo: quem a tem publica Production. Não a cole em arquivo.

**A confirmar no primeiro deploy** (não há como testar daqui):

- o build termina **verde** (sem "Configuração de ambiente inválida");
- `https://<serviço>.onrender.com/login` abre;
- a região do serviço é **Virginia**;
- um push na `main` **não** publica sozinho (deploy automático desligado).

Lembretes do plano gratuito: depois de cerca de 15 minutos sem uso o serviço dorme, e o primeiro acesso seguinte demora cerca de 1 minuto. O Render não recomenda o plano gratuito para produção; a troca por plano pago segue pendente (P-05c2).

Reversão: a E9 não tem migration. No painel do Render, **Rollback** para o deploy anterior; ou reverta o commit na `main` e faça novo Manual Deploy.

Evidência: captura do histórico de deploys do Render (build verde, deploy manual), a página `/login` aberta e a região do serviço.

## 6. Rodar o workflow de migrations

**Só quando o GitHub Actions voltar a funcionar** (por enquanto, veja a opção B no início).

1. Repositório > Actions > **Migrations e publicação em Production** > Run workflow na branch `main`.
2. Primeira vez: marque **"Só simular"**. Confere o resultado de `db push --dry-run`: deve listar as migrations que ainda faltam.
3. Rode de novo **sem** marcar. Ele aplica as migrations e, só depois, chama o deploy hook do Render (`RENDER_DEPLOY_HOOK_URL`), que publica a Production.
4. O job só roda para o usuário `athrios`; outro usuário vê o job pulado.

Evidência: link da execução verde (simulação e real).

## 7. Convite e primeiro Administrador

1. Painel Supabase > Authentication > Users > **Invite user**, com o seu e-mail. (Precisa do SMTP do passo 3.)
2. SQL Editor: abrir `scripts/sql/bootstrap-first-admin.sql`, **copiar** o conteúdo, trocar os dois marcadores (`<EMAIL-DO-ADMINISTRADOR>` e `<IDENTIFICACAO-DE-QUEM-EXECUTA>`) e executar. Resultado esperado: `PROMOTED`. **Não salve a versão preenchida no repositório.**
3. Rodar `scripts/sql/bootstrap-first-admin-verify.sql` no mesmo editor: deve mostrar 1 administrador ativo e os registros de auditoria com origem `SCRIPT`.
4. Aceitar o convite pelo e-mail, definir a senha e entrar.

Evidência: o resultado `PROMOTED` e o resultado do script de conferência (sem o e-mail).

## 8. Smoke em Production

Com dados **fictícios** apenas. Não há Preview: o teste é só na Production, em `https://<serviço>.onrender.com`. Se o serviço estiver dormindo, espere cerca de 1 minuto no primeiro acesso.

1. Abrir a URL sem sessão: vai para `/login`.
2. Entrar com o Administrador: abre o Dashboard e o menu.
3. Sair: volta ao `/login`; abrir `/` de novo pede login.
4. "Esqueci a senha": o e-mail chega, o link abre `/auth/confirm` (sem caminho duplicado), o botão leva a definir a senha, a senha nova entra.
5. Convite de um segundo usuário de teste pelo painel: o link leva a definir senha; o usuário entra e vê "Sem acesso ativo" (ainda sem papel).

Evidência: uma linha por item (feito/não feito) e a URL usada, escrita como `https://<serviço>.onrender.com` (sem o endereço real, se for guardar em arquivo do repositório).

## 9. Cadastro público recusado (CA-15)

Com a chave publicável do projeto hospedado (`<CHAVE-PUBLICAVEL>`), tentar criar uma conta pela API de Auth (exemplo para o Git Bash; no PowerShell, junte tudo numa linha só e use `curl.exe`; troque os dois marcadores):

```bash
curl -s -X POST "<URL-DO-PROJETO>/auth/v1/signup" \
  -H "apikey: <CHAVE-PUBLICAVEL>" -H "content-type: application/json" \
  -d '{"email":"teste-cadastro@example.com","password":"Senha-Qualquer-2026"}'
```

Esperado: erro `signup_disabled` (HTTP 422), sem e-mail enviado.

Evidência: a resposta (sem a chave).

## Fechamento

Reúna as evidências dos passos 1 a 9 (sem segredos, ref do projeto ou URL real; mande por fora do repositório, que é público) e entregue ao `seguranca` (E9b). Dados reais só entram depois da E9b e da decisão P-05c2.
