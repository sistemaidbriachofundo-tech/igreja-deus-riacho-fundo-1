import { BadRequestException } from "@nestjs/common";
import { BirthdayNoticesService } from "./birthday-notices.service";
import { SystemSettingsService, settingBehavior } from "./system-settings.service";

const pilot = { organizationId: "org", churchId: "riacho" };
const admin = {
  userId: "admin", personId: "admin-person", email: "admin@example.test",
  grants: [{ roleCode: "PLATFORM_ADMIN" as const, organizationId: "org", churchId: "riacho" }],
};

describe("parâmetros que alteram o backend", () => {
  it("mantém bloqueio, documento e a regra semanal do Louvor já ativa", () => {
    expect(settingBehavior("events.registration.session_required")).toBe("locked");
    expect(settingBehavior("finance.brb.mode")).toBe("locked");
    expect(settingBehavior("finance.sicoob.mode")).toBe("locked");
    expect(settingBehavior("rosters.ceia.manual")).toBe("documentary");
    expect(settingBehavior("credentials.color_rule")).toBe("documentary");
    expect(settingBehavior("rosters.louvor.week_block")).toBe("active");
    expect(settingBehavior("rosters.survey.open_day")).toBe("active");
    expect(settingBehavior("notices.birthday.timezone")).toBe("active");
    expect(settingBehavior("events.agenda.keep_days_after_end")).toBe("active");
    expect(settingBehavior("pastoral.titular_user_id")).toBe("active");
  });

  it("recusa fuso e dia fora da faixa e aceita a vigência publicada", async () => {
    const revisions = [{
      id: "rev", valueJson: 22, effectiveFrom: new Date("2026-11-01T00:00:00.000Z"), effectiveUntil: null,
    }];
    const prisma = {
      systemSettingCatalog: {
        findUnique: async ({ where }: { where: { key: string } }) => ({
          key: where.key, scopeKind: "CHURCH", valueType: "number", devJson: 25,
        }),
      },
      systemSettingRevision: {
        findMany: async ({ where }: { where: { catalogKey: string } }) => where.catalogKey === "rosters.survey.open_day"
          ? revisions
          : where.catalogKey === "events.agenda.keep_days_after_end"
            ? [{ id: "days", valueJson: 7, effectiveFrom: new Date("2026-11-01T00:00:00.000Z"), effectiveUntil: null }]
            : [],
        create: async () => { throw new Error("não deveria gravar"); },
      },
      auditLog: { create: async () => ({}) },
    };
    const service = new SystemSettingsService(prisma as never, { getPilotChurch: async () => pilot } as never);
    await expect(service.draft(admin, { key: "notices.birthday.timezone", value: "UTC" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.draft(admin, { key: "rosters.survey.open_day", value: 19 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.draft(admin, { key: "events.agenda.keep_days_after_end", value: 30 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.draft(admin, { key: "events.registration.session_required", value: false })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.getSurveyOpenDay(pilot, new Date("2026-11-20T12:00:00.000Z"))).resolves.toBe(22);
    await expect(service.getAgendaKeepDays(pilot, new Date("2026-11-20T12:00:00.000Z"))).resolves.toBe(7);
  });

  it("muda o dia civil do aniversário quando o fuso publicado muda", async () => {
    let zone = "America/Sao_Paulo";
    const notices: string[] = [];
    const prisma = {
      person: { findMany: async () => [{ id: "ana", displayName: "Ana", birthDate: new Date("1990-11-23T00:00:00.000Z"), discipleshipEnrollments: [] }] },
      user: { findMany: async () => [{ personId: "pastor" }] },
      ministryMembership: { findMany: async () => [] },
      smallGroupMember: { findMany: async () => [] },
      birthdayNotice: {
        findMany: async () => notices.map(recipientPersonId => ({ recipientPersonId })),
        createMany: async ({ data }: { data: Array<{ recipientPersonId: string }> }) => {
          notices.push(...data.map(item => item.recipientPersonId));
          return { count: data.length };
        },
      },
      systemSettingCatalog: {
        findUnique: async ({ where }: { where: { key: string } }) => ({
          key: where.key, scopeKind: "CHURCH", valueType: where.key.endsWith("timezone") ? "string" : "time",
          devJson: where.key.endsWith("timezone") ? "America/Sao_Paulo" : "00:00",
        }),
      },
      systemSettingRevision: {
        findMany: async ({ where }: { where: { catalogKey: string } }) => where.catalogKey.endsWith("timezone") ? [{
          id: "tz", valueJson: zone, effectiveFrom: new Date("2020-01-01T00:00:00.000Z"), effectiveUntil: null,
        }] : [],
      },
    };
    const settings = new SystemSettingsService(prisma as never, { getPilotChurch: async () => pilot } as never);
    const service = new BirthdayNoticesService(prisma as never, { getPilotChurch: async () => pilot } as never, settings);
    const instant = new Date("2026-11-24T03:30:00.000Z");
    const brasilia = await service.runScheduled(instant);
    expect(brasilia).toMatchObject({ created: 0, date: "2026-11-24" });
    zone = "America/Manaus";
    const manaus = await service.runScheduled(instant);
    expect(manaus).toMatchObject({ created: 1, date: "2026-11-23" });
  });
});
