# Financeiro Ultra

Sistema de gerenciamento de mensalidades com **rateio gerencial pós-recebimento**: registra os recebimentos dos clientes, divide o valor economicamente entre os sócios indicados no cliente (sempre 1/n) e apura, por competência, quem recebeu a mais e quem deve receber. O split é **gerencial**: o sistema não movimenta dinheiro.

> Estado: fundação em construção (FND-001). A tela atual é um protótipo mantido como referência e será substituída por um shell novo. Veja `docs/features/FND-001-fundacao/`.

## Requisitos

- **Node.js 22** (com npm).
- **Docker** em execução (o Supabase local roda em contêineres).
- Não é preciso instalar o Supabase CLI globalmente: ele vem nas dependências de desenvolvimento e é chamado por `npx`/scripts npm.

## Instalação

```bash
npm install
npm run db:start      # sobe o Supabase local (Postgres, Auth, Storage, etc.)
npm run db:reset      # aplica as migrations e o seed estrutural (supabase/seed.sql)
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

Arquivos `.env*` são ignorados pelo git (exceto `.env.example`). Nunca versione segredos.

### Dados de desenvolvimento

```bash
npm run seed:dev      # cria usuários, competências e recebimentos fictícios
```

O `seed:dev` imprime no terminal os usuários e a senha **locais** de desenvolvimento. Todos os dados de seed, testes e exemplos usam apenas nomes fictícios.

O `seed:dev` só roda contra o Supabase local: o `hostname` de `NEXT_PUBLIC_SUPABASE_URL` precisa ser exatamente `127.0.0.1` ou `localhost`; qualquer outro valor é recusado. Para trocar a senha dos usuários de desenvolvimento, defina `DEV_SEED_PASSWORD` em `.env.local` (opcional; sem a variável, vale o padrão do script). Nunca reutilize essa senha em ambiente hospedado.

## Scripts npm

| Script | O que faz |
|---|---|
| `npm run db:start` | Sobe o Supabase local (Docker). |
| `npm run db:stop` | Para o Supabase local. |
| `npm run db:reset` | Recria o banco local do zero: migrations + `supabase/seed.sql`. |
| `npm run seed:dev` | Popula usuários, competências e recebimentos fictícios (exige `.env.local`). |
| `npm run db:test` | Testes de banco (pgTAP) sobre o Supabase local. |
| `npm run db:types` | Regenera `src/types/database.types.ts` a partir do banco local. |
| `npm run dev` | Servidor de desenvolvimento do Next.js. |
| `npm test` | Testes unitários (Vitest). |
| `npm run lint` | ESLint. |
| `npm run typecheck` | Gera os tipos de rota do Next e roda `tsc --noEmit`. |
| `npm run build` | Build de produção. |

**Porta 3000:** se estiver ocupada por outro processo, o Next.js usa a próxima porta livre (por exemplo, 3001). Confira a URL impressa no terminal.

## Estrutura

- `src/domain/`: regras de domínio puras (dinheiro em centavos, percentuais, rateio por maior resto, divisão igual 1/n).
- `src/app/`, `src/components/`, `src/server/`, `src/lib/`: aplicação Next.js (App Router) e acesso ao Supabase.
- `supabase/`: migrations, seed e testes de banco (pgTAP).
- `scripts/`: utilitários de desenvolvimento (`seed-dev.ts`).

## Documentação

- **Brain do projeto** (fonte de verdade funcional): [`brain-mensalidades-rateio/00-MOC.md`](brain-mensalidades-rateio/00-MOC.md). Decisões oficiais em [`11-Decisoes.md`](brain-mensalidades-rateio/11-Decisoes.md).
- **Feature FND-001 (Fundação)**: [`docs/features/FND-001-fundacao/`](docs/features/FND-001-fundacao/) (plano em `01-plano.md`, registro de implementação em `04-implementacao.md`).
- Orquestração dos agentes: [`CLAUDE.md`](CLAUDE.md) e `.claude/`.
- **Next.js 16** tem APIs diferentes do usual: leia [`AGENTS.md`](AGENTS.md) e consulte `node_modules/next/dist/docs/` antes de escrever código Next.

## Segurança

- A pasta `.acessos/` guarda credenciais pessoais, fica no projeto e é ignorada pelo git. Não a abra em ferramentas compartilhadas e não a copie para o repositório.
- A chave secreta do Supabase é usada apenas por scripts de desenvolvimento.
