---
name: fnd001-e5-gotchas
description: Armadilhas da E5 (Next 16 Cache Components + Supabase SSR, smoke HTTP sem navegador, pgTAP com seed)
metadata:
  type: project
---

- Com `cacheComponents` + `partialPrefetching`, o cliente Supabase lendo a sessão gera `Error: ... unstable value Date.now() while prerendering` a cada página autenticada no `next start`. Correção: `await connection()` no início de `createSupabaseServerClient()`. Conferir sempre o log do `next start` (build e smoke passam mesmo com o erro).
- Envio de formulário SEM JavaScript a rota PPR devolve só o "resume" dinâmico (sem `<html>`); o estado da Server Action só aparece no payload `self.__next_f`. Rota estática (`/recuperar-senha`) mostra no HTML. Smoke sem navegador deve checar o payload.
- Smoke: React insere `<!-- -->` em texto com interpolação; regex de remoção de comentários precisa ser `[\s\S]*?`. `<title>` entra no "texto visível".
- pgTAP: testes que dependem de "último Administrador" devem inativar os Administradores preexistentes (com `set_audit_context` + motivo) dentro da transação; senão falham após `seed:dev`.
- Heredoc grande no Bash com aspas pode quebrar: gravar com Write em arquivo temporário e concatenar com `cat >>`.

**Why:** economiza retrabalho em features que usem sessão/SSR no Next 16 e testes de banco.
**How to apply:** ao tocar `src/lib/supabase/*`, formulários de Server Actions, smoke HTTP ou novos pgTAP.
