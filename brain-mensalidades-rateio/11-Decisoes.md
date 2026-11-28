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

> **Revisada (25/11/2026)** por [[#RAT-D022 — Hospedagem no Render]]: a aplicação passa a ser hospedada no Render. A stack e o banco no Supabase continuam.

---

## RAT-D017 — Vocabulário do sistema

A entidade chamada **Parte** neste Brain chama-se **Sócio** no sistema: interface, código e banco. Os demais termos do Brain são mantidos (Cliente, Recebedor, Competência, Recebimento, Compensação, Liquidação, Comprovante).

Os termos do código de 07/10 ("Indicador", "Empresa") não serão usados.

Origem: responsável pelo produto, 22/10/2026 (FND-001, P-04b): "Parte deve ser chamado de Sócio, os demais pode manter".

> **Complemento (26/11/2026, CAD-001):** o tipo do cliente aparece na tela só como o tipo do documento, **"CPF" ou "CNPJ"**. Não se usa "Pessoa física", "Pessoa jurídica" nem "Empresa". Cliente sem documento fica sem tipo. Resposta escolhida pelo responsável: "Só 'CPF' / 'CNPJ'".

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

Fica o básico, que é a base do sistema: login só por convite, papéis garantidos no banco ([[#RAT-D011 — Perfis de acesso]]), auditoria ([[#RAT-D009 — Auditoria obrigatória]]), comprovantes em área privada e segredos fora do código. Mesmo com uso interno, a hospedagem ([[#RAT-D022 — Hospedagem no Render]]; antes, a Vercel da [[#RAT-D016 — Hospedagem e stack]]) deixa o endereço acessível pela internet. Por isso o login e as permissões continuam sendo a barreira.

Ficam fora, salvo nova decisão: CAPTCHA e limite próprio de tentativas de login, política de conteúdo do navegador (CSP) mais rígida, proteção contra descobrir se um e-mail tem conta, e-mails de aviso (como o de senha alterada) e outras camadas extras. A revisão de segurança antes de publicar (E8b do plano FND-001) passa a ser uma conferência curta da configuração da hospedagem e do Supabase.

Origem: responsável pelo produto, 23/10/2026 (FND-001): "o sistema não será público, será usado internamente, não precisa de muitas camadas de segurança". A divisão entre o que fica e o que sai foi proposta pelo orquestrador na mesma data e apresentada ao responsável.

---

## RAT-D021 — Motivo opcional nas ações auditadas

O motivo **não é obrigatório**. As ações auditadas aceitam um motivo e o gravam na auditoria quando ele é informado, mas não são bloqueadas sem ele. A auditoria continua registrando quem fez, o quê, quando e de onde ([[#RAT-D009 — Auditoria obrigatória]]).

Vale para as mudanças de acesso e a exclusão de comprovante (FND-001) e para a reabertura de competência ([[09-Competencias-e-Liquidacao#Reabertura]]), que registra o motivo quando informado.

Origem: responsável pelo produto, 23/10/2026 (FND-001): "motivo não precisa de texto obrigatório". A aplicação à reabertura de competência é leitura do orquestrador, apresentada ao responsável.

---

## RAT-D022 — Hospedagem no Render

A aplicação será hospedada no **Render**, como serviço web, no lugar da Vercel. Revisa [[#RAT-D016 — Hospedagem e stack]] só quanto à hospedagem: a stack e o banco no Supabase em São Paulo ([[#RAT-D018 — Região do banco]]) continuam.

- O Render não tem região na América do Sul. O serviço fica em **Virginia (EUA)**, a região disponível mais próxima do banco. Consequência: cada consulta ao banco percorre essa distância.
- A configuração do serviço fica no próprio repositório (arquivo `render.yaml`).
- A publicação em produção é **manual**, feita pelo responsável.

Origem: responsável pelo produto, 24/11/2026 (FND-001, E9): "mudei de provedor... vou usar o render". Em 25/11/2026 o responsável escolheu a configuração pelo arquivo `render.yaml`. A região Virginia e a publicação manual foram propostas pelo orquestrador no plano da E9 e aprovadas pelo responsável na mesma data.

---

## RAT-D023 — Recebedor sempre ligado a um sócio

Todo **recebedor** pertence a um **sócio**. Um sócio pode ter vários recebedores, como contas, nomes bancários ou titulares ([[02-Dominio#Recebedor]]). Não existe recebedor de terceiro nem intermediário.

O cadastro de recebedores entra junto com os de sócios e clientes (CAD-001), antes do módulo de Recebimentos.

**Dados do recebedor:** o nome do titular é obrigatório. Os dados abaixo são opcionais e servem para reconhecer quem recebeu nos comprovantes ([[08-Importacao-e-Leitura-de-Comprovantes]]):
- variações do nome;
- chave Pix;
- banco, agência e conta.

O CPF ou CNPJ do titular **não** é guardado como documento. A **chave Pix** pode ser um CPF ou CNPJ; nesse caso, ele fica guardado só como chave Pix.

Quem tem acesso de leitura vê os documentos dos clientes e as chaves Pix **completos**, sem máscara (uso interno, [[#RAT-D020 — Postura de segurança para uso interno]]).

Responde à pendência P-08.

Origem: responsável pelo produto, 25/11/2026 (CAD-001, G0). Respostas escolhidas:
- "Sim, agora": os recebedores entram nesta feature;
- "Sempre um sócio": o recebedor pertence a um sócio;
- "Chave Pix, Variações do nome, Banco, agência e conta": dados do recebedor. O "CPF/CNPJ do titular", também oferecido, não foi escolhido.
- "Aceitar como chave Pix": a chave Pix pode ser CPF ou CNPJ.
- "Ver completo": nenhum dado é mascarado para Operador e Visualizador.

---

## RAT-D024 — Documento do cliente

O cliente pode ser **pessoa física (CPF)** ou **empresa (CNPJ)**. Revisa [[02-Dominio#Cliente]], que o definia só como empresa.

- O documento é **opcional**. Um cliente sem documento é identificado pelo nome.
- Quando informado, o documento **não pode se repetir** em outro cliente.
- O CNPJ é aceito nos dois formatos: o numérico e o **alfanumérico**, emitido desde julho de 2026. Responde à pendência P-13 do plano da FND-001.
- **Aviso de possível cliente duplicado:** o aviso não bloqueia; quem está salvando pode confirmar e seguir. Ao salvar um cliente, com ou sem documento (o aviso é mais útil para quem não tem), ele aparece em dois casos:
  - já existe outro cliente, ativo ou inativo, com o **mesmo nome** depois de normalizado, ou com um apelido ativo igual a esse nome. Regra R-C15 do plano da CAD-001;
  - um **apelido** do cliente é igual ao nome ou ao nome fantasia de outro cliente.

Origem: responsável pelo produto, 25/11/2026 (CAD-001, G0). Respostas escolhidas:
- "Sim, os dois formatos";
- "CNPJ ou CPF";
- "Opcional";
- "Não pode repetir".

A unicidade vale também contra clientes inativos: um cliente que volta é reativado. Essa leitura é do orquestrador e foi apresentada ao responsável.

O aviso por apelido foi confirmado pelo responsável em 26/11/2026 (CAD-001, implementação): "sim", em resposta à pergunta se um apelido de cliente igual ao nome de outro cliente deve gerar o aviso de possível duplicado.

Na mesma data, o responsável confirmou a redação do aviso: escolheu "O do plano/código", com o aviso para qualquer cliente com o mesmo nome normalizado, com ou sem documento, e o nome fantasia contando como nome. Isso corrigiu uma primeira redação do orquestrador, que restringia o aviso a clientes sem documento.

---

## RAT-D025 — Regras do cadastro de sócios e clientes

- **Inativação do sócio:**
  - Um sócio indicado em qualquer cliente, **ativo ou inativo**, não pode ser inativado. Primeiro ele é retirado desses clientes; o sistema mostra a lista. Assim, um cliente reativado nunca volta com um sócio inativo.
  - Os recebedores ativos do sócio são inativados **junto** com ele: o sistema mostra a lista e pede confirmação.
- **Cliente ativo sempre tem sócio:** pelo menos um sócio indicado.
- **Mensalidade obrigatória:** o valor padrão da mensalidade é obrigatório, maior que zero e editável.
- **Troca de sócios de um cliente:** vale **a partir do momento da alteração**. O que já foi recebido não muda ([[#RAT-D006 — Snapshot do rateio]]), e a troca fica na auditoria ([[#RAT-D009 — Auditoria obrigatória]]).
- **Sem documento do sócio:** o sócio não guarda CPF nem CNPJ, só nome e apelidos, para guardar menos dado pessoal.

Origem: responsável pelo produto, 25/11/2026 (CAD-001, G0). Em todos os itens, o responsável escolheu a recomendação do plano:
- "Não, retirar antes";
- "Sim, maior que zero";
- "A partir de agora";
- "Não, só nome e apelidos";
- "Sim, sai de todos": a retirada vale também para os clientes inativos;
- "Inativar junto": os recebedores são inativados com o sócio.

---

## RAT-D026 — Limites de itens por cadastro

- **Sócio:** até 2 apelidos ativos.
- **Cliente:** até 2 apelidos ativos do tipo nome e até 2 do tipo documento (CPF ou CNPJ). Cada tipo tem o próprio limite.
- **Recebedor:** até 30 variações do nome, 10 chaves Pix e 10 contas bancárias ativas.
- **Contam só os itens ativos.** O cadastro não apaga itens, só os inativa. Numa lista cheia, para incluir ou reativar um item é preciso antes inativar outro.

Contexto: na validação da CAD-001 (QA-CAD-07), listas com milhares de itens estouravam o tempo limite do banco. O desenvolvedor propôs limites técnicos de proteção (50 apelidos por sócio, 50 por cliente, 50 variações do nome, 20 chaves Pix e 20 contas). O responsável fixou os números acima, que passam a ser regra do cadastro.

Origem: responsável pelo produto, 27/11/2026 (CAD-001, E10):
- "2 apelidos por sócio / 2 apelidos por cliente / 30 variações de nome por recebedor / 10 chaves pix por recebedor / 10 contas por recebedor";
- "2 nomes e 2 documentos", sobre a contagem dos apelidos do cliente;
- "Plano e Brain", sobre onde registrar a regra.

A contagem só dos itens ativos é leitura do orquestrador, porque o cadastro não apaga itens; foi apresentada ao responsável junto com o registro desta decisão.

---

## Decisões pendentes

- **P-02b** — Escopo de acesso dos sócios com login próprio ([[#RAT-D011 — Perfis de acesso]]).
- **P-05c2** — Banco separado para homologação e planos pagos (hospedagem e Supabase) antes de entrarem dados reais.
- **P-24** — Gestão de usuários pela aplicação (exige a chave secreta no servidor) ou pelo painel do Supabase?
- **P-25** — Provedor de SMTP para os e-mails de convite e de recuperação de senha, e domínio da aplicação.
- **P-26** — Com a aplicação no Render em Virginia (EUA) ([[#RAT-D022 — Hospedagem no Render]]), os dados pessoais passam por servidor fora do Brasil, embora o banco fique em São Paulo. Avaliar a LGPD (transferência internacional) antes de entrarem dados reais.
- **P-10** — Um cliente poderá ter mais de uma mensalidade na mesma competência?
- **P-09** — Será permitido recebimento parcial?
- **P-11** — Será permitido estorno?
- **P-12** — A competência poderá ter data de vencimento por cliente?
