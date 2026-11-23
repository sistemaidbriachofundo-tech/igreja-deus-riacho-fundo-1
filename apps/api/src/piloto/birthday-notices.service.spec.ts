import { ForbiddenException } from "@nestjs/common";
import { BirthdayNoticesService } from "./birthday-notices.service";
import type { AuthUser } from "../auth/types/auth-user";

const pilot = { organizationId: "org", churchId: "riacho", organizationSlug: "igreja", churchSlug: "riacho", churchName: "Riacho" };
const pastor: AuthUser = { userId: "u-pastor", personId: "pastor", email: "pastor@example.test", grants: [{ roleCode: "PASTOR", organizationId: "org", churchId: "riacho" }] };
const mentor: AuthUser = { userId: "u-mentor", personId: "mentor", email: "mentor@example.test", grants: [{ roleCode: "MEMBRO", organizationId: "org", churchId: "riacho" }] };

describe("avisos de aniversário", () => {
  const settings = { getBirthdayHour: async () => "08:00" };

  it("grava um aviso por pessoa e não avisa o aniversariante sobre si mesmo", async () => {
    const notices: Array<{ recipientPersonId: string }> = [];
    const prisma = {
      person: { findMany: async () => [{
        id: "ana", displayName: "Ana", birthDate: new Date("1990-11-23T00:00:00.000Z"),
        discipleshipEnrollments: [
          { status: "ACTIVE", trackId: "trilha", mentorPersonId: "mentor", track: { churchId: "riacho" } },
          { status: "ACTIVE", trackId: "outra", mentorPersonId: "mentor-de-fora", track: { churchId: "outra" } },
        ],
      }, {
        id: "pastor", displayName: "Pastor", birthDate: new Date("1980-11-23T00:00:00.000Z"),
        discipleshipEnrollments: [],
      }] },
      user: { findMany: async () => [{ personId: "pastor" }, { personId: "pastor" }] },
      ministryMembership: { findMany: async () => [{ personId: "ana", ministry: { leaderPersonId: "ana", ministryMemberships: [{ personId: "lider" }] } }] },
      smallGroupMember: { findMany: async () => [{ personId: "ana", group: { leaderPersonId: "lider-grupo", members: [{ personId: "lider-grupo" }] } }] },
      birthdayNotice: {
        findMany: async () => notices,
        createMany: async ({ data }: { data: Array<{ recipientPersonId: string }> }) => {
          notices.push(...data);
          return { count: data.length };
        },
      },
    };
    const service = new BirthdayNoticesService(prisma as never, { getPilotChurch: async () => pilot } as never, settings as never);
    const first = await service.run(pastor, new Date("2026-11-23T12:00:00.000Z"));
    expect(first.created).toBe(4);
    expect(notices.map(item => item.recipientPersonId).sort()).toEqual(["lider", "lider-grupo", "mentor", "pastor"]);
    expect(notices.filter(item => item.recipientPersonId === "pastor")).toHaveLength(1);
    expect(notices.some(item => item.recipientPersonId === "ana" || item.recipientPersonId === "mentor-de-fora")).toBe(false);
    const second = await service.run(pastor, new Date("2026-11-23T18:00:00.000Z"));
    expect(second.created).toBe(0);
  });

  it("lista uma vez quem está no ministério e na mentoria, inclusive só na trilha, sem telefone", async () => {
    const findPeople = jest.fn().mockResolvedValue([
      { id: "ana", displayName: "Ana Exemplo", birthDate: new Date("1990-11-23T00:00:00.000Z") },
      { id: "bruno", displayName: "Bruno Exemplo", birthDate: new Date("1992-01-02T00:00:00.000Z") },
    ]);
    const prisma = {
      ministry: { findMany: async () => [{ ministryMemberships: [{ personId: "ana" }] }] },
      smallGroup: { findMany: async () => [] },
      discipleshipEnrollment: { findMany: async () => [{ personId: "ana" }, { personId: "somente-trilha" }] },
      person: { findMany: findPeople },
    };
    const service = new BirthdayNoticesService(prisma as never, { getPilotChurch: async () => pilot } as never, settings as never);
    const result = await service.careToday(mentor, new Date("2026-11-23T15:00:00.000Z"));
    expect(result.birthdays).toEqual([{ id: "ana", name: "Ana Exemplo", date: "2026-11-23" }]);
    expect(JSON.stringify(result)).not.toMatch(/telefone|phone|\+55/i);
    expect(findPeople).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { in: ["ana", "somente-trilha"] }, status: "ACTIVE" }),
      select: { id: true, displayName: true, birthDate: true },
    }));
    await expect(service.careToday({ ...mentor, churchId: "outra" })).rejects.toBeInstanceOf(ForbiddenException);
  });
});
