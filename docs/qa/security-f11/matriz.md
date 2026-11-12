# Matriz F1.1-D

- Decisão: **NAO LIBERAR**
- SHA da árvore: `31d3158c7619bbc4c9d24fd9b94e43ef056ab80e`
- SHA candidato: `31d3158c7619bbc4c9d24fd9b94e43ef056ab80e`
- Coleta: 2026-11-11T20:06:26.696Z
- Estático: 13 PASS, 20 FAIL, 0 BLOCKED
- E2E de deploy nesta matriz estática: 33 BLOCKED. Nenhum PASS estático autoriza produção.

## HTTP da origem allowlist

- Origem: https://id-riacho1-api-hml.vercel.app
- O sourceSha da origem é `6c43aea96ad3fe24ec1ed2c09f717963fb289c62`, diferente do candidato. Os status abaixo descrevem essa origem e não aceitam o SHA candidato.
- Abortado: não
- Comparação das duas falhas sintéticas: PASS. As duas senhas inválidas da conta sintética inexistente devolveram o mesmo corpo.

| ID | Pedido | Status | Veredito | Nota |
| --- | --- | --- | --- | --- |
| E2E-META | GET /meta | 200 | PASS | — |
| E2E-HEALTH | GET /health | 200 | PASS | — |
| E2E-READY | GET /ready | 200 | PASS | — |
| E2E-401-ME | GET /auth/me | 401 | PASS | — |
| E2E-401-PERSON | GET /persons/pessoa-sintetica | 401 | PASS | — |
| E2E-401-PASTORAL | GET /pastoral-cases | 401 | PASS | — |
| E2E-401-LEDGER | GET /ledger/accounts | 401 | PASS | — |
| E2E-401-AUDIT | GET /audit-logs | 401 | PASS | — |
| E2E-401-REFRESH | POST /auth/refresh | 401 | PASS | — |
| E2E-401-SWITCH | POST /auth/switch-church | 401 | PASS | — |
| E2E-LOGIN-UNKNOWN | POST /auth/login | 401 | PASS | — |
| E2E-LOGIN-UNKNOWN-2 | POST /auth/login | 401 | PASS | — |
| E2E-QR-SHORT | GET /credentials/verify/curto | 500 | FAIL | — |
| E2E-CORS | GET /health | 200 | PASS | — |

