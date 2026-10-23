# FND-001 — Fundação do Sistema · Especificação de UI/UX

| Campo | Valor |
|---|---|
| Feature | FND-001 — Fundação |
| Etapa / gate | E3 · gate G2 |
| Agente | `design-ui-ux` |
| Data | 22/10/2026 (revisões das rodadas 2 e 3 em 22 e 23/10/2026) |
| Entrada | Plano `01-plano.md` (revisão 7, de 23/10/2026; aprovado na revisão 6 em 22/10/2026), seções 4, 5, 6, 14 e handoff da seção 19; Brain 01, 04, 05, 09, 10, 11 e RN-009 a RN-015 (03/07); `02-modelagem-dados.md` (proposta para o G1, consultada na revisão desta rodada); componentes em `src/components/ui` e tela antiga em `src/app` (somente referência) |
| Escopo **implementado pela FND (E5)** | Shell "Financeiro Ultra" com navegação em placeholders, login, `/auth/confirm` e aceite de convite / definir senha, recuperação de senha, estados de acesso (2.7), páginas-placeholder (2.8), estados transversais do shell (carregando, erro, não encontrado, sessão expirada), responsividade e acessibilidade desses itens, e os critérios do QA correspondentes (seção 8.A) |
| Escopo **só especificado (padrão para features futuras, PROPOSTA)** | Padrão de tabela financeira (2.9), apresentação de Recebido / Devido / Saldo (2.10), padrão de confirmação (5.1), campos monetários (5.3), componentes financeiros (3.3) e critérios UX-23 a UX-33, UX-35 a UX-41, UX-43, UX-44 e UX-54 (seção 8.B). Estão no plano como entrega da especificação (seção 19), **não** como código da E5 e **não** entram nos critérios de aceite da FND (CA-14 a CA-16) sem aprovação do responsável (U-02, seção 9.4) |
| Fora do escopo | Telas de features futuras (cadastros, competências, recebimentos, rateio, apuração, compensações, liquidação, importação, OCR, dashboards). Aqui existe apenas o **espaço na navegação** e o **padrão** que elas devem seguir |
| Status | Revisada (rodadas 2 e 3, revisão independente); entregue para o gate G2. Ver "Histórico de revisão" ao final |

## Convenções deste documento

- **OFICIAL**: vem de `11-Decisoes.md` ou de documento ativo do Brain (fonte citada).
- **PROPOSTA**: recomendação do design; vira regra com a aprovação do gate G2.
- **DECISÃO PENDENTE**: depende do responsável pelo produto (ou de outro agente); a UI reserva o espaço, não inventa a regra.
- **[FND]**: item implementado pela E5 e verificado nos critérios da FND (seção 8.A). **[PADRÃO-FUTURO]**: padrão para features futuras; é PROPOSTA, não é implementado pela E5 e não entra nos critérios de aceite da FND (seção 8.B). Seção ou subseção sem marca vale como [FND].
- Nomes de pessoas, sócios, clientes e e-mails nos exemplos são fictícios (RAT-D019): Sócio Alfa, Sócio Beta, Sócio Gama, "Cliente Modelo", `usuario@exemplo.com`.
- Caminhos de rota e nomes de componentes são **PROPOSTA** de nomenclatura; os nomes finais ficam com o `desenvolvedor`.
- Este documento não altera regra financeira. Onde a UI precisa de um valor derivado (por exemplo, a direção do saldo), ela **recebe** o resultado do domínio; não calcula (plano, seção 5).

---

## 0. Fundamentos

### 0.1 Nome e identidade (RAT-D013, OFICIAL)

- O produto se chama **Financeiro Ultra**. É o único nome exibido: shell, tela de login, `<title>`, e-mails de convite/recuperação (texto do template, a cargo do desenvolvedor) e metadados.
- "Ultra Contabilidade" (nome do código de 07/10) **não** aparece na interface. Hoje aparece em `src/app/layout.tsx`, `src/app/login/page.tsx` e `src/components/app-header.tsx`; a substituição é da E5.
- Formato do título de página (PROPOSTA): `{Página} · Financeiro Ultra`. Exemplo: `Recebimentos · Financeiro Ultra`. Login: `Entrar · Financeiro Ultra`.
- Marca (PROPOSTA): wordmark em texto "Financeiro Ultra" (peso 600) acompanhado de um monograma "FU" em quadrado arredondado na cor `primary`. Não existe arquivo de logotipo; o favicon atual é o padrão do Next. A criação de um logotipo definitivo não faz parte da FND (ver 9.3). **Aceito pelo responsável em 23/10/2026 (plano, revisão 7):** o nome "Financeiro Ultra" em texto no lugar do logotipo, até haver um definitivo.

### 0.2 Vocabulário na interface (RAT-D017 e RAT-D015, OFICIAL)

| Brain / código antigo | Texto na interface | Observação |
|---|---|---|
| Parte | **Sócio** / **Sócios** | Em rótulos, títulos, colunas, mensagens e ajuda. Nunca "Parte" |
| Indicador, Empresa | **não usar** | Termos do código de 07/10, vetados |
| Cliente, Recebedor, Competência, Recebimento, Compensação, Liquidação, Comprovante | mantidos | |
| Perfis | **Administrador**, **Operador**, **Visualizador** (OFICIAL, RAT-D011) e **Sócio** (PROPOSTA do plano, seção 6; CA-06) | RAT-D011 oficializa só os três primeiros perfis e o *login próprio dos sócios*, vinculado ao cadastro de sócio; diz que o que cada sócio pode ver e fazer ainda será definido. O **papel "Sócio"** e a regra de **negar por padrão** são PROPOSTA do plano aprovado (sem respaldo no Brain 10), na pendência P-02b. O papel e a entidade "Sócio" usam a mesma palavra; ver 2.2 (bloco do usuário) para o rótulo composto |
| Percentual padrão, divisão personalizada, normalização proporcional, `CUSTOM`, `ADMIN_FINANCEIRO` | **não usar** | Revogados ou descartados (RAT-D004, RAT-D015) |

Regras de redação (PROPOSTA): português do Brasil; tratamento neutro em "você"; frases curtas; verbos de ação nos botões ("Entrar", "Enviar link", "Definir senha"); sem jargão técnico (nada de "RLS", "JWT", "token"); sem pontos de exclamação; datas `dd/mm/aaaa` e horas `hh:mm` no fuso `America/Sao_Paulo` (P-19 recomenda esse fuso; DECISÃO PENDENTE); competência `mm/aaaa` em tabelas e "outubro de 2026" em títulos.

### 0.3 Não há tela de percentuais (RAT-D015, OFICIAL)

- A divisão é **sempre 1/n** entre os sócios indicados no cliente. Não existe percentual armazenado, nem padrão por sócio, nem divisão própria por cliente.
- Consequências para a UI, valendo para toda feature futura (o item 1 já vale para a FND: nenhum campo de percentual e nenhum item "Regras de divisão" no shell; os itens 2 a 4 são [PADRÃO-FUTURO]):
  1. Não existe campo editável de percentual em nenhuma tela; nem o item "Regras de divisão" do módulo Configurações do Brain 05 (ver 9.1).
  2. Quando uma tela mostrar a divisão, ela é **somente leitura e derivada**, no formato "Divisão igual entre 3 sócios (1/3 cada)". A fração é o dado principal; o percentual é secundário e marcado como aproximado quando não é exato: "1/3 (≈ 33,33%)", "1/2 (50%)", "1/4 (25%)".
  3. Nunca exibir uma linha "Total 100%" somando percentuais arredondados (3 × 33,33% = 99,99%). A soma que importa é a dos valores em reais, que fecha exatamente em centavos (RAT-D015; Brain 07).
  4. Quando um valor em reais carregar o centavo de ajuste de arredondamento, a tela deve sinalizar com uma marca visível e uma nota em texto (ver 2.10.6). O registro do resíduo é da modelagem (P-17); a UI apenas exibe o que vier pronto.

### 0.4 Princípios de design aplicados

1. O estado financeiro nunca depende só de cor: todo estado tem **texto + ícone**; a cor reforça.
2. `Recebido`, `Devido` e `Saldo` têm nomes, ordem, tratamento tipográfico e ícones fixos em todo o sistema (2.10; [PADRÃO-FUTURO], pois a FND não exibe nenhum dos três).
3. Vermelho é reservado a erro e ação destrutiva. **Saldo não usa vermelho nem verde**, porque "deve transferir" e "deve receber" não são "ruim" e "bom" (2.10.3).
4. Ação sensível: o botão diz exatamente o que fará, o resumo mostra o impacto, e a confirmação é proporcional ao risco (5.1).
5. A interface não calcula dinheiro, percentual, saldo nem status financeiro (plano, seção 5). Ela formata e rotula valores já calculados.
6. Reaproveitar o design system existente (shadcn `base-nova` sobre Base UI) antes de criar padrão novo (seção 3).

### 0.5 Tokens visuais

O tema atual (`src/app/globals.css`) é neutro (cinzas, `--radius` 0,625 rem, Geist Sans e Geist Mono) e traz tokens de tema escuro, mas o layout raiz não ativa a classe `.dark`.

| Item | Decisão | Classe |
|---|---|---|
| Tema | FND entrega **somente o tema claro**; sem alternador claro/escuro. Os tokens `.dark` existentes permanecem sem uso | PROPOSTA |
| Fonte | Geist Sans (já carregada). Valores monetários em tabela usam `tabular-nums`. Se a Geist Sans instalada não oferecer algarismos tabulares, usar Geist Mono (já carregada) nas colunas numéricas (critério UX-31) | PROPOSTA |
| Tons semânticos | Acrescentar cinco tons: `neutral` (existente), `info`, `success`, `warning`, `danger` (= `destructive` atual). Cada tom tem fundo, texto e borda; texto de cada tom com contraste mínimo 4,5:1 sobre o seu fundo | PROPOSTA |
| Tons: valores iniciais (claro) | `info`: texto `oklch(0.42 0.13 255)`, fundo `oklch(0.96 0.02 255)` · `success`: texto `oklch(0.42 0.10 150)`, fundo `oklch(0.96 0.03 150)` · `warning`: texto `oklch(0.45 0.10 70)`, fundo `oklch(0.97 0.05 85)`. Valores de partida; o QA mede o contraste real (UX-34) | PROPOSTA |
| Texto secundário | `--muted-foreground: oklch(0.556 0 0)` dá cerca de 4,7:1 sobre branco, mas cerca de **4,4:1** sobre `bg-muted` (rodapé de tabela, hover de linha, fundo da página): abaixo de AA. Reduzir para `oklch(0.50 0 0)` (≈ 5,5:1). Estimativa por cálculo; o QA confirma com medição | PROPOSTA |
| Anel de foco | `--ring: oklch(0.708 0 0)` com `ring/50` fica em torno de 1,6:1 a 2,5:1 sobre branco, abaixo dos 3:1 exigidos para indicadores de foco (WCAG 1.4.11). Escurecer para algo próximo de `oklch(0.50 0.12 255)` (≈ 6:1), mantendo o anel de 3 px | PROPOSTA |
| Espaçamento | Escala do Tailwind já em uso; conteúdo de formulário em `max-w-2xl`, tabelas em largura total do conteúdo | PROPOSTA |

**Aceito pelo responsável em 23/10/2026 (plano, revisão 7):** tokens de cor com contraste reforçado, por acessibilidade. As linhas "Tons semânticos", "Texto secundário" e "Anel de foco" acima deixam de ser apenas PROPOSTA de design: os valores iniciais são o ponto de partida aceito, e o QA mede o contraste real (UX-34) e ajusta os valores se a medição ficar abaixo do mínimo.

Escopo dos tokens: na FND valem os tons `info`, `success`, `warning` e `danger` (usados em avisos, estados de acesso e no aviso de ambiente), o ajuste de `muted-foreground` e o do anel de foco, todos [FND]. O uso do tom em Saldo (âmbar e azul, 2.10.3) é [PADRÃO-FUTURO].

### 0.6 Escopo: o que a E5 implementa e o que é padrão para features futuras

Fonte: plano, seção 14 (E5: "layout autenticado com navegação (placeholders), rota `/auth/confirm` e página de definir/redefinir senha") e CA-14 ("Shell autenticado com o nome Financeiro Ultra, navegação dos módulos e estados conforme `03-ui-ux.md`"). O plano pede a este documento também o **padrão** de tabela financeira, de Recebido / Devido / Saldo e de confirmação (seção 19), mas não prevê componentes financeiros, diálogo de confirmação nem componentes de exemplo no código da FND.

| Bloco | Seções | Escopo | Verificação |
|---|---|---|---|
| Identidade, vocabulário, tokens usados pelas telas da FND | 0.1, 0.2, 0.3 (item 1), 0.5 | [FND] | Seção 8.A |
| Shell, navegação com placeholders, visibilidade por papel (só UX) | 2.1 a 2.3, 2.8 | [FND] | Seção 8.A |
| Login, `/auth/confirm`, definir senha, recuperar senha | 2.4 a 2.6, 4.6 | [FND] | Seção 8.A |
| Estados de acesso e estados transversais do shell (carregando, erro, não encontrado, sessão expirada) | 2.7, 4.1, 4.3, 4.8, 4.9 | [FND] | Seção 8.A |
| Interações, responsividade e acessibilidade das telas acima | 5.2 a 5.4, 6, 7 (exceto 7.6) | [FND] | Seção 8.A |
| Tabela financeira, Recebido / Devido / Saldo, sinal da RN-010, legenda, totais | 2.9, 2.10, 6 (linhas de tabela e KPI), 7.6 | [PADRÃO-FUTURO], PROPOSTA | Seção 8.B (não é critério da FND) |
| Confirmação de ações sensíveis e campos monetários | 5.1, 5.3 (último item), 4.7 (exceto "Por papel") | [PADRÃO-FUTURO], PROPOSTA | Seção 8.B (não é critério da FND) |
| Componentes financeiros e de confirmação | 3.3 | [PADRÃO-FUTURO], PROPOSTA | Seção 8.B (não é critério da FND) |

Regra de leitura: tudo o que está marcado [PADRÃO-FUTURO] é orientação para o `design-ui-ux` e o `desenvolvedor` das features (Apuração, Recebimentos, Competências, Importação). Implementá-lo na FND, inclusive como "componentes de exemplo", é **ampliação de escopo** e depende de aprovação do responsável (U-02, 9.4).

---

## 1. Jornada

Perfis considerados: Administrador, Operador, Visualizador e Sócio (papel com login próprio, sem escopo definido — P-02b). Todo o texto de tela está em 2.x.

### J1 — Primeiro acesso por convite

1. O Administrador convida o usuário pelo painel do Supabase (plano, seção 6; a tela "Gerenciar usuários" fica fora da FND — P-24).
2. O usuário recebe o e-mail de convite "Você foi convidado para o Financeiro Ultra" e clica no link.
3. Abre `/auth/confirm`. **PROPOSTA:** a primeira abertura mostra uma tela intermediária com o botão "Aceitar convite", e só o clique troca o `token_hash` por sessão. Motivo: verificadores de link de e-mail abrem a URL antes da pessoa e podem consumir o token de uso único. A decisão técnica é do `desenvolvedor` e da `seguranca` (ver 9.4). Alternativa sem tela: verificação automática na abertura.
4. Com a sessão criada, vai para `/definir-senha` (modo convite).
5. Define e confirma a senha e conclui. Tela de sucesso com o botão "Ir para o Financeiro Ultra".
6. Entra na área autenticada. O guarda decide o destino pela **regra única de acesso** (caixa abaixo): perfil ativo → Dashboard; sem perfil ativo → "Sem acesso ativo" (2.7.1); papel Sócio → "Acesso de sócio ainda não disponível" (2.7.3).

Ponto de atenção: na FND o papel é definido **depois** do convite (plano, seção 6). É provável que o passo 6 caia em "Sem acesso ativo"; a tela trata isso como situação esperada, não como erro, e oferece "Verificar novamente".

