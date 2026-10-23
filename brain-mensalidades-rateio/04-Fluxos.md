---
type: flows
project: Brain Mensalidades e Rateio
status: ativo
---

# Fluxos

## Fluxo 1 — Configuração inicial

> **Revisado (22/10/2026)** por [[11-Decisoes#RAT-D015 — Divisão igualitária por padrão]]: os passos 3 e 4 deixaram de existir. Não há percentual padrão configurado por sócio ([[11-Decisoes#RAT-D004 — Percentual padrão]] revogada); a divisão é 1/n entre os sócios indicados em cada cliente.

1. Admin acessa Configurações.
2. Cadastra as partes.
3. Define os percentuais padrão.
4. Sistema valida total de 100%.
5. Admin cadastra aliases e identificadores bancários.

Relacionado a [[03-Regras-de-Negocio#RN-003 — Percentuais]].

---

## Fluxo 2 — Cadastro de clientes

1. Admin cadastra manualmente ou importa planilha.
2. Sistema normaliza CNPJ.
3. Sistema verifica duplicidades.
4. Admin define quais partes participam de cada cliente.
5. Sistema calcula os percentuais efetivos aplicáveis — 1/n entre os sócios indicados (2 → 50%, 3 → 33,33…%, 4 → 25%), conforme [[11-Decisoes#RAT-D015 — Divisão igualitária por padrão]] (revisão de 22/10/2026). É sempre 1/n; não há divisão própria por cliente.

---

## Fluxo 3 — Lançamento manual

1. Usuário seleciona competência.
2. Seleciona cliente.
3. Informa valor.
4. Informa data.
5. Seleciona recebedor.
6. Sistema registra o recebimento.
7. Motor de rateio calcula os direitos econômicos.

---

## Fluxo 4 — Importação de comprovantes

1. Usuário envia PDF/JPG/PNG.
2. Sistema extrai dados.
3. Sistema tenta identificar cliente.
4. Sistema tenta identificar recebedor.
5. Sistema verifica duplicidade.
6. Registro recebe score de confiança.
7. Alta confiança → sugestão pronta para confirmação.
8. Baixa confiança → Pendências de Reconhecimento.
9. Usuário revisa e confirma.
10. Recebimento é criado.

Ver [[08-Importacao-e-Leitura-de-Comprovantes]].

---

## Fluxo 5 — Apuração

1. Admin seleciona a competência.
2. Sistema soma os recebimentos confirmados.
3. Calcula total efetivamente recebido por parte.
4. Calcula total devido por parte.
5. Calcula saldos.
6. Gera compensações.
7. Competência passa para `apurada`.

---

## Fluxo 6 — Liquidação

1. Partes realizam transferências fora do sistema.
2. Admin marca cada compensação como paga.
3. Opcionalmente anexa comprovantes.
4. Sistema verifica saldos.
5. Admin liquida a competência.
6. Sistema registra data, usuário e snapshot da apuração.

Ver [[09-Competencias-e-Liquidacao]].
