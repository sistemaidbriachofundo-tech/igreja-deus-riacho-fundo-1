import { HML_DATABASE, HML_PERSONAS, type PersonaId, type ReleaseCheck, type ReleaseStatus } from "./eklesia-gate";

/** Epic #144. A fase anterior (#125) continua no gate Eklesia e não é reaproveitada como letra de frente. */
export const REVITALIZATION_EPIC = 144;
export const REVITALIZATION_INTEGRATOR_ISSUE = 154;
export const REVITALIZATION_BASELINE_SHA = "3c7375c23b7a4ed4d5e18618f34ec80d7fd43ac3";
export const HML_ENVIRONMENT_LABEL = "Ambiente de homologação";
export const PRESERVED_HML_PERSON_BASELINE = 71;

export const REVITALIZATION_FRONT_IDS = ["A", "B", "C", "D", "E", "F", "G", "H", "I"] as const;
export type RevitalizationFrontId = (typeof REVITALIZATION_FRONT_IDS)[number];

export interface RevitalizationFrontOwnership {
  id: RevitalizationFrontId | "J";
  issue: number;
  paths: readonly string[];
}

/**
 * Um caminho pertence a uma frente. O integrador não edita o caminho de outra frente.
 * Prefixos com barra final cobrem a pasta. Os demais são arquivos.
 */
export const REVITALIZATION_OWNERSHIP: readonly RevitalizationFrontOwnership[] = [
  {
    id: "A",
    issue: 145,
    paths: [
      "apps/web/src/components/AppShell.tsx",
      "apps/web/src/components/app-shell.module.css",
      "apps/web/src/lib/persona-navigation.ts",
    ],
  },
  {
    id: "B",
    issue: 146,
    paths: [
      "apps/web/src/components/PersonaHome.tsx",
      "apps/web/src/components/persona-home.module.css",
      "apps/web/src/components/HmlPhaseOne.tsx",
      "apps/web/src/components/hml-phase-one.module.css",
      "apps/web/src/components/ChurchDashboard.tsx",
      "apps/web/src/components/church-dashboard.module.css",
      "apps/web/src/app/app/page.tsx",
    ],
  },
  {
    id: "C",
    issue: 147,
    paths: [
      "apps/web/src/components/ChurchCredentials.tsx",
      "apps/web/src/components/church-credentials.module.css",
      "apps/web/src/components/credentials/",
      "apps/api/src/credentials/",
    ],
  },
  {
    id: "D",
    issue: 148,
    paths: [
      "apps/web/src/components/MinistryWorkspace.tsx",
      "apps/web/src/components/ministry-workspace.module.css",
      "apps/web/src/components/MinistryDeskPage.tsx",
      "apps/web/src/components/MinistryMembershipCatalog.tsx",
      "apps/web/src/components/ministerio-em-foco.module.css",
      "apps/web/src/components/ministry/",
      "apps/web/src/app/app/ministerios/",
    ],
  },
  {
    id: "E",
    issue: 149,
    paths: [
      "packages/db/prisma/seeds/",
      "apps/web/public/images/synthetic/",
      "scripts/hml/presentation/",
    ],
  },
  {
    id: "F",
    issue: 150,
    paths: [
      "apps/web/src/components/TreasuryPanel.tsx",
      "apps/web/src/components/treasury-panel.module.css",
      "apps/web/src/components/FinanceBoard.tsx",
      "apps/web/src/components/finance-board.module.css",
      "apps/web/src/components/reports/",
      "apps/web/src/app/app/tesouraria/",
      "apps/web/src/app/app/relatorios/",
      "apps/api/src/reports/",
    ],
  },
  {
    id: "G",
    issue: 151,
    paths: [
      "apps/web/src/components/EventsBoard.tsx",
      "apps/web/src/components/events-management/",
      "apps/web/src/components/EventRegistrations.tsx",
      "apps/web/src/components/EditorialStudio.tsx",
      "apps/web/src/components/SiteManager.tsx",
      "apps/web/src/app/app/eventos-gestao/",
      "apps/web/src/app/app/editorial/",
      "apps/web/src/app/app/site/",
    ],
  },
  {
    id: "H",
    issue: 152,
    paths: [
      "apps/web/src/components/ui/",
      "apps/web/src/app/globals.css",
    ],
  },
  {
    id: "I",
    issue: 153,
    paths: ["qa/", "e2e/"],
  },
  {
    id: "J",
    issue: REVITALIZATION_INTEGRATOR_ISSUE,
    paths: [
      "packages/db/prisma/schema.prisma",
      "packages/db/prisma/migrations/",
      "packages/shared/",
      "scripts/hml/release-",
      ".github/",
      "docs/revitalizacao-144/",
    ],
  },
];

