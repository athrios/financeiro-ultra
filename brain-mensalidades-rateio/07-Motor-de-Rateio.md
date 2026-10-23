---
type: engine
project: Brain Mensalidades e Rateio
status: ativo
---

# Motor de Rateio

## Objetivo

Converter os recebimentos efetivos em direitos econômicos e posteriormente em compensações entre as partes.

---

## Etapa 1 — Determinar partes elegíveis

Consultar [[06-Dados#`client_parts`]] do cliente.

---

## Etapa 2 — Determinar percentuais efetivos

> **Revisada (22/10/2026)** por [[11-Decisoes#RAT-D015 — Divisão igualitária por padrão]]: percentual efetivo = **1/n** entre os sócios indicados no cliente (2 → 50%, 3 → 33,33…%, 4 → 25%). O valor é rateado pela fração exata, com o centavo residual tratado conforme "Arredondamento" abaixo; as parcelas diferem no máximo 1 centavo. Não há percentual configurado, divisão própria por cliente nem normalização: é sempre 1/n. O trecho abaixo ("percentual específico por cliente") não se aplica mais.

Se houver percentual específico por cliente, utilizar o percentual específico.

Caso contrário, utilizar o percentual padrão normalizado entre as partes elegíveis.

---

## Etapa 3 — Alocar o recebimento

Para cada parte:

`alocacao = valor_recebido × percentual_efetivo`

Salvar o resultado em [[06-Dados#`receipt_allocations`]].

---

## Etapa 4 — Apuração por parte

### Recebido

Soma dos recebimentos cujo recebedor está associado à parte.

### Devido

Soma das alocações econômicas da parte.

### Saldo da parte

`saldo = recebido - devido`

---

## Etapa 5 — Gerar compensações

Separar:

- credores: saldo < 0;
- devedores: saldo > 0.

Gerar transferências entre devedores e credores até zerar os saldos.

### Exemplo

A = +2.000  
B = -1.000  
C = -1.000

Compensações:

A → B = 1.000  
A → C = 1.000

---

## Arredondamento

Os valores devem ser calculados com precisão decimal adequada e fechados em centavos.

Diferença residual de arredondamento deve ser tratada deterministicamente e registrada.

Nunca utilizar `float` binário para cálculos monetários críticos.