> **Regra única de acesso (PROPOSTA, vale para J1, J2, J4, 2.4, 2.7.1, UX-08 e UX-17).** Pessoa **autenticada sem perfil ativo** (sem linha de perfil, `role` nulo ou perfil inativo) **mantém a sessão** e vê sempre a tela 2.7.1 no shell mínimo, qualquer que seja a porta de entrada: login, convite aceito ou navegação interna. A sessão **não** é encerrada nem há mensagem especial no login. Justificativa: (a) o convite aceito antes de o Administrador definir o papel é o caminho normal da FND (plano, seção 6) e precisa de "Verificar novamente" sem novo login; (b) dois tratamentos para a mesma condição fariam "Sair" e entrar de novo mudar o resultado; (c) a sessão sem perfil ativo não lê dado de negócio: na modelagem proposta, `has_role()` e `can_read_business()` exigem `p.active` e um papel, e o usuário sem papel lê apenas o próprio perfil (`02-modelagem-dados.md`, funções de autorização e observações de RLS). Diverge do código atual, em que a Server Action de login encerra a sessão (P-6 em 9.2), e depende da confirmação da `seguranca` (9.4); se ela preferir encerrar a sessão, a regra se inverte **em todos os pontos**, e J1 passo 6 passa a terminar no login com aviso.

### J2 — Entrada recorrente

1. Abre o endereço; sem sessão, vai para `/login` (o destino pretendido é guardado pelo redirecionamento do proxy, só em navegação GET e fora de `/`; no login é revalidado e só vale caminho interno, 4.8).
2. Informa e-mail e senha e aciona "Entrar".
3. Credenciais válidas e perfil ativo → vai ao destino pretendido ou ao Dashboard.
4. Credenciais válidas, mas sem perfil ativo → sessão mantida e tela "Sem acesso ativo" (2.7.1), pela regra única de acesso (J1).
5. Falha → mensagem acima do formulário; o e-mail permanece preenchido e a senha é limpa.

### J3 — Recuperação de senha

1. No login, aciona "Esqueci minha senha" → `/recuperar-senha`.
2. Informa o e-mail e aciona "Enviar link". A resposta é sempre a mesma, exista ou não a conta (sem enumeração de usuários).
3. Recebe o e-mail e clica no link → `/auth/confirm` → `/definir-senha` (modo recuperação).
4. Define a nova senha e conclui → tela de sucesso → segue para o Dashboard (ou para o estado de acesso, se for o caso).

### J4 — Sessão ativa sem acesso a dado de negócio

1. Usuário autenticado cujo perfil está ausente, sem papel (`role` nulo, chamado "sem vínculo" no plano e na modelagem), inativo, ou que é Sócio sem escopo cai no estado correspondente (2.7), **dentro de uma tela mínima** (sem menu de módulos). Inclui o caso de perfil desativado durante uma sessão aberta: na próxima navegação, o guarda mostra 2.7.1.
2. Pode "Verificar novamente" (recarrega o perfil) ou "Sair". Não há tentativa de contornar.

### J5 — Uso diário

1. Entra pelo Dashboard e navega pelo menu lateral (módulos do Brain 05).
2. Em módulos ainda não implementados, vê a página "Módulo ainda não disponível" (2.8).
3. Ao tentar abrir, por URL, uma área que o papel não permite, vê "Sem permissão" (2.7.4).
4. Sai pelo botão "Sair" do bloco do usuário.

### J6 — Sessão expirada durante o uso

1. Uma navegação ou ação detecta que não há mais sessão.
2. Vai para `/login` com o aviso "Sua sessão expirou. Entre novamente para continuar." e retorna ao destino após o login (destino interno validado; 4.8 e 4.9). Ações financeiras em andamento **não** são dadas como concluídas (5.1.5).

### J7 — Ação financeira sensível (padrão, vale para features futuras)

1. O usuário vê o botão da ação com estado e motivo de indisponibilidade, se houver.
2. Abre o diálogo de confirmação com resumo do impacto (5.1).
3. Confirma com o nível de fricção proporcional ao risco.
4. Vê o resultado persistente na página (selo de estado, data, usuário) e o foco volta a um ponto estável.

---

## 2. Estrutura das telas

### 2.1 Mapa de rotas e agrupamentos (PROPOSTA)

| Grupo de rotas | Rotas | Sessão | Moldura |
|---|---|---|---|
| `(public)` | `/login`, `/recuperar-senha` | Não | Cartão centralizado (auth) |
| `(auth-flow)` | `/auth/confirm`, `/definir-senha` | `/auth/confirm` cria a sessão; `/definir-senha` exige sessão | Cartão centralizado (auth), **sem** menu de módulos |
| `(app)` | `/` (Dashboard) e as rotas de módulos (2.2) | Sim, mais perfil ativo | Shell completo, ou **shell mínimo** para os estados de acesso (2.7) |

Por que `(auth-flow)` fica fora de `(app)`: quem acabou de aceitar um convite pode não ter perfil ainda, e o shell com módulos não faz sentido nem deve consultar dados de negócio nesse momento. Isso ajusta o esboço da seção 3 do plano (que mostra apenas `(public)/login` e `(app)`); ver 9.2.

### 2.2 Shell autenticado

Prioridade dos blocos: **(1)** identificação e contexto (onde estou, quem sou), **(2)** navegação, **(3)** conteúdo, **(4)** utilitários (usuário e sair).

**Desktop (a partir de 1024 px)**

```text
┌───────────────┬───────────────────────────────────────────────────────┐
│ [FU] Financeiro│  [Aviso de ambiente — só fora de produção]            │
│      Ultra     ├───────────────────────────────────────────────────────┤
│               │  Título da página (h1)                  [Ações da página]│
│ Dashboard     │  Descrição curta                                      │
│               │  [Faixa de contexto: Competência ▾] (quando aplicável) │
│ OPERAÇÃO      ├───────────────────────────────────────────────────────┤
│  Competências │                                                       │
│  Recebimentos │   Conteúdo                                            │
│  Importar ... │                                                       │
│  Pendências...│                                                       │
│ FECHAMENTO    │                                                       │
│  Apuração     │                                                       │
│  Compensações │                                                       │
│ CADASTROS     │                                                       │
│  Clientes     │                                                       │
│ CONFIGURAÇÕES │                                                       │
│  Sócios ...   │                                                       │
│ ───────────── │                                                       │
│ Usuário/Papel │                                                       │
│ [Sair]        │                                                       │
└───────────────┴───────────────────────────────────────────────────────┘
```

- Barra lateral fixa de 256 px, com rolagem própria se o menu exceder a altura. Sem modo recolhido na FND (PROPOSTA; reavaliar quando houver telas largas).
- Cabeçalho de página: `h1` único, descrição de uma linha, ações da página à direita (máximo uma ação primária visível) e, abaixo, a **faixa de contexto** (competência) como espaço reservado para as features que dependem dela. Na FND a faixa não é exibida.
- Largura do conteúdo: tabelas usam toda a largura disponível; formulários e cartões de leitura, `max-w-2xl`.
- **Aviso de ambiente** (PROPOSTA): em `APP_ENV` diferente de `production`, faixa fixa no topo do conteúdo com texto "Ambiente de testes — use apenas dados fictícios" (tom `warning`, com ícone). Em produção não aparece. Motivo: o plano admite Preview e Production compartilhando o mesmo banco enquanto não houver dados reais (R-17); a faixa evita confundir teste com produção.

**Tablet e mobile (abaixo de 1024 px)**

- Barra superior fixa de 56 px: botão de menu (abre painel lateral em tela cheia na largura útil), wordmark centralizado ou à esquerda, e botão do usuário.
- O painel lateral replica a barra lateral do desktop, incluindo o bloco do usuário e "Sair".
- O aviso de ambiente fica logo abaixo da barra superior.

**Bloco do usuário** (rodapé da barra lateral / painel móvel)

- Iniciais em círculo, nome (ou e-mail, se não houver nome), papel e, se houver vínculo com cadastro de sócio, "Sócio Alfa". Formato do rótulo (PROPOSTA): `Administrador · Sócio Alfa`; sem vínculo, apenas o papel.
- Botão "Sair" sempre visível (não escondido em menu, porque o dropdown não está instalado e o ganho de espaço não compensa). Sair não pede confirmação (reversível).

### 2.3 Navegação pelos módulos (Brain 05)

Os itens abaixo seguem os módulos do Brain 05, na ordem do fluxo operacional (04). O agrupamento por rótulos de seção é PROPOSTA; os nomes dos módulos são OFICIAIS (Brain 05) com a troca "Partes" → "Sócios" (RAT-D017).

| Seção | Item | Rota (PROPOSTA) | Ícone (lucide) | Observação |
|---|---|---|---|---|
| (sem rótulo) | Dashboard | `/` | `layout-dashboard` | Brain 05 — Dashboard |
| Operação | Competências | `/competencias` | `calendar-days` | Abertura, conferência, apuração, liquidação, reabertura |
| Operação | Recebimentos | `/recebimentos` | `banknote` | |
| Operação | Importar comprovantes | `/importar-comprovantes` | `file-up` | |
| Operação | Pendências de reconhecimento | `/pendencias` | `scan-search` | Indicador numérico de itens, quando existir a feature |
| Fechamento | Apuração | `/apuracao` | `calculator` | Recebido, Devido e Saldo por sócio |
| Fechamento | Compensações | `/compensacoes` | `arrow-left-right` | |
| Cadastros | Clientes | `/clientes` | `users` | |
| Configurações | Sócios | `/configuracoes/socios` | `handshake` | Antes "Partes" no Brain 05 |
| Configurações | Usuários | `/configuracoes/usuarios` | `key-round` | Na FND, a gestão de usuários é feita pelo painel do Supabase (P-24); o item é só um espaço reservado |
| Configurações | Aliases | `/configuracoes/aliases` | `tags` | |
| Configurações | Parâmetros do sistema | `/configuracoes/parametros` | `sliders-horizontal` | |

Notas:

- **"Regras de divisão" não existe** (RAT-D015): o submódulo listado no Brain 05 está obsoleto e não ganha item de menu (ver 9.1).
- **Recebedores:** o Brain 05 não lista um módulo para cadastro de recebedores, embora 02-Dominio defina a entidade e RAT-D002 exija a separação. Onde o cadastro vive (dentro de Configurações > Sócios, ou item próprio) é a DECISÃO PENDENTE **U-01** da UI (9.4), que **depende da P-08** (enunciado original mantido: "Recebedor é sempre um Sócio — Parte, no Brain — ou pode haver intermediário?"). A recomendação do design, sujeita à P-08: acompanhar a primeira feature do roadmap do plano, "Sócios, recebedores e aliases", e abrigar o cadastro em Configurações > Sócios. A navegação da FND reserva uma posição em "Configurações" e não a nomeia.
- A configuração de ícones, rótulos, rotas, papéis e disponibilidade fica numa **única estrutura de dados** de navegação (PROPOSTA: `components/shell/nav-config`), para que liberar um módulo seja uma mudança de uma linha.

**Disponibilidade na FND.** Todos os módulos são placeholders. O item aparece no menu com o selo textual "Em breve" (tom `neutral`) e leva a uma página-placeholder (2.8). Não se usa item desabilitado, porque link desabilitado é mal anunciado por leitores de tela e esconde a explicação. O selo some quando o módulo é liberado.

**Visibilidade por papel (PROPOSTA).** A tabela espelha a matriz do plano (seção 6) e **serve apenas para UX**: a autorização real é do servidor e do RLS. Regra: ocultar o que o papel nunca poderá usar; mostrar em modo leitura o que ele pode consultar.

| Item | Administrador | Operador | Visualizador | Sócio |
|---|:-:|:-:|:-:|:-:|
| Dashboard | ✔ | ✔ | ✔ | P-02b (FND: oculto; nenhum módulo) |
| Competências, Recebimentos, Apuração, Compensações | ✔ | ✔ (leitura onde o plano veda a ação) | ✔ (leitura) | P-02b (FND: oculto) |
| Importar comprovantes | ✔ | ✔ | oculto | P-02b (FND: oculto) |
| Pendências de reconhecimento | ✔ | ✔ | ✔ (leitura) | P-02b para leitura (FND: oculto); revisar reconhecimento é "—" (nunca) para o Sócio no plano |
| Clientes | ✔ | ✔ (consulta) | ✔ (consulta) | P-02b (FND: oculto) |
| Configurações (todos os itens) | ✔ | oculto | oculto | — (o plano veda ao Sócio configurar sócios e aliases e gerenciar usuários; "Parâmetros do sistema" não consta da matriz e segue oculto por padrão) |

Legenda: "—" e "oculto" valem como **nunca** para o papel (o plano marca "—"). "P-02b (FND: oculto)" é **pendência aberta**: a FND nega por padrão e o menu não mostra o item, mas a decisão do responsável pode abrir a linha (por exemplo, "o próprio saldo", "enviar comprovantes"); o QA não deve tratá-la como regra definitiva. Linhas de origem no plano, seção 6: "Gerenciar clientes", "Lançar recebimentos e importar comprovantes" e "Leitura geral" (esta, "P-02b (na FND: nenhuma)").

O detalhe por papel de cada módulo é fechado na feature correspondente. A matriz acima não decide permissões: apenas orienta o que o menu mostra. Para o papel Sócio, enquanto P-02b estiver aberta, **não há menu de módulos** (2.7.3).

**Estado do item.** Item ativo: `aria-current="page"`, fundo de acento, texto em peso 600 e uma barra de 3 px à esquerda (a marca não depende só de cor). Foco visível por teclado em todos os itens. Rótulo de seção é texto pequeno em caixa alta, não focável, em um `<h2>` visualmente discreto ou `aria-label` do grupo.

### 2.4 Login (`/login`)

**Estrutura (de cima para baixo):** monograma e wordmark "Financeiro Ultra" → título "Entrar" (`h1`) → descrição "Acesse com seu e-mail e senha." → aviso (quando houver) → campo E-mail → campo Senha (com botão mostrar/ocultar) → botão "Entrar" (largura total) → link "Esqueci minha senha" → texto de apoio "O acesso é por convite. Se você ainda não recebeu um, procure um Administrador."

- Não há "Criar conta" nem link de cadastro (auto-cadastro desligado — plano, seção 6).
- Cartão de largura máxima 384 px, centralizado, fundo da página `bg-muted/40` (padrão atual). Reaproveita `Card`, `Input`, `Label`, `Button`, `Alert`.
- Campo e-mail: `type="email"`, `autoComplete="username"` (permite que gerenciadores de senha associem o par), foco inicial no carregamento da página. Campo senha: `autoComplete="current-password"`.
- Botão mostrar/ocultar senha: `type="button"`, `aria-label` "Mostrar senha" / "Ocultar senha", `aria-pressed`.

**Mensagens (todas acima do formulário, no `Alert`):**

| Situação | Tom | Texto |
|---|---|---|
| Credenciais inválidas | `danger` | "E-mail ou senha inválidos." (mesma frase para e-mail inexistente e senha errada) |
| Campos vazios ou e-mail malformado | `danger` | "Informe um e-mail válido e a senha." + `aria-invalid` no campo faltante |
| Muitas tentativas | `warning` | "Muitas tentativas de entrada. Aguarde alguns minutos e tente novamente." |
| Falha de rede ou servidor | `danger` | "Não foi possível entrar agora. Tente novamente em instantes." |
| Credenciais certas, sem perfil ativo | — (sem mensagem no login) | O login **conclui** e a pessoa vai à tela 2.7.1, pela regra única de acesso (J1). A sessão não é encerrada. O texto atual do código ("Procure o financeiro") deixa de existir (9.2, P-6) |
| Sessão expirada (vindo de J6; indicador `aviso=sessao-expirada` no redirecionamento do proxy, 4.8) | `info` | "Sua sessão expirou. Entre novamente para continuar." |
| Senha redefinida / convite concluído e usuário voltou ao login | `success` | "Senha definida. Entre com a nova senha." (usado só se o fluxo terminar sem sessão) |

**Comportamento:** Enter envia; durante o envio, o botão fica desabilitado com o texto "Entrando…" e um indicador; a senha é limpa após falha; o foco permanece no campo de senha; o `Alert` com `role="alert"` anuncia o erro sem mover o foco. Um papel Sócio ativo **entra normalmente** (CA-06: autentica) e cai em 2.7.3; quem não tem perfil ativo entra e cai em 2.7.1.

### 2.5 Aceite de convite e definição de senha

**2.5.1 Tela de aceite (`/auth/confirm`, apenas se a PROPOSTA de tela intermediária for aprovada)**

- Cartão de auth. Título "Você foi convidado" (`h1`), texto "Aceite o convite para criar sua senha e acessar o Financeiro Ultra.", botão primário "Aceitar convite", e, abaixo, texto pequeno "Convite enviado para {e-mail}" quando o parâmetro estiver disponível.
- Carregando (verificação do link): botão desabilitado "Verificando…".
- Falha: ver 4.6, "Link inválido ou expirado".

