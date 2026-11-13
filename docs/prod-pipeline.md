# Pipeline de produção (Hostinger)

Este documento descreve como gerar e liberar uma candidata para `igrejadeusrf1.com.br`. Consulte o [fluxo DEV → HML → Produção](ambientes.md) e os [critérios de liberação](liberacao-producao.md).

## Branches

| Branch | Papel |
|--------|--------|
| Branch da tarefa | Candidata de DEV no preview Vercel com API QA |
| `main` | Integração e publicação automática do frontend em HML (GitHub Pages) |
| `production` | **Única** branch autorizada a gerar candidato de produção |

Regras:

1. Ninguém faz commit direto em `production` (só PR com review).
2. Aceite em DEV antes do merge em `main`. PR para `production` após aceite da candidata em HML (Pages + API HML).
3. Merge em `production` dispara o workflow **Production** (lint → typecheck → test → build → segurança → **Sonar hard gate**).
4. O job `promote-ready` usa o Environment GitHub **`production`** (aprovação manual). **Não** altera DNS.

## Sonar de produção

| Item | CI (`main`) | Produção (`production`) |
|------|-------------|-------------------------|
| Workflow | `.github/workflows/ci.yml` | `.github/workflows/production.yml` |
| Token | Environment `SONAR_TOKEN` | Environment `SONAR_TOKEN` |
| Gate | Soft / skip se token ausente | **Obrigatório** — falha sem token |
| Quality Gate | Não espera | `sonar.qualitygate.wait=true` |

Config base: `sonar-project.properties` (mesmo projeto SonarCloud).  
No SonarCloud, mantenha o Quality Gate padrão (ou um gate “Production”) associado ao projeto `sistemaidbriachofundo-tech_igreja-deus-riacho-fundo-1`.

## Pipeline (resumo)

```
PR → production
  → Lint / Typecheck / Test (Postgres CI)
  → Build API + Web (apex, HML_ENABLED=false)
  → Segurança F1.1 + npm audit high+
  → SonarCloud + Quality Gate (bloqueante)
  → (push) Environment production → artefato + preflight opcional
  → Checklist humano → deploy Hostinger → DNS (só com GO)
```

## Setup humano (uma vez)

### GitHub

1. **Settings → Branches → Add rule** para `production`:
   - Require a pull request before merging
   - Require status checks: `Lint`, `Typecheck`, `Test`, `Build (candidato produção)`, `Segurança F1.1`, `SonarCloud (gate produção)`
   - Restrict who can push (sem force push)
2. **Settings → Environments → `production`**:
   - Required reviewers (você / dono do projeto)
   - (Opcional) wait timer
3. Confirmar Environment **`SONAR_TOKEN`** com secret `SONAR_TOKEN` (já usado pelo CI).
4. **Variables** (repo ou Environment `production`):
   - `PRODUCTION_API_URL` — ex. `https://api.igrejadeusrf1.com.br`
   - `PRODUCTION_WEB_URL` — ex. `https://igrejadeusrf1.com.br`

### SonarCloud

1. Projeto já importado com a org `sistemaidbriachofundo-tech`.
2. Quality Gate ativo (condições de bugs/vulnerabilidades/coverage conforme política da igreja).
3. Branches long-lived: incluir `production` se o plano Sonar exigir.

## Como promover um release

1. Validar candidata em HML (Pages + API HML) — ver `docs/liberacao-producao.md`.
2. Abrir PR com a versão aprovada em HML como candidata a `production` e conferir o diff com a branch de destino. Registrar os SHAs de origem do frontend e da API.
3. Esperar workflow **Production** verde + Sonar OK.
4. Merge; no Environment `production`, **aprovar** o job `promote-ready`.
5. Baixar artefato `production-candidate-<sha>`.
6. Preencher `deploy/prod/secrets-checklist.md` na VPS (sem colar secrets no chat).
7. Fazer deploy controlado na Hostinger e executar o smoke com a configuração de produção.
8. Rodar `npm run release:preflight` com as origens de produção e o SHA completo da API publicada. Conferir também `/release.json` no frontend.
9. Alterar DNS ou CDN somente se a publicação exigir um novo apontamento e houver autorização. Registrar a versão publicada e o resultado do smoke.

## O que este trilho NÃO faz

- Não registra nem altera DNS Hostinger
- Não importa dados reais de membros
- Não reutiliza secrets de HML/Vercel
- Não faz seed em produção (`SEED_ON_BOOT` deve permanecer desligado)
