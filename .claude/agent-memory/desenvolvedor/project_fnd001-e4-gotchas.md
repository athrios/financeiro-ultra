---
name: fnd001-e4-gotchas
description: Armadilhas verificadas ao implementar a linha de base do banco (FND-001 E4) com Supabase CLI 2.120 no Windows
metadata:
  type: project
---

- `supabase db query --local -f arquivo.sql` conecta como `postgres` mas aceita UMA instrução por arquivo (comando preparado). Atribuição de papéis do seed usa um único `select` com várias chamadas a `private.set_user_access`.
- Constraint trigger diferido (`profiles_admin_remains`) só dispara no COMMIT: em pgTAP usar `set constraints all immediate`; a função precisa ser SECURITY DEFINER porque na cascata do Auth roda como `supabase_auth_admin`.
- `tsx` com CJS não aceita top-level await: envolver scripts em `async function main()`.
- `spawnSync("npx", ..., { shell: true })` só no Windows (npx.cmd); argumentos devem ser constantes.
- `db reset` apaga os usuários do Auth: rodar `npm run seed:dev` de novo depois.
- Senha do seed nunca no código: `DEV_SEED_PASSWORD` ou aleatória impressa no final.

**Why:** economiza retrabalho nas próximas etapas (E5+, features) que usem o mesmo banco/seed/pgTAP.
**How to apply:** ao criar novos pgTAP, seeds ou scripts de banco local.
