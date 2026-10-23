---
type: moc
project: Brain Mensalidades e Rateio
status: ativo
---

# Brain — Mensalidades e Rateio

## Navegação principal

- [[01-Visao-Geral]]
- [[02-Dominio]]
- [[03-Regras-de-Negocio]]
- [[04-Fluxos]]
- [[05-Modulos]]
- [[06-Dados]]
- [[07-Motor-de-Rateio]]
- [[08-Importacao-e-Leitura-de-Comprovantes]]
- [[09-Competencias-e-Liquidacao]]
- [[10-Seguranca-e-Auditoria]]
- [[11-Decisoes]]
- [[12-Roadmap]]
- [[13-Agentes]]

## Objetivo

Este vault representa o cérebro funcional e técnico do sistema de gerenciamento de mensalidades recebidas com divisão parametrizada entre partes.

O sistema não executa necessariamente o split financeiro no momento da transação. Ele registra quem efetivamente recebeu, calcula quanto cada parte possui de direito econômico e gera a compensação necessária entre as partes.

> **Nota (22/10/2026)** — no sistema, "Parte" chama-se **Sócio**, e a divisão é sempre 1/n entre os sócios indicados no cliente (não é parametrizada). Ver [[11-Decisoes#RAT-D017 — Vocabulário do sistema]] e [[11-Decisoes#RAT-D015 — Divisão igualitária por padrão]].

## Conceitos centrais

- [[02-Dominio#Cliente|Cliente]]
- [[02-Dominio#Parte|Parte]]
- [[02-Dominio#Recebedor|Recebedor]]
- [[02-Dominio#Recebimento|Recebimento]]
- [[02-Dominio#Competência|Competência]]
- [[07-Motor-de-Rateio#Saldo da parte|Saldo da parte]]
