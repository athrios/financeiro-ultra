# Instruções de Orquestração para CLAUDE.md

> Trecho recomendado para incorporar ao `CLAUDE.md` do projeto. Não substitua um `CLAUDE.md` existente sem revisar e mesclar.

## Brain

A fonte de verdade funcional do projeto está em `brain-mensalidades-rateio/`.

Comece por `brain-mensalidades-rateio/00-MOC.md` e consulte `11-Decisoes.md` antes de qualquer alteração estrutural.

## Subagentes especializados

Use os subagentes em `.claude/agents/` conforme o tipo de tarefa:

- `engenheiro-software`: obrigatório antes de feature complexa, refatoração ou mudança arquitetural.
- `modelagem-dados`: obrigatório para mudança persistente de dados.
- `design-ui-ux`: obrigatório para fluxo/tela nova relevante.
- `desenvolvedor`: responsável pela implementação.
- `seguranca`: revisão independente antes de release de mudanças sensíveis.
- `qa`: validação funcional independente após implementação.
- `relator`: relatório final pouco técnico.

## Fluxo

Planejamento → Modelagem/UI quando aplicável → Desenvolvimento → Segurança + QA → correções → revalidação → Relatório.

Não pule gates silenciosamente.

## Restrições

- Não invente regra de negócio.
- Não aplique migrations de produção sem autorização explícita.
- Não transforme proposta em decisão oficial sem aprovação.
- Não permita que o desenvolvedor autoaprove sua própria entrega.
- Não considere uma feature concluída com QA reprovado ou risco alto/crítico de segurança não resolvido.
