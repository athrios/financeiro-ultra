---
name: restricoes-workflow-financeiro-ultra
description: Restrições fixas do projeto Financeiro Ultra para o agente de modelagem (pasta .acessos, git, remotos, Brain/plano somente leitura)
metadata:
  type: project
---

Nunca ler nem tocar `.acessos/` (credenciais pessoais do responsável; fica no projeto, ignorada pelo git por decisão dele em 2026-10-22, risco R-04 aceito). Não rodar git nem criar/alterar projetos remotos (Supabase/Vercel/GitHub). Não editar `brain-mensalidades-rateio/` nem `docs/features/*/01-plano.md`: divergências vão para o entregável.

**Why:** decisões do responsável registradas no plano FND-001 (rev. 5); commits só depois da validação; Brain é fonte de verdade editada por outro fluxo.

**How to apply:** em qualquer tarefa de modelagem, entregar só o arquivo pedido em `docs/features/<feature>/`, com uma seção de divergências. Ver também [[modelagem-fnd-001]].
