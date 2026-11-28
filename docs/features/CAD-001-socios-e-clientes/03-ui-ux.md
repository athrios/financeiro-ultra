# CAD-001 — Sócios, Clientes e Recebedores · Especificação de UI/UX

| Campo | Valor |
|---|---|
| Feature | CAD-001 — Sócios, Clientes e Recebedores |
| Etapa / gate | E2 · gate G2 |
| Agente | `design-ui-ux` |
| Data | 25/11/2026 (revisão pós-implementação: 26/11/2026, seção 16; pendências da seção 14 atualizadas) |
| Entrada | `01-plano.md` (revisão 2; a revisão 3 está sendo fechada pelo engenheiro, e as respostas finais do responsável prevalecem); Brain `11-Decisoes.md` (RAT-D015, RAT-D017, RAT-D019, RAT-D020, RAT-D021, RAT-D023, RAT-D024, RAT-D025); `docs/features/FND-001-fundacao/03-ui-ux.md` (padrões do shell, tabela, formulário, estados, confirmação e acessibilidade); `src/lib/navigation.ts`; `src/components/ui` e `src/components/shell` |
| Status | Entregue para o gate G2. Não altera regra de negócio nem o Brain. Marca como PROPOSTA ou DECISÃO PENDENTE o que não está decidido |

## Convenções deste documento

- **OFICIAL**: vem do Brain (RAT-Dxxx) ou de resposta do responsável no G0 da CAD-001.
- **PROPOSTA**: recomendação do design; vira regra com a aprovação do G2.
- **DECISÃO PENDENTE**: depende do responsável, da `modelagem-dados` ou da `seguranca`; a tela reserva o espaço e não inventa a regra.
- Nomes de pessoas, sócios e clientes nos exemplos são fictícios (RAT-D019): Sócio Alfa, Sócio Beta, Sócio Gama, Cliente Modelo. Documentos nos exemplos são **máscaras ilustrativas e inválidas** (`000.000.000-00`, `00.000.000/0001-00`), nunca números reais ou com dígito verificador válido.
- Os textos entre aspas são os textos exatos da interface (pt-BR). `{Nome}` e `{n}` são valores preenchidos pelo sistema.
- Rotas e nomes de componentes são PROPOSTA de nomenclatura; os nomes finais ficam com o `desenvolvedor`.
- A interface **não calcula dinheiro**. Ela só formata o que vem do servidor. A única conta feita na tela é a **contagem de sócios** e a apresentação de "1/n" e do percentual aproximado, que é informação derivada (RAT-D015), sem valor em reais por sócio.

## Resumo das decisões de UX (para o leitor com pressa)

1. **Um cadastro, uma tela de formulário.** Cliente e sócio têm um único formulário de criação e edição (dados, sócios indicados e apelidos juntos, com um só "Salvar"). Recebedor tem formulário próprio, em página (não em diálogo), dentro do sócio.
2. **Consulta e edição separadas.** Todo cadastro tem uma página de detalhe (leitura) e uma de edição. Quem só consulta nunca vê botão de edição, e a rota de edição responde "Sem permissão".
3. **Documento do cliente em três opções** (Sem documento, CPF, CNPJ), com máscara e validação ao sair do campo e ao salvar. O CNPJ aceita letras e números.
4. **Divisão sempre como informação:** "3 sócios · divisão igual: 1/3 para cada um (≈ 33,33%)". Sem campo de percentual e sem valor em reais por sócio (o centavo de ajuste é do rateio).
5. **Bloqueios explicam e levam à saída.** Inativar sócio com cliente ou reativar cliente sem sócio abre um diálogo que lista o que impede e leva ao lugar certo.
6. **Confirmação proporcional (nível 2 do padrão da FND, 5.1):** inativar, reativar e trocar sócios ou documento pedem diálogo com resumo e "Motivo (opcional)". Nada pede digitar para confirmar, porque tudo é reversível e auditado.
7. **Duplicidade tratada com caminho, não só com erro:** documento repetido leva ao cliente existente (inclusive o inativo, para reativar); nome parecido só avisa e deixa seguir.
8. **Conflito de edição nunca sobrescreve:** a tela avisa, mostra o que mudou e recarrega a versão atual.

---

## 1. Jornada

Perfis: Administrador (gerencia tudo), Operador e Visualizador (só consultam clientes) e Sócio (sem acesso, tela de estado da FND 2.7.3).

### J1 — Começar do zero (Administrador)

1. Abre **Configurações > Sócios** e vê o estado vazio com a explicação "cada cliente precisa de ao menos um sócio".
2. Cadastra os sócios (nome e, se quiser, apelidos). Ao salvar, cai no detalhe do sócio com a sugestão de cadastrar recebedores.
3. No detalhe do sócio, cadastra os **recebedores** (titular, variações do nome, chaves Pix, contas).
4. Abre **Cadastros > Clientes**, aciona "Novo cliente", preenche dados, documento (opcional), mensalidade, escolhe os sócios e salva.

### J2 — Cadastrar um cliente novo (Administrador)

1. Em Clientes, aciona "Novo cliente".
2. Preenche nome, escolhe o tipo de documento e digita o número (ou deixa "Sem documento"), informa a mensalidade e marca os sócios. Vê a prévia da divisão.
3. Salva. Se o documento já existe, vê o aviso com link para o cliente existente (J4). Se o nome é igual ao de outro cliente, vê o aviso de nome repetido e decide entre "Salvar mesmo assim" e "Revisar dados".
4. Cai no detalhe do cliente com a confirmação "Cliente cadastrado."

### J3 — Consultar (Operador e Visualizador)

1. Abre Clientes, busca por nome, documento ou apelido.
2. Abre o detalhe e vê dados, sócios, divisão e apelidos, sem nenhum botão de edição.

### J4 — O cliente já existe, estava inativo e voltou (Administrador)

1. Ao salvar um novo cliente, o documento é recusado: "Já existe um cliente inativo com este CNPJ: Cliente Modelo. Para voltar a usar este cadastro, reative-o."
2. Aciona "Abrir cliente inativo", vê o detalhe com a faixa "Cliente inativo".
3. Se o cliente ainda tem sócio ativo, aciona "Reativar cliente" e confirma. Se não tem, o diálogo explica e leva a "Editar cliente" para indicar sócio; depois reativa.

### J5 — Trocar os sócios de um cliente (Administrador)

1. No detalhe do cliente, aciona "Editar", desmarca e marca sócios. A prévia da divisão acompanha.
2. Ao salvar, o diálogo "Confirmar as alterações em {Nome}?" mostra antes e depois, o aviso "vale daqui em diante" e o campo "Motivo (opcional)".
3. Confirma e vê "Alterações salvas." no detalhe.

### J6 — Tirar um sócio do cadastro (Administrador)

1. No detalhe do sócio, aciona "Inativar sócio".
2. Se o sócio está em algum cliente, ativo ou inativo, o diálogo de bloqueio lista os clientes e explica como retirá-lo. Ele abre cada cliente, desmarca o sócio e salva.
3. Quando não há mais clientes, aciona "Inativar sócio" de novo. O diálogo lista os recebedores ativos que serão inativados junto, pede o motivo (opcional) e confirma.

### J7 — Descobrir de quem é um apelido (Administrador)

1. Abre **Configurações > Apelidos**, digita o texto que apareceu no comprovante.
2. Vê a quem pertence (sócio, cliente ou recebedor) e abre o cadastro dono.

---

## 2. Mapa de telas e rotas

### 2.1 Rotas

Todas dentro do grupo `(app)` (shell completo), com sessão e perfil ativo. A visibilidade no menu e as telas abaixo são **experiência**; a barreira real é o banco (plano, 4.7).

| # | Tela | Rota (PROPOSTA) | Quem acessa | Observação |
|---|---|---|---|---|
| C1 | Lista de clientes | `/clientes` | Administrador, Operador, Visualizador | Busca e filtros na URL (`?q=&status=&socio=&pagina=`) |
| C2 | Novo cliente | `/clientes/novo` | Administrador | Os demais papéis veem "Sem permissão" (FND 2.7.4) |
| C3 | Detalhe do cliente | `/clientes/[id]` | Administrador, Operador, Visualizador | Leitura para todos; ações só para o Administrador |
| C4 | Editar cliente | `/clientes/[id]/editar` | Administrador | Mesmo formulário de C2 |
| S1 | Lista de sócios | `/configuracoes/socios` | Administrador | |
| S2 | Novo sócio | `/configuracoes/socios/novo` | Administrador | |
| S3 | Detalhe do sócio | `/configuracoes/socios/[id]` | Administrador | Contém Recebedores, Apelidos e Clientes do sócio |
| S4 | Editar sócio | `/configuracoes/socios/[id]/editar` | Administrador | Nome e apelidos |
| R1 | Novo recebedor | `/configuracoes/socios/[id]/recebedores/novo` | Administrador | Sócio dono fixo, vindo da rota |
| R2 | Recebedor (consulta e edição) | `/configuracoes/socios/[id]/recebedores/[receiverId]` | Administrador | Abre direto no formulário, com a faixa de estado e a ação de inativar/reativar |
| A1 | Apelidos (lista consolidada) | `/configuracoes/aliases` | Administrador | **Só leitura.** PROPOSTA do plano; pode ser cortada sem afetar o resto (E7) |

Decisões de mapa (PROPOSTA):

- **Recebedores em página, não em diálogo.** O formulário tem quatro blocos e listas editáveis, que ficam apertados em diálogo, principalmente no celular. Páginas também permitem voltar pelo navegador e abrir por link.
- **Recebedor sem tela de detalhe separada.** Só o Administrador acessa; a página R2 já abre com os dados e a ação de inativar/reativar.
- **Edição em rota própria (`/editar`)**, e não "editar no lugar" na página de detalhe: o detalhe fica estável para leitura e o formulário tem foco, rascunho e aviso de alterações não salvas.
- **O menu "Aliases" passa a se chamar "Apelidos"** (R-G05: "alias" só no banco e no código). A **rota** continua `/configuracoes/aliases` para não mexer em placeholder e em testes sem necessidade. DECISÃO PENDENTE de aprovação do rótulo (U-C06, seção 14).
- Caminho de volta: todas as telas de nível 2 ou 3 têm **trilha de navegação** (seção 9, `Breadcrumbs`): Clientes > {Nome}; Sócios > {Nome} > Recebedor.

### 2.2 Mudanças na navegação (`src/lib/navigation.ts`, para o desenvolvedor)

| Item | Hoje | Passa a ser |
|---|---|---|
| Clientes | `available: false` | `available: true`. Descrição: "Cadastro de clientes, com documento, mensalidade e sócios." Papéis inalterados (Administrador, Operador, Visualizador) |
| Sócios | `available: false`; "Cadastro de sócios e de seus aliases." | `available: true`. Descrição: "Cadastro de sócios, seus recebedores e apelidos." Só Administrador |
| Aliases | `available: false`; rótulo "Aliases" | `available: true`. Rótulo "Apelidos". Descrição: "Nomes, chaves e contas usados para reconhecer quem pagou e quem recebeu." Só Administrador |

O item ativo no menu segue a regra existente (`activeNavHref`): `/clientes/novo` e `/clientes/[id]` marcam "Clientes"; `/configuracoes/socios/.../recebedores/...` marca "Sócios".

### 2.3 O que cada papel vê

Tabela de **experiência** (a autorização real é do banco, plano seção 6). "Oculto" = nem o controle aparece. "Sem permissão" = quem chega pela URL vê o estado 2.7.4 da FND.

| Elemento | Administrador | Operador | Visualizador | Sócio |
|---|:-:|:-:|:-:|:-:|
| Menu Clientes | Sim | Sim | Sim | Não (tela 2.7.3) |
| Menu Sócios e Apelidos (Configurações) | Sim | Oculto | Oculto | — |
| Lista e detalhe de clientes | Sim | Sim, leitura | Sim, leitura | — |
| Botão "Novo cliente", "Editar", "Inativar", "Reativar" | Sim | **Oculto** | **Oculto** | — |
| Nomes dos sócios no detalhe do cliente | Sim | Sim (só o nome) | Sim (só o nome) | — |
| Apelidos ativos do cliente | Sim | Sim | Sim | — |
| Apelidos inativos do cliente | Sim | Oculto | Oculto | — |
| Documento do cliente (CPF/CNPJ) | Sim | Sim | Sim | — |
| Detalhe do sócio, recebedores, chaves Pix e contas | Sim | **Sem permissão** | **Sem permissão** | — |
| Lista de Apelidos | Sim | Sem permissão | Sem permissão | — |
| Filtro "por sócio" na lista de clientes | Sim | Sim | Sim | — |

Notas:

- No detalhe do cliente, o nome de cada sócio **não é link** para Operador e Visualizador (o destino é uma área que eles não acessam). Para o Administrador, é link para o sócio.
- **CPF para Operador e Visualizador:** o plano (R-C16) mostra o CPF completo a quem consulta. Esta especificação segue o plano. Mascarar o CPF para esses papéis é uma opção que a `seguranca` pode pedir; o componente de documento (seção 9) já nasce com a opção de máscara (U-C05).
- Operador e Visualizador **não veem recebedores** (plano, seção 6). A feature de Recebimentos revê isso.

---

## 3. Lista de clientes (`/clientes`)

### 3.1 Estrutura (ordem e prioridade)

1. **Cabeçalho de página** (`PageHeader`): `h1` "Clientes"; descrição "Cadastro de clientes, com documento, mensalidade e sócios."; ação primária **"Novo cliente"** (só Administrador).
2. **Barra de busca e filtros** (`role="search"`), numa linha no desktop:
   - campo **"Buscar cliente"** (ajuda: "Nome, nome fantasia, apelido, ou o começo do CPF ou do CNPJ. A busca ignora acento, maiúscula e pontuação."; ver 17, T-01), com botão "Buscar" (Enter também envia);
   - filtro de **situação**, em três opções: **Ativos** (padrão) · **Inativos** · **Todos**;
   - filtro **"Sócio"**, com a opção "Todos os sócios" e a lista de sócios (ativos e inativos, com "(inativo)" ao lado do nome).
3. **Chips dos filtros aplicados** e o botão "Limpar filtros" (só aparecem quando há busca ou filtro diferente do padrão).
4. **Resumo do resultado** (`role="status"`, `aria-live="polite"`): "128 clientes ativos", "3 clientes encontrados", etc.
5. **Tabela** (desktop e tablet) ou **lista de cartões** (celular).
6. **Paginação** no servidor: "1–25 de 128", "Anterior" e "Próxima", seletor "Por página" (25, 50, 100).

A busca ignora acento, maiúscula e pontuação (o documento é encontrado com ou sem pontos e traço). A regra de busca parcial por documento é da camada de leitura (PROPOSTA: a partir de 3 caracteres).

### 3.2 Colunas (desktop e tablet)

| Coluna | Conteúdo | Alinhamento / tratamento |
|---|---|---|
| **Cliente** | Nome ou razão social, como **link** para o detalhe. Abaixo, em texto secundário, o nome fantasia (se houver) | Esquerda; quebra em até duas linhas (`whitespace-normal`) |
| **Documento** | Rótulo pequeno "CPF" ou "CNPJ" e o número formatado (`000.000.000-00` ou `00.000.000/0001-00`; CNPJ alfanumérico em caixa alta, ex.: `12.ABC.345/01DE-35`). Sem documento: **"Sem documento"** em texto secundário | Esquerda; `tabular-nums`; largura reservada para 18 caracteres |
| **Mensalidade padrão** | Valor padrão em reais, `R$ 1.250,00` | Direita; `tabular-nums`; peso regular. Não usa tom de saldo nem os ícones de Recebido/Devido/Saldo (não é resultado financeiro) |
| **Sócios** | Nomes separados por vírgula (até 3; depois "e mais {k}", com a lista completa em texto oculto para leitor de tela). Na segunda linha, secundário: "3 sócios · 1/3 cada" | Esquerda; quebra permitida |
| **Situação** | Selo com **ícone e texto**: "Ativo" (tom `success`, ícone `circle-check`) ou "Inativo" (tom `neutral`, ícone `circle-pause`) | Esquerda |

Decisões:

- **A linha inteira não é clicável** (padrão FND 2.9.2): o nome é o link. Sem menu de ações por linha; editar, inativar e reativar ficam no detalhe, onde o Administrador vê o contexto.
- Na lista a divisão aparece como **fração** ("1/3 cada"), por regra da FND (0.3: a fração é o dado principal). O percentual aproximado ("≈ 33,33%") aparece no detalhe e no formulário. Isso difere do exemplo "33,33% cada" do pedido só na ordem de importância.
- **Ordem fixa por nome (A a Z)**, estável. Ordenação por clique no cabeçalho é opcional e **cortável** (PROPOSTA; U-C10): se entrar, só em "Cliente" e "Mensalidade padrão", com `aria-sort` e ordenação numérica pelo valor (nunca pelo texto).
- **Clientes inativos** ganham o selo "Inativo" e **não** ficam apagados só por cor: o texto mantém contraste mínimo de 4,5:1.
- A tabela tem `<caption>` oculto visualmente: "Clientes, com documento, mensalidade padrão, sócios e situação. Ordem alfabética."
- Cabeçalho da tabela **não** fica fixo (paginação curta; FND 2.9.3).
- Sem rodapé de totais: não há total que faça sentido para mensalidades de cadastro.

### 3.3 Estados da lista

| Estado | Quando | Conteúdo |
|---|---|---|
| **Carregando** | Navegação, troca de filtro, página | Esqueleto só da área de conteúdo, com as mesmas 5 colunas e 8 linhas; `aria-busy="true"` na tabela; `role="status"` oculto "Carregando clientes". O esqueleto aparece só depois de ~300 ms |
| **Vazio: nenhum cliente e nenhum sócio ativo** (Administrador) | Sem clientes e sem sócio ativo | Ícone `users`; título "Cadastre um sócio antes de cadastrar clientes"; texto "Cada cliente precisa de pelo menos um sócio."; ação **"Ir para Sócios"** (leva a `/configuracoes/socios/novo`) |
| **Vazio: nenhum cliente, há sócio ativo** (Administrador) | Sem clientes | Ícone `users`; título "Nenhum cliente cadastrado"; texto "Cadastre o primeiro cliente para começar."; ação **"Novo cliente"** |
| **Vazio** (Operador e Visualizador) | Sem clientes | Título "Nenhum cliente cadastrado"; texto "Peça a um Administrador para cadastrar os clientes." **Sem ação** |
| **Sem resultado** | Busca ou filtro sem registros | Título "Nenhum cliente encontrado"; texto "Nenhum cliente corresponde à busca e aos filtros aplicados."; botão **"Limpar filtros"**. Se há inativos que casam com a busca e o filtro está em "Ativos", acrescentar "Há {k} cliente(s) inativo(s) com essa busca." e o link **"Ver inativos"** (PROPOSTA, ajuda a achar o cadastro a reativar; depende da leitura entregar a contagem; cortável) |
| **Erro** | Falha ao carregar | `ErrorPanel` de região dentro do cartão: "Não foi possível carregar os clientes."; botão "Tentar novamente"; "Código de suporte: {código}" |
| **Sucesso** | Volta de uma ação | `Alert` `success` persistente acima da barra de busca, com "Dispensar", ex.: "Cliente cadastrado." |
| **Pendência** | — | Não há pendência de leitura nesta lista |
| **Bloqueio** | Papel sem permissão de ação | Operador e Visualizador: botões de criação e edição **ocultos** (não desabilitados). A lista é igual para os três papéis |

### 3.4 Comportamento no celular (abaixo de 768 px)

- A tabela vira **lista de cartões**, um por cliente (FND 6: mais de quatro colunas). Cada cartão, de cima para baixo:
  1. nome (link, alvo de pelo menos 44 px) e, à direita, o selo de situação;
  2. nome fantasia (se houver);
  3. "CNPJ 00.000.000/0001-00", "CPF 000.000.000-00" ou "Sem documento";
  4. "Mensalidade padrão: R$ 1.250,00";
  5. sócios e "3 sócios · 1/3 cada".
- Busca em largura total; situação como três botões em linha (alvo de 44 px); "Sócio" em seletor de largura total. Os três controles ficam sempre visíveis (não há "Mais filtros").
- "Novo cliente" abaixo do título, em largura total.
- Paginação: "Anterior" e "Próxima" em largura total, com "1–25 de 128" entre eles; o seletor "Por página" some no celular (fica em 25).
- Em tablet (768 a 1023 px) a tabela se mantém, com rolagem horizontal se a janela for estreita e a primeira coluna ("Cliente") fixa à esquerda.

---

## 4. Cliente: formulário, detalhe e avisos

### 4.1 Formulário de cliente (`/clientes/novo` e `/clientes/[id]/editar`)

Uma coluna, `max-w-2xl`. Título (`h1`): "Novo cliente" ou "Editar cliente"; na edição, abaixo, o nome atual como descrição. Trilha: Clientes > Novo cliente (ou Clientes > {Nome} > Editar).

