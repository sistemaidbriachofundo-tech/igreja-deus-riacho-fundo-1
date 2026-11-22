# Ativação OIDC (quando houver IdP)

Hoje o backend responde `OIDC_NOT_LIVE`: config CRUD existe; authorize/callback **não** trocam código por sessão.

## Variáveis obrigatórias

- `OIDC_ISSUER_URL`
- `OIDC_CLIENT_ID`
- `OIDC_CLIENT_SECRET` (ou ref via `OIDC_CLIENT_SECRET_REF`)
- `OIDC_REDIRECT_URI` (HTTPS do ambiente)

Opcionais: `OIDC_SCOPES`

## Critério de “live”

1. `GET /auth/oidc/authorize` redireciona 302 para o IdP (não JSON stub).
2. Callback troca `code` e emite JWT pelo mesmo caminho de sessão/MFA.
3. Contrato `oidcLive: true` só depois dos passos 1–2 em HML.

## O que não fazer

- Não fingir IdP com redirect falso.
- Não marcar live só porque a config `ENABLED` está true.
