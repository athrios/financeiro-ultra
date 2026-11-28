---
name: cad001-e10-tests-gotchas
description: Armadilhas dos e2e permanentes da E10 (errorOf, CONFLICT x STALE_VERSION, paginação, concorrência)
metadata:
  type: project
---

- A resposta de uma Server Action com erro é o HTML da página com o estado embutido: `{"status":"error","error":{code,message,field?,details?},"fieldErrors":{...}}`. `errorOf(result)` em `tests/e2e/support/cadastros.ts` lê isso com contagem de chaves (o `error` pode ter `details` aninhado; regex com `[^{}]` falha em silêncio e devolve nulo).
- Conflito de versão: `code` = `CONFLICT` e a chave estável `STALE_VERSION` vem em `hint` (`result.hint`). `PARTNER_INACTIVE` é `RULE_VIOLATION`; sócio inexistente é `NOT_FOUND` com campo `partnerIds`.
- `console.log` dentro de teste do vitest some na saída do PowerShell; para sondar respostas, gravar num arquivo do scratchpad e apagar o teste de sondagem depois.
- `node - <<'EOF'` com crases e `${}` de TS dentro quebra o Bash (unexpected EOF); editar com a ferramenta Edit.
- Página além do fim em Clientes mantém `q` e `por` e tira `pagina` (`NEXT_REDIRECT;replace;/clientes?q=...;307` no HTML PPR, 200 de status).
- Concorrência: dois `callAction` em `Promise.all` com o mesmo jar e o mesmo token funcionam; o perdedor sempre `CONFLICT/STALE_VERSION`, sem 303.
- O build (`npm run build`) precisa ser refeito se o código de `src` mudou depois do último `.next`; o manifesto das ações vem de lá.

**Why:** economiza retrabalho ao estender os e2e da CAD ou de Recebimentos.
**How to apply:** ao conferir motivo de recusa de ações em e2e e ao criar massa grande de clientes.
