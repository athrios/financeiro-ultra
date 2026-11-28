---
name: cad001-e6c2-http-gotchas
description: Armadilhas da verificação HTTP de Clientes (E6c parte 2): redirect PPR, versão do sócio, regex de data, senha do seed
metadata:
  type: project
---

- Senha do seed: NÃO gravar em arquivo (o classificador nega e o pedido proíbe). Gerar `DEV_SEED_PASSWORD` com `export` no mesmo comando Bash que roda `npm run seed:dev` e o roteiro `tsx`; cada comando novo precisa reexecutar o seed.
- Redirect em página PPR (ex.: `?pagina=99`) chega com status 200: o sinal é `<meta id="__next-page-redirect" http-equiv="refresh">` e `NEXT_REDIRECT;replace;/clientes;307` no HTML, não `Location`.
- Versão do sócio (`expectedUpdatedAt`) vem de `/configuracoes/socios/{id}/editar`; o detalhe não tem o campo (o diálogo fechado não renderiza o form). Versão do cliente vem de `/clientes/{id}/editar`.
- Regex "1/2" casa com datas "26/11/2026"; a prévia do detalhe diz "divisão igual: 1/3 para cada um" e, com um sócio, "divisão: 1/1 (100%)".
- Campos do POST de cliente: `legalName, tradeName, documentType (CPF|CNPJ), document, monthlyValue, notes, partnerIds (repetido), aliasType (NAME|DOCUMENT)/aliasValue paralelos, expectedUpdatedAt, acknowledgedDuplicateIds (repetido), reason`. Documentos únicos: gerar CPF/CNPJ (inclusive alfanumérico, DV mod 11 com valor = código-48) novos a cada execução.
- Sem python no Bash; para editar roteiro use Edit ou node. `sed` com barras em regex quebra silenciosamente.

**Why:** economiza retrabalho nos e2e da E7 e em verificações futuras de telas com PPR.
**How to apply:** ao testar Clientes (ou telas parecidas) por HTTP sem navegador.
