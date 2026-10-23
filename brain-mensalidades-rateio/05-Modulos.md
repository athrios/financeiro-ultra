---
type: modules
project: Brain Mensalidades e Rateio
status: ativo
---

# Módulos

> **Nota (22/10/2026)** — leitura deste documento à luz das decisões:
> - "parte(s)" = **Sócio(s)** no sistema ([[11-Decisoes#RAT-D017 — Vocabulário do sistema]]);
> - o submódulo **"Regras de divisão" deixou de existir**, porque a divisão é sempre 1/n ([[11-Decisoes#RAT-D015 — Divisão igualitária por padrão]]);
> - o cadastro de **Recebedores** (entidade própria — [[11-Decisoes#RAT-D002 — Separação de conceitos]]) ainda não tem lugar definido aqui; a posição na navegação é pendência de UI (FND-001, 03-ui-ux).

## Dashboard

Exibe:

- total recebido;
- total por parte;
- total devido por parte;
- saldo por parte;
- compensações pendentes;
- mensalidades recebidas;
- clientes pendentes;
- comprovantes em revisão.

---

## Recebimentos

Tabela principal:

- cliente;
- CNPJ;
- competência;
- valor;
- recebedor;
- partes;
- data;
- origem;
- status.

---

## Clientes

Permite:

- cadastro manual;
- importação por planilha;
- edição;
- ativação/inativação;
- definição das partes participantes;
- aliases.

---

## Importar comprovantes

Upload de:

- PDF;
- JPG;
- JPEG;
- PNG.

Relacionado a [[08-Importacao-e-Leitura-de-Comprovantes]].

---

## Pendências de reconhecimento

Fila para comprovantes cujo reconhecimento automático não foi suficiente.

---

## Apuração

Concentra:

- recebido por parte;
- devido por parte;
- saldo;
- inconsistências;
- fechamento.

---

## Compensações

Mostra:

- origem;
- destino;
- valor;
- status;
- comprovante;
- data da liquidação.

---

## Competências

Gerencia:

- abertura;
- conferência;
- apuração;
- liquidação;
- reabertura.

---

## Configurações

Submódulos:

- Partes;
- Usuários;
- Aliases;
- Regras de divisão;
- Parâmetros do sistema.
