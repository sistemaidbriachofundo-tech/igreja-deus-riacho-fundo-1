# Ambientes e fluxo de publicação

## Onde validar

| Ambiente | Frontend | API | Uso |
| --- | --- | --- | --- |
| DEV | [Preview protegido na Vercel](https://id-riacho1-web-hml-git-92e3f7-gustavomarqueslopes-cmds-projects.vercel.app/#inicio) | [API QA na Vercel](https://id-riacho1-api-qa-gustavomarqueslopes-cmds-projects.vercel.app/ready) | Validar a branch da tarefa com dados de teste. |
| Homologação (HML) | [GitHub Pages](https://sistemaidbriachofundo-tech.github.io/igreja-deus-riacho-fundo-1/) | [API HML na Vercel](https://id-riacho1-api-hml.vercel.app/ready) | Validar a versão integrada publicada a partir de `main`, com dados sintéticos. |
| Produção | [igrejadeusrf1.com.br](https://igrejadeusrf1.com.br/) | [API de produção na Hostinger](https://api.igrejadeusrf1.com.br/ready) | Atender o público no domínio oficial e, quando liberada, disponibilizar a área administrativa. |

## Ordem de promoção

1. **Desenvolvimento → DEV.** Trabalhe em uma branch da tarefa e publique a candidata no preview de DEV. Registre no PR o link do preview, os SHAs do frontend e da API quando aplicável, e o resultado dos testes. Valide a mudança no preview e registre o aceite de DEV antes de mesclar.
2. **DEV aprovado → HML.** Mescle a candidata aprovada por PR em `main`. O push em `main` dispara o deploy do frontend no Pages via [CI](../.github/workflows/ci.yml). Para mudanças de backend, publique a versão aprovada no projeto da API HML pelo fluxo da Vercel e confirme o SHA em `/meta`. Valide a versão do Pages em `/release.json`, os endpoints `/health` e `/ready`, o acesso com conta sintética e os fluxos afetados. Registre o aceite de HML com as versões verificadas.
3. **HML aprovado → Produção.** Abra o PR da candidata aprovada para `production` e confira o diff antes do merge. Siga o [pipeline de produção](prod-pipeline.md), com checks, Sonar e aprovação do Environment `production`. Use a configuração de produção no build e publique os artefatos aprovados na Hostinger. Confirme o SHA do frontend em `/release.json`, o ambiente e o SHA da API em `/meta` e o banco em `/ready`. Verifique o domínio público e os fluxos liberados para a versão. Registre a versão anterior para reversão.

A aprovação de DEV libera a entrada em `main`. A aprovação de HML libera o encaminhamento da candidata para produção. Cada aprovação deve identificar as versões de frontend e API efetivamente testadas.

## Conferência de 13/11/2026

| Ambiente | Frontend verificado | API verificada | Área administrativa |
| --- | --- | --- | --- |
| DEV | Preview Vercel `READY` no SHA `9e4ce7a` da branch `feat/ux-session-loading-20261112`. Página inicial e `/app/` responderam com acesso Vercel. | O build aponta para a API QA. `/health` OK e `/ready` com banco OK. Commit `5e3395d8d500`. | `/app/` respondeu. Jornada com conta de teste pendente. |
| HML | O [manifesto do Pages](https://sistemaidbriachofundo-tech.github.io/igreja-deus-riacho-fundo-1/release.json) confirma `75d47a5` e a origem da API HML. Deploy e smoke passaram no [CI de main](https://github.com/sistemaidbriachofundo-tech/igreja-deus-riacho-fundo-1/actions/runs/43351803177). | `/health` OK e `/ready` com banco OK. Commit `ffb7219ac5f3`. | `/app/` exibe o formulário de login. Jornada com conta de teste pendente. |
| Produção | O domínio público responde. O [manifesto de produção](https://igrejadeusrf1.com.br/release.json) confirma `75d47a5` e a origem da API de produção. | `/health` OK, `/ready` com banco OK e `/meta` com `stage=production`. SHA da API ausente em `/meta` e `/ready`. | `/app/` informa que o acesso ao painel está indisponível. `/auth/me` da API respondeu `401` sem sessão. |

Na conferência, `main` estava em `75d47a5` e a branch `production` em `49f33bf`. O [comparativo entre as branches](https://github.com/sistemaidbriachofundo-tech/igreja-deus-riacho-fundo-1/compare/production...main) apontou divergência. Para a próxima promoção, confira o diff e reconcilie o histórico por PR, preservando as regras de produção. Confirme o SHA da API no ambiente Hostinger e valide o acesso ao painel se ele fizer parte da liberação.
