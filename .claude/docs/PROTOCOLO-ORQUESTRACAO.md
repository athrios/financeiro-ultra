# Protocolo de Orquestração dos Agentes

## Objetivo

Definir como os subagentes do Claude Code trabalham juntos sem sobreposição de responsabilidade.

## Agentes

1. `engenheiro-software` — investiga e planeja.
2. `modelagem-dados` — projeta e protege a estrutura de dados.
3. `design-ui-ux` — especifica experiência e interface.
4. `desenvolvedor` — implementa o que foi aprovado.
5. `seguranca` — audita riscos e proteção.
6. `qa` — valida funcionalidade e regressão.
7. `relator` — entrega o resumo executivo.

## Fluxo padrão de uma feature

```text
Solicitação
    ↓
Engenheiro de Software
    ↓
┌─────────────────────────────┐
│ Há impacto em dados?        │── sim ─→ Modelagem de Dados
│ Há impacto em interface?    │── sim ─→ Design UI/UX
└─────────────────────────────┘
    ↓
Plano consolidado
    ↓
Desenvolvedor
    ↓
┌─────────────────────────────┐
│ Segurança                   │
│ QA                          │
└─────────────────────────────┘
    ↓
Correções pelo Desenvolvedor, se necessárias
    ↓
Revalidação Segurança/QA
    ↓
Relator
    ↓
Entrega ao responsável pelo produto
```

## Gates

### G0 — Escopo compreendido
Responsável: `engenheiro-software`.

Não avança se houver regra crítica indefinida.

### G1 — Dados aptos
Responsável: `modelagem-dados`.

Obrigatório quando houver alteração persistente.

### G2 — UX especificada
Responsável: `design-ui-ux`.

Obrigatório quando houver tela/fluxo novo relevante.

### G3 — Implementação concluída
Responsável: `desenvolvedor`.

Exige testes executados e critérios de aceite rastreados.

### G4 — Segurança
Responsável: `seguranca`.

Crítico/Alto não resolvido bloqueia release, salvo aceite formal de risco pelo responsável.

### G5 — QA
Responsável: `qa`.

Cálculo financeiro incorreto, perda de dados ou fluxo principal quebrado reprova.

### G6 — Relatório
Responsável: `relator`.

Só resume o estado real; não cria aprovação.

## Regra de independência

O agente que implementa não pode ser o único agente que valida.

- Desenvolvedor implementa.
- Segurança audita.
- QA valida.
- Relator comunica.

## Regra do Brain

O Brain é a fonte de verdade funcional/arquitetural.

Antes de cada tarefa relevante, ler:
- `brain-mensalidades-rateio/00-MOC.md`
- documentos relacionados;
- `brain-mensalidades-rateio/11-Decisoes.md`.

### Decisões

Nenhum agente deve transformar uma proposta em decisão oficial silenciosamente.

Use:
- `DECISÃO OFICIAL`;
- `PROPOSTA`;
- `DECISÃO PENDENTE`.

## Estrutura recomendada por feature

```text
docs/features/<feature-slug>/
├── 01-plano.md
├── 02-modelagem-dados.md
├── 03-ui-ux.md
├── 04-implementacao.md
├── 05-seguranca.md
├── 06-qa.md
└── 07-relatorio.md
```

Nem toda feature exige todos os arquivos. Preserve a numeração para facilitar auditoria.

## Ordem para correções

Quando Segurança ou QA encontrar problema:

1. registrar o achado;
2. devolver ao `desenvolvedor`;
3. desenvolvedor corrige;
4. agente que encontrou o problema revalida;
5. somente depois atualizar o status final.

## Princípio de menor alteração

Nenhum agente deve expandir o escopo silenciosamente.

Se encontrar oportunidade de melhoria fora da tarefa:
- documentar em `FORA DE ESCOPO`;
- não implementar;
- deixar para decisão posterior.
