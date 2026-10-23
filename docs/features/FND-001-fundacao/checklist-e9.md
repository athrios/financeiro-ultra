# FND-001 · E9 · Checklist do responsável

Para você, nos painéis. Segue a postura de uso interno (RAT-D020): só o básico, em ordem. Cada passo diz **o que guardar como evidência** para a revisão E9b (`seguranca`). Evidência = captura de tela ou texto copiado **sem senha, token ou chave**.

Antes de começar, tenha à mão: o repositório `athrios/financeiro-ultra` (privado), o código na `main` com a CI verde, e a decisão sobre o **provedor de SMTP e o domínio (P-25)**.

## Decisões que ainda afetam a E9

| ID | O que decidir | Efeito na E9 |
|---|---|---|
| **P-25** | Provedor de SMTP e domínio | **Bloqueia** os passos 3 e 6: sem SMTP próprio o convite e a recuperação ficam limitados a poucos e-mails por hora. Para um teste rápido de Preview pode-se usar o envio padrão do Supabase, sabendo que é limitado |
| **P-24** | Gestão de usuários pelo painel do Supabase ou pela aplicação | Na FND: **painel**. Por isso nenhuma chave secreta vai para a Vercel (passo 4) |
| **P-05c2** | Banco de homologação separado e planos pagos | Antes de **dados reais**. Enquanto o banco for único, só dados fictícios; Preview e Production usam o mesmo projeto Supabase. Vercel Hobby é para uso não comercial e Supabase Free não tem backup automático |

## 1. Projeto Supabase

1. Criar o projeto no Supabase, região **São Paulo (`sa-east-1`)**. Não muda depois.
2. **Não** conectar a integração GitHub do Supabase e **não** ativar o Branching (aplicariam migrations sozinhos).
3. Anotar a **URL do projeto**, a **chave publicável** (Project Settings > API Keys), o **ref** do projeto e a **senha do banco** (guarde num gerenciador de senhas).

Evidência: captura da tela de configurações mostrando a região São Paulo e a integração GitHub/Branching desligados.

## 2. Segredos do GitHub

Em Settings > Secrets and variables > Actions do repositório, criar (os nomes são exatamente estes):

| Segredo | Valor |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Token de acesso pessoal do Supabase (menor escopo possível) |
| `SUPABASE_PROJECT_REF` | O ref do projeto |
| `SUPABASE_DB_PASSWORD` | A senha do banco |
| `VERCEL_DEPLOY_HOOK_URL` | Criado no passo 5 |

Só você tem permissão de escrita no repositório. Nada disso entra em arquivo versionado.

Evidência: lista de nomes dos segredos (os valores não aparecem na tela).

## 3. Supabase Auth (pelo painel, Authentication)

**Não rode `supabase config push`**: o `config.toml` do repositório é do ambiente local (`127.0.0.1:3001`) e sobrescreveria a configuração hospedada.

1. **Sign In / Providers:** o provedor E-mail ligado e **"Allow new users to sign up" desligado** (auto-cadastro desligado).
2. **Senha:** tamanho mínimo 10; **exigir a senha atual/reautenticação para trocar a senha** (`secure_password_change`).
3. **URL Configuration:**
   - Site URL = o domínio de Production (ou, antes de ter domínio, a URL `.vercel.app` de Production);
   - Redirect URLs = só o endereço de Production + `/auth/confirm` (`<site-de-production>/auth/confirm`) e, se precisar testar o Preview, a URL fixa de branch dele (`<projeto>-git-<branch>-<slug>.vercel.app/auth/confirm`). Motivo: um curinga como `https://*-<slug>.vercel.app/auth/confirm` casaria com projetos de outras contas da Vercel cujo nome termine igual;
   - **sem `localhost`** e **sem curinga** (nunca `https://*.vercel.app/**` nem `https://*-<slug>.vercel.app/...`).
4. **Email Templates:** colar o assunto e o HTML de **Invite user** (`supabase/templates/invite.html`, assunto "Você foi convidado para o Financeiro Ultra") e de **Reset password** (`supabase/templates/recovery.html`, assunto "Redefinir sua senha do Financeiro Ultra"). Os links usam `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=...`.
5. **SMTP próprio** (P-25): Authentication > SMTP Settings, com o provedor e o remetente escolhidos.

Evidência: capturas das telas de Sign In (cadastro desligado), URL Configuration e Email Templates; depois do passo 9, o resultado do teste de cadastro recusado.

## 4. Vercel (importar o repositório)

Só depois dos passos 1 a 3. Importar `athrios/financeiro-ultra` na Vercel.

