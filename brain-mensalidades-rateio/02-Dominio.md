---
type: domain
project: Brain Mensalidades e Rateio
status: ativo
---

# Domínio

## Cliente

Empresa pagadora da mensalidade.

### Atributos principais

- nome/razão social;
- CNPJ;
- valor padrão da mensalidade;
- status;
- partes participantes;
- aliases e identificadores;
- observações.

Relaciona-se com [[03-Regras-de-Negocio#RN-004 — Participação por cliente]].

---

## Parte

Pessoa física, jurídica ou entidade com participação econômica nos recebimentos.

### Atributos principais

- nome;
- percentual padrão;
- CPF/CNPJ opcional;
- status;
- aliases de reconhecimento;
- identificadores bancários.

A soma das partes ativas deve respeitar [[03-Regras-de-Negocio#RN-003 — Percentuais]].

> **Revisado (22/10/2026)** — ver [[11-Decisoes#RAT-D015 — Divisão igualitária por padrão]] e [[11-Decisoes#RAT-D004 — Percentual padrão]] (revogada). O atributo "percentual padrão" deixou de existir: o percentual de cada sócio em um cliente é 1/n dos sócios indicados naquele cliente.
>
> **Vocabulário** ([[11-Decisoes#RAT-D017 — Vocabulário do sistema]]): no sistema, a Parte chama-se **Sócio**.

---

## Recebedor

Entidade que efetivamente recebeu o pagamento.

Normalmente será vinculada a uma [[02-Dominio#Parte|Parte]], mas deve ser modelada separadamente para permitir múltiplas contas, nomes bancários ou titulares vinculados à mesma parte.

---

## Recebimento

Registro financeiro de um pagamento identificado.

### Contém

- cliente;
- competência;
- valor;
- data;
- recebedor;
- origem;
- comprovante;
- status;
- metadados de identificação;
- usuário responsável.

---

## Competência

Período contábil/gerencial em que os recebimentos serão apurados.

Estados:

- aberta;
- em conferência;
- apurada;
- liquidada.

Ver [[09-Competencias-e-Liquidacao]].

---

## Compensação

Obrigação calculada entre duas partes após a apuração.

Exemplo:

Parte A → Parte B → R$ 1.000,00.

---

## Liquidação

Confirmação administrativa de que as compensações necessárias foram executadas externamente e os saldos foram zerados.

---

## Comprovante

Arquivo PDF ou imagem enviado ao sistema para extração de:

- pagador;
- recebedor;
- valor;
- data;
- documento;
- identificador bancário;
- TXID/EndToEnd quando disponível.

Ver [[08-Importacao-e-Leitura-de-Comprovantes]].