Regras de formulário da FND (5.3): rótulo sempre visível acima do campo; ajuda abaixo; erro abaixo da ajuda, com ícone e texto; validação ao enviar e, depois do primeiro envio, ao sair do campo; nunca bloqueia a digitação; um botão primário por formulário; Enter envia (exceto nos campos de "adicionar apelido", ver 4.1.6). O `*` marca o obrigatório, e o rótulo acessível diz "obrigatório" (`aria-required`), para não depender só do asterisco. Valores digitados são preservados quando o envio falha.

Ordem dos blocos (grupos em `fieldset` com `legend`):

#### 4.1.1 Bloco "Identificação"

| Campo | Rótulo | Ajuda | Regras |
|---|---|---|---|
| Nome | "Nome ou razão social *" | "Como o cliente aparece no contrato ou no comprovante." | Obrigatório, até 200 caracteres; espaços nas pontas são removidos |
| Nome fantasia | "Nome fantasia" | — | Opcional, até 200 caracteres |

#### 4.1.2 Bloco "Documento (opcional)"

Grupo de rádio (`fieldset`, legenda **"Documento do cliente"**, ajuda "Opcional. Sem documento, o cliente é identificado só pelo nome."), apresentado como **três botões lado a lado** (controle segmentado, com rádios nativos estilizados):

| Opção | Rótulo | Comportamento |
|---|---|---|
| 1 (padrão) | **"Sem documento"** | Nenhum campo de número |
| 2 | **"CPF"** (pessoa física) | Mostra o campo "Número do CPF" |
| 3 | **"CNPJ"** (empresa) | Mostra o campo "Número do CNPJ" |

- O tipo escolhido só define **máscara e validação**. A interface não guarda "tipo" à parte: o sistema deduz o tipo pelo número (plano, R-C02b).
- **Trocar de tipo esvazia o campo de número**, para nunca cortar em silêncio um número digitado. Trocar para "Sem documento" também esvazia. O campo que aparece ou some é anunciado por região `aria-live="polite"`.
- Na **edição**, o rádio vem marcado conforme o documento gravado. Mudar o documento (incluir, trocar ou retirar) dispara a confirmação com motivo opcional (4.1.8).

**Campo "Número do CPF"**
- Máscara `000.000.000-00`; só números; `inputMode="numeric"`; `autoComplete="off"`. Colar com ou sem pontuação funciona (a interface tira o que não é número e reaplica a máscara).
- Exemplo no campo (nunca no lugar do rótulo): `000.000.000-00`.

**Campo "Número do CNPJ"**
- Máscara `AA.AAA.AAA/AAAA-00`: nas 12 primeiras posições aceita **letras (A a Z) e números**; nas 2 últimas (dígitos verificadores), só números. Letras minúsculas viram maiúsculas ao digitar. `inputMode="text"`, `autoCapitalize="characters"`, `autoComplete="off"`, `spellCheck={false}`.
- Ajuda: "Aceita CNPJ só com números e CNPJ com letras e números."
- Colar com ou sem pontuação funciona.
- Exemplo no campo: `00.000.000/0001-00`.

**Validação** (a conferência dos dígitos é repetida no banco, que é a fonte única; a da tela serve só para a mensagem):

| Situação | Quando aparece | Mensagem (texto exato) |
|---|---|---|
| CPF incompleto | Ao sair do campo e ao salvar | "O CPF precisa ter 11 números." |
| CPF com dígitos errados | Ao sair do campo (se completo) e ao salvar | "CPF inválido. Confira os números." |
| CNPJ incompleto | Idem | "O CNPJ precisa ter 14 caracteres, entre números e letras." |
| CNPJ com dígitos errados | Idem | "CNPJ inválido. Confira os números e as letras." |
| Tipo escolhido e campo vazio | Ao salvar | "Digite o número do CPF ou escolha “Sem documento”." / "Digite o número do CNPJ ou escolha “Sem documento”." |
| Documento repetido, cliente **ativo** | Resposta do servidor ao salvar | "Já existe um cliente com este {CPF ou CNPJ}: {Nome do cliente}." + link **"Abrir cliente"** |
| Documento repetido, cliente **inativo** | Resposta do servidor ao salvar | "Já existe um cliente inativo com este {CPF ou CNPJ}: {Nome do cliente}. Para voltar a usar este cadastro, reative-o." + link **"Abrir cliente inativo"** |

**Documento repetido (caminho para o cliente existente, RAT-D024):**
- A mensagem aparece **abaixo do campo**, em `FieldError` com ícone, e também no **resumo de erros do topo**. O link leva ao **detalhe** do cliente existente (`/clientes/{id}`), onde o Administrador vê a faixa "Cliente inativo" e a ação "Reativar cliente" (ou, se ativo, edita o que precisar).
- Abrir o link na mesma aba descarta o que foi digitado. Por isso, com o formulário alterado, o clique passa pelo diálogo "Descartar as alterações?" (4.1.9). O texto do link é "Abrir cliente", nunca "clique aqui".
- DECISÃO PENDENTE com a `modelagem-dados` (U-C02): o erro de documento repetido precisa devolver **identificador, nome e situação** do cliente existente (o Administrador pode ler todos os clientes).

#### 4.1.3 Bloco "Mensalidade"

| Campo | Rótulo | Ajuda | Detalhes |
|---|---|---|---|
| Mensalidade | **"Mensalidade padrão (R$) *"** | "Valor padrão deste cliente. Mudar aqui não altera recebimentos já registrados." | Prefixo fixo "R$"; `inputMode="decimal"`; alinhado à direita; `tabular-nums` |

- Aceita só dígitos, ponto e vírgula. A vírgula separa os centavos e o ponto separa os milhares. Colar "1.234,56" ou "1234,56" funciona.
- **Ao sair do campo**, o valor é reformatado (`1.234,56`) e aparece abaixo a linha de conferência **"Valor lido: R$ 1.234,56"** (FND 5.3: mostrar o valor interpretado). Antes de sair, a linha mostra o que foi entendido até ali.
- **Ponto só vale como separador de milhares** (grupos de três dígitos). "1234.56" **não é lido como centavos**: dá erro, para ninguém gravar R$ 123.456,00 achando que eram R$ 1.234,56.
- O valor é enviado como texto decimal exato e convertido sem `float` pelo servidor (FND 5.3).

| Situação | Mensagem (texto exato) |
|---|---|
| Vazio | "Informe o valor da mensalidade." |
| Zero ou menor que zero | "O valor da mensalidade precisa ser maior que zero." |
| Mais de 2 casas decimais | "Use no máximo 2 casas depois da vírgula." |
| Formato ilegível | "Valor inválido. Use vírgula para os centavos. Exemplo: 1.234,56." |
| Acima do limite do banco | "O valor é alto demais. Confira se digitou certo." (limite exato: DECISÃO PENDENTE, U-C13) |

#### 4.1.4 Bloco "Sócios do cliente" (obrigatório)

- `fieldset` com legenda **"Sócios do cliente *"** e ajuda: "Escolha quem participa deste cliente. A mensalidade é sempre dividida em partes iguais entre os sócios escolhidos."
- **Lista de caixas de marcação**, uma por **sócio ativo**, em ordem alfabética, em duas colunas no desktop e uma no celular. Cada item mostra o nome. Alvo de 44 px de altura no celular. Se a lista passar de 10 itens, rola numa área de altura limitada, com rótulo acessível "Lista de sócios".
- **Prévia da divisão**, logo abaixo da lista (`role="status"`, `aria-live="polite"`, `aria-atomic="true"`, anunciada ao marcar ou desmarcar):

| Escolhidos | Texto exato da prévia |
|---:|---|
| 0 | "Nenhum sócio escolhido." Em cliente **ativo**, em tom de aviso, com a linha "Todo cliente ativo precisa de pelo menos um sócio." |
| 1 | "1 sócio · divisão: 1/1 (100%)" |
| 2 | "2 sócios · divisão igual: 1/2 para cada um (50%)" |
| 3 | "3 sócios · divisão igual: 1/3 para cada um (≈ 33,33%)" |
| 4 | "4 sócios · divisão igual: 1/4 para cada um (25%)" |
| n | "{n} sócios · divisão igual: 1/{n} para cada um ({≈ }{percentual})" |

  - O percentual usa vírgula e até duas casas; **só leva "≈" quando não é exato** (1/3, 1/6, 1/7...). Exatos: 100%, 50%, 25%, 20%, 12,5%, 10%.
  - **Nenhum valor em reais por sócio** aparece aqui: dividir centavos exige o centavo de ajuste do rateio (RAT-D015, P-17), que é de outra feature. Também **nunca** aparece uma linha "Total 100%" (FND 0.3).
- Texto fixo abaixo da prévia: "A divisão é sempre igual. Não há percentual para editar."
- **Na edição**, apoio adicional: "A troca de sócios vale daqui em diante. O que já foi recebido e rateado não muda."
- **Erros:**

| Situação | Mensagem (texto exato) |
|---|---|
| Nenhum sócio escolhido em cliente ativo | "Escolha pelo menos um sócio. Todo cliente ativo precisa de um." |
| Não há nenhum sócio ativo no sistema | A lista é substituída por um aviso: "Não há sócios ativos. Cadastre um sócio para poder salvar este cliente." + link "Cadastrar sócio". O botão "Salvar cliente" fica **desabilitado**, com o motivo escrito ao lado (FND 4.7, bloqueio por condição) |
| Um sócio escolhido foi inativado enquanto a pessoa preenchia | "O sócio {Nome} foi inativado e não pode mais ser indicado. Desmarque-o ou escolha outro." |

- **Cliente inativo na edição:** zero sócios é permitido (plano, R-C10). A prévia diz "Nenhum sócio. Para reativar o cliente, indique pelo menos um sócio." em tom informativo, sem erro.
- **Sócio inativo ainda indicado** (situação que a RAT-D025 impede; estado defensivo): aparece na lista **marcado e com o selo "Inativo"**, só pode ser **desmarcado**, e a mensagem do erro acima aparece ao salvar enquanto continuar marcado.

#### 4.1.5 Bloco "Observações"

- Campo de texto de várias linhas, rótulo **"Observações"**, ajuda "Opcional. Anotações internas sobre o cliente." O limite de caracteres é DECISÃO PENDENTE da modelagem (U-C13); a tela mostra o contador "{usados} de {limite}" quando o limite existir.

#### 4.1.6 Bloco "Apelidos (opcional)"

- Legenda **"Apelidos"**, ajuda: "Outros nomes ou documentos com que este cliente aparece nos comprovantes. Ajudam o sistema a reconhecer quem pagou. O nome e o documento do cadastro já são usados e não precisam ser repetidos."
- **Lista editável** (componente `EditableList`, seção 9), com a mesma anatomia no cliente, no sócio e no recebedor:
  1. **Itens ativos**, um por linha: texto, selo "Novo" (ainda não salvo) e o botão **"Remover"** (item novo) ou **"Inativar"** (item já salvo). O nome acessível do botão inclui o texto: "Remover apelido Cliente Modelo Ltda", "Inativar apelido ...".
  2. **Linha de inclusão:** seletor **"Tipo"** (Nome · CPF · CNPJ), campo **"Novo apelido"** (com a máscara do tipo, se for CPF ou CNPJ) e o botão **"Adicionar"**. **Enter dentro do campo adiciona o apelido e não envia o formulário.** O foco volta ao campo, para o próximo.
  3. **Apelidos inativos** (só na edição): subseção recolhível "Apelidos inativos ({k})" com o botão **"Reativar"** em cada item.
- O tipo "Nome" é o padrão. Os tipos "CPF" e "CNPJ" servem para quem paga em nome do cliente com documento próprio (por exemplo, o CPF do dono de uma empresa; plano, R-A08). **Os tipos de apelido são DECISÃO PENDENTE da `modelagem-dados`** (R-A06; U-C03): se a modelagem mantiver só "nome", o seletor "Tipo" some e o restante não muda.
- Anúncios (`role="status"`, polite): "Apelido “{texto}” adicionado.", "Apelido “{texto}” removido.", "... inativado.", "... reativado."
- Nada é gravado ao adicionar: tudo é salvo junto, no botão **"Salvar cliente"** (ver U-C01 sobre o salvamento único).

| Situação | Mensagem (texto exato) |
|---|---|
| Campo vazio ao adicionar | "Digite o apelido antes de adicionar." |
| Já está na lista | "Este apelido já está na lista." |
| Apelido documento inválido | "CPF inválido. Confira os números." / "CNPJ inválido. Confira os números e as letras." (mesmas regras de 4.1.2) |
| Apelido de outro cliente (resposta do servidor) | "Este apelido já pertence ao cliente {Nome}." + link "Abrir cliente" |
| Apelido documento igual ao documento de outro cliente | "Este documento já é o documento do cliente {Nome}." + link "Abrir cliente" |

#### 4.1.7 Aviso de nome parecido (R-C15; PROPOSTA do plano; **não bloqueia**)

> **Revisado em 26/11/2026 (RAT-D024):** o aviso vale para qualquer cliente com o mesmo nome normalizado (com ou sem documento; o nome fantasia conta como nome) e também quando um **apelido** do cliente é igual ao nome ou ao nome fantasia de outro cliente. Por isso o título e o motivo "apelido igual" mudam: ver a seção 16 (T-06 e T-08).

Quando o Administrador salva e já existe **outro cliente (ativo ou inativo)** com o mesmo nome (sem diferença de acento, maiúscula ou pontuação) ou com apelido ativo igual a esse nome, o servidor devolve a lista e o formulário **ainda não é salvo**. Aparece, no topo do formulário, um `Alert` **`warning`** (`role="alert"`, com ícone de alerta):

- Título: **"Já existe um cliente com este nome"**
- Texto: "Confira se não é o mesmo cliente. Se for outra filial ou outra pessoa com o mesmo nome, você pode salvar mesmo assim."
- Lista (uma linha por cliente parecido): nome, documento (ou "Sem documento"), selo Ativo/Inativo, motivo ("mesmo nome" ou "apelido igual") e o link **"Abrir cliente"**.
- Ações: **"Salvar mesmo assim"** (botão primário; é o único primário visível nesse momento, e o "Salvar cliente" comum fica oculto enquanto o aviso estiver ativo) e **"Revisar dados"** (secundário; leva o foco ao campo "Nome ou razão social").

Regras de comportamento:
- A confirmação vale **só para o nome e a lista exibidos**. Se a pessoa mudar o nome ou os apelidos depois do aviso, o aviso some e o salvamento volta a conferir.
- Mostrar o documento de cada cliente parecido ajuda a decidir (filiais têm o mesmo nome e documentos diferentes; plano, R-C06).
- O aviso aparece **ao cadastrar** e, na edição, **só se o nome ou um apelido mudou** (PROPOSTA; U-C09). Quem edita só a mensalidade não é interrompido.
- O fato de o aviso ter sido exibido e confirmado deve constar na auditoria (plano, seção 7). A tela envia a confirmação junto com o salvamento; a forma é da `modelagem-dados`.
- Nunca é erro: não usa vermelho e não impede salvar.

#### 4.1.8 Confirmação ao salvar mudança de sócios ou de documento (somente na edição)

Se, na edição, mudaram os **sócios** ou o **documento** (incluir, trocar ou retirar), o botão "Salvar alterações" abre um diálogo de confirmação (`AlertDialog`, nível 2 da FND 5.1):

- Título: **"Confirmar as alterações em {Nome}?"**
- Corpo (só os itens que mudaram aparecem):
  - "Sócios: {Alfa, Beta} → {Alfa, Gama}" e a linha "A divisão passa a ser igual entre 2 sócios: 1/2 para cada um (50%)."
  - "Documento: sem documento → CNPJ {número}", ou "CPF {número} → CNPJ {número}", ou "CNPJ {número} → sem documento".
- Aviso fixo quando os sócios mudam: **"A troca de sócios vale daqui em diante. O que já foi recebido e rateado não muda."**
- Aviso fixo quando o documento muda: "O documento é usado para reconhecer comprovantes."
- Campo **"Motivo (opcional)"** (área de texto; ajuda "Fica registrado no histórico de alterações, junto com quem fez e quando.").
- Botões: **"Voltar e revisar"** (foco inicial) e **"Confirmar e salvar"** (primário; durante o envio, "Salvando…", desabilitado).
- Outras mudanças (nome, mensalidade, apelidos, observações) salvam direto, sem diálogo.
- Se o formulário também tem o aviso de nome parecido pendente, o aviso vem **antes** (4.1.7); o diálogo de confirmação aparece depois.

#### 4.1.9 Botões, envio e sucesso

- Rodapé do formulário: **"Salvar cliente"** (primário) e **"Cancelar"** (secundário). Edição: "Salvar alterações".
- Durante o envio: botão desabilitado com "Salvando…", indicador giratório e largura estável (FND 4.1); sem duplo envio.
- **Alterações não salvas:** se o formulário foi alterado, "Cancelar" e os links de saída da página pedem confirmação: diálogo **"Descartar as alterações?"**, texto "O que você digitou não será salvo.", botões **"Continuar editando"** (foco inicial) e **"Descartar"**. No fechamento da aba usa-se o aviso do próprio navegador (PROPOSTA; FND 5.3).
- **Erro ao enviar:** `Alert` `danger` no topo (`role="alert"`) com resumo: "Não foi possível salvar. Corrija o campo destacado." ou "Não foi possível salvar. Corrija os {n} campos destacados.", com a lista de links para os campos quando houver mais de um. O foco vai ao resumo; com um único erro, ao campo. Valores preservados.
- **Erro inesperado:** "Não foi possível salvar agora. Tente novamente em instantes." + "Código de suporte: {código}".
- **Sessão expirada:** segue o padrão da FND (4.9); a ação não é dada como concluída.
- **Sem permissão** (o papel mudou durante a sessão): "Você não tem permissão para fazer esta alteração."
- **Sucesso:** cadastro novo vai ao detalhe com `Alert` `success` persistente (`role="status"`): **"Cliente cadastrado."**; edição vai ao detalhe com **"Alterações salvas."** O foco vai ao título. O mecanismo de levar a mensagem pelo redirecionamento é do desenvolvedor.

### 4.2 Detalhe do cliente (`/clientes/[id]`)

Prioridade dos blocos: **(1)** identidade e situação, **(2)** valor e sócios, **(3)** documento e apelidos, **(4)** observações e datas.

1. **Trilha:** Clientes > {Nome}.
2. **Cabeçalho:** `h1` com o nome; abaixo, o selo "Ativo" ou "Inativo" e o tipo, **só "CPF" ou "CNPJ"** (o tipo do documento; RAT-D017, complemento de 26/11/2026). **Sem documento, sem tipo**: nada é escrito no lugar (a linha "Documento" do cartão já diz "Sem documento"). Nunca "Pessoa física", "Pessoa jurídica" nem "Empresa". O tipo é texto cinza simples, ao lado do selo, sem ícone e sem selo próprio (para não competir com a situação), com o prefixo "Tipo de documento: " visível só para o leitor de tela (ver 17, T-45). Ações à direita, **só para o Administrador**: **"Editar"** (secundário) e **"Inativar cliente"** (secundário; é reversível e auditado, não usa vermelho). Se o cliente está inativo, no lugar de "Inativar cliente" aparece **"Reativar cliente"** (primário).
3. **Faixa de situação** (quando inativo): `Alert` `info` no topo do conteúdo, ícone `circle-pause`: "Cliente inativo. O cadastro está guardado e pode ser reativado." Para Operador e Visualizador, acrescenta "Peça a um Administrador para reativá-lo." (sem botão).
4. **Cartão "Dados"** (lista de definição):
   - Nome ou razão social;
   - Nome fantasia ("Não informado" quando vazio);
   - **Documento:** "CPF 000.000.000-00" ou "CNPJ 00.000.000/0001-00"; sem documento, "Sem documento";
   - **Mensalidade padrão:** `R$ 1.250,00` (texto base, sem tom financeiro);
   - Observações ("Sem observações" quando vazio).
5. **Cartão "Sócios e divisão":** linha da prévia ("3 sócios · divisão igual: 1/3 para cada um (≈ 33,33%)"); lista dos sócios (Administrador: links para o detalhe do sócio; Operador e Visualizador: só os nomes); nota "A divisão é sempre igual entre os sócios do cliente. Trocas valem daqui em diante e não mudam o que já foi recebido." Cliente inativo sem sócio: "Nenhum sócio indicado."
6. **Cartão "Apelidos":** apelidos ativos, com o tipo quando não for "Nome" ("CPF 000.000.000-00"). Vazio: "Nenhum apelido cadastrado." Para o Administrador, subseção recolhida "Apelidos inativos ({k})".
7. **Rodapé de dados:** "Cadastrado em {dd/mm/aaaa}" e "Última alteração em {dd/mm/aaaa} às {hh:mm}" (fuso `America/Sao_Paulo`, FND 0.2). Sem nome de autor na tela (a consulta de auditoria é de outra feature).

Estados do detalhe:

| Estado | Conteúdo |
|---|---|
| Carregando | Esqueleto de cabeçalho e três cartões |
| Erro | `ErrorPanel` "Não foi possível carregar este cliente." com "Tentar novamente" |
| Não encontrado | `not-found` do grupo `(app)` (FND 4.8a): "Registro não encontrado", que também cobre o registro que o RLS esconde |
| Sucesso | `Alert` `success` persistente no topo, vindo de salvar, inativar ou reativar, com "Dispensar" |
| Bloqueio por papel | Operador e Visualizador: sem botões; `/clientes/[id]/editar` mostra "Sem permissão" |