1. Framework: Next.js (detectado). O `vercel.json` do repositório já fixa a região das funções em **`gru1` (São Paulo)** e **desliga o deploy automático da branch `main`**, para que a Production só publique pelo workflow depois da migration. Previews (outras branches e PRs) continuam automáticos.
2. Variáveis de ambiente, para **Production e Preview**:

   | Variável | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | chave publicável |
   | `APP_ENV` | `production` na Production; `staging` no Preview |
   | `LOG_LEVEL` | `info` |

   **Não cadastre `SUPABASE_SECRET_KEY`, `SERVICE_ROLE` nem string de conexão do banco.** Se usar a integração Supabase ↔ Vercel, abra a lista de variáveis depois e remova qualquer chave secreta ou string de conexão que ela criar.
3. Confirmar em Settings > Functions que a região é **São Paulo (`gru1`)**. Se o seu plano não aceitar essa região, registre e siga (a região é só desempenho, não segurança).

Evidência: lista de **nomes** das variáveis por ambiente (sem valores) e a região das funções.

## 5. Deploy hook de Production

Em Settings > Git > Deploy Hooks: criar um hook para a branch `main` (nome sugerido: `producao-pelo-workflow`). Copiar a URL para o segredo `VERCEL_DEPLOY_HOOK_URL` (passo 2). A URL é segredo: quem a tem publica Production.

**A confirmar no primeiro deploy** (não há como testar daqui):

- um push na `main` **não** cria deployment (efeito do `git.deploymentEnabled` do `vercel.json`);
- o deploy hook **cria** um deployment de **Production** mesmo com esse ajuste;
- um PR continua gerando Preview.

Se o hook não publicar com o ajuste ligado, avise: a alternativa é usar "Ignored Build Step" no painel da Vercel e ajustar o `vercel.json` (decisão do `engenheiro-software`).

Evidência: captura do histórico de deployments mostrando que o push na `main` não publicou e que o hook publicou.

## 6. Rodar o workflow de migrations

1. Repositório > Actions > **Migrations e publicação em Production** > Run workflow na branch `main`.
2. Primeira vez: marque **"Só simular"**. Confere o resultado de `db push --dry-run`: deve listar as 5 migrations da linha de base.
3. Rode de novo **sem** marcar. Ele aplica as migrations e, só depois, pede o deploy de Production.
4. O job só roda para o usuário `athrios`; outro usuário vê o job pulado.

Evidência: link da execução verde (simulação e real).

## 7. Convite e primeiro Administrador

1. Painel Supabase > Authentication > Users > **Invite user**, com o seu e-mail. (Precisa do SMTP do passo 3.)
2. SQL Editor: abrir `scripts/sql/bootstrap-first-admin.sql`, **copiar** o conteúdo, trocar os dois marcadores (`<EMAIL-DO-ADMINISTRADOR>` e `<IDENTIFICACAO-DE-QUEM-EXECUTA>`) e executar. Resultado esperado: `PROMOTED`. **Não salve a versão preenchida no repositório.**
3. Rodar `scripts/sql/bootstrap-first-admin-verify.sql` no mesmo editor: deve mostrar 1 administrador ativo e os registros de auditoria com origem `SCRIPT`.
4. Aceitar o convite pelo e-mail, definir a senha e entrar.

Evidência: o resultado `PROMOTED` e o resultado do script de conferência (sem o e-mail).

## 8. Smoke no Preview e na Production

Com dados **fictícios** apenas. Em cada um (Preview de um PR/branch e Production):

1. Abrir a URL sem sessão: vai para `/login`.
2. Entrar com o Administrador: abre o Dashboard e o menu.
3. Sair: volta ao `/login`; abrir `/` de novo pede login.
4. "Esqueci a senha": o e-mail chega, o link abre `/auth/confirm`, o botão leva a definir a senha, a senha nova entra.
5. Convite de um segundo usuário de teste pelo painel: o link leva a definir senha; o usuário entra e vê "Sem acesso ativo" (ainda sem papel).

Evidência: uma linha por item (feito/não feito) e as URLs usadas.

## 9. Cadastro público recusado (CA-15)

Com a chave publicável do projeto hospedado, tentar criar uma conta pela API de Auth (exemplo no terminal; troque os dois marcadores):

```bash
curl -s -X POST "<URL-DO-PROJETO>/auth/v1/signup" \
  -H "apikey: <CHAVE-PUBLICAVEL>" -H "content-type: application/json" \
  -d '{"email":"teste-cadastro@example.com","password":"Senha-Qualquer-2026"}'
```

Esperado: erro `signup_disabled` (HTTP 422), sem e-mail enviado.

Evidência: a resposta (sem a chave).

## Fechamento

Reúna as evidências dos passos 1 a 9 e entregue ao `seguranca` (E9b). Dados reais só entram depois da E9b e da decisão P-05c2.
