# Financeiro Ultra · Instruções para o Claude

Sistema de mensalidades com rateio gerencial pós-recebimento. Leia também o [`README.md`](README.md) para instalação e scripts.

## Regra do Next.js 16

Este projeto usa Next.js 16, com APIs e convenções diferentes do que você conhece. **Leia `AGENTS.md` e consulte `node_modules/next/dist/docs/` antes de escrever qualquer código Next.** Respeite avisos de depreciação.

@AGENTS.md

## Brain (fonte de verdade funcional)

A fonte de verdade funcional está em `brain-mensalidades-rateio/`.

- Comece por `brain-mensalidades-rateio/00-MOC.md`.
- Consulte `brain-mensalidades-rateio/11-Decisoes.md` antes de qualquer alteração estrutural. Decisões oficiais (RAT-Dxxx) prevalecem sobre documentos em rascunho.
- Não invente regra de negócio ausente: marque como `DECISÃO PENDENTE`.

## Feature em andamento

FND-001 (Fundação): `docs/features/FND-001-fundacao/`. O plano aprovado é `01-plano.md` (revisão 8); o registro de implementação é `04-implementacao.md`. Não edite o plano nem o Brain sem pedido explícito do responsável.

## Decisões vigentes que afetam o código (resumo)

- Empresa única, sem `organization_id` (RAT-D010). Papéis: Administrador, Operador, Visualizador, mais login próprio dos sócios (RAT-D011); em dúvida, negar por padrão.
- Divisão **sempre 1/n** entre os sócios indicados no cliente (RAT-D015). Não existem percentuais armazenados, nem padrão por sócio, nem divisão própria por cliente.
- Vocabulário: "Parte" do Brain = **Sócio** no sistema (interface, código e banco) (RAT-D017). Mantenha Cliente e Recebedor. Não use "Indicador" nem "Empresa" nas novas estruturas.
- Seeds, testes e exemplos usam **somente nomes fictícios** (RAT-D019).
- O código antigo fica como referência; nada é removido sem aprovação (RAT-D012).
- Sistema de uso interno (RAT-D020): fica o básico de segurança (login só por convite, papéis garantidos no banco, auditoria, comprovantes em área privada, segredos fora do código). Não acrescente camadas extras (CAPTCHA, limite próprio de tentativas, CSP mais rígida, e-mails de aviso) sem pedido do responsável.
- Pasta `.acessos/` contém credenciais pessoais: não leia, não edite, não versione.

## Subagentes especializados

Use os subagentes em `.claude/agents/` conforme o tipo de tarefa:

- `engenheiro-software`: obrigatório antes de feature complexa, refatoração ou mudança arquitetural.
- `modelagem-dados`: obrigatório para mudança persistente de dados.
- `design-ui-ux`: obrigatório para fluxo/tela nova relevante.
- `desenvolvedor`: responsável pela implementação.
- `seguranca`: revisão independente antes de release de mudanças sensíveis.
- `qa`: validação funcional independente após implementação.
- `relator`: relatório final pouco técnico.

Protocolo completo: `.claude/docs/PROTOCOLO-ORQUESTRACAO.md`.

## Fluxo

Planejamento → Modelagem/UI quando aplicável → Desenvolvimento → Segurança + QA → correções → revalidação → Relatório.

Não pule gates silenciosamente.

## Restrições

- Não invente regra de negócio.
- Não aplique migrations de produção sem autorização explícita.
- Não transforme proposta em decisão oficial sem aprovação.
- Não permita que o desenvolvedor autoaprove sua própria entrega.
- Não considere uma feature concluída com QA reprovado ou risco alto/crítico de segurança não resolvido.
