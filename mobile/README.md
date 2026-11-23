# Android DEV atualizado (23/11/2026)

Este APK deriva da branch de desenvolvimento `chatgpt/dev-finalizacao-escalas-visual-20261123` (PRs #237 → #272 → #273 → #274), **não da main antiga de 16/11**.

Identidade de teste: `ID Riacho 1 DEV`, pacote `br.com.igrejadeusrf1.dev`, para instalar lado a lado com o app anterior sem confundir versões. A API de teste é `https://id-riacho1-api-hml.vercel.app`. A compilação do app **não** publica ou migra banco, DEV, HML nem produção.

O GitHub Actions da branch `feature/mobile-dev-atualizado-20261123` gera o `app-debug.apk` e publica o artefato por 14 dias. O build falha se não encontrar os componentes da interface mais recente; a saída também inclui o SHA usado.

## Limites

APK de teste interno. O app web é empacotado via Capacitor. Login/MFA e demais funções exigem autorização de origem no backend HML (`http://localhost` para Android Capacitor) e teste em aparelho; a presença de uma tela não prova que a API ou permissões já estão homologadas. Recursos de push nativo ainda não foram implementados. Dados de QA apenas.

Instale preferencialmente lado a lado com o APK anterior: o novo aplicativo se chama **ID Riacho 1 DEV**. Não usar produção para testes de escrita.

Para detalhes da arquitetura, requisitos Android/iOS e geração local, consulte o PR #275 (base inicial da estrutura mobile).
