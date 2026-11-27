# Travas de produção — portal apex

**Produção = `https://igrejadeusrf1.com.br` + `https://api.igrejadeusrf1.com.br`.**

## Proibido

1. `hosting_deploy` com `type: static` na raiz do monorepo (publica **código-fonte** → 403).
2. Ligar **Git auto-deploy** do Hostinger na `main` apontando para o repo.
3. Publicar `apps/web/out` gerado para **GitHub Pages** (`basePath=/igreja-deus-riacho-fundo-1`) no apex.
4. Publicar `out` de branch/SHA diferente do combinado sem smoke test.

## Obrigatório antes de publicar o portal

1. Confirmar auto-deploy desligado: `hosting_get-deployment` → `gitAutoDeployment` null.
2. Build apex a partir do SHA acordado (`origin/main` ou `production`). **PowerShell apaga env vazia** — use o flag de apex, não `BASE_PATH=""`:
   ```powershell
   $env:IDBRF_STATIC_APEX = "1"
   $env:NEXT_PUBLIC_API_URL = "https://api.igrejadeusrf1.com.br"
   $env:NEXT_PUBLIC_HML_ENABLED = "false"
   $env:NEXT_PUBLIC_ADMIN_PRODUCTION = "true"
   ```
   - `IDBRF_STATIC_APEX=1` → `basePath` vazio (sem `/igreja-deus-riacho-fundo-1`)
   - `NEXT_PUBLIC_API_URL=https://api.igrejadeusrf1.com.br` (exato; sem barra final)
   - `NEXT_PUBLIC_HML_ENABLED=false`
   - **`NEXT_PUBLIC_ADMIN_PRODUCTION=true` (obrigatório)** — sem isso o botão **Entrar** fica desabilitado e a tela diz que o painel está indisponível (`isAdminEnabled()` em `apps/web/src/lib/admin-environment.ts`)
3. Rodar `node deploy/prod/verify-apex-out.mjs apps/web/out <sha>` — a verificação **falha** se o login estiver desabilitado no HTML.
4. Publicar só o zip do `out` (arquivo estático), nunca o repo. **Nunca** `hosting_deploy` na raiz do monorepo.
5. Smoke: `node deploy/prod/smoke-public.mjs` (site 200, sem 403, `release.json` SHA, API `/ready`) **e** abrir `/login/` — botão Entrar habilitado, sem texto “indisponível”.

## Login desabilitado (não confundir com API fora)

Sintoma: site abre, mas `/login/` mostra “O acesso ao painel está indisponível” / botão Entrar `disabled`.

Causa clássica: artefato apex buildado **sem** `NEXT_PUBLIC_ADMIN_PRODUCTION=true`, ou com `NEXT_PUBLIC_API_URL` diferente de `https://api.igrejadeusrf1.com.br`.

Correção: rebuild com as envs acima + `verify-apex-out.mjs` + republicar zip. Não reinicie a API nem mexa no banco por causa disso.

## Se o site cair

1. Não republicar o monorepo.
2. Restaurar último zip apex conhecido + `smoke-public.mjs`.
3. Verificar se auto-deploy foi religado e desligar de novo.
4. Se o HTML do login estiver “indisponível”, tratar como build apex incompleto (seção acima), não como queda da API.
