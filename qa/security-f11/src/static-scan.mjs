/**
 * Controles estáticos da candidata. Cada um lê o fonte e devolve
 * PASS, FAIL ou BLOCKED com arquivo e linha. Não executa a API.
 */

export const CANDIDATE_SHA = "31d3158c7619bbc4c9d24fd9b94e43ef056ab80e";

const SOURCE_FILES = [
  "apps/api/src/auth/auth.service.ts",
  "apps/api/src/auth/auth.controller.ts",
  "apps/api/src/auth/mfa/mfa.controller.ts",
  "apps/api/src/auth/mfa/mfa.service.ts",
  "apps/api/src/auth/mfa/mfa-crypto.util.ts",
  "apps/api/src/main.ts",
  "apps/api/src/app.module.ts",
  "apps/api/src/common/simple-rate-limit.middleware.ts",
  "apps/api/src/auth/guards/jwt-auth.guard.ts",
  "apps/api/src/auth/guards/access-policy.guard.ts",
  "apps/api/src/finance/finance.service.ts",
  "apps/api/src/finance/finance.controller.ts",
  "apps/api/src/cms/site-media.service.ts",
  "apps/api/src/audit/audit-metadata.redactor.ts",
  "apps/api/src/audit/audit.service.ts",
  "apps/api/src/pastoral/pastoral.controller.ts",
  "apps/api/src/persons/persons.service.ts",
  "apps/api/src/credentials/credentials.service.ts",
  "apps/api/src/events/event-registrations.service.ts",
  "apps/api/src/treasury/treasury.service.ts",
  "apps/api/src/health.service.ts",
  "packages/db/prisma/schema.prisma",
  "packages/shared/src/credential-token.ts",
];

export function lineOf(source, needle) {
  const index = source.indexOf(needle);
  if (index < 0) return null;
  return source.slice(0, index).split("\n").length;
}

export function excerptAt(source, line) {
  if (!line) return "";
  const text = source.split("\n")[line - 1] ?? "";
  return text.trim().slice(0, 180);
}

function between(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  if (start < 0) return "";
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  return source.slice(start, end < 0 ? source.length : end);
}

function evidence(file, source, needle) {
  const line = lineOf(source, needle);
  return { file, line, excerpt: line ? excerptAt(source, line) : "" };
}

function control(partial) {
  return {
    e2e: "BLOCKED",
    e2eDetail: "Prova de deploy exige a API da candidata no ar. Análise estática não substitui.",
    ...partial,
  };
}

function loginIssuesFullJwt(authService) {
  const body = between(authService, "async login(", "private async writeLoginAudit");
  const issueAt = body.indexOf("issueTokenPair");
  const gateAt = body.search(/if\s*\(\s*mfaRequired\s*&&\s*mfaEnabled\s*\)/);
  if (issueAt < 0) {
    return { fail: false, detail: "O login deste trecho não chama issueTokenPair." };
  }
  if (gateAt >= 0 && gateAt < issueAt) {
    const prior = body.slice(gateAt, issueAt);
    if (/\breturn\b/.test(prior)) {
      return { fail: false, detail: "Há retorno de desafio antes da emissão do JWT." };
    }
  }
  return {
    fail: true,
    detail: "POST /auth/login chama issueTokenPair mesmo quando o hint diz challengeRequired.",
  };
}

