import type { AuthUser } from "../auth/types/auth-user";
import { EventRegistrationsService } from "./event-registrations.service";

const pilot = {
  organizationId: "org-rf1",
  churchId: "church-rf1",
  churchName: "Riacho",
  churchSlug: "rf1",
  organizationSlug: "org",
};
const secretaria: AuthUser = {
  userId: "sec",
  personId: "p-sec",
  email: "ana.demo@example.test",
  grants: [{ roleCode: "SECRETARIA", organizationId: pilot.organizationId, churchId: pilot.churchId }],
};
const event = {
  id: "e1",
  ministryId: null,
  status: "PUBLISHED",
  name: "So para Mocas",
  slug: "so-para-mocas",
};

describe("lote pago na conta da igreja", () => {
  it("recusa conta em lote gratuito, conta inativa e e-mail que não é de teste", async () => {
    const db = {
      portalEvent: { findFirst: jest.fn().mockResolvedValue(event) },
      churchReceivingAccount: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new EventRegistrationsService(db as never, { getPilotChurch: async () => pilot } as never);
    await expect(service.createLot(secretaria, "e1", {
      code: "gratis", name: "Gratis", priceCents: 0, receivingAccountId: "acc-1",
    })).rejects.toThrow(/só vale para lote pago/);
    await expect(service.createLot(secretaria, "e1", {
      code: "pago", name: "Pago", priceCents: 1500, receivingAccountId: "acc-1",
    })).rejects.toThrow(/não encontrada/);
    db.churchReceivingAccount.findFirst.mockResolvedValue({ id: "acc-1" });
    const tx = {
      eventLot: { create: jest.fn().mockResolvedValue({
        id: "lot-1", eventId: "e1", modalityId: null, code: "pago", name: "Pago",
        capacity: null, priceCents: 1500, currency: "BRL", opensAt: null, closesAt: null,
        status: "OPEN", sortOrder: 0, receivingAccountId: "acc-1",
      }) },
      auditLog: { create: jest.fn() },
    };
    Object.assign(db, {
      $transaction: jest.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)),
    });
    const lot = await service.createLot(secretaria, "e1", {
      code: "pago", name: "Pago", priceCents: 1500, receivingAccountId: " acc-1 ", status: "OPEN",
    });
    expect(lot).toMatchObject({ paymentMode: "CHURCH_PIX", receivingAccountId: "acc-1" });
  });

  it("devolve o Pix da conta e avisa a inscrição gratuita confirmada", async () => {
    const modality = {
      id: "mod1", eventId: "e1", code: "ind", name: "Individual", kind: "INDIVIDUAL",
      capacity: 10, minPartySize: 1, maxPartySize: 1, sortOrder: 0,
    };
    const lot = {
      id: "lot-1", status: "OPEN", priceCents: 1500, currency: "BRL", capacity: null,
      modalityId: "mod1", opensAt: null, closesAt: null, receivingAccountId: "acc-1",
    };
    const registration = {
      id: "reg1", eventId: "e1", modalityId: "mod1", lotId: "lot-1", displayName: "Pessoa Teste",
      partySize: 1, isMinor: false, guardianDisplayName: null, guardianAuthStatus: "NOT_REQUIRED",
      status: "PENDING_PAYMENT", paymentStatus: "PENDING", checkInCode: "a".repeat(32),
      checkedInAt: null, cancelledAt: null, createdAt: new Date(), updatedAt: new Date(),
    };
    const tx = {
      eventRegistration: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { partySize: 0 } }),
        create: jest.fn().mockResolvedValue(registration),
      },
      eventPaymentIntent: { create: jest.fn().mockResolvedValue({ id: "pi1", status: "PENDING", amountCents: 1500 }) },
      auditLog: { create: jest.fn() },
    };
    const db = {
      portalEvent: { findFirst: jest.fn().mockResolvedValue(event) },
      eventModality: { findFirst: jest.fn().mockResolvedValue(modality) },
      eventLot: { findFirst: jest.fn().mockResolvedValue(lot) },
      eventLodgingOption: { findMany: jest.fn().mockResolvedValue([]) },
      eventMealOption: { findMany: jest.fn().mockResolvedValue([]) },
      eventTransportOption: { findMany: jest.fn().mockResolvedValue([]) },
      eventRegistration: { aggregate: jest.fn().mockResolvedValue({ _sum: { partySize: 0 } }) },
      churchReceivingAccount: {
        findFirst: jest.fn().mockResolvedValue({
          id: "acc-1", active: true, pixKey: "evento.teste@example.test",
          displayName: "Igreja", merchantCity: "Brasilia",
        }),
      },
      $transaction: jest.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)),
    };
    const mail = { deliverOnce: jest.fn().mockResolvedValue({ status: "SENT" }) };
    const service = new EventRegistrationsService(
      db as never,
      { getPilotChurch: async () => pilot } as never,
      mail as never,
    );
    await expect(service.createPublicRegistration("so-para-mocas", {
      displayName: "Pessoa Teste", modalityId: "mod1", lotId: "lot-1",
      notificationEmail: "pessoa@igreja.org",
    })).rejects.toThrow(/example\.test/);
    const paid = await service.createPublicRegistration("so-para-mocas", {
      displayName: "Pessoa Teste", modalityId: "mod1", lotId: "lot-1",
    });
    expect(paid.paymentIntent?.mode).toBe("CHURCH_PIX");
    expect(paid.paymentIntent && "pixCopiaECola" in paid.paymentIntent).toBe(true);
    expect(mail.deliverOnce).not.toHaveBeenCalled();

    db.churchReceivingAccount.findFirst.mockResolvedValue(null);
    await expect(service.createPublicRegistration("so-para-mocas", {
      displayName: "Pessoa Teste", modalityId: "mod1", lotId: "lot-1",
    })).rejects.toThrow(/não está ativa/);

    db.eventLot.findFirst.mockResolvedValue({ ...lot, priceCents: 0, receivingAccountId: null });
    tx.eventRegistration.create.mockResolvedValue({ ...registration, status: "CONFIRMED", paymentStatus: "CONFIRMED_MOCK" });
    const free = await service.createPublicRegistration("so-para-mocas", {
      displayName: "Pessoa Teste", modalityId: "mod1", lotId: "lot-1", notificationEmail: "",
    });
    expect(free.status).toBe("CONFIRMED");
    tx.eventRegistration.create.mockResolvedValue({ ...registration, status: "CONFIRMED", paymentStatus: "CONFIRMED_MOCK" });
    await service.createPublicRegistration("so-para-mocas", {
      displayName: "Pessoa Teste", modalityId: "mod1", lotId: "lot-1",
      notificationEmail: " Pessoa.Teste@example.test ",
    });
    expect(mail.deliverOnce).toHaveBeenCalledWith(expect.objectContaining({
      to: "pessoa.teste@example.test",
      idempotencyKey: "event-checkin:reg1",
    }), { required: false });
  });
});