---

## 5. Sócios e Apelidos (Configurações)

Só o Administrador acessa. Operador e Visualizador não veem o menu e, pela URL, veem "Sem permissão" (FND 2.7.4). O Sócio vê a tela "Acesso de sócio ainda não disponível" (FND 2.7.3).

### 5.1 Lista de sócios (`/configuracoes/socios`)

- **Cabeçalho:** `h1` "Sócios"; descrição "Cadastro de sócios, seus recebedores e apelidos."; ação primária **"Novo sócio"**.
- **Barra:** campo "Buscar sócio" (nome ou apelido) e situação **Ativos** (padrão) · **Inativos** · **Todos**.
- **Tabela** (cartões no celular):

| Coluna | Conteúdo |
|---|---|
| **Sócio** | Nome, como link para o detalhe |
| **Clientes** | "{a} ativos" e, em texto secundário, "{i} inativos" (conta quantos clientes indicam este sócio) |
| **Recebedores** | "{a} ativos" e, em texto secundário, "{i} inativos" |
| **Situação** | Selo "Ativo" ou "Inativo" (ícone + texto) |

- As contagens são informação derivada de leitura e podem ser cortadas se encarecerem a consulta (PROPOSTA; U-C10). Sem paginação enquanto a lista for curta (esperado menos de 25 sócios); a paginação do padrão da FND entra se passar disso (PROPOSTA).
- **Estados:**

| Estado | Conteúdo |
|---|---|
| Carregando | Esqueleto de 4 colunas e 5 linhas |
| Vazio (nenhum sócio) | Ícone `handshake`; título "Nenhum sócio cadastrado"; texto "Cadastre os sócios antes dos clientes: cada cliente precisa de pelo menos um sócio."; ação "Novo sócio" |
| Vazio no filtro Inativos | "Nenhum sócio inativo." e o botão "Ver ativos" |
| Sem resultado | "Nenhum sócio encontrado." + "Limpar filtros" |
| Erro | `ErrorPanel` de região: "Não foi possível carregar os sócios." + "Tentar novamente" + código de suporte |
| Sucesso | `Alert` `success` persistente: "Sócio cadastrado." |

### 5.2 Formulário de sócio (`/configuracoes/socios/novo` e `.../[id]/editar`)

`max-w-2xl`. Mesmas regras de formulário da seção 4.1. **Sem campo de documento e sem campo de percentual** (RAT-D025, RAT-D015).

| Campo | Rótulo | Ajuda | Regras |
|---|---|---|---|
| Nome | "Nome do sócio *" | "Como o sócio aparece no sistema." | Obrigatório, até 200 caracteres |
| Apelidos | Lista editável "Apelidos" | "Outros nomes com que este sócio aparece nos comprovantes. O nome do cadastro já é usado e não precisa ser repetido." | Mesma anatomia de 4.1.6, **só do tipo "Nome"** (sem seletor de tipo) |

| Situação | Mensagem (texto exato) |
|---|---|
| Nome vazio | "Informe o nome do sócio." |
| Nome igual ao de outro sócio ativo | "Já existe um sócio com este nome." + link "Abrir sócio". A comparação ignora acento, maiúscula e pontuação, e a mensagem diz isso na linha seguinte: "Nomes que só mudam em acento, maiúscula ou pontuação contam como o mesmo." |
| Nome igual ao de sócio **inativo** | "Já existe um sócio inativo com este nome. Para voltar a usar este cadastro, reative-o." + link "Abrir sócio inativo" |
| Apelido igual ao de outro sócio | "Este apelido já pertence ao sócio {Nome}." + link "Abrir sócio" |
| Apelido igual ao nome de outro sócio | "Este apelido já é o nome do sócio {Nome}." + link "Abrir sócio" |
| Apelido vazio ou repetido na lista | Mesmas mensagens de 4.1.6 |
| Edição de sócio **inativo** | Faixa `info` "Sócio inativo. Você pode corrigir o nome e os apelidos, mas só poderá indicá-lo em clientes depois de reativá-lo." |

- Botões: "Salvar sócio" (novo) ou "Salvar alterações" (edição) e "Cancelar". Aviso de alterações não salvas e conflito de edição como em 4.1.9 e na seção 8.
- Sucesso: novo sócio vai ao detalhe com **"Sócio cadastrado. Agora você pode cadastrar os recebedores dele."** e o botão "Novo recebedor" em destaque; edição vai ao detalhe com "Alterações salvas."
- Mudar só o nome ou os apelidos salva **sem diálogo** (sem motivo). Se o desenvolvedor ou a `modelagem-dados` entender que renomear sócio exige motivo, o campo "Motivo (opcional)" segue o padrão de 4.1.8 (U-C14).

### 5.3 Detalhe do sócio (`/configuracoes/socios/[id]`)

Prioridade: **(1)** identidade e situação, **(2)** recebedores, **(3)** clientes do sócio, **(4)** apelidos.

1. **Trilha:** Sócios > {Nome}.
2. **Cabeçalho:** `h1` com o nome; selo "Ativo" ou "Inativo". Ações: **"Editar"** (secundário) e **"Inativar sócio"** (secundário), ou **"Reativar sócio"** (primário) quando inativo.
3. **Faixa de situação** (quando inativo): `Alert` `info` "Sócio inativo. Ele não pode ser indicado em clientes nem receber novos recebedores. Reative o sócio para voltar a usá-lo."
4. **Aviso de login vinculado** (condicional, `Alert` `info`, PROPOSTA R-S08): "Há um login vinculado a este sócio. Inativar o sócio não altera o login, mas o vínculo com este cadastro deixa de valer enquanto ele estiver inativo." Aparece só se a leitura do vínculo estiver disponível para o Administrador (U-C07).
5. **Cartão "Recebedores"** (o bloco principal):
   - Título "Recebedores" e, à direita, **"Novo recebedor"** (primário do cartão; **oculto** se o sócio está inativo, trocado pelo texto "Reative o sócio para cadastrar recebedores.").
   - Filtro de situação **Ativos** (padrão) · **Inativos** · **Todos**.
   - Tabela (cartões no celular):

| Coluna | Conteúdo |
|---|---|
| **Titular** | Nome do titular como link para o recebedor. Abaixo, em secundário, "{k} variações do nome" quando houver |
| **Chaves Pix** | As chaves, uma por linha, quebra permitida. Sem chave: "—" com texto oculto "Nenhuma chave Pix" |
| **Contas** | "Banco {x} · Ag. {y} · Conta {z}", uma por linha. Sem conta: "—" com texto oculto "Nenhuma conta" |
| **Situação** | Selo "Ativo" ou "Inativo" |

   - Vazio: "Este sócio ainda não tem recebedores." + texto "Cadastre as contas e os nomes pelos quais este sócio recebe, para o sistema reconhecer os comprovantes." + ação "Novo recebedor". Vazio no filtro Inativos: "Nenhum recebedor inativo."
   - Erro: `ErrorPanel` de região "Não foi possível carregar os recebedores."
6. **Cartão "Clientes deste sócio":** "{n} clientes: {a} ativos e {i} inativos." Lista curta (até 10 nomes, cada um com o selo de situação, como link) e o link **"Ver todos os clientes deste sócio"** (leva a `/clientes?socio={id}&status=todos`). Nota fixa: **"Para inativar este sócio, ele precisa sair de todos os clientes, ativos e inativos."** Vazio: "Nenhum cliente indica este sócio."
7. **Cartão "Apelidos":** apelidos ativos; vazio "Nenhum apelido cadastrado."; "Apelidos inativos ({k})" recolhido.
8. **Datas:** "Cadastrado em ..." e "Última alteração em ..." como no cliente.

Estados do detalhe: carregando (esqueleto do cabeçalho e três cartões); erro de página (`ErrorPanel`); não encontrado ("Registro não encontrado", FND 4.8a); sucesso (`Alert` `success` persistente após criar, editar, inativar ou reativar).

### 5.4 Apelidos (`/configuracoes/aliases`; só leitura; PROPOSTA do plano)

Pergunta que a tela responde: **"Este texto pertence a quem?"**

- **Cabeçalho:** `h1` "Apelidos"; descrição "Nomes, chaves e contas usados para reconhecer quem pagou e quem recebeu. Para alterar, abra o cadastro de quem é o dono."
- **Barra:** campo **"Buscar texto"** (ajuda "A busca ignora acento, maiúscula e pontuação."), filtro **"Tipo"** (Todos · Apelido de sócio · Apelido de cliente · Variação do nome de recebedor · Chave Pix · Conta bancária) e filtro de situação (Ativos padrão · Inativos · Todos).
- **Tabela** (cartões no celular):

| Coluna | Conteúdo |
|---|---|
| **Texto** | O apelido, a variação, a chave ou a conta ("Banco {x} · Ag. {y} · Conta {z}"); `break-words`; nunca truncado |
| **Tipo** | "Apelido de sócio", "Apelido de cliente", "Variação do nome", "Chave Pix", "Conta bancária" |
| **Pertence a** | Link para o dono. Sócio: "{Nome}". Cliente: "{Nome}". Recebedor: "{Titular} · sócio {Nome}". Dono inativo: aviso cinza logo depois do nome do dono, "(sócio inativo)", "(cliente inativo)" ou "(recebedor inativo)"; no recebedor, o sócio vem depois do aviso: "{Titular} (recebedor inativo) · sócio {Nome}" (ver 17, T-42) |
| **Situação** | "Ativo" ou "Inativo" (ícone + texto) |

- Ordem fixa por texto (A a Z). Paginação de 25, 50 e 100. Sem botões de edição, em nenhum papel.
- **Estados:** carregando (esqueleto); vazio "Nenhum apelido cadastrado ainda." + texto "Os apelidos e identificadores são cadastrados dentro de cada sócio, recebedor e cliente."; sem resultado "Nenhum texto encontrado." + "Limpar filtros"; erro "Não foi possível carregar os apelidos." + "Tentar novamente".
- Chaves Pix e contas aparecem completas nesta tela (o objetivo é achar o dono do texto). É tela só do Administrador. Mascarar é opção da `seguranca` (U-C05).
- **Cortável sem efeito no resto da feature** (plano, 3.1 item 4). Se a E7 cortar a tela, o item de menu "Apelidos" permanece como placeholder "Em breve" (`available: false`).

---

## 6. Fluxos de inativação e reativação

Todos usam o **diálogo de confirmação de nível 2** da FND (5.1), construído sobre `AlertDialog` (seção 9):

- Estrutura: título com verbo e objeto; resumo do que acontece; lista, quando houver; campo **"Motivo (opcional)"**; rodapé com **"Cancelar"** (primeiro foco, à esquerda) e botão de ação com **rótulo específico** (nunca "OK" ou "Sim").
- **O botão de ação é o primário padrão**, não vermelho: inativar e reativar são reversíveis, auditados e não apagam nada (FND 5.1.2 item 7).
- **Campo "Motivo (opcional)":** área de texto de 3 linhas, ajuda **"Fica registrado no histórico de alterações, junto com quem fez e quando."**, limite de 500 caracteres com contador (PROPOSTA; U-C13). **Nunca bloqueia** a confirmação (RAT-D021). Não é obrigatório nem tem asterisco.
- Esc e clique fora fecham, **exceto enquanto a ação está em andamento**. Durante o envio o botão fica desabilitado com o gerúndio ("Inativando…", "Reativando…").
- Erro do servidor: o diálogo **continua aberto**, com `Alert` `danger` no topo e o motivo digitado preservado.
- Sucesso: o diálogo fecha, a página atualiza e mostra `Alert` `success` persistente (`role="status"`); o foco vai ao título da página.
- **Estado mudou enquanto o diálogo estava aberto** (outra pessoa já fez a ação): ver 8.3.
- Quem não é Administrador não vê nenhum desses botões.

### 6.1 Inativar sócio

**Passo 0: a página decide qual diálogo abrir** ao acionar **"Inativar sócio"**, com os dados carregados no detalhe. O servidor confere de novo ao confirmar.

#### Variante A: o sócio está em clientes (bloqueio)

Vale para **qualquer cliente que indique o sócio, ativo ou inativo** (RAT-D025).

- Título: **"Não é possível inativar {Nome}"**
- Texto: **"{Nome} ainda está indicado em {n} cliente(s), entre ativos e inativos. Para inativar, primeiro retire este sócio de todos eles."**
  - Singular/plural: "em 1 cliente" / "em {n} clientes".
- **Lista de clientes** (com nome acessível "Clientes que indicam {Nome}"): uma linha por cliente com **nome (link)**, selo Ativo/Inativo e, quando for o caso, o selo **"Único sócio"** (o cliente ativo ficaria sem sócio). A lista mostra **todos** os clientes e rola numa área de altura máxima de 16 rem, focável por teclado (`tabindex="0"`, `role="region"`).
- Texto de caminho: **"Como retirar: abra o cliente, desmarque {Nome} em “Sócios do cliente” e salve. Um cliente ativo precisa continuar com pelo menos um sócio. Se {Nome} for o único, indique outro sócio antes."**
- Botões: **"Fechar"** (foco inicial) e **"Ver clientes deste sócio"** (link; leva a `/clientes?socio={id}&status=todos`).
- Não há campo de motivo (não há ação a confirmar).
- **Observação de UX:** retirar o sócio de muitos clientes um a um é trabalhoso. Uma ferramenta para trocar o sócio em vários clientes de uma vez **não existe nesta feature** (fora do escopo); fica registrada como pendência para o responsável decidir (U-C11).

#### Variante B: sem clientes, **com** recebedores ativos (cascata)

- Título: **"Inativar {Nome}?"**
- Texto: **"Os {n} recebedores ativos deste sócio serão inativados junto:"** (singular: "O recebedor ativo deste sócio será inativado junto:")
- **Lista dos recebedores** que serão inativados (nome do titular de cada um; nome acessível "Recebedores que serão inativados").
- Texto de apoio: **"Ao reativar o sócio, os recebedores continuam inativos até você reativá-los um a um. Nada é apagado: os cadastros e o histórico continuam guardados."**
- Se houver login vinculado (condicional, U-C07): "O login ligado a este sócio não é alterado, mas o vínculo com este cadastro deixa de valer enquanto ele estiver inativo."
- Campo **"Motivo (opcional)"**. O motivo vale para o sócio e para todos os recebedores inativados na mesma operação.
- Botões: **"Cancelar"** (foco inicial) e **"Inativar sócio e {n} recebedores"** (n = 1: **"Inativar sócio e 1 recebedor"**). Em andamento: "Inativando…".
- Sucesso: **"Sócio inativado. {n} recebedores inativados junto."** (n = 1: "Sócio inativado. 1 recebedor inativado junto.")

#### Variante C: sem clientes e **sem** recebedores ativos

- Título: **"Inativar {Nome}?"**
- Texto: **"{Nome} não está em nenhum cliente e não tem recebedores ativos. O cadastro e o histórico continuam guardados, e você pode reativá-lo depois."**
- Campo "Motivo (opcional)". Botões **"Cancelar"** e **"Inativar sócio"**.
- Sucesso: **"Sócio inativado."**

#### Erros do servidor na inativação do sócio

| Situação | Mensagem (texto exato) | Comportamento |
|---|---|---|
| A lista de clientes mudou enquanto o diálogo estava aberto (alguém indicou o sócio num cliente) | "A lista de clientes deste sócio mudou. Confira a lista atualizada." | O diálogo vira a **variante A** com a lista nova |
| Os recebedores mudaram (há recebedor novo ou algum já foi inativado) | "A lista de recebedores deste sócio mudou. Confira a lista atualizada e confirme de novo." | O diálogo permanece na variante B com a lista nova, e o botão volta ao estado inicial |
| O sócio já estava inativo | "Este sócio já está inativo. A tela foi atualizada." | Fecha e atualiza |
| Falha inesperada | "Não foi possível inativar o sócio agora. Tente novamente em instantes." + "Código de suporte: {código}" | Diálogo aberto |

### 6.2 Reativar sócio

- Título: **"Reativar {Nome}?"**
- Texto: **"O sócio volta a poder ser indicado em clientes e a ter recebedores. Ele não volta sozinho para os clientes de onde saiu, e os recebedores inativados continuam inativos até você reativá-los."**
- Campo "Motivo (opcional)". Botões **"Cancelar"** e **"Reativar sócio"**. Em andamento: "Reativando…".
- Sucesso: **"Sócio reativado."**
- Erro: "Não foi possível reativar o sócio agora. Tente novamente em instantes." Se outro cadastro já usa o mesmo nome: não ocorre, porque o nome é único entre ativos e inativos.

### 6.3 Inativar cliente

- Título: **"Inativar {Nome}?"**
- Texto: **"O cadastro continua guardado e pode ser reativado depois. Os sócios indicados ({Alfa, Beta}) continuam registrados. Recebimentos já registrados não mudam."**
- Campo "Motivo (opcional)". Botões **"Cancelar"** e **"Inativar cliente"**. Em andamento: "Inativando…".
- Sucesso: **"Cliente inativado."**
- Erros: "Este cliente já está inativo. A tela foi atualizada." / "Não foi possível inativar o cliente agora. Tente novamente em instantes."
- A frase sobre o que muda para lançamentos futuros (por exemplo, "deixa de aparecer ao lançar recebimentos", R-C13) **não entra agora**: depende da feature de Recebimentos (U-C08).

### 6.4 Reativar cliente

**Variante A: o cliente tem pelo menos um sócio ativo**

- Título: **"Reativar {Nome}?"**
- Texto: **"O cliente volta para a lista de ativos com {n} sócio(s): {nomes}. A divisão é igual: 1/{n} para cada um ({percentual})."**
- Campo "Motivo (opcional)". Botões **"Cancelar"** e **"Reativar cliente"**. Em andamento: "Reativando…".
- Sucesso: **"Cliente reativado."**

**Variante B: o cliente está sem sócio ativo (bloqueio)**

- Título: **"Não é possível reativar {Nome}"**
- Texto: **"Todo cliente ativo precisa de pelo menos um sócio, e este cliente está sem sócio ativo. Indique um sócio na edição do cliente e depois reative."**
- Botões: **"Fechar"** (foco inicial) e **"Editar cliente"** (link para `/clientes/{id}/editar`).

Erro do servidor (corrida): "Este cliente não tem sócio ativo. Indique pelo menos um sócio na edição e tente reativar de novo." / "Este cliente já está ativo. A tela foi atualizada." / "Não foi possível reativar o cliente agora. Tente novamente em instantes."

Observação: um cliente inativo pode ter o **documento** igual ao que alguém tentava cadastrar (J4). Reativar **não pede** o documento de novo, porque o cadastro já o guarda.

### 6.5 Inativar e reativar recebedor

**Inativar** (botão "Inativar recebedor" no cabeçalho de R2):

- Título: **"Inativar o recebedor {Titular}?"**
- Texto: **"Este recebedor deixa de ser usado para reconhecer comprovantes novos. O cadastro e os recebimentos já registrados continuam como estão. Você pode reativá-lo depois."**
- Campo "Motivo (opcional)". Botões **"Cancelar"** e **"Inativar recebedor"**. Em andamento: "Inativando…".
- Sucesso: **"Recebedor inativado."**
- A frase sobre reconhecimento descreve a intenção do plano (risco R-07: comprovante que aponta para recebedor inativo vai para revisão) e deve ser **confirmada pela feature de Reconhecimento** (U-C08).

**Reativar** (botão "Reativar recebedor" no cabeçalho de R2):

- Título: **"Reativar o recebedor {Titular}?"**
- Texto: **"Ele volta a ser usado para reconhecer comprovantes do sócio {Nome}."**
- Campo "Motivo (opcional)". Botões **"Cancelar"** e **"Reativar recebedor"**. Em andamento: "Reativando…".
- Sucesso: **"Recebedor reativado."**
- **Bloqueio, sócio inativo** (variante B): título **"Não é possível reativar {Titular}"**; texto **"O sócio {Nome} está inativo. Reative o sócio antes de reativar o recebedor."**; botões **"Fechar"** e **"Ir para o sócio"**.
- **Erro, identificador em uso** (corrida ou conflito de dados): **"Não foi possível reativar: a {chave Pix ou conta} {valor} já está em uso pelo recebedor {Titular}, do sócio {Nome}. Retire do cadastro de um dos dois e tente de novo."** (com link "Abrir recebedor").
- Falha inesperada: "Não foi possível reativar o recebedor agora. Tente novamente em instantes."

### 6.6 Quadro-resumo dos fluxos

