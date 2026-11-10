# Checklist do integrador — RF1/V1-C

Esta frente não altera tela, API, banco, contrato nem deploy. Os itens abaixo são evidência para quem for integrar.

- Não reutilizar PASS da #153. Aquela execução leu o SHA 3c7375c.
- Não tratar esta matriz como homologação humana.
- Não apagar o assistente interno de SiteManager junto com o chat público.
- Não apagar MemberDirectory, ChurchSecretary ou ChurchDashboard sem atualizar os testes que ainda exigem o ramo local.
- Não imprimir senha, token ou corpo de /auth/login em PR ou comentário.
- Repetir a suíte quando a prévia `id-riacho1-web-hml` estiver READY: `QA_RUN_EXTERNAL=1 QA_PAGES_URL=<prévia> npm run audit` dentro de `qa/rf1-v1c`.
- A senha HML, se existir, entra só por `QA_DEMO_PASSWORD` no ambiente local. Não versionar.

## Itens abertos

| ID | Resultado | Prioridade | O que a evidência mostra |
|---|---|---|---|
| RF1-PREVIEW | BLOCKED | P0 | O alias não está READY. A regressão visual desta rodada usa o Pages oficial do mesmo SHA. |
| RF1-HOME-PAGINA | FAIL | P0 | A home tem seções, mas o menu abre documentos separados. |
| RF1-HOME-IA | FAIL | P0 | O lançador do Riachinho está no DOM do Pages oficial. |
| RF1-HOME-EXTRA | FAIL | P1 | Há rotas públicas 200 além do roteiro. |
| RF1-HOME-CONTRASTE | FAIL | P1 | A pior amostra ficou abaixo do mínimo WCAG para o tamanho lido. |
| RF1-TOQUE | FAIL | P2 | Há botão visível abaixo de 44 px. |
| RF1-LOGIN-TEXTO | FAIL | P0 | A frase continua visível na tela publicada. |
| RF1-LOGIN-SAIDA | BLOCKED | P1 | A fala não nomeia a tela de destino e a sessão não abriu para clicar em Sair. |
| RF1-ADM-VISUAL | BLOCKED | P0 | PersonaHome só renderiza a mesa com sessão. Não houve captura autenticada. |
| RF1-ADM-LENTIDAO | BLOCKED | P1 | O tempo do painel autenticado não foi medido. |
| RF1-ADM-BARRA | FAIL | P1 | O shell publicado mostra mais de um botão Sair antes mesmo da sessão confirmada. |
| RF1-PES-FICHA | BLOCKED | P0 | Não houve leitura nem recarga da ficha. Nenhum dado foi alterado. |
| RF1-PES-CTA | FAIL | P0 | O componente montado no build oficial junta as duas ações num botão só. |
| RF1-CRD-ABRIR | BLOCKED | P0 | A rota caiu no gate de login. Nenhum PDF foi baixado e nenhuma credencial foi revogada. |
| RF1-CRD-409 | BLOCKED | P1 | Não houve reprodução autenticada de um 409. |
| RF1-MIN-CONTEXTO | BLOCKED | P0 | O catálogo autenticado não foi percorrido. |
| RF1-MIN-SUPERFICIE | FAIL | P0 | O rótulo ou o título DAS continuam no código publicado. |
| RF1-MBR-MENU | FAIL | P0 | Meu Espaço entra no menu de quem administra, não só no menu do membro. |
| RF1-EDI-SIMULADO | FAIL | P0 | A página pública mostra papel simulado. |
| RF1-EDI-TECNICO | FAIL | P0 | Ainda há superfície técnica no host oficial. |
| RF1-AUTH | BLOCKED | P0 | Nenhuma conta do seed versionado abriu sessão. O segredo HML não está neste agente e a senha não foi resetada. |
| RF1-LIMPEZA | FAIL | P1 | O inventário encontrou rotas que a diretriz manda retirar. Esta frente não apaga arquivo de produto. |
