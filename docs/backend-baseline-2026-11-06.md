# Backend ID Riacho 1 — Baseline de consolidação e critérios de liberação
**Data:** 2026-11-06 · **Projeto:** Igreja de Deus — Riacho Fundo I · **Objetivo:** encerrar a base backend antes de expandir módulos.

## Parecer
**Pronto para estabilização / homologação controlada; NÃO pronto para uso com dados pessoais reais.**

O repositório contém uma API NestJS modular, Postgres/Prisma, migrações, autenticação JWT, RBAC, escopo organizacional e por congregação, auditoria, publicações e testes automatizados. Isso é **código implementado**, não evidência de uma API pública instalada.

**O GitHub Pages publica só arquivos estáticos** e não executa NestJS, Prisma, Postgres ou autenticação de servidores. O botão "Login" do portal leva à prévia administrativa do ID Riacho 1; grande parte dela usa estado sintético local. O estúdio editorial possui código de autenticação por API condicionado à configuração. Não afirmar que o login público é funcional até homologá-lo na API.

## Inventário de módulos e escopo
| Fluxo | Código | Evidência / limite |
| --- | --- | --- |
| IAM | `apps/api/src/auth` | JWT HMAC/Argon2id + guards de papéis e escopo; sem OIDC/MFA/refresh/revogação |
| Pessoas/famílias | `persons`, `households`, `memberships` | inclui responsável de menor e piloto RF1 |
| Secretaria | `admissions`, `transfers`, `letters` | aprovações por etapa, documentos privados e cartas |
| Carteirinhas | `credentials` | elegibilidade pastoral, QR opaco e revogação |
| Cuidado | `pastoral`, `discipleship`, `groups` | proteção via autorizações; fluxos precisam de HML com perfis |
| Ministérios | `ministries` | equipes/escalas/atribuições; não é o sistema Kairos |
| Portal/CMS | `cms`, `events`, `public-portal`, `volunteers` | status de publicação + projeção pública limitada |
| Auditoria | `audit` | eventos registrados; política de retenção e revisão ainda pendentes |
| DB | `packages/db/prisma` | migrações + seed fictício; não há DB HML/PRD verificado |
| Contratos | `packages/shared/openapi/f2-v0.2.yaml`, `/meta` | conferir versão viva e compatibilidade FE/BE |

O módulo de finanças e canais/IA permanece fora do escopo deste fechamento. **Não misturar** os dados do Kairos ou da Conferência ONE.

## Verificações técnicas efetuadas nesta consolidação
- Criada rota **GET /ready** (pública), separada de GET /health: só retorna HTTP 200 se o PostgreSQL responder; em falha devolve 503.
- Endurecida validação de JWT: algoritmo HS256 explícito, assinatura HMAC, expiração obrigatória e válida, iat e claims mínimas; testes negativos para token sem expiração, expirado e algoritmo não permitido.
- Incluído smoke **não destrutivo** `npm run homolog:readiness` com `API_BASE` explícita: /health, /ready, /meta e /auth/me (401 sem token). Não é prova de fluxo de negócio.
- Não houve migração, acesso a dados reais, criação de usuário real ou implantação de HML.

## Pendências bloqueantes para operação real
1. **Ambiente HML protegido**: escolher e provisionar infraestrutura de API + PostgreSQL privado, HTTPS, domínio e proxy. `docs/hml-runbook.md` ainda contém URL **TBD**. Não expor API para dados reais antes da homologação.
2. **Configuração segura**: segredo JWT aleatório, CORS das origens reais, credenciais DB próprias, gestão de secrets, política de logs e segregação HML/PRD; proteger dados sob LGPD.
3. **Testes fim a fim contra HML** com dados sintéticos: autenticar perfis (secretaria, pastor, membro); conferir 401/403; cadastro, admission steps, QR, documentos, consentimento de responsáveis, CMS/voluntariado e auditoria. Usar `npm run homolog:m1` somente na HML autorizada (faz escritas).
4. **Persistência e continuidade**: backup agendado e restauração demonstrada para **banco e documentos**, criptografia e armazenamento privado, política de retenção, monitoramento/alertas, plano de rollback. O script atual de restore é smoke de DEV, não plano de backup PRD.
5. **Autenticação operacional**: definir gestão de contas, reset de senha, MFA para privilegiados, expiração e revogação de sessões. O JWT atual carrega papéis por até 1h; não implementa revogação antecipada.
6. **Integração FE/BE**: trocar os painéis sintéticos por chamadas API autenticadas respeitando escopo; garantir estados vazio/erro e não exibir dados fictícios como oficiais. `NEXT_PUBLIC_API_URL` e `NEXT_PUBLIC_PORTAL_LIVE_ENABLED` só liberar após HML e curadoria dos conteúdos.
7. **Go-live**: aprovação da liderança sobre perfis de acesso, política de privacidade e dados de membros/menores, e checklist operacional assinado antes de PRD.

## Checklist de aceite (GO / NO-GO)
- [ ] HML HTTPS com `GET /health` e `GET /ready` aprovados
- [ ] Migrações aplicadas em HML; seeds demonstrativos **somente** HML
- [ ] `npm run homolog:readiness` aprovado com URL HML
- [ ] `npm run homolog:m1` aprovado com casos positivos e negativos
- [ ] Perfis reais e política de permissões homologados pela igreja
- [ ] Dados, documentos e banco com backup criptografado e restore testado
- [ ] Monitoramento/alerta e plano de retorno à versão anterior configurados
- [ ] Autenticação reforçada, LGPD e segregação HML/produção aprovadas
- [ ] Frontend consumindo API HML com estados corretos; no PRD sem demo
- [ ] Testes CI: lint, typecheck, testes, build e quality gate aprovados
- [ ] Endereço de API PRD e autorização expressa de entrada em operação

**Critério de decisão:** só chamar de **Backend PRONTO PARA PRODUÇÃO** se todos os itens acima estiverem concluídos e houver evidência de HML/PRD funcionando. Até lá, a base está **em consolidação para homologação**, não em produção.

## Comandos para HML (quando provisionada)
```bash
# Consultas não destrutivas — exige URL HML autorizada
API_BASE=https://api-hml.exemplo.org npm run homolog:readiness

# Homologação funcional — cria registros fictícios em HML; NÃO executar em PRD
API_BASE=https://api-hml.exemplo.org npm run homolog:m1
```

## Limitação independente: GitHub Pages
No CI do commit `0a0d764`, lint, typecheck, testes, build e SonarCloud passaram, mas o job **Deploy GitHub Pages falhou** após ficar em `deployment_queued`. Ver workflow [42268318600](https://github.com/sistemaidbriachofundo-tech/igreja-deus-riacho-fundo-1/actions/runs/42268318600). Isso é incidente de deploy estático do frontend e deve ser fechado separadamente; não é evidência de indisponibilidade da API.
