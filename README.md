# Financeiro Ultra

Sistema de gerenciamento de mensalidades com **rateio gerencial pós-recebimento**: registra os recebimentos dos clientes, divide o valor economicamente entre os sócios indicados no cliente (sempre 1/n) e apura, por competência, quem recebeu a mais e quem deve receber. O split é **gerencial**: o sistema não movimenta dinheiro.

> Estado: fundação em construção (FND-001). O banco foi refeito numa nova linha de base (E4) e a aplicação ganhou a infraestrutura e o shell "Financeiro Ultra" (E5): login, convite, definição e recuperação de senha, navegação por módulos com páginas "Em breve" e estados de acesso. Os módulos de negócio ainda não existem. O que foi construído a partir da especificação de 07/10 está arquivado em `docs/legado/07-10/` (referência histórica, nunca aplicada). Veja `docs/features/FND-001-fundacao/`.

## Requisitos

- **Node.js 22** (com npm).
- **Docker** em execução (o Supabase local roda em contêineres).
- Não é preciso instalar o Supabase CLI globalmente: ele vem nas dependências de desenvolvimento e é chamado por `npx`/scripts npm.

## Instalação

```bash
npm install
npm run db:start      # sobe o Supabase local (Postgres, Auth, Storage, etc.)
npm run db:reset      # aplica as migrations e o seed estrutural (supabase/seed.sql: sócios fictícios)
```

### Variáveis de ambiente (`.env.local`)

Crie o arquivo `.env.local` na raiz a partir do modelo `.env.example` e preencha com os valores do Supabase **local**, obtidos com:

```bash
npx supabase status -o env
```

| Variável no `.env.local` | Valor em `supabase status -o env` |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `API_URL` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `PUBLISHABLE_KEY` |
| `SUPABASE_SECRET_KEY` | `SECRET_KEY` (somente scripts de desenvolvimento; nunca no navegador) |

Variáveis opcionais do servidor (validadas com zod em `src/lib/env.ts`; valor inválido falha com mensagem que lista a variável, sem repetir o valor):

| Variável | Valores | Padrão | Uso |
|---|---|---|---|
| `APP_ENV` | `local`, `staging`, `production` | `local` | Identifica o ambiente (aviso de ambiente de testes, logs). Fora de `local`, a presença de `SUPABASE_SECRET_KEY` é erro. |
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error` | `info` | Nível mínimo do logger JSON (segredos, tokens, CPF e dados bancários são mascarados). |

A chave secreta (`SUPABASE_SECRET_KEY`) **nunca** é lida pela aplicação web; só pelos scripts de desenvolvimento. A chave `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` não pode ser uma chave secreta (`sb_secret_...` ou JWT `service_role`).

Arquivos `.env*` são ignorados pelo git (exceto `.env.example`). Nunca versione segredos.

### Porta e autenticação

A aplicação roda na **porta 3001** (`npm run dev` e `npm run start` usam `-p 3001`). O Supabase local está alinhado a ela em `supabase/config.toml`: `site_url = "http://127.0.0.1:3001"` e `additional_redirect_urls` com `/auth/confirm` em `127.0.0.1` e `localhost` na porta 3001. Se mudar a porta, ajuste os dois e rode `npx supabase stop && npx supabase start` (o Auth só relê o `config.toml` ao reiniciar). Em hospedagem futura (Vercel, RAT-D016), `site_url` e as URLs de redirecionamento passam a ser as do domínio publicado.

Fluxos de autenticação (acesso somente por convite, sem cadastro público):

1. **Convite:** o Administrador (ou o procedimento de bootstrap) cria o convite; o e-mail traz o link `/auth/confirm?token_hash=...&type=invite`. A página `/auth/confirm` só troca o token por sessão quando a pessoa **clica** no botão (verificadores de e-mail que abrem o link não gastam o token), e leva a `/definir-senha`.
2. **Recuperação:** `/recuperar-senha` pede o e-mail (resposta sempre igual, exista a conta ou não); o link vem como `type=recovery` e segue o mesmo caminho até `/definir-senha`.
3. **Login:** `/login` com e-mail e senha. O parâmetro `?next=` aceita só caminhos internos (nada de `//host`, `https://`, barra invertida). Sessão vencida volta ao login com aviso.
4. Em desenvolvimento local, os e-mails não saem de verdade: abra o **Mailpit** em http://127.0.0.1:54324 para ler convites e links de recuperação.

Os modelos de e-mail em português ficam em `supabase/templates/` (`invite.html`, `recovery.html`) e são ligados em `supabase/config.toml`.

### Dados de desenvolvimento

```bash
npm run seed:dev      # cria usuários fictícios e atribui os papéis (com motivo e auditoria)
```

