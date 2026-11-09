import { randomUUID } from "node:crypto";
import {
  auditMetadata,
  inScope,
  isFormalRole,
  projectMember,
  type FormalRole,
  type MembershipScope,
  type MembershipSource,
  type PublicMember,
  type StoredMembership,
} from "./ministry-membership.model";
import type { MinistryMembershipRepository } from "./ministry-membership.repository";

export type TeamRead =
  | { outcome: "schema_blocked" }
  | { outcome: "ok"; members: PublicMember[] };

export type TeamWrite =
  | { outcome: "schema_blocked" }
  | { outcome: "created" | "ended" | "reactivated"; member: PublicMember; auditId: string }
  | { outcome: "conflict" }
  | { outcome: "already_ended" }
  | { outcome: "not_found" }
  | { outcome: "person_not_in_scope" }
  | { outcome: "interest_not_found" }
  | { outcome: "interest_other_ministry" }
  | { outcome: "interest_without_person" }
  | { outcome: "invalid_role" }
  | { outcome: "persist_rejected" };

const OPEN_STATUSES = new Set(["ATIVO", "CONVIDADO", "PAUSADO"]);

/**
 * Regras do vínculo formal.
 * A etapa do interesse de voluntariado não é lida como equipe e não é alterada aqui.
 */
export class MinistryTeamService {
  constructor(
    private readonly repository: MinistryMembershipRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async read(scope: MembershipScope): Promise<TeamRead> {
    if ((await this.repository.probe()) !== "ready") return { outcome: "schema_blocked" };
    const rows = await this.repository.list(scope);
    return {
      outcome: "ok",
      members: rows.filter((row) => inScope(row, scope)).map(projectMember),
    };
  }

  async admit(
    scope: MembershipScope,
    actorUserId: string,
    personId: string,
    role: string,
  ): Promise<TeamWrite> {
    const blocked = await this.blocked();
    if (blocked) return blocked;
    if (!isFormalRole(role)) return { outcome: "invalid_role" };
    const normalizedPerson = personId.trim();
    if (!normalizedPerson) return { outcome: "invalid_role" };
    const person = await this.repository.findPerson(scope, normalizedPerson);
    if (!person) return { outcome: "person_not_in_scope" };
    return this.upsert(scope, actorUserId, {
      personId: person.id,
      displayName: person.displayName,
      role,
      source: "DIRETO",
      volunteerInterestId: null,
    });
  }

  async convert(
    scope: MembershipScope,
    actorUserId: string,
    volunteerInterestId: string,
  ): Promise<TeamWrite> {
    const blocked = await this.blocked();
    if (blocked) return blocked;
    const interestId = volunteerInterestId.trim();
    if (!interestId) return { outcome: "interest_not_found" };
    const interest = await this.repository.findInterest(scope, interestId);
    if (!interest) return { outcome: "interest_not_found" };
    if (
      interest.organizationId !== scope.organizationId ||
      interest.churchId !== scope.churchId ||
      interest.ministryId !== scope.ministryId
    ) {
      return { outcome: "interest_other_ministry" };
    }
    if (!interest.personId) return { outcome: "interest_without_person" };
    const person = await this.repository.findPerson(scope, interest.personId);
    if (!person) return { outcome: "person_not_in_scope" };
    return this.upsert(scope, actorUserId, {
      personId: person.id,
      displayName: person.displayName,
      role: "INTEGRANTE",
      source: "CONVERSAO_INTERESSE",
      volunteerInterestId: interest.id,
    });
  }

  async end(
    scope: MembershipScope,
    actorUserId: string,
    membershipId: string,
  ): Promise<TeamWrite> {
    const blocked = await this.blocked();
    if (blocked) return blocked;
    const id = membershipId.trim();
    if (!id) return { outcome: "not_found" };
    const current = await this.repository.findById(scope, id);
    if (!current || !inScope(current, scope)) return { outcome: "not_found" };
    if (current.status === "ENCERRADO") return { outcome: "already_ended" };
    const ended: StoredMembership = {
      ...current,
      status: "ENCERRADO",
      endedAt: this.now().toISOString(),
    };
    const saved = await this.repository.save(ended);
    if (!saved || saved.status !== "ENCERRADO") return { outcome: "persist_rejected" };
    const auditId = await this.audit(scope, actorUserId, "ministry_membership.end", saved, current.status);
    return { outcome: "ended", member: projectMember(saved), auditId };
  }

  private async blocked(): Promise<{ outcome: "schema_blocked" } | null> {
    if ((await this.repository.probe()) !== "ready") return { outcome: "schema_blocked" };
    return null;
  }

  private async upsert(
    scope: MembershipScope,
    actorUserId: string,
    input: {
      personId: string;
      displayName: string;
      role: FormalRole;
      source: MembershipSource;
      volunteerInterestId: string | null;
    },
  ): Promise<TeamWrite> {
    const displayName = input.displayName.trim();
    if (!displayName) return { outcome: "person_not_in_scope" };
    const existing = await this.repository.findByPerson(scope, input.personId);
    if (existing && !inScope(existing, scope)) return { outcome: "persist_rejected" };
    if (existing && OPEN_STATUSES.has(existing.status)) return { outcome: "conflict" };

    const reactivated = existing?.status === "ENCERRADO" ? existing : null;
    const row: StoredMembership = {
      id: reactivated ? reactivated.id : `mmb_${randomUUID()}`,
      organizationId: scope.organizationId,
      churchId: scope.churchId,
      ministryId: scope.ministryId,
      personId: input.personId,
      displayName,
      role: input.role,
      status: "ATIVO",
      source: input.source,
      volunteerInterestId: input.volunteerInterestId,
      startedAt: reactivated ? reactivated.startedAt : this.now().toISOString(),
      endedAt: null,
    };
    const saved = await this.repository.save(row);
    if (!saved || !inScope(saved, scope) || saved.status !== "ATIVO") {
      return { outcome: "persist_rejected" };
    }
    const action = reactivated
      ? "ministry_membership.reactivate"
      : input.source === "CONVERSAO_INTERESSE"
        ? "ministry_membership.convert_interest"
        : "ministry_membership.admit";
    const auditId = await this.audit(
      scope,
      actorUserId,
      action,
      saved,
      reactivated ? "ENCERRADO" : null,
    );
    return {
      outcome: reactivated ? "reactivated" : "created",
      member: projectMember(saved),
      auditId,
    };
  }

  private async audit(
    scope: MembershipScope,
    actorUserId: string,
    action: string,
    row: StoredMembership,
    previousStatus: string | null,
  ) {
    const recorded = await this.repository.recordAudit({
      actorUserId,
      action,
      resourceId: row.id,
      organizationId: scope.organizationId,
      churchId: scope.churchId,
      metadata: auditMetadata({
        ministryId: scope.ministryId,
        personId: row.personId,
        role: row.role,
        status: row.status,
        previousStatus,
        source: row.source,
        volunteerInterestId: row.volunteerInterestId,
      }),
    });
    return recorded.id;
  }
}
