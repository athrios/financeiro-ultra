---
type: feature
project: Brain Mensalidades e Rateio
status: draft
---

# Importação e Leitura de Comprovantes

## Objetivo

Permitir que o usuário envie comprovantes e reduza o trabalho de lançamento manual.

## Formatos iniciais

- PDF
- JPG
- JPEG
- PNG

## Dados desejados

- valor;
- data;
- nome do pagador;
- CPF/CNPJ do pagador;
- nome do favorecido;
- CPF/CNPJ do favorecido;
- banco;
- TXID;
- EndToEnd;
- autenticação.

## Identificação do cliente

Ordem recomendada de força:

1. CNPJ exato.
2. CPF/CNPJ normalizado.
3. Alias cadastrado.
4. Nome exato normalizado.
5. Similaridade textual.

## Identificação do recebedor

Ordem recomendada:

1. Documento.
2. Identificador bancário.
3. Alias.
4. Nome normalizado.

## Score de confiança

Cada extração deve receber nível de confiança.

### Alta confiança

Pode ser pré-preenchida para confirmação rápida.

### Média confiança

Exige conferência.

### Baixa confiança

Vai para Pendências.

## Duplicidade

Verificar:

- hash do arquivo;
- EndToEnd;
- TXID;
- valor;
- data;
- cliente;
- recebedor.

## Regra crítica

OCR/leitura automática é mecanismo de sugestão e automação, não fonte absoluta de verdade.

Registros ambíguos devem exigir revisão humana.
