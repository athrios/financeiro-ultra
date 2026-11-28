---
name: cad001-e5b-gotchas
description: Armadilhas da E5b (recebedores): onde mora o IDENTIFIER_TAKEN, heredoc do Bash, vitest, teste flaky
metadata:
  type: project
---

- O `raise ... IDENTIFIER_TAKEN` está no gatilho `receiver_identifiers_prepare` da migration `0200_cad_tables.sql`, não na `0300` (as RPCs só o disparam). Mudou o `detail`: edite a 0200 e os pgTAP `08_*` (plano 222 -> 226).
- Heredoc do Bash com textos longos em pt-BR (apóstrofos, crases) falha com "unexpected EOF" e NADA roda; para arquivos grandes use a ferramenta Write (ou Write no scratchpad + `cat >>`), e `printf` para anexos curtos.
- `vitest` direto pelo Bash quebra ("Cannot read properties of undefined (reading 'config')"); rodar sempre via `powershell.exe -NoProfile -Command "Set-Location 'C:\projetos\financeiro-ultra'; npx vitest run ..."`.
- `src/domain/shared/equal-split.test.ts` (FND) estoura os 5 s de vez em quando com a máquina carregada; reexecutar antes de investigar.
- `normalizeAlias` apaga pontuação: para comparar chave Pix na tela use `normalizePixKey` (`receiver-identifiers.ts`).
- Server Actions de recebedor: o sócio de destino do redirect vem do banco (`getReceiverDetail`), nunca do formulário. Contas viajam em 3 campos paralelos (`accountBank|Branch|Number`).

**Why:** poupa retrabalho na E6 (clientes) e na verificação HTTP da E5b.
**How to apply:** ao mexer em recebedores, identificadores ou ao escrever arquivos longos pelo Bash.
