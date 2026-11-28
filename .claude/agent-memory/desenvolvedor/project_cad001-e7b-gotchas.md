---
name: cad001-e7b-gotchas
description: Armadilhas dos e2e permanentes da CAD-001 (E7 parte 2): sessões por provide, listas que crescem, eco da busca, Pix na busca
metadata:
  type: project
---

- Os e2e da CAD (`tests/e2e/cad-*.e2e.test.ts`, nome precisa terminar em `.e2e.test.ts`) recebem as sessões dos 4 papéis do `global-setup` por `project.provide("cadSessions")` + `inject`; login por arquivo estouraria o limite de 30 logins/5 min do Supabase local junto com os 48 da FND.
- Banco sem exclusão = listas crescem a cada execução (25 por página, ordenadas por nome): sempre filtrar por `?q=<sufixo>` ou nome do seed, e não indicar sócios A/B/C do seed em clientes novos.
- A busca ecoa o texto digitado na página: "não contém o nome" não prova ausência. Contar `href="/clientes/<uuid>"` (ids da lista).
- O Sócio vê o próprio nome ("Sócio Exemplo A") no cabeçalho; provar ausência de dado com outro nome do seed e com "Acesso de sócio ainda não disponível".
- Busca de Pix na lista de Apelidos não ignora pontuação (nv mantém `.` e `@`); recebedor inativo mantém identificadores ativos (por desenho).
- Arquivos do repo têm CRLF (global-setup, README, vitest.e2e.config): `node -e` com regex multilinha não casa; usar Edit. `sed` com barras em regex de JS quebra (usar Edit).
- Heredoc grande depois de `node -e '...'` no mesmo comando Bash falhou ("unexpected EOF"); para textos longos usar a ferramenta Edit.
- `check:bundle` só confere o valor da chave secreta se rodado com `tsx --env-file=.env.local`.

**Why:** economiza retrabalho ao estender os e2e (Recebimentos etc.).
**How to apply:** ao criar e2e novos sobre o banco semeado ou rodar a verificação completa.