**2.5.2 Definir senha (`/definir-senha`)**

Mesma tela para dois modos, trocando apenas título e descrição (o modo vem do contexto do link; se não vier, usar o texto neutro de recuperação):

| Modo | `h1` | Descrição | Botão |
|---|---|---|---|
| Convite | "Defina sua senha" | "Bem-vindo ao Financeiro Ultra. Crie uma senha para acessar sua conta." | "Definir senha" |
| Recuperação | "Redefinir senha" | "Crie uma nova senha para acessar sua conta." | "Salvar nova senha" |

- Campos: **Nova senha** e **Confirmar nova senha**, ambos com mostrar/ocultar; `autoComplete="new-password"`.
- A **regra de senha** aparece como texto de ajuda **antes** de qualquer erro, em lista curta, com marcação de cumprimento ao digitar (ícone + texto "cumprido" / "pendente", anunciado com `aria-live="polite"` sem repetir a cada tecla). O valor mínimo e as demais exigências são definidos pela `seguranca` e pelo `desenvolvedor` (DECISÃO PENDENTE, ver 9.4). Recomendação de design: aceitar frases longas e colar do gerenciador de senhas; não obrigar combinações arbitrárias de caracteres.
- Validação: ao enviar (não a cada tecla), com mensagem por campo: "A senha ainda não atende às regras." / "As senhas não coincidem."
- **Sem sessão** ao abrir a rota: tela de erro com "Sua sessão para definir a senha expirou. Solicite um novo link." e o botão "Solicitar novo link" → `/recuperar-senha`.
- **Sucesso:** a própria página troca o formulário por um estado de sucesso (`role="status"`, foco movido para o título): ícone de confirmação, título "Senha definida", texto "Sua senha foi salva." e o botão "Ir para o Financeiro Ultra". Não se usa toast para esta confirmação.
- Se o convite expirou antes do aceite, o aviso da tela de erro (4.6) orienta a pedir um novo convite ao Administrador. Se a recuperação por e-mail funciona para usuário ainda não confirmado é uma pergunta técnica ao `desenvolvedor` (9.4).

### 2.6 Recuperação de senha (`/recuperar-senha`)

- Cartão de auth. `h1` "Recuperar senha"; descrição "Informe o e-mail da sua conta. Enviaremos um link para criar uma nova senha."; campo E-mail; botão "Enviar link"; link "Voltar para o login".
- **Resposta única** (sem enumeração): após o envio, o formulário é substituído por um estado de sucesso com ícone de e-mail, título "Verifique seu e-mail" e texto "Se houver uma conta para {e-mail}, enviamos um link para criar uma nova senha. Se não encontrar a mensagem, confira a caixa de spam." O prazo de validade do link é a expiração do link/OTP de e-mail **configurada no Supabase Auth** (configurada pelo responsável na E9, a partir do checklist de painéis entregue na E8) e deve ser escrito no texto quando for conhecido; não inventar um número. A P-25 (SMTP e domínio) define apenas o remetente e o domínio, não o prazo.
- Reenvio: botão "Enviar novamente" desabilitado durante o intervalo de espera, com contagem regressiva em texto ("disponível em 45 s") sem anunciar a cada segundo (anunciar no início e ao liberar).
- Erro de limite: "Muitas solicitações. Aguarde alguns minutos e tente novamente." (`warning`). Erro de rede: "Não foi possível enviar agora. Tente novamente em instantes." (`danger`).
- Dependência externa: até o SMTP próprio existir (P-25), o envio no ambiente hospedado é limitado; a tela não muda.

### 2.7 Estados de acesso dentro do sistema

Estes estados valem para **qualquer** rota de `(app)` e usam o **shell mínimo**: barra superior com wordmark e bloco do usuário (e-mail e papel, se houver), **sem menu de módulos**, conteúdo central em cartão `max-w-md`. Nenhum desses estados consulta ou mostra dado de negócio, nem nomes de sócios (o papel Sócio não tem permissão para ler essa tabela até P-02b).

**2.7.1 Acesso não configurado (autenticado, sem perfil ativo: sem perfil, `role` nulo ou perfil inativo)**

- Ícone `shield-alert`, tom `warning`. Título "Sem acesso ativo". Texto: "Sua conta {e-mail} foi autenticada, mas não tem acesso ativo ao Financeiro Ultra. Se você esperava ter acesso, peça a um Administrador para verificar o seu cadastro." (texto neutro, sem "ainda não": serve tanto a quem aguarda a liberação do papel quanto a quem foi desativado de propósito)
- Ações: **Verificar novamente** (recarrega o perfil, sem exigir novo login) e **Sair**.
- A mesma mensagem cobre perfil inexistente, `role` nulo e perfil inativo, para não revelar diferenças de configuração. **Divergência registrada (9.2, P-10):** a modelagem proposta distingue "sem vínculo" (`role is null`) de "bloqueado" (`active = false`) e o CA-08 fala em "bloqueio de usuário inativo"; esta spec funde os dois numa única tela por sigilo, e a decisão final é da `seguranca`, junto com a regra única de acesso. Na modelagem proposta, o estado "sem vínculo" do plano corresponde a `role` nulo (`02-modelagem-dados.md`: "`role is null` → 'sem vínculo'"), portanto já está coberto por esta tela; não há tela separada.
- Alcançável por: convite aceito antes de o Administrador definir o papel (J1), login de conta sem perfil ativo (J2) e perfil desativado durante uma sessão aberta (J4). Mesma regra em todos (regra única de acesso, J1).

**2.7.2 Sócio sem vínculo com cadastro de sócio — CONDICIONAL ao G1 (não entra no UX-16)**

- A proposta de modelagem (`02-modelagem-dados.md`) define `check (role is distinct from 'PARTNER' or partner_id is not null)` e "`PARTNER` exige `partner_id`". Se o G1 aprovar assim, **este estado não existe** e a tela não é implementada: um usuário Sócio sempre tem vínculo, e quem não tem papel cai em 2.7.1.
- Contingência: só se o G1 **retirar** a constraint e o papel Sócio puder existir sem `partner_id`, aplica-se esta tela: ícone `info`, tom `info`, título "Seu login ainda não está vinculado a um sócio", texto "Para usar o acesso de sócio, um Administrador precisa vincular a sua conta ao seu cadastro de sócio." Ações: Verificar novamente · Sair. Nesse caso o UX-16 passa a incluí-la.
- Verificação pendente no G1: a pergunta registrada antes (9.4, `modelagem-dados`) tem resposta proposta; falta apenas a aprovação do G1.

**2.7.3 Papel Sócio sem escopo definido (P-02b, negar por padrão — PROPOSTA do plano, seção 6; RAT-D011 só oficializa o login próprio)**

- Ícone `hourglass`, tom `info`. Título "Acesso de sócio ainda não disponível". Texto: "Sua conta está ativa e vinculada a um cadastro de sócio, mas as informações disponíveis para sócios ainda estão sendo definidas. Quando forem liberadas, você as verá aqui."
- Ações: Verificar novamente · Sair. Sem botão de contato inventado.
- Não é erro nem bloqueio punitivo: tom informativo, sem vermelho, sem a palavra "negado". Não mostra o nome do sócio vinculado (ver nota do 2.7). Rótulo no bloco do usuário: apenas "Sócio".
- Sobrepõe-se a qualquer rota de `(app)`: abrir `/recebimentos` mostra este mesmo estado; não há redirecionamento em laço.
- Quando P-02b for definida, esta tela é substituída pelas telas voltadas ao sócio (feature futura, a ser especificada).

**2.7.4 Sem permissão (perfil ativo, área não permitida)**

- Ícone `lock`, tom `neutral`. `h1` "Sem permissão". Texto: "Seu papel ({Operador}) não permite acessar esta área." Ação: "Voltar ao Dashboard".
- Dentro do shell completo, no lugar do conteúdo. Mecanismo técnico (renderizar o estado na página ou usar `forbidden()`): a documentação do Next 16.4 em `node_modules/next/dist/docs` marca `forbidden.js` como **experimental** (exige habilitar `authInterrupts`); a escolha é do `desenvolvedor`, a UI é a mesma nos dois casos.
- Registro que o RLS esconde (a pessoa não pode ler): mostrar o estado **"Não encontrado"** (4.8), não "Sem permissão", para não revelar a existência do registro.

### 2.8 Dashboard e páginas-placeholder na FND

- **Dashboard (`/`)**: `h1` "Dashboard"; saudação curta "Olá, {nome}" com o papel; um único estado vazio informativo: ícone do módulo, título "Os indicadores aparecerão aqui", texto "Quando os módulos de recebimentos, apuração e compensações forem liberados, este painel mostrará o que exige a sua decisão." Sem números fictícios, sem gráficos.
- **Cada módulo do menu** (placeholder): `h1` com o nome do módulo; estado vazio com o ícone do módulo, título "Módulo ainda não disponível", texto "Esta área será liberada em uma próxima etapa do Financeiro Ultra.", ação "Voltar ao Dashboard".
- Dashboards futuros devem priorizar decisão: primeiro o que exige ação (comprovantes em revisão, compensações pendentes, clientes pendentes — Brain 05), depois os totais. Fica registrado como diretriz, sem desenho (fora do escopo).

### 2.9 Padrão de tabela financeira — [PADRÃO-FUTURO], PROPOSTA

> Não é implementado pela E5 nem verificado nos critérios da FND (0.6, 8.B). A FND não tem tabela financeira.

Aplica-se a todas as tabelas com valores monetários das features futuras (Recebimentos, Apuração, Compensações, Competências). Composição sobre o `Table` existente dentro de um `Card` com `CardContent` sem padding horizontal.

**2.9.1 Estrutura**

1. Cabeçalho do cartão: título, descrição e **contexto explícito** (competência), nunca implícito.
2. Barra de filtros e busca (quando houver), com chips dos filtros aplicados e "Limpar filtros".
3. **Legenda persistente** acima da tabela quando houver Saldo (2.10.4).
4. Tabela com `<caption>` (pode ser visualmente oculto) descrevendo o conteúdo e o escopo, por exemplo "Recebido, devido e saldo por sócio — competência 10/2026".
5. Rodapé de totais (`<tfoot>`), com o **escopo** escrito: "Total da competência (todos os registros)" ou "Total do filtro aplicado". Nunca somar apenas a página visível sem dizer.
6. Paginação no servidor (25, 50, 100 por página), com "1–25 de 312". Totais jamais dependem da página.

**2.9.2 Colunas e alinhamento**

- Primeira coluna: identificação (Cliente, Sócio, Recebimento) — texto à esquerda, quebra de linha permitida, é o **link/ação principal** da linha. A linha inteira **não** é clicável (acessibilidade e seleção de texto).
- Colunas numéricas: alinhamento à direita, cabeçalho também à direita, `tabular-nums`, mesma quantidade de casas, símbolo "R$" em todas as células (a moeda é sempre BRL e a leitura isolada de uma célula não pode depender do cabeçalho).
- Ordem das colunas de dinheiro: sempre **Recebido, Devido, Saldo**, adjacentes, nessa ordem, quando presentes. Saldo é a última e recebe separação visual (2.10.2).
- Colunas de estado: selo com texto e ícone.
- CNPJ formatado `00.000.000/0001-00` com `tabular-nums`; se a P-13 aprovar CNPJ alfanumérico, exibir em caixa alta e reservar largura.
- Datas `dd/mm/aaaa`; competência `mm/aaaa`.
- Nome longo quebra em até duas linhas (`whitespace-normal` na primeira coluna); não truncar com reticências sem alternativa em texto acessível.

**2.9.3 Ordenação, filtro e densidade**

- Ordenação por botão no cabeçalho, com `aria-sort` (`ascending`/`descending`/`none`), seta visível e rótulo "Ordenar por Saldo". Ordenação numérica usa o valor em centavos, nunca o texto formatado. Ordem inicial determinística e estável (por nome do sócio/cliente).
- Densidade padrão: linhas de 40 px; em dispositivos de toque, 44 px. Sem alternador de densidade na FND.
- Cabeçalho fixo (sticky) **somente** quando a tabela tem rolagem vertical própria (`max-h` + `overflow-auto`). O wrapper atual do `Table` usa `overflow-x-auto` e, por isso, prenderia o cabeçalho ao wrapper, não à janela: não aplicar sticky sem rolagem vertical própria.
- Primeira coluna fixa à esquerda quando a tabela rola na horizontal (tablet), com sombra lateral como indicação.

**2.9.4 Valor ausente versus zero**

- `R$ 0,00` significa **zero calculado**. `—` (travessão, com texto acessível "sem valor") significa **ainda não calculado** ou não aplicável.
- Antes da apuração, Devido e Saldo aparecem como `—` com o selo "Não apurado", nunca `R$ 0,00`, que passaria a falsa ideia de sócio conciliado.
- Sócio não indicado em um cliente recebe zero calculado (`R$ 0,00`), pois a regra é de valor zero (plano, seção 11).

**2.9.5 Estados da tabela:** carregando (esqueleto com o mesmo número de colunas e `aria-busy`), vazia (4.2), sem resultado de filtro (4.2), erro (4.3), bloqueada/somente leitura (4.7). Detalhes na seção 4.

**2.9.6 Linhas com pendência.** Pendência (por exemplo, comprovante em revisão) tem selo `warning` com texto e ícone na própria linha e um indicador no total ("3 pendências"), nunca só uma cor de fundo.

### 2.10 Recebido, Devido e Saldo (e o sinal da RN-010) — [PADRÃO-FUTURO], PROPOSTA

> Padrão de apresentação para as features (Apuração, Recebimentos, Compensações). A FND não exibe Recebido, Devido nem Saldo, não implementa os componentes desta seção e não os verifica (0.6, 8.B). As definições e o sinal vêm do Brain (RN-009, RN-010); o que é PROPOSTA é a forma de apresentá-los.

**2.10.1 Definições exibidas (glossário curto, mesmo texto em todo o sistema)**

| Termo | Definição (Brain 07 / RN-009, RN-010) |
|---|---|
| Recebido | Soma dos recebimentos cujo recebedor está associado ao sócio |
| Devido | Soma das alocações econômicas do sócio |
| Saldo | `Recebido − Devido` |

**2.10.2 Diferenciação visual (os três nunca podem ser confundidos)**

| Aspecto | Recebido | Devido | Saldo |
|---|---|---|---|
| Rótulo | "Recebido" | "Devido" | "Saldo" |
| Ícone (KPI e cabeçalhos expandidos) | `banknote` | `clipboard-list` | `scale` |
| Sinal | Nunca com sinal (≥ 0) | Nunca com sinal (≥ 0) | **Sempre** com sinal explícito (+ ou −) quando diferente de zero |
| Peso do texto | Regular | Regular | Semibold |
| Separação | — | — | Borda esquerda de 1 px na coluna e **selo de direção** (2.10.3) |
| Posição | 1º | 2º | 3º (última), sempre |

Nunca usar rótulos genéricos como "Valor" ou "Total" para um dos três. "Valor esperado" (coluna da tela antiga) não faz parte do Brain 05 e não é reaproveitado (ver 9.1).

**2.10.3 Sinal do saldo e selo de direção (RN-010, OFICIAL)**

`saldo = recebido − devido`: saldo > 0 → o sócio **deve transferir**; saldo < 0 → o sócio **deve receber**; saldo = 0 → **conciliado**.

| Saldo | Texto do selo | Ícone | Tom | Sinal no valor | Exemplo (um valor, uma célula) |
|---|---|---|---|---|---|
| > 0 | **Deve transferir** | `arrow-up-right` | `warning` (âmbar) | `+` | `[↗ Deve transferir]  +R$ 2.000,00` |
| < 0 | **Deve receber** | `arrow-down-left` | `info` (azul) | `−` | `[↙ Deve receber]  −R$ 1.000,00` |
| = 0 | **Conciliado** | `circle-check` | `neutral` | sem sinal | `[✓ Conciliado]  R$ 0,00` |

