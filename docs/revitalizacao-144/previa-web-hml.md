# Prévia web HML — diagnóstico do deployment bloqueado

Epic #144, integrador #172. Baseline `6c43aea96ad3fe24ec1ed2c09f717963fb289c62`. A prévia **não está pronta**: não há deployment `READY`, a URL não foi aberta por uma conta autorizada e o responsável ainda não aceitou a tela.

Este passo não desligou SSO, não mudou permissão, não leu nem gravou segredo, não fez deploy e não entrou na `main`.

## O que foi lido

Sonda gravada em [`previa-web-hml.probe.json`](previa-web-hml.probe.json) às 2026-11-10T16:33:46Z, sem token:

| Leitura | Resultado |
| --- | --- |
| `GET https://id-riacho1-web-hml.vercel.app/` | HTTP 503, `x-vercel-error: DEPLOYMENT_PAUSED`, corpo `The deployment is currently unavailable` / `DEPLOYMENT_PAUSED`. Sem `401` e sem redirecionamento de SSO. |
| `GET https://api.vercel.com/v13/deployments/dpl_J3zExHhufmJ8DtwZQiKvmVLnn8ju?teamId=team_CMNbcFRquQfcR2yWEO7UbsOS` | HTTP 403, `missingToken: true`. `readyState`, `errorMessage` e logs de build continuam invisíveis daqui. |
| `GET https://id-riacho1-api-hml.vercel.app/health` | HTTP 200 no mesmo intervalo. A API HML está no ar. A pausa é do alias da web. |
| Commit `6c43aea96ad3fe24ec1ed2c09f717963fb289c62` | Autor GitHub `sistemaidbriachofundo-tech` (id `352435434`), e-mail `sistemaidbriachofundo@gmail.com`. Committer `web-flow` / `noreply@github.com`, merge do PR #167. Repositório público. |
| GitHub Actions do mesmo SHA | Publica só GitHub Pages. Não existe workflow deste repositório para `id-riacho1-web-hml`. |
| `apps/web` | Não há `vercel.json`. O `basePath` fica vazio quando `NEXT_PUBLIC_BASE_PATH=""`. O export é `apps/web/out` e depende de `@idbrf/shared` compilado. `@idbrf/db` entra só no `prisma generate` do monorepo; a prévia não migra e não semeia. |

A issue registra o deployment `dpl_J3zExHhufmJ8DtwZQiKvmVLnn8ju` como `BLOCKED`, sem logs de build. Isso combina com recusa **antes** do builder. O alias público, porém, mostra `DEPLOYMENT_PAUSED`, que a documentação da Vercel (10/08/2026) atribui a pausa manual, limite de gasto, conta, cota, fair use ou incidente. Como a API HML respondeu 200, não é queda geral da plataforma.

A documentação de Hobby exige que o autor do commit seja o dono do time, conferido em Login Connections. O autor deste SHA já é o dono do GitHub. Se o login da Vercel for outro, o Hobby bloqueia sem build. Se o login for este, a mensagem do deployment aponta outra causa. Sem o `errorMessage`, as duas continuam abertas. Não vou trocar permissão para testar uma delas.

Commits de `cursoragent@cursor.com` na branch de integração não são o autor deste merge. Eles voltam a importar quando a prévia for construída a partir de um commit do agente: no Hobby, esse autor não passa na mesma verificação. Não convidar esse autor e não mudar o plano daqui.

## Controle humano

Quem executa é uma conta do time `team_CMNbcFRquQfcR2yWEO7UbsOS`. Nada disto foi feito por este repositório.

1. Abrir o projeto `id-riacho1-web-hml` (`prj_apLd6QGDRLNUBWF6BsFAI7s72Uai`) e o deployment `dpl_J3zExHhufmJ8DtwZQiKvmVLnn8ju`. Copiar `readyState`, `errorCode`, `errorMessage`, a quantidade de linhas de build, o repositório Git conectado, a Production Branch e o estado de Vercel Authentication. Não mudar nenhum desses controles nessa leitura. O SSO permanece em todos os deployments.
2. Agir só conforme a mensagem:
   - autor Git / Hobby: conferir se Login Connections do dono é o GitHub `sistemaidbriachofundo-tech` e se `sistemaidbriachofundo@gmail.com` está na conta. Não convidar `cursoragent@cursor.com`, não mudar o plano e não desligar a verificação de autor;
   - gasto, cota ou pausa: tratar no Spend Management e no e-mail da Vercel;
   - Git conectado diferente de `sistemaidbriachofundo-tech/igreja-deus-riacho-fundo-1`: parar e confirmar antes de reconectar.
