import { Injectable } from "@nestjs/common";
import { isBeforeConfiguredHour, ROLE_CODES, saoPauloParts } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";
import { assertChurchRole, assertOperationalScope } from "./church";
import { SystemSettingsService } from "./system-settings.service";

@Injectable()
export class BirthdayNoticesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
    private readonly settings: SystemSettingsService,
  ) {}

  async audience(actor: AuthUser, query: {
    ministryId?: string; groupId?: string; mentorPersonId?: string; trackId?: string; exclusiveTrack?: boolean;
  }, now = new Date()) {
    const pilot = await this.staff(actor);
    await this.assertFilters(actor, query);
    const today = saoPauloParts(now);
    const people = await this.people(pilot, query);
    const rows = people.flatMap(person => {
      if (!person.birthDate) return [];
      const monthDay = person.birthDate.toISOString().slice(5, 10);
      if (monthDay !== today.date.slice(5)) return [];
      const activeTracks = person.enrollments.filter(item => item.status === "ACTIVE");
      if (query.exclusiveTrack && activeTracks.length !== 1) return [];
      if (query.trackId && !activeTracks.some(item => item.trackId === query.trackId)) return [];
      if (query.mentorPersonId && !activeTracks.some(item => item.mentorPersonId === query.mentorPersonId)) return [];
      return [{ id: person.id, name: person.displayName, mentorPersonIds: activeTracks.map(item => item.mentorPersonId).filter((id): id is string => Boolean(id)) }];
    });
    return { date: today.date, birthdays: rows };
  }

  async run(actor: AuthUser, now = new Date()) {
    const pilot = await this.staff(actor);
    const setting = await this.settings.readEffective(actor, "notices.birthday.hour_brasilia", "CHURCH", undefined, now);
    const hour = typeof setting.value === "string" ? setting.value : "08:00";
    if (isBeforeConfiguredHour(now, hour)) {
      return { skipped: true, reason: "BEFORE_CONFIGURED_HOUR" as const, hour, created: 0 };
    }
    const audience = await this.audience(actor, {}, now);
    const recipients = [...new Set(audience.birthdays.flatMap(person => [person.id, ...person.mentorPersonIds]))];
    const occasionDate = new Date(`${audience.date}T00:00:00.000Z`);
    const existing = await this.prisma.birthdayNotice.findMany({
      where: { churchId: pilot.churchId, occasionDate, recipientPersonId: { in: recipients } },
      select: { recipientPersonId: true },
    });
    const seen = new Set(existing.map(row => row.recipientPersonId));
    const fresh = recipients.filter(id => !seen.has(id));
    if (fresh.length) {
      await this.prisma.birthdayNotice.createMany({
        data: fresh.map(recipientPersonId => ({
          organizationId: pilot.organizationId, churchId: pilot.churchId, recipientPersonId, occasionDate,
        })),
        skipDuplicates: true,
      });
    }
    return {
      skipped: false, reason: null, hour, date: audience.date, created: fresh.length,
      title: "Há aniversariantes hoje na congregação.",
    };
  }

  private async staff(actor: AuthUser) {
    const pilot = await this.pilot.getPilotChurch();
    assertChurchRole(actor, pilot, [ROLE_CODES.SECRETARIA, ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN]);
    return pilot;
  }

  private async assertFilters(actor: AuthUser, query: { ministryId?: string; groupId?: string; trackId?: string }) {
    const bindings = await this.prisma.accessScopeBinding.findMany({
      where: { grantId: { in: actor.grants.flatMap(grant => "id" in grant && grant.id ? [String(grant.id)] : []) } },
      select: { kind: true, scopeId: true },
    });
    if (query.ministryId) assertOperationalScope(actor, bindings, "MINISTRY", query.ministryId);
    if (query.groupId) assertOperationalScope(actor, bindings, "GROUP", query.groupId);
    if (query.trackId) assertOperationalScope(actor, bindings, "TRACK", query.trackId);
  }

  private people(pilot: { organizationId: string; churchId: string }, query: { ministryId?: string; groupId?: string }) {
    return this.prisma.person.findMany({
      where: {
        organizationId: pilot.organizationId, status: "ACTIVE", birthDate: { not: null },
        OR: [{ homeChurchId: pilot.churchId }, { memberships: { some: { churchId: pilot.churchId, status: "ACTIVE" } } }],
        ...(query.ministryId ? { ministryMemberships: { some: { ministryId: query.ministryId, churchId: pilot.churchId, status: "ATIVO", endedAt: null } } } : {}),
        ...(query.groupId ? { smallGroupMemberships: { some: { groupId: query.groupId, group: { churchId: pilot.churchId } } } } : {}),
      },
      select: {
        id: true, displayName: true, birthDate: true,
        discipleshipEnrollments: { select: { status: true, trackId: true, mentorPersonId: true, track: { select: { churchId: true } } } },
      },
    }).then(rows => rows.map(row => ({
      ...row,
      enrollments: row.discipleshipEnrollments.filter(item => item.track.churchId === pilot.churchId),
    })));
  }
}
