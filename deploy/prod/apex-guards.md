# Travas de produção — portal apex

**Produção = `https://igrejadeusrf1.com.br` + `https://api.igrejadeusrf1.com.br`.**

## Proibido

1. `hosting_deploy` com `type: static` na raiz do monorepo (publica **código-fonte** → 403).
2. Ligar **Git auto-deploy** do Hostinger na `main` apontando para o repo.
3. Publicar `apps/web/out` gerado para **GitHub Pages** (`basePath=/igreja-deus-riacho-fundo-1`) no apex.
4. Publicar `out` de branch/SHA diferente do combinado sem smoke test.

## Obrigatório antes de publicar o portal

1. Confirmar auto-deploy desligado: `hosting_get-deployment` → `gitAutoDeployment` null.
2. Build apex a partir do SHA acordado (`origin/main` ou `production`):
   - `NEXT_PUBLIC_BASE_PATH=` (vazio)
   - `NEXT_PUBLIC_API_URL=https://api.igrejadeusrf1.com.br`
   - `NEXT_PUBLIC_HML_ENABLED=false`
3. Rodar `node deploy/prod/verify-apex-out.mjs apps/web/out <sha>`.
4. Publicar só o zip do `out` (arquivo estático), nunca o repo.
5. Smoke: `node deploy/prod/smoke-public.mjs` (site 200, sem 403, `release.json` SHA, API `/ready`).

## Se o site cair

1. Não republicar o monorepo.
2. Restaurar último zip apex conhecido + `smoke-public.mjs`.
3. Verificar se auto-deploy foi religado e desligar de novo.
