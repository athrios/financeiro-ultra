---
name: fnd001-revisao-e4-e5
description: Revisao de seguranca E4 (banco) + E5 (app) da FND-001 em 2026-10-23 e revalidacao final; postura RAT-D020 (sistema interno, so o basico); o que ficou aberto
metadata:
  type: project
---

Branch fnd-001/e4-e5, 2026-10-23. Revisao inicial (12 achados SEG-E45-01..12) e revalidacao final: nao bloqueou.

Postura do responsavel em 23/10/2026 (a registrar como RAT-D020): sistema interno, "nao precisa de muitas camadas". FORA do escopo por decisao: CAPTCHA/limite proprio de tentativas, CSP com nonce/hash, enumeracao de contas, e-mails de aviso (password_changed desligado), MFA. Nao reportar esses como achados a corrigir; no maximo um INFORMATIVO fora_do_escopo_RAT-D020. Continua obrigatorio: convite, RLS/papeis, Socio/sem papel sem dados, auditoria, bucket privado, segredos fora do codigo.

Corrigido e conferido ao vivo na revalidacao: cookies HttpOnly+SameSite=Lax; /definir-senha exige amr otp/invite/recovery de ate 15 min (POST com sessao por senha nao troca a senha); TRUNCATE revogado + BEFORE TRUNCATE; proof_upload_allowed exige uploaded_by = auth.uid(); X-Powered-By removido; APP_ENV obrigatoria na Vercel.

Ainda abertos (cobrar depois):
- SEG-E45-03 resto: sha256 conferido pelo servidor antes de qualquer release com upload (E7) - pre-requisito bloqueante registrado pelo dev.
- SEG-E45-09 BAIXO: senha fixa antiga em docs/legado/07-10/scripts/seed-dev.ts (aguarda responsavel).
- Novo BAIXO: apos logout o access token (JWT, ate 1h) continua aceito porque getClaims valida so a assinatura.

Limite das provas: na FND as telas ainda sao placeholders e nenhuma carrega dados de negocio, entao o teste "Socio sem dados no RSC" nao tem controle positivo; repetir quando a E6/E7 renderizar dados.

**Why:** evitar rediscutir pontos ja decididos e cobrar os abertos na etapa certa.
**How to apply:** na E6/E7/E8/E9 conferir primeiro estes itens; repetir a prova de payload RSC quando houver dados. Ver tambem [[fnd001-triagem-e0]].

Atualizacao 2026-10-23 (E8b, branch fnd-001/e7-e8): sem bloqueio. SEG-E45-03 corrigido na E7 (hash no servidor); caminho direto do Operador pela RPC = SEG-E8B-02 aceito_RAT-D020. SEG-E45-09 encerrado (responsavel confirmou que nunca foi usado). RAT-D021 (motivo opcional) nao afrouxou guardas. Novo BAIXO SEG-E8B-05: curinga *-<slug>.vercel.app nas Redirect URLs do checklist E9 (templates usam SiteURL, entao baixo). Na E9b: conferir Redirect URLs, actor 'athrios', push na main sem deploy.

Revalidacao E8b 2026-10-23: SEG-E8B-05 corrigido no checklist (falta conferir tela na E9b). /auth/confirm usa referrer strict-origin (no-referrer gerava Origin null e quebrava Server Action sem JS) - nao voltar a sugerir no-referrer ali.

E9b 2026-11-25 (branch fnd-001/e9, Render RAT-D022): liberado, sem bloqueio. Repo PUBLICO = risco aceito pelo responsavel (SEG-E9B-05); varredura do historico limpa. Headers (HSTS) sao fixados no BUILD (provado); cookies Secure leem APP_ENV em runtime. Abertos: SEG-E9B-08 evidencias dos paineis (inclui tela URL Configuration do SEG-E8B-05, servico manual apagado, previews off); SEG-E9B-07 plano free bloqueia dados reais ate P-05c2. Nao repetir: limite por IP do Auth = fora_do_escopo_RAT-D020.
