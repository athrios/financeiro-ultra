---
name: cad001-e7a-gotchas
description: Armadilhas da E7 parte 1 (página Apelidos): contar linhas no HTML, node com caminho MSYS, nav/Edit
metadata:
  type: project
---

- No HTML de página PPR com tabela há vários `<tbody>` (11 numa lista de 13 linhas) e linhas partidas em fragmentos: contar linhas por `<tbody>`/`<tr` dá número errado. Contar por texto (rótulo do tipo dentro de `<tr>` sem "Pertence a") ou comparar com a contagem exibida.
- `node - <<EOF` com caminho `/c/Users/...` vira `c:\c\Users...` no Windows: usar Edit/sed no roteiro, ou caminho relativo ao cwd. `node` com regex em `replace` contra arquivo com `\r` pode não casar sem erro (navigation.ts: usar Edit).
- Título (`<title>`) da página aparece mesmo no "Sem permissão": checar ausência do menu por `href="/configuracoes/aliases"`, não pelo texto "Apelidos".
- `ListPagination` (`src/components/form/`) é a paginação comum; `ClientsPagination` é só invólucro. Para nova lista: passar `hrefFor(page, pageSize)`.
- Seed local não tem apelidos inativos nem banco vazio: estados "Ver todos" e "Nenhum apelido cadastrado ainda." ficam só por revisão.

**Why:** economiza retrabalho nas verificações HTTP e na E7 parte 2.
**How to apply:** ao testar listas por HTTP sem navegador ou criar nova lista paginada.
