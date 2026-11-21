import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { EventRegistrationsService } from "./event-registrations.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("cancelamento da própria inscrição", () => {
  const pilot = {
    organizationId: "org1", churchId: "church-rf1",
    organizationSlug: "igreja-de-deus", churchSlug: "riacho-fundo-1", churchName: "Riacho Fundo I (demo)",
  };
  const now = new Date("2026-11-19T12:00:00.000Z");
  const member: AuthUser = {
    userId: "u-mem", personId: "p-mem", email: "membro.demo@example.test",
    organizationId: "org1", churchId: "church-rf1",
    grants: [{ roleCode: "MEMBRO", organizationId: "org1", churchId: "church-rf1" }],
  };
  const other: AuthUser = {
    ...member, userId: "u-outro", personId: "p-outro", email: "outro.demo@example.test",
  };

  function registration(status = "CONFIRMED", personId = "p-mem") {
    return {
      id: "reg-1", eventId: "evt-1", modalityId: "mod-1", lotId: null, displayName: "Pessoa fictícia",
      partySize: 1, isMinor: false, guardianDisplayName: null, guardianAuthStatus: "NOT_REQUIRED",
      status, paymentStatus: "PENDING", checkInCode: "a".repeat(32),
      checkedInAt: null as Date | null, cancelledAt: null as Date | null,
      registrantPersonId: personId, createdAt: now, updatedAt: now,
    };
  }

  function serviceFor(row: ReturnType<typeof registration> | null, partialCheckIn = false) {
    const tx = {
      $queryRaw: jest.fn(),
      eventRegistration: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(row),
        update: jest.fn(async ({ data }) => ({ ...(row ?? registration()), ...data })),
      },
      eventParticipantTicket: { count: jest.fn().mockResolvedValue(Number(partialCheckIn)) },
      eventPaymentIntent: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      person: { findFirst: jest.fn(async ({ where }) => (
        where.id === "p-mem" ? { id: "p-mem", displayName: "Pessoa fictícia", isMinor: false } : null
      )) },
      eventRegistration: { findFirst: jest.fn(async ({ where }) => (
        row && where.registrantPersonId === row.registrantPersonId && where.id === row.id ? row : null
      )) },
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const service = new EventRegistrationsService(prisma as never, { getPilotChurch: async () => pilot } as never);
    return { service, prisma, tx };
  }

  it("cancela a inscrição do titular e recusa a de outra pessoa ou já confirmada na porta", async () => {
    const open = serviceFor(registration());
    const cancelled = await open.service.cancelMyRegistration(member, "reg-1");
    expect(cancelled).toMatchObject({ id: "reg-1", status: "CANCELLED", paymentStatus: "CANCELLED" });
    expect(open.tx.eventPaymentIntent.updateMany).toHaveBeenCalled();
    expect(open.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "event_registration.cancel", metadata: { eventId: "evt-1" } }),
    }));

    const again = serviceFor({ ...registration(), status: "CANCELLED", paymentStatus: "CANCELLED", cancelledAt: now });
    await expect(again.service.cancelMyRegistration(member, "reg-1")).resolves.toMatchObject({ status: "CANCELLED" });
    expect(again.prisma.$transaction).not.toHaveBeenCalled();

    const present = serviceFor({ ...registration(), status: "CHECKED_IN", checkedInAt: now });
    await expect(present.service.cancelMyRegistration(member, "reg-1")).rejects.toBeInstanceOf(ConflictException);

    const partiallyPresent = serviceFor(registration(), true);
    await expect(partiallyPresent.service.cancelMyRegistration(member, "reg-1")).rejects.toBeInstanceOf(ConflictException);
    expect(partiallyPresent.tx.eventRegistration.update).not.toHaveBeenCalled();

    const hidden = serviceFor(registration("CONFIRMED", "p-outro"));
    await expect(hidden.service.cancelMyRegistration(member, "reg-1")).rejects.toBeInstanceOf(NotFoundException);
    await expect(open.service.cancelMyRegistration(other, "reg-1")).rejects.toBeInstanceOf(ForbiddenException);
  });
});
