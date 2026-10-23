# Agentes Claude — Mensalidades e Rateio

Pacote de subagentes Claude Code para o projeto.

## Instalação

Copie a pasta `.claude/agents/` para a raiz do repositório.

A documentação do fluxo está em:

- `docs/agentes/PROTOCOLO-ORQUESTRACAO.md`
- `docs/agentes/CLAUDE-ORQUESTRACAO.md`

O segundo arquivo contém um trecho recomendado para mesclar ao `CLAUDE.md` existente.

## Agentes incluídos

- `engenheiro-software`
- `modelagem-dados`
- `desenvolvedor`
- `design-ui-ux`
- `seguranca`
- `qa`
- `relator`

## Brain esperado

Os prompts assumem que o Brain está disponível em:

`brain-mensalidades-rateio/`

Se o diretório tiver outro nome, ajuste essa referência nos agentes ou no `CLAUDE.md`.

## Observação

Os agentes são deliberadamente segregados. Segurança e QA são validadores independentes; o Desenvolvedor não deve autoaprovar a própria entrega.
