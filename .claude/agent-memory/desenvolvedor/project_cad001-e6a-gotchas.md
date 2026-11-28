---
name: cad001-e6a-gotchas
description: Armadilhas da E6a (lista e detalhe de clientes): migration 0400 editada no lugar, plano pgTAP, heredoc, guarda de papel
metadata:
  type: project
---

- `search_clients` tem 5.º parâmetro `p_partner_id uuid default null`; qualquer teste que cite a assinatura (`10_cad_roles_matrix`, regprocedure) usa `(text,text,integer,integer,uuid)`. `database.types.ts` foi editado à mão (uma linha).
- O aviso por apelido reaproveita o rótulo `SAME_ALIAS`; o TS (`cadastro-errors.ts`) não conhece rótulo novo.
- pgTAP: ao somar testes, o `plan(n)` costuma errar por um; rodar `supabase test db` e acertar pelo "ran N".
- Heredoc do Bash com apóstrofos/aspas triplas em Python (ou textos longos pt-BR) quebra com "unexpected EOF": gravar com a ferramenta Write e anexar com `cat`.
- `guardPage` devolve `role` e há `guardAdminPage` (Operador/Visualizador abrem /clientes/novo e /editar e veem "Sem permissão"). `searchClientsSchema.parse` agora exige `partnerId` UUID ou nulo (string vazia falha).
- Rotas `/clientes/novo` e `/clientes/[id]/editar` são placeholders até a E6b; "Inativar/Reativar" do detalhe é botão desabilitado até a E6c.

**Why:** poupa retrabalho na E6b (formulário) e E6c (inativar/reativar e verificação HTTP).
**How to apply:** ao mexer em clientes, busca de clientes ou nas guardas de página.