| Ação | Condição de bloqueio | Diálogo de bloqueio | Cascata | Texto do botão de ação |
|---|---|---|---|---|
| Inativar sócio | Está em qualquer cliente (ativo ou inativo) | Sim (6.1 A), com a lista de clientes | Inativa os recebedores ativos (6.1 B) | "Inativar sócio" / "Inativar sócio e {n} recebedores" |
| Reativar sócio | Nenhuma | — | Não reativa recebedores nem clientes | "Reativar sócio" |
| Inativar cliente | Nenhuma | — | Não altera sócios indicados | "Inativar cliente" |
| Reativar cliente | Sem sócio ativo | Sim (6.4 B) | — | "Reativar cliente" |
| Inativar recebedor | Nenhuma | — | — | "Inativar recebedor" |
| Reativar recebedor | Sócio dono inativo | Sim (6.5 B) | — | "Reativar recebedor" |
| Inativar/reativar apelido ou identificador | Nenhuma | — | — | Sem diálogo; acontece ao salvar o formulário, e o botão tem nome acessível |

Inativar e reativar apelidos e identificadores **não** pedem diálogo (são itens de lista dentro de um formulário que só grava ao salvar, e o salvamento é auditado).

---

## 7. Formulário de recebedor

Rotas R1 (`.../recebedores/novo`) e R2 (`.../recebedores/[receiverId]`). `max-w-2xl`. Trilha: Sócios > {Sócio} > Novo recebedor (ou > {Titular}). Só Administrador.

**Princípio: pedir só o que ajuda a reconhecer o favorecido do comprovante** (RAT-D023, R-R05). **Não há** CPF/CNPJ do titular, senha, token, número de cartão, saldo, extrato nem observações.

### 7.1 Estrutura e campos

1. **Faixa de contexto (leitura)**, no topo: "Sócio: **{Nome}**". Texto: **"Este recebedor pertence a {Nome} e não pode mudar de sócio. Para passar a conta a outro sócio, inative este recebedor e cadastre outro."** (R-R02, PROPOSTA). No cadastro novo, só a primeira frase.
2. **Aviso de privacidade** (`Alert` `info`, sempre visível, curto): **"Guarde só o que aparece nos comprovantes. Não informe senhas, números de cartão, saldos nem extratos."**
3. **Campo "Nome do titular \*"** — ajuda: "Como o nome aparece no comprovante." Obrigatório, até 200 caracteres. O mesmo nome pode se repetir em recebedores diferentes (um titular pode ter contas em bancos diferentes).
4. **Lista "Outras formas do nome"** (variações; opcional) — ajuda: "Outras formas como o nome pode aparecer, por exemplo abreviado ou sem acento. Ex.: S. Alfa." Mesma anatomia de 4.1.6, só do tipo texto: campo "Nova forma do nome" + "Adicionar"; itens com "Remover" (novo) ou "Inativar" (salvo); inativos recolhidos, com "Reativar".
5. **Lista "Chaves Pix"** (opcional) — ajuda: "Digite a chave exatamente como aparece no comprovante. Pode ser CPF, CNPJ, e-mail, telefone ou chave aleatória." Campo "Nova chave Pix" + "Adicionar". Um recebedor pode ter **várias chaves** (PROPOSTA; U-C04). Sem seletor de tipo de chave (a tela não pede o que o comprovante já mostra). Máximo de 100 caracteres por chave (PROPOSTA; U-C13).
6. **Lista "Contas bancárias"** (opcional) — ajuda: "Banco, agência e conta, como aparecem no comprovante." Cada conta tem três campos lado a lado (empilhados no celular), mais "Adicionar":

| Campo | Rótulo | Regras |
|---|---|---|
| Banco | "Banco" | Texto livre: nome ou código (ex.: "Banco Exemplo" ou "000") |
| Agência | "Agência" | Números e hífen (e a letra X) |
| Conta | "Conta" | Números, hífen e a letra X (com dígito) |

   Os três campos são necessários para adicionar uma conta (conta pela metade é recusada). Um recebedor pode ter várias contas (PROPOSTA; U-C04). Cada item salvo mostra "Banco {x} · Ag. {y} · Conta {z}".
7. **Rodapé:** **"Salvar recebedor"** (novo) ou **"Salvar alterações"** (edição) e **"Cancelar"**. Na edição de R2, o cabeçalho traz a ação **"Inativar recebedor"** ou **"Reativar recebedor"** (seção 6.5).

### 7.2 Mensagens (texto exato)

| Situação | Mensagem |
|---|---|
| Titular vazio | "Informe o nome do titular." |
| Titular acima de 200 caracteres | "O nome do titular pode ter no máximo 200 caracteres." |
| Variação ou chave vazia ao adicionar | "Digite a forma do nome antes de adicionar." / "Digite a chave Pix antes de adicionar." |
| Já está na lista | "Esta forma do nome já está na lista." / "Esta chave Pix já está na lista." / "Esta conta já está na lista." |
| Conta incompleta | "Preencha banco, agência e conta, ou apague os campos." |
| Agência ou conta com caracteres inválidos | "Use só números, hífen e a letra X." |
| Chave Pix já usada por **outro recebedor ativo** | "Esta chave Pix já está cadastrada no recebedor {Titular}, do sócio {Nome}." + link "Abrir recebedor" |
| Conta já usada por outro recebedor ativo | "Esta conta já está cadastrada no recebedor {Titular}, do sócio {Nome}." + link "Abrir recebedor" |
| Variação do nome igual a apelido ou nome de **outro sócio** (R-R09; se a modelagem mantiver) | "Este nome já é usado pelo sócio {Nome}. Use um nome que identifique só este recebedor." |
| Cadastro em sócio inativo | A rota R1 mostra, no lugar do formulário, o estado de bloqueio: "Não é possível cadastrar recebedor para um sócio inativo. Reative o sócio primeiro." + botão "Ir para o sócio" |
| Falha geral | "Não foi possível salvar. Corrija o campo destacado." / "... os {n} campos destacados." (mesmo resumo de 4.1.9) |

### 7.3 Estados do formulário de recebedor

| Estado | Conteúdo |
|---|---|
| Carregando | Esqueleto do formulário |
| Erro de leitura | `ErrorPanel` "Não foi possível carregar este recebedor." |
| Não encontrado | "Registro não encontrado" (recebedor que não pertence a este sócio também cai aqui) |
| Recebedor **inativo** | Faixa `info` no topo: "Recebedor inativo. Você pode corrigir os dados, mas ele só volta a ser usado depois de reativado." O formulário continua editável |
| Sucesso | Novo: vai ao detalhe do sócio com **"Recebedor cadastrado."**; edição: volta ao detalhe do sócio com "Alterações salvas." |
| Sócio dono inativo (recebedor ativo ainda existente) | Não deve ocorrer (a inativação do sócio inativa os recebedores). Se ocorrer, a faixa diz "O sócio {Nome} está inativo." |

Salvar mudança de chave Pix ou conta **não** pede diálogo (o salvamento é auditado, e o custo de erro é baixo). Se a `seguranca` entender que esses dados exigem confirmação, o padrão de 4.1.8 se aplica (U-C14).

---

## 8. Conflito de edição

Contexto: duas pessoas podem abrir o mesmo cadastro. O plano prevê **controle por data da última alteração** (`updated_at` lido ao abrir o formulário; PROPOSTA do plano, 4.3, critério CA-18): se mudou, o servidor **recusa** e **não sobrescreve** nada. Não há bloqueio de edição ("fulano está editando"): fica fora do escopo.

### 8.1 O que o usuário vê ao salvar um formulário desatualizado (cliente, sócio, recebedor)

1. O formulário **não salva** e **continua aberto**, com o que a pessoa digitou preservado.
2. No topo aparece um `Alert` **`warning`** (`role="alert"`), e o foco vai para ele:
   - Título: **"Este cadastro foi alterado por outra pessoa"**
   - Texto (por tipo): **"Este cliente foi alterado enquanto você editava. Suas alterações não foram salvas."** / "Este sócio foi alterado..." / "Este recebedor foi alterado..."
   - Texto de caminho: **"Carregue a versão atual e refaça a sua alteração."**
   - Botão primário: **"Carregar versão atual"**.
3. Abaixo do botão, **opcional e cortável** (PROPOSTA; U-C10), um bloco recolhível **"O que mudou desde que você abriu"**: uma linha por campo que mudou no servidor, no formato "Mensalidade padrão: R$ 500,00 → R$ 600,00". Depende de o servidor devolver o registro atual junto com o conflito. Outro bloco, **"O que você tinha digitado"**, lista os campos que a pessoa alterou, para ela poder refazer sem perder o texto.
4. **"Carregar versão atual"** troca todos os campos pelos valores atuais do servidor, move o foco para o título da página e anuncia (`role="status"`): **"Dados atualizados. Confira e refaça a sua alteração."** O "O que você tinha digitado" continua visível até a pessoa salvar ou sair.

**Por que não existe "Salvar mesmo assim" no conflito:** o formulário envia o cadastro inteiro. Salvar por cima desfaria também as mudanças da outra pessoa em campos que esta pessoa nem tocou. A única saída é recarregar e refazer.

### 8.2 Conflito dentro do diálogo de confirmação (4.1.8)

O diálogo continua aberto e mostra, no topo, `Alert` `warning`: **"Este cliente foi alterado por outra pessoa enquanto você revisava. Suas alterações não foram salvas."** com os botões **"Recarregar dados"** (fecha o diálogo e recarrega o formulário, como em 8.1) e **"Cancelar"**. O botão "Confirmar e salvar" fica desabilitado.

### 8.3 Estado mudou durante um diálogo de inativação ou reativação

| Caso | Mensagem (texto exato) | Comportamento |
|---|---|---|
| Cliente, sócio ou recebedor já está inativo e o diálogo é de inativar | "Este {cliente, sócio ou recebedor} já está inativo. A tela foi atualizada." | Diálogo fecha, página atualiza |
| Já está ativo e o diálogo é de reativar | "Este {cliente, sócio ou recebedor} já está ativo. A tela foi atualizada." | Idem |
| Lista de clientes ou de recebedores do sócio mudou | Ver 6.1 | Diálogo troca de variante com a lista nova |
| O cadastro deixou de existir ou ficou invisível | "Este cadastro não está mais disponível." | Diálogo fecha; a página mostra "Registro não encontrado" |

### 8.4 Conflito de unicidade ao mesmo tempo

Duas pessoas cadastrando o mesmo documento, nome de sócio, apelido ou chave Pix ao mesmo tempo: a segunda recebe a mensagem de repetido do campo (4.1.2, 4.1.6, 5.2, 7.2), com o link para o cadastro que ganhou. Não há mensagem especial: é o mesmo erro de campo.

---

## 9. Componentes

### 9.1 Existentes, a reutilizar

| Componente | Uso na CAD-001 |
|---|---|
| `PageHeader` | `h1`, descrição e ação primária de todas as telas |
| `Card` (+ Header, Title, Content, Footer) | Cartões de detalhe e de formulário |
| `Table` (+ Header, Body, Row, Head, Cell, Caption) | Listas de clientes, sócios, recebedores e apelidos; primeira coluna com `whitespace-normal`; colunas de valor com `text-right tabular-nums` |
| `Badge` (variantes `success`, `info`, `warning`, `danger`, `outline`) | Situação Ativo/Inativo, "Novo", "Único sócio"; sempre com ícone e texto |
| `Alert` (variantes `info`, `success`, `warning`, `destructive`) + `FormMessage` | Resumos de formulário, faixas de situação, aviso de nome parecido, conflito |
| `FieldError` | Erro de campo com ícone e texto, ligado por `aria-describedby`. **Hoje mora em `components/auth/`**: mover para um local compartilhado (por exemplo, `components/form/`) para uso fora da autenticação |
| `Button` | Todas as ações. Altura de 44 px em celular (padrão `h-11 md:h-9` do shell) |
| `Input`, `Label` | Campos de texto, busca, documento, apelidos |
| `EmptyState`, `ErrorPanel`, `Skeleton` | Vazio, erro de região e carregamento |
| `ForbiddenState` (`access-states`) | Estado 2.7.4 para rotas de edição acessadas por papel sem permissão |
| `buttonVariants` aplicado a `Link` | Links com aparência de botão ("Novo cliente", "Editar") |
| Tokens semânticos `info`, `success`, `warning`, `danger` | Contraste já medido pela FND (UX-34) |

`ModulePage` (placeholder) deixa de ser usado nas três rotas desta feature.

### 9.2 Novos, sem dependência externa (feitos com HTML nativo e Tailwind)

| Componente (PROPOSTA de nome) | Responsabilidade |
|---|---|
| `Breadcrumbs` | `<nav aria-label="Você está em">` com lista ordenada; último item com `aria-current="page"` |
| `StatusBadge` | "Ativo" (`success`, `circle-check`) e "Inativo" (`neutral`, `circle-pause`) |
| `StatusFilter` | Controle segmentado **Ativos / Inativos / Todos** como links (estado na URL) ou rádios nativos; `aria-current` na opção ativa |
| `ListToolbar` | Formulário `role="search"` com campo, filtros, chips e "Limpar filtros" |
| `Pagination` | "1–25 de 128", Anterior/Próxima, seletor "Por página" (padrão FND 2.9.1) |
| `DocumentField` | Rádios "Sem documento / CPF / CNPJ", campo mascarado e mensagens de validação (4.1.2). Reutilizado no apelido do tipo documento |
| `DocumentValue` | Exibe CPF/CNPJ formatado com o rótulo do tipo; opção de máscara (`••• .456.789-••`) controlada por papel, desligada por padrão (U-C05) |
| `MoneyInput` | Campo em reais, com leitura "Valor lido: R$ 1.234,56" (padrão FND 5.3, primeira feature a usar) |
| `MoneyValue` | Exibe valor monetário já formatado (`R$ 1.250,00`, `tabular-nums`, alinhado à direita em tabela). Padrão FND 3.3, primeira feature a usar |
| `PartnerPicker` | Lista de caixas de marcação de sócios ativos + `DivisionPreview` |
| `DivisionPreview` | Texto "{n} sócios · divisão igual: 1/{n} para cada um (≈ {x}%)" com `aria-live`. **Só conta e apresenta**; não calcula dinheiro |
| `EditableList` | Lista de itens com "Adicionar", "Remover" (novo), "Inativar" (salvo), seção de inativos e anúncio de mudanças. Usada em apelidos de cliente, de sócio, variações, chaves Pix e contas (com itens de vários campos) |
| `SimilarClientsAlert` | Aviso `warning` de nome parecido, com a lista e as duas ações (4.1.7) |
| `ConflictAlert` | Aviso `warning` de conflito de edição, com "Carregar versão atual" (seção 8) |
| `CardList` (ou variante responsiva de `Table`) | Cartões para listas abaixo de 768 px |
| `DataList` | Lista de definição (`<dl>`) dos cartões de detalhe |

### 9.3 Novos, vindos do shadcn (**exigem aprovação do responsável**)

Conforme o `CLAUDE.md`, dependência nova exige aprovação. Os dois componentes abaixo são **gerados pelo CLI do shadcn a partir do `@base-ui/react` 1.8.0 já instalado** (a FND 3.3 já os previa). O `desenvolvedor` confirma, ao gerar, que **nenhum pacote npm novo** entra; se entrar, para e pergunta.

| Componente | Motivo | Marca |
|---|---|---|
| **`AlertDialog`** | Todos os diálogos de confirmação, de bloqueio e de descarte (seções 4.1.8, 4.1.9, 6). `alertdialog` com foco inicial no botão seguro, foco preso e retorno do foco ao fechar. Hoje só existe `Sheet` | **APROVAÇÃO NECESSÁRIA** |
| **`Textarea`** | Campos "Motivo (opcional)", "Observações". É uma cópia do estilo do `Input`, sem dependência | **APROVAÇÃO NECESSÁRIA** (trivial) |
| `ConfirmActionDialog` + `ReasonField` (componentes do app sobre `AlertDialog` e `Textarea`) | Padrão da FND 3.3, agora usado pela primeira vez; recebe título, corpo, lista, rótulo do botão, estado "em andamento" e o campo de motivo | Interno |

**Deliberadamente não propostos** (para não ampliar dependências): `Select`/`Combobox` (o filtro "Sócio" usa `<select>` nativo estilizado como o `Input`), `Checkbox` (usa `<input type="checkbox">` nativo), `Tabs`, `Dropdown`/menu de ações, `Tooltip`, `Toast`. Se o resultado visual do `<select>` e da caixa nativos for insuficiente, a troca pelo `Checkbox` e pelo `Select` do shadcn vira um pedido de aprovação à parte.

---

## 10. Estados (resumo por tela)

Detalhes de cada estado estão nas seções indicadas. "—" = não se aplica.

| Tela | Normal | Carregando | Vazio | Erro | Sucesso | Pendência | Bloqueio |
|---|---|---|---|---|---|---|---|
| C1 Lista de clientes (3) | Tabela / cartões | Esqueleto | Primeiro uso (Administrador, sem sócio ou com sócio) e (Op/Vis); sem resultado de filtro | `ErrorPanel` de região | `Alert` persistente vindo de ação | — | Botões de escrita ocultos para Op/Vis |
| C2/C4 Formulário de cliente (4.1) | Formulário | Esqueleto (edição); botão "Salvando…" | Nenhum sócio ativo: lista substituída por aviso | Erro por campo, resumo, erro geral, conflito (8) | Vai ao detalhe com `Alert` | Aviso de nome parecido (4.1.7); cliente inativo sem sócio (4.1.4) | "Salvar" desabilitado sem sócio ativo; "Sem permissão" para Op/Vis |
| C3 Detalhe do cliente (4.2) | Cartões | Esqueleto | Sem sócio; sem apelidos; sem observações | `ErrorPanel`; "Registro não encontrado" | `Alert` persistente | Faixa "Cliente inativo" | Sem botões para Op/Vis; reativar sem sócio abre bloqueio (6.4 B) |
| S1 Lista de sócios (5.1) | Tabela / cartões | Esqueleto | Nenhum sócio; nenhum inativo; sem resultado | `ErrorPanel` de região | `Alert` persistente | — | "Sem permissão" para não Administrador |
| S2/S4 Formulário de sócio (5.2) | Formulário | Esqueleto; "Salvando…" | — | Por campo, resumo, conflito | Vai ao detalhe com `Alert` | — | — |
| S3 Detalhe do sócio (5.3) | Cartões | Esqueleto | Sem recebedores; sem clientes; sem apelidos | `ErrorPanel` de página e de região | `Alert` persistente | Faixa "Sócio inativo"; aviso de login vinculado (condicional) | Inativar com cliente: bloqueio (6.1 A); sem "Novo recebedor" se inativo |
| R1/R2 Recebedor (7) | Formulário | Esqueleto; "Salvando…" | — | Por campo, resumo, conflito | Volta ao sócio com `Alert` | Faixa "Recebedor inativo" | Sócio inativo: formulário substituído pelo bloqueio; reativar com sócio inativo (6.5 B) |
| A1 Apelidos (5.4) | Tabela / cartões | Esqueleto | Nenhum apelido; sem resultado | `ErrorPanel` de região | — | — | "Sem permissão" para não Administrador |
| Diálogos (6, 4.1.8, 4.1.9) | Resumo + motivo + botões | Botão em gerúndio, Esc travado | — | `Alert` `danger` dentro do diálogo | Fecha e mostra `Alert` na página | — | Variantes de bloqueio sem ação de confirmar |

---

## 11. Responsividade

Pontos de quebra da FND: celular < 768 px, tablet 768 a 1023 px, desktop ≥ 1024 px.

| Elemento | Celular | Tablet | Desktop |
|---|---|---|---|
| Listas (clientes, sócios, recebedores, apelidos) | **Lista de cartões** | Tabela com rolagem horizontal e primeira coluna fixa | Tabela completa |
| Barra de busca e filtros | Empilhada, largura total, alvos de 44 px | Em uma ou duas linhas | Em uma linha |
| Controle "Sem documento / CPF / CNPJ" e "Ativos / Inativos / Todos" | Três botões em linha, cada um com no mínimo 44 px de altura; texto não quebra | Idem | Idem |
| Cabeçalho de página | Título e, abaixo, ação em largura total | Título e ação na mesma linha | Título à esquerda, ações à direita |
| Formulários | Uma coluna, `max-w-2xl` ocupa a largura útil; rodapé com botões empilhados (primário em cima) | Uma coluna | Uma coluna, `max-w-2xl` |
| Lista de sócios do cliente (`PartnerPicker`) | Uma coluna | Duas colunas | Duas colunas |
| Conta bancária (3 campos) | Campos empilhados | Em linha | Em linha |
| Diálogos | Largura útil, conteúdo rolável e rodapé de ações fixo | `max-w-lg` centralizado | `max-w-lg` centralizado |
| Lista de clientes dentro do diálogo de bloqueio | Altura máxima com rolagem; links com 44 px | Idem | Idem |
| Trilha de navegação | Mostra só "← {nível anterior}" para não quebrar em várias linhas (a trilha completa fica disponível ao leitor de tela) | Completa | Completa |

Regras gerais: nada depende de `hover`; nada é ocultado por ser "pequeno demais" (se não cabe, reorganiza); zoom de 200% e fonte maior do sistema não podem quebrar o layout nem esconder controles; campos de texto com no mínimo 16 px no celular (evita zoom automático no iOS); o teclado virtual não pode cobrir o campo em foco nem os botões de rodapé (rolar até o campo).

---

## 12. Acessibilidade e textos

Meta: **WCAG 2.2 AA** (padrão da FND 7). Esta seção só acrescenta o que é específico da CAD-001.