| ID | Sev. | Superfície | Estático | E2E deploy | Evidência |
| --- | --- | --- | --- | --- | --- |
| F11-MFA-01 | P0 | autenticacao | FAIL | BLOCKED | `apps/api/src/auth/auth.service.ts:128` |
| F11-MFA-02 | P0 | autenticacao | FAIL | BLOCKED | `apps/api/src/auth/auth.service.ts:169` |
| F11-MFA-03 | P1 | autenticacao | FAIL | BLOCKED | `apps/api/src/auth/mfa/mfa.controller.ts:40` |
| F11-MFA-04 | P1 | autenticacao | FAIL | BLOCKED | `apps/api/src/auth/mfa/mfa.service.ts:109` |
| F11-MFA-05 | P1 | autenticacao | FAIL | BLOCKED | `apps/api/src/auth/mfa/mfa-crypto.util.ts:39` |
| F11-JWT-01 | P0 | sessao | FAIL | BLOCKED | `apps/api/src/auth/auth.service.ts:239` |
| F11-JWT-02 | P0 | sessao | FAIL | BLOCKED | `apps/api/src/auth/auth.controller.ts:25` |
| F11-JWT-03 | P1 | sessao | PASS | BLOCKED | `apps/api/src/auth/auth.service.ts:413` |
| F11-JWT-04 | P2 | sessao | PASS | BLOCKED | `apps/api/src/auth/auth.service.ts:84` |
| F11-ENUM-01 | P2 | autenticacao | FAIL | BLOCKED | `apps/api/src/auth/auth.service.ts:76` |
| F11-RATE-01 | P0 | abuso | FAIL | BLOCKED | `apps/api/src/common/simple-rate-limit.middleware.ts:12` |
| F11-RATE-02 | P1 | abuso | FAIL | BLOCKED | `apps/api/src/app.module.ts:85` |
| F11-CORS-01 | P1 | borda | FAIL | BLOCKED | `apps/api/src/main.ts:33` |
| F11-HDR-01 | P1 | borda | PASS | BLOCKED | `apps/api/src/main.ts:54` |
| F11-HDR-02 | P2 | borda | FAIL | BLOCKED | `apps/api/src/main.ts:56` |
| F11-CSRF-01 | P2 | sessao | PASS | BLOCKED | `apps/api/src/auth/guards/jwt-auth.guard.ts:13` |
| F11-UP-01 | P1 | upload | FAIL | BLOCKED | `apps/api/src/finance/finance.service.ts:1574` |
| F11-UP-02 | P1 | upload | PASS | BLOCKED | `apps/api/src/cms/site-media.service.ts:24` |
| F11-QR-01 | P1 | publico | PASS | BLOCKED | `apps/api/src/credentials/credentials.service.ts:413` |
| F11-QR-02 | P1 | publico | FAIL | BLOCKED | `packages/shared/src/credential-token.ts:75` |
| F11-PUB-01 | P2 | publico | PASS | BLOCKED | `apps/api/src/events/event-registrations.service.ts:1066` |
| F11-WH-01 | P1 | publico | FAIL | BLOCKED | `apps/api/src/events/event-registrations.service.ts:1626` |
| F11-PERSON-01 | P1 | idor | PASS | BLOCKED | `apps/api/src/persons/persons.service.ts:760` |
| F11-PASTORAL-01 | P1 | pastoral | PASS | BLOCKED | `apps/api/src/pastoral/pastoral.controller.ts:115` |
| F11-FIN-01 | P1 | financeiro | PASS | BLOCKED | `apps/api/src/finance/finance.controller.ts:274` |
| F11-IDEM-01 | P1 | financeiro | FAIL | BLOCKED | `apps/api/src/finance/finance.controller.ts:360` |
| F11-SCALE-01 | P1 | escala | FAIL | BLOCKED | `packages/db/prisma/schema.prisma:1344` |
| F11-AUD-01 | P1 | auditoria | FAIL | BLOCKED | `apps/api/src/audit/audit-metadata.redactor.ts:2` |
| F11-AUD-02 | P1 | auditoria | FAIL | BLOCKED | `packages/db/prisma/schema.prisma:434` |
| F11-AUD-03 | P2 | auditoria | PASS | BLOCKED | `apps/api/src/audit/audit.service.ts:42` |
| F11-GUARD-01 | P1 | idor | FAIL | BLOCKED | `apps/api/src/auth/guards/access-policy.guard.ts:88` |
| F11-READY-01 | P2 | observabilidade | PASS | BLOCKED | `apps/api/src/health.service.ts:10` |
| F11-LOG-01 | P1 | observabilidade | PASS | BLOCKED | `apps/api/src/main.ts:65` |

## Leitura de cada controle

### F11-MFA-01 — FAIL

Login privilegiado não pode emitir JWT pleno antes do TOTP

POST /auth/login chama issueTokenPair mesmo quando o hint diz challengeRequired.

Trecho: `...this.issueTokenPair(authUser),`

Prova de deploy exige a API da candidata no ar. Análise estática não substitui.

### F11-MFA-02 — FAIL

Refresh e troca de congregação herdam a sessão sem novo desafio MFA

refresh() e switchChurch() reemitem o par de tokens sem consultar fator TOTP.

Trecho: `async refresh(actor: AuthUser): Promise<TokenPair> {`

Prova de deploy exige a API da candidata no ar. Análise estática não substitui.

### F11-MFA-03 — FAIL

Editor e publicador conseguem iniciar o próprio TOTP

MfaController lista papéis autenticados e omite EDITOR_SITE e PUBLICADOR_SITE. O login dessas contas continua a emitir JWT. Quando a F1.1 exigir MFA, o reteste tem de provar que elas não ficam sem caminho de cadastro nem entram privilegiadas sem desafio.

Trecho: `ROLE_CODES.PLATFORM_ADMIN,`

Prova de deploy exige a API da candidata no ar. Análise estática não substitui.

### F11-MFA-04 — FAIL

Enrollment não devolve segredo TOTP depois que a senha já abriu sessão

enrollTotp devolve otpauthUri e o segredo no corpo. Combinado com o JWT do login, a senha basta para retirar o fator.

Trecho: `otpauthUri: buildOtpAuthUri({`

