---
type: overview
project: Brain Mensalidades e Rateio
status: ativo
---

# Visão Geral

## Propósito

Controlar mensalidades recebidas por uma empresa ou grupo empresarial onde os valores pertencem economicamente a diferentes partes segundo percentuais parametrizados.

> **Nota (22/10/2026)** — no sistema, as partes são **sócios** ([[11-Decisoes#RAT-D017 — Vocabulário do sistema]]). A empresa é única ([[11-Decisoes#RAT-D010 — Empresa única no MVP]]). Os percentuais não são parametrizados: a divisão é sempre 1/n entre os sócios indicados em cada cliente ([[11-Decisoes#RAT-D015 — Divisão igualitária por padrão]]).

O sistema deve responder, por competência:

1. Quanto foi recebido no total.
2. Quanto cada parte efetivamente recebeu.
3. Quanto cada parte deveria receber.
4. Qual a diferença entre recebido e devido.
5. Quem deve transferir para quem.
6. Se a competência está totalmente conciliada e liquidada.

## Princípio estrutural

O sistema deve manter separados:

- quem pagou;
- quem recebeu;
- quem possui direito econômico sobre o valor.

Essa separação é a base do [[07-Motor-de-Rateio]].

## Entradas principais

- Cadastro manual de clientes.
- Importação de clientes por planilha.
- Lançamento manual de mensalidades.
- Importação de comprovantes em PDF ou imagem.

## Saídas principais

- Dashboard por competência.
- Dashboard consolidado.
- Apuração por parte.
- Lista de compensações.
- Histórico de liquidação.
- Trilha de auditoria.

## Relações

- Regras: [[03-Regras-de-Negocio]]
- Fluxos: [[04-Fluxos]]
- Dados: [[06-Dados]]
- Módulos: [[05-Modulos]]
