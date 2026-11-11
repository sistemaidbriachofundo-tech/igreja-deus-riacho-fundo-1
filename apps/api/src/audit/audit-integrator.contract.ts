/**
 * Contrato para o integrador E (#189).
 * Esta frente só implementa `apps/api/src/audit/**`.
 * Não altera serviços de negócio nem o schema Prisma.
 * Cada ponto abaixo continua gravando `auditLog.create` direto até E
 * trocar a chamada por `AuditWriterService.write(tx, command)`.
 */
export const AUDIT_INTEGRATOR = {
  issue: "#189",
  epic: "#184",
  ownership: "apps/api/src/audit/**",
  baseSha: "31d3158c7619bbc4c9d24fd9b94e43ef056ab80e",
  migrationInThisChange: false,
  preservesExistingRows: true,
} as const;

export const AUDIT_SCHEMA_HANDOFF = {
  model: "AuditLog",
  table: "audit_logs",
  suggestedColumns: [
    "outcome",
    "correlation_id",
    "entry_hash",
    "prev_audit_id",
  ],
  untilColumnsExist:
    "outcome, correlationId, prevId, prevHash, entryHash e chainVersion ficam na metadata já sanitizada.",
  immutability:
    "O processo aplicativo recusa update, delete e expurgo. Isso não é inviolabilidade. REVOKE UPDATE, DELETE no papel do banco, se for feito, é decisão do integrador e não entra nesta frente.",
  integrity:
    "Cadeia SHA-256 por organizationId + churchId. Elo legado (linha anterior sem entryHash) usa o sentinela de legado, sem reescrever a linha antiga.",
  treasuryCaveat:
    "apps/api/src/treasury/treasury.service.ts lê metadata.idempotencyKey como chave funcional. O token `key` é sensível e o writer redige. Não ligar esse ponto ao writer sem coluna própria de idempotência.",
} as const;

export interface AuditWiringPoint {
  domain:
    | "auth"
    | "mfa"
    | "person"
    | "family"
    | "admission"
    | "credential"
    | "ministry"
    | "roster"
    | "treasury"
    | "cms"
    | "privilege";
  file: string;
  actions: readonly string[];
  sensitive: true;
  note: string;
}

