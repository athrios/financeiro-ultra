---
name: cad001-e3b-clientes-gotchas
description: Armadilhas da migration 0400 (save_client, buscas), do seed com pgTAP e da concorrência à mão na CAD-001
metadata:
  type: project
---

- O seed passou a povoar o banco em que o pgTAP roda: fixtures dos testes e valores do seed não podem coincidir (documento, apelido, Pix, conta). Testes de nível de tabela não podem contar `audit_logs` inteiro nem usar `id::text like 'f%'` (ids aleatórios do seed batem): usar view temporária por `tx_id = pg_current_xact_id()` e padrão `'f_000000-0000-4000-8000-%'`; dar ids explícitos ao seed.
- `created_at`/`now()` é o da transação: dois registros criados no mesmo teste empatam. Para distinguir homônimos, ordenar por `min(audit_logs.seq)`.
- Em pgTAP, `select count(*) from busca(...)` sem texto bate no limite padrão (25): comparar `max(total_count)`.
- Função `returns table (id, ...)` em plpgsql: usar `#variable_conflict use_column` e qualificar as colunas; validação com `raise` exige plpgsql (não `language sql`).
- `for share` com `order by` trava na ordem do sort (ordem por id, 9.2); ler o cliente sem trava antes só para o NOT_FOUND.
- Concorrência CA-07 só mostra o I-01 diferido com `update` direto (sem token): `save_client` com o mesmo token cai em `STALE_VERSION` antes. A expressão da versão em `psql` avalia na hora, antes de a função esperar a trava.
- Scripts Python para editar testes grandes: gravar com Write e rodar `python arquivo.py`; heredoc Bash com aspas/`$$` quebra.
- `db reset` roda ~3 min e passa de 120 s se encadeado com poll; rodar em segundo plano e depois `test db` (também pode ir para segundo plano).

**Why:** economiza retrabalho nas etapas E4 em diante, que usam o mesmo seed e os mesmos testes.
**How to apply:** ao criar testes pgTAP, seeds ou funções de busca da CAD-001.
