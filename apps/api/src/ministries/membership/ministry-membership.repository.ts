import { randomUUID } from "node:crypto";
import type {
  MembershipAudit,
  MembershipScope,
  ScopedInterest,
  ScopedPerson,
  StoredMembership,
} from "./ministry-membership.model";
import { inScope } from "./ministry-membership.model";

export type MembershipProbe = "ready" | "schema_blocked";

/**
 * Porta de persistência do vínculo formal.
 * Não cria pessoa, não avança etapa de voluntariado e não lê o ledger.
 */
export interface MinistryMembershipRepository {
  probe(): Promise<MembershipProbe>;
  list(scope: MembershipScope): Promise<StoredMembership[]>;
  findById(scope: MembershipScope, membershipId: string): Promise<StoredMembership | null>;
  findByPerson(scope: MembershipScope, personId: string): Promise<StoredMembership | null>;
  save(row: StoredMembership): Promise<StoredMembership | null>;
  findPerson(scope: MembershipScope, personId: string): Promise<ScopedPerson | null>;
  findInterest(scope: MembershipScope, interestId: string): Promise<ScopedInterest | null>;
  recordAudit(entry: MembershipAudit): Promise<{ id: string }>;
}

type MemoryPerson = ScopedPerson & MembershipScope;
type MemoryInterest = ScopedInterest;

/** Repositório isolado usado pelos testes de persistência. Não é o adaptador de produção. */
export class MemoryMinistryMembershipRepository implements MinistryMembershipRepository {
  probeState: MembershipProbe = "ready";
  readonly members: StoredMembership[] = [];
  readonly people: MemoryPerson[] = [];
  readonly interests: MemoryInterest[] = [];
  readonly audits: Array<MembershipAudit & { id: string }> = [];
  readonly listCalls: MembershipScope[] = [];
  interestReads = 0;
  stageWrites = 0;
  peopleCreated = 0;

  async probe(): Promise<MembershipProbe> {
    return this.probeState;
  }

  async list(scope: MembershipScope): Promise<StoredMembership[]> {
    this.listCalls.push(scope);
    return this.members.filter((row) => inScope(row, scope));
  }

  async findById(scope: MembershipScope, membershipId: string) {
    return (
      this.members.find((row) => row.id === membershipId && inScope(row, scope)) ?? null
    );
  }

  async findByPerson(scope: MembershipScope, personId: string) {
    return (
      this.members.find((row) => row.personId === personId && inScope(row, scope)) ?? null
    );
  }

  async save(row: StoredMembership): Promise<StoredMembership | null> {
    const index = this.members.findIndex(
      (item) => item.ministryId === row.ministryId && item.personId === row.personId,
    );
    if (index >= 0) {
      const current = this.members[index];
      if (!current || !inScope(current, row)) return null;
      this.members[index] = row;
      return row;
    }
    this.members.push(row);
    return row;
  }

  async findPerson(scope: MembershipScope, personId: string) {
    const person = this.people.find(
      (item) =>
        item.id === personId &&
        item.organizationId === scope.organizationId &&
        item.churchId === scope.churchId,
    );
    if (!person) return null;
    return { id: person.id, displayName: person.displayName };
  }

  async findInterest(scope: MembershipScope, interestId: string) {
    this.interestReads += 1;
    return (
      this.interests.find(
        (item) =>
          item.id === interestId &&
          item.organizationId === scope.organizationId &&
          item.churchId === scope.churchId &&
          item.ministryId === scope.ministryId,
      ) ?? null
    );
  }

  async recordAudit(entry: MembershipAudit) {
    const stored = { ...entry, id: `aud_${randomUUID()}` };
    this.audits.push(stored);
    return { id: stored.id };
  }
}