Prova de deploy exige a API da candidata no ar. Análise estática não substitui.

### F11-MFA-05 — FAIL

Produção exige chave dedicada de cifragem do TOTP

Sem MFA_ENCRYPTION_KEY e sem JWT_SECRET, a cifragem cai num literal de desenvolvimento. Produção exige JWT_SECRET, mas não exige chave MFA separada.

Trecho: `function resolveMfaKey(): Buffer {`

Prova de deploy exige a API da candidata no ar. Análise estática não substitui.

### F11-JWT-01 — FAIL

O guard reconsulta status, revogação e grants a cada pedido

verifyAccessToken aceita os grants do payload. JwtAuthGuard não consulta o banco. Um token já emitido sobrevive a desativação, logout inexistente e troca de papel até exp.

Trecho: `grants: payload.grants ?? [],`

Prova de deploy exige a API da candidata no ar. Análise estática não substitui.

### F11-JWT-02 — FAIL

Existe logout que invalida a sessão no servidor

AuthController expõe login, me, refresh e switch-church. Não há logout nem logout-all.

Trecho: `@Controller("auth")`

Prova de deploy exige a API da candidata no ar. Análise estática não substitui.

### F11-JWT-03 — PASS

Algoritmo JWT fixo, expiração obrigatória e segredo de produção recusado se for curto ou de desenvolvimento

Assinatura HS256, exp e iat são verificados. NODE_ENV=production recusa segredo curto ou com prefixo de desenvolvimento.

Trecho: `if (header.alg !== "HS256") {`

Prova de deploy exige a API da candidata no ar. Análise estática não substitui.

### F11-JWT-04 — PASS

Senha nova usa Argon2id e a falha de login não distingue usuário de senha na mensagem

As duas falhas devolvem a mesma mensagem. O Argon2id só roda quando o usuário existe, então o tempo de resposta ainda diferencia conta ausente de senha errada.

Trecho: `throw new UnauthorizedException("Credenciais inválidas");`

Prova de deploy exige a API da candidata no ar. Análise estática não substitui.

### F11-ENUM-01 — FAIL

A verificação de senha não cria oráculo de tempo por existência de conta

Usuário inexistente responde antes do Argon2. A mensagem é igual; o tempo não é.

Trecho: `if (!user || user.status !== "ACTIVE") {`

Prova de deploy exige a API da candidata no ar. Análise estática não substitui.

### F11-RATE-01 — FAIL

O limite de login não confia no primeiro X-Forwarded-For enviado pelo cliente

clientIp usa o primeiro salto do cabeçalho, sem lista de proxies confiáveis. Um cliente pode variar o valor e ganhar um balde novo.

Trecho: `const forwarded = req.headers["x-forwarded-for"];`

Prova de deploy exige a API da candidata no ar. Análise estática não substitui.

### F11-RATE-02 — FAIL

O limite é compartilhado entre instâncias e cobre confirmação MFA, refresh e troca de congregação

O contador é um Map no processo. As rotas limitadas são login, verificação de carteirinha, voluntariado, inscrição pública, webhook mock e chat público. MFA, refresh e switch-church ficam de fora. Em mais de uma instância o limite não se soma.

Trecho: `{ path: "auth/login", method: RequestMethod.POST },`

Prova de deploy exige a API da candidata no ar. Análise estática não substitui.

### F11-CORS-01 — FAIL

CORS de ambiente publicado é uma lista explícita, nunca reflexo de qualquer origem

Sem CORS_ORIGIN, a API reflete qualquer origem. A exigência da lista só dispara quando NODE_ENV é production. Homologação com outro NODE_ENV fica aberta. Não há cookie de sessão; o impacto é browser chamando a API a partir de outra origem com um Bearer que a página já tenha.

Trecho: `origin: corsOrigin && corsOrigin.length > 0 ? corsOrigin : true,`

Prova de deploy exige a API da candidata no ar. Análise estática não substitui.

### F11-HDR-01 — PASS

Respostas levam nosniff, anti-frame, referrer e sem cache

Cabeçalhos básicos estão no bootstrap. Content-Security-Policy e Strict-Transport-Security não estão na aplicação; HSTS depende da borda e não foi medido no deploy.

Trecho: `res.setHeader("X-Content-Type-Options", "nosniff");`