export const AUDIT_WIRING_PLAN: readonly AuditWiringPoint[] = [
  {
    domain: "auth",
    file: "apps/api/src/auth/auth.service.ts",
    actions: ["auth.login", "auth.login_failed"],
    sensitive: true,
    note: "Ator nulo só no login de usuário desconhecido. Fingerprint curto permanece; e-mail claro não entra.",
  },
  {
    domain: "mfa",
    file: "apps/api/src/auth/mfa/mfa.service.ts",
    actions: ["mfa.totp.enroll_start", "mfa.totp.enable", "mfa.totp.disable"],
    sensitive: true,
    note: "Não enviar seed, otpauth, recovery ou segredo. O writer redige esses campos.",
  },
  {
    domain: "person",
    file: "apps/api/src/persons/persons.service.ts",
    actions: ["person.patch"],
    sensitive: true,
    note: "before/after livre é redigido. Manter a lista `fields` e ids opacos.",
  },
  {
    domain: "family",
    file: "apps/api/src/households/households.service.ts",
    actions: [
      "household.create",
      "household.add_members",
      "household.remove_member",
    ],
    sensitive: true,
    note: "Sem nome de menor, nascimento ou endereço na metadata.",
  },
  {
    domain: "admission",
    file: "apps/api/src/admissions/admissions.service.ts",
    actions: [
      "admission.create",
      "admission.advance",
      "admission.reject",
      "admission.cancel",
    ],
    sensitive: true,
    note: "Motivo livre em reason cai para máscara. O passo operacional pode ficar.",
  },
  {
    domain: "admission",
    file: "apps/api/src/admissions/admission-documents.service.ts",
    actions: [
      "admission_document.upload",
      "admission_document.download",
      "admission_document.delete",
    ],
    sensitive: true,
    note: "Sem conteúdo, nome de arquivo livre ou documento. mimeType e byteSize já são campos seguros.",
  },
  {
    domain: "credential",
    file: "apps/api/src/credentials/credentials.service.ts",
    actions: [
      "credential.issue",
      "credential.revoke",
      "credential.reissue",
      "credential.pdf.generate",
      "credential.pdf.download",
    ],
    sensitive: true,
    note: "Sem token opaco da carteirinha e sem PDF na metadata.",
  },
  {
    domain: "ministry",
    file: "apps/api/src/ministries/ministries.service.ts",
    actions: ["ministry.create", "ministry.patch"],
    sensitive: true,
    note: "Rótulo curto de ministry.create continua permitido. Narrativa pastoral no nome é máscara.",
  },
  {
    domain: "ministry",
    file: "apps/api/src/ministries/membership/prisma-ministry-membership.repository.ts",
    actions: [
      "ministry_membership.admit",
      "ministry_membership.convert_interest",
    ],
    sensitive: true,
    note: "Ids opacos. Sem ficha cadastral.",
  },
  {
    domain: "roster",
    file: "apps/api/src/ministries/ministries.service.ts",
    actions: [
      "roster.create",
      "roster.update",
      "roster.publish",
      "roster.close",
      "roster.slot.create",
      "roster.assignment.create",
    ],
    sensitive: true,
    note: "Escala operacional. Impedimento e disponibilidade não levam texto livre.",
  },
  {
    domain: "roster",
    file: "apps/api/src/rosters/personal-roster.service.ts",
    actions: ["roster.assignment.create", "roster.assignment.substitute"],
    sensitive: true,
    note: "Mesma ação de escala, segundo escritor. E unifica os dois no writer.",
  },
  {
    domain: "treasury",
    file: "apps/api/src/finance/finance.service.ts",
    actions: [
      "ledger.account.create",
      "ledger.entry.create",
      "ledger.entry.submit",
      "ledger.entry.reject",
      "ledger.entry.reverse",
      "ledger.fund.create",
      "ledger.period.close",
    ],
    sensitive: true,
    note: "Valor, Pix, conta e descrição são redigidos na origem. Ids de fundo e centro de custo permanecem.",
  },
  {
    domain: "treasury",
    file: "apps/api/src/treasury/treasury.service.ts",
    actions: ["treasury.idempotency"],
    sensitive: true,
    note: "Não migrar enquanto a idempotência depender de metadata.idempotencyKey. Ver AUDIT_SCHEMA_HANDOFF.treasuryCaveat.",
  },
  {
    domain: "cms",
    file: "apps/api/src/cms/cms.service.ts",
    actions: ["cms.create", "cms.patch"],
    sensitive: true,
    note: "Sem corpo da página. contentType e ids opacos.",
  },
  {
    domain: "cms",
    file: "apps/api/src/cms/site-layout.service.ts",
    actions: ["site.home.draft", "site.home.publish"],
    sensitive: true,
    note: "Publicação registra o fato, não o HTML.",
  },
  {
    domain: "cms",
    file: "apps/api/src/cms/site-media.service.ts",
    actions: ["site.media.upload"],
    sensitive: true,
    note: "mimeType e byteSize. Sem o binário.",
  },
  {
    domain: "privilege",
    file: "apps/api/src/auth/church-access.controller.ts",
    actions: ["access.create"],
    sensitive: true,
    note: "Papel e ministryId opaco. Sem senha e sem e-mail claro. Negativas de outros módulos usam recordDenial com reason fechado.",
  },
];

export const AUDIT_WIRING_DOMAINS = [
  "auth",
  "mfa",
  "person",
  "family",
  "admission",
  "credential",
  "ministry",
  "roster",
  "treasury",
  "cms",
  "privilege",
] as const;
