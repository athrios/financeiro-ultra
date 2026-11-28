---
name: cad001-e5a-http-gotchas
description: Como testar Server Actions de sócio por HTTP sem navegador (ids, formulário sintético, armadilha do logout)
metadata:
  type: project
---

- A senha do `seed:dev` não fica registrada: reexecutar `npm run seed:dev` com `DEV_SEED_PASSWORD` gerado na hora (idempotente, só Supabase local) e guardar no scratchpad.
- Script descartável: `tsx --env-file=.env.local script.ts` importando `tests/e2e/support/{http,pages,env}` por caminho absoluto; `signIn(user)` dá o cookie.
- Ao escolher o formulário com `ACTION_ID` no HTML, o primeiro é o "Sair" do shell (signOut): posta-lo derruba a sessão (303 `/login`). Escolher o formulário por `name="name"`.
- Ação sem formulário no HTML (diálogo fechado, ex.: `setPartnerActiveAction`): ler o id em `.next/server/server-reference-manifest.json` e montar `$ACTION_REF_1`, `$ACTION_1:0` (`{"id":..,"bound":"$@1"}`), `$ACTION_1:1` (`[{"status":"idle"}]`), `$ACTION_KEY` mais os campos; POST na página que hospeda a ação, com `Origin`.
- Sucesso = 303 com `?aviso=<chave>`; erro = 200 com `"status":"error"` no payload RSC.
- "Registro não encontrado" (PPR) chega com status 200 e o texto só no payload RSC: testar em `page.html`, não em `page.text`. Roteiro em `.mts` e import de `file:///C:/.../tests/e2e/support/x.ts` (tsx não aceita caminho `C:/` puro).
- Chaves Pix e contas são únicas no banco inteiro: roteiro repetido precisa gerar valores novos a cada execução (senão `IDENTIFIER_TAKEN` vira falso negativo). Ação sem formulário aceita `$ACTION_KEY` copiado de outra página.
- Não há exclusão de sócio: os testes deixam sócios fictícios no banco local até o próximo `db:reset`.

**Why:** economiza retrabalho na E5b/E6/E7 ao validar ações por HTTP.
**How to apply:** ao testar Server Actions de cadastros sem navegador.
