import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import type { AuthUser } from "../auth/types/auth-user";
import { PersonalRosterService } from "./personal-roster.service";

const ORG = "org-1";
const CHURCH = "church-1";

type Assignment = {
  id: string;
  slotId: string;
  personId: string;
  partnerPersonId: string | null;
  status: string;
  substituteForId: string | null;
  confirmedAt: Date | null;
  declinedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const louvorMinistry = {
  id: "min-louvor",
  name: "Louvor",
  slug: "louvor",
  leaderPersonId: "per-lider",
  organizationId: ORG,
  churchId: CHURCH,
};
const atmosferaMinistry = {
  id: "min-atmosfera",
  name: "Atmosfera",
  slug: "atmosfera",
  leaderPersonId: "per-atmosfera",
  organizationId: ORG,
  churchId: CHURCH,
};

function rosterOf(slotId: string) {
  if (slotId === "slot-voz") {
    return {
      id: "roster-louvor",
      organizationId: ORG,
      churchId: CHURCH,
      ministryId: "min-louvor",
      title: "Louvor domingo",
      serviceAt: new Date("2026-11-15T21:00:00.000Z"),
      status: "PUBLISHED",
      ministry: louvorMinistry,
    };
  }
  if (slotId === "slot-porta") {
    return {
      id: "roster-atmosfera",
      organizationId: ORG,
      churchId: CHURCH,
      ministryId: "min-atmosfera",
      title: "Atmosfera domingo",
      serviceAt: new Date("2026-11-15T23:00:00.000Z"),
      status: "PUBLISHED",
      ministry: atmosferaMinistry,
    };
  }
  return {
    id: "roster-fechada",
    organizationId: ORG,
    churchId: CHURCH,
    ministryId: "min-louvor",
    title: "Louvor encerrado",
    serviceAt: new Date("2026-11-22T21:00:00.000Z"),
    status: slotId === "slot-rascunho" ? "DRAFT" : "CLOSED",
    ministry: louvorMinistry,
  };
}

function slotOf(slotId: string) {
  const roster = rosterOf(slotId);
  return {
    id: slotId,
    roleLabel: slotId === "slot-porta" ? "Porta" : "Voz",
    requiresCouple: slotId === "slot-casal",
    sortOrder: 0,
    roster,
  };
}

function user(
  userId: string,
  personId: string,
  roleCode: string,
  ministryId?: string,
): AuthUser {
  return {
    userId,
    personId,
    email: `${personId}@example.test`,
    grants: [
      {
        roleCode: roleCode as AuthUser["grants"][number]["roleCode"],
        organizationId: ORG,
        churchId: CHURCH,
        ministryId: ministryId ?? null,
      },
    ],
  };
}

function codeOf(error: unknown): string {
  if (error && typeof error === "object" && "getResponse" in error) {
    const body = (error as { getResponse: () => unknown }).getResponse();
    if (body && typeof body === "object" && "code" in body) {
      return String((body as { code: unknown }).code);
    }
  }
  return "";
}

describe("agenda pessoal e escopo de escala", () => {
  const assignments: Assignment[] = [];
  const audits: Array<{ action: string; metadata: unknown }> = [];
  let seq = 1;
  let ministryReads = 0;

  const prisma = {
    rosterAssignment: {
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        assignments.filter((row) => matchesAssignment(row, where)).map(decorate),
      ),
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) => {
        const row = assignments.find((item) => item.id === where.id);
        return row ? decorate(row) : null;
      }),
      create: jest.fn(async ({ data }: { data: Partial<Assignment> }) => {
        const row: Assignment = {
          id: `asg-${seq++}`,
          slotId: String(data.slotId),
          personId: String(data.personId),
          partnerPersonId: data.partnerPersonId ?? null,
          status: String(data.status),
          substituteForId: data.substituteForId ?? null,
          confirmedAt: data.confirmedAt ?? null,
          declinedAt: data.declinedAt ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        assignments.push(row);
        return row;
      }),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<Assignment>;
        }) => {
          const row = assignments.find((item) => item.id === where.id);
          if (!row) throw new Error("atribuição ausente");
          Object.assign(row, data, { updatedAt: new Date() });
          return row;
        },
      ),
    },
    roster: {
      findMany: jest.fn(async ({ where }: { where: { ministryId: string } }) => {
        ministryReads += 1;
        const slots = ["slot-voz", "slot-porta", "slot-fechada"]
          .map(slotOf)
          .filter((slot) => slot.roster.ministryId === where.ministryId);
        const byRoster = new Map<string, ReturnType<typeof slotOf>[]>();
        for (const slot of slots) {
          const list = byRoster.get(slot.roster.id) ?? [];
          list.push(slot);
          byRoster.set(slot.roster.id, list);
        }
        return [...byRoster.values()].map((group) => ({
          ...group[0].roster,
          slots: group.map((slot) => ({
            ...slot,
            assignments: assignments.filter((row) => row.slotId === slot.id),
          })),
        }));
      }),
    },
    rosterSlot: {
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) => {
        if (!["slot-voz", "slot-porta", "slot-fechada"].includes(where.id)) {
          return null;
        }
        return slotOf(where.id);
      }),
    },
    ministryRosterModule: {
      findMany: jest.fn(async () => []),
    },
    ministry: {
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) => {
        return [louvorMinistry, atmosferaMinistry].find(
          (ministry) =>
            ministry.id === where.id &&
            ministry.organizationId === ORG &&
            ministry.churchId === CHURCH,
        ) ?? null;
      }),
    },
    person: {
      findFirst: jest.fn(async ({ where }: { where: { id: string; organizationId: string } }) =>
        where.organizationId === ORG && where.id.startsWith("per-")
          ? { id: where.id }
          : null,
      ),
    },
    volunteerAvailability: {
      findMany: jest.fn(async () => []),
    },
    volunteerImpediment: {
      findFirst: jest.fn(async () => null),
    },
    rosterCoupleException: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
    },
    auditLog: {
      create: jest.fn(async ({ data }: { data: { action: string; metadata: unknown } }) => {
        audits.push({ action: data.action, metadata: data.metadata });
        return { id: "audit" };
      }),
    },
  };
  const db = {
    ...prisma,
    $transaction: jest.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)),
  };

  const pilot = {
    getPilotChurch: jest.fn(async () => ({
      organizationId: ORG,
      churchId: CHURCH,
      organizationSlug: "id-riacho",
      churchSlug: "riacho-fundo-1",
      churchName: "Congregação sintética",
    })),
  };

  const service = new PersonalRosterService(db as never, pilot as never);
  const membro = user("usr-membro", "per-membro", "MEMBRO");
  const outro = user("usr-outro", "per-outro", "MEMBRO");
  const reserva = user("usr-reserva", "per-reserva", "MEMBRO");
  const liderLouvor = user("usr-lider", "per-lider", "LIDER_MINISTERIO", "min-louvor");
  const liderAtmosfera = user(
    "usr-atmosfera",
    "per-atmosfera",
    "LIDER_MINISTERIO",
    "min-atmosfera",
  );
  const secretaria = user("usr-sec", "per-sec", "SECRETARIA");

  beforeEach(() => {
    assignments.splice(0, assignments.length);
    audits.splice(0, audits.length);
    seq = 1;
    ministryReads = 0;
  });

  it("só mostra a designação ao voluntário depois da publicação", async () => {
    const slotId = "slot-rascunho";
    const slot = slotOf(slotId);
    prisma.rosterSlot.findFirst.mockResolvedValueOnce(slot).mockResolvedValueOnce(slot);
    const assignment = await service.assign(liderLouvor, slotId, { personId: membro.personId! });

    expect((await service.listMine(membro)).assignments).toEqual([]);
    await expect(service.confirm(membro, assignment.id)).rejects.toBeInstanceOf(ForbiddenException);
    expect(assignments[0]?.status).toBe("PENDING");
  });

  it("grava a designação, devolve só a agenda do JWT e confirma com persistência", async () => {
    const created = await service.assign(liderLouvor, "slot-voz", {
      personId: "per-membro",
    });
    expect(created).toMatchObject({
      status: "PENDING",
      personId: "per-membro",
      persisted: true,
      notified: false,
    });
    expect(assignments).toHaveLength(1);
    expect(audits[0]?.action).toBe("roster.assignment.create");

    const mine = await service.listMine(membro);
    expect(mine.personId).toBe("per-membro");
    expect(mine.source).toBe("jwt");
    expect(mine.notified).toBe(false);
    expect(mine.assignments.map((item) => item.id)).toEqual([created.id]);
    expect(mine.assignments[0]).toMatchObject({
      title: "Louvor domingo",
      ministrySlug: "louvor",
      status: "PENDING",
      sameDayConflict: false,
    });

    const foreign = await service.listMine(outro);
    expect(foreign.assignments).toEqual([]);
    expect(foreign.personId).toBe("per-outro");

    const confirmed = await service.confirm(membro, created.id);
    expect(confirmed).toMatchObject({
      status: "CONFIRMED",
      persisted: true,
      notified: false,
    });
    expect(confirmed.confirmedAt).toEqual(expect.any(String));
    expect(assignments[0]?.status).toBe("CONFIRMED");
    expect(assignments[0]?.confirmedAt).toBeInstanceOf(Date);

    const again = await service.listMine(membro);
    expect(again.assignments[0]?.status).toBe("CONFIRMED");
    expect(audits.map((item) => item.action)).toContain("roster.assignment.confirm");
  });

  it("recusa a mesma pessoa em outra posição no mesmo dia e isola o ministério do líder", async () => {
    await service.assign(liderLouvor, "slot-voz", { personId: "per-membro" });
    await expect(
      service.assign(liderAtmosfera, "slot-porta", { personId: "per-membro" }),
    ).rejects.toBeInstanceOf(ConflictException);
    try {
      await service.assign(liderAtmosfera, "slot-porta", { personId: "per-membro" });
    } catch (error) {
      expect(codeOf(error)).toBe("ROSTER_SAME_DAY");
    }
    expect(assignments).toHaveLength(1);

    const allowed = await service.assign(liderAtmosfera, "slot-porta", {
      personId: "per-outro",
    });
    const louvor = await service.listMinistry(liderLouvor, "min-louvor");
    expect(louvor.rosters.map((roster) => roster.title)).toEqual([
      "Louvor domingo",
      "Louvor encerrado",
    ]);
    expect(JSON.stringify(louvor)).not.toContain("per-outro");
    expect(JSON.stringify(louvor)).not.toContain("Atmosfera domingo");

    const readsBefore = ministryReads;
    await expect(
      service.listMinistry(liderLouvor, "min-atmosfera"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    try {
      await service.listMinistry(liderLouvor, "min-atmosfera");
    } catch (error) {
      expect(codeOf(error)).toBe("MINISTRY_SCOPE_FORBIDDEN");
    }
    expect(ministryReads).toBe(readsBefore);

    await expect(service.confirm(membro, allowed.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.confirm(liderLouvor, allowed.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(assignments.find((row) => row.id === allowed.id)?.status).toBe("PENDING");

    const secretariaView = await service.listMinistry(secretaria, "min-atmosfera");
    expect(secretariaView.rosters[0]?.title).toBe("Atmosfera domingo");
    expect(secretariaView.rosters[0]?.slots[0]?.assignments[0]?.personId).toBe(
      "per-outro",
    );
  });

  it("revalida o dia dentro da transação após outra designação vencer a corrida", async () => {
    await service.assign(liderLouvor, "slot-voz", { personId: "per-membro" });
    db.$transaction.mockClear();
    db.$transaction.mockRejectedValueOnce({ code: "P2034" });

    await expect(service.assign(liderAtmosfera, "slot-porta", { personId: "per-membro" }))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: "ROSTER_SAME_DAY" }) });

    expect(db.$transaction).toHaveBeenCalledTimes(2);
    expect(db.$transaction).toHaveBeenLastCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(assignments).toHaveLength(1);
    expect(audits).toHaveLength(1);
  });

  it("substitui com consentimento, sem notificação, e a pessoa nova confirma a própria linha", async () => {
    const original = await service.assign(liderLouvor, "slot-voz", {
      personId: "per-membro",
    });
    const replacement = await service.substitute(liderLouvor, original.id, {
      personId: "per-reserva",
    });
    expect(replacement).toMatchObject({
      status: "PENDING",
      personId: "per-reserva",
      substituteForId: original.id,
      requiresConsent: true,
      notified: false,
      persisted: true,
    });
    expect(assignments.find((row) => row.id === original.id)?.status).toBe(
      "SUBSTITUTED",
    );

    const previous = await service.listMine(membro);
    expect(previous.assignments[0]?.status).toBe("SUBSTITUTED");
    const next = await service.listMine(reserva);
    expect(next.assignments.map((item) => item.status)).toEqual(["PENDING"]);

    const accepted = await service.confirm(reserva, replacement.id);
    expect(accepted.status).toBe("CONFIRMED");
    expect(assignments.find((row) => row.id === replacement.id)?.status).toBe(
      "CONFIRMED",
    );
    expect(JSON.stringify(audits)).not.toMatch(/whatsapp|e-mail|email|push/i);
    expect(audits.every((item) => {
      const metadata = item.metadata as { notified?: boolean };
      return metadata.notified === false;
    })).toBe(true);
  });

  it("recusa confirmação alheia, sessão sem pessoa, escala fechada e função de casal sem par", async () => {
    await expect(service.listMine({ ...membro, personId: "" })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    try {
      await service.listMine({ ...membro, personId: "" });
    } catch (error) {
      expect(codeOf(error)).toBe("PERSON_REQUIRED");
    }

    await expect(
      service.assign(liderLouvor, "slot-fechada", { personId: "per-membro" }),
    ).rejects.toBeInstanceOf(ConflictException);

    const couple = slotOf("slot-casal");
    couple.requiresCouple = true;
    couple.roster = { ...rosterOf("slot-voz"), id: "roster-casal" };
    prisma.rosterSlot.findFirst.mockResolvedValueOnce(couple);
    await expect(
      service.assign(liderLouvor, "slot-casal", { personId: "per-membro" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    try {
      prisma.rosterSlot.findFirst.mockResolvedValueOnce(couple);
      await service.assign(liderLouvor, "slot-casal", { personId: "per-membro" });
    } catch (error) {
      expect(codeOf(error)).toBe("COUPLE_REQUIRED");
    }
  });

  it("marca as duas posições do mesmo dia na agenda e omite a pessoa alheia", async () => {
    const base = {
      partnerPersonId: null,
      substituteForId: null,
      confirmedAt: null,
      declinedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    assignments.push(
      { ...base, id: "asg-voz", slotId: "slot-voz", personId: "per-membro", status: "CONFIRMED" },
      { ...base, id: "asg-porta", slotId: "slot-porta", personId: "per-membro", status: "PENDING" },
      { ...base, id: "asg-alheia", slotId: "slot-porta", personId: "per-outro", status: "CONFIRMED" },
    );
    const mine = await service.listMine(membro);
    expect(mine.assignments.map((item) => item.id).sort()).toEqual(["asg-porta", "asg-voz"]);
    expect(mine.assignments.every((item) => item.sameDayConflict)).toBe(true);
    expect(JSON.stringify(mine)).not.toContain("per-outro");
  });

  it("o serviço desta frente não chama canal de mensagem", () => {
    const source = readFileSync(join(__dirname, "personal-roster.service.ts"), "utf8");
    expect(source).not.toMatch(/enqueueRosterAlert|ChannelsService|channels\.enqueue/);
  });
});

function decorate(row: Assignment) {
  return { ...row, slot: slotOf(row.slotId) };
}

function matchesAssignment(row: Assignment, where: Record<string, unknown>): boolean {
  const status = where.status as { in?: string[] } | undefined;
  if (status?.in && !status.in.includes(row.status)) return false;
  const id = where.id as { not?: string } | undefined;
  if (id?.not && row.id === id.not) return false;
  const clauses = where.OR as Array<Record<string, unknown>> | undefined;
  if (clauses && !clauses.some((clause) => matchesPersonClause(row, clause))) {
    return false;
  }
  const slot = where.slot as { roster?: Record<string, unknown> } | undefined;
  if (slot?.roster) {
    const roster = rosterOf(row.slotId);
    if (slot.roster.organizationId && slot.roster.organizationId !== roster.organizationId) {
      return false;
    }
    if (slot.roster.churchId && slot.roster.churchId !== roster.churchId) {
      return false;
    }
    const statuses = slot.roster.status as { in?: string[] } | undefined;
    if (statuses?.in && !statuses.in.includes(roster.status)) return false;
    const serviceAt = slot.roster.serviceAt as { gte?: Date; lt?: Date } | undefined;
    if (serviceAt?.gte && roster.serviceAt < serviceAt.gte) return false;
    if (serviceAt?.lt && roster.serviceAt >= serviceAt.lt) return false;
  }
  return true;
}

function matchesPersonClause(row: Assignment, clause: Record<string, unknown>): boolean {
  const personId = clause.personId as string | { in?: string[] } | undefined;
  if (typeof personId === "string") return row.personId === personId;
  if (personId?.in) return personId.in.includes(row.personId);
  const partner = clause.partnerPersonId as string | { in?: string[] } | undefined;
  if (typeof partner === "string") return row.partnerPersonId === partner;
  if (partner?.in) return Boolean(row.partnerPersonId && partner.in.includes(row.partnerPersonId));
  return false;
}

describe("prévia de preenchimento da escala", () => {
  const serviceAt = new Date("2026-11-15T22:00:00Z");
  const roster = {
    ...rosterOf("slot-voz"),
    serviceAt,
    slots: [
      { id: "ja-designada", roleLabel: "Som", assignments: [{ id: "existente" }] },
      { id: "vaga", roleLabel: "Voz", requiresCouple: false, assignments: [] },
      { id: "casal", roleLabel: "Apoio em dupla", requiresCouple: true, assignments: [] },
    ],
  };

  function setupPreview() {
    const db = {
      roster: { findFirst: jest.fn().mockResolvedValue(roster) },
      ministryMembership: { findMany: jest.fn().mockResolvedValue([
        { personId: "escalada", role: "INTEGRANTE", person: { displayName: "Com escala no dia" } },
        { personId: "disponivel", role: "INTEGRANTE", person: { displayName: "Pessoa disponível" } },
        { personId: "impedida", role: "INTEGRANTE", person: { displayName: "Pessoa impedida" } },
      ]) },
      rosterAssignment: { findMany: jest.fn().mockResolvedValue([
        { id: "existente", personId: "escalada", partnerPersonId: null, status: "CONFIRMED",
          slot: { id: "outra-vaga", roster: { id: "outra-escala", ministryId: "min-atmosfera", serviceAt } } },
      ]) },
      volunteerAvailability: { findMany: jest.fn().mockResolvedValue([
        { personId: "disponivel", weekday: 0, startMinute: 1260, endMinute: 1440 },
      ]) },
      volunteerImpediment: { findMany: jest.fn().mockResolvedValue([
        { personId: "impedida", startsAt: new Date("2026-11-15T21:00:00Z"), endsAt: new Date("2026-11-15T23:00:00Z") },
      ]) },
    };
    const service = new PersonalRosterService(db as never, {
      getPilotChurch: async () => ({ organizationId: ORG, churchId: CHURCH }),
    } as never);
    return { db, service };
  }

  it("sugere apenas nas vagas livres e respeita impedimento, mesmo dia e função em casal", async () => {
    const { db, service } = setupPreview();
    const leader = user("usr-lider", "per-lider", "LIDER_MINISTERIO", "min-louvor");
    const preview = await service.preview(leader, roster.id);
    expect(preview.positions).toEqual([
      { slotId: "vaga", roleLabel: "Voz", personName: "Pessoa disponível", partnerName: null, reasons: [] },
      expect.objectContaining({ slotId: "casal", personName: null, reasons: expect.arrayContaining(["COUPLE_REQUIRED"]) }),
    ]);
    expect(db.ministryMembership.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: ORG, churchId: CHURCH, ministryId: "min-louvor", status: "ATIVO", person: { status: "ACTIVE" } },
    }));
  });

  it("bloqueia outro líder antes de consultar os integrantes", async () => {
    const { db, service } = setupPreview();
    const leader = user("usr-outra-equipe", "per-atmosfera", "LIDER_MINISTERIO", "min-atmosfera");
    await expect(service.preview(leader, roster.id)).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.ministryMembership.findMany).not.toHaveBeenCalled();
  });
});
