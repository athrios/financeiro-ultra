---
type: decisions
project: Brain Mensalidades e Rateio
status: ativo
---

# Decisões

## RAT-D001 — Split gerencial

O produto será tratado inicialmente como split gerencial pós-recebimento.

O sistema não movimenta dinheiro automaticamente entre as partes.

---

## RAT-D002 — Separação de conceitos

Pagador, recebedor e beneficiário econômico serão entidades/conceitos separados.

---

## RAT-D003 — Competência como unidade de fechamento

Toda apuração e liquidação acontecerá dentro de uma competência.

---

## RAT-D004 — Percentual padrão

As partes possuem percentuais padrão globais.

> **Revogada (22/10/2026)** por [[#RAT-D015 — Divisão igualitária por padrão]]. Não existe percentual padrão configurado por sócio: "o percentual padrão é o da matemática", isto é, 1/n entre os sócios indicados em cada cliente.

---

## RAT-D005 — Participação por cliente

O cliente define quais partes participam de sua receita.

Quando apenas parte das partes participar, os percentuais serão normalizados proporcionalmente.

> **Revisada (22/10/2026)** por [[#RAT-D015 — Divisão igualitária por padrão]]: a normalização proporcional deixou de ser a regra padrão. Continua valendo que o cliente define quais partes participam de sua receita.

---

## RAT-D006 — Snapshot do rateio

Cada recebimento salvará o percentual efetivamente aplicado em `receipt_allocations`.

Alterações futuras nos percentuais não reescrevem o histórico automaticamente.

---

## RAT-D007 — Transferências externas

As compensações serão realizadas fora do sistema na primeira versão.

O admin apenas confirma a liquidação.

---

## RAT-D008 — Reconhecimento assistido

A leitura de comprovantes poderá sugerir cliente e recebedor, mas casos ambíguos exigem revisão humana.

---

## RAT-D009 — Auditoria obrigatória

Alterações financeiras relevantes devem ser auditáveis.

---

## RAT-D010 — Empresa única no MVP

O MVP atende apenas uma empresa. Não haverá multiempresa/multiorganização.

Consequência: os dados não são particionados por organização; o acesso é controlado por perfil. Uma eventual evolução para multiempresa exigirá migração planejada.

Origem: responsável pelo produto, 22/10/2026 (FND-001, P-01).

---

## RAT-D011 — Perfis de acesso

Perfis do sistema: Administrador, Operador e Visualizador, conforme [[10-Seguranca-e-Auditoria#Perfis]].

As partes — no sistema, **sócios** (ver [[#RAT-D017 — Vocabulário do sistema]]) — terão login próprio, vinculado ao seu cadastro de sócio ([[02-Dominio#Parte|Parte]]). O que cada sócio pode ver e fazer ainda será definido.

Origem: responsável pelo produto, 22/10/2026 (FND-001, P-02).

---

## RAT-D012 — Nova linha de base técnica

O código criado em 07/10/2026, anterior a este Brain, não será evoluído diretamente. Em vez disso:

- a base do banco será refeita uma única vez, alinhada a este Brain, antes do primeiro ambiente publicado;
- a infraestrutura existente (login, permissões, auditoria, cálculos em centavos, testes) será reaproveitada;
- o código com regras divergentes será preservado como referência;
- nada será removido sem aprovação.

Origem: responsável pelo produto, 22/10/2026 (FND-001, P-03).

---

## RAT-D013 — Nome do produto

O produto se chama **Financeiro Ultra**.

Origem: responsável pelo produto, 22/10/2026 (FND-001, P-04).

---

## RAT-D014 — Repositório

O código será versionado em repositório GitHub, criado pelo responsável pelo produto.

Origem: responsável pelo produto, 22/10/2026 (FND-001, P-05).

---

## RAT-D015 — Divisão igualitária por padrão

O valor de cada cliente é dividido **em partes iguais entre as partes indicadas naquele cliente**. A divisão não é feita entre todas as partes cadastradas, e não há normalização por percentuais.

**Exemplo:** se, de 5 partes cadastradas, apenas 3 forem indicadas no cliente, o valor daquele cliente é dividido por 3, uma parte igual para cada uma.

Revisa [[#RAT-D005 — Participação por cliente]] (a normalização proporcional deixa de ser a regra) e revoga [[#RAT-D004 — Percentual padrão]].

Falas do responsável (22/10/2026):

1. "A divisão é igualitária caso o admin não preencha com valores específicos a divisão entre as partes." (FND-001, P-06)
2. "Na verdade a lógica de divisão estabelecida antes está correta. Deve ser feita por partes iguais. Se de 5 partes cadastradas apenas 3 forem indicadas no cliente, então o valor daquele cliente será dividido por 3, uma parte igual para cada parte." (FND-001, P-06b)

3. "O percentual padrão é o da matemática. Se em um cliente tiverem 2 partes indicadas, então será dividido por 2, ou seja, 50% pra cada; se em outro cliente forem indicados 3 partes, então dividido por 3, 33% pra cada; se em outro cliente forem indicados 4 partes, então 25% pra cada." (FND-001, P-06a)

4. "Sempre 1/n." (FND-001, P-06a restante — pergunta: "O administrador poderá definir, para um cliente específico, uma divisão diferente da igual (ex.: 70% / 30%)? Ou é sempre 1/n?")

**Regra final:** o valor de cada cliente é sempre dividido em **1/n**, sendo n o número de sócios indicados naquele cliente. Exemplos: 2 sócios → 50% cada; 3 → 33,33…% cada; 4 → 25% cada.

- Não existe percentual padrão configurado por sócio: [[#RAT-D004 — Percentual padrão]] está revogada.
- Não existe divisão própria por cliente (fala 4). Os "valores específicos" mencionados na fala 1 não serão implementados.
- No fechamento em centavos, a diferença entre as parcelas é no máximo 1 centavo (ver [[07-Motor-de-Rateio#Arredondamento]]).

Origem: responsável pelo produto, 22/10/2026 (FND-001, P-06, P-06b e P-06a).

---

## RAT-D016 — Hospedagem e stack

A aplicação será hospedada na **Vercel**. O banco de dados ficará em um projeto **Supabase** criado pelo responsável.

Consolida a stack definida pelo responsável na especificação de 07/10/2026 ("não substituir a stack sem autorização"): Next.js, TypeScript, Supabase (PostgreSQL e Supabase Auth), Tailwind CSS e shadcn/ui.

O uso do Supabase Storage para os comprovantes é proposta técnica do plano FND-001, não decisão desta entrada.

Origem: responsável pelo produto, 22/10/2026 (FND-001, P-05b), e especificação de 07/10/2026.

---

## RAT-D017 — Vocabulário do sistema

A entidade chamada **Parte** neste Brain chama-se **Sócio** no sistema: interface, código e banco. Os demais termos do Brain são mantidos (Cliente, Recebedor, Competência, Recebimento, Compensação, Liquidação, Comprovante).

Os termos do código de 07/10 ("Indicador", "Empresa") não serão usados.

Origem: responsável pelo produto, 22/10/2026 (FND-001, P-04b): "Parte deve ser chamado de Sócio, os demais pode manter".

---

## RAT-D018 — Região do banco

O projeto Supabase será criado na região **São Paulo (`sa-east-1`)**. A região é escolhida na criação do projeto e não pode ser trocada depois.

Origem: responsável pelo produto, 22/10/2026 (FND-001, P-05c1).

---

## RAT-D019 — Dados de teste fictícios

Seeds, testes e exemplos usam **somente nomes fictícios** (sócios, clientes, e-mails e aliases). Nenhum nome real é versionado.

Origem: responsável pelo produto, 22/10/2026 ("Nomes fictícios para teste").

---

## RAT-D020 — Postura de segurança para uso interno

O sistema **não será público**: será usado internamente, pela equipe e pelos sócios, e não precisa de muitas camadas de segurança.

Fica o básico, que é a base do sistema: login só por convite, papéis garantidos no banco ([[#RAT-D011 — Perfis de acesso]]), auditoria ([[#RAT-D009 — Auditoria obrigatória]]), comprovantes em área privada e segredos fora do código. Mesmo com uso interno, a hospedagem na Vercel ([[#RAT-D016 — Hospedagem e stack]]) deixa o endereço acessível pela internet. Por isso o login e as permissões continuam sendo a barreira.

Ficam fora, salvo nova decisão: CAPTCHA e limite próprio de tentativas de login, política de conteúdo do navegador (CSP) mais rígida, proteção contra descobrir se um e-mail tem conta, e-mails de aviso (como o de senha alterada) e outras camadas extras. A revisão de segurança antes de publicar (E8b do plano FND-001) passa a ser uma conferência curta da configuração da Vercel e do Supabase.

Origem: responsável pelo produto, 23/10/2026 (FND-001): "o sistema não será público, será usado internamente, não precisa de muitas camadas de segurança". A divisão entre o que fica e o que sai foi proposta pelo orquestrador na mesma data e apresentada ao responsável.

---

## Decisões pendentes

- **P-02b** — Escopo de acesso dos sócios com login próprio ([[#RAT-D011 — Perfis de acesso]]).
- **P-05c2** — Banco separado para homologação e planos pagos (Vercel e Supabase) antes de entrarem dados reais.
- **P-24** — Gestão de usuários pela aplicação (exige a chave secreta no servidor) ou pelo painel do Supabase?
- **P-25** — Provedor de SMTP para os e-mails de convite e de recuperação de senha, e domínio da aplicação.
- **P-08** — Recebedor será sempre uma Parte ou poderá existir recebedor intermediário?
- **P-10** — Um cliente poderá ter mais de uma mensalidade na mesma competência?
- **P-09** — Será permitido recebimento parcial?
- **P-11** — Será permitido estorno?
- **P-12** — A competência poderá ter data de vencimento por cliente?
