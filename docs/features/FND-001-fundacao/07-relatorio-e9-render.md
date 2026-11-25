# Relatório da E9 · Adaptação ao Render (FND-001)

Data: 25/11/2026. Para o responsável pelo produto.

## 1. O que estava errado e o que foi feito

**Problema:** o primeiro build no Render falhou. Faltavam as duas variáveis do Supabase (endereço do projeto e chave pública).

**O que foi feito:**
- Agora o build para logo no início, com mensagem clara, se faltar configuração ou se ela estiver errada (por exemplo, ambiente "local" em produção ou chave secreta fora do lugar).
- O sistema usa a porta que o Render define.
- A versão do Node (22) ficou fixada em um arquivo.
- Foi criado o arquivo de configuração do Render (Blueprint): plano gratuito, região Virginia, publicação manual.
- Next e zod foram atualizados por segurança. O relatório de vulnerabilidades do que roda em produção ficou zerado.
- README e checklist foram atualizados.

Não houve mudança no banco de dados.

## 2. Resultado das verificações

**Segurança:** liberado para o deploy de teste, **só com dados fictícios**. Riscos aceitos ou registrados:
- Repositório público (aceito por você em 25/11/2026). Nenhum segredo foi achado no código nem no histórico.
- Plano gratuito do Render: dorme após cerca de 15 minutos sem uso e não é indicado para produção. Bloqueia dados reais.
- Limite de tentativas de login por IP: todos os usuários compartilham o IP do servidor. Quem esgotar o limite pode travar o login por alguns minutos. Isso fica fora do escopo (RAT-D020).
- Falta conferir os painéis (Render, Supabase, GitHub). Isso depende das evidências que você vai juntar.

**QA:** aprovado, sem bug crítico, alto ou médio.
- Testes unitários: 290 passando.
- Banco: 237 testes passando.
- Ponta a ponta: 48 de 48.
- Build simulado do Render em cópia limpa: falha quando deve falhar e passa (20 páginas) com a configuração certa.
- Não testado: o deploy real, que só você pode fazer.

## 3. O que você faz agora (em ordem)

1. Apagar no Render o serviço criado à mão.
2. Criar o serviço pelo **Blueprint** (New > Blueprint > repositório).
3. Preencher as duas variáveis: URL do projeto e chave publicável do Supabase. Não cadastre chave secreta.
4. Fazer o **Manual Deploy**. Confira que o build fica verde e que `/login` abre.
5. No Supabase, configurar a **Site URL** com a raiz `https://<serviço>.onrender.com`, sem caminho. Configurar também uma única **Redirect URL**, `https://<serviço>.onrender.com/auth/confirm`. Sem curinga e sem localhost.
6. Convidar seu e-mail e rodar o script do primeiro administrador. Depois aceite o convite.
7. Fazer o smoke (login, sair, esqueci a senha, convite de segundo usuário), só com dados fictícios.
8. Testar que o cadastro público é recusado (deve responder `signup_disabled`).
9. Guardar as evidências, sem segredos, fora do repositório, e entregá-las à Segurança para uma conferência curta.

## 4. Decisões pendentes (antes de dados reais)

- **P-05c2:** banco de homologação separado e planos pagos (Render e Supabase), com backup.
- **P-25:** provedor de e-mail (SMTP) e domínio. Sem SMTP próprio, convites e recuperação ficam limitados a poucos e-mails por hora.
- **P-26:** LGPD. O servidor fica nos EUA (Virginia) e o banco em São Paulo, então há transferência internacional de dados pessoais. É preciso avaliar isso antes dos dados reais.

Até essas decisões, o sistema fica só para teste com dados fictícios.