### 12.1 Diálogos (`AlertDialog`)

- `role="alertdialog"`, com **título** ligado por `aria-labelledby` e **corpo** ligado por `aria-describedby` (o resumo e a consequência; a lista fica fora da descrição lida, mas é alcançável).
- **Foco inicial** no botão seguro: "Cancelar", "Fechar", "Voltar e revisar" ou "Continuar editando". Nos diálogos de bloqueio, em "Fechar". **Enter acidental nunca confirma.**
- Foco **preso** dentro do diálogo; **Esc fecha** (exceto durante o envio); ao fechar, o foco **volta ao botão que abriu** ou, se ele deixou de existir, ao título da página.
- Listas dentro do diálogo: `<ul>` com nome acessível ("Clientes que indicam {Nome}", "Recebedores que serão inativados"); se rolarem, a região tem `tabindex="0"`, `role="region"` e `aria-label`.
- Em andamento: botão com `aria-disabled` e texto em gerúndio; região `role="status"` oculta anuncia "Inativando, aguarde".
- Resultado: após fechar, a mensagem de sucesso da página é `role="status"` e o foco vai ao título.
- Erro dentro do diálogo: `Alert` com `role="alert"`, anunciado sem mover o foco do botão.
- Fundo da página inerte enquanto o diálogo está aberto.

### 12.2 Formulários e campos

- Todo campo tem `<label>` associado; ajuda e erro ligados por `aria-describedby`; `aria-invalid="true"` só no campo realmente inválido; `aria-required="true"` nos obrigatórios.
- Grupos (`documento`, `sócios`, `apelidos`) em `fieldset` + `legend`. Erro de grupo ligado ao `fieldset`.
- **Resumo de erros** no topo (`role="alert"`) com links para cada campo; o foco vai ao resumo quando há mais de um erro e ao campo quando há um só.
- **Máscara** de documento e de valor: o campo continua aceitando colar, e o leitor de tela lê o valor mascarado; a máscara **não** impede apagar nem corrigir no meio do texto; o cursor não pula.
- **Prévia da divisão** e linha "Valor lido": regiões `aria-live="polite"`, sem repetir a cada tecla (a mensagem muda ao sair do campo ou ao marcar/desmarcar).
- **`EditableList`:** cada botão tem nome acessível com o texto do item; ao adicionar, o foco volta ao campo de inclusão e o anúncio diz "Apelido “{texto}” adicionado."; ao remover ou inativar, o foco vai ao próximo item (ou ao campo de inclusão, se era o último).
- **Controle segmentado** (documento e situação): `radiogroup`/rádios nativos navegáveis por setas; a opção selecionada tem texto, não só fundo.
- `autoComplete="off"` nos campos de documento, apelido, Pix e conta (o navegador não deve sugerir dados de outra pessoa).
- Alvos de toque de pelo menos 24 × 24 px em qualquer lugar e 44 px para ações primárias no celular.

### 12.3 Listas e tabelas

- `<table>` real com `<caption>`, `<th scope="col">`; primeira coluna com `<th scope="row">` quando for o nome. Sem tabela feita de `div`.
- Lista de cartões no celular: `<ul>`/`<li>` com o nome como título; mesma informação da tabela, na mesma ordem.
- **Situação nunca só por cor:** selo com ícone e texto. Linha de cliente inativo continua legível, sem opacidade reduzida no texto.
- Valores monetários lidos como texto completo ("R$ 1.250,00"). A divisão é lida como a frase completa da prévia.
- Contagem de resultados em `role="status"`.
- Ordenação (se entrar): botão no `th`, `aria-sort`, rótulo "Ordenar por {coluna}".

### 12.4 Cor e contraste

- Tons `info`, `success`, `warning`, `danger` da FND; texto de cada tom com 4,5:1 sobre o fundo. Aviso de nome parecido e de conflito usam `warning` (âmbar) com ícone e título, nunca só cor. Vermelho só em erro.
- Foco visível em todo controle, anel com 3:1 (token da FND).

### 12.5 Textos: regras

- **pt-BR simples**, tratamento neutro ("você"), frases curtas, verbos de ação nos botões, sem pontos de exclamação, sem jargão ("RLS", "token", "SQLSTATE", "UUID", "normalizado", "alias" não aparecem).
- **Um verbo por ação em todo o sistema:** **Inativar / Reativar** (cadastros e itens de lista). **Remover** só para um item que ainda não foi salvo. Não se usa "excluir", "apagar" nem "desativar".
- Datas `dd/mm/aaaa`; horas `hh:mm`; fuso `America/Sao_Paulo`. Valores `R$ 1.234,56`.
- **Mensagens de erro dizem o campo e como corrigir**; nunca culpam a pessoa. Erro esperado em português; erro inesperado com "Código de suporte".
- Botões de confirmação com rótulo específico: nunca "OK", "Sim", "Confirmar" sozinho (a exceção é "Confirmar e salvar" no diálogo de alterações, que diz o que fará).

**Vocabulário (RAT-D017, RAT-D015):**

| Usar | Não usar |
|---|---|
| Sócio, Sócios | Parte, Indicador |
| Cliente. Tipo do cliente: só "CPF" ou "CNPJ" (o tipo do documento); sem documento, sem tipo | Empresa (nem como entidade nem como tipo), Pessoa física, Pessoa jurídica (RAT-D017, complemento de 26/11/2026) |
| Recebedor | Beneficiário como nome de entidade; "conta" solta como se fosse a entidade |
| Apelido (menu e telas); "alias" só no código e no banco | Alias, apelido-chave, sinônimo |
| Mensalidade padrão | Valor fixo, percentual, cota, fração configurável |
| "divisão igual" e "1/n para cada um" | "percentual do sócio", "participação", "% por sócio", "Total 100%" |
| Inativar, Reativar, Inativo | Excluir, Apagar, Desativar, Bloquear |
| Motivo (opcional) | Justificativa obrigatória |

---

## 13. Critérios UI/UX para o QA

Cada item é verificável. IDs com prefixo `UXC`. "Op/Vis" = Operador e Visualizador.

### Vocabulário e valores

- **UXC-01.** Nenhuma tela, mensagem ou título usa "Parte", "Indicador", "Alias", "Empresa", "Pessoa física" ou "Pessoa jurídica" (**sem exceção**: nem como entidade, nem como tipo do cliente; o tipo é só "CPF" ou "CNPJ"), nem "excluir", "apagar" ou "desativar". A conferência olha o texto da interface; nome de cliente fictício digitado em teste (dado, não vocabulário) não conta. Fecha o QA-CAD-02.
- **UXC-02.** Nenhuma tela tem campo editável de percentual nem a linha "Total 100%". A divisão aparece só como texto derivado "1/n" com percentual aproximado, e nenhum valor em reais por sócio.
- **UXC-03.** O percentual só leva "≈" quando não é exato: 3 sócios mostra "≈ 33,33%"; 2 mostra "50%"; 4, "25%"; 6, "≈ 16,67%"; 1 mostra "1/1 (100%)".
- **UXC-04.** Valores de mensalidade aparecem como `R$ 1.250,00`, alinhados à direita em tabela e com algarismos tabulares. A coluna se chama "Mensalidade padrão" e não usa ícone nem tom de Recebido/Devido/Saldo.
- **UXC-05.** Datas em `dd/mm/aaaa` e horas em `hh:mm`.

### Papéis e telas

- **UXC-06.** Operador e Visualizador veem Clientes (lista e detalhe) e **não veem** nenhum botão de criar, editar, inativar ou reativar; não veem Configurações > Sócios nem Apelidos no menu; ao abrir essas URLs ou `/clientes/novo` ou `/clientes/[id]/editar`, veem "Sem permissão".
- **UXC-07.** O Administrador vê todas as telas e ações. O papel Sócio vê "Acesso de sócio ainda não disponível" em qualquer rota.
- **UXC-08.** No detalhe do cliente, o nome dos sócios é link só para o Administrador.
- **UXC-09.** Recebedores, chaves Pix e contas não aparecem para Op/Vis em nenhuma tela.
- **UXC-10.** Menu: Clientes, Sócios e Apelidos deixam de ter o selo "Em breve"; o item "Apelidos" tem o rótulo aprovado em U-C06.

### Lista de clientes

- **UXC-11.** A lista mostra nome (com nome fantasia), documento formatado ("Sem documento" quando vazio), mensalidade, sócios com "n sócios · 1/n cada" e situação (selo com ícone e texto).
- **UXC-12.** Busca por nome, nome fantasia, documento (com e sem pontuação) e apelido; filtros de situação (padrão **Ativos**) e de sócio; "Limpar filtros" aparece só com filtro aplicado; busca e filtros ficam na URL e sobrevivem ao recarregar.
- **UXC-13.** Paginação no servidor com "1–25 de N"; 25, 50 e 100 por página.
- **UXC-14.** Estados: esqueleto no carregamento; vazio em quatro variantes (sem sócio, com sócio, Op/Vis, sem resultado); erro com "Tentar novamente" e código de suporte. Sem texto técnico.
- **UXC-15.** Abaixo de 768 px a tabela vira lista de cartões com a mesma informação; sem rolagem horizontal da página.

### Formulário de cliente

- **UXC-16.** Documento com três opções (Sem documento, CPF, CNPJ), padrão "Sem documento". Trocar de tipo esvazia o número. CPF mascarado `000.000.000-00`; CNPJ mascarado `AA.AAA.AAA/AAAA-00`, aceita letras e números nas 12 primeiras posições e converte minúsculas em maiúsculas; ambos aceitam colar com ou sem pontuação.
- **UXC-17.** Mensagens de documento exatamente como na tabela de 4.1.2 (incompleto, inválido, repetido ativo, repetido inativo). O repetido traz link "Abrir cliente" ou "Abrir cliente inativo" que leva ao detalhe do cliente existente.
- **UXC-18.** Mensalidade: vazio, zero, mais de 2 casas e formato ilegível mostram as mensagens de 4.1.3; "1.234,56" é lido como R$ 1.234,56 e exibido em "Valor lido"; "1234.56" é recusado.
- **UXC-19.** Seleção de sócios lista só sócios ativos; a prévia muda ao marcar e desmarcar, é anunciada por leitor de tela, e não existe campo de percentual. Sem sócio marcado em cliente ativo: erro "Escolha pelo menos um sócio. Todo cliente ativo precisa de um." Sem sócio ativo no sistema: aviso com link e botão "Salvar" desabilitado com motivo escrito.
- **UXC-20.** Aviso de nome parecido: aparece como `warning`, lista os clientes parecidos (nome, documento, situação, motivo), oferece "Salvar mesmo assim" e "Revisar dados", **não impede** salvar e some se o nome mudar.
- **UXC-21.** Apelidos: "Adicionar" e Enter adicionam sem enviar o formulário; itens salvos têm "Inativar" (não "Remover"); inativos ficam em seção recolhida com "Reativar"; mensagens de 4.1.6.
- **UXC-22.** Na edição, mudar sócios ou documento abre "Confirmar as alterações em {Nome}?" com antes e depois, o aviso "A troca de sócios vale daqui em diante...", o campo "Motivo (opcional)" e foco inicial em "Voltar e revisar". Confirmar **sem** motivo funciona.
- **UXC-23.** Formulário alterado: "Cancelar" e links de saída pedem "Descartar as alterações?" com foco inicial em "Continuar editando".
- **UXC-24.** Erro de envio: resumo no topo com links, valores preservados, foco no resumo (vários erros) ou no campo (um erro). Sucesso: detalhe com "Cliente cadastrado." ou "Alterações salvas.", persistente, e foco no título.

### Detalhe do cliente e inativação

- **UXC-25.** O detalhe mostra dados, documento, mensalidade, sócios com "n sócios · divisão igual: 1/n para cada um (...)", apelidos e datas. Cliente inativo mostra a faixa "Cliente inativo".
- **UXC-26.** "Inativar cliente" abre o diálogo com o texto de 6.3, "Motivo (opcional)", foco inicial em "Cancelar" e botão "Inativar cliente". Sem motivo, conclui. Sucesso: "Cliente inativado."
- **UXC-27.** "Reativar cliente" com sócio ativo abre 6.4 A e conclui com "Cliente reativado."; sem sócio ativo abre 6.4 B (bloqueio, sem confirmar) com o botão "Editar cliente".

### Sócios e recebedores

- **UXC-28.** O formulário de sócio tem só nome e apelidos, sem documento nem percentual. Nome repetido e apelido repetido mostram as mensagens de 5.2 (com variante de inativo).
- **UXC-29.** "Inativar sócio" de um sócio presente em qualquer cliente (ativo **ou inativo**) abre o diálogo de bloqueio 6.1 A: texto com a contagem, lista completa de clientes com situação e selo "Único sócio" quando for o caso, texto "Como retirar", botões "Fechar" e "Ver clientes deste sócio"; **não há** botão de confirmar.
- **UXC-30.** "Inativar sócio" sem clientes e com recebedores ativos abre 6.1 B com a lista dos recebedores, o texto "Ao reativar o sócio, os recebedores continuam inativos...", "Motivo (opcional)" e o botão "Inativar sócio e {n} recebedores"; sucesso mostra "Sócio inativado. {n} recebedores inativados junto." Sem recebedores abre 6.1 C.
- **UXC-31.** "Reativar sócio" mostra 6.2; depois da reativação, os recebedores continuam inativos e o sócio não volta aos clientes.
- **UXC-32.** O detalhe do sócio mostra recebedores (com filtro Ativos/Inativos), clientes do sócio (com a nota sobre a inativação) e apelidos; sócio inativo não mostra "Novo recebedor".
- **UXC-33.** Formulário de recebedor: **nome do titular** obrigatório; variações do nome, chaves Pix e contas bancárias (banco, agência, conta) opcionais; **sem** CPF/CNPJ do titular e sem outro dado financeiro; o sócio dono aparece só em leitura, com a frase de que não pode mudar. O aviso "Guarde só o que aparece nos comprovantes..." está visível.
- **UXC-34.** Inativar e reativar recebedor usam os textos de 6.5; reativar com sócio inativo mostra o bloqueio.
- **UXC-35.** A lista de Apelidos é só leitura, tem busca ("A busca ignora acento, maiúscula e pontuação."), filtro por tipo e situação, e cada linha leva ao cadastro dono.

### Conflito, estados e erros

- **UXC-36.** Editar com dado desatualizado **não salva** e mostra "Este cadastro foi alterado por outra pessoa" com "Carregar versão atual"; não existe "Salvar mesmo assim".
- **UXC-37.** Estados de carregamento, vazio, erro e sucesso existem em todas as telas da seção 10, com o texto exato das seções 3 a 7.
- **UXC-38.** Nenhuma mensagem mostra stack, SQLSTATE, nome de tabela ou texto em inglês. Erro inesperado mostra "Código de suporte".
- **UXC-39.** Sessão expirada durante a ação leva ao login com o aviso da FND e a ação não aparece como concluída.

### Acessibilidade

- **UXC-40.** Todo o fluxo (lista, formulário, diálogos, inativação) é operável só pelo teclado, com ordem de tabulação igual à visual e foco sempre visível.
- **UXC-41.** Diálogos: `alertdialog` com título e descrição; foco inicial no botão seguro; foco preso; Esc fecha (exceto em andamento); foco volta ao botão de origem.
- **UXC-42.** Todo campo tem rótulo visível; erros e ajudas ligados por `aria-describedby`; grupos em `fieldset`/`legend`; resumo de erros com links.
- **UXC-43.** Selos e estados têm texto e ícone; a situação, o aviso de nome parecido e o conflito se entendem em escala de cinza.
- **UXC-44.** Prévia da divisão, "Valor lido", contagem de resultados e anúncios de lista são lidos por leitor de tela sem repetir a cada tecla.
- **UXC-45.** Contraste de texto 4,5:1 e de controles/foco 3:1 (medidos). Zoom de 200% sem perda de função. Alvos de toque de 44 px no celular nas ações primárias.
- **UXC-46.** Cada página tem `<title>` único ("{Página} · Financeiro Ultra") e um único `h1`.

---

## 14. Pendências de UX

Classificação: **PROPOSTA** (o design recomenda e segue assim se aprovado) ou **DECISÃO PENDENTE** (depende de outro papel ou do responsável). Nenhuma bloqueia a implementação das telas na ordem do plano, salvo onde indicado.

Situação em 26/11/2026 (revisão pós-implementação): **RESOLVIDA** (respondida pelo responsável, pelo Brain ou pela modelagem, e já refletida na tela), **SEGUIDA** (a implementação seguiu a proposta; sem objeção registrada), **EM ABERTO** (continua dependendo de alguém) ou **FORA DESTA ENTREGA**. As colunas "Classe" e "Quem decide" guardam o que valia na entrega do G2.

| ID | Tema | Classe (G2) | Quem decide | Situação em 26/11/2026 |
|---|---|---|---|---|
| **U-C01** | **Salvamento único** de dados, sócios e apelidos do cliente (e de nome e apelidos do sócio) numa só operação atômica | DECISÃO PENDENTE | `modelagem-dados` / engenheiro | **RESOLVIDA.** Aceito na modelagem (02, 6.0): `save_partner`, `save_receiver` e `save_client` gravam tudo ou nada, com a lista final de apelidos. Implementado nas E5a, E5b e E6b. A tela não precisa de mensagem de "salvou os dados e falhou nos apelidos" |
| **U-C02** | Erro de documento, apelido, nome de sócio, chave Pix ou conta repetidos devolve **id, nome e situação** do dono | DECISÃO PENDENTE | `modelagem-dados` | **RESOLVIDA.** O servidor devolve o dono (só depois de `require_admin()`); a tela mostra "Abrir cliente", "Abrir cliente inativo", "Abrir sócio", "Abrir sócio inativo" e "Abrir recebedor". Mantém o caminho para reativar (RAT-D024) |
| **U-C03** | **Tipos de apelido** | DECISÃO PENDENTE | `modelagem-dados` | **RESOLVIDA.** Cliente: Nome, CPF e CNPJ (no banco, `NAME` e `DOCUMENT`). Sócio e recebedor: só texto. O seletor "Tipo" existe só no cliente |
| **U-C04** | Um recebedor tem **várias** chaves Pix e **várias** contas? | PROPOSTA | Responsável / `modelagem-dados` | **RESOLVIDA.** Sim, várias, como identificadores tipados (modelagem 2.7). Listas editáveis, como especificado |
| **U-C05** | **Mascarar** CPF do cliente para Op/Vis e chave Pix/conta na lista de Apelidos | DECISÃO PENDENTE | `seguranca` / responsável | **RESOLVIDA pelo responsável (RAT-D023, "Ver completo").** Ninguém tem máscara de CPF/CNPJ, chave Pix ou conta, em nenhuma tela. A **leitura** continua pela matriz do plano: Operador e Visualizador veem o documento completo do cliente; chaves Pix e contas só o Administrador lê. Consequência para a UI: não há modo mascarado a construir (`DocumentValue` mostra sempre o valor inteiro) e a lista de Apelidos mostra chave e conta completas, só ao Administrador |
| **U-C06** | Rótulo do menu **"Apelidos"** e **manter a rota** `/configuracoes/aliases` | PROPOSTA | Responsável | **SEGUIDA.** Menu "Apelidos" e rota mantida (E5a); sem "Em breve" desde a E7 parte 1 (UXC-10) |
| **U-C07** | **Aviso de login vinculado** ao sócio | DECISÃO PENDENTE | `modelagem-dados` / `seguranca` | **RESOLVIDA.** A leitura já existe para o Administrador (modelagem 11.7); o aviso aparece no detalhe do sócio e some se a leitura falhar |
| **U-C08** | Frases sobre **o que muda depois** de inativar cliente (lançar recebimentos) e recebedor (comprovante vai para revisão) | DECISÃO PENDENTE | Features Recebimentos e Reconhecimento | **EM ABERTO.** Os textos de 6.3 e 6.5 seguem só com o que já está decidido. A frase do recebedor ("deixa de ser usado para reconhecer comprovantes novos") continua a confirmar pela feature de Reconhecimento |
| **U-C09** | Aviso de **nome parecido** na edição só quando o nome ou um apelido mudou | PROPOSTA | Responsável | **RESOLVIDA.** Vale para nome, nome fantasia e apelidos de nome (modelagem 6, passo 6; pgTAP "edição sem reavisar"). O escopo do aviso foi ampliado pela RAT-D024 (ver 4.1.7 e seção 16) |
| **U-C10** | Itens **cortáveis**: ordenação por coluna; contagens na lista de sócios; "Ver inativos" no sem resultado; "O que mudou" e "O que você tinha digitado" no conflito | PROPOSTA | Orquestrador | **RESOLVIDA (cortes confirmados).** Entraram: contagens na lista de sócios, "Ver inativos" no sem resultado e "O que você tinha digitado". Ficaram fora: ordenação por clique no cabeçalho (P-E6a-03) e "O que mudou desde que você abriu" (D-E6b-06). Nenhuma regra muda |
| **U-C11** | **Trocar um sócio em vários clientes de uma vez** (lote) para facilitar a RAT-D025 | FORA DE ESCOPO (sugestão) | Responsável | **EM ABERTO (sugestão).** Não faz parte desta feature; o diálogo de bloqueio já lista os clientes e leva ao filtro |
| **U-C12** | Opcionais de agilidade: verificar documento repetido ao sair do campo e botão "Salvar e cadastrar outro" | PROPOSTA (opcional) | Responsável | **FORA DESTA ENTREGA.** Nenhum dos dois entrou; a duplicidade só aparece ao salvar. Segue como sugestão para quando houver cadastro em volume |
| **U-C13** | **Limites de tamanho** | DECISÃO PENDENTE | `modelagem-dados` | **RESOLVIDA (modelagem 6.0).** Nome, razão social, nome fantasia, titular, apelido e variação: 200. Observações: 2000 (contador "{n} de 2000"). Chave Pix: 100. Banco: 100. Motivo: 500 na tela. Mensalidade: só o teto técnico do banco, com a mensagem "O valor é alto demais. Confira se digitou certo." |
| **U-C14** | Exigir diálogo com motivo ao **renomear sócio** e ao **trocar chave Pix ou conta** de recebedor? | PROPOSTA | `seguranca` / responsável | **SEGUIDA; confirmação pendente.** Implementado como proposto (salva direto, sem diálogo). A `seguranca` ainda deve confirmar na revisão da E8; se exigir, vale o padrão de 4.1.8 |
| **U-C15** | **"Observação" do recebedor** não entra na tela | PROPOSTA | Responsável | **RESOLVIDA.** Fora, como a RAT-D023 e a modelagem (D-04) |
| **U-C16** | Apelidos **inativos** do cliente só aparecem ao Administrador | PROPOSTA | Responsável | **RESOLVIDA.** Garantido no RLS de `client_aliases`; a tela já mostra "Apelidos inativos" só ao Administrador |
| **U-C17** | Mensagem de sucesso após redirecionar | PROPOSTA | `desenvolvedor` | **RESOLVIDA.** Aviso por `?aviso=<chave>` com chaves fixas (a mensagem nunca vem da URL), persistente, com "Dispensar" |
| **U-C18** (nova) | **Primeira coluna fixa no tablet** (3.4) não foi feita (P-E6a-03) | PROPOSTA | Responsável / `qa` | **EM ABERTO.** Recomendo aceitar o corte se, entre 768 e 1023 px, a página não tiver rolagem horizontal fora da tabela (UXC-15). Se tiver, a coluna "Cliente" fixa volta ao escopo |
| **U-C19** (nova) | **Estado mudou dentro do diálogo de inativar ou reativar** (8.3): o código deixa o diálogo aberto, com a frase do erro e o botão "Atualizar a tela", em vez de fechar sozinho | PROPOSTA | Responsável | **SEGUIDA (aceita pelo design).** O usuário vê o que houve e escolhe atualizar. Só a frase muda (seção 16, T-18) |

