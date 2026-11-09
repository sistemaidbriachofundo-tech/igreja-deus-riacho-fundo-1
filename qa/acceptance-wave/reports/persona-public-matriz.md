# Matriz QA E2E por persona

Gerada em 2026-11-09T18:27:51.634Z. Contagens: **7 PASS**, **0 FAIL**, **0 BLOCKED**.

Uma linha PASS em tela de login não conta como módulo operacional. Jornadas que só encontraram o gate ficam FAIL ou BLOCKED, com o motivo explícito.

| Persona | Jornada | Resultado | ms | Detalhe |
|---|---|---|---:|---|
| PUBLICACAO | Rota /app/ sem sessão | PASS | — | A rota renderiza a tela de login. Esta evidência não aprova Secretaria, membros nem permissões. Evidência: `reports/evidence/public-app-login-gate-1440.png`. |
| PUBLICACAO | Rota /app/membros/ sem sessão | PASS | — | A rota renderiza a tela de login. Esta evidência não aprova Secretaria, membros nem permissões. Evidência: `reports/evidence/public-appmembros-login-gate-1440.png`. |
| PUBLICACAO | Rota /app/secretaria/ sem sessão | PASS | — | A rota renderiza a tela de login. Esta evidência não aprova Secretaria, membros nem permissões. Evidência: `reports/evidence/public-appsecretaria-login-gate-1440.png`. |
| PUBLICACAO | Login frio na publicação | PASS | 420 | O botão de entrar permanece desabilitado e a página avisa que nenhuma credencial será enviada. Evidência: `reports/evidence/public-login-1440.png`. |
| PUBLICACAO | Layout 1440px do gate em /app/secretaria/ | PASS | 1035 | Gate de login sem overflow horizontal (0px). Medição da tela de acesso, não do módulo. Evidência: `reports/evidence/public-secretaria-gate-1440.png`. |
| PUBLICACAO | Layout 360px do gate em /app/secretaria/ | PASS | 910 | Gate de login sem overflow horizontal (0px). Medição da tela de acesso, não do módulo. Evidência: `reports/evidence/public-secretaria-gate-360.png`. |
| PUBLICACAO | Layout 768px do gate em /app/secretaria/ | PASS | 982 | Gate de login sem overflow horizontal (0px). Medição da tela de acesso, não do módulo. Evidência: `reports/evidence/public-secretaria-gate-768.png`. |
