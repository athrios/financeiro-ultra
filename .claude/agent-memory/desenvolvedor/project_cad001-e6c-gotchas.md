---
name: cad001-e6c-gotchas
description: Armadilhas da E6c parte 1 (inativar/reativar cliente): formulário da ação, hint do bloqueio, testes
metadata:
  type: project
---

- `setClientActiveAction` lê a situação com `getClientActiveState` (nunca do form); "já na situação" redireciona a `ja-ativo`/`ja-inativo` sem RPC. Campos do POST (parte 2, HTTP): `id`, `active` ("true"/"false"), `expectedUpdatedAt`, `reason`.
- Reativar sem sócio ativo: o erro chega com `error.hint === "CLIENT_WITHOUT_PARTNER"` (code `RULE_VIOLATION`); a mensagem "Este cliente não tem sócio ativo..." só sai se o contexto de `toActionFailure` leva `operation: "activate"`.
- O controle (`client-active-control.tsx`) recebe só os nomes dos sócios ativos; a variante (inativar/reativar/bloqueio) vem de `clientActiveVariant` em `client-view.ts`. Ação sem formulário no HTML (diálogo fechado): usar o roteiro `$ACTION_REF` da E5a.
- Heredoc do Bash com apóstrofos em testes pt-BR quebra sem gravar nada: usar Write no scratchpad e `cat >>`.
- Teste de ordem revalidar -> redirecionar: `revalidatePath.mockImplementation` e `redirect.mockImplementationOnce`; chamar `revalidatePath.mockReset()` depois (o `beforeEach` só faz `mockClear`).

**Why:** poupa retrabalho na verificação HTTP da parte 2 e nos e2e da E7.
**How to apply:** ao testar inativar/reativar cliente por HTTP ou mexer no controle.
