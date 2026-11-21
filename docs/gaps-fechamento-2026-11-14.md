# Fechamento de gaps — 2026-11-14

## Estratégia de canais (WhatsApp / e-mail)

| Antes | Agora |
|-------|--------|
| RF-025 dependia de WABA/SMTP live | Contato operacional abre **app nativo / web** (`wa.me`, `mailto:`) |
| Botões “enviar” fingiam outbox | `OpenWhatsAppLink` + helpers em `@idbrf/shared` |
| Escalas sem caminho humano | Botão WhatsApp na mesa de escalas (líder) |

A plataforma **não** dispara WhatsApp Business API. O líder envia no app.

## Pagamentos de evento

| Antes | Agora |
|-------|--------|
| Só `MOCK_ONLY` + webhook HMAC | + `settlement` com Pix/instrução copiável (`EVENT_MANUAL_PIX_KEY`) |
| Sem confirmação staff | `POST /registrations/:id/confirm-manual-payment` |

Sem PSP/gateway inventado.

## OIDC

Continua `OIDC_NOT_LIVE` até IdP real. Roteiro: `deploy/prod/oidc-activation.md`.

## MFA blocking

Smoke: `node scripts/prod/mfa-blocking-smoke.mjs https://api.igrejadeusrf1.com.br`  
E2E completo: `qa/security-f11` eight-personas com `mfaBlocking=true` em API isolada.

## Backup / restore

Ensaio prod: `scripts/prod/backup-restore-rehearsal.md`  
Smoke DEV permanece em `scripts/pg-backup-restore-smoke.sh`.

## App nativo

Fora deste fechamento (contrato F6 apenas).
