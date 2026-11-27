# Teste de vulnerabilidade da API — 26/11/2026

Escopo: API NestJS (`apps/api`), banco Postgres (`packages/db`), VPS de produção Hostinger
(187.53.108.135, firewall 399696) e HML (`https://id-riacho1-api-hml.vercel.app`).
Método: revisão de código (guards, RBAC, finanças, uploads, Vivi), `npm audit`, testes dinâmicos
na HML sem credencial privilegiada e leitura da configuração da VPS.

Correções de código: commit `5502ad0` no `main`.

## Achados e status

| Severidade | Achado | Status |
|---|---|---|
| Crítico | Segredos de produção em texto puro no compose da Hostinger e expostos em histórico de conversa (JWT, PII, blob, DB, superusuário) | Senhas do Postgres (superusuário e `idbrf_app`) rotacionadas em 26/11 22:15 UTC. JWT, blob, webhook e observabilidade: pendente (plano abaixo). Chave PII: só com plano de recriptografia |
| Crítico | Webhook de pagamento de evento aceitava segredo de mock quando `EVENT_PAYMENT_WEBHOOK_SECRET` faltava | Corrigido no `main`: sem segredo de 32+ caracteres a rota responde 404 |
| Alto | SSH root com senha aberto para qualquer IP | Pendente (etapa D) |
| Alto | API de produção clonava `main` e recompilava a cada restart | Mitigado: compose passou a executar o build existente no volume. Fixar em SHA: pendente |
| Alto | Dependências: `effect` (ReDoS, via Prisma), `nodemailer`, `sharp` | Corrigido: `effect` 3.22.5 por override; `nodemailer` 10.5.0 e `sharp` 0.35.5 já sem alerta. `npm audit --omit=dev`: 0 |
| Alto | Estorno de lançamento aprovado por uma pessoa só | Corrigido: estorno nasce `PENDING_APPROVAL`; o original só vira `REVERSED` na segunda aprovação, por aprovador distinto |
| Alto | Líder de um ministério operava cursos da igreja inteira | Corrigido: cursos da igreja exigem grant sem `ministryId` |
| Alto | Senha temporária enviada em conversa | Trocar no primeiro login (responsabilidade do titular) |
| Médio | `/indicators` aberto a qualquer autenticado | Corrigido: `summary` para secretaria, pastor, admin e líder; `membership` sem líder |
| Médio | Confirmação manual de pagamento de evento permitida a líder de ministério | Corrigido: secretaria, pastor e admin |
| Médio | Vivi usava `X-Forwarded-For` cru para limitar uso | Corrigido: IP via `trust proxy` (`clientAddress`) |
| Médio | Vivi só checava injeção de prompt na última mensagem | Corrigido: checa todo o histórico enviado pelo cliente |
| Médio | Token de push reatribuído a outra pessoa sem confirmação | Risco aceito: exige o token FCM do aparelho; aparelho compartilhado é caso legítimo |
| Médio | Isolamento multi-igreja incompleto | Aceito no piloto (uma igreja); rever antes de abrir para outras |
| Médio | Gemini gratuito na HML (dados podem treinar modelo) | Só dados sintéticos na HML; em produção usar plano pago ou desligar |
| Médio | Upload confia no MIME do cliente | Mitigado por `Content-Disposition: attachment`, `nosniff` e CSP |
| Baixo | `/meta` lista todas as rotas | Aceito (sem dados sensíveis) |
| Baixo | Corpo acima do limite devolvia 500 | Corrigido: devolve 413 |
| Baixo | Traefik em `:latest` | Pendente (etapa D) |

Achado descartado: conciliação bancária já tinha dupla aprovação.

## Verificado e OK

- Força bruta no login: 429 após 8 tentativas; trocar `X-Forwarded-For` não contorna.
- JWT com `alg: none` rejeitado; algoritmo fixo e comparação em tempo constante.
- Vivi descarta mensagens `system` vindas do cliente.
- CORS recusa origem desconhecida; HSTS e cabeçalhos de segurança presentes.
- Portas de Postgres, Grafana e Prometheus fechadas externamente; HTTP redireciona para HTTPS.
- Painel do Traefik desligado.
- Produção recusa subir sem `TRUST_PROXY`, MFA bloqueante, estado de auth durável, CORS HTTPS
  e token de blob privado separado.

## Pendências de infraestrutura

### Rotação de segredos (cada passo com aprovação)

1. `JWT_SECRET`: gerar 64 bytes aleatórios, trocar no compose e reiniciar. Derruba todas as
   sessões; avisar a equipe antes.
2. Tokens de blob (público e privado): gerar novos no provedor, trocar e revogar os antigos.
3. `EVENT_PAYMENT_WEBHOOK_SECRET`: trocar junto com o cadastro no provedor de pagamento.
4. Token de observabilidade: trocar no compose da API e no `idbrf-monitor`.
5. `PII_ENCRYPTION_KEY`: não trocar direto. Exige script que leia com a chave antiga e regrave
   com a nova, testado na HML, com backup verificado antes.

Nunca reaproveitar segredos ou banco da HML em produção. `SEED_ON_BOOT` fica desligado.

### VPS

- SSH só por chave (`PasswordAuthentication no`, `PermitRootLogin prohibit-password`) e,
  se possível, porta 22 liberada só para IPs conhecidos no firewall 399696.
- API de produção fixada em SHA ou imagem, sem clone de `main` no boot.
- Traefik com versão fixa em vez de `:latest`.
