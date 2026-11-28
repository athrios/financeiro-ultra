---
name: cad001-e3a-parte2-gotchas
description: Armadilhas verificadas nas funções de gravação (migration 0300) da CAD-001 e em seus testes pgTAP
metadata:
  type: project
---

- `now()` é o horário da transação: dentro de um teste pgTAP o `updated_at` nunca avança. Para provar "a versão mudou", inserir o fixture com `updated_at = '2020-01-01'` explícito (o `set_updated_at` só roda em UPDATE) e comparar depois.
- Função chamada no FROM não enxerga, na mesma consulta, as linhas que ela mesma inseriu (snapshot da consulta): conferir o resultado em instrução separada.
- `pg_temp.err_of`/`detail_of` funcionam também sob `set local role authenticated/anon`. `detail_of` deve usar `nullif(v_detail,'')::jsonb` quando o erro pode não ter detail (42501).
- Escopar asserções de auditoria por `correlation_id` único por chamada; o contexto (`app.*`) fica na transação e uma escrita direta depois da chamada herda o `correlation_id` anterior.
- Aplicar migration nova sem `db reset`: `docker exec -i supabase_db_financeiro-ultra psql -U postgres -v ON_ERROR_STOP=1 < arquivo.sql` (para reaplicar, dropar as funções antes). Só pega erro de compilação; o `db lint` (plpgsql_check) acusa `'{}'` sem cast e variável de `for` declarada à toa.
- Concorrência à mão: duas sessões `psql` em segundo plano (`( docker exec -i ... < a.sql > out.txt & )`), uma com `pg_sleep(3)` antes do commit; gerar os `.sql` com Write ou heredoc sem aspas problemáticas.

**Why:** economiza retrabalho na migration 4 (funções de cliente) e nos testes de auditoria.
**How to apply:** ao escrever RPCs e pgTAP da CAD-001 etapas seguintes.
