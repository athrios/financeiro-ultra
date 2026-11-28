---
name: modelagem-cad-001
description: Escolhas da modelagem CAD-001 (Sócios, Recebedores, Clientes; rev. 1 em 2026-11-25) que as features seguintes herdam ou precisam rever
metadata:
  type: project
---

Entregue em `docs/features/CAD-001-socios-e-clientes/02-modelagem-dados.md` (G1 APTA com condições). Escolhas não óbvias:
- Escrita: implementação `private.<fn>` SECURITY DEFINER + invólucro `public.<fn>` SECURITY INVOKER (mantém o teste da FND "nenhum DEFINER em public"); `authenticated` sem INSERT/UPDATE/DELETE.
- Funções de SALVAMENTO por cadastro (save_partner/save_receiver/save_client), listas filhas como estado final desejado; pedido da UI (U-C01). `set_*_active` à parte.
- Erros: SQLSTATE + `hint` estável + `detail` JSON com o dono (só após require_admin).
- Concorrência: `updated_at` como token, passado como texto (JS Date perde microssegundos); filhos "tocam" o updated_at do dono.
- Rev. 2: mensalidade `default_monthly_value numeric(14,2)` via `private.to_money`, texto decimal nas fronteiras (leitura `::text`). Lição: "em centavos" do orquestrador = "nunca float", não trocar a convenção da FND sem confirmar.
- Chave Pix sem subtipo; CPF/CNPJ aceito como chave (RAT-D023). Nada mascarado para Op/Vis (RAT-D023, "Ver completo"). Sócio sem apelido tipado; cliente: NAME/DOCUMENT.
- Tabelas de cliente na E3a porque a inativação do sócio checa `client_partners`.
- Rev. 3 (2026-11-26): doc alinhado às migrations (D-11..D-21). Lista de estado final nula = `LIST_REQUIRED`; confirmação nula = vazio. Erros `*_TAKEN` são levantados na `0200` (gatilhos/assert_*_free), não nas RPCs. PEND-M3 encerrada no mesmo dia (RAT-D024 corrigida, "O do plano/código"): aviso de duplicado para qualquer cliente, com ou sem documento; o nome fantasia conta como nome.
- Rev. 4 (2026-11-27, RAT-D026): teto de itens ATIVOS (sócio 2; cliente 2 NAME + 2 DOCUMENT; recebedor 30/10/10) no laço de validação dos save_*, antes de travas; números em `private.cad_list_limit` (linhas `when 'X' then return N;` são contrato lido por teste Vitest), erro `22023 LIST_LIMIT_EXCEEDED` via `private.assert_list_limit`. Lista de estado final = ativos, então não há gatilho nem consulta (R-D14: caminho de escrita novo precisa chamar o assert).

**Why:** Recebimentos/Rateio vão ler `client_partners`, `receivers.partner_id` e a mensalidade; a revisão de segurança vai olhar os DEFINER em private.

**How to apply:** em feature nova, reler a seção 6 e 15 do documento da CAD-001; verificar se D-01 e PEND-M1 foram decididas. Ver [[modelagem-fnd-001]] e [[restricoes-workflow-financeiro-ultra]].