export function evaluateSources(files) {
  const auth = files["apps/api/src/auth/auth.service.ts"] ?? "";
  const authController = files["apps/api/src/auth/auth.controller.ts"] ?? "";
  const mfaController = files["apps/api/src/auth/mfa/mfa.controller.ts"] ?? "";
  const mfaService = files["apps/api/src/auth/mfa/mfa.service.ts"] ?? "";
  const mfaCrypto = files["apps/api/src/auth/mfa/mfa-crypto.util.ts"] ?? "";
  const main = files["apps/api/src/main.ts"] ?? "";
  const appModule = files["apps/api/src/app.module.ts"] ?? "";
  const rate = files["apps/api/src/common/simple-rate-limit.middleware.ts"] ?? "";
  const jwtGuard = files["apps/api/src/auth/guards/jwt-auth.guard.ts"] ?? "";
  const accessGuard = files["apps/api/src/auth/guards/access-policy.guard.ts"] ?? "";
  const finance = files["apps/api/src/finance/finance.service.ts"] ?? "";
  const financeController = files["apps/api/src/finance/finance.controller.ts"] ?? "";
  const media = files["apps/api/src/cms/site-media.service.ts"] ?? "";
  const redactor = files["apps/api/src/audit/audit-metadata.redactor.ts"] ?? "";
  const auditService = files["apps/api/src/audit/audit.service.ts"] ?? "";
  const pastoral = files["apps/api/src/pastoral/pastoral.controller.ts"] ?? "";
  const persons = files["apps/api/src/persons/persons.service.ts"] ?? "";
  const credentials = files["apps/api/src/credentials/credentials.service.ts"] ?? "";
  const events = files["apps/api/src/events/event-registrations.service.ts"] ?? "";
  const treasury = files["apps/api/src/treasury/treasury.service.ts"] ?? "";
  const health = files["apps/api/src/health.service.ts"] ?? "";
  const schema = files["packages/db/prisma/schema.prisma"] ?? "";
  const opaque = files["packages/shared/src/credential-token.ts"] ?? "";

  const login = loginIssuesFullJwt(auth);
  const refreshBody = between(auth, "async refresh(", "async switchChurch(");
  const switchBody = between(auth, "async switchChurch(", "verifyAccessToken(");
  const verifyBody = between(auth, "verifyAccessToken(", "signAccessToken(");
  const rateRoutes = between(appModule, "configure(consumer", "}");
  const uploadBody = between(finance, "async uploadAttachment(", "async downloadAttachment(");
  const roster = between(schema, "model RosterAssignment", "model VolunteerAvailability");
  const auditModel = between(schema, "model AuditLog", "model ");
  const webhook = between(events, "function webhookSecret()", "function signaturesMatch");

  const controls = [
    control({
      id: "F11-MFA-01",
      severity: "P0",
      surface: "autenticacao",
      title: "Login privilegiado não pode emitir JWT pleno antes do TOTP",
      static: login.fail ? "FAIL" : "PASS",
      detail: login.detail,
      ...evidence(login.fail
        ? "apps/api/src/auth/auth.service.ts"
        : "apps/api/src/auth/auth.service.ts", auth, login.fail
        ? "issueTokenPair(authUser)"
        : "async login("),
    }),
    control({
      id: "F11-MFA-02",
      severity: "P0",
      surface: "autenticacao",
      title: "Refresh e troca de congregação herdam a sessão sem novo desafio MFA",
      static: refreshBody.includes("mfa") || switchBody.includes("mfa") ? "PASS" : "FAIL",
      detail: "refresh() e switchChurch() reemitem o par de tokens sem consultar fator TOTP.",
      ...evidence("apps/api/src/auth/auth.service.ts", auth, "async refresh(actor: AuthUser)"),
    }),
    control({
      id: "F11-MFA-03",
      severity: "P1",
      surface: "autenticacao",
      title: "Editor e publicador conseguem iniciar o próprio TOTP",
      static: mfaController.includes("EDITOR_SITE") && mfaController.includes("PUBLICADOR_SITE")
        ? "PASS"
        : "FAIL",
      detail: "MfaController lista papéis autenticados e omite EDITOR_SITE e PUBLICADOR_SITE. O login dessas contas continua a emitir JWT. Quando a F1.1 exigir MFA, o reteste tem de provar que elas não ficam sem caminho de cadastro nem entram privilegiadas sem desafio.",
      ...evidence("apps/api/src/auth/mfa/mfa.controller.ts", mfaController, "ROLE_CODES.PLATFORM_ADMIN"),
    }),
    control({
      id: "F11-MFA-04",
      severity: "P1",
      surface: "autenticacao",
      title: "Enrollment não devolve segredo TOTP depois que a senha já abriu sessão",
      static: mfaService.includes("otpauthUri:") && mfaService.includes("secret,") ? "FAIL" : "PASS",
      detail: "enrollTotp devolve otpauthUri e o segredo no corpo. Combinado com o JWT do login, a senha basta para retirar o fator.",
      ...evidence("apps/api/src/auth/mfa/mfa.service.ts", mfaService, "otpauthUri:"),
    }),
    control({
      id: "F11-MFA-05",
      severity: "P1",
      surface: "autenticacao",
      title: "Produção exige chave dedicada de cifragem do TOTP",
      static: mfaCrypto.includes("dev-only-") ? "FAIL" : "PASS",
      detail: "Sem MFA_ENCRYPTION_KEY e sem JWT_SECRET, a cifragem cai num literal de desenvolvimento. Produção exige JWT_SECRET, mas não exige chave MFA separada.",
      ...evidence("apps/api/src/auth/mfa/mfa-crypto.util.ts", mfaCrypto, "function resolveMfaKey"),
    }),
    control({
      id: "F11-JWT-01",
      severity: "P0",
      surface: "sessao",
      title: "O guard reconsulta status, revogação e grants a cada pedido",
      static: verifyBody.includes("payload.grants") && !verifyBody.includes("findUnique")
        ? "FAIL"
        : "PASS",
      detail: "verifyAccessToken aceita os grants do payload. JwtAuthGuard não consulta o banco. Um token já emitido sobrevive a desativação, logout inexistente e troca de papel até exp.",
      ...evidence("apps/api/src/auth/auth.service.ts", auth, "grants: payload.grants"),
    }),
    control({
      id: "F11-JWT-02",
      severity: "P0",
      surface: "sessao",
      title: "Existe logout que invalida a sessão no servidor",
      static: authController.includes("logout") ? "PASS" : "FAIL",
      detail: "AuthController expõe login, me, refresh e switch-church. Não há logout nem logout-all.",
      ...evidence("apps/api/src/auth/auth.controller.ts", authController, "@Controller(\"auth\")"),
    }),
    control({
      id: "F11-JWT-03",
      severity: "P1",
      surface: "sessao",
      title: "Algoritmo JWT fixo, expiração obrigatória e segredo de produção recusado se for curto ou de desenvolvimento",
      static: auth.includes('header.alg !== "HS256"')
        && auth.includes("JWT expirado ou sem expiração")
        && auth.includes("dev-only-")
        ? "PASS"
        : "FAIL",
      detail: "Assinatura HS256, exp e iat são verificados. NODE_ENV=production recusa segredo curto ou com prefixo de desenvolvimento.",
      ...evidence("apps/api/src/auth/auth.service.ts", auth, 'header.alg !== "HS256"'),
    }),
    control({
      id: "F11-JWT-04",
      severity: "P2",
      surface: "sessao",
      title: "Senha nova usa Argon2id e a falha de login não distingue usuário de senha na mensagem",
      static: auth.includes("argon2.argon2id")
        && auth.split("Credenciais inválidas").length >= 3
        ? "PASS"
        : "FAIL",
      detail: "As duas falhas devolvem a mesma mensagem. O Argon2id só roda quando o usuário existe, então o tempo de resposta ainda diferencia conta ausente de senha errada.",
      ...evidence("apps/api/src/auth/auth.service.ts", auth, "Credenciais inválidas"),
    }),
    control({
      id: "F11-ENUM-01",
      severity: "P2",
      surface: "autenticacao",
      title: "A verificação de senha não cria oráculo de tempo por existência de conta",
      static: between(auth, "async login(", "const personId").includes("if (!user")
        && between(auth, "if (!user", "const personId").indexOf("verifyPassword")
          > between(auth, "if (!user", "const personId").indexOf("Credenciais inválidas")
        ? "FAIL"
        : "PASS",
      detail: "Usuário inexistente responde antes do Argon2. A mensagem é igual; o tempo não é.",
      ...evidence("apps/api/src/auth/auth.service.ts", auth, "if (!user || user.status !== \"ACTIVE\")"),
    }),
    control({
      id: "F11-RATE-01",
      severity: "P0",
      surface: "abuso",
      title: "O limite de login não confia no primeiro X-Forwarded-For enviado pelo cliente",
      static: rate.includes('req.headers["x-forwarded-for"]')
        && rate.includes('split(",")[0]')
        ? "FAIL"
        : "PASS",
      detail: "clientIp usa o primeiro salto do cabeçalho, sem lista de proxies confiáveis. Um cliente pode variar o valor e ganhar um balde novo.",
      ...evidence("apps/api/src/common/simple-rate-limit.middleware.ts", rate, "x-forwarded-for"),
    }),
    control({
      id: "F11-RATE-02",
      severity: "P1",
      surface: "abuso",
      title: "O limite é compartilhado entre instâncias e cobre confirmação MFA, refresh e troca de congregação",
      static: rate.includes("new Map")
        || !rateRoutes.includes("auth/mfa")
        || !rateRoutes.includes("auth/refresh")
        ? "FAIL"
        : "PASS",
      detail: "O contador é um Map no processo. As rotas limitadas são login, verificação de carteirinha, voluntariado, inscrição pública, webhook mock e chat público. MFA, refresh e switch-church ficam de fora. Em mais de uma instância o limite não se soma.",
      ...evidence("apps/api/src/app.module.ts", appModule, '{ path: "auth/login", method: RequestMethod.POST }'),
    }),
    control({
      id: "F11-CORS-01",
      severity: "P1",
      surface: "borda",
      title: "CORS de ambiente publicado é uma lista explícita, nunca reflexo de qualquer origem",
      static: main.includes("origin: corsOrigin && corsOrigin.length > 0 ? corsOrigin : true")
        ? "FAIL"
        : "PASS",
      detail: "Sem CORS_ORIGIN, a API reflete qualquer origem. A exigência da lista só dispara quando NODE_ENV é production. Homologação com outro NODE_ENV fica aberta. Não há cookie de sessão; o impacto é browser chamando a API a partir de outra origem com um Bearer que a página já tenha.",
      ...evidence("apps/api/src/main.ts", main, "origin: corsOrigin"),
    }),
    control({
      id: "F11-HDR-01",
      severity: "P1",
      surface: "borda",
      title: "Respostas levam nosniff, anti-frame, referrer e sem cache",
      static: main.includes("X-Content-Type-Options")
        && main.includes("X-Frame-Options")
        && main.includes("no-store")
        && main.includes('disable("x-powered-by")')
        ? "PASS"
        : "FAIL",
      detail: "Cabeçalhos básicos estão no bootstrap. Content-Security-Policy e Strict-Transport-Security não estão na aplicação; HSTS depende da borda e não foi medido no deploy.",
      ...evidence("apps/api/src/main.ts", main, "X-Content-Type-Options"),
    }),
    control({
      id: "F11-HDR-02",
      severity: "P2",
      surface: "borda",
      title: "A aplicação envia Content-Security-Policy",
      static: main.includes("Content-Security-Policy") ? "PASS" : "FAIL",
      detail: "O bootstrap não define CSP. O portal estático precisa da política no host que entrega o HTML. Isso não foi visto no deploy.",
      ...evidence("apps/api/src/main.ts", main, "Referrer-Policy"),
    }),
    control({
      id: "F11-CSRF-01",
      severity: "P2",
      surface: "sessao",
      title: "Sessão autenticada não viaja em cookie",
      static: jwtGuard.includes('header?.startsWith("Bearer ")')
        && !auth.includes("setCookie")
        && !authController.includes("cookie")
        ? "PASS"
        : "FAIL",
      detail: "O acesso autenticado exige Authorization Bearer. Não há emissão de cookie de sessão no módulo de auth, então CSRF clássico de cookie não se aplica a essas rotas. Escritas públicas continuam chamáveis por outro site e dependem do limite em memória.",
      ...evidence("apps/api/src/auth/guards/jwt-auth.guard.ts", jwtGuard, "Bearer "),
    }),
    control({
      id: "F11-UP-01",
      severity: "P1",
      surface: "upload",
      title: "Comprovante financeiro confere a assinatura do arquivo, não só o mimetype declarado",
      static: uploadBody.includes("file.mimetype") && !uploadBody.includes("fileSignature")
        ? "FAIL"
        : "PASS",
      detail: "O anexo de lançamento aceita PDF, JPEG ou PNG pelo mimetype do cliente, com teto de 5 MiB e nome saneado. Não há conferência dos bytes. A mídia do site confere assinatura e recusa o pedido quando o tipo declarado diverge.",
      ...evidence("apps/api/src/finance/finance.service.ts", finance, "ATTACHMENT_TYPES.has(file.mimetype)"),
    }),
    control({
      id: "F11-UP-02",
      severity: "P1",
      surface: "upload",
      title: "Foto pública do site só entra com assinatura real, teto e caminho contido",
      static: media.includes("fileSignature")
        && media.includes("MAX_MEDIA_BYTES")
        && media.includes("safeLocalPath")
        ? "PASS"
        : "FAIL",
      detail: "Upload exige papel de edição, no máximo 3 MB, e a assinatura JPEG, PNG, WebP ou AVIF. A leitura pública recalcula a assinatura e recusa nome ou igreja fora do padrão.",
      ...evidence("apps/api/src/cms/site-media.service.ts", media, "function fileSignature"),
    }),
    control({
      id: "F11-QR-01",
      severity: "P1",
      surface: "publico",
      title: "QR de carteirinha é opaco e a consulta pública não devolve documento nem contato",
      static: opaque.includes("OPAQUE_TOKEN_BYTES = 32")
        && credentials.includes("displayName")
        && !between(credentials, "async lookupByOpaqueToken", "private async assertCredentialEligible").includes("email:")
        ? "PASS"
        : "FAIL",
      detail: "O token tem 32 bytes. A resposta pública leva status, validade, nome de exibição, igreja e datas. O próprio código diz que CPF e telefone não saem. O nome de exibição ainda identifica a pessoa para quem possui o token.",
      ...evidence("apps/api/src/credentials/credentials.service.ts", credentials, "async lookupByOpaqueToken"),
    }),
    control({
      id: "F11-QR-02",
      severity: "P1",
      surface: "publico",
      title: "Token de QR malformado responde 400, não erro interno",
      static: opaque.includes('throw new Error(\n      "Token da carteirinha inválido')
        || opaque.includes('throw new Error("Token da carteirinha inválido')
        ? "FAIL"
        : "PASS",
      detail: "assertOpaqueCredentialPayload lança Error comum. A rota pública não converte isso em 400. O filtro do Nest responde 500. A homologação observada devolveu 500 para um token curto sintético; isso descreve a origem consultada e o mesmo padrão está no fonte candidato.",
      ...evidence("packages/shared/src/credential-token.ts", opaque, "Token da carteirinha inválido"),
    }),
    control({
      id: "F11-PUB-01",
      severity: "P2",
      surface: "publico",
      title: "Status público de inscrição não devolve nome e o código tem entropia de 16 bytes",
      static: events.includes("randomBytes(16)")
        && between(events, "async getPublicRegistrationStatus", "async checkIn(").includes("sem displayName")
        ? "PASS"
        : "FAIL",
      detail: "O código de check-in não é enumerável na prática. A resposta ainda inclui isMinor e o estado da autorização do responsável para quem já tem o código. O GET público não está na lista do limitador.",
      ...evidence("apps/api/src/events/event-registrations.service.ts", events, "const checkInCode = randomBytes(16)"),
    }),
    control({
      id: "F11-WH-01",
      severity: "P1",
      surface: "publico",
      title: "Webhook de pagamento mock não usa segredo fixo quando a variável falta",
      static: webhook.includes("return \"") || webhook.includes("return '") ? "FAIL" : "PASS",
      detail: "A rota é pública e exige HMAC e Idempotency-Key. Se EVENT_PAYMENT_WEBHOOK_SECRET não estiver definida, o código volta a um segredo de demonstração embutido. Isso não pode existir numa instância publicada.",
      ...evidence("apps/api/src/events/event-registrations.service.ts", events, "function webhookSecret()"),
    }),
    control({
      id: "F11-PERSON-01",
      severity: "P1",
      surface: "idor",
      title: "Leitura de pessoa por membro fica restrita ao próprio cadastro",
      static: persons.includes("actor.personId === personId")
        && persons.includes("Sem permissão para consultar esta pessoa")
        ? "PASS"
        : "FAIL",
      detail: "assertCanReadPerson libera busca para quem pode pesquisar na congregação e, no restante, só o próprio personId. A prova de dois usuários sintéticos na API ainda não foi executada.",
      ...evidence("apps/api/src/persons/persons.service.ts", persons, "private assertCanReadPerson("),
    }),
    control({
      id: "F11-PASTORAL-01",
      severity: "P1",
      surface: "pastoral",
      title: "Casos pastorais exigem papel PASTOR na borda HTTP",
      static: pastoral.includes('@Roles(ROLE_CODES.PASTOR)')
        && !pastoral.includes("ROLE_CODES.TESOURARIA")
        && !pastoral.includes("ROLE_CODES.SECRETARIA")
        ? "PASS"
        : "FAIL",
      detail: "O controller declara PASTOR em todas as rotas vistas. Tesouraria e Secretaria não entram nessa lista. O grant continua sendo o do JWT, então o controle cai junto com a sessão obsoleta.",
      ...evidence("apps/api/src/pastoral/pastoral.controller.ts", pastoral, '@Roles(ROLE_CODES.PASTOR)'),
    }),
    control({
      id: "F11-FIN-01",
      severity: "P1",
      surface: "financeiro",
      title: "Lançamentos exigem papel de tesouraria na classe do controller",
      static: financeController.includes('@Roles(ROLE_CODES.TESOURARIA)')
        && finance.includes("Sem permissão de tesouraria nesta congregação")
        ? "PASS"
        : "FAIL",
      detail: "A classe do ledger exige TESOURARIA e o serviço confirma o grant na congregação piloto. PLATFORM_ADMIN entra só nos métodos que o declaram de novo. Grants velhos no JWT ainda passam.",
      ...evidence("apps/api/src/finance/finance.controller.ts", financeController, '@Roles(ROLE_CODES.TESOURARIA)'),
    }),
    control({
      id: "F11-IDEM-01",
      severity: "P1",
      surface: "financeiro",
      title: "Reenvio de lançamento não duplica o efeito",
      static: financeController.includes("idempotencyKey") ? "PASS" : "FAIL",
      detail: "POST do ledger não recebe chave de idempotência. O caixa em treasury/treasury.service.ts consulta um audit_log e só depois grava: duas requisições simultâneas com a mesma chave podem criar dois lançamentos. Não há restrição única no banco para essa chave.",
      ...evidence("apps/api/src/finance/finance.controller.ts", financeController, "createEntry("),
    }),
    control({
      id: "F11-SCALE-01",
      severity: "P1",
      surface: "escala",
      title: "Atribuição de escala não duplica a mesma pessoa no mesmo slot",
      static: roster.includes("@@unique") ? "PASS" : "FAIL",
      detail: "roster_assignments indexa slot e pessoa, sem unicidade. O serviço procura conflitos antes de gravar; a corrida de dois envios não está fechada no banco.",
      ...evidence("packages/db/prisma/schema.prisma", schema, "model RosterAssignment"),
    }),
    control({
      id: "F11-AUD-01",
      severity: "P1",
      surface: "auditoria",
      title: "Metadado sensível é recusado na escrita, não só mascarado na leitura",
      static: redactor.includes("Redige metadata de auditoria na leitura")
        && auditService.includes("redactAuditMetadata(row.action, row.metadata)")
        ? "FAIL"
        : "PASS",
      detail: "A redação acontece em listRecent, sem olhar o papel de quem lê. Os escritores gravam o JSON que receberam. Segredo no metadado permanece na linha até alguém ler pela API.",
      ...evidence("apps/api/src/audit/audit-metadata.redactor.ts", redactor, "Redige metadata de auditoria na leitura"),
    }),
    control({
      id: "F11-AUD-02",
      severity: "P1",
      surface: "auditoria",
      title: "audit_logs não é atualizável pelo modelo usado pela aplicação",
      static: /REVOKE[\s\S]{0,80}audit_logs/i.test(auditModel) ? "PASS" : "FAIL",
      detail: "O modelo não tem updatedAt. Também não há REVOKE de UPDATE/DELETE nem gatilho append-only neste schema. A trilha ainda depende da disciplina do client Prisma.",
      ...evidence("packages/db/prisma/schema.prisma", schema, "model AuditLog"),
    }),
    control({
      id: "F11-AUD-03",
      severity: "P2",
      surface: "auditoria",
      title: "Leitura de auditoria tem teto e a visão da organização exige admin",
      static: auditService.includes("Math.min(Math.max(limit, 1), 200)")
        && auditService.includes("PLATFORM_ADMIN")
        ? "PASS"
        : "FAIL",
      detail: "limit fica entre 1 e 200. scope=organization exige PLATFORM_ADMIN da organização. Secretaria, pastor e admin da congregação leem a trilha local, com metadado mascarado só na resposta.",
      ...evidence("apps/api/src/audit/audit.service.ts", auditService, "const take = Math.min"),
    }),
    control({
      id: "F11-GUARD-01",
      severity: "P1",
      surface: "idor",
      title: "Líder sem ministryId no grant não é aceito em rota de outro ministério",
      static: accessGuard.includes('unknownLeader: "allow"') ? "FAIL" : "PASS",
      detail: "AccessPolicyGuard passa unknownLeader allow. Na política compartilhada, grant de líder sem ministryId cobre o ministryId pedido. O serviço de vínculo formal pode apertar depois; a borda HTTP deste guard não aperta.",
      ...evidence("apps/api/src/auth/guards/access-policy.guard.ts", accessGuard, 'unknownLeader: "allow"'),
    }),
    control({
      id: "F11-READY-01",
      severity: "P2",
      surface: "observabilidade",
      title: "/ready não devolve cadeia de conexão nem segredo",
      static: health.includes('database: "ok"')
        && !health.includes("DATABASE_URL")
        ? "PASS"
        : "FAIL",
      detail: "A prontidão responde status, service e database ok ou unavailable. Não há requestId, log JSON global nem métrica protegida neste SHA.",
      ...evidence("apps/api/src/health.service.ts", health, 'database: "ok"'),
    }),
    control({
      id: "F11-LOG-01",
      severity: "P1",
      surface: "observabilidade",
      title: "O bootstrap não escreve Authorization, cookie ou senha no stdout",
      static: main.includes("console.log") && !main.includes("authorization") && !main.includes("password")
        ? "PASS"
        : "FAIL",
      detail: "O único console.log do bootstrap anuncia a porta. Não há filtro global que impeça um serviço futuro de gravar o corpo. A frente C, que criaria esse filtro, não está nesta árvore.",
      ...evidence("apps/api/src/main.ts", main, "API listening"),
    }),
  ];

  return controls.map((item) => ({
    ...item,
    file: item.file,
    line: item.line,
    excerpt: item.excerpt,
  }));
}

export function summarize(controls) {
  const counts = { PASS: 0, FAIL: 0, BLOCKED: 0 };
  const e2e = { PASS: 0, FAIL: 0, BLOCKED: 0 };
  for (const item of controls) {
    counts[item.static] = (counts[item.static] ?? 0) + 1;
    e2e[item.e2e] = (e2e[item.e2e] ?? 0) + 1;
  }
  const blockers = controls.filter((item) => item.static === "FAIL" && item.severity === "P0");
  return { counts, e2e, blockers, total: controls.length };
}

export { SOURCE_FILES };