### 14.1 Divergências encontradas (reportadas, não corrigidas)

1. **Plano (rev. 2) × RAT-D023.** O plano lista "documento do titular (CPF ou CNPJ)" como identificador do recebedor (R-R04) e a PEND-1 o recomenda. A RAT-D023 diz que **o CPF/CNPJ do titular não é guardado**. Esta especificação **segue a RAT-D023**: não há campo de documento no recebedor. O plano, o fluxo de reconhecimento (Brain 08: "documento → identificador bancário → alias → nome") e a modelagem precisam refletir isso.
2. **Plano (R-S04) × RAT-D025.** O plano diz "cliente ativo"; a RAT-D025 estendeu a regra para clientes **ativos e inativos** e (como o plano já sugeria em R-S04b) isso é o que a tela mostra no bloqueio. Esta especificação segue a RAT-D025.
3. **Plano (PEND-2) × RAT-D025.** A cascata de recebedores foi decidida ("inativar junto"); a tela implementa a variante B de 6.1.
4. **FND 5.1 (nível 2) × plano, seção 7.** O padrão da FND coloca o campo "Motivo (opcional)" no nível 3; o plano pede o campo também em inativar, reativar, trocar sócios e trocar documento. Esta especificação **usa o campo nos diálogos de nível 2**, o que a RAT-D021 permite (motivo opcional, nunca bloqueia).
5. **Navegação.** `src/lib/navigation.ts` descreve Sócios como "sócios e de seus aliases" e usa o rótulo "Aliases"; as descrições mudam conforme 2.2. `FieldError` está dentro de `components/auth/`.
6. **Brain, Dominio 02.** A RAT-D024 revisa "Cliente: Empresa pagadora; atributo CNPJ". Os rótulos da interface já seguem a RAT-D024; o Brain é registrado pelo orquestrador (esta especificação não o edita).

**Situação das divergências em 26/11/2026:**

| # | Situação |
|---|---|
| 1 | **Resolvida.** O plano (revisão 3) e a modelagem seguem a RAT-D023; o recebedor não tem documento do titular |
| 2 e 3 | **Resolvidas.** O plano (revisão 3) incorporou a RAT-D025 (clientes ativos e inativos; recebedores inativados junto) |
| 4 | **Mantida como está.** O campo "Motivo (opcional)" nos diálogos de nível 2 é o que a RAT-D021 permite e o que foi implementado |
| 5 | **Resolvida.** O menu diz "Apelidos" e as descrições foram trocadas (E5a); `FieldError` está em `components/form/` |
| 6 | **Resolvida no Brain.** A `02-Dominio` traz a revisão da RAT-D024 (cliente pessoa física ou empresa) |

---

## 15. Handoffs e gate G2

### 15.1 O que a UI espera do servidor (insumo para a `modelagem-dados` e o `desenvolvedor`; PROPOSTA)

| Necessidade | Onde a UI usa |
|---|---|
| Lista de clientes paginada, com nome, nome fantasia, documento, mensalidade, **nomes dos sócios indicados e a contagem**, situação; busca por nome, fantasia, documento e apelido; filtro por situação e por sócio; contagem total e (opcional) contagem de inativos que casam | C1 |
| Erro de repetição que devolve `{id, nome, situação}` do cadastro existente (documento, apelido, nome de sócio, chave Pix, conta) | 4.1.2, 4.1.6, 5.2, 7.2 |
| Consulta de **clientes com nome parecido** (nome normalizado igual ou apelido ativo igual), com nome, documento, situação e motivo; e **confirmação** do aviso enviada ao salvar | 4.1.7 |
| Para um sócio: **todos os clientes que o indicam** (ativos e inativos), com situação e a marca "único sócio" quando o cliente ativo só tem ele; **recebedores ativos**; contagens | 5.1, 5.3, 6.1 |
| Controle de concorrência por data da última alteração, e **registro atual** devolvido no conflito (opcional, para "O que mudou") | Seção 8 |
| Parâmetro de **motivo opcional** em inativar, reativar, trocar sócios e trocar documento | Seção 6, 4.1.8 |
| Mensagens esperadas mapeadas para código de erro (nunca SQLSTATE na tela) | Todas |

### 15.2 Para o `desenvolvedor` (E5a a E7)

- Construir as telas na ordem do plano, reaproveitando a seção 9. **Aprovação necessária** antes de gerar `AlertDialog` e `Textarea` (9.3).
- Liberar os itens de menu (2.2) só quando a tela correspondente estiver pronta.
- Não escrever regra de negócio na tela: documento (dígitos), unicidade, bloqueio de inativação e "cliente ativo com sócio" são do banco; a tela só mostra o que o servidor devolve e repete validações simples para a mensagem.
- Seeds e testes com nomes fictícios (RAT-D019) e documentos só com dígito verificador válido ou, nos testes de tela, máscaras inválidas.

### 15.3 Para o `qa` (E9)

- Usar os critérios `UXC-01` a `UXC-46` (seção 13) com os `CA-19`, `CA-20` e `CA-21` do plano.
- Testar com teclado, leitor de tela, 200% de zoom, 375 px de largura e escala de cinza.

### 15.4 Gate G2

A especificação cobre as oito entregas obrigatórias do agente (jornada, estrutura, componentes, estados, interações, responsividade, acessibilidade e critérios) e as oito partes do pedido. Está **pronta para o gate G2**, com as pendências da seção 14. A **U-C01** (salvamento único) deve ser respondida pela modelagem (G1) antes de a E6a começar; as demais não bloqueiam.



---

## 16. Revisão pós-implementação (26/11/2026)

**O que foi feito.** Conferi, só por leitura do código (sem navegador), os textos de tela que os desenvolvedores criaram nas etapas E5a, E5b, E6a, E6b, E6c e E7 parte 1 porque não estavam nesta especificação. Fontes: `src/domain/cadastros/*-view.ts`, `client-form.ts`, `receiver-*.ts`, `src/lib/cadastro-errors.ts`, `src/app/(app)/**/_components/*.tsx` e as páginas, mais os desvios D-E5a, D-E5b, D-E6a, D-E6b, D-E6c e D-E7a do `04-implementacao.md`.

**Régua.** pt-BR simples; Sócio, Cliente e Recebedor; Inativar e Reativar (12.5); a mensagem diz o campo e como corrigir; sem jargão; coerente com as RAT-D023, D024 e D025.

**Resultado.** 39 textos (ou grupos do mesmo tipo): **30 aprovados** e **9 a ajustar** (T-06, T-08, T-12, T-18, T-23, T-24, T-26, T-31 e T-38). Nenhum ajuste muda regra de negócio. Os ajustes de texto são do `desenvolvedor`; os testes que citam a frase antiga acompanham.

### 16.1 O que mudou nas decisões e como a tela reage

| Decisão | Efeito na interface |
|---|---|
| **U-C05 decidida (RAT-D023, "Ver completo")** | Nenhum CPF, CNPJ, chave Pix ou conta é mascarado, para nenhum papel. Não há modo mascarado a construir. A matriz de leitura não muda: Operador e Visualizador veem o documento do cliente; chaves Pix e contas só o Administrador lê |
| **Chave Pix pode ser CPF ou CNPJ (RAT-D023)** | O campo "Nova chave Pix" é texto livre, como no comprovante: **sem máscara e sem conferência de dígitos de CPF/CNPJ**. A ajuda atual ("Pode ser CPF, CNPJ, e-mail, telefone ou chave aleatória.") já diz isso e fica. Na lista, a chave aparece como foi digitada, sem rótulo "CPF" |
| **Aviso de duplicado (RAT-D024, 26/11/2026)** | Vale para qualquer cliente com o mesmo nome normalizado (com ou sem documento; o nome fantasia conta como nome) **e** para um apelido igual ao nome ou ao nome fantasia de outro cliente. O título e o motivo "apelido igual" do aviso mudam (T-06 e T-08) |

### 16.2 Lista e detalhe de clientes (E6a)

| # | Onde aparece | Texto atual | Veredito |
|---|---|---|---|
| T-01 | Lista de clientes, ajuda do campo de busca | "Nome, nome fantasia, CPF, CNPJ ou apelido. A busca ignora acento, maiúscula e pontuação." | Aprovado. Junta a ajuda de 3.1 com a regra da busca. **Revisada na E10:** a frase agora é "Nome, nome fantasia, apelido, ou o começo do CPF ou do CNPJ. A busca ignora acento, maiúscula e pontuação." (ver 17, T-01) |
| T-02 | Lista de clientes, chips dos filtros (D-E6a-08) | "Filtros aplicados"; "Busca: {texto}"; "Sócio: {Nome}" (com "(inativo)"); "Situação: Inativos" ou "Todos"; "Remover o filtro Busca: {texto}" e equivalentes | Aprovado. O filtro vindo do detalhe do sócio fica visível e removível, com nome acessível por chip |
| T-03 | Lista de clientes, vazio por situação (D-E6a-06) | "Nenhum cliente ativo." com "Ver inativos"; "Nenhum cliente inativo." com "Ver ativos" | Aprovado. Evita dizer "nenhum cliente cadastrado" quando só uma situação está vazia |
| T-04 | Lista de clientes, sem resultado | "Há 1 cliente inativo com essa busca." / "Há {k} clientes inativos com essa busca." | Aprovado. É a frase de 3.3 com o singular certo |
| T-05 | Erro de página de clientes, cliente, sócios, sócio e apelidos | Título da região + "Tente novamente em instantes." | Aprovado. Descrição curta, sem texto técnico; o código de suporte segue abaixo |

### 16.3 Formulário de cliente (E6b)

| # | Onde aparece | Texto atual | Veredito |
|---|---|---|---|
| T-06 | Aviso de nome parecido, título (e o início da frase do erro `POSSIBLE_DUPLICATE`) | "Já existe um cliente com este nome" | **Ajustar para "Já existe um cliente com nome ou apelido igual".** Com a RAT-D024 o aviso também dispara quando só um apelido coincide, e então o nome do cliente que se salva pode ser diferente. A frase abaixo do título não muda |
| T-07 | Aviso de nome parecido, motivo de cada cliente | "mesmo nome" | Aprovado. Também cobre o nome fantasia (conta como nome, RAT-D024) |
| T-08 | Aviso de nome parecido, motivo de cada cliente | "apelido igual" | **Ajustar para "apelido igual ao nome".** Sozinho, "apelido igual" não diz a que o apelido é igual; o motivo vale nos dois sentidos (apelido de um igual ao nome ou ao nome fantasia do outro) |
| T-09 | Diálogo 4.1.8, descrição lida pelo leitor de tela (D-E6b-03) | "Confira o que vai mudar antes de salvar." | Aprovado. Atende ao `alertdialog` (UXC-41) sem repetir o resumo |
| T-10 | Diálogo 4.1.8, linha de sócios | "Sócios: Alfa, Beta → Alfa, Gama"; depois da troca sem sócio (cliente inativo): "Sócios: Alfa → nenhum" | Aprovado. As chaves de 4.1.8 e 6.3 eram marcador de lugar, não texto literal: leiam-se como "Alfa, Beta → Alfa, Gama" e "(Alfa, Beta)" |
| T-11 | Diálogo 4.1.8, nova divisão com um só sócio | "A divisão passa a ser de um só sócio: 1/1 (100%)." | Aprovado. Cobre o caso que 4.1.8 não trazia e repete a forma da prévia ("1 sócio · divisão: 1/1 (100%)") |
| T-12 | Diálogo 4.1.8 e "O que você tinha digitado", sócio que não está na lista | "Sócio removido" | **Ajustar para "Sócio não encontrado".** "Removido" sugere exclusão, que o sistema não tem (só Inativar). O caso é defensivo, mas a palavra errada confunde |
| T-13 | Botão "Carregar versão atual" enquanto recarrega | "Carregando…" | Aprovado |
| T-14 | Campo "Nome ou razão social" vazio | "Informe o nome ou a razão social." | Aprovado. Cobre a lacuna de 4.1.1, que não trazia a mensagem do campo vazio |
| T-15 | Apelido de documento, número com tamanho que não é CPF nem CNPJ (D-E6b-02) | "Informe um CPF (11 números) ou um CNPJ (14 caracteres)." | Aprovado. Segue o vocabulário de 4.1.2 |
| T-16 | Limites de tamanho: apelido, forma do nome, nome fantasia, observações, texto longo, busca | "Um apelido pode ter no máximo 200 caracteres."; "Uma forma do nome pode ter no máximo 200 caracteres."; "O nome fantasia pode ter no máximo 200 caracteres."; "As observações podem ter no máximo 2000 caracteres."; "O texto informado é longo demais (máximo de 200 caracteres)."; "A busca pode ter no máximo 200 caracteres." | Aprovado. Dizem o campo e o limite (U-C13) |
| T-17 | Nome fantasia, apelido ou forma do nome em branco ou só com pontuação | "O nome fantasia não pode ter só pontuação. Preencha ou apague o campo."; "Há um apelido em branco ou só com pontuação. Preencha ou remova."; "Há uma forma do nome em branco ou só com pontuação. Preencha ou remova." | Aprovado. Defensivas (a tela já recusa o item vazio ao adicionar); dizem como corrigir |

### 16.4 Inativar e reativar (E5a, E5b e E6c)

| # | Onde aparece | Texto atual | Veredito |
|---|---|---|---|
| T-18 | Diálogo de inativar ou reativar cliente, sócio ou recebedor, quando a versão mudou (D-E6c-01) | "Este cliente foi alterado enquanto você editava. Suas alterações não foram salvas." (e "sócio", "recebedor") | **Ajustar.** Aqui a pessoa não estava editando nada e não há "alterações" dela. Para inativar: **"Este {cliente, sócio ou recebedor} foi alterado por outra pessoa. A inativação não foi feita. Atualize a tela e tente de novo."** Para reativar: **"... A reativação não foi feita. Atualize a tela e tente de novo."** Nos formulários de edição a frase atual fica |
| T-19 | Erro dentro do diálogo de inativar ou reativar (cliente, sócio e recebedor), versão antiga ou cadastro indisponível | Botão "Atualizar a tela" | Aprovado. É a ação que 8.3 pedia sem botão: o diálogo fica aberto com a frase e o usuário atualiza (U-C19) |
| T-20 | Bloqueio de reativar cliente, aviso de corrida (D-E6c-02) | "Este cliente não tem sócio ativo. Indique pelo menos um sócio na edição e tente reativar de novo." dentro do diálogo "Não é possível reativar {Nome}" | Aprovado. É a frase de 6.4 e explica por que o diálogo mudou de variante |

### 16.5 Sócios e recebedores (E5a e E5b)

| # | Onde aparece | Texto atual | Veredito |
|---|---|---|---|
| T-21 | Lista de sócios, ajuda da busca | "Pelo nome ou por um apelido. A busca ignora acento, maiúscula e pontuação." | Aprovado |
| T-22 | Lista de sócios, resumo | "1 sócio" / "{n} sócios" | Aprovado. `role="status"`, como na lista de clientes |
| T-23 | Lista de sócios, filtro Ativos sem nenhum sócio ativo | "Nenhum sócio cadastrado" com "Novo sócio" e "Ver inativos", mesmo quando existem sócios inativos | **Ajustar.** Mesmo critério de D-E6a-06: com "Ativos" vazio e sócios inativos existentes, **"Nenhum sócio ativo."** com "Ver inativos"; "Nenhum sócio cadastrado" (com "Novo sócio") só quando não há sócio nenhum. Hoje o texto é falso nesse caso |
| T-24 | Novo sócio, descrição da página | "Nome e apelidos. O sócio não tem documento nem percentual." | **Ajustar para "Informe o nome e, se quiser, os apelidos do sócio."** Dizer o que o cadastro não tem confunde quem nunca esperou documento ou percentual ali |
| T-25 | Detalhe do sócio, cartão Recebedores, com recebedores só inativos no filtro Ativos | "Há 1 recebedor inativo neste sócio." / "Há {k} recebedores inativos neste sócio." | Aprovado. Ajuda a achar o que foi inativado |
| T-26 | Detalhe do sócio, cartão Recebedores, mesmo caso | Título "Este sócio ainda não tem recebedores." acima da linha "Há {k} recebedores inativos..." | **Ajustar o título para "Este sócio não tem recebedores ativos."** quando há inativos (as duas linhas se contradizem). Sem nenhum recebedor, o título de 5.3 fica |
| T-27 | Formulário de recebedor, listas vazias | "Nenhuma conta cadastrada."; "Nenhuma chave Pix cadastrada."; "Nenhuma forma do nome cadastrada." | Aprovado. Mesmo molde de "Nenhum apelido cadastrado." |
| T-28 | Listas editáveis (apelidos, formas do nome, chaves Pix e contas), anúncios | "Conta “{Banco} · ...” adicionada." / "removida." / "inativada." / "reativada." e o equivalente para chave Pix, forma do nome e apelido | Aprovado. Mesma regra de 4.1.6 estendida às contas |
| T-29 | Cartão Recebedores, nome acessível dos botões | "Editar recebedor {Titular}"; "Inativar recebedor {Titular}"; "Reativar recebedor {Titular}" | Aprovado. O nome visível continua curto ("Editar", "Inativar recebedor") |
| T-30 | Recebedor, identificador já usado (D-E5b-01) | "Esta forma do nome já está cadastrada no recebedor {Titular}, do sócio {Nome}." (e, sem o tipo, "Esta chave Pix, conta ou forma do nome já está cadastrada ...") | Aprovado. Mesmo molde de 7.2. Na reativação, a conta sai com o texto normalizado (minúsculas): o caminho não ocorre hoje (D-E5b-08); se passar a ocorrer, mostrar o valor como foi cadastrado |

### 16.6 Apelidos (E7 parte 1)

