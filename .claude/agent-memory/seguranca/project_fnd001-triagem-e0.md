---
name: fnd001-triagem-e0
description: Estado da triagem de seguranca da E0/FND-001 (22/10/2026) - audit residual dev-only, RAT-D019 vale tambem para docs, .env.local nao legivel por politica
metadata:
  type: project
---

Revisao antecipada da E0 + E6 (FND-001) feita em 2026-10-22, antes do primeiro commit.

- `npm audit --omit=dev` = 0; restam 9 altas so de dev na cadeia `braces` (GHSA-vfj7-8cjw-p6xm, faixa `*`: sem versao corrigida, entao `overrides` nao resolve). `cn@0.4.0` em dependencies e legitimo (mantenedor shadcn, com provenance).
- RAT-D019 diz "Nenhum nome real e versionado": aplica-se tambem a docs/registro (04-implementacao.md versionava o mapeamento nome real -> ficticio). Checar docs, nao so seeds/testes.
- Ler `.env.local` (mesmo so prefixo de chave) e negado pelo classificador do harness; verificar segredos por padrao/regex excluindo esse arquivo e confiar no `.gitignore`.

- Revalidacao 2026-10-22 (pre-commit): SEG-01/02/03/06 resolvidos; abertos so SEG-05 (tieBreakKey servidor + desempate ordinal, ao ligar P-17) e SEG-07 (nome "Ultra Contabilidade" versionado = DECISAO PENDENTE). Pendente no passo git: `git check-ignore -v` e grep de nomes no stage.
- `npm run build` pode colidir com build concorrente de outro agente ("Another next build process is already running"): nao forcar.

**Why:** evitar retrabalho nas proximas revisoes (E4/E8/E9) e nao repetir a falsa sugestao de `overrides` para braces.
**How to apply:** na revisao do primeiro commit/push, exigir `git check-ignore -v` e varredura de nomes reais em todo o repo (inclusive docs/), nao so em seeds.
