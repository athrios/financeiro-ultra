---
type: business-rules
project: Brain Mensalidades e Rateio
status: ativo
---

# Regras de Negócio

## RN-001 — Separação conceitual

Pagador, recebedor e beneficiário econômico são conceitos distintos e não devem ser armazenados como um único atributo.

---

## RN-002 — Competência obrigatória

Todo recebimento confirmado deve pertencer a uma [[02-Dominio#Competência|Competência]].

---

## RN-003 — Percentuais

> **Revisada (22/10/2026)** por [[11-Decisoes#RAT-D015 — Divisão igualitária por padrão]]: não há percentual padrão configurado por sócio ([[11-Decisoes#RAT-D004 — Percentual padrão]] revogada). "O percentual padrão é o da matemática": a divisão é **sempre** 1/n entre os sócios indicados em cada cliente. Não há percentuais configuráveis.

As partes possuem percentuais padrão.

A configuração padrão deve totalizar 100% antes de ser considerada válida.

---

## RN-004 — Participação por cliente

> **Revisada (22/10/2026)** por [[11-Decisoes#RAT-D015 — Divisão igualitária por padrão]]: o valor do cliente é dividido em partes iguais entre os sócios indicados nele, ou seja, 1/n. Ex.: 5 sócios cadastrados, 3 indicados no cliente → valor ÷ 3; 2 indicados → 50% cada; 4 indicados → 25% cada. A normalização proporcional abaixo deixou de ser a regra; o exemplo é mantido apenas como histórico.

Cada cliente pode possuir um subconjunto das partes cadastradas.

Quando nem todas as partes participarem daquele cliente, os percentuais padrão serão normalizados proporcionalmente entre as partes selecionadas.

### Exemplo

Percentuais padrão:

- A = 50%
- B = 30%
- C = 20%

Cliente participa apenas de A e C.

Base ativa = 70%.

Percentuais efetivos:

- A = 50 / 70 = 71,4286%
- C = 20 / 70 = 28,5714%

A soma efetiva deve resultar em 100%.

---

## RN-005 — Percentual específico por cliente

> **Revogada (22/10/2026)** por [[11-Decisoes#RAT-D015 — Divisão igualitária por padrão]]: não haverá percentual específico por cliente. A divisão é sempre 1/n entre os sócios indicados.

Evolução prevista: permitir percentuais próprios por cliente, sobrescrevendo a configuração global.

Essa regra deve ser explicitamente ativada e auditada.

---

## RN-006 — Recebimento manual

Um recebimento manual exige:

- competência;
- cliente;
- valor;
- data;
- recebedor.

---

## RN-007 — Recebimento por comprovante

O sistema poderá sugerir automaticamente cliente, valor, data e recebedor.

Reconhecimentos ambíguos devem ser encaminhados para revisão humana.

---

## RN-008 — Duplicidade

Antes de confirmar um comprovante, verificar possíveis duplicidades por:

- hash;
- valor;
- data;
- cliente;
- recebedor;
- TXID;
- EndToEnd;
- autenticação bancária.

---

## RN-009 — Cálculo do valor devido

Para cada recebimento:

`valor_devido_parte = valor_recebimento × percentual_efetivo_da_parte`

---

## RN-010 — Saldo

Para cada parte na competência:

`saldo = valor_recebido - valor_devido`

Interpretação:

- saldo > 0 → parte deve transferir;
- saldo < 0 → parte deve receber;
- saldo = 0 → parte conciliada.

---

## RN-011 — Soma zero

Após a apuração:

`Σ saldos das partes = 0`

Ressalvadas diferenças controladas de arredondamento.

---

## RN-012 — Compensações

O sistema deve gerar instruções de transferência entre partes buscando reduzir o número de movimentos necessários.

---

## RN-013 — Liquidação

Uma competência somente pode ser liquidada quando todas as compensações estiverem concluídas ou formalmente justificadas.

---

## RN-014 — Imutabilidade pós-liquidação

Recebimentos de competência liquidada não devem ser alterados diretamente.

Correções exigem reabertura controlada e auditada.

---

## RN-015 — Auditoria

Alterações em percentuais, recebimentos, cliente, recebedor, competência e liquidação devem gerar histórico.

Ver [[10-Seguranca-e-Auditoria]].