| # | Onde aparece | Texto atual | Veredito |
|---|---|---|---|
| T-31 | Apelidos, lista vazia no padrão "Ativos" quando só há textos inativos (D-E7a-02) | "Nenhum texto encontrado." com "Ver todos" | **Ajustar.** "Encontrado" pede uma busca, e aqui não há. Como em Clientes: **"Nenhum texto ativo."** com "Ver inativos"; no filtro "Inativos" vazio, **"Nenhum texto inativo."** com "Ver ativos". Com busca ou tipo aplicados, fica "Nenhum texto encontrado." com "Limpar filtros" (5.4) |
| T-32 | Apelidos, resumo (D-E7a-03) | "{n} textos ativos", "{n} textos inativos", "{n} textos encontrados" (singular certo) | Aprovado. Mesmo padrão da lista de clientes |
| T-33 | Apelidos, apelido de cliente que é documento (D-E7a-04) | "000.000.001-91" sem o prefixo "CPF" | Aprovado. A máscara já diferencia CPF e CNPJ, e a coluna "Tipo" diz "Apelido de cliente". O detalhe do cliente mantém "CPF 000.000.000-00" (4.2) |
| T-34 | Apelidos, cartão no celular e legenda da tabela | "Pertence a: {nome}"; legenda "Apelidos, variações de nome, chaves Pix e contas bancárias, com o tipo, a quem pertencem e a situação. Ordem alfabética do texto." | Aprovado |

### 16.7 Mensagens do servidor (`cadastro-errors.ts`)

| # | Onde aparece | Texto atual | Veredito |
|---|---|---|---|
| T-35 | Nome de sócio ou apelido que colide com apelido ou variação de recebedor | "Este nome já é um apelido do sócio {Nome}."; "Este nome já é usado por um recebedor do sócio {Nome}."; "Este apelido já é usado por um recebedor do sócio {Nome}." | Aprovado. Completam 5.2 com os cruzamentos que o banco detecta |
| T-36 | Sócio inativo ao cadastrar ou reativar recebedor, e ao indicar sócios no cliente | "O sócio {Nome} está inativo. Reative o sócio antes de cadastrar ou reativar um recebedor."; "Os sócios {A e B} foram inativados e não podem mais ser indicados. Desmarque-os ou escolha outros." | Aprovado. Plural e caminho para a saída |
| T-37 | Chave Pix, banco, agência, conta e mensalidade devolvidas pelo servidor | "Chave Pix inválida. Digite a chave exatamente como aparece no comprovante."; "Informe o banco da conta, como aparece no comprovante."; "Agência inválida. Use só números, hífen e a letra X."; "Conta inválida. Use só números, hífen e a letra X."; "Valor da mensalidade inválido. Informe um valor maior que zero, com no máximo 2 casas depois da vírgula." | Aprovado. Servem de rede quando a conferência da tela não pega; a tela continua usando as frases de 4.1.3 e 7.2 |
| T-38 | Bloqueio de inativar sócio, quando o servidor não devolve a lista | "{Nome} ainda está indicado em cliente, entre ativos e inativos. ..." | **Ajustar** a contagem desconhecida para **"em clientes"** (hoje sai "em cliente", no singular, sem número) |
| T-39 | Falhas técnicas e de formato: versão ausente, ação, lista e filtro ilegíveis, item fora do formato, sócio não encontrado, troca de sócio do recebedor, dado imutável | "Não foi possível identificar a versão do cadastro. Atualize a página e tente novamente."; "O sócio escolhido não foi encontrado. Atualize a página e escolha de novo."; "O sócio de um recebedor não pode ser trocado. Inative este recebedor e cadastre outro."; "Este dado não pode ser alterado depois de cadastrado." e semelhantes | Aprovado. Sem jargão, dizem o que fazer; raramente aparecem |

### 16.8 Resumo dos ajustes pedidos ao `desenvolvedor`

| # | Texto novo |
|---|---|
| T-06 | Título do aviso: "Já existe um cliente com nome ou apelido igual" (e o início da frase `POSSIBLE_DUPLICATE`) |
| T-08 | Motivo: "apelido igual ao nome" |
| T-12 | "Sócio não encontrado" no lugar de "Sócio removido" |
| T-18 | Inativar: "Este {cliente, sócio ou recebedor} foi alterado por outra pessoa. A inativação não foi feita. Atualize a tela e tente de novo." Reativar: o mesmo com "A reativação não foi feita." (usa o `operation` que o mapa de erros já recebe) |
| T-23 | Lista de sócios com Ativos vazio e inativos existentes: "Nenhum sócio ativo." com "Ver inativos"; "Nenhum sócio cadastrado" só sem sócio nenhum |
| T-24 | "Informe o nome e, se quiser, os apelidos do sócio." |
| T-26 | "Este sócio não tem recebedores ativos." quando há recebedores inativos |
| T-31 | "Nenhum texto ativo." com "Ver inativos" / "Nenhum texto inativo." com "Ver ativos"; "Nenhum texto encontrado." só com busca ou tipo |
| T-38 | "em clientes" quando a contagem não vem |

### 16.9 Efeito nos critérios para o QA

- **UXC-20:** o título do aviso passa a ser "Já existe um cliente com nome ou apelido igual"; os motivos são "mesmo nome" e "apelido igual ao nome". O aviso dispara em cadastro novo e na edição quando nome, nome fantasia ou apelido de nome mudou, para qualquer cliente com o mesmo nome normalizado (com ou sem documento) e para apelido igual ao nome ou ao nome fantasia de outro cliente.
- **UXC-22:** o diálogo mostra "Sócios: Alfa, Beta → Alfa, Gama" (sem chaves), a descrição "Confira o que vai mudar antes de salvar." e, com um só sócio, "A divisão passa a ser de um só sócio: 1/1 (100%)."
- **UXC-26, UXC-27 e UXC-36:** versão antiga em inativar ou reativar mostra a frase de T-18 com o botão "Atualizar a tela"; o diálogo não fecha sozinho.
- **UXC-35:** Apelidos tem os vazios "Nenhum texto ativo.", "Nenhum texto inativo." e "Nenhum texto encontrado." (com busca ou tipo), além de "Nenhum apelido cadastrado ainda."
- **UXC-09:** inclui a lista de Apelidos: Operador e Visualizador veem "Sem permissão"; o Administrador vê chave Pix e conta completas, sem máscara (U-C05).
- **UXC-01:** conferir também "Sócio não encontrado" (nunca "removido") e que nenhuma frase nova use "excluir", "apagar" ou "desativar".
- **UXC-15:** inclui a conferência de que, entre 768 e 1023 px, a página não rola na horizontal (U-C18).

---

## 17. Textos da E10 (26/11/2026)

**O que foi feito.** Conferi, só por leitura do código e dos documentos (sem navegador), os textos que a E10 trouxe (`client-view.ts`, `limits.ts`, `alias-view.ts`, `schemas.ts`, `src/components/form/*`, `clientes/_components/*`, `configuracoes/aliases/**`) e apliquei a decisão do responsável de 26/11/2026 (complemento da RAT-D017). Régua: a da seção 16 (pt-BR simples, frases curtas, sem jargão, Sócio, Cliente e Recebedor, o erro diz o campo e como corrigir).

**Decisão aplicada (fecha o QA-CAD-02).** O tipo do cliente aparece só como **"CPF"** ou **"CNPJ"**. Nada de "Pessoa física", "Pessoa jurídica" nem "Empresa". Cliente sem documento fica sem tipo. Isso resolve o conflito entre a 4.2 e a UXC-01: a 4.2, a tabela de vocabulário (12.5) e a UXC-01 foram reescritas e **não há mais exceção para "Empresa"**.

**Resultado.** 7 textos ou grupos: **5 ok** (T-01, T-40, T-42, T-43, T-44) e **2 a ajustar** (T-41 e T-45). Nenhum ajuste muda regra de negócio nem busca. Os ajustes são do `desenvolvedor`; os testes que citam o texto antigo acompanham. O código de hoje ainda mostra "Pessoa física" e "Empresa" no detalhe do cliente (T-45): é o ajuste mais importante desta rodada.

| # | Onde aparece | Texto | Status | Texto final |
|---|---|---|---|---|
| T-01 | Lista de clientes, ajuda da busca | "Nome, nome fantasia, apelido, ou o começo do CPF ou do CNPJ. A busca ignora acento, maiúscula e pontuação." | **ok** (modo "pelo começo", o atual) | Igual. Diz o que se digita e avisa que o documento é buscado pelo começo; a vírgula antes do "ou" separa o grupo do documento dos dois "ou" seguidos |
| T-40 | Teto das listas (zod e tela) | **Números da RAT-D026 (27/11/2026).** "No máximo 2 apelidos." (sócio); "No máximo 2 nomes." e "No máximo 2 documentos." (cliente, uma frase por tipo); "No máximo 30 formas do nome."; "No máximo 10 chaves Pix."; "No máximo 10 contas." | **ok** (atualizado) | Curtas, dizem o campo e o número, concordam em plural. Os textos antigos ("No máximo 50 apelidos.", "...20 chaves Pix.", "...20 contas.") saem. O cliente deixa de ter a frase única "No máximo N apelidos." (ver 17.7.4) |
| T-41 | Teto das listas, comportamento na tela | Botão "Adicionar" e botões "Reativar" desabilitados; frase abaixo do campo; Enter mostra a mesma frase em vermelho | **ajuste** | Frase na tela: "No máximo 2 apelidos. Para adicionar ou reativar, inative ou remova algum item da lista." (a segunda frase é só da tela; o servidor continua devolvendo só a primeira). No cliente a segunda frase é por tipo (17.7.4). A frase agora ocupa o mesmo lugar da ajuda inicial T-46 (17.7) |
| T-46 | Ajuda do limite, visível desde o início (antes do teto) | "Até 2 apelidos ativos." (sócio); "Até 2 nomes e 2 documentos ativos. CPF e CNPJ contam juntos." (cliente); "Até 30 formas do nome ativas."; "Até 10 chaves Pix ativas."; "Até 10 contas ativas." | **novo** | Ocupa o lugar da frase do teto e é trocada por ela no teto: nunca as duas ao mesmo tempo. Ver 17.7 |
| T-42 | Apelidos, coluna "Pertence a" | "(sócio inativo)", "(recebedor inativo)", "(cliente inativo)"; ordem "Titular X (recebedor inativo) · sócio Y" | **ok** | Iguais. Ver 17.3 |
| T-43 | Qualquer campo de texto livre com caractere de controle | "O texto tem um caractere inválido." | **ok** | Igual. Ver 17.4 |
| T-44 | Tipo de documento do cliente (envio forjado) | "Escolha CPF ou CNPJ." | **ok** | Igual. Ver 17.4 |
| T-45 | Detalhe do cliente, cabeçalho | "Pessoa física" e "Empresa" ao lado do selo (código atual) | **ajuste** | "CPF" ou "CNPJ" (sem documento, nada), com o prefixo "Tipo de documento: " só para o leitor de tela. Ver 17.5 |

### 17.1 T-01: busca por documento

- **Modo atual (pelo começo):** a frase acima. Está pronta e correta para a busca de hoje.
- **Modo "qualquer parte" (para deixar pronta, caso o responsável decida):** **"Nome, nome fantasia, apelido, ou qualquer parte do CPF ou do CNPJ. A busca ignora acento, maiúscula e pontuação."** Muda só "o começo" por "qualquer parte". Se for adotada, o teste que hoje garante que a ajuda não promete busca por trecho (`client-view.test.ts`) passa a exigir o contrário.
- A busca em si não foi mexida. A troca de modo é decisão do responsável e exige migration.

### 17.2 T-41: comportamento no teto (rodada de 26/11, com os números atualizados em 27/11)

> **Atualização de 27/11/2026 (RAT-D026).** Os números passam a ser 2 apelidos por sócio, 2 nomes e 2 documentos por cliente, 30 formas do nome, 10 chaves Pix e 10 contas. Onde este bloco diz "50" ou "20", leia o número novo. Os itens 3 e 4 abaixo foram refinados em **17.7**, que prevalece: a frase do teto e a ajuda inicial dividem um único parágrafo, com id fixo.

O que está certo e fica: no teto, "Adicionar" e "Reativar" ficam desabilitados e a frase fica escrita; o campo continua habilitado e nada digitado se perde; só itens ativos contam. Reativar é bloqueado porque aumentaria os ativos.

O que muda:

1. **A frase não diz a saída.** Quem chega ao teto lê só "No máximo 50 apelidos." e não sabe o que fazer com o botão cinza. Na tela, a frase ganha uma segunda frase curta: **"Para adicionar ou reativar, inative ou remova algum item da lista."** ("algum item" evita o problema de gênero entre "apelido", "chave Pix" e "forma do nome"). Item salvo se "Inativa"; item novo ainda não salvo se "Remove" (12.5).
2. **Tom.** A frase é a explicação de um botão desligado, não ajuda de fundo: sai do cinza claro (`text-muted-foreground`) para o texto normal (`text-foreground`). Sem vermelho (o teto não é erro do usuário), sem ícone.
3. **Leitor de tela.** Um botão desabilitado não recebe foco, então o `aria-describedby` do "Adicionar" nunca é lido. O campo "Novo apelido" (onde o foco fica) passa a apontar para a frase do teto (`aria-describedby` com o id do limite quando está no teto e não há erro de inclusão). Os botões "Reativar" também apontam para ela. Ao chegar no teto adicionando um item, o anúncio fica "Apelido “X” adicionado. No máximo 50 apelidos." (um só `role="status"`).
4. **Enter no teto.** Hoje a frase aparece duas vezes (cinza e vermelha). Mostrar uma vez só: enquanto houver erro de inclusão, esconder o parágrafo cinza; o erro vermelho leva a frase do teto com o complemento da tela (item 1).

### 17.3 T-42: aviso de dono inativo em Apelidos

- Os três textos são claros, no vocabulário certo (Sócio, Recebedor, Cliente) e dizem **quem** está inativo, o que "(inativo)" sozinho não diria. Em parênteses e cinza, **não dependem só de cor**: o texto basta.
- A ordem "Titular X (recebedor inativo) · sócio Y" resolve o N-02: o parêntese fica colado ao titular e não parece ser do sócio. O link cobre só o titular; o aviso e o sócio ficam fora do link.
- O recebedor ativo sob sócio inativo não existe (inativar o sócio inativa os recebedores, 6.1 B); por isso mostrar só o aviso do dono do texto basta.
- **Cuidado de leitura (sem mudar o texto):** o selo "Situação" da linha é do **texto** ("Ativo") e o aviso é do **dono**. Quem lê "Ativo" e "(sócio inativo)" na mesma linha pode estranhar. Se o QA ou o responsável estranharem no passo 27, a saída mais barata é chamar a coluna "Situação do texto". Não é pedido agora.

### 17.4 T-43 e T-44: erros de entrada que a tela quase não mostra

- **"O texto tem um caractere inválido."** Curta e sem jargão ("NUL" não aparece). O navegador não deixa digitar nem colar esse caractere, então só aparece em envio forjado; o campo certo recebe a frase (no motivo, que é de diálogo, sai sem campo: N-01, aceito). Se um dia a tela puder gerar o caso, acrescentar "Apague e digite de novo." (a pessoa não vê o caractere, e a única saída é redigitar).
- **"Escolha CPF ou CNPJ."** Correta como erro de `documentType`. A tela oferece três opções (Sem documento, CPF, CNPJ) e "Sem documento" é válido, então a frase não é literal para quem escolhe "Sem documento"; como só aparece em envio forjado, não vale mudar a constante e os testes que a citam.

### 17.5 T-45: tipo no cabeçalho do detalhe do cliente

- **Redundante com a linha "Documento"?** Em parte, e é aceitável. O cabeçalho responde "que tipo de cliente é este?" de relance, sem repetir o número; a linha "Documento" do cartão traz o número ("CPF 000.000.000-00"). O número não se repete no cabeçalho.
- **Como apresentar.** Texto cinza simples (`text-sm text-muted-foreground`), logo depois do selo "Ativo" ou "Inativo", sem ícone e sem selo próprio, para não parecer uma segunda situação. Só "CPF" ou "CNPJ". **Sem documento, nada** (nem "Sem tipo"): a linha "Documento" já diz "Sem documento".
- **Leitor de tela.** "CPF" solto depois de "Ativo" não diz do que se trata. Acrescentar o prefixo "Tipo de documento: " visível só para o leitor de tela (`sr-only`). O rótulo bate com o do formulário ("Tipo de documento").
- **Código.** `clientTypeLabel` devolve "Pessoa física" e "Empresa" hoje; passa a devolver "CPF" e "CNPJ". A página do detalhe acrescenta o prefixo.

### 17.6 Efeito nos critérios para o QA

- **UXC-01:** sem exceção. Nenhuma tela escreve "Empresa", "Pessoa física" ou "Pessoa jurídica"; o tipo do cliente é "CPF" ou "CNPJ".
- **UXC-21 (estendido):** no teto, "Adicionar" e "Reativar" desabilitados; a frase "No máximo N ..." aparece **uma vez**, com "Para adicionar ou reativar, inative ou remova algum item da lista."; o campo continua habilitado e o texto digitado não se perde; Enter não duplica a frase; ao remover ou inativar um item, o botão volta a funcionar; o leitor de tela ouve a frase ao focar o campo.
- **UXC-35 (estendido):** em Apelidos, dono inativo mostra "(sócio inativo)", "(recebedor inativo)" ou "(cliente inativo)" em cinza logo depois do nome do dono, e o texto continua com o selo "Ativo" se ele mesmo está ativo; no recebedor a ordem é "Titular X (recebedor inativo) · sócio Y".
- **Novo, detalhe do cliente:** cliente com CPF mostra "CPF" ao lado do selo; com CNPJ, "CNPJ"; sem documento, nenhum tipo e a linha "Documento" diz "Sem documento".
- **Novo, ajuda da busca de Clientes:** a frase de T-01 (modo atual) aparece inteira e a busca por trecho do meio de um documento continua sem achar.
- **UXC-21 (atualizado em 27/11, RAT-D026):** onde se lê "No máximo N ..." leia os números novos (2, 2 nomes e 2 documentos, 30, 10, 10). Os critérios de 17.7.7 (UXC-47 a UXC-51) se somam a este.

---

### 17.7 Limites baixos (RAT-D026, 27/11/2026): ajuda desde o início e limite por tipo no cliente

**Por que muda.** Com tetos de 2, 10 e 30, a pessoa chega ao limite no uso normal (um sócio com 3 grafias do nome). A frase do teto só aparecia depois de bater nele. Agora o limite é dito antes, no mesmo lugar onde a frase do teto aparece depois. Conferido só por leitura do código e do Brain (sem navegador). Não muda regra: os números e a contagem de ativos são da RAT-D026. A busca de Clientes não foi mexida (T-01 fica como está: pelo começo do número).

### 17.7.1 Regra de ouro: um parágrafo, um id, dois estados

Cada lista tem **um** parágrafo "linha do limite" (`<p id="{baseId}-limite">`), **sempre presente**, logo abaixo da linha de inclusão (onde hoje fica a frase do teto) e acima do erro de inclusão. Ele troca de texto, nunca coexiste com outro:

| Estado | Quando | Texto | Estilo |
|---|---|---|---|
| **Ajuda** (antes do teto) | ativos < teto | "Até N {itens} ativos." | `text-sm text-muted-foreground` |
| **Teto** | ativos >= teto | frase do teto + frase de saída: "No máximo N {itens}. Para adicionar ou reativar, inative ou remova algum item da lista." | `text-sm text-foreground` (normal, sem vermelho, sem ícone) |

- A informação não se repete: "Até 2 apelidos ativos." some quando a frase "No máximo 2 apelidos. ..." aparece, e vice-versa. A frase de saída (`LIMIT_REACHED_HINT`) continua só no estado Teto. A palavra "ativos" na ajuda diz o que conta (só os ativos; inativos não ocupam vaga) sem depender de leitura da frase de saída.
- Não depende só de cor: o texto muda ("Até" para "No máximo") e a frase de saída só existe no teto.
- **Sem contador** ("1 de 2"): a lista logo acima já mostra os itens e o parágrafo não muda a cada inclusão (sem ruído para leitor de tela). Se o QA ou o responsável pedirem um contador nas listas de 30, é um acréscimo, não é pedido agora.

### 17.7.2 Textos exatos (ajuda, teto e frase do servidor)

| Lista | Ajuda inicial (antes do teto) | Frase do teto (T-40, também do zod/servidor) | Texto completo no teto (tela) |
|---|---|---|---|
| Apelidos do sócio | "Até 2 apelidos ativos." | "No máximo 2 apelidos." | "No máximo 2 apelidos. Para adicionar ou reativar, inative ou remova algum item da lista." |
| Outras formas do nome (recebedor) | "Até 30 formas do nome ativas." | "No máximo 30 formas do nome." | "No máximo 30 formas do nome. Para adicionar ou reativar, inative ou remova algum item da lista." |
| Chaves Pix (recebedor) | "Até 10 chaves Pix ativas." | "No máximo 10 chaves Pix." | "No máximo 10 chaves Pix. Para adicionar ou reativar, inative ou remova algum item da lista." |
| Contas bancárias (recebedor) | "Até 10 contas ativas." | "No máximo 10 contas." | "No máximo 10 contas. Para adicionar ou reativar, inative ou remova algum item da lista." |
| Apelidos do cliente | ver 17.7.4 (um texto por tipo) | "No máximo 2 nomes." e "No máximo 2 documentos." | ver 17.7.4 |

Para o desenvolvedor: a ajuda inicial sai do mesmo número do teto (`Até ${max} ${plural} ${ativos|ativas}.`), para os dois nunca divergirem. Concordância: "ativos" para apelidos (masculino), "ativas" para formas do nome, chaves Pix e contas. O `help` de cada lista (parágrafo de cima, "Outros nomes com que este sócio aparece...") **não muda e não leva o limite**: o limite fica só na linha do limite, perto do campo.

