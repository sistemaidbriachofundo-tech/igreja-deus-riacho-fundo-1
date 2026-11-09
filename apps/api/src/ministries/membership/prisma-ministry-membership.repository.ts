import type { PrismaService } from "../../prisma/prisma.service";
import {
  isFormalRole,
  isFormalStatus,
  type MembershipAudit,
  type MembershipScope,
  type MembershipSource,
  type ScopedInterest,
  type StoredMembership,
} from "./ministry-membership.model";
import type {
  MembershipProbe,
  MinistryMembershipRepository,
} from "./ministry-membership.repository";

const PROBE_SQL = "SELECT to_regclass('public.ministry_memberships') AS regclass";

const MEMBER_COLUMNS = `
  m.id,
  m.organization_id AS "organizationId",
  m.church_id AS "churchId",
  m.ministry_id AS "ministryId",
  m.person_id AS "personId",
  p.display_name AS "displayName",
  m.role,
  m.status,
  m.source,
  m.volunteer_interest_id AS "volunteerInterestId",
  m.started_at AS "startedAt",
  m.ended_at AS "endedAt"`;

export const MEMBERSHIP_LIST_SQL = `
SELECT ${MEMBER_COLUMNS}
FROM ministry_memberships m
INNER JOIN persons p
  ON p.id = m.person_id
 AND p.organization_id = m.organization_id
WHERE m.organization_id = $1
  AND m.church_id = $2
  AND m.ministry_id = $3`;

const MEMBERSHIP_BY_ID_SQL = `${MEMBERSHIP_LIST_SQL}
  AND m.id = $4`;

const MEMBERSHIP_BY_PERSON_SQL = `${MEMBERSHIP_LIST_SQL}
  AND m.person_id = $4`;

const MEMBERSHIP_UPSERT_SQL = `
INSERT INTO ministry_memberships (
  id, organization_id, church_id, ministry_id, person_id,
  role, status, source, volunteer_interest_id, started_at, ended_at, updated_at
) VALUES (
  $1, $2, $3, $4, $5,
  $6, $7, $8, $9, $10, $11, NOW()
)
ON CONFLICT (ministry_id, person_id) DO UPDATE SET
  role = EXCLUDED.role,
  status = EXCLUDED.status,
  source = EXCLUDED.source,
  volunteer_interest_id = EXCLUDED.volunteer_interest_id,
  ended_at = EXCLUDED.ended_at,
  updated_at = NOW()
WHERE ministry_memberships.organization_id = EXCLUDED.organization_id
  AND ministry_memberships.church_id = EXCLUDED.church_id
RETURNING id`;

type QueryClient = {
  $queryRawUnsafe?: (query: string, ...values: unknown[]) => Promise<unknown>;
  person: {
    findFirst: (args: {
      where: Record<string, unknown>;
      select: { id: true; displayName: true };
    }) => Promise<{ id: string; displayName: string } | null>;
  };
  volunteerInterest: {
    findFirst: (args: {
      where: Record<string, unknown>;
      select: {
        id: true;
        organizationId: true;
        churchId: true;
        ministryId: true;
        personId: true;
        stage: true;
        status: true;
      };
    }) => Promise<ScopedInterest | null>;
  };
  auditLog: {
    create: (args: {
      data: {
        actorUserId: string;
        action: string;
        resourceType: string;
        resourceId: string;
        organizationId: string;
        churchId: string;
        metadata: Record<string, string | null>;
      };
      select: { id: true };
    }) => Promise<{ id: string }>;
  };
};

/**
 * Adaptador PostgreSQL. Sem a tabela `ministry_memberships`, a sonda responde
 * schema_blocked e nenhum comando de escrita é emitido.
 */
export class PrismaMinistryMembershipRepository implements MinistryMembershipRepository {
  constructor(private readonly prisma: QueryClient) {}

  async probe(): Promise<MembershipProbe> {
    if (typeof this.prisma.$queryRawUnsafe !== "function") return "schema_blocked";
    try {
      const rows = await this.prisma.$queryRawUnsafe(PROBE_SQL);
      const first = Array.isArray(rows) ? (rows[0] as { regclass?: unknown } | undefined) : undefined;
      return first?.regclass ? "ready" : "schema_blocked";
    } catch {
      return "schema_blocked";
    }
  }

