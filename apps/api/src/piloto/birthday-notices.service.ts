import { Injectable } from "@nestjs/common";
import { isBeforeConfiguredHour, ROLE_CODES, zonedCivilParts } from "@idbrf/shared";
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
    const zone = await this.settings.getBirthdayTimeZone(pilot, now);
    const today = zonedCivilParts(now, zone);
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
    return this.runForChurch(pilot, now);
  }

  async runScheduled(now: Date) {
    const pilot = await this.pilot.getPilotChurch();
    return this.runForChurch(pilot, now);
  }

  private async runForChurch(pilot: { organizationId: string; churchId: string }, now: Date) {
    const [hour, zone] = await Promise.all([
      this.settings.getBirthdayHour(pilot, now),
      this.settings.getBirthdayTimeZone(pilot, now),
    ]);
    if (isBeforeConfiguredHour(now, hour, zone)) {
      return { skipped: true, reason: "BEFORE_CONFIGURED_HOUR" as const, hour, created: 0 };
    }
    const today = zonedCivilParts(now, zone).date;
    const people = await this.people(pilot, {});
    const birthdays = people.filter(person => person.birthDate?.toISOString().slice(5, 10) === today.slice(5));
    const birthdayIds = birthdays.map(person => person.id);
    const officeRoles = [ROLE_CODES.PASTOR, ROLE_CODES.SECRETARIA];
    const [office, ministries, groups] = birthdayIds.length ? await Promise.all([
      this.prisma.user.findMany({
        where: { status: "ACTIVE", grants: { some: { organizationId: pilot.organizationId, churchId: pilot.churchId, role: { code: { in: officeRoles } } } } },
        select: { personId: true },
      }),
      this.prisma.ministryMembership.findMany({
        where: { churchId: pilot.churchId, personId: { in: birthdayIds }, status: "ATIVO", endedAt: null },
        select: { ministry: { select: { leaderPersonId: true, ministryMemberships: {
          where: { status: "ATIVO", role: "LIDER", endedAt: null }, select: { personId: true },
        } } } },
      }),
      this.prisma.smallGroupMember.findMany({
        where: { personId: { in: birthdayIds }, group: { churchId: pilot.churchId } },
        select: { group: { select: { leaderPersonId: true, members: {
          where: { role: "LEADER" }, select: { personId: true },
        } } } },
      }),
    ]) : [[], [], []] as const;
    const recipients = [...new Set([
      ...office.map(row => row.personId),
      ...ministries.flatMap(({ ministry }) => [ministry.leaderPersonId, ...ministry.ministryMemberships.map(row => row.personId)]),
      ...groups.flatMap(({ group }) => [group.leaderPersonId, ...group.members.map(row => row.personId)]),
      ...birthdays.flatMap(person => person.enrollments.filter(item => item.status === "ACTIVE").map(item => item.mentorPersonId)),
    ].filter((id): id is string => Boolean(id)))];
    const occasionDate = new Date(`${today}T00:00:00.000Z`);
    const existing = await this.prisma.birthdayNotice.findMany({
      where: { churchId: pilot.churchId, occasionDate, recipientPersonId: { in: recipients } },
      select: { recipientPersonId: true },
    });
    const seen = new Set(existing.map(row => row.recipientPersonId));
    const fresh = recipients.filter(id => !seen.has(id));
    let created = 0;
    if (fresh.length) {
      const result = await this.prisma.birthdayNotice.createMany({
        data: fresh.map(recipientPersonId => ({
          organizationId: pilot.organizationId, churchId: pilot.churchId, recipientPersonId, occasionDate,
        })),
        skipDuplicates: true,
      });
      created = result.count;
    }
    return {
      skipped: false, reason: null, hour, date: today, created,
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
        OR: [
          { homeChurchId: pilot.churchId },
          { memberships: { some: { churchId: pilot.churchId, status: "ACTIVE" } } },
          { discipleshipEnrollments: { some: { status: "ACTIVE", track: { churchId: pilot.churchId } } } },
        ],
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