O `seed:dev` funciona em duas fases: (1) cria os usuários fictícios (`@example.com`) pela API admin do Auth **local**, e o banco cria os perfis **sem papel**; (2) atribui os papéis executando `scripts/sql/seed-dev-access.sql` com `supabase db query --local`, que chama o procedimento auditado `private.set_user_access` como `postgres`. Os papéis criados são Administrador, Operador, Visualizador, Sócio (acesso a dados negado por padrão até a decisão P-02b) e um usuário sem papel. Todos os dados de seed, testes e exemplos usam apenas nomes fictícios, e não há percentuais armazenados (a divisão é sempre 1/n).

O `seed:dev` só roda contra o Supabase local: o `hostname` de `NEXT_PUBLIC_SUPABASE_URL` precisa ser exatamente `127.0.0.1` ou `localhost` (qualquer outro valor é recusado), e a CLI é chamada sempre com `--local`. A senha dos usuários **não** está no código nem na documentação: defina `DEV_SEED_PASSWORD` em `.env.local` ou deixe o script gerar uma senha aleatória, que ele imprime no final da execução. Nunca reutilize essa senha em ambiente hospedado.

## Scripts npm

| Script | O que faz |
|---|---|
| `npm run db:start` | Sobe o Supabase local (Docker). |
| `npm run db:stop` | Para o Supabase local. |
| `npm run db:reset` | Recria o banco local do zero: migrations + `supabase/seed.sql`. |
| `npm run seed:dev` | Cria usuários fictícios e atribui papéis, só no Supabase local (exige `.env.local`). |
| `npm run db:test` | Testes de banco (pgTAP, `supabase/tests/database/`, 6 arquivos / 220 testes) sobre o Supabase local. Cada arquivo roda numa transação desfeita no fim e não depende dos dados do `seed:dev` (passa logo após `db:reset` e depois do `seed:dev`). |
| `npm run db:types` | Regenera `src/types/database.types.ts` a partir do banco local. |
| `npm run dev` | Servidor de desenvolvimento do Next.js na porta 3001. |
| `npm run start` | Servidor de produção (depois de `npm run build`) na porta 3001. |
| `npm test` | Testes unitários (Vitest). |
| `npm run lint` | ESLint. |
| `npm run typecheck` | Gera os tipos de rota do Next e roda `tsc --noEmit`. |
| `npm run build` | Build de produção. |

**Porta 3001:** fixa nos scripts, porque o `config.toml` do Supabase aponta para ela. Se estiver ocupada, o Next.js falha em vez de trocar de porta (com `-p`), e o link dos e-mails deixaria de funcionar.

## Estrutura

- `src/domain/shared/`: regras de domínio puras (dinheiro em centavos, percentuais de exibição, maior resto, divisão igual 1/n).
- `src/app/`: rotas em três grupos: `(app)` (sistema autenticado, com shell e páginas "Em breve"), `(public)` (login e recuperar senha) e `(auth-flow)` (`/auth/confirm` e `/definir-senha`). `src/proxy.ts` é a checagem otimista de sessão.
- `src/components/shell/` (shell, navegação e estados de acesso), `src/components/auth/`, `src/components/ui/`.
- `src/server/` (sessão, autorização para UX, contexto de requisição) e `src/lib/` (env, erros, logger, redirecionamento seguro, cabeçalhos de segurança, navegação, papéis).
- `supabase/`: migrations (linha de base de 23/10/2026), seed e testes de banco (pgTAP).
- `scripts/`: utilitários de desenvolvimento (`seed-dev.ts` e `sql/seed-dev-access.sql`).
- `docs/legado/07-10/`: referência histórica arquivada (fora do tsc, do ESLint e do Vitest; nunca aplicada).

## Documentação

- **Brain do projeto** (fonte de verdade funcional): [`brain-mensalidades-rateio/00-MOC.md`](brain-mensalidades-rateio/00-MOC.md). Decisões oficiais em [`11-Decisoes.md`](brain-mensalidades-rateio/11-Decisoes.md).
- **Feature FND-001 (Fundação)**: [`docs/features/FND-001-fundacao/`](docs/features/FND-001-fundacao/) (plano em `01-plano.md`, registro de implementação em `04-implementacao.md`).
- Orquestração dos agentes: [`CLAUDE.md`](CLAUDE.md) e `.claude/`.
- **Next.js 16** tem APIs diferentes do usual: leia [`AGENTS.md`](AGENTS.md) e consulte `node_modules/next/dist/docs/` antes de escrever código Next.

## Segurança

- A pasta `.acessos/` guarda credenciais pessoais, fica no projeto e é ignorada pelo git. Não a abra em ferramentas compartilhadas e não a copie para o repositório.
- A chave secreta do Supabase é usada apenas por scripts de desenvolvimento.
- Cabeçalhos de segurança (CSP, HSTS, `frame-ancestors`, `nosniff`, Referrer-Policy) são definidos em `next.config.ts` a partir de `src/lib/security-headers.ts`.
- A autorização na interface é só experiência de uso; a segurança real está no banco (RLS e procedimentos auditados).
