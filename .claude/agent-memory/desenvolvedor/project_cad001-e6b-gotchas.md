---
name: cad001-e6b-gotchas
description: Armadilhas da E6b (formulário de cliente): FormData paralelo de apelidos, React 19 lint de refs, diálogo que envia o form principal, testes da ação
metadata:
  type: project
---

- Heredoc do Bash com aspas/apóstrofos em pt-BR quebra ("unexpected EOF"): gravar o texto com Write no scratchpad e anexar com `cat >>`.
- `FormData.set("x")` num form de teste que já tem `x` via `append` não substitui o primeiro `get`; ao forjar um campo, usar `form.set` sobre o campo existente (não `append` em `editClientForm([[...]])`).
- Apelidos do cliente: `aliasType` + `aliasValue` paralelos (um par por ativo); tamanhos diferentes -> `aliases: undefined` -> "Lista de apelidos inválida.". O esquema não sabe CPF x CNPJ do apelido (mensagem genérica no servidor).
- Lint `react-hooks/refs` proíbe escrever ref durante a renderização (o ajuste de estado do "Carregar versão atual" não pode zerar `confirmedRef`): a assinatura da confirmação leva `base.updatedAt`, assim a versão nova a invalida sozinha.
- Diálogo 4.1.8 fica FORA do `<form>` (portal); "Confirmar e salvar" chama `formRef.requestSubmit()` e o motivo vai num `<input type="hidden" name="reason">` do form principal. `onSubmit` com `preventDefault` impede a ação (React 19), então o `onSubmit` serve de portão para abrir o diálogo.
- "Salvar mesmo assim" é `type="submit"` com `acknowledgedDuplicateIds` ocultos renderizados só enquanto o aviso vale (nome + apelidos ativos iguais aos enviados).
- Não importar `schemas.ts` (zod) em código de cliente: constantes duplicadas (`MAX_ALIAS_LENGTH`, `CLIENT_NOTES_MAX`) com comentário.
- A ação lê a situação do cliente do banco (`getClientActiveState`) para `allowEmptyPartners`; campo de formulário nunca decide.

**Why:** poupa retrabalho na E6c (inativar/reativar, build e HTTP) e nos e2e da E7.
**How to apply:** ao mexer no formulário de cliente ou ao testar `saveClientAction` por HTTP (campos: `legalName`, `documentType`, `document`, `monthlyValue`, `partnerIds`, `aliasType`/`aliasValue`, `expectedUpdatedAt`, `acknowledgedDuplicateIds`, `reason`).
