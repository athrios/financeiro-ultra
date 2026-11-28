---
name: cad001-e10-app-gotchas
description: Armadilhas da E10 (aplicação) da CAD-001: NUL, tetos de lista, documentType, redação de CNPJ no log
metadata:
  type: project
---

- Tetos das listas (50/50/50/20/20) vivem em `src/domain/cadastros/limits.ts`; zod, `addItem`/`addClientAlias`/`addAccount` e as telas leem dali. O e2e `cad-limits.e2e.test.ts` repete os números.
- Erro de teto do recebedor vai no índice BRUTO do primeiro item acima do teto (`identifiers.N`), porque `summarizeReceiverValidation` acha a lista pelo tipo do item bruto. Contar só itens não vazios.
- `documentType` precisou entrar em `CLIENT_FORM_FIELDS` (e em `fieldIdsOf`) para virar `fieldErrors.documentType`; `Record<ClientFormField,...>` quebra o typecheck se faltar.
- NUL: erro em texto que grava, remoção (`stripNul`) em busca/URL. `trim()` não tira NUL.
- `newClientForm(extra)` nos testes de action só anexa: `form.get` pega o primeiro valor; para trocar `documentType`/`notes` use `form.set`.
- Ambiente: sem `python3` no Bash; heredoc grande com `file && cat >> ... <<EOF` demorou/background; preferir Edit/Write. Arquivos do repo misturam CRLF e LF.

**Why:** evita retrabalho ao estender listas ou campos de cliente.
**How to apply:** ao mexer em limites, esquemas de cadastro ou no formulário de cliente.
