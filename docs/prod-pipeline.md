# Pipeline de produção (Hostinger)

Este documento define o **trilho** antes de qualquer corte de DNS em `igrejadeusrf1.com.br`.  
Não publica o site sozinho. Complementa `docs/liberacao-producao.md`.

## Branches

| Branch | Papel |
|--------|--------|
| `main` | Integração + preview GitHub Pages + API HML |
| `production` | **Única** branch autorizada a gerar candidato de produção |

Regras:

1. Ninguém faz commit direto em `production` (só PR com review).
2. PR para `production` só depois de verde em HML (`main` / Pages + API HML).
3. Merge em `production` dispara o workflow **Production** (lint → typecheck → test → build → segurança → **Quality Gate do SonarCloud obrigatório**).
4. O job `promote-ready` usa o Environment GitHub **`production`** (aprovação manual). **Não** altera DNS.

## Sonar de produção

| Item | CI (`main`) | Produção (`production`) |
|------|-------------|-------------------------|
| Workflow | `.github/workflows/ci.yml` | `.github/workflows/production.yml` |
| Token | Environment `SONAR_TOKEN` | Environment `SONAR_TOKEN` |
| Gate | Soft / skip se token ausente | **Obrigatório** — falha sem token |
| Quality Gate | Envia análise de `main` | Exige árvore idêntica a `main` e Quality Gate OK da análise do commit exato |

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
2. Abrir PR: `main` (ou tag) → `production` com SHA conhecido.
3. Esperar workflow **Production** verde + Sonar OK.
4. Merge; no Environment `production`, **aprovar** o job `promote-ready`.
5. Baixar artefato `production-candidate-<sha>`.
6. Preencher `deploy/prod/secrets-checklist.md` na VPS (sem colar secrets no chat).
7. Deploy controlado (Docker/Traefik) **sem** apontar apex até smoke interno OK.
8. Rodar `npm run release:preflight` com as três env vars de origem/SHA.
9. Só então DNS / CDN — com autorização explícita.

## O que este trilho NÃO faz

- Não registra nem altera DNS Hostinger
- Não importa dados reais de membros
- Não reutiliza secrets de HML/Vercel
- Não faz seed em produção (`SEED_ON_BOOT` deve permanecer desligado)
