# Revisão segurança — F2 M1 (Backend)

Data: 2026-11-04 (America/Sao_Paulo). Escopo: API Nest + Prisma pós-#24/#25.

## Controles presentes
| Área | Estado |
|------|--------|
| Senhas | Argon2id (seed + login) |
| JWT | HMAC local; rejeita secret curto / `dev-only-` fora de development |
| AuthZ | Roles + escopo church/org nos services |
| Validação | `ValidationPipe` whitelist + forbidNonWhitelisted |
| CORS | Livre em DEV; **obrigatório `CORS_ORIGIN` se `NODE_ENV=production`** |
| Rate limit | In-memory em `POST /auth/login` e `GET /credentials/verify/:token` |
| Headers | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` |
| Carteirinha | Gate `credentialEligible`; QR opaco; verify público sem PII no token |
| Busca pessoas | Sem merge automático (`autoMergeForbidden`) |
| Menores | Guardião adulto obrigatório; sem auto-guardião |
| Documentos | Storage privado `STORAGE_ROOT`; download só staff; audit sha256 |
| Prontuário | MEMBRO só o próprio `personId` |
| Auditoria | `audit_logs` sem senha / sem bytes de arquivo |
| Dados | Seed fictício only |

## Riscos / mitigações
| Risco | Mitigação atual | Próximo passo (aprovação) |
|-------|-----------------|---------------------------|
| Verify público enumerável | Rate limit + payload mínimo | WAF / captcha HML |
| JWT stub (sem OIDC/MFA) | Documentado | OIDC institucional |
| Rate limit single-node | OK DEV/HML | Redis quando multi-instância |
| CORS mal configurado em PRD | Fail-fast sem `CORS_ORIGIN` | Revisar origens HML |
| Logs com PII | Evitar e-mail em metadata sensível | Política de retenção |

## Testes negativos homologados (Postgres real)
Ver evidência do script `scripts/homolog-m1-admission.mjs`: 401 sem JWT, 403 papel, 409 step lock / duplicate / second issue.
