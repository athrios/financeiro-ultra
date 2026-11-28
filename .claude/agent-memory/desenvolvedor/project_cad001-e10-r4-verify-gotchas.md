---
name: project-cad001-e10-r4-verify-gotchas
description: Armadilhas da verificação da rodada 4 da E10 (limites RAT-D026): e2e em um script só, timeout do teste de acesso, heredoc
metadata:
  type: project
---

Verificação completa (reset, pgTAP, build, seed, start, e2e) cabe num script em `scratchpad` rodado com `run_in_background`: ele gera a DEV_SEED_PASSWORD, semeia, sobe `next start`, espera `/login`, roda o e2e pelo PowerShell herdando o env e grava status em arquivo. O script não mata o servidor: confira o PID por `netstat` + CommandLine antes do `taskkill`.

O teste "usuário inativado continua autenticando" de `acesso.e2e.test.ts` chama `npx supabase db query --local` duas vezes (~10 s cada com a máquina ocupada) e estoura os 30 s. Sintoma recorrente (rodadas 2, 3 e 4), sem relação com a feature. Repetir o arquivo sozinho (com novo `seed:dev`, pois a falha pode deixar o operador inativo) passou na 2ª tentativa.

**Why:** evita tratar como defeito da feature um timeout de máquina carregada.
**How to apply:** repetir só `tests/e2e/acesso.e2e.test.ts` antes de concluir; sugerir tempo limite próprio maior no teste.

Heredoc com `cat >> arquivo <<'EOF'` quebrou com texto longo em PT (aspas/crases); usar Edit para anexar ao `04-implementacao.md`.
