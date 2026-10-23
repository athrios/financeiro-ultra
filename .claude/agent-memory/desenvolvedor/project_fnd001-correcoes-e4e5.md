---
name: fnd001-correcoes-e4e5
description: Armadilhas da rodada de correções pós-validação E4/E5 (amr do GoTrue, PPR sem JS, sidebar, legado)
metadata:
  type: project
---

- GoTrue local grava `amr = [{method:"otp"}]` para verifyOtp invite e recovery; sessão por senha grava `password`. `/definir-senha` valida isso em `src/lib/link-session.ts` (15 min).
- Scripts de smoke/prova ficam no scratchpad da sessão (`smoke-roles.cjs`, `ev/seg.cjs`); envio sem JS a rota com PPR devolve só o payload RSC, então asserts devem olhar `"status":"..."`, não texto visível.
- Sidebar: rolagem horizontal só com janela baixa (barra vertical come 15px); coluna agora 17rem (D-E5-11).
- Legado: ao comparar apagados com `docs/legado/07-10/`, comparar hash do HEAD ignorando CRLF; o que foi arquivado na E4 pode ser versão modificada, não o original.
- Evite `> /caminho-na-raiz` em redirecionamentos (o hook bloqueia rm/arquivos na raiz); sempre use o scratchpad.

**Why:** a tentativa anterior morreu por excesso de saída; esta rodada terminou conferindo o disco primeiro.
**How to apply:** em rodadas de correção, conferir o disco e o estado do código antes de refazer; saídas longas para arquivos.
