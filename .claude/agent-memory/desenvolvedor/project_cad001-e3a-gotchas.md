---
name: cad001-e3a-gotchas
description: Armadilhas verificadas ao implementar as migrations 0100/0200 da CAD-001 (constraint triggers, pgTAP, supabase CLI no Windows)
metadata:
  type: project
---

- Em função de trigger compartilhada por duas tabelas, nunca use `case tg_table_name when ... then new.id else new.client_id end`: o plpgsql resolve os campos de `new` na compilação da expressão e dá 42703 na tabela que não tem o campo. Use `if/else` com atribuições separadas.
- `old` em trigger de INSERT é NULL (PG 11+), então `tg_op = 'INSERT' or not old.active` é seguro.
- pgTAP com constraint trigger diferido: helper `pg_temp.i01_of(sql)` que faz `execute sql; set constraints all immediate; set constraints all deferred;` num bloco com `exception` (subtransação desfaz tudo). Evite deixar cliente ativo sem indicação em fixtures (o evento pendente quebra o próximo `immediate` e o TRUNCATE dá 55006).
- Para conferir `hint`/`detail` de erro no pgTAP: helpers `pg_temp.err_of` (`sqlstate|hint`) e `pg_temp.detail_of` (JSON) com `get stacked diagnostics`.
- `truncate <tabela com FK de entrada>` sem `cascade` pode falhar antes do trigger; usar `cascade` nos testes de bloqueio.
- `docker cp` e `docker exec ... -f` no Git Bash mangam caminho; para rodar SQL com várias instruções no contêiner use `docker exec -i supabase_db_financeiro-ultra psql -U postgres < arquivo.sql`.
- Heredoc Bash com SQL/aspas longos quebra ("unexpected EOF"): gerar o arquivo com a ferramenta Write (ou script .py gravado com Write).
- `supabase db reset` leva ~3 min; rode em primeiro plano com timeout alto. `supabase test db <arquivo>` aceita um arquivo só.
- Fora do ambiente: texto oficial da Receita (CNPJ alfanumérico) não foi consultável; exemplo `12.ABC.345/01DE-35` só recalculado em script.

**Why:** economiza retrabalho nas partes 2 e 3 do E3a/E3b (RPCs, seed, testes de concorrência).
**How to apply:** ao escrever triggers, testes pgTAP e migrations seguintes da CAD-001.