export interface FrontDelivery {
  id: RevitalizationFrontId;
  issue: number;
  pullRequest: number | null;
  acceptance: ReleaseStatus;
  evidence: string;
}

export interface SeedObservation {
  attempted: boolean;
  database: string | null;
  personsBefore: number | null;
  personsAfter: number | null;
  passwordsReset: boolean;
}

export interface RevitalizationObservation {
  expectedSourceSha: string;
  pagesSourceSha: string | null;
  apiSourceSha: string | null;
  apiContractVersion: string | null;
  expectedContractVersion: string;
  ministryMembershipTableReady: boolean | null;
  fronts: FrontDelivery[];
  personas: Array<{ id: PersonaId; status: ReleaseStatus; evidence: string }>;
  userFacing501Count: number | null;
  localStorageFallbackCount: number | null;
  seed: SeedObservation;
  deployAuthorized: boolean;
}

export interface RevitalizationVerdict {
  phase: "EM_EXECUCAO" | "PRONTO_PARA_HOMOLOGACAO";
  releaseComplete: boolean;
  checks: ReleaseCheck[];
}

export interface CredentialPreviewModel {
  personId: string;
  membershipId: string | null;
  displayName: string;
  statusLabel: string;
  photoUrl: string | null;
  revoked: boolean;
}

export interface MinistryNavItem {
  ministryId: string;
  name: string;
  slug: string;
}

export type MigrateMode = "dry-run" | "status" | "apply";

export interface MigrateDecision {
  exitCode: 0 | 2;
  action: "refuse" | "dry-run" | "status" | "apply";
  database: string | null;
  message: string;
}

const SAFE_DATABASE = /^[A-Za-z0-9_-]+$/;

function normalizeRepoPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function pathMatches(path: string, owned: string): boolean {
  if (owned.endsWith("/") || owned.endsWith("-")) return path.startsWith(owned);
  return path === owned;
}

export function ownersOfPath(path: string): Array<RevitalizationFrontOwnership["id"]> {
  const normalized = normalizeRepoPath(path);
  const owners = REVITALIZATION_OWNERSHIP.filter((front) =>
    front.paths.some((owned) => pathMatches(normalized, owned)),
  ).map((front) => front.id);
  if (
    normalized.startsWith("scripts/hml/") &&
    normalized.includes("seed") &&
    !normalized.includes("release-") &&
    !owners.includes("E")
  ) {
    owners.push("E");
  }
  return owners;
}

