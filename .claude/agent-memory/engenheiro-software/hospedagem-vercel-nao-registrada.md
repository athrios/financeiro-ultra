---
name: hospedagem-vercel-nao-registrada
description: Em 25/11/2026 o sistema estava publicado na Vercel, mas Brain (RAT-D022), CLAUDE.md e plano FND-001 rev. 12 ainda diziam Render; usuários criados no painel do Supabase sem SMTP
metadata:
  type: project
---

Em 25/11/2026 o responsável voltou da Render para a **Vercel**, mas a RAT-D022, o `CLAUDE.md` e o plano da FND-001 (rev. 12) ainda descrevem o Render; o fechamento da FND nesse ponto foi adiado por ele. Também informou (não registrado no Brain): sistema "totalmente interno"; membros criados pelo Administrador no painel do Supabase com senha, sem SMTP; papel dado por SQL (`private.set_user_access`). Sem CI (GitHub Actions parado por cobrança); migrations aplicadas pelo responsável via CLI.

**Why:** evita planejar etapas de publicação ou e-mail com base em documentação desatualizada.

**How to apply:** antes de planejar publicação, conferir se a RAT-D022 já foi regularizada; escrever etapas de publicação sem depender do provedor; não depender de e-mail/SMTP; prever verificação local com evidência no lugar da CI. Ver [[responsavel-nao-tecnico]].