- **Cor nunca é o único meio**: cada linha tem texto do selo, ícone e sinal do número. Vermelho/verde são evitados de propósito: o sinal da RN-010 é a **inversão** da leitura intuitiva (positivo = obrigação), e verde/vermelho induziriam a ler "positivo = bom". Âmbar e azul também são distinguíveis nos tipos comuns de daltonismo.
- O selo aparece **antes** do valor na ordem do DOM, para a leitura em voz alta ser "Deve transferir, mais R$ 2.000,00". Os glifos "+" e "−" são `aria-hidden`, com texto auxiliar para leitor de tela ("mais"/"menos"). O sinal "−" usa o caractere de menos real (U+2212), não o hífen.
- **A UI não deriva a direção do sinal**: o componente de saldo recebe `amount` e `direction` (`transfer` | `receive` | `settled`) do domínio. A função que converte o sinal em direção pertence ao domínio da **feature de Apuração** (não consta da E6 nem de outra etapa da FND no plano) e deve ser coberta por teste (ver 9.4, handoff às features).
- O sinal da RN-010 é **invertido** em relação ao código de 07/10 (`saldo = direito − recebido`, positivo = deve receber; plano, 1.3 linha 7). Nenhum componente ou texto antigo deve ser reaproveitado para saldo (CA-16).

**2.10.4 Legenda obrigatória (texto permanente, não tooltip)**

Sempre que uma tela mostrar Saldo, a legenda fica visível acima da tabela ou no rodapé do cartão:

> **Saldo = Recebido − Devido.** Saldo positivo: o sócio deve transferir. Saldo negativo: o sócio deve receber. Saldo zero: conciliado.

Tooltip pode complementar, mas nunca ser a única fonte da explicação (não funciona em toque nem é confiável em leitor de tela).

**2.10.5 Exemplo de tabela de apuração por sócio** (nomes fictícios; três sócios. Os **saldos** são os do exemplo do Brain 07: A = +2.000, B = −1.000, C = −1.000. **Recebido e Devido são ilustrativos**, criados por esta spec e coerentes com a divisão 1/n e com RN-010: total recebido R$ 6.000,00, cada sócio com R$ 2.000,00 devido)

| Sócio | Recebido | Devido | Saldo |
|---|--:|--:|---|
| Sócio Alfa | R$ 4.000,00 | R$ 2.000,00 | ↗ Deve transferir  **+R$ 2.000,00** |
| Sócio Beta | R$ 1.000,00 | R$ 2.000,00 | ↙ Deve receber  **−R$ 1.000,00** |
| Sócio Gama | R$ 1.000,00 | R$ 2.000,00 | ↙ Deve receber  **−R$ 1.000,00** |
| **Total da competência** | **R$ 6.000,00** | **R$ 6.000,00** | **Soma dos saldos: R$ 0,00 ✓** |

Exemplo ilustra a apresentação. As regras de cálculo e a geração de compensações (RN-012) continuam sendo do Brain e das features.

**2.10.6 Rodapé de totais e fechamento (RN-011)**

- Linha de totais: Recebido total e Devido total, e na coluna Saldo o texto **"Soma dos saldos: R$ 0,00"** com ícone de confirmação e texto "fechamento conferido" quando o domínio informar soma zero.
- **Não há estado de "diferença de arredondamento controlada" na soma dos saldos.** A RN-011 admite diferenças controladas, mas a modelagem proposta garante que Σ alocações = Σ recebimentos e que a soma dos saldos fecha em **exatamente zero** (`02-modelagem-dados.md`, 9.4 e D-13). A diferença de até 1 centavo é **entre parcelas** de um mesmo recebimento (RAT-D015; Brain 07) e não é diferença na soma dos saldos. Enquanto o domínio ou a modelagem (P-17) não definirem explicitamente um estado "diferença controlada", a UI **não o desenha**; ele é DECISÃO PENDENTE da feature Apuração (ver D-7 em 9.1).
- Se a soma dos saldos **não** for zero: `Alert` `danger` acima da tabela, "A soma dos saldos não fecha em zero. A competência não pode ser liquidada até a inconsistência ser resolvida.", e a ação de **liquidar** fica bloqueada com o motivo visível (4.7). A regra vem do Brain 09, "Para liquidar", item 4 ("Saldo global deve fechar em zero"); a UI só comunica o resultado que o domínio devolver. **Não se bloqueia "apurar" por esse motivo**: a soma dos saldos só existe depois da apuração, e nenhum documento do Brain impede apurar ou concluir a apuração por soma diferente de zero. Qualquer efeito da inconsistência sobre a apuração é DECISÃO PENDENTE da feature Apuração; a UI não o inventa.
- **Centavo de ajuste**: valor de parcela que carrega o resíduo recebe uma marca (símbolo `‡`) e a nota de rodapé "‡ inclui 1 centavo de ajuste de arredondamento (a diferença entre as parcelas deste recebimento é de no máximo 1 centavo)". A nota fala de **parcelas**, nunca da soma dos saldos. Marca e nota em texto visível; sem depender de tooltip.

**2.10.7 Frases de compensação (pré-visualização do padrão, feature futura)**

Compensação é lida como frase, com seta e texto: "Sócio Alfa transfere R$ 1.000,00 para Sócio Beta" (`aria-label` completo na célula; o ícone de seta é decorativo). Origem sempre à esquerda, destino à direita, e o valor sem sinal.

**2.10.8 Cartões de resumo (KPI)**

Três cartões lado a lado na ordem Recebido, Devido, Saldo (em coluna no mobile): rótulo pequeno em cinza com o ícone da tabela 2.10.2, valor em `text-2xl` semibold com `tabular-nums`, linha de apoio ("na competência 10/2026"). O cartão de Saldo, quando for do sócio, traz o selo de direção; quando for global, mostra "Soma dos saldos" (que deve ser zero), nunca um único "saldo" agregado ambíguo.

---

## 3. Componentes

### 3.1 Existentes a reutilizar (`src/components/ui`, shadcn `base-nova` sobre Base UI 1.8)

| Componente | Uso na FND | Ajuste visual necessário (PROPOSTA) |
|---|---|---|
| `Button` | Todas as ações. `variant` default, outline, ghost, destructive, link; tamanhos xs a lg | Estado de carregamento (texto + indicador + largura estável); [PADRÃO-FUTURO] usar `focusableWhenDisabled` (propriedade do Button do Base UI, a confirmar na versão instalada) nos botões bloqueados por regra, para o motivo ser alcançável; em auth e mobile, altura de 44 px |
| `Input`, `Label` | Formulários de auth | Altura de 44 px em mobile; `aria-invalid` já estilizado |
| `Card` (+ Header, Title, Description, Content, Footer, Action) | Cartões de auth, estados, tabelas, KPI | — |
| `Alert` (+ Title, Description, Action) | Mensagens de formulário e de página | Hoje só tem `default` e `destructive`: acrescentar variantes `info`, `success`, `warning` com ícone obrigatório. O componente renderiza `role="alert"` e repassa `...props` depois, então o `role` pode ser sobrescrito para `status` (mensagens de sucesso e informativas) |
| `Badge` | Selo "Em breve" do menu (FND); selos de estado e de direção do saldo ([PADRÃO-FUTURO]) | Variantes de tom (`info`, `success`, `warning`) e ícone à esquerda obrigatório; altura de 20 px é aceitável com texto de 12 px, desde que o contraste do tom seja atendido |
| `Table` (+ Header, Body, Footer, Row, Head, Cell, Caption) | [PADRÃO-FUTURO] Tabelas financeiras das features; a FND não tem tabela | Variante numérica (`text-right tabular-nums`); `TableHead` e `TableCell` têm `whitespace-nowrap`: a coluna de identificação precisa `whitespace-normal`; opção de coluna fixa à esquerda; `TableCaption` ao final por padrão: usar também uma legenda no topo (2.9.1) |
| `Separator` | Divisões do menu e dos cartões | — |

Referência apenas (E5 tira do caminho ativo; não reutilizar): `components/app-header.tsx` (cabeçalho antigo com "Ultra Contabilidade"), `components/finance/*` (`companies-table`, `distribution-summary`, `indicator-badges`, `company-status-badge`, `competency-selector`, `open-competency-form`), `app/page.tsx`. O `CompetencySelector` e o padrão de `CompaniesTable` podem inspirar as features, mas codificam o vocabulário e as regras antigas.

### 3.2 Novos necessários na FND (E5)

Somente o que sustenta o shell, a autenticação, os estados de acesso e os placeholders (CA-14, CA-08, CA-06).

**Shell e estados** (`components/shell/`, PROPOSTA)

| Componente | Responsabilidade |
|---|---|
| `AppShell` | Estrutura barra lateral + conteúdo; variantes completa e **mínima** (estados de acesso); slot de aviso de ambiente |
| `SidebarNav` / `NavItem` / `NavSection` | Menu a partir de `nav-config`; `aria-current`; selo "Em breve"; filtragem por papel |
| `MobileNav` | Painel lateral para largura < 1024 px; foco preso e fecha com Esc |
| `UserBlock` | Iniciais, nome, papel, vínculo, botão Sair |
| `PageHeader` | `h1`, descrição, ações, slot de contexto (competência) |
| `EnvironmentBanner` | Faixa "Ambiente de testes" fora de produção |
| `SkipLink` | "Pular para o conteúdo" |
| `EmptyState` | Ícone, título, texto, ação (usado em vazio, placeholder, não encontrado) |
| `StatePage` | Tela de estado de acesso (2.7), com tom, ícone, título, texto e ações |
| `ErrorPanel` | Erro recuperável de região ou página, com "Tentar novamente" e "Código de suporte" |
| `Skeleton` | Esqueleto de carregamento (gerado pelo CLI do shadcn; o `desenvolvedor` confirma que não entra dependência npm nova) |

**Autenticação** (`components/auth/`)

| Componente | Responsabilidade |
|---|---|
| `AuthLayout` | Cartão centralizado com marca, usado em login, recuperação, confirmação e definir senha |
| `PasswordField` | Campo de senha com mostrar/ocultar, ajuda e regras |
| `PasswordRules` | Lista de requisitos com estado cumprido/pendente (`aria-live="polite"`) |
| `FormMessage` | Mensagem de topo de formulário padronizada (usa `Alert`) |

**Gerados pelo CLI do shadcn a partir do Base UI já instalado, necessários na FND:** `Sheet`/`Drawer` (menu móvel) e `Skeleton`. O `desenvolvedor` confirma que não entra dependência npm nova (`@base-ui/react` 1.8.0 inclui `dialog` e `drawer`).

**Não necessários na FND:** menu suspenso, seletor, abas, calendário, gráficos, `AlertDialog`, `Textarea`, `Checkbox`, `Tooltip` e todos os componentes de 3.3.

### 3.3 Componentes de padrão para features futuras — [PADRÃO-FUTURO], PROPOSTA (fora da FND)

> Não fazem parte da E5, não têm critério de aceite na FND e não devem ser criados como "componentes de exemplo" sem aprovação do responsável (U-02, 9.4). Ficam registrados para a primeira feature que exibir valores financeiros ou pedir confirmação (provavelmente Apuração / Competências). O caminho antigo `components/finance/*` continua fora do caminho ativo (3.1, "Referência apenas"); os componentes novos, quando existirem, não o reaproveitam.

**Financeiros, somente apresentação** (`components/finance/`; não calculam)

| Componente | Responsabilidade |
|---|---|
| `MoneyValue` | Formata e alinha valor monetário recebido como texto decimal exato ou centavos; reutiliza `formatCurrency` |
| `BalanceValue` | Recebe `amount` e `direction`; mostra selo, sinal e valor (2.10.3) |
| `BalanceBadge` | Selo isolado de direção |
| `BalanceLegend` | Legenda permanente (2.10.4) |
| `SummaryCard` | KPI (2.10.8) |
| `FinancialTable` (composição) | Caption, legenda, rodapé de totais com escopo, estados de carregamento/vazio/erro |
| `CentAdjustMark` | Marca `‡` e nota do centavo de ajuste |
| `StatusBadge` | Selo com ícone e texto; mapeia tom → variante. Estados de competência (aberta, em conferência, apurada, liquidada) e demais estados são definidos pelas features |
| `ConfirmActionDialog` | Diálogo de confirmação em três níveis (5.1) |
| `ReasonField` | Campo de motivo obrigatório (usa `Textarea`) |

**Gerados pelo CLI do shadcn para essas features** (`@base-ui/react` 1.8.0 inclui `alert-dialog`, `field`, `form`, `tooltip`, `checkbox`; o `desenvolvedor` da feature confirma se há nova dependência): `AlertDialog` (confirmações), `Textarea` (motivo), `Checkbox` (checklists de confirmação) e, só se necessário, `Tooltip`. O `Toast` do Base UI **não** é usado para confirmações financeiras (5.2).

### 3.4 Estrutura de dados de navegação (PROPOSTA) [FND]

Cada item: `label`, `href`, `icon`, `section`, `roles[]` (somente para UX), `available` (booleano). Fonte única para barra lateral, painel móvel, placeholders e testes do QA.

---

## 4. Estados

Convenção de texto: título curto (o que aconteceu) + uma frase de contexto + ação. Sem culpar a pessoa, sem jargão, sem stack.

### 4.1 Carregando

- **Navegação entre páginas**: `loading.tsx` do grupo `(app)` com esqueleto **só da área de conteúdo**; o shell permanece. O esqueleto aparece apenas depois de ~300 ms, para evitar piscar em respostas rápidas (PROPOSTA).
- **Tabela** ([PADRÃO-FUTURO]): linhas-esqueleto com o mesmo número de colunas; `aria-busy="true"` na tabela; texto oculto "Carregando dados" em região `role="status"`.
- **Ação em andamento (botão)**: o botão fica desabilitado, troca o texto por verbo no gerúndio ("Entrando…", "Enviando…", "Salvando…", "Liquidando…"), exibe indicador giratório e mantém a largura. Animações respeitam `prefers-reduced-motion` (usar variantes `motion-safe`).
- **Verificação de link** (`/auth/confirm`): "Verificando o link…" com indicador.

### 4.2 Vazio

> Na FND só existe o "Placeholder" (última linha). As demais linhas são [PADRÃO-FUTURO], PROPOSTA.

| Tipo | Quando | Conteúdo |
|---|---|---|
| Primeiro uso | Nunca houve dados | Ícone do módulo, título "Nenhum {item} ainda", uma frase do que acontecerá aqui e, **se o papel pode**, a ação para criar o primeiro. Para papel sem permissão, a ação é omitida e o texto diz quem pode criar ("Peça a um Administrador") |
| Sem resultado de filtro | Filtros ativos sem registros | "Nenhum resultado para os filtros aplicados." + botão "Limpar filtros". Diferente do primeiro uso |
| Competência sem movimento | Competência existe, sem registros | Texto específico por feature |
| Placeholder da FND | Módulo não implementado | 2.8 |

### 4.3 Erro

| Nível | Onde aparece | Apresentação |
|---|---|---|
| Campo | Abaixo do campo, ligado por `aria-describedby`; `aria-invalid="true"` | Texto curto e específico |
| Formulário | Topo do formulário, `Alert` `danger`, `role="alert"` | Mensagem única; se houver vários campos com erro, resumo com links para os campos |
| Região (tabela ou cartão) | Dentro do cartão, no lugar do conteúdo | `ErrorPanel` com "Não foi possível carregar {item}." e "Tentar novamente" |
| Página | `error.tsx` do grupo `(app)`, **dentro do shell** | Título "Algo deu errado", texto "Não foi possível exibir esta página. Tente novamente.", botão "Tentar novamente" (`retry`), link "Voltar ao Dashboard" |
| Global | `global-error.tsx` (sem shell) | Mesma mensagem em página mínima com a marca |
| URL inexistente | `app/not-found.tsx` raiz (sem shell) | Ver 4.8, caso (b) |

- Para erros inesperados, mostrar **"Código de suporte: {identificador}"** (o `digest` do erro de renderização do Next, ou o `correlation_id` do plano, seção 9 e CA-13), em fonte monoespaçada e selecionável, para a pessoa informar ao Administrador. Nunca mostrar mensagem técnica, stack, SQLSTATE ou nome de tabela. Erros esperados chegam em português do Brasil (CA-13).
- O Next 16.4 entrega `retry` e `reset` ao `error.tsx`; preferir `retry` (re-busca e re-renderiza). A documentação consultada está em `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`.
- Em erro de envio de formulário, **os valores digitados são preservados** (exceto senhas).

### 4.4 Sucesso

