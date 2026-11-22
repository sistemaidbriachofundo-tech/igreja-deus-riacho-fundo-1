import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { decideTicketScan, eventCoversLocalDay, ROLE_CODES } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";
import { assertChurchRole } from "./church";

@Injectable()
export class ParticipantScanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  async grant(actor: AuthUser, eventId: string, userId: string) {
    const { pilot, event } = await this.event(actor, eventId);
    await this.assertCanAuthorize(actor, pilot, event);
    const user = await this.prisma.user.findFirst({
      where: { id: userId, status: "ACTIVE", person: { organizationId: pilot.organizationId, homeChurchId: pilot.churchId } },
      select: { id: true },
    });
    if (!user) throw new NotFoundException("Usuário não encontrado nesta congregação.");
    const saved = await this.prisma.eventScannerGrant.upsert({
      where: { eventId_userId: { eventId: event.id, userId } },
      create: { eventId: event.id, userId, grantedByUserId: actor.userId },
      update: {},
    });
    return { eventId: event.id, userId: saved.userId };
  }

  async scan(actor: AuthUser, eventId: string, code: string, now = new Date()) {
    const { pilot, event } = await this.event(actor, eventId);
    await this.assertCanScan(actor, event);
    const token = code?.trim();
    if (!token || token.length < 8) throw new BadRequestException("QR inválido.");
    const ticket = await this.prisma.eventParticipantTicket.findFirst({
      where: { code: token },
      include: { registration: { select: { id: true, eventId: true, status: true, paymentStatus: true, churchId: true, isMinor: true, guardianAuthStatus: true } } },
    });
    const decision = decideTicketScan({
      found: Boolean(ticket && ticket.registration.churchId === pilot.churchId),
      ticketEventId: ticket?.registration.eventId,
      requestedEventId: event.id,
      paymentStatus: ticket?.registration.paymentStatus,
      registrationStatus: ticket?.registration.status,
      eventStatus: event.status,
      guardianAuthorized: !ticket?.registration.isMinor || ticket.registration.guardianAuthStatus === "AUTHORIZED" || ticket.registration.guardianAuthStatus === "NOT_REQUIRED",
      onEventDay: eventCoversLocalDay(event.startsAt, event.endsAt, now),
      checkedInAt: ticket?.checkedInAt?.toISOString() ?? null,
      scannedByUserId: ticket?.scannedByUserId ?? null,
      now: now.toISOString(),
    });
    if (decision.result === "UNKNOWN" || decision.result === "WRONG_EVENT") {
      throw new NotFoundException("Ingresso não pertence a este evento.");
    }
    if (decision.result === "EVENT_CLOSED") throw new ConflictException("O evento está encerrado para leitura.");
    if (decision.result === "NOT_TODAY") throw new ConflictException("A leitura vale no dia do evento.");
    if (decision.result === "REFUNDED") throw new ConflictException("O ingresso foi estornado.");
    if (decision.result === "GUARDIAN") throw new ConflictException("A autorização do responsável ainda não foi registrada.");
    if (decision.result === "UNPAID") throw new ConflictException("O ingresso ainda não está confirmado.");
    if (decision.result === "ALREADY_READ" || !ticket) return { ...decision, duplicate: true };
    const recorded = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM event_registrations WHERE id = ${ticket.registrationId} FOR UPDATE`;
      const current = await tx.eventParticipantTicket.findUnique({ where: { id: ticket.id } });
      if (current?.checkedInAt) {
        return {
          result: "ALREADY_READ" as const,
          checkedInAt: current.checkedInAt.toISOString(),
          scannedByUserId: current.scannedByUserId ?? null,
          duplicate: true,
        };
      }
      const updated = await tx.eventParticipantTicket.updateMany({
        where: { id: ticket.id, checkedInAt: null },
        data: { checkedInAt: now, scannedByUserId: actor.userId },
      });
      if (updated.count !== 1) {
        const current = await tx.eventParticipantTicket.findUnique({ where: { id: ticket.id } });
        return {
          result: "ALREADY_READ" as const,
          checkedInAt: current?.checkedInAt?.toISOString() ?? now.toISOString(),
          scannedByUserId: current?.scannedByUserId ?? null,
          duplicate: true,
        };
      }
      const remaining = await tx.eventParticipantTicket.count({ where: { registrationId: ticket.registrationId, checkedInAt: null } });
      if (remaining === 0) {
        await tx.eventRegistration.updateMany({
          where: { id: ticket.registrationId, status: "CONFIRMED" },
          data: { status: "CHECKED_IN", checkedInAt: now },
        });
      }
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId, action: "event_ticket.scan", resourceType: "event_participant_ticket", resourceId: ticket.id,
          organizationId: pilot.organizationId, churchId: pilot.churchId,
          metadata: { eventId: event.id, at: now.toISOString() },
        },
      });
      return { result: "READ" as const, checkedInAt: now.toISOString(), scannedByUserId: actor.userId, duplicate: false };
    });
    return recorded;
  }

  private async event(actor: AuthUser, eventId: string) {
    const pilot = await this.pilot.getPilotChurch();
    assertChurchRole(actor, pilot, [
      ROLE_CODES.LIDER_MINISTERIO, ROLE_CODES.SECRETARIA, ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN, ROLE_CODES.MEMBRO, ROLE_CODES.CONVIDADO,
    ]);
    const event = await this.prisma.portalEvent.findFirst({
      where: { id: eventId, organizationId: pilot.organizationId, churchId: pilot.churchId },
      include: { ministry: { select: { leaderPersonId: true } } },
    });
    if (!event) throw new NotFoundException("Evento não encontrado.");
    return { pilot, event };
  }

  private async assertCanScan(actor: AuthUser, event: { id: string; ministryId: string | null; createdByUserId: string | null; ministry: { leaderPersonId: string | null } | null }) {
    if (await this.allowed(actor, event)) return;
    throw new ForbiddenException("Somente o líder do ministério, o criador do evento ou uma pessoa autorizada pode ler o ingresso.");
  }

  private async assertCanAuthorize(actor: AuthUser, pilot: { organizationId: string; churchId: string }, event: { id: string; ministryId: string | null; createdByUserId: string | null; ministry: { leaderPersonId: string | null } | null }) {
    const admin = actor.grants.some(grant => grant.roleCode === ROLE_CODES.PLATFORM_ADMIN);
    if (admin || await this.allowed(actor, event)) return;
    assertChurchRole(actor, { ...pilot, organizationSlug: "", churchSlug: "", churchName: "" }, [ROLE_CODES.PLATFORM_ADMIN]);
  }

  private async allowed(actor: AuthUser, event: { id: string; ministryId: string | null; createdByUserId: string | null; ministry: { leaderPersonId: string | null } | null }) {
    if (event.createdByUserId && event.createdByUserId === actor.userId) return true;
    if (event.ministry?.leaderPersonId && event.ministry.leaderPersonId === actor.personId) return true;
    if (event.ministryId && actor.grants.some(grant => grant.roleCode === ROLE_CODES.LIDER_MINISTERIO && grant.ministryId === event.ministryId)) return true;
    const grant = await this.prisma.eventScannerGrant.findFirst({ where: { eventId: event.id, userId: actor.userId }, select: { id: true } });
    return Boolean(grant);
  }
}
