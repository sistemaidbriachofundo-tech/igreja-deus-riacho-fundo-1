import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { AuthUser } from "../auth/types/auth-user";
import {
  countsAreBalanced,
  summarizeParticipation,
} from "./participation";
import { participationCsv } from "./report-files";
import { ReportsService } from "./reports.service";

const pilot = {
  organizationId: "org1",
  churchId: "church-rf1",
  organizationSlug: "igreja-de-deus",
  churchSlug: "riacho-fundo-1",
  churchName: "Riacho Fundo I (demo)",
};

function user(role: string, ministryId?: string): AuthUser {
  return {
    userId: `u-${role}`,
    personId: `p-${role}`,
    email: `${role.toLowerCase()}@example.test`,
    grants: [
      {
        roleCode: role,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        ...(ministryId ? { ministryId } : {}),
      },
    ],
  };
}

describe("summarizeParticipation", () => {
  it("counts each registration once and omits minors", () => {
    const summary = summarizeParticipation([
      {
        id: "r1",
        eventId: "e1",
        eventName: "Encontro",
        displayName: "TESTE Adulto",
        partySize: 2,
        isMinor: false,
        status: "CHECKED_IN",
        checkedInAt: "2026-11-09T12:00:00.000Z",
        checkInCode: "segredo-nao-exportar",
      },
      {
        id: "r1",
        eventId: "e1",
        eventName: "Encontro",
        displayName: "TESTE Adulto",
        partySize: 9,
        isMinor: false,
        status: "CHECKED_IN",
        checkedInAt: "2026-11-09T12:00:00.000Z",
      },
      {
        id: "r2",
        eventId: "e1",
        eventName: "Encontro",
        displayName: "TESTE Menor",
        guardianDisplayName: "TESTE Responsavel",
        partySize: 1,
        isMinor: true,
        status: "CONFIRMED",
        checkedInAt: null,
      },
      {
        id: "r3",
        eventId: "e1",
        eventName: "Encontro",
        displayName: "ana@example.test",
        partySize: 1,
        isMinor: false,
        status: "CANCELLED",
        checkedInAt: null,
      },
    ]);

    expect(countsAreBalanced(summary.counts)).toBe(true);
    expect(summary.counts).toMatchObject({
      registrations: 3,
      checkedIn: 1,
      confirmedAwaitingPresence: 1,
      cancelled: 1,
      participants: 3,
      presentParticipants: 2,
      minorsOmitted: 1,
      labelsRedacted: 1,
    });
    expect(summary.rows).toHaveLength(2);
    expect(JSON.stringify(summary)).not.toContain("TESTE Menor");
    expect(JSON.stringify(summary)).not.toContain("TESTE Responsavel");
    expect(JSON.stringify(summary)).not.toContain("segredo-nao-exportar");
    expect(summary.rows[0]?.syntheticLabel).toBe("TESTE Adulto");
    expect(summary.rows[1]?.syntheticLabel).toBeNull();

    const csv = participationCsv({
      generatedAt: "2026-11-09T00:00:00.000Z",
      churchId: pilot.churchId,
      counts: summary.counts,
      rows: summary.rows,
    });
    expect(csv).toContain("TESTE Adulto");
    expect(csv).not.toContain("TESTE Menor");
    expect(csv).not.toContain("segredo-nao-exportar");
    expect(csv).not.toContain("ana@example.test");
  });
});

describe("ReportsService access", () => {
  function service(prisma: object = { auditLog: { create: jest.fn() } }) {
    return new ReportsService(prisma as never, {
      getPilotChurch: jest.fn().mockResolvedValue(pilot),
    } as never);
  }

  it("rejects membro, tesouraria and editor", async () => {
    const reports = service();
    for (const role of ["MEMBRO", "TESOURARIA", "EDITOR_SITE", "PUBLICADOR_SITE"]) {
      await expect(reports.participation(user(role), {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(reports.membership(user(role))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(reports.ministries(user(role))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    }
  });

  it("rejects a ministry leader on the membership report", async () => {
    await expect(
      service().membership(user("LIDER_MINISTERIO", "m-jovens")),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects an unknown registration status and an inverted period", async () => {
    const reports = service({
      portalEvent: { findFirst: jest.fn() },
      auditLog: { create: jest.fn() },
    });
    await expect(
      reports.participation(user("SECRETARIA"), { status: "PAID" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      reports.participation(user("SECRETARIA"), {
        from: "2026-12-01",
        to: "2026-11-01",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("hides another ministry event from the leader", async () => {
    const reports = service({
      portalEvent: {
        findFirst: jest.fn().mockResolvedValue({
          id: "e1",
          ministryId: "m-homens",
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
        }),
      },
      auditLog: { create: jest.fn() },
    });
    await expect(
      reports.participation(user("LIDER_MINISTERIO", "m-jovens"), {
        eventId: "e1",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      reports.ministries(user("LIDER_MINISTERIO", "m-jovens"), "m-homens"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("returns 404 when the event is outside the pilot church", async () => {
    const reports = service({
      portalEvent: { findFirst: jest.fn().mockResolvedValue(null) },
      auditLog: { create: jest.fn() },
    });
    await expect(
      reports.participation(user("SECRETARIA"), { eventId: "missing" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("builds membership counts without person names", async () => {
    const audit = jest.fn();
    const reports = service({
      churchMembership: {
        groupBy: jest
          .fn()
          .mockResolvedValueOnce([{ status: "ACTIVE", _count: { _all: 3 } }])
          .mockResolvedValueOnce([{ status: "ACTIVE", _count: { _all: 2 } }]),
        count: jest.fn().mockResolvedValue(1),
      },
      person: { count: jest.fn().mockResolvedValue(4) },
      auditLog: { create: audit },
    });
    const report = await reports.membership(user("SECRETARIA"));
    expect(report).toMatchObject({
      byStatus: { ACTIVE: 3 },
      adultsByStatus: { ACTIVE: 2 },
      minorsOmitted: 1,
      adultVisitorsActive: 4,
      totalMemberships: 3,
      adultMemberships: 2,
      countsMatch: true,
      personsListed: false,
    });
    expect(JSON.stringify(report)).not.toMatch(/displayName|@/);
    expect(audit.mock.calls[0][0].data.metadata).not.toHaveProperty("displayName");
  });

  it("keeps formal ministry membership blocked and omits volunteer contact", async () => {
    const reports = service({
      ministry: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "m-jovens",
            name: "Jovens",
            slug: "jovens",
            publishStatus: "PUBLISHED",
          },
        ]),
      },
      portalEvent: {
        groupBy: jest.fn().mockResolvedValue([
          { ministryId: "m-jovens", status: "PUBLISHED", _count: { _all: 2 } },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
      volunteerInterest: {
        groupBy: jest.fn().mockResolvedValue([
          { ministryId: "m-jovens", status: "OPEN", _count: { _all: 3 } },
        ]),
      },
      auditLog: { create: jest.fn() },
    });
    const report = await reports.ministries(user("PASTOR"));
    expect(report.formalMembership).toMatchObject({
      blocked: true,
      members: null,
      code: "MINISTRY_MEMBERSHIP_SCHEMA_BLOCKED",
    });
    expect(report.ministries[0]).toMatchObject({
      formalMembers: null,
      eventsByStatus: { PUBLISHED: 2 },
      volunteerInterestsByStatus: { OPEN: 3 },
    });
    expect(report.unassignedEvents).toBe(1);
    expect(JSON.stringify(report)).not.toMatch(/email|phone|@/);
  });
});