- Confirmações de definição de senha [FND] e de ação financeira [PADRÃO-FUTURO]: **persistentes na tela** (estado de sucesso na página, `Alert` `success` com `role="status"`, ou selo atualizado com data e usuário), nunca apenas toast que desaparece.
- Confirmações leves (por exemplo, "Verificamos novamente"): texto de status inline por alguns segundos, sem fechar sozinho antes de ~6 s e com opção de dispensar.
- O foco após o sucesso vai ao título da página ou à mensagem (5.2).

### 4.5 Pendência

Pendência significa "há algo esperando uma pessoa", não erro. Na FND só se aplica o último item (estados de acesso); os dois primeiros são [PADRÃO-FUTURO], PROPOSTA.

- Selo `warning` com ícone de relógio/ampulheta e texto ("Pendente de revisão", "Aguardando conferência"); contagem no menu e no cabeçalho do módulo quando existir a feature (por exemplo, "Pendências de reconhecimento (4)").
- Comprovante com baixa confiança de reconhecimento: selo `warning` com texto **"Revisão necessária"** e a lista dos campos duvidosos; o botão de confirmar só habilita depois que a pessoa revisar (padrão para a feature de importação; regra de confiança é do Brain 08 e das features).
- Usuário Sócio sem escopo (2.7.3) e conta sem perfil (2.7.1) são pendências de configuração, apresentadas com tom `info`/`warning`, não `danger`.

### 4.6 Link inválido ou expirado (auth)

- Ícone `circle-alert`, tom `danger`. Título "Link inválido ou expirado". Texto "Este link já foi usado ou venceu. Peça um novo para continuar." Ações: "Solicitar novo link" (→ `/recuperar-senha`) e "Voltar para o login".
- Em convite expirado, acrescentar: "Se você foi convidado e o link não funciona mais, peça um novo convite a um Administrador."

### 4.7 Bloqueio

> Na FND só vale "Por papel" (que leva a 2.7.4) e o limite de tentativas do login/recuperação. As demais linhas são [PADRÃO-FUTURO], PROPOSTA, para as features.

| Tipo | Quando | Apresentação |
|---|---|---|
| Por papel | A ação nunca será possível para o papel | **Ocultar** o controle. Se a pessoa chegar à área, 2.7.4 |
| Por condição | O papel pode, mas o estado atual não permite | Mostrar o botão **desabilitado com `focusableWhenDisabled`** e o motivo em texto visível ao lado ou abaixo ("Disponível depois da apuração") ligado por `aria-describedby`. Não depender de tooltip |
| Registro imutável | Competência liquidada (RN-014, Brain 09) | Faixa permanente no topo do conteúdo: ícone `lock`, "Competência liquidada — somente leitura. Correções exigem reabertura por um Administrador, com motivo registrado." Controles de edição omitidos; para o Administrador, a ação "Reabrir competência" visível (5.1) |
| Inconsistência | Soma dos saldos ≠ 0 (2.10.6), **somente para a liquidação** (Brain 09, "Para liquidar", item 4) | `Alert` `danger` + ação de **liquidar** bloqueada com o motivo. O efeito sobre a apuração é DECISÃO PENDENTE da feature Apuração |
| Conflito | O estado mudou desde que a tela foi aberta | Dentro do diálogo/ação: `Alert` `warning` "Esta {competência} foi alterada por outra pessoa enquanto você revisava. Recarregue os dados antes de continuar." e botão "Recarregar dados" |

### 4.8 Não encontrado

Dois casos distintos, com mecanismos diferentes no Next 16.4 instalado. Fonte: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md` ("the root `app/not-found.js` and `app/global-not-found.js` files handle any unmatched URLs for your whole application"; `not-found.js` de um segmento "renders UI when the `notFound` function is thrown within a route segment").

| Caso | Quando | Arquivo | Moldura | Texto e ação |
|---|---|---|---|---|
| (a) Registro ou segmento inexistente dentro de `(app)` | A página chama `notFound()` (registro que não existe, ou que o RLS esconde da pessoa) | `app/(app)/not-found.tsx` | **Dentro do shell** (a pessoa já passou pela guarda de sessão e perfil de `(app)`) | Ícone `file-search`, título "Registro não encontrado", texto "O registro não existe ou o conteúdo não está disponível para você." (cobre também o RLS, sem revelar existência). Ação: "Voltar ao Dashboard" |
| (b) URL que não corresponde a nenhuma rota, **com sessão** | Endereço digitado errado, link antigo | `app/not-found.tsx` (raiz) | **Sem shell**: renderizado dentro do layout raiz, não do layout de `(app)`, e sem lógica de sessão própria. Mostra a marca "Financeiro Ultra" em página mínima, como o `global-error.tsx` | Ícone `file-search`, título "Página não encontrada", texto "O endereço não existe ou foi removido." Ação: "Ir para o início" (leva a `/`). Não consulta dados nem mostra nome ou papel do usuário |

- O arquivo raiz `app/not-found.tsx` não deve depender de sessão, perfil nem do shell; o layout raiz segue sem lógica de sessão. `global-not-found.js` é experimental e dispensado: há um único layout raiz.
- **Sem sessão, a 404 de URL não aparece (decisão desta revisão; saída 1 da revisão independente).** O proxy da aplicação (`src/proxy.ts` e `src/lib/supabase/proxy.ts`, mantido pelo plano, seção 6: "o proxy renova cookies, checagem otimista") roda em todas as rotas, exceto assets estáticos, e manda ao `/login` todo visitante sem sessão que não esteja na lista de rotas públicas (hoje só `/login`). Portanto, sem sessão, `/rota-que-nao-existe` vai ao login, e o destino pretendido é guardado (J2). Isso é intencional: um visitante anônimo não precisa aprender quais endereços existem, e a spec **não** pede mudança do proxy para a 404 em si.
- **Redirecionamento do proxy como requisito de J2, J6 e 4.9 (observação baixa da rodada 3; conferido em `src/lib/supabase/proxy.ts` e `src/lib/safe-redirect.ts`).** O destino guardado e o aviso de sessão expirada dependem de o redirecionamento do proxy levar essas informações; por isso são **requisito**, não detalhe de implementação: (a) sem sessão, o proxy redireciona ao `/login` com o destino pretendido (`?next=<caminho interno>`) **somente em navegação GET e nunca quando o destino é `/`**; em ação não GET e em `/`, vai ao `/login` sem destino; (b) quando havia credencial de sessão vencida, o redirecionamento leva também o indicador de sessão expirada (`?aviso=sessao-expirada`), que o login traduz no aviso `info` de 2.4 e 4.9; sem credencial prévia (visitante novo), não há aviso; (c) o login **revalida** o destino antes de usá-lo: só aceita caminho interno da própria aplicação, protegido contra redirecionamento aberto (sem esquema, sem host, sem `//`, sem barra invertida, sem caracteres de controle, tamanho limitado), e recusa as rotas de autenticação como destino (evita laço); destino inválido ou ausente cai em `/` (Dashboard). O que a E5 ajusta no proxy continua sendo apenas a lista de rotas públicas (abaixo). Uma lista de rotas públicas não permitiria liberar só as "URLs desconhecidas" sem deixar passar as demais. Depois do login, se o destino guardado não existir, a pessoa vê a 404 do caso (b), com a ação "Ir para o início".
- **Rotas públicas que o proxy precisa conhecer (E5, 9.4 item 5):** pelo mapa de 2.1, `/login`, `/recuperar-senha` e `/auth/confirm` devem ser alcançáveis sem sessão. Hoje o proxy só libera `/login` e, para quem tem sessão, redireciona as rotas públicas para `/`. A E5 ajusta a lista (o comportamento do destino e do aviso acima é requisito, já presente no proxy da E5); `/definir-senha` **não** é pública (exige a sessão criada por `/auth/confirm`).
- Uma rota inexistente **não** aparece dentro do shell, porque `app/(app)/not-found.tsx` só captura `notFound()` lançado em `(app)`.
- O "Registro que o RLS esconde" de 2.7.4 usa o caso (a).

### 4.9 Sessão expirada

Redireciona ao login com o aviso `info` de 2.4, mostrado quando o redirecionamento do proxy traz o indicador de sessão expirada (4.8), e depois do login retorna ao destino pretendido, desde que seja um caminho interno validado (4.8, item (c)); caso contrário, vai ao Dashboard. Nunca exibe estado de sucesso de ação que não foi confirmada pelo servidor.

### 4.10 Resumo dos estados por tela da FND

| Tela | Normal | Carregando | Vazio | Erro | Sucesso | Pendência | Bloqueio |
|---|---|---|---|---|---|---|---|
| Login | formulário | botão "Entrando…" | — | credenciais, limite, rede | entra (sem perfil ativo: vai a 2.7.1) | — | limite de tentativas |
| Recuperar senha | formulário | botão "Enviando…" | — | limite, rede | "Verifique seu e-mail" | — | cooldown de reenvio |
| Aceitar convite | botão aceitar | "Verificando…" | — | link inválido/expirado | segue para definir senha | — | — |
| Definir senha | formulário | botão "Salvando…" | — | regras, senhas diferentes, sessão ausente | "Senha definida" | — | — |
| Acesso (2.7) | estado informativo | verificação em andamento | — | falha ao verificar | acesso liberado → entra | sem perfil ativo (2.7.1) / Sócio sem escopo (2.7.3) | sem permissão (2.7.4) |
| Dashboard / módulos | placeholder | esqueleto | placeholder | `ErrorPanel` / `error.tsx` | — | — | sem permissão |
| Não encontrado | registro: no shell (4.8a); URL com sessão: página mínima com a marca (4.8b); URL sem sessão: vai ao login (proxy) | — | — | — | — | — | — |

---

## 5. Interações

### 5.1 Padrão de confirmação para ações irreversíveis ou sensíveis — [PADRÃO-FUTURO], PROPOSTA

> A FND não tem ação financeira: "Sair" (nível 1) e os formulários de auth são as únicas interações. O diálogo de 3 níveis, o `ConfirmActionDialog` e o `ReasonField` não são implementados pela E5 nem verificados nos critérios da FND (0.6, 8.B). Os exemplos citam o Brain (04, 09, 10) apenas para orientar as features; a classificação final de cada ação é delas.

**5.1.1 Três níveis de fricção (PROPOSTA)**

| Nível | Tipo de ação | Exemplos (Brain 04, 09, 10) | Confirmação |
|---|---|---|---|
| 1 | Reversível, sem efeito financeiro durável | Filtrar, abrir detalhe, "Sair" | Nenhuma. Feedback imediato |
| 2 | Altera dado financeiro, auditada, corrigível por novo ato | Confirmar um recebimento a partir de comprovante, apurar competência (a nova apuração substitui a anterior com histórico — Brain 09), marcar compensação como paga | Diálogo com resumo do impacto e botão com verbo específico |
| 3 | Alto impacto: trava dados, desfaz trava ou apaga logicamente | Liquidar competência (RN-014), reabrir competência (Brain 09, somente Administrador, com motivo), excluir/cancelar recebimento (auditoria obrigatória — Brain 10) | Diálogo com resumo do impacto, checagem de pré-condições, **confirmação deliberada** (digitar o identificador) e, quando o Brain exigir, **motivo obrigatório** |

A classificação final de cada ação é revisada na feature correspondente; esta tabela fixa o padrão e os exemplos. Dados financeiros não são excluídos fisicamente (plano, 7.1): "excluir" é uma inativação/cancelamento lógico e o vocabulário final é da feature.

**5.1.2 Anatomia do diálogo (`ConfirmActionDialog`)**

1. **Título** com o verbo e o objeto: "Liquidar competência 10/2026?".
2. **Resumo do impacto** em lista curta e em números, vindos do servidor: competência, quantidade de recebimentos, total recebido, total devido, soma dos saldos, compensações pagas/justificadas. Os valores seguem o padrão de 2.10.
3. **Consequência em linguagem simples**, por exemplo: "Depois de liquidar, os recebimentos desta competência não poderão ser alterados diretamente. Para corrigir, será preciso reabri-la (somente Administrador, com motivo registrado)."
4. **Pré-condições** (nível 3) como checklist de leitura (ícone + texto, atendido/não atendido). Se alguma não for atendida, o botão de confirmar fica bloqueado com o motivo escrito (4.7) e o diálogo oferece o caminho para resolver.
5. **Confirmação deliberada** (nível 3): campo "Digite 10/2026 para confirmar", com o identificador exato da competência. A comparação não diferencia espaços nas pontas. Para reabertura, somam-se o campo **Motivo** (obrigatório, com contador; mínimo de caracteres definido na feature — P-21) e a nota de que usuário, data/hora, motivo, estado anterior e impacto serão registrados (Brain 09).
6. **Rodapé**: "Cancelar" (à esquerda ou como primeiro foco) e o botão de confirmação à direita, com **rótulo específico** ("Liquidar competência"), nunca "OK" ou "Sim".
7. **Estilo do botão**: `destructive` somente para ação que apaga/cancela; liquidar, apurar e reabrir usam o botão primário, pois não são destruição. Vermelho não vira decoração.

**5.1.3 Comportamento**

- Foco inicial: no **Cancelar** (níveis 2 e 3), para que Enter acidental não confirme. No nível 3, a ordem de tabulação percorre resumo, campos e termina no botão de confirmar.
- Esc e clique no fundo cancelam, **exceto** enquanto a ação está em andamento. Foco preso dentro do diálogo; ao fechar, o foco volta ao elemento que o abriu (ou ao título, se esse elemento deixou de existir).
- O botão de confirmar só habilita quando as condições são atendidas (campo digitado igual, motivo preenchido, checklist ok). Ao acionar, fica desabilitado com "Liquidando…" até a resposta, impedindo duplo envio (a idempotência no servidor é pedido ao `desenvolvedor`, 9.4).
- Erro do servidor: o diálogo permanece aberto, com `Alert` `danger` no topo (mensagem esperada em português; erro inesperado com código de suporte) e os dados digitados preservados. Conflito: ver 4.7.
- Sucesso: fecha o diálogo e atualiza a página com resultado **persistente** — selo "Liquidada", data/hora, usuário e, se houver, link para o histórico/auditoria. O foco vai ao título da página; uma região `role="status"` anuncia o resultado.
- Em telas pequenas o diálogo ocupa a largura útil, com rodapé de ações fixo e conteúdo rolável.

**5.1.4 O que a confirmação não é**

Não substitui permissão (o servidor valida), não substitui auditoria (o banco registra) e não calcula nada. A tela só exibe o que o servidor devolve.

**5.1.5 Sessão e estado desatualizado**

Se a sessão expirar com o diálogo aberto, a resposta do servidor leva ao login com aviso; a ação **não** é tratada como concluída. Se o estado do registro mudou, vale o tratamento de conflito (4.7).

### 5.2 Feedback e foco

| Situação | Feedback | Foco | Anúncio |
|---|---|---|---|
| Erro de formulário | `Alert` no topo + erros por campo | Permanece no campo; com vários erros, no resumo | `role="alert"` |
| Sucesso de formulário que muda de tela | Estado de sucesso na própria página | Título do novo estado | `role="status"` |
| Ação financeira concluída ([PADRÃO-FUTURO]) | Selo/aviso persistente | Título da página | `role="status"` |
| Mudança de página | Título da página atualizado (`<title>` e `h1`) | Padrão do Next para navegação | Anúncio de rota |
| Carregando | Esqueleto / botão em andamento | Sem mover | `aria-busy`; `role="status"` oculto |

### 5.3 Formulários

- Rótulo sempre visível acima do campo (não só placeholder); ajuda em texto pequeno abaixo; erro abaixo da ajuda, em tom `danger` com ícone.
- Validação ao enviar e ao sair do campo apenas depois do primeiro envio; nunca bloquear a digitação.
- Botão primário único por formulário; ação secundária em `outline`/`link`. Enter envia.
- Perda de dados: ao abandonar formulário longo alterado (features futuras), aviso de alterações não salvas.
- Campos monetários ([PADRÃO-FUTURO], PROPOSTA; a FND não tem campo monetário): entrada em reais com vírgula decimal, máscara aceita colar "1.234,56"; o valor é convertido pelo servidor/domínio para centavos exatos, sem float. A UI mostra o valor interpretado ("R$ 1.234,56") para conferência antes de confirmar.

### 5.4 Teclado

