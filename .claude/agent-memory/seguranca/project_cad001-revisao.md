---
name: cad001-revisao
description: Estado do G4 da CAD-001 (27/11/2026) rodada 4c - LIBERADO; convencao de dado de teste no SEG-CAD-15; so informativos abertos
metadata:
  type: project
---

Revalidacao pos-E10 da CAD-001 em 2026-11-26: rodada 1 LIBERADO COM RESSALVAS (SEG-CAD-11); rodada 2 LIBERADO, SEG-CAD-11 fechado (06-qa limpo).
- Rodada 4 (2026-11-27, tetos RAT-D026 em private.cad_list_limit/assert_list_limit): LIBERADO; SEG-CAD-14 informativo (repetidos sem teto bruto, admin-only). Prova de catalogo via `npx supabase db query --local "<select>"` (~10 s), sem tocar no banco do QA.
- Rodada 4c (2026-11-27, varredura pre-commit): sem segredo/ref/URL/e-mail real; achados baixos de dado de teste trocados pelo desenvolvedor. Convencao registrada no SEG-CAD-15 (decisao tecnica do orquestrador, nao regra de negocio).
- CPF 100.000.00x-xx dos vetores 12.3 ja coberto pelo SEG-CAD-12; nao reabrir.
- CPFs de digitos repetidos (111.111.111-11) no 06-qa sao casos invalidos de proposito, nao achado.

- O QA tende a gravar no 06-qa.md documentos com DV valido gerados no navegador (SEG-CAD-11). A cada revalidacao, rodar varredura de CPF/CNPJ com DV valido em TODOS os docs da feature, nao so nos apontados.
- Convencao de dado de teste (SEG-CAD-15): CPF 000.000.00x-xx e 100.000.00x-xx; um unico 000.000.0xx-xx como excecao do 2o DV resto 10 (document.test.ts:121); CNPJ numerico so com raiz 99.999.999; alfanumerico EX0.../ZZ0TESTE... e o exemplo publico 12.ABC.345/01DE-35; teste so de mascara usa DV invalido (final 00); telefone com DDD 23 (inexistente); e-mail @example.com. Os antigos vetores "conhecidos" (529.…25, 123.…09, 11.2…81, AB…70) NAO sao mais aceitos. Carimbos de migration (prefixo 202...) dao falso positivo de CNPJ corrido.
- `supabase/config.toml` tem e-mail de exemplo do modelo do Supabase CLI (dominio email.com), da base: nao e achado.
- Regra que valia e foi violada ate a 4c: nunca escrever numero de documento, telefone ou e-mail suspeito por extenso no 05-seguranca.md nem nesta memoria (o 05 trazia vetores por extenso). Sempre mascarar (prefixo…sufixo, ex. "529.…25") e evitar ate o prefixo que o scanner casa (ex. os 4 primeiros do alfanumerico AB…70).
- npm test completo pode falhar por timeout em equal-split.test.ts quando o QA usa a maquina; rodar o arquivo sozinho antes de concluir.

**Why:** repositorio publico (RAT-D019); evitar repetir o ciclo do SEG-CAD-02.
**How to apply:** antes de liberar commit da CAD-001 ou de feature nova, exigir varredura limpa nos docs (06-qa inclusive) e nos testes, contra a convencao do SEG-CAD-15. Valores antigos que ja estavam no historico publico (123.…09, 11.2…81, e-mail u…@) sairam so da versao atual; reescrever historico e decisao do responsavel. Pendencias de handoff: SEG-CAD-08 item 1 (reconhecimento exigir r.active and p.active) para Recebimentos; SEG-CAD-13 se a importacao passar a logar Pix/conta.
