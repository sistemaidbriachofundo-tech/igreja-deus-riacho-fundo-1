import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { AuthUser } from "../auth/types/auth-user";
import { EventRegistrationsService } from "./event-registrations.service";

const pilot = { organizationId: "org-rf1", churchId: "church-rf1", churchName: "Riacho", churchSlug: "rf1", organizationSlug: "org" };
const secretaria: AuthUser = {
  userId: "sec",
  personId: "p-sec",
  email: "ana.demo@example.test",
  grants: [{ roleCode: "SECRETARIA", organizationId: pilot.organizationId, churchId: pilot.churchId }],
};
const membro: AuthUser = {
  ...secretaria,
  userId: "membro",
  grants: [{ roleCode: "MEMBRO", organizationId: pilot.organizationId, churchId: pilot.churchId }],
};

describe("check-in no evento certo", () => {
  it("não encontra o código em outro evento e o membro não opera", async () => {
    const registration = {
      id: "reg1",
      eventId: "evt-a",
      status: "CONFIRMED",
      isMinor: false,
      guardianAuthStatus: "NOT_REQUIRED",
      checkInCode: "abc123def4567890",
    };
    const db = {
      portalEvent: { findFirst: jest.fn().mockResolvedValue({ id: "evt-b", ministryId: null, status: "PUBLISHED" }) },
      eventRegistration: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new EventRegistrationsService(db as never, { getPilotChurch: async () => pilot } as never);
    await expect(service.checkInOnEvent(secretaria, "evt-b", registration.checkInCode)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.eventRegistration.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ eventId: "evt-b", checkInCode: registration.checkInCode }),
    }));
    await expect(service.checkInOnEvent(membro, "evt-b", registration.checkInCode)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("a repetição devolve a presença já registrada, sem outro lançamento", async () => {
    const registration = {
      id: "reg1",
      eventId: "evt-a",
      status: "CHECKED_IN",
      isMinor: false,
      guardianAuthStatus: "NOT_REQUIRED",
      checkInCode: "abc123def4567890",
      displayName: "Pessoa",
      partySize: 1,
      modalityId: "m",
      lotId: null,
      paymentStatus: "CONFIRMED_PIX",
      checkedInAt: new Date("2026-11-13T12:00:00Z"),
      cancelledAt: null,
      createdAt: new Date("2026-11-13T10:00:00Z"),
      updatedAt: new Date("2026-11-13T12:00:00Z"),
      guardianDisplayName: null,
    };
    const tx = { eventRegistration: { updateMany: jest.fn() }, auditLog: { create: jest.fn() } };
    const db = {
      portalEvent: { findFirst: jest.fn().mockResolvedValue({ id: "evt-a", ministryId: null }) },
      eventRegistration: { findFirst: jest.fn().mockResolvedValue(registration) },
      $transaction: jest.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)),
    };
    const service = new EventRegistrationsService(db as never, { getPilotChurch: async () => pilot } as never);
    const result = await service.checkInOnEvent(secretaria, "evt-a", registration.checkInCode);
    expect(result.status).toBe("CHECKED_IN");
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