- Ordem de tabulação segue a ordem visual; atalho de pular para o conteúdo é o primeiro item focável.
- Menu lateral: setas não são necessárias (lista de links); Tab percorre os itens. Painel móvel: Esc fecha, foco volta ao botão de menu.
- Tabela ([PADRÃO-FUTURO]): cabeçalhos ordenáveis e links de linha são focáveis; sem armadilha de foco.
- Diálogos ([PADRÃO-FUTURO]; na FND só o painel do menu móvel): Tab/Shift+Tab circulam; Esc cancela (5.1.3).
- Sem atalhos de teclado globais na FND.

---

## 6. Responsividade

Pontos de quebra do Tailwind: mobile < 768 px (`md`), tablet 768 a 1023 px, desktop ≥ 1024 px (`lg`).

Na FND valem as linhas de navegação, cabeçalho de página, cartões de auth, alvos de toque e aviso de ambiente. As linhas de **tabelas financeiras, cartões KPI e diálogos**, e as regras de tabela abaixo, são [PADRÃO-FUTURO], PROPOSTA (0.6, 8.B).

| Elemento | Mobile (< 768) | Tablet (768–1023) | Desktop (≥ 1024) |
|---|---|---|---|
| Navegação | Barra superior + painel lateral | Barra superior + painel lateral | Barra lateral fixa de 256 px |
| Cabeçalho de página | Ação primária em largura total abaixo do título | Título e ação na mesma linha | Título à esquerda, ações à direita |
| Cartões de auth | Largura útil com margem de 16 px, alinhados ao topo (não ao centro) quando o teclado virtual abre | Centralizado, 384 px | Centralizado, 384 px |
| Alvos de toque | Botões e campos de 44 px | 40 a 44 px | 32 a 36 px (padrão do tema) |
| Tabelas financeiras | **Lista de cartões**: um cartão por linha, com identificação no topo e lista de definição (Recebido / Devido / Saldo etc.), selo de direção junto do saldo; rodapé de totais como cartão final | Tabela com rolagem horizontal, primeira coluna fixa à esquerda, sombra lateral indicando continuação | Tabela completa |
| Cartões KPI | Uma coluna, na ordem Recebido, Devido, Saldo | Duas ou três colunas | Três colunas |
| Diálogos | Largura útil, rodapé de ações fixo, conteúdo rolável | `max-w-lg` centralizado | `max-w-lg` centralizado |
| Aviso de ambiente | Abaixo da barra superior | Idem | Topo do conteúdo |

Regras:

- Em mobile, a rolagem horizontal **não** é a solução única para tabela financeira. Para tabelas com mais de quatro colunas, usar lista de cartões; a ordem Recebido, Devido, Saldo e o selo de direção são preservados, assim como a legenda do Saldo.
- Tabelas de poucas colunas (até quatro) podem permanecer como tabela com `overflow-x-auto`, sem esconder colunas de dinheiro.
- Nenhuma informação financeira é ocultada por ser "pequena demais": se não couber, reorganiza.
- Zoom de 200% e fonte maior do sistema não podem quebrar o layout nem ocultar controles (UX-45).
- Nada depende de hover (sem informação essencial em tooltip).
- Campo de e-mail e senha dispara os teclados corretos (`type="email"`, `inputMode`); texto de campo mínimo de 16 px em mobile para evitar zoom automático no iOS (o `Input` atual já usa `text-base` abaixo de `md`).

---

## 7. Acessibilidade

Meta: **WCAG 2.2 nível AA** (PROPOSTA), validada manualmente com teclado e leitor de tela e, quando possível, por varredura automática.

### 7.1 Estrutura e semântica

- Marcos: `<header>` (barra superior), `<nav aria-label="Principal">`, `<main id="conteudo">`. Um `h1` por página, hierarquia sem saltos.
- Link "Pular para o conteúdo" como primeiro item focável, visível ao receber foco.
- `<html lang="pt-BR">` (já existe). `<title>` único por rota (`{Página} · Financeiro Ultra`).
- Item ativo do menu: `aria-current="page"`. Seções do menu com cabeçalho semântico ou `aria-labelledby`.
- Tabela ([PADRÃO-FUTURO]): `<table>` real, `<caption>`, `<th scope="col">` e, na primeira coluna, `<th scope="row">` quando for identificador. Colunas ordenáveis: botão dentro do `th` e `aria-sort`. Sem `role="presentation"` em tabelas de dados e sem div-tabela.
- Estados e selos: texto sempre presente; ícones decorativos `aria-hidden="true"`. Ícone que carrega significado ganha texto equivalente.
- Mensagens dinâmicas: `role="alert"` apenas para erros e avisos que exigem atenção imediata; `role="status"` para sucesso e informação.

### 7.2 Cor e contraste

- Texto normal ≥ 4,5:1; texto grande (≥ 24 px, ou ≥ 18,66 px em negrito) ≥ 3:1; componentes de interface e indicadores de foco ≥ 3:1.
- Pontos de atenção do tema atual (0.5): `muted-foreground` sobre `muted` e anel de foco. Os tons novos têm de ser medidos antes de entrar.
- **Saldo, direção e estado nunca só por cor**: texto + ícone + sinal (2.10.3). Verificar em escala de cinza.
- Tons escolhidos (âmbar × azul para o saldo) permanecem distinguíveis em simulação de protanopia e deuteranopia.

### 7.3 Foco e teclado

- Todo controle interativo é alcançável e operável por teclado; foco visível em todos (anel com contraste ≥ 3:1).
- Sem armadilhas de foco; diálogos e painel móvel prendem o foco apenas enquanto abertos e devolvem o foco ao fechar.
- Alvos de toque/clique ≥ 24 × 24 px (WCAG 2.2, 2.5.8) em qualquer lugar; ≥ 44 px recomendados para ações primárias em mobile.
- Nenhuma ação exige gesto complexo (arrastar) ou movimento.

### 7.4 Formulários

- Todo campo tem `<label>` associado; ajuda e erro ligados por `aria-describedby`; `aria-invalid` apenas em campo realmente inválido.
- `autocomplete` correto: `username`, `current-password`, `new-password`, `email`. Colar permitido em senha.
- Mostrar/ocultar senha: botão com nome acessível e `aria-pressed`.
- Mensagem de erro identifica o campo e diz como corrigir. Erro não depende de cor (ícone + texto).
- Autenticação acessível (WCAG 3.3.8): sem teste cognitivo, sem exigir memorizar ou transcrever; permitir gerenciador de senhas. Se a P-14 (MFA) for aprovada, o código TOTP deve poder ser colado e aceitar `autocomplete="one-time-code"`.

### 7.5 Movimento e tempo

- Animações respeitam `prefers-reduced-motion`; nada pisca. O esqueleto usa pulso suave apenas em `motion-safe`.
- Sem temporizadores que expirem sem aviso na interface. Cooldown de reenvio é informado em texto.

### 7.6 Valores monetários para leitores de tela — [PADRÃO-FUTURO], PROPOSTA

- O valor é lido como texto único e completo ("R$ 2.000,00"); glifos de sinal e setas são `aria-hidden`, e o texto "mais"/"menos" e "deve transferir"/"deve receber" é lido pelo selo e por texto auxiliar.
- Célula de compensação com frase completa (2.10.7).
- Totais com rótulo de escopo na própria célula, lido junto ("Total da competência, R$ 6.000,00").

---

## 8. Critérios UI/UX para o QA

Cada item é verificável por inspeção, teste manual guiado ou teste automatizado (Playwright / axe). Tipo: **M** manual, **A** automatizável. A seção tem duas partes com status diferentes:

- **8.A, critérios da FND** (UX-01 a UX-22, UX-34, UX-42, UX-45 a UX-53): o QA os executa na E10. Cobrem o CA-14 do plano e subsidiam CA-08, CA-06 e CA-16.
- **8.B, critérios do padrão para features futuras** (UX-23 a UX-33, UX-35 a UX-41, UX-43, UX-44, UX-54): **PROPOSTA**. Não fazem parte da verificação da FND nem de nenhum CA da FND, porque a FND não implementa tabela financeira, valores financeiros nem diálogo de confirmação (0.6). Servem de checklist para a primeira feature que os implementar. Só entram na FND se o responsável aprovar a ampliação de escopo (U-02, 9.4).

## 8.A Critérios da FND

### Identidade e vocabulário

| ID | Critério | Tipo |
|---|---|---|
| UX-01 | O nome **Financeiro Ultra** aparece no shell, no login, nas telas de auth e no `<title>` (formato `{Página} · Financeiro Ultra`). "Ultra Contabilidade" não aparece em nenhuma tela | A |
| UX-02 | Nenhuma tela exibe "Parte(s)", "Indicador(es)", "Empresa(s)", "percentual padrão", "divisão personalizada" ou nomes técnicos de papel (`ADMIN_FINANCEIRO`). O menu mostra "Sócios", não "Partes" | A (busca de texto) + M |
| UX-03 | Não existe campo editável de percentual nem item de menu "Regras de divisão" | M |
| UX-04 | O shell mostra os módulos do Brain 05 com os rótulos da seção 2.3, na ordem e nos grupos especificados, e o papel Administrador vê todos | A |
| UX-05 | Em ambiente diferente de produção aparece o aviso "Ambiente de testes"; em produção, não | A |

### Autenticação

| ID | Critério | Tipo |
|---|---|---|
| UX-06 | O login não tem link de cadastro; tem "Esqueci minha senha" e o texto de que o acesso é por convite | A |
| UX-07 | Credenciais inválidas mostram sempre a mesma mensagem, em `role="alert"`, mantendo o e-mail e limpando a senha | A |
| UX-08 | Credenciais válidas sem perfil ativo (sem perfil, `role` nulo ou inativo) **mantêm a sessão** e levam à tela 2.7.1 (regra única de acesso, J1), sem mensagem de erro no login e sem o texto "Procure o financeiro". O mesmo resultado ocorre após o aceite de convite e na navegação interna | A |
| UX-09 | Papel Sócio ativo consegue entrar e vê o estado 2.7.3, sem menu de módulos e sem nenhum dado de negócio | A |
| UX-10 | Recuperação: a resposta é idêntica para e-mail existente e inexistente; reenvio respeita o cooldown e o texto informa o tempo | A |
| UX-11 | `/definir-senha` sem sessão mostra a tela de sessão expirada com "Solicitar novo link"; com sessão, mostra o modo correto (convite ou recuperação) | A |
| UX-12 | A regra de senha é exibida antes do erro; senhas diferentes e senha fora da regra mostram mensagem por campo; sucesso exibe "Senha definida" com foco no título | A |
| UX-13 | Link inválido ou expirado mostra 4.6 com as duas ações | A |
| UX-14 | Os campos têm `autocomplete` corretos (`username`, `current-password`, `new-password`) e aceitam colar | A |
| UX-15 | Mostrar/ocultar senha tem nome acessível e `aria-pressed` | A |

### Estados

| ID | Critério | Tipo |
|---|---|---|
| UX-16 | Cada estado de 2.7 (2.7.1 sem perfil ativo, 2.7.3 Sócio sem escopo, 2.7.4 sem permissão) aparece conforme o texto e as ações especificadas, no shell mínimo ou completo indicado. O estado 2.7.2 (Sócio sem vínculo) **só entra** neste critério se o G1 retirar a constraint `PARTNER exige partner_id` (2.7.2); com a constraint, "sem vínculo" é `role` nulo e está coberto por 2.7.1 | M |
| UX-17 | "Verificar novamente" (em 2.7.1) recarrega o perfil sem novo login: ao receber perfil ativo, a pessoa entra no sistema. Vale para qualquer porta de entrada (login, convite, navegação) | M |
| UX-18 | Os estados de acesso não exibem nomes de sócios nem dados de negócio | M |
| UX-19 | Cada módulo do menu abre a página-placeholder com `h1` do módulo; o selo "Em breve" aparece no menu | A |
| UX-20 | Existe `loading.tsx` e `error.tsx` (dentro do shell, grupo `(app)`), `global-error.tsx` (sem shell), `app/not-found.tsx` raiz (sem shell) e `app/(app)/not-found.tsx` (no shell); o erro inesperado mostra código de suporte e nunca stack, SQLSTATE ou nome de tabela | M |
| UX-21 | (a) Em URL que não corresponde a nenhuma rota (por exemplo `/rota-que-nao-existe`), **com sessão**, aparece "Página não encontrada" **sem shell** e sem nome ou papel do usuário, com ação "Ir para o início". **Sem sessão**, a mesma URL leva ao `/login` (o proxy redireciona antes de qualquer rota; 4.8), e isso **não** reprova o critério. (b) Quando uma página de `(app)` chama `notFound()` (registro inexistente ou oculto pelo RLS), aparece "Registro não encontrado" **dentro do shell**, sem revelar a existência (4.8). A FND não tem página de registro: o item (b) é verificado por teste do próprio arquivo/rota de teste do `desenvolvedor` e passa a ser verificado de fato na primeira feature com registros | M |
| UX-22 | O esqueleto não aparece em respostas rápidas (< 300 ms) e, quando aparece, mantém o shell estável (sem salto de layout) | M |

### Responsividade e acessibilidade (shell e telas da FND)

| ID | Critério | Tipo |
|---|---|---|
| UX-42 | Em 375, 768 e 1280 px de largura: menu lateral fixo só ≥ 1024 px; abaixo, barra superior com painel; sem rolagem horizontal da página inteira | A |
| UX-45 | Com zoom de 200% e fonte do sistema ampliada, nenhum controle some nem se sobrepõe | M |
| UX-46 | Toda a jornada J1 a J6 é completável só com teclado, com foco sempre visível e ordem lógica | M |
| UX-47 | Existe "Pular para o conteúdo"; marcos `header`, `nav`, `main`; um `h1` por página; `aria-current` no item ativo | A |
| UX-48 | Varredura axe nas telas de auth, nos estados de 2.7 e no shell sem violações críticas ou sérias | A |
| UX-49 | Leitor de tela (NVDA ou VoiceOver) anuncia: erro de formulário, sucesso de definição de senha e mudança de estado (2.7) | M |
| UX-50 | Com `prefers-reduced-motion`, nenhuma animação de pulso ou giro permanece | M |
| UX-51 | Alvos interativos ≥ 24 × 24 px em todas as telas; primários ≥ 44 px em mobile | A |
| UX-52 | Nenhuma informação essencial depende de hover ou tooltip | M |
| UX-34 | Contraste medido dos tokens e tons **usados nas telas da FND**: texto normal ≥ 4,5:1, texto grande e componentes ≥ 3:1, incluindo os tons `info`/`success`/`warning`/`danger` dos avisos e estados, o selo "Em breve", `muted-foreground` sobre `muted` e o anel de foco. (O contraste do âmbar e do azul no Saldo é medido na feature que o implementar, UX-26 e UX-27.) | A + M |
| UX-53 | Nenhuma tela, texto ou componente do **caminho ativo** da aplicação exibe Recebido, Devido, Saldo, percentual, "Indicador", "Empresa" ou o saldo com o sinal antigo (`direito − recebido`); `components/finance/*` e a tela antiga estão fora do caminho ativo (CA-16; 3.1) | M (revisão de código) + A (busca de texto) |

## 8.B Critérios do padrão para features futuras — [PADRÃO-FUTURO], PROPOSTA

> Não fazem parte da verificação da FND nem de nenhum CA da FND (0.6). São o checklist de aceite da primeira feature que implementar tabela financeira, Recebido / Devido / Saldo ou confirmação. Só entram na FND com aprovação do responsável (U-02, 9.4). Lembrete: o CA-16 da FND é atendido por UX-02, UX-03 e UX-53, não por estes critérios.

### Valores financeiros