Prova de deploy exige a API da candidata no ar. Análise estática não substitui.

### F11-HDR-02 — FAIL

A aplicação envia Content-Security-Policy

O bootstrap não define CSP. O portal estático precisa da política no host que entrega o HTML. Isso não foi visto no deploy.

Trecho: `res.setHeader("Referrer-Policy", "no-referrer");`

Prova de deploy exige a API da candidata no ar. Análise estática não substitui.

### F11-CSRF-01 — PASS

Sessão autenticada não viaja em cookie

O acesso autenticado exige Authorization Bearer. Não há emissão de cookie de sessão no módulo de auth, então CSRF clássico de cookie não se aplica a essas rotas. Escritas públicas continuam chamáveis por outro site e dependem do limite em memória.

Trecho: `* Stub JWT: valida Bearer token via AuthService.verifyAccessToken.`

Prova de deploy exige a API da candidata no ar. Análise estática não substitui.

### F11-UP-01 — FAIL

Comprovante financeiro confere a assinatura do arquivo, não só o mimetype declarado

O anexo de lançamento aceita PDF, JPEG ou PNG pelo mimetype do cliente, com teto de 5 MiB e nome saneado. Não há conferência dos bytes. A mídia do site confere assinatura e recusa o pedido quando o tipo declarado diverge.

Trecho: `if (!ATTACHMENT_TYPES.has(file.mimetype)) {`

Prova de deploy exige a API da candidata no ar. Análise estática não substitui.

### F11-UP-02 — PASS

Foto pública do site só entra com assinatura real, teto e caminho contido

Upload exige papel de edição, no máximo 3 MB, e a assinatura JPEG, PNG, WebP ou AVIF. A leitura pública recalcula a assinatura e recusa nome ou igreja fora do padrão.

Trecho: `function fileSignature(bytes:Buffer):"image/jpeg"|"image/png"|"image/webp"|"image/avif"|null {`

Prova de deploy exige a API da candidata no ar. Análise estática não substitui.

### F11-QR-01 — PASS

QR de carteirinha é opaco e a consulta pública não devolve documento nem contato

O token tem 32 bytes. A resposta pública leva status, validade, nome de exibição, igreja e datas. O próprio código diz que CPF e telefone não saem. O nome de exibição ainda identifica a pessoa para quem possui o token.

Trecho: `async lookupByOpaqueToken(opaqueToken: string) {`

Prova de deploy exige a API da candidata no ar. Análise estática não substitui.

### F11-QR-02 — FAIL

Token de QR malformado responde 400, não erro interno

assertOpaqueCredentialPayload lança Error comum. A rota pública não converte isso em 400. O filtro do Nest responde 500. A homologação observada devolveu 500 para um token curto sintético; isso descreve a origem consultada e o mesmo padrão está no fonte candidato.

Trecho: `throw new Error("Token da carteirinha inválido (esperado opaco base64url)");`

Prova de deploy exige a API da candidata no ar. Análise estática não substitui.

### F11-PUB-01 — PASS

Status público de inscrição não devolve nome e o código tem entropia de 16 bytes

O código de check-in não é enumerável na prática. A resposta ainda inclui isMinor e o estado da autorização do responsável para quem já tem o código. O GET público não está na lista do limitador.

Trecho: `const checkInCode = randomBytes(16).toString("hex");`

Prova de deploy exige a API da candidata no ar. Análise estática não substitui.

### F11-WH-01 — FAIL

Webhook de pagamento mock não usa segredo fixo quando a variável falta

A rota é pública e exige HMAC e Idempotency-Key. Se EVENT_PAYMENT_WEBHOOK_SECRET não estiver definida, o código volta a um segredo de demonstração embutido. Isso não pode existir numa instância publicada.

Trecho: `function webhookSecret(): string {`

Prova de deploy exige a API da candidata no ar. Análise estática não substitui.

### F11-PERSON-01 — PASS

Leitura de pessoa por membro fica restrita ao próprio cadastro

assertCanReadPerson libera busca para quem pode pesquisar na congregação e, no restante, só o próprio personId. A prova de dois usuários sintéticos na API ainda não foi executada.

Trecho: `private assertCanReadPerson(`

Prova de deploy exige a API da candidata no ar. Análise estática não substitui.

### F11-PASTORAL-01 — PASS

