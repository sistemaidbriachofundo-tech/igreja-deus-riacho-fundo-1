import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import {
  actorIsMinistryLeader,
  assertMinistryScopedWrite,
  filterRowsForMinistryLeader,
  requireMinistryInPilot,
} from "./ministry-access";
import type { AuthUser } from "../auth/types/auth-user";

describe("ministry-access helpers", () => {
  const pilot = { organizationId: "org1", churchId: "church1" };
  const admin: AuthUser = {
    userId: "u1",
    personId: "p1",
    email: "a@test",
    grants: [
      {
        roleCode: "SECRETARIA",
        organizationId: "org1",
        churchId: "church1",
      },
    ],
  };
  const lider: AuthUser = {
    userId: "u2",
    personId: "p2",
    email: "l@test",
    grants: [
      {
        roleCode: "LIDER_MINISTERIO",
        organizationId: "org1",
        churchId: "church1",
        ministryId: "m1",
      },
    ],
  };
  const msgs = {
    missingMinistry: "missing",
    forbidden: "forbidden",
  };

  it("admin bypasses ministry write check", () => {
    expect(() =>
      assertMinistryScopedWrite(admin, pilot, null, msgs),
    ).not.toThrow();
  });

  it("lider without ministryId is forbidden", () => {
    expect(() =>
      assertMinistryScopedWrite(lider, pilot, null, msgs),
    ).toThrow(ForbiddenException);
  });

  it("lider only own ministry", () => {
    expect(() =>
      assertMinistryScopedWrite(lider, pilot, "m1", msgs),
    ).not.toThrow();
    expect(() =>
      assertMinistryScopedWrite(lider, pilot, "m2", msgs),
    ).toThrow(ForbiddenException);
  });

  it("filters list rows for lider", () => {
    const rows = [
      { id: "a", ministryId: "m1" },
      { id: "b", ministryId: "m2" },
      { id: "c", ministryId: null },
    ];
    expect(filterRowsForMinistryLeader(rows, admin, pilot)).toHaveLength(3);
    expect(filterRowsForMinistryLeader(rows, lider, pilot).map((r) => r.id)).toEqual([
      "a",
    ]);
  });

  it("requireMinistryInPilot throws variants", async () => {
    const prisma = {
      ministry: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    await expect(
      requireMinistryInPilot(prisma as never, "x", pilot, "badRequest"),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      requireMinistryInPilot(prisma as never, "x", pilot, "notFound"),
    ).rejects.toBeInstanceOf(NotFoundException);
    prisma.ministry.findFirst.mockResolvedValueOnce({ id: "m1" });
    await expect(
      requireMinistryInPilot(prisma as never, "m1", pilot),
    ).resolves.toEqual({ id: "m1" });
  });

  it("actorIsMinistryLeader", () => {
    expect(actorIsMinistryLeader(lider, pilot)).toBe(true);
    expect(actorIsMinistryLeader(admin, pilot)).toBe(false);
  });
});
