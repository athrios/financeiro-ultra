---
type: security
project: Brain Mensalidades e Rateio
status: draft
---

# Segurança e Auditoria

> **Nota (22/10/2026)** — leitura deste rascunho à luz das decisões:
> - os perfis Administrador, Operador e Visualizador foram oficializados, e os sócios terão login próprio ([[11-Decisoes#RAT-D011 — Perfis de acesso]]);
> - "parte" = **Sócio** ([[11-Decisoes#RAT-D017 — Vocabulário do sistema]]);
> - "altera percentuais" e "alteração de percentual" não se aplicam mais: a divisão é sempre 1/n ([[11-Decisoes#RAT-D015 — Divisão igualitária por padrão]]);
> - o produto atende uma única empresa, sem controle por organização ([[11-Decisoes#RAT-D010 — Empresa única no MVP]]).

## Perfis

### Administrador

- configura partes;
- altera percentuais;
- gerencia clientes;
- apura;
- liquida;
- reabre competências.

### Operador

- cadastra recebimentos;
- importa comprovantes;
- revisa reconhecimento;
- consulta clientes.

### Visualizador

- somente leitura.

---

## Auditoria obrigatória

Registrar:

- alteração de percentual;
- inclusão/exclusão de parte;
- alteração de cliente;
- alteração de recebedor;
- alteração de valor;
- exclusão de recebimento;
- apuração;
- liquidação;
- reabertura.

## Princípios

- menor privilégio;
- trilha imutável de eventos sensíveis;
- timestamps de servidor;
- armazenamento seguro dos comprovantes;
- controle de acesso por organização, caso o produto evolua para multiempresa.
