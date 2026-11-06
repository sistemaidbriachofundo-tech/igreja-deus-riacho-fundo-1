# Runbook HML — Backend IDBRF

**Status da URL pública:** `TBD` — ambiente **não** publicado.  
Quando houver autorização e TLS, registrar aqui a base URL real (ex.: `https://api-hml.…`) e informar o FE (`NEXT_PUBLIC_API_URL`).

## O que sobe
- Postgres 16 (compose)
- API Nest (`Dockerfile.api`)
- Volume privado `STORAGE_ROOT` para documentos de admissão (não CDN)

## Subir (loopback only)
```bash
cp .env.hml.example .env.hml
# editar POSTGRES_PASSWORD, JWT_SECRET (≥32, sem dev-only-), CORS_ORIGIN
docker compose -f docker-compose.yml -f docker-compose.hml.yml --env-file .env.hml up -d --build
# Dockerfile.api já roda `prisma migrate deploy` no boot.
# Opcional: SEED_ON_BOOT=1 no .env.hml para seed fictício automático.
curl -fsS http://127.0.0.1:3001/health
curl -fsS http://127.0.0.1:3001/ready # deve falhar com 503 se DB indisponível
API_BASE=http://127.0.0.1:3001 npm run homolog:readiness
npm run homolog:m1
# O script homolog:m1 faz escritas: SOMENTE em HML autorizada
```

## Segurança HML
- Bind `127.0.0.1` — expor só via reverse proxy HTTPS autorizado
- `NODE_ENV=production` + `CORS_ORIGIN` obrigatório
- Rate limit em login e verify de carteirinha
- Storage privado: sem URL pública de arquivo

## Pendente (precisa aprovação)
- [ ] Provisionar VPS/Hostinger HML
- [ ] Certificado TLS + hostname
- [ ] Publicar base URL neste runbook
- [ ] Object storage gerenciado (S3-compat) em vez de disco local

## Fechamento e critérios de liberação
Ver `docs/backend-baseline-2026-11-06.md`. O health verifica processo; o ready exige PostgreSQL saudável. Não usar o GitHub Pages como prova de API em produção.