export function databaseNameFromUrl(databaseUrl: string): string | null {
  const trimmed = databaseUrl.trim();
  if (!trimmed) return null;
  try {
    const normalized = trimmed.replace(/^postgresql:/i, "http:").replace(/^postgres:/i, "http:");
    const url = new URL(normalized);
    const name = decodeURIComponent(url.pathname.replace(/^\//, "").split("/")[0] ?? "");
    return SAFE_DATABASE.test(name) ? name : null;
  } catch {
    return null;
  }
}

export function decideHmlMigrate(input: {
  databaseUrl: string | undefined;
  mode: MigrateMode;
  confirm: string | undefined;
  seedRequested: boolean;
}): MigrateDecision {
  const database = input.databaseUrl ? databaseNameFromUrl(input.databaseUrl) : null;
  if (database !== HML_DATABASE) {
    return {
      exitCode: 2,
      action: "refuse",
      database,
      message:
        "BLOQUEADO: o banco alvo não é o Neon isolado idriacho1_hml. Nenhuma migração foi executada.",
    };
  }
  if (input.seedRequested) {
    return {
      exitCode: 2,
      action: "refuse",
      database,
      message:
        "BLOQUEADO: este comando não aplica massa de homologação nem altera senhas.",
    };
  }
  if (input.mode === "dry-run") {
    return {
      exitCode: 0,
      action: "dry-run",
      database,
      message:
        "DRY-RUN: prisma migrate deploy não foi executado. O nome do banco é idriacho1_hml. Nenhuma linha foi lida ou escrita.",
    };
  }
  if (input.mode === "status") {
    return {
      exitCode: 0,
      action: "status",
      database,
      message: "STATUS: a consulta de migração fica restrita a idriacho1_hml.",
    };
  }
  if (input.confirm !== HML_DATABASE) {
    return {
      exitCode: 2,
      action: "refuse",
      database,
      message: "BLOQUEADO: apply exige CONFIRM_HML_MIGRATE=idriacho1_hml. Nada foi aplicado.",
    };
  }
  return {
    exitCode: 0,
    action: "apply",
    database,
    message:
      "APPLY: prisma migrate deploy autorizado somente em idriacho1_hml. Seed e senha permanecem intocados.",
  };
}

const DROPPED_CREDENTIAL_KEYS = new Set([
  "cpf",
  "document",
  "documentnumber",
  "phone",
  "telephone",
  "email",
  "password",
  "token",
]);

export function toCredentialPreview(input: Record<string, unknown>): CredentialPreviewModel | null {
  const personId = typeof input.personId === "string" ? input.personId.trim() : "";
  const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
  if (!personId || !displayName) return null;
  const membershipId = typeof input.membershipId === "string" && input.membershipId.trim()
    ? input.membershipId.trim()
    : null;
  const statusLabel = typeof input.statusLabel === "string" && input.statusLabel.trim()
    ? input.statusLabel.trim()
    : "Situação não informada";
  const photoUrl = typeof input.photoUrl === "string" && input.photoUrl.trim()
    ? input.photoUrl.trim()
    : null;
  return {
    personId,
    membershipId,
    displayName,
    statusLabel,
    photoUrl,
    revoked: input.revoked === true,
  };
}

export function credentialPreviewLeaksSensitive(
  input: Record<string, unknown>,
  preview: CredentialPreviewModel,
): boolean {
  const serialized = JSON.stringify(preview).toLowerCase();
  for (const [key, value] of Object.entries(input)) {
    if (!DROPPED_CREDENTIAL_KEYS.has(key.toLowerCase())) continue;
    if (typeof value !== "string" || value.trim().length < 4) continue;
    if (serialized.includes(value.trim().toLowerCase())) return true;
  }
  return false;
}

export function ministryNavItems(
  rows: ReadonlyArray<Record<string, unknown>>,
): MinistryNavItem[] {
  const seen = new Set<string>();
  const items: MinistryNavItem[] = [];
  for (const row of rows) {
    const ministryId = typeof row.ministryId === "string"
      ? row.ministryId.trim()
      : typeof row.id === "string"
        ? row.id.trim()
        : "";
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const slug = typeof row.slug === "string" ? row.slug.trim() : "";
    if (!ministryId || !name || !slug || seen.has(ministryId)) continue;
    seen.add(ministryId);
    items.push({ ministryId, name, slug });
  }
  return items;
}

function seedCheck(seed: SeedObservation): { status: ReleaseStatus; evidence: string } {
  if (!seed.attempted) {
    return {
      status: "BLOCKED",
      evidence:
        "A massa sintética da frente E ainda não foi aplicada. O integrador não grava no Neon sem o script revisado, dry-run e backup.",
    };
  }
  if (seed.database !== HML_DATABASE) {
    return {
      status: "FAIL",
      evidence: "A massa foi recusada porque o banco não é idriacho1_hml.",
    };
  }
  if (seed.passwordsReset) {
    return {
      status: "FAIL",
      evidence: "A operação pediu reset de senha. Isso é proibido nesta rodada.",
    };
  }
  if (
    seed.personsBefore === null ||
    seed.personsAfter === null ||
    seed.personsBefore < PRESERVED_HML_PERSON_BASELINE ||
    seed.personsAfter < seed.personsBefore
  ) {
    return {
      status: "FAIL",
      evidence: `A contagem de pessoas não preserva a base de ${PRESERVED_HML_PERSON_BASELINE}. Antes=${seed.personsBefore ?? "ausente"}; depois=${seed.personsAfter ?? "ausente"}.`,
    };
  }
  return {
    status: "PASS",
    evidence: `Massa aditiva em idriacho1_hml. Pessoas ${seed.personsBefore} → ${seed.personsAfter}. Senhas inalteradas.`,
  };
}

export function evaluateRevitalization144(obs: RevitalizationObservation): RevitalizationVerdict {
  const checks: ReleaseCheck[] = [];
  const add = (id: string, front: string, status: ReleaseStatus, evidence: string) => {
    checks.push({ id, front, status, evidence });
  };

  const sameSha =
    obs.pagesSourceSha !== null &&
    obs.apiSourceSha !== null &&
    obs.pagesSourceSha === obs.expectedSourceSha &&
    obs.apiSourceSha === obs.expectedSourceSha;
  if (obs.pagesSourceSha === null || obs.apiSourceSha === null) {
    add(
      "same-sha",
      "J",
      "BLOCKED",
      "Pages ou API HML ainda não anunciam sourceSha. Merge e deploy permanecem fechados.",
    );
  } else if (sameSha) {
    add("same-sha", "J", "PASS", `Pages e API HML estão no SHA ${obs.expectedSourceSha}.`);
  } else {
    add(
      "same-sha",
      "J",
      "FAIL",
      `SHA divergente. Pages=${obs.pagesSourceSha}; API=${obs.apiSourceSha}; commit=${obs.expectedSourceSha}.`,
    );
  }

  if (obs.apiContractVersion === null) {
    add("api-contract", "J", "BLOCKED", "GET /meta não trouxe contractVersion.");
  } else if (obs.apiContractVersion === obs.expectedContractVersion) {
    add("api-contract", "J", "PASS", `A API HML anuncia o contrato ${obs.apiContractVersion}.`);
  } else {
    add(
      "api-contract",
      "J",
      "FAIL",
      `A API HML anuncia ${obs.apiContractVersion} e este commit está em ${obs.expectedContractVersion}.`,
    );
  }

  if (obs.ministryMembershipTableReady === null) {
    add(
      "ministry-table",
      "J",
      "BLOCKED",
      "A tabela ministry_memberships não foi consultada no Neon idriacho1_hml. O 501 de vínculo formal continua possível até essa prova.",
    );
  } else if (obs.ministryMembershipTableReady) {
    add("ministry-table", "J", "PASS", "ministry_memberships existe em idriacho1_hml.");
  } else {
    add(
      "ministry-table",
      "J",
      "FAIL",
      "idriacho1_hml não tem ministry_memberships. O vínculo formal responde 501 até a migração aditiva.",
    );
  }

  if (obs.userFacing501Count === null) {
    add("user-501", "J", "BLOCKED", "O inventário de 501 visível ao usuário não foi gerado.");
  } else if (obs.userFacing501Count === 0) {
    add("user-501", "J", "PASS", "Nenhuma tela usual anuncia HTTP 501.");
  } else {
    add(
      "user-501",
      "J",
      "FAIL",
      `${obs.userFacing501Count} ocorrência(s) de 501 em tela usual. A frente dona do arquivo precisa ocultar ou substituir a ação.`,
    );
  }

  if (obs.localStorageFallbackCount === null) {
    add("local-fallback", "J", "BLOCKED", "O inventário de localStorage não foi gerado.");
  } else if (obs.localStorageFallbackCount === 0) {
    add("local-fallback", "J", "PASS", "Não há fallback de cadastro em localStorage no produto.");
  } else {
    add(
      "local-fallback",
      "J",
      "FAIL",
      `${obs.localStorageFallbackCount} fallback(s) de localStorage ainda alimentam tela. Não apagar enquanto a frente dona importar.`,
    );
  }

  const seed = seedCheck(obs.seed);
  add("seed-preserve", "E", seed.status, seed.evidence);

  if (obs.fronts.length !== REVITALIZATION_FRONT_IDS.length) {
    add("fronts-present", "J", "BLOCKED", "O relato das frentes A–I não está completo.");
  }
  for (const id of REVITALIZATION_FRONT_IDS) {
    const front = obs.fronts.find((item) => item.id === id);
    if (!front) {
      add(`front-${id}`, id, "BLOCKED", `A frente ${id} não foi relatada.`);
      continue;
    }
    if (front.pullRequest === null || front.acceptance !== "PASS") {
      add(`front-${id}`, id, front.acceptance === "FAIL" ? "FAIL" : "BLOCKED", front.evidence);
      continue;
    }
    add(`front-${id}`, id, "PASS", front.evidence);
  }

  if (obs.personas.length !== HML_PERSONAS.length) {
    add("personas-present", "I", "BLOCKED", "A matriz não cobre as oito personas.");
  }
  for (const persona of obs.personas) {
    add(`persona-${persona.id}`, "I", persona.status, persona.evidence);
  }

  const productReady = checks.every((check) => check.status === "PASS");
  if (!obs.deployAuthorized) {
    add(
      "deploy",
      "J",
      "BLOCKED",
      "Merge em main e deploy de Pages/API HML seguem fechados. O gate não publica sozinho.",
    );
  } else if (!productReady) {
    add("deploy", "J", "BLOCKED", "Há autorização de deploy, mas ainda existe FAIL ou BLOCKED de produto.");
  } else {
    add("deploy", "J", "PASS", "Deploy autorizado depois de todos os checks de produto.");
  }

  const releaseComplete = checks.every((check) => check.status === "PASS");
  return {
    phase: releaseComplete ? "PRONTO_PARA_HOMOLOGACAO" : "EM_EXECUCAO",
    releaseComplete,
    checks,
  };
}