3. Aplicar à mão, só nesse projeto web, os comandos de [`deploy/hml/web-preview.project.json`](../../deploy/hml/web-preview.project.json). O arquivo está com `apply: false`. Não aplicar no projeto `id-riacho1-api-hml`.
4. Não criar deployment e não promover `main`. A branch de prévia `previa/rf1-v1` só nasce depois das frentes #169, #170 e #171, com commit do dono do time. O script recusa `VERCEL_ENV=production` e `VERCEL_GIT_COMMIT_REF=main`.

## Caminho de build, sem deploy

Raiz do monorepo, install `npm ci`, build `bash scripts/hml/web-preview-build.sh`, saída `apps/web/out`, Node 22.

O script compila `@idbrf/shared`, gera o client Prisma com uma URL local falsa e compila `@idbrf/db`. Em seguida exporta o Next com:

- `NEXT_PUBLIC_BASE_PATH=""`
- `NEXT_PUBLIC_HML_ENABLED=true`
- `NEXT_PUBLIC_RIACHINHO_PUBLIC_ENABLED=false`
- `NEXT_PUBLIC_PORTAL_LIVE_ENABLED=false`
- `NEXT_PUBLIC_API_URL` ausente

`release.json` desse export fica em `channel=vercel-hml`, com o SHA do commit, `phase=EM_EXECUCAO` e `ready=false`. O push da `main` no GitHub Pages continua em `channel=github-pages` e não usa este script.

O script sai com código 2 se o projeto não for `id-riacho1-web-hml`, se houver `DATABASE_URL` ou segredo de API, ou se alguém pedir seed, migration, SSO desligado ou escrita remota. O valor do segredo não é impresso.

A API de prévia fica desligada de propósito. `id-riacho1-api-hml` é outro projeto, com banco `idriacho1_hml` e dados sintéticos já existentes; esta onda não aponta a prévia para ele e não mexe em `CORS_ORIGIN`. Quando existir uma URL `READY` e o responsável autorizar a conversa com essa API sintética, a origem HTTPS exata da prévia entra no `CORS_ORIGIN` só da API HML. Até lá o navegador da prévia não chama API.

## Integração da onda, sem merge

Partir de `6c43aea96`. Não reabrir os PRs #156–#167. O PR #168 continua draft e fora desta integração.

| Frente | Issue | Arquivos | Fora do alcance |
| --- | --- | --- | --- |
| Portal | #169 | `apps/web/src/app/page.tsx`, `a-igreja`, `eventos`, `login`, `LoginScreen` e o chat público | `AppShell`, `PersonaHome`, `ChurchDashboard`, `persona-navigation`, API, banco |
| Admin | #170 | `AppShell`, `PersonaHome`, `ChurchDashboard` e os CSS desses três | portal, login, API, banco, GitHub Pages |
| QA | #171 | `qa/` e `docs/qa/` | telas, API, banco, configuração de deploy |

O integrador fica com `next.config.ts`, `paths.ts`, `persona-navigation.ts`, o workflow de CI e os arquivos `web-preview` desta entrega. Conflito nesses caminhos resolve só na branch `previa/rf1-v1`, nunca na `main`.

Ordem: o inventário da #171 informa a limpeza; #169 e #170 seguem em paralelo nos arquivos acima; o integrador junta as três nessa branch de prévia depois do QA estático. A suíte visual autenticada da #171 permanece `BLOCKED` enquanto o alias responder `DEPLOYMENT_PAUSED`. Não marcar a fase pronta quando o build local passar.

`node scripts/hml/web-preview-diagnose.mjs` regrava a sonda pública. `npm run hml:web-preview:check` só valida a trava local.