  async list(scope: MembershipScope) {
    return this.query(MEMBERSHIP_LIST_SQL, [
      scope.organizationId,
      scope.churchId,
      scope.ministryId,
    ]);
  }

  async findById(scope: MembershipScope, membershipId: string) {
    const rows = await this.query(MEMBERSHIP_BY_ID_SQL, [
      scope.organizationId,
      scope.churchId,
      scope.ministryId,
      membershipId,
    ]);
    return rows[0] ?? null;
  }

  async findByPerson(scope: MembershipScope, personId: string) {
    const rows = await this.query(MEMBERSHIP_BY_PERSON_SQL, [
      scope.organizationId,
      scope.churchId,
      scope.ministryId,
      personId,
    ]);
    return rows[0] ?? null;
  }

  async save(row: StoredMembership) {
    const query = this.prisma.$queryRawUnsafe;
    if (typeof query !== "function") return null;
    const written = await query(
      MEMBERSHIP_UPSERT_SQL,
      row.id,
      row.organizationId,
      row.churchId,
      row.ministryId,
      row.personId,
      row.role,
      row.status,
      row.source,
      row.volunteerInterestId,
      new Date(row.startedAt),
      row.endedAt ? new Date(row.endedAt) : null,
    );
    const returned = Array.isArray(written) ? written[0] : null;
    if (!returned || typeof (returned as { id?: unknown }).id !== "string") return null;
    return this.findById(
      {
        organizationId: row.organizationId,
        churchId: row.churchId,
        ministryId: row.ministryId,
      },
      row.id,
    );
  }

  async findPerson(scope: MembershipScope, personId: string) {
    return this.prisma.person.findFirst({
      where: {
        id: personId,
        organizationId: scope.organizationId,
        status: "ACTIVE",
        OR: [
          { homeChurchId: scope.churchId },
          {
            memberships: {
              some: {
                organizationId: scope.organizationId,
                churchId: scope.churchId,
                status: "ACTIVE",
              },
            },
          },
        ],
      },
      select: { id: true, displayName: true },
    });
  }

  async findInterest(scope: MembershipScope, interestId: string) {
    return this.prisma.volunteerInterest.findFirst({
      where: {
        id: interestId,
        organizationId: scope.organizationId,
        churchId: scope.churchId,
        ministryId: scope.ministryId,
      },
      select: {
        id: true,
        organizationId: true,
        churchId: true,
        ministryId: true,
        personId: true,
        stage: true,
        status: true,
      },
    });
  }

  async recordAudit(entry: MembershipAudit) {
    return this.prisma.auditLog.create({
      data: {
        actorUserId: entry.actorUserId,
        action: entry.action,
        resourceType: "ministry_membership",
        resourceId: entry.resourceId,
        organizationId: entry.organizationId,
        churchId: entry.churchId,
        metadata: entry.metadata,
      },
      select: { id: true },
    });
  }

  private async query(sql: string, values: unknown[]): Promise<StoredMembership[]> {
    const query = this.prisma.$queryRawUnsafe;
    if (typeof query !== "function") return [];
    const rows = await query(sql, ...values);
    if (!Array.isArray(rows)) return [];
    return rows.flatMap((row) => {
      const parsed = parseRow(row);
      return parsed ? [parsed] : [];
    });
  }
}

function asIso(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseRow(value: unknown): StoredMembership | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const role = text(row.role);
  const status = text(row.status);
  const source = text(row.source);
  const startedAt = asIso(row.startedAt);
  if (!isFormalRole(role) || !isFormalStatus(status) || !startedAt) return null;
  if (source !== "DIRETO" && source !== "CONVERSAO_INTERESSE") return null;
  const id = text(row.id);
  const organizationId = text(row.organizationId);
  const churchId = text(row.churchId);
  const ministryId = text(row.ministryId);
  const personId = text(row.personId);
  const displayName = text(row.displayName);
  if (!id || !organizationId || !churchId || !ministryId || !personId || !displayName) {
    return null;
  }
  const membershipSource: MembershipSource = source;
  return {
    id,
    organizationId,
    churchId,
    ministryId,
    personId,
    displayName,
    role,
    status,
    source: membershipSource,
    volunteerInterestId: text(row.volunteerInterestId) || null,
    startedAt,
    endedAt: asIso(row.endedAt),
  };
}

export function assertRepositoryCompatible(prisma: PrismaService): QueryClient {
  return prisma as unknown as QueryClient;
}