| ID | Critério | Tipo |
|---|---|---|
| UX-23 | Valores em `R$ 1.234,56`, alinhados à direita, com algarismos tabulares: as vírgulas decimais ficam alinhadas em coluna | A (captura) + M |
| UX-24 | Colunas de dinheiro estão sempre na ordem Recebido, Devido, Saldo, adjacentes, com esses nomes exatos. Nenhuma coluna usa "Valor" ou "Total" genérico no lugar de um dos três | A |
| UX-25 | Saldo positivo exibe o selo "Deve transferir", ícone de saída e sinal "+"; saldo negativo exibe "Deve receber", ícone de entrada e sinal "−" (U+2212); saldo zero exibe "Conciliado" sem sinal | A |
| UX-26 | Em escala de cinza, a leitura de cada linha de saldo continua sem ambiguidade (texto, ícone e sinal presentes) | M |
| UX-27 | Saldo não usa vermelho nem verde; o vermelho só aparece em erro e ação destrutiva | M |
| UX-28 | A legenda "Saldo = Recebido − Devido…" é visível (texto permanente) em toda tela com Saldo, inclusive em mobile | A |
| UX-29 | Valor ainda não calculado aparece como `—` com "Não apurado"; `R$ 0,00` só aparece para zero calculado | M |
| UX-30 | O rodapé da tabela informa o escopo do total e mostra "Soma dos saldos" com o fechamento (conforme o resultado devolvido pelo domínio); **não existe** estado de "diferença de arredondamento controlada" enquanto o domínio/modelagem não o definirem; qualquer soma ≠ 0 mostra a inconsistência de 2.10.6 e bloqueia **somente a liquidação** (Brain 09) | M |
| UX-31 | Verificar se a Geist Sans instalada aplica algarismos tabulares; se não, as colunas numéricas usam fonte monoespaçada | M |
| UX-32 | A divisão é exibida como fração (1/n) com percentual marcado como aproximado quando for dízima; nenhuma tela soma percentuais arredondados | M |
| UX-33 | Em exemplo com 3 sócios iguais e R$ 1.000,00, as parcelas mostradas são R$ 333,34 + R$ 333,33 + R$ 333,33, a marca `‡` e a nota do centavo de ajuste (que fala de parcelas, não da soma dos saldos) aparecem, e a soma exibida é R$ 1.000,00 | M |
| UX-35 | A UI não calcula: nenhum componente financeiro de `components/finance/` (3.3) soma, subtrai, divide ou deriva sinal de saldo (revisão de código na feature que os criar) | M |
| UX-54 | Leitor de tela (NVDA ou VoiceOver) anuncia o saldo na forma "Deve transferir, mais R$ 2.000,00" (2.10.3 e 7.6) | M |

### Confirmação

| ID | Critério | Tipo |
|---|---|---|
| UX-36 | O diálogo de confirmação do nível 3 tem título com verbo e objeto, resumo do impacto, consequência em texto, checklist de pré-condições, campo de confirmação digitada e botão com rótulo específico (nunca "OK") | M |
| UX-37 | O foco inicial do diálogo está no "Cancelar"; Esc e clique no fundo cancelam; durante o processamento, não cancelam e o botão fica desabilitado (sem duplo envio) | A |
| UX-38 | O botão de confirmar só habilita com identificador digitado igual, motivo preenchido (quando exigido) e pré-condições atendidas; o motivo do bloqueio é lido por leitor de tela | A |
| UX-39 | Em falha, o diálogo permanece aberto com a mensagem e os dados preservados; em sucesso, o resultado é persistente na página (selo, data, usuário) e o foco vai ao título | M |
| UX-40 | O botão `destructive` só é usado para ação que apaga ou cancela | M |
| UX-41 | Sessão expirada ou estado alterado durante a confirmação não exibe sucesso; leva ao login ou mostra o conflito de 4.7 | M |

### Responsividade de tabelas

| ID | Critério | Tipo |
|---|---|---|
| UX-43 | Em < 768 px, tabelas financeiras com mais de quatro colunas viram lista de cartões, mantendo a ordem Recebido, Devido, Saldo, o selo de direção e a legenda | M |
| UX-44 | Em 768–1023 px, tabelas largas rolam na horizontal com a primeira coluna fixa | M |

Mapa para o plano (FND): CA-14 → UX-01 a UX-05, UX-16 a UX-22, UX-34, UX-42, UX-45 a UX-52; CA-08 (parte de UI) → UX-06 a UX-15; CA-06 (parte de UI) → UX-09, UX-16, UX-18; CA-16 → UX-02, UX-03, UX-53. Os critérios UX-23 a UX-33, UX-35 a UX-41, UX-43, UX-44 e UX-54 **não estão ligados a nenhum CA da FND**.

---

## 9. Divergências, pendências e handoffs

### 9.1 Divergências encontradas no Brain (reportadas, não corrigidas — o Brain não é editado por este agente)

Estado: D-1 a D-5 **anotadas no Brain** (notas de 22/10/2026 em 00, 01, 05 e 10); D-6, D-7 e D-8 **abertas**.

| # | Onde | Divergência | Efeito nesta spec |
|---|---|---|---|
| D-1 | `05-Modulos.md`, Configurações | Lista "Partes" e "Regras de divisão" como submódulos. RAT-D017 troca Parte por Sócio, e RAT-D015 elimina regras de divisão configuráveis | Menu usa "Sócios" e **não** tem "Regras de divisão" |
| D-2 | `05-Modulos.md`, Recebimentos | Coluna "partes" e módulo Clientes com "definição das partes participantes" | Na interface: "Sócios" e "sócios participantes" |
| D-3 | `05-Modulos.md` | Não lista módulo para Recebedores, mas 02-Dominio e RAT-D002 tratam o recebedor como entidade própria | Posição reservada em Configurações, sem nome (U-01, que depende da P-08) |
| D-4 | `10-Seguranca-e-Auditoria.md` | Administrador "altera percentuais" e "configura partes"; "acesso por organização" | Sem tela de percentuais; vocabulário Sócio; RAT-D010 (empresa única) |
| D-5 | `01-Visao-Geral.md` e `00-MOC.md` | Falam em "percentuais parametrizados" e "divisão parametrizada" | A UI não parametriza divisão (RAT-D015) |
| D-6 | Brain (nenhum documento) | "Valor esperado por competência" não existe no Brain (a tela antiga mostra "Valor esperado") | Não reaproveitado; o plano já o marca como extra |
| D-7 | `03-Regras-de-Negocio.md`, RN-011 × `02-modelagem-dados.md` (D-13, 9.4) | A RN-011 admite "diferenças controladas de arredondamento" na soma dos saldos; a modelagem proposta garante soma exatamente zero (Σ alocações = Σ recebimentos) | A UI **não desenha** estado de "diferença controlada" na soma dos saldos (2.10.6); qualquer soma ≠ 0 é inconsistência. A decisão é da feature Apuração; reportado, não resolvido aqui |
| D-8 | `10-Seguranca-e-Auditoria.md` e `11-Decisoes.md` (RAT-D011) × plano, seção 6 | O Brain oficializa três perfis e o login próprio dos sócios; o **papel "Sócio"** e a regra de **negar por padrão** são PROPOSTA do plano, sem respaldo no Brain 10 | Esta spec os trata como PROPOSTA do plano aprovado (0.2, 2.7.3); RAT-D011 vale só para o login próprio dos sócios |

### 9.2 Divergências com o plano (`01-plano.md`)

| # | Item | Observação |
|---|---|---|
| P-1 | Seção 3 (diretórios) | O esboço tem `(public)/login` e `(app)`; esta spec acrescenta `/recuperar-senha` em `(public)` e um grupo `(auth-flow)` para `/auth/confirm` e `/definir-senha` fora do shell com módulos (2.1). Não contradiz a seção 6, mas ajusta a estrutura |
| P-2 | Seção 3 | Cita `<modulo>/` com "partes" como exemplo; com RAT-D017 a rota é `socios` (dentro de `configuracoes/`, PROPOSTA) |
| P-3 | Seção 6 (`/auth/confirm`) | O plano diz que a rota "troca token_hash por sessão". Esta spec propõe, **como alternativa a decidir**, uma tela intermediária "Aceitar convite" para não perder o token de uso único para verificadores de link de e-mail (J1, 2.5.1). Se não for aprovada, vale a verificação automática e a tela de aceite é dispensada |
| P-4 | Seção 6 (matriz) | A linha "Gerenciar usuários" é do Administrador, mas fica fora da FND (P-24). O item de menu "Usuários" é só espaço reservado |
| P-5 | Seção 6 (papel Sócio) × `02-modelagem-dados.md` | O plano descreve o vínculo `partner_id` como opcional na estrutura geral. A modelagem proposta (G1) já responde: `check (role is distinct from 'PARTNER' or partner_id is not null)`, "`PARTNER` exige `partner_id`". Se o G1 aprovar assim, o estado 2.7.2 (Sócio sem vínculo) **não existe** e o "sem vínculo" do plano equivale a `role` nulo, coberto por 2.7.1. Spec ajustada (2.7.2, UX-16) |
| P-6 | Código atual | `src/app/login/actions.ts` ("Procure o financeiro"; a Server Action de login **encerra a sessão** quando não há perfil ativo), `src/app/page.tsx` ("Administrador financeiro") e `src/app/layout.tsx`/`page.tsx` do login ("Ultra Contabilidade") usam vocabulário, nome e comportamento antigos. Ajustes da E5 (inclusive a regra única de acesso do J1: manter a sessão e mostrar 2.7.1); sem alteração de código nesta etapa |
| P-7 | Seção 15, CA-14 | CA-14 pede "estados conforme `03-ui-ux.md`": cobertos em 4 e 8.A (UX-16 a UX-22) |
| P-8 | Seção 14 (E5), 15 (CA-14) e 19 | A E5 implementa "layout autenticado com navegação (placeholders), rota `/auth/confirm` e página de definir/redefinir senha". O plano pede a esta spec o **padrão** de tabela financeira, Recebido / Devido / Saldo e confirmação (seção 19), mas **não** prevê código desses padrões na FND. Esta revisão separa os dois (0.6, 3.2 × 3.3, 8.A × 8.B) e lista os padrões como PROPOSTA fora dos CA. Ampliar a E5 exige aprovação (U-02) |
| P-9 | Seção 6 (matriz) | As linhas "Gerenciar clientes", "Lançar recebimentos e importar comprovantes" e "Leitura geral" são P-02b para o Sócio. A tabela de 2.3 usa "P-02b (FND: oculto)" nelas, para não tratar a pendência como regra fechada |
| P-10 | Seção 6 / CA-08 × `02-modelagem-dados.md`, 8.1 | A modelagem distingue "sem vínculo" (`role is null`) de "bloqueado" (`active = false`), e o CA-08 fala em "bloqueio de usuário inativo". Esta spec **funde** os dois numa única tela, 2.7.1 ("Sem acesso ativo"), por sigilo (não revelar diferenças de configuração), com texto neutro que serve aos dois casos. Decisão final da `seguranca`, junto com a regra única de acesso (J1); se ela preferir telas separadas, 2.7.1 se divide em "Sem acesso ativo" (sem vínculo) e "Acesso desativado" (bloqueado), com UX-16 ampliado |
| P-11 | Seção 6 (`proxy`) e `src/lib/supabase/proxy.ts` | O proxy redireciona ao `/login` todo visitante sem sessão fora de `PUBLIC_PATHS` (hoje só `/login`). A 404 de URL só aparece com sessão (4.8, UX-21), e a lista precisa incluir `/recuperar-senha` e `/auth/confirm` (9.4, item 5). O redirecionamento do proxy também é requisito de J2, J6 e 4.9: leva o destino pretendido (`next`, só navegação GET e fora de `/`) e, havendo credencial de sessão vencida, o indicador de sessão expirada (`aviso`); o login revalida o destino (só caminho interno, protegido contra redirecionamento aberto; destino inválido cai em `/`) (4.8). A spec não pede mudança do desenho do proxy além da lista de rotas públicas |

Situação em 23/10/2026: **D-1 a D-5 já estão anotadas no Brain**, nas notas de 22/10/2026 de `00-MOC.md` (D-5), `01-Visao-Geral.md` (D-5), `05-Modulos.md` (D-1, D-2 e D-3: o cadastro de Recebedores consta como pendência de UI, que segue aberta na U-01) e `10-Seguranca-e-Auditoria.md` (D-4); o plano, revisão 6, registra essas notas. Não há anotação a pedir. Seguem **abertas** D-6, D-7 e D-8. Nenhuma divergência impede o gate.

### 9.3 Fora do escopo da FND (registrado para não se perder)

- Logotipo definitivo e favicon (hoje, favicon padrão do Next).
- Tema escuro e alternador (tokens `.dark` existem, sem uso).
- Modo recolhido da barra lateral.
- Tela de troca de senha com a pessoa já logada (a recuperação cobre o caso; não houve pedido).
- Qualquer tela de feature: cadastros, competências, recebimentos, rateio, apuração, compensações, liquidação, importação, OCR, dashboards. As seções 2.9, 2.10, 3.3 e 5.1 fixam apenas o padrão, como PROPOSTA [PADRÃO-FUTURO], sem implementação nem critério de aceite na FND.
- Componentes financeiros (`MoneyValue`, `BalanceValue`, `FinancialTable`, `ConfirmActionDialog` e demais de 3.3), funções `balanceDirection` e `formatSignedCurrency`, e "componentes de exemplo" no código: não fazem parte da E5 (U-02).

### 9.4 Perguntas e handoffs

**Ao responsável pelo produto (DECISÃO PENDENTE):**

1. **P-02b** — O que o sócio vê e faz com o login próprio. Até lá, 2.7.3 (nenhum módulo, nenhum dado) e "P-02b (FND: oculto)" na tabela de 2.3.
2. **P-08** (enunciado original do plano e do Brain 11: "Recebedor é sempre um Sócio ou pode haver intermediário?") — dependência da U-01 abaixo. Esta spec não a reinterpreta.
3. **U-01 (pendência própria da UI, depende da P-08)** — Onde mora o cadastro de Recebedores na navegação. Recomendação: dentro de Configurações > Sócios, junto da primeira feature do roadmap ("Sócios, recebedores e aliases"); a FND só reserva a posição.
4. **U-02 (pendência própria da UI)** — Ampliar a E5 para implementar os padrões [PADRÃO-FUTURO] (componentes financeiros, confirmação, componentes de exemplo)? Recomendação: **não**; a FND fica com o shell, a autenticação, os estados de acesso e os placeholders, e os padrões são implementados na primeira feature que os usar. Se o responsável aprovar a ampliação, os critérios UX-23 a UX-33, UX-35 a UX-41, UX-43, UX-44 e UX-54 passam a ser verificados na FND e o plano (CA-14 / CA-16, seção 14) precisa ser revisado por quem o mantém.
5. **P-14** — MFA para administradores: se aprovado, o login ganha uma etapa de código (não desenhada aqui).
6. **P-19** — Fuso oficial das datas e da competência (esta spec adota `America/Sao_Paulo` como recomendação).
7. **P-25** — Provedor de SMTP e domínio: define apenas o **remetente** e o domínio dos e-mails. O **prazo de validade dos links** de convite e recuperação é configuração do Supabase Auth (expiração do link/OTP de e-mail), configurada pelo responsável nos painéis da E9 (checklist da E8; ver o handoff ao `desenvolvedor`, item 8).

**Ao `desenvolvedor` (E5):**

1. Aplicar as diretrizes de 3.1, 3.2 e 3.4 e a estrutura de rotas de 2.1; implementar `nav-config` como fonte única.
2. Decidir, com a `seguranca`, a tela intermediária de aceite (J1) e a política de senha (comprimento e regras), expondo a regra para a UI exibir antes do erro.
3. Confirmar se o e-mail de recuperação funciona para usuário convidado que ainda não definiu senha; se não, o texto de 4.6 precisa orientar o pedido de novo convite.
4. Implementar a **regra única de acesso** (J1): autenticado sem perfil ativo mantém a sessão e vê 2.7.1, também no login (hoje a Server Action de login encerra a sessão; P-6). Se a `seguranca` decidir o contrário, inverter a regra em todos os pontos.
5. Criar `app/not-found.tsx` (raiz, sem shell e sem lógica de sessão própria; só é vista com sessão, 4.8b) e `app/(app)/not-found.tsx` (no shell, 4.8a). **Proxy:** manter o redirecionamento ao `/login` de quem não tem sessão **levando o destino pretendido e o indicador de sessão expirada**, como requisito (a 404 de URL sem sessão cai no login, 4.8): `next` com o caminho interno só em navegação GET e nunca para `/`; `aviso=sessao-expirada` só quando havia credencial vencida; o login revalida `next` (somente caminho interno, protegido contra redirecionamento aberto, rotas de autenticação recusadas, inválido cai em `/`). Acrescentar à lista de rotas públicas do proxy `/recuperar-senha` e `/auth/confirm`, além de `/login` (2.1). Verificar com a `seguranca` o comportamento para quem já tem sessão e abre essas rotas: hoje as rotas públicas redirecionam para `/`, o que não pode impedir o aceite de convite nem a recuperação. Conferir o comportamento contra `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md` da versão instalada.
6. Escolher entre renderizar o estado "Sem permissão" na página ou habilitar `forbidden()` (experimental no Next 16.4; ver `forbidden.md` na documentação local).
7. Os ícones lucide citados nesta spec (incluindo os da tabela 2.3) foram conferidos na versão instalada do `lucide-react` (1.52.0). A propriedade `focusableWhenDisabled` consta nas definições de tipo do Button do Base UI instalado (1.8.0); conferir o comportamento em uso (relevante só para as features, [PADRÃO-FUTURO]).
8. Incluir no checklist de painéis da E8 a expiração do link/OTP de e-mail do Supabase Auth. O responsável a configura na E9 (plano, seções 10 e 19: os passos de painel são dele) e o valor é informado à UI para os textos de 2.5 e 2.6 (não é da P-25).