### 17.7.3 Ligação com o leitor de tela (`aria`)

- O campo de inclusão ("Novo apelido", "Nova forma do nome", "Nova chave Pix") passa a ter **sempre** `aria-describedby` com o id da linha do limite (hoje só no teto). Ao focar o campo, o leitor diz algo como "Novo apelido, campo de edição, Até 2 apelidos ativos." No teto: "...No máximo 2 apelidos. Para adicionar ou reativar, inative ou remova algum item da lista."
- **Erro de inclusão** (ex.: apelido repetido, em branco): `aria-describedby="{erro} {limite}"`, nessa ordem (o erro primeiro). A linha do limite continua visível.
- **Exceção, Enter no teto (erro de teto):** o erro vermelho já traz a frase do teto com a frase de saída. Aí a linha do limite **some** (não é renderizada) e o campo aponta só para o erro. A regra deixa de ser "esconder quando há qualquer erro" e passa a ser "esconder só quando o erro de inclusão é o do teto" (guardar uma marca no estado, em vez de comparar texto). Apelido em branco ou repetido no teto mostra o erro próprio e **mantém** a linha do limite.
- **"Adicionar" habilitado:** sem `aria-describedby` (o campo ao lado já lê a ajuda; evita ler duas vezes). **"Adicionar" desabilitado (teto):** mantém o `aria-describedby` do limite (não recebe foco, é inofensivo e útil para quem navega por cursor virtual). **"Reativar":** `aria-describedby` com o limite só no teto e só se a linha estiver renderizada; fora do teto, sem descrição.
- `aria-describedby` do `fieldset` fica como está (ajuda de cima e erro da lista), sem o limite.
- **Contas bancárias (três campos):** antes do teto, a ajuda é lida **só no campo Banco** (o primeiro), para não repetir três vezes ao tabular. No teto (e com erro de inclusão) fica como já é hoje: nos três campos.
- A linha do limite **não** é `role="status"` e não anuncia sozinha (o texto não muda a cada tecla). Os anúncios são os do `<p role="status" class="sr-only">` que já existe (17.7.5).

### 17.7.4 Apelidos do cliente: limite por tipo (2 nomes e 2 documentos)

**Contagem.** Dois grupos independentes: **Nome** (tipo `NAME`) e **Documento** (tipo `DOCUMENT`, que reúne CPF e CNPJ: um CPF e um CNPJ ativos ocupam as 2 vagas de documento). O seletor "Tipo" continua com **Nome, CPF, CNPJ** e **não desabilita nenhuma opção** (opção desabilitada esconde o motivo e atrapalha leitor de tela). O "grupo escolhido" é Nome (se Tipo = Nome) ou Documento (se Tipo = CPF ou CNPJ). O teto vale para os itens **ativos** do grupo; itens do outro grupo não entram na conta.

**Frases por tipo (T-40, também do zod e do servidor, uma por grupo):**
- Nome: **"No máximo 2 nomes."**
- Documento: **"No máximo 2 documentos."**

**Frases de saída por tipo** (a frase genérica "algum item" não serve aqui: remover um documento não libera vaga de nome):
- Nome: **"Para adicionar ou reativar um nome, inative ou remova algum nome da lista."**
- Documento: **"Para adicionar ou reativar um documento, inative ou remova algum documento da lista."**

**Texto da linha do limite do cliente.** Depende do grupo escolhido no seletor (G) e do outro grupo (O):

| Situação | "Adicionar" | Texto da linha | Estilo |
|---|---|---|---|
| G com vaga (qualquer estado de O) | habilitado | "Até 2 nomes e 2 documentos ativos. CPF e CNPJ contam juntos." | muted |
| G cheio, O com vaga, G = Nome | desabilitado | "No máximo 2 nomes. Para adicionar ou reativar um nome, inative ou remova algum nome da lista. Para incluir um documento, escolha CPF ou CNPJ em Tipo." | normal |
| G cheio, O com vaga, G = Documento | desabilitado | "No máximo 2 documentos. Para adicionar ou reativar um documento, inative ou remova algum documento da lista. Para incluir um nome, escolha Nome em Tipo." | normal |
| G cheio e O cheio, G = Nome | desabilitado | "No máximo 2 nomes. Para adicionar ou reativar um nome, inative ou remova algum nome da lista." | normal |
| G cheio e O cheio, G = Documento | desabilitado | "No máximo 2 documentos. Para adicionar ou reativar um documento, inative ou remova algum documento da lista." | normal |

Detalhes:
- **Ao abrir a tela** o seletor está em "Nome". Um cliente com 2 nomes ativos já abre com "Adicionar" desabilitado e a linha dizendo como incluir um documento: é o caso comum e por isso a frase de "escolha CPF ou CNPJ em Tipo" existe.
- **Trocar o seletor** muda o texto da linha e o estado do botão na hora, **sem anunciar** (o leitor já anuncia o valor do seletor; ao tabular ao campo ele lê a linha, que está ligada ao campo). A troca já esvazia o campo e o erro de inclusão (comportamento existente, não muda).
- **Enter no teto do grupo escolhido:** erro vermelho no campo, uma vez: "No máximo 2 nomes. Para adicionar ou reativar um nome, inative ou remova algum nome da lista." (ou a de documentos); a linha some (regra de 17.7.3). Sem a frase de "escolha CPF ou CNPJ" no erro (a dica fica só na linha; o erro só diz o que falhou e como sair).
- **A validação do texto vem antes do teto** (como hoje no código): campo em branco, nome repetido ou CPF inválido mostram o erro próprio, e a linha do limite permanece.
- **Reativar por digitação** (digitar um apelido igual a um inativo) conta como inclusão: no teto do grupo, dá o erro de teto.

**Botões "Reativar" por tipo.**
- Cada "Reativar" fica desabilitado quando o **grupo do próprio item** está cheio: um nome inativo com Nome cheio fica cinza, enquanto um CPF inativo com documentos com vaga continua habilitado (e o contrário). Não segue o seletor "Tipo".
- A explicação precisa estar perto do botão (a linha do limite só fala do grupo escolhido no seletor). Dentro da seção recolhida "Apelidos inativos (n)", logo acima da lista, aparece uma nota por grupo cheio **que tenha ao menos um item inativo**, em `text-sm text-foreground`, com id próprio:
  - Nome cheio: **"No máximo 2 nomes. Para reativar um nome, inative ou remova algum nome da lista."** (`{baseId}-limite-reativar-nome`)
  - Documento cheio: **"No máximo 2 documentos. Para reativar um documento, inative ou remova algum documento da lista."** (`{baseId}-limite-reativar-documento`)
  - Cada "Reativar" desabilitado usa `aria-describedby` com a nota do seu grupo. Nome acessível não muda: "Reativar apelido {texto}".
  - Essa nota repete a ideia da linha do limite, mas em outro lugar e só quando a seção está aberta e é sobre reativar: aceito, é o único jeito de explicar um botão desabilitado a quem não está no tipo certo.

**Rótulo do item.** A lista de ativos continua misturando os dois tipos na ordem em que veio. Opcional, não exigido: nenhuma separação em duas listas (o rótulo "CPF 000..." já distingue; o nome não tem prefixo).

### 17.7.5 Anúncios (`role="status"`, polite, um só por lista)

| Ação | Texto |
|---|---|
| Adiciona e **não** chega ao teto | "Apelido “X” adicionado." (igual a hoje; "Forma do nome “X” adicionada.", "Chave Pix “X” adicionada.", "Conta “X” adicionada.") |
| Adiciona ou reativa e **chega** ao teto | o mesmo + a frase do teto, **sem** a frase de saída: "Apelido “X” adicionado. No máximo 2 apelidos." No cliente, a frase do **grupo do item**: "Apelido “Maria S.” adicionado. No máximo 2 nomes." / "Apelido “CPF 000.000.001-91” adicionado. No máximo 2 documentos." |
| **Reativar (botão)** e chega ao teto | **novo:** hoje só diz "reativado". Passa a acrescentar a frase do teto, igual à linha acima |
| Remove ou inativa **estando no teto** (libera vaga) | **novo:** "Apelido “X” inativado. Já dá para adicionar ou reativar." (ou "removido"). No cliente: "...Já dá para adicionar ou reativar nomes." / "...documentos." conforme o grupo liberado |
| Remove ou inativa fora do teto | igual a hoje |
| Enter no teto | só o erro vermelho (`aria-invalid` e `aria-describedby` no campo, foco no campo); sem anúncio extra |

A ajuda inicial ("Até 2 apelidos ativos.") **não** é anunciada ao abrir a tela; chega pelo campo (17.7.3).

### 17.7.6 Responsividade e estados

- **Desktop e tablet:** a linha ocupa a largura da lista, abaixo da linha de inclusão; no cliente, abaixo da grade "Tipo / Novo apelido / Adicionar". Uma ou duas linhas de texto.
- **Celular (320 a 480 px):** empilhado como hoje (campos, "Adicionar", linha). O texto mais longo do cliente (nome cheio, documento com vaga) quebra em até cerca de 5 linhas: aceito, é a explicação de um botão desabilitado. Sem truncar. Alvos de toque do "Adicionar" e do "Reativar" seguem em 44 px.
- **Formulário bloqueado (`disabled`, enviando):** a linha continua visível; só os controles ficam desabilitados.
- **Lista vazia:** a ajuda inicial aparece ("Até 2 apelidos ativos.") junto a "Nenhum apelido cadastrado."; é o momento em que ela mais ajuda.
- **Erro da lista vindo do servidor** (apelido já usado, ou o teto no envio): continua no bloco de erro da lista, abaixo da linha do limite; não a substitui.
- **Cadastro já acima do novo teto (condicional): não será feito (ver 17.7.8).** Texto original, mantido só como registro: se existir cadastro gravado com mais itens ativos que o novo teto (dado anterior à RAT-D026), "Adicionar" e "Reativar" ficam desabilitados e a linha ganha, no lugar da ajuda: "No máximo 2 apelidos. Este cadastro tem 5 ativos; para salvar, deixe só 2." (no cliente, por grupo: "No máximo 2 nomes. Este cadastro tem 4 ativos; para salvar, deixe só 2."; se os dois grupos estiverem acima, as duas frases, uma por linha; a do grupo acima do teto tem prioridade sobre a ajuda mesmo que o seletor esteja no outro grupo). Sem isso a pessoa não consegue salvar nem corrigir o nome e não sabe por quê. **Só vale a pena fazer se o desenvolvedor confirmar que existe dado assim**; ver a pendência em 17.7.8.

### 17.7.7 Critérios novos para o QA

- **UXC-47 (ajuda inicial):** nas cinco listas (apelidos do sócio, formas do nome, chaves Pix, contas, apelidos do cliente) o texto da ajuda aparece **ao abrir a tela**, sem digitar nada, em cinza: "Até 2 apelidos ativos."; "Até 30 formas do nome ativas."; "Até 10 chaves Pix ativas."; "Até 10 contas ativas."; "Até 2 nomes e 2 documentos ativos. CPF e CNPJ contam juntos." Aparece também com a lista vazia. Ao focar o campo de inclusão, o leitor de tela lê a frase (nas contas, ao focar Banco).
- **UXC-48 (troca no teto):** ao chegar no teto, a ajuda "Até ..." **some** e a frase "No máximo N ... Para adicionar ou reativar, inative ou remova algum item da lista." aparece **uma vez** no mesmo lugar, em texto normal. Nunca as duas ao mesmo tempo. Ao inativar ou remover um item, volta a ajuda "Até ..." e "Adicionar" habilita. Inativos não contam: com 2 apelidos ativos e 3 inativos, o teto está atingido; com 1 ativo, não.
- **UXC-49 (cliente, por tipo):** com 2 nomes ativos: seletor em Nome, "Adicionar" desabilitado e a linha de 17.7.4 com "Para incluir um documento, escolha CPF ou CNPJ em Tipo."; trocar para CPF habilita "Adicionar" e a linha volta à ajuda; dá para incluir um CPF e um CNPJ; um terceiro documento (de qualquer tipo) é recusado com "No máximo 2 documentos. ...". O contrário (2 documentos, incluir nomes) também vale. CPF e CNPJ contam juntos nos documentos. Nenhuma opção do seletor fica desabilitada.
- **UXC-50 (Reativar por tipo e anúncios):** "Reativar" de um nome inativo fica desabilitado só quando os nomes estão cheios (independe do seletor "Tipo"), e o de um documento só quando os documentos estão cheios; a nota de 17.7.4 aparece dentro da seção recolhida. Os anúncios seguem a tabela 17.7.5, incluindo "Já dá para adicionar ou reativar." ao liberar vaga e a frase do teto ao reativar até o teto.
- **UXC-51 (Enter e erros):** Enter no teto mostra o erro vermelho com a frase do teto **uma vez** e a linha do limite some; Enter com o campo em branco no teto mostra o erro de campo em branco e **mantém** a linha do limite. No leitor de tela, o campo aponta para o erro (e, quando a linha existe, para ela também).

### 17.7.8 Pendências e fora de escopo

- **Não se aplica.** Pendência 17.7.8 do 03-ui-ux.md ("cadastro já acima do novo teto"): não se aplica. Motivo, confirmado pela modelagem-dados (02-modelagem-dados.md, revisão 4, R-D16): a CAD-001 ainda não foi aplicada em nenhum banco publicado; as migrations 0300 e 0400 já nascem com os tetos, então nenhum cadastro pode ficar acima deles pelo sistema; o seed não passa do teto (último teste do pgTAP 12); um banco local antigo volta ao normal com npm run db:reset. Por isso a linha condicional de 17.7.6 não será feita. Se um dia houver importação de dados antigos, o assunto volta.
- Não mudei a busca de documento (T-01), o plano nem o Brain.
- Sugestão de nomes para o desenvolvedor (não vinculante), em `limits.ts`: um teto por grupo do cliente (`MAX_CLIENT_NAME_ALIASES`, `MAX_CLIENT_DOCUMENT_ALIASES`), as duas frases e as duas frases de saída por tipo, além da ajuda inicial de cada lista, derivadas dos tetos. `addClientAlias` e a tela passam a contar os ativos **por grupo** (`DOCUMENT` reúne CPF e CNPJ).

### 17.7.9 Conferência da implementação (rodada 4, 27/11/2026)

Feita só pela leitura do código (sem navegador e sem servidor), contra 17.7.1 a 17.7.7, T-40, T-41, T-46, UXC-21 e UXC-47 a UXC-51. Arquivos: `limits.ts`, `editable-text-list.tsx`, `editable-list.ts`, `client-alias-list.tsx`, `client-aliases.ts`, `account-list.tsx`, `receiver-form.tsx`, `partner-form.tsx`, `receiver-identifiers.ts`, `schemas.ts`, `cadastro-errors.ts` (caminhos em `src/`). Linhas conferidas em 27/11/2026.

| # | Item | Esperado | Implementado (arquivo:linha) | Resultado | Severidade |
|---|---|---|---|---|---|
| 1 | Ajuda e frase do teto das 4 listas do sócio e do recebedor (17.7.2) | "Até 2 apelidos ativos.", "Até 30 formas do nome ativas.", "Até 10 chaves Pix ativas.", "Até 10 contas ativas."; "No máximo N ..." + saída | `limits.ts:34-58` (plural e gênero), `:67-73`, `:79`; o número vem do mesmo teto (`LIST_LIMITS`, `:16-29`) | Conforme | n/a |
| 2 | Frases do cliente (17.7.4) | Ajuda "Até 2 nomes e 2 documentos ativos. CPF e CNPJ contam juntos."; saídas por tipo; dica "Para incluir um documento, escolha CPF ou CNPJ em Tipo." / "Para incluir um nome, escolha Nome em Tipo."; notas de reativar | `limits.ts:129`, `:132-135`, `:141-144`, `:147-150` | Conforme (texto idêntico, inclusive o ponto final e a concordância) | n/a |
| 3 | Frases do zod e do servidor | "No máximo 2 nomes." e "No máximo 2 documentos." (a do design, não a da modelagem) | `schemas.ts:381-384` usa `CLIENT_ALIAS_LIMITS[tipo].message` (`limits.ts:113-126`); `cadastro-errors.ts:733-745` usa `listLimitMessage(list, max)`; `limits.ts:69-70` | Conforme | n/a |
| 4 | Linha do limite (17.7.1) | Um `<p id="{baseId}-limite">` sempre presente, abaixo da linha de inclusão e acima do erro; troca de texto, nunca as duas; muted antes do teto, normal no teto | `editable-text-list.tsx:94-95`, `:237-242`; `account-list.tsx:63-64`, `:258-263`; `client-alias-list.tsx:91-96`, `:278-283` | Conforme | n/a |
| 5 | `aria` (17.7.3) | Campo sempre descrito pelo limite; com erro, "{erro} {limite}"; erro de teto esconde a linha e a marca é do estado (`isLimit`); Adicionar habilitado sem descrição, desabilitado e Reativar com ela só no teto e só se a linha existe; contas: ajuda só em Banco antes do teto | `editable-text-list.tsx:82`, `:158-162`, `:230`, `:267`; `client-alias-list.tsx:74`, `:170-174`, `:271`; `account-list.tsx:149-157` (Banco `:205`, Agência `:222`, Conta `:239`), `:251`, `:286` | Conforme | n/a |
| 6 | Cliente por tipo (17.7.4) | 5 situações da linha; seletor sem opção desabilitada; Reativar pelo grupo do item; notas com id próprio em "Apelidos inativos"; validação do texto antes do teto | `client-alias-list.tsx:81-96` (5 situações), `:231-235` (opções sempre ativas), `:164-167`, `:293-331` (notas e Reativar); `client-aliases.ts:104-124` (texto e duplicado antes do teto), `:154-158` | Conforme | n/a |
| 7 | Anúncios (17.7.5) | Chegar ao teto por Adicionar e por Reativar leva a frase do teto (do grupo do item no cliente); "Já dá para adicionar ou reativar." (cliente: "... nomes." / "... documentos."); Enter no teto sem anúncio extra | `editable-text-list.tsx:122-124`, `:135`, `:147-148`; `client-alias-list.tsx:119-124`, `:135-136`, `:149-150`; `account-list.tsx:100-104`, `:115`, `:127-128`; Enter no teto só faz `setAddError` (`editable-text-list.tsx:112-117`) | Conforme | n/a |
| 8 | Estados (17.7.6), menos o condicional | Linha visível com o formulário bloqueado; ajuda com a lista vazia; erro do servidor abaixo da linha; alvos de 44 px; sem truncar | Linha não depende de `disabled` (`editable-text-list.tsx:237`); lista vazia acima da linha (`:171-175`); erro da lista depois (`:245-250`); `h-11` no Adicionar e no Reativar (`:232`, `:270`) | Conforme | n/a |
| 9 | UXC-48: ao inativar ou remover no teto, volta a ajuda "Até ..." e "Adicionar" habilita | Depois de um Enter no teto (erro vermelho de teto na tela), inativar ou remover um item libera a vaga e a ajuda volta; o erro de teto não fica | `handleRemove` não limpa o erro de inclusão: `editable-text-list.tsx:128-137` (linha escondida por `:95`); `client-alias-list.tsx:128-138` (`:96`); `account-list.tsx:108-117` (`:64`). O erro só sai ao digitar (`:213-216`) ou trocar o tipo. Resultado: o erro vermelho "No máximo 2 ... Para adicionar ou reativar ..." continua com vaga livre e a ajuda "Até ..." não volta | Divergente | Média |
| 10 | Contas, Enter no teto: `aria-invalid` no campo (17.7.5) | O campo com erro fica `aria-invalid` | O erro de teto das contas tem `field: null` (`receiver-identifiers.ts:80`), então nenhum dos três campos recebe `aria-invalid` (`account-list.tsx:204`, `:221`, `:238`); o `aria-describedby` com o erro está nos três e o foco vai ao último campo (`:84-94`). Igual ao erro de conta repetida (padrão anterior) | Divergente | Baixa |

**Veredito: CONFORME COM AJUSTES.** Textos, números, concordância, aspas curvas, `aria` e anúncios batem com a especificação; o desenvolvedor seguiu a redação do design ("No máximo 2 nomes." e "No máximo 2 documentos.") no zod, no servidor e na tela. Ficam dois ajustes: o item 9 (média) e o item 10 (baixa).

Correção sugerida do item 9 (para o desenvolvedor, sem mudar texto): em `handleRemove` das três listas, se o erro de inclusão atual tem `isLimit` e o remover libera a vaga (no cliente, só quando o grupo do item removido é o do erro, isto é, o grupo escolhido no seletor), chamar `setAddError(null)`. Efeito: a ajuda "Até ..." e o botão voltam juntos, como pede UXC-48. Reativar não precisa (o botão está desabilitado no teto).
Correção sugerida do item 10: nas contas, com o erro de teto, marcar `aria-invalid` nos três campos (ou no que recebe o foco), sem mudar o resto.

Pendência 17.7.8: não se aplica (ver acima). A linha condicional de 17.7.6 não entra na conferência.
