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
