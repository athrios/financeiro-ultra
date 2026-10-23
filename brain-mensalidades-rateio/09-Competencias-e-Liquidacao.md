---
type: process
project: Brain Mensalidades e Rateio
status: ativo
---

# Competências e Liquidação

## Estados

### Aberta

Aceita novos recebimentos e alterações permitidas.

### Em conferência

Fase de validação dos lançamentos e comprovantes.

### Apurada

Motor de rateio executado e compensações calculadas.

### Liquidada

Compensações concluídas e competência encerrada.

---

## Liquidação

Para liquidar:

1. Todos os recebimentos relevantes devem estar confirmados.
2. Pendências críticas devem estar resolvidas.
3. Compensações devem estar pagas ou justificadas.
4. Saldo global deve fechar em zero.

---

## Reabertura

Somente administrador.

Deve registrar:

- usuário;
- data/hora;
- motivo;
- estado anterior;
- impacto financeiro.

Após reabertura, uma nova apuração deve substituir a anterior mantendo histórico.

---

## Snapshot

No momento da liquidação, salvar snapshot da apuração:

- total recebido;
- recebido por parte;
- devido por parte;
- saldo por parte;
- compensações;
- parâmetros utilizados.

Isso permite auditoria histórica mesmo após alterações futuras de configuração.