Casos pastorais exigem papel PASTOR na borda HTTP

O controller declara PASTOR em todas as rotas vistas. Tesouraria e Secretaria não entram nessa lista. O grant continua sendo o do JWT, então o controle cai junto com a sessão obsoleta.

Trecho: `@Roles(ROLE_CODES.PASTOR)`

Prova de deploy exige a API da candidata no ar. Análise estática não substitui.

### F11-FIN-01 — PASS

Lançamentos exigem papel de tesouraria na classe do controller

A classe do ledger exige TESOURARIA e o serviço confirma o grant na congregação piloto. PLATFORM_ADMIN entra só nos métodos que o declaram de novo. Grants velhos no JWT ainda passam.

Trecho: `@Roles(ROLE_CODES.TESOURARIA)`

Prova de deploy exige a API da candidata no ar. Análise estática não substitui.

### F11-IDEM-01 — FAIL

Reenvio de lançamento não duplica o efeito

POST do ledger não recebe chave de idempotência. O caixa em treasury/treasury.service.ts consulta um audit_log e só depois grava: duas requisições simultâneas com a mesma chave podem criar dois lançamentos. Não há restrição única no banco para essa chave.

Trecho: `createEntry(@CurrentUser() user: AuthUser, @Body() body: CreateEntryBody) {`

Prova de deploy exige a API da candidata no ar. Análise estática não substitui.

### F11-SCALE-01 — FAIL

Atribuição de escala não duplica a mesma pessoa no mesmo slot

roster_assignments indexa slot e pessoa, sem unicidade. O serviço procura conflitos antes de gravar; a corrida de dois envios não está fechada no banco.

Trecho: `model RosterAssignment {`

Prova de deploy exige a API da candidata no ar. Análise estática não substitui.

### F11-AUD-01 — FAIL

Metadado sensível é recusado na escrita, não só mascarado na leitura

A redação acontece em listRecent, sem olhar o papel de quem lê. Os escritores gravam o JSON que receberam. Segredo no metadado permanece na linha até alguém ler pela API.

Trecho: `* Redige metadata de auditoria na leitura (GET /audit-logs).`

Prova de deploy exige a API da candidata no ar. Análise estática não substitui.

### F11-AUD-02 — FAIL

audit_logs não é atualizável pelo modelo usado pela aplicação

O modelo não tem updatedAt. Também não há REVOKE de UPDATE/DELETE nem gatilho append-only neste schema. A trilha ainda depende da disciplina do client Prisma.

Trecho: `model AuditLog {`

Prova de deploy exige a API da candidata no ar. Análise estática não substitui.

### F11-AUD-03 — PASS

Leitura de auditoria tem teto e a visão da organização exige admin

limit fica entre 1 e 200. scope=organization exige PLATFORM_ADMIN da organização. Secretaria, pastor e admin da congregação leem a trilha local, com metadado mascarado só na resposta.

Trecho: `const take = Math.min(Math.max(limit, 1), 200);`

Prova de deploy exige a API da candidata no ar. Análise estática não substitui.

### F11-GUARD-01 — FAIL

Líder sem ministryId no grant não é aceito em rota de outro ministério

AccessPolicyGuard passa unknownLeader allow. Na política compartilhada, grant de líder sem ministryId cobre o ministryId pedido. O serviço de vínculo formal pode apertar depois; a borda HTTP deste guard não aperta.

Trecho: `unknownLeader: "allow",`

Prova de deploy exige a API da candidata no ar. Análise estática não substitui.

### F11-READY-01 — PASS

/ready não devolve cadeia de conexão nem segredo

A prontidão responde status, service e database ok ou unavailable. Não há requestId, log JSON global nem métrica protegida neste SHA.

Trecho: `async getReadiness(): Promise<{ status: "ready"; service: "api"; database: "ok" }> {`

Prova de deploy exige a API da candidata no ar. Análise estática não substitui.

### F11-LOG-01 — PASS

O bootstrap não escreve Authorization, cookie ou senha no stdout

O único console.log do bootstrap anuncia a porta. Não há filtro global que impeça um serviço futuro de gravar o corpo. A frente C, que criaria esse filtro, não está nesta árvore.

Trecho: `console.log(`API listening on http://localhost:${port}`);`

Prova de deploy exige a API da candidata no ar. Análise estática não substitui.