**Handoff às features futuras ([PADRÃO-FUTURO], não é da E5):** na feature de Apuração, fornecer ao domínio `balanceDirection` (sinal → `transfer` | `receive` | `settled`) com teste, e `formatSignedCurrency` (sinal explícito e U+2212) em `lib/format`; os componentes só consomem. Nas features com ações de confirmação, garantir idempotência no servidor (a UI previne duplo envio, mas não substitui isso).

**À `modelagem-dados` (E2):** resposta já proposta no `02-modelagem-dados.md` (`PARTNER` exige `partner_id`; `role` nulo = "sem vínculo"); falta a aprovação do G1, que define se 2.7.2 existe. P-17 (registro do resíduo) alimenta a nota do centavo de ajuste e a decisão pendente sobre "diferença controlada" (D-7).

**À `seguranca` (E8b):** revisar mensagens de login (sem enumeração), tela intermediária de aceite, política de senha, a regra de "não mostrar nome de sócio" nos estados de acesso do papel Sócio e a **regra única de acesso** (manter a sessão sem perfil ativo, J1), incluindo a **fusão de "sem vínculo" e "bloqueado"** numa só tela por sigilo (P-10) o comportamento do proxy para quem já tem sessão e abre rotas públicas (9.4, item 5; P-11) e a **validação do destino do redirecionamento** (`next`: só caminho interno, sem redirecionamento aberto, sem laço por rotas de autenticação, descarte em ação não GET; `aviso` sem vazar informação de conta) (4.8, 9.4 item 5).

**Ao `qa` (E10):** executar a seção **8.A** como parte da matriz de CA-14 (CA-08, CA-06 e CA-16 nas partes de UI indicadas); incluir contraste medido (UX-34) e teste com leitor de tela (UX-49). A seção 8.B **não** entra na matriz da FND, salvo aprovação da U-02.

---

## 10. Gate G2

**ESPECIFICADO.**

Motivos:

- Entrega obrigatória completa: jornada (1), estrutura das telas (2), componentes (3), estados (4), interações (5), responsividade (6), acessibilidade (7) e critérios UI/UX verificáveis (8), com a separação entre o que a E5 implementa (8.A) e o padrão para features futuras (8.B, PROPOSTA).
- Cobre o handoff da seção 19 do plano: shell "Financeiro Ultra", navegação pelos módulos do Brain 05 com "Sócios" no lugar de "Partes", login, aceite de convite / definir senha, recuperação de senha, estados (vazio, carregando, erro, sem permissão, sem perfil ativo, Sócio sem escopo P-02b), padrão de tabela financeira, apresentação de Recebido / Devido / Saldo com o sinal da RN-010 sem depender só de cor, padrão de confirmação para ações irreversíveis, responsividade e acessibilidade. Os três padrões financeiros são especificados como [PADRÃO-FUTURO]; **não** são código da E5.
- Não contradiz decisões vigentes: sem tela de percentuais (RAT-D015), vocabulário RAT-D017, nome RAT-D013, empresa única (RAT-D010), login próprio dos sócios (RAT-D011). O **papel Sócio e a regra de negar por padrão** são PROPOSTA do plano aprovado (seção 6; CA-06), na pendência P-02b, e não decisão oficial do Brain.
- Telas de features futuras aparecem apenas como espaço na navegação e como padrão (PROPOSTA, fora dos CA da FND).
- Pontos em aberto (9.4) são dependências identificadas, com a UI reservando espaço; nenhum bloqueia a implementação do shell na E5. Pendências novas da UI: U-01 (cadastro de Recebedores na navegação, depende da P-08) e U-02 (ampliação de escopo). Dependência a confirmar: regra única de acesso com a `seguranca`.

Condições para a E5: o `desenvolvedor` seguirá as seções 2 a 7 (itens [FND]) e o QA verificará a seção 8.A. A E5 começa depois do G1 e do G2 e com a E4 concluída, conforme a seção 14 do plano (a E5 depende de E3 e E4, e a E4 depende da E2).

---

## Histórico de revisão

### Rodada 3, complemento (23/10/2026): observação nova da revisão independente (baixa), sobre o redirecionamento do proxy

A nota da 4.8 dizia que o destino pretendido é guardado (J2), mas também que a spec "não pede mudança do proxy"; o item 5 do 9.4 mandava "manter o redirecionamento" e P-11 dizia não haver mudança "além da lista", sem deixar claro que J2, J6 e 4.9 exigem que o redirecionamento leve o destino e o motivo. **Corrigido** em 4.8 (novo requisito, itens a a c, conferido no código de `src/lib/supabase/proxy.ts` e `src/lib/safe-redirect.ts`), 4.9, 2.4 (linha da sessão expirada), J2, J6, 9.2 (P-11) e 9.4 (item 5 e handoff à `seguranca`, que passou a revisar a validação do destino). Nenhuma outra decisão mudou, nenhuma proposta virou decisão; só este arquivo foi alterado.

### Rodada 3 (23/10/2026): observações restantes da revisão independente (`round3-03-findings`, veredito "consistente com ressalvas"), antes da E5

As 5 observações foram tratadas; nenhuma foi rejeitada. Nenhuma pendência parcial anterior ficou aberta. Não houve alteração de regra financeira, do Brain nem do plano `01-plano.md`; só este arquivo mudou.

| # | Observação | Severidade | Tratamento | Onde |
|---|---|---|---|---|
| 1 | UX-21(a) e 4.8(b) exigiam a 404 de URL "sem sessão", mas o proxy (`src/proxy.ts`, `src/lib/supabase/proxy.ts`; `PUBLIC_PATHS = ["/login"]`, matcher que cobre todas as rotas, exceto assets) redireciona ao `/login` todo visitante sem sessão antes de qualquer rota | média | **Corrigido pela saída 1 da revisão**, conferida no código do proxy: sem sessão, URL inexistente vai ao login; com sessão, aparece a 404 raiz, sem shell. Removido "sem guarda de sessão" e "também sem sessão"; UX-21 e 4.10 distinguem os dois casos e deixam claro que o login sem sessão não reprova o critério. Não se pede mudança do desenho do proxy (a saída 2 dependeria da `seguranca` e a lista de rotas públicas não separa "URL desconhecida" das demais). Handoff da E5 (9.4, item 5) ganhou a lista de rotas públicas do proxy (`/login`, `/recuperar-senha`, `/auth/confirm`) e a verificação, com a `seguranca`, do redirecionamento de quem já tem sessão. Registrado em P-11 | 4.8, 4.10, UX-21, 9.2 (P-11), 9.4 |
| 2 | Handoff 9.4 (item 8) e 2.6 atribuíam ao `desenvolvedor` os passos de painel da E9, que o plano dá ao responsável (E9 e seção 19) | baixa | **Corrigido.** O item 8 passou a: incluir a expiração do link/OTP de e-mail no checklist de painéis da E8; o responsável a configura na E9; o valor é informado à UI. 2.6 e a pendência P-25 (9.4, item 7) alinhadas | 2.6, 9.4 (itens 7 e 8) |
| 3 | O cabeçalho e 9.4 (item 4, U-02) citavam "UX-23 a UX-41", faixa que inclui o UX-34, critério da FND | baixa | **Corrigido.** Nas duas passagens: "UX-23 a UX-33, UX-35 a UX-41, UX-43, UX-44 e UX-54", igual à introdução da seção 8 | Cabeçalho, 9.4 (item 4) |
| 4 | 9.1 e a frase final de 9.2 pediam anotação no Brain para D-1 a D-5, já feita nas notas de 22/10/2026 (00, 01, 05, 10) | baixa | **Corrigido**, após conferir as notas no Brain. D-1 a D-5 marcadas como anotadas; removido o pedido de anotação; D-6, D-7 e D-8 permanecem abertas. A posição do cadastro de Recebedores segue pendente como U-01 | 9.1 |
| 5 | A regra única de acesso funde perfil inexistente, `role` nulo e perfil **inativo** numa tela com "ainda não liberado", sem registrar a divergência com a modelagem (8.1) nem com o "bloqueio de usuário inativo" do CA-08 | baixa | **Corrigido pelas duas vias sugeridas.** (a) Divergência registrada em P-10 (9.2) e no handoff à `seguranca` (9.4), que decide junto com a regra única de acesso; (b) texto neutro na tela 2.7.1: título "Sem acesso ativo" e "…não tem acesso ativo ao Financeiro Ultra. Se você esperava ter acesso, peça a um Administrador para verificar o seu cadastro.", que serve a quem aguarda a liberação e a quem foi desativado. Referências em J1 e J2 atualizadas | J1, J2, 2.7.1, 9.2 (P-10), 9.4 |

Decisões do responsável registradas (plano, revisão 7, 23/10/2026): ficam **aceitos**, sem objeção, (1) tokens de cor com contraste reforçado, por acessibilidade, e (2) o nome "Financeiro Ultra" em texto no lugar do logotipo, até haver um definitivo. Refletido em 0.1 e 0.5; a criação de logotipo continua fora da FND (9.3). Nenhum item do contrato visual muda além disso.

Pendências que seguem para quem mantém os documentos: P-10 (fusão "sem vínculo" × "bloqueado", `seguranca`), P-11 (lista de rotas públicas do proxy e comportamento com sessão, E5 e `seguranca`), além das já listadas na rodada 2.

### Rodada 2 (22/10/2026): revisão independente (`round2-03-findings`, veredito "consistente com ressalvas")

Todos os 12 problemas foram tratados; nenhum foi rejeitado. Não houve alteração de regra financeira, do Brain nem do plano `01-plano.md`.

| # | Problema da revisão | Severidade | Tratamento | Onde |
|---|---|---|---|---|
| 1 | Spec ampliava o escopo da FND: componentes financeiros, diálogo de 3 níveis e `balanceDirection` como "necessários na FND", UX-25/UX-35 ligados ao CA-16 | média | Corrigido. Nova seção 0.6 e marcas **[FND]** / **[PADRÃO-FUTURO]**. 3.2 ficou só com o que a E5 implementa; os componentes financeiros e de confirmação foram para 3.3 (PROPOSTA, fora da FND). Seção 8 dividida em **8.A** (critérios da FND) e **8.B** (PROPOSTA, sem CA); mapa de CA reescrito (CA-16 → UX-02, UX-03 e o novo UX-53). `balanceDirection`/`formatSignedCurrency` passaram a handoff às features (Apuração), não E5. Novo U-02 pede aprovação do responsável para qualquer ampliação | 0.6, 2.9, 2.10, 3.2, 3.3, 5.1, 8, 9.3, 9.4, 10 |
| 2 | Matriz de visibilidade tratava as linhas P-02b do Sócio como "—" (nunca) | média | Corrigido. Linhas viraram "P-02b (FND: oculto)", com legenda que distingue "nunca" de "pendente, hoje negado" | 2.3 |
| 3 | "Autenticado sem perfil ativo" tinha dois tratamentos (encerrar sessão no login × mostrar 2.7.1), e a referência "(J6)" estava errada | média | Corrigido com **regra única de acesso** (manter a sessão e mostrar 2.7.1 em qualquer porta de entrada), com justificativa e ressalva: diverge do código atual e depende da `seguranca`. J1, J2, J4, 2.4, 2.7.1, UX-08, UX-17 e 4.10 alinhados. Referência corrigida para J1/J2/J4 (J6 é sessão expirada) | J1, J2, J4, 2.4, 2.7.1, 4.10, 8.A, 9.2 (P-6), 9.4 |
| 4 | Bloqueio de "apurar" por soma dos saldos ≠ 0 atribuído ao Brain 09 (circular e inexistente no Brain) | média | Corrigido. O bloqueio vale **só para a liquidação** (Brain 09, "Para liquidar", item 4); texto "A competência não pode ser liquidada…". Efeito sobre a apuração ficou DECISÃO PENDENTE da feature Apuração | 2.10.6, 4.7, UX-30 |
| 5 | `not-found.tsx` "dentro do shell" não pega URL inexistente no Next 16.4 | média | Corrigido conforme `not-found.md` instalado. Dois casos: (a) `notFound()` em `(app)` → `app/(app)/not-found.tsx`, no shell; (b) URL inexistente → `app/not-found.tsx` raiz, sem shell e sem guarda de sessão. `global-not-found.js` (experimental) dispensado | 4.3, 4.8, 4.10, UX-20, UX-21, 9.4 |
| 6 | Estado 2.7.2 (Sócio sem vínculo) obrigava o QA a verificar algo que a modelagem proposta torna impossível | baixa | Corrigido após ler `02-modelagem-dados.md` (`profiles_partner_role_requires_partner`; `role is null` = "sem vínculo"). 2.7.2 virou CONDICIONAL ao G1 e saiu do UX-16, que só o inclui se a constraint for retirada | 2.7.1, 2.7.2, UX-16, 9.2 (P-5), 9.4 |
| 7 | Papel Sócio e "negar por padrão" apresentados como decisão oficial (RAT-D011) | baixa | Corrigido. Classificados como PROPOSTA do plano (seção 6; CA-06); RAT-D011 fica só para o login próprio dos sócios. Registrado como D-8 | 0.2, 2.7.3, 9.1, 10 |
| 8 | P-08 usada para uma pergunta de navegação, que não é o enunciado da P-08 | baixa | Corrigido. P-08 mantida com o enunciado original; a pergunta de navegação virou pendência própria **U-01** (depende da P-08), com recomendação baseada no roadmap do plano | 2.3, 9.1 (D-3), 9.4 |
| 9 | Prazo de validade do link atribuído à P-25 (SMTP) | baixa | Corrigido. O prazo é configuração do Supabase Auth (passo de painel da E9); a P-25 trata só de remetente e domínio. Novo item no handoff ao `desenvolvedor` | 2.6, 9.4 |
| 10 | Nota de "diferença de arredondamento controlada" misturava parcela com soma dos saldos | baixa | Corrigido. Removido o estado "diferença controlada": qualquer soma ≠ 0 é inconsistência, até o domínio/modelagem definir o contrário. A nota do centavo de ajuste passou a falar só de parcelas. A tensão entre RN-011 e a modelagem foi registrada como D-7 | 2.10.6, UX-30, UX-33, 9.1 |
| 11 | Gate omitia a dependência da E4 | baixa | Corrigido: "A E5 começa depois do G1 e do G2 e com a E4 concluída, conforme a seção 14 do plano" | 10 |
| 12 | Exemplo 2.10.5 atribuía ao Brain 07 valores de Recebido e Devido que ele não traz | baixa | Corrigido: só os saldos são do Brain 07; Recebido e Devido são ilustrativos, coerentes com 1/n | 2.10.5 |

Ajustes adicionais desta rodada, sem relação direta com um problema da revisão:

- Cabeçalho: plano em revisão 6; `02-modelagem-dados.md` incluído nas entradas; status e escopo reescritos com a separação FND × padrão futuro.
- Tabela 4.10: nova linha "Não encontrado"; coluna de erro do login sem "sem perfil".
- 9.2: acrescentados P-8 (escopo da E5 × padrão) e P-9 (linhas P-02b da matriz); P-6 passou a citar o encerramento de sessão do login atual.
- 9.4: pendências novas U-01 e U-02; handoffs reorganizados (E5 × features futuras).

Divergências e dependências para quem mantém os documentos (não corrigidas aqui, por regra):

- D-7 (RN-011 × modelagem): decidir se a "diferença controlada de arredondamento" continua existindo.
- D-8 (papel Sócio e negar por padrão são PROPOSTA do plano, sem respaldo no Brain 10).
- Regra única de acesso: confirmação da `seguranca`, e ajuste do login atual na E5.
- G1: aprovação da constraint `PARTNER exige partner_id` (define se 2.7.2 existe).
