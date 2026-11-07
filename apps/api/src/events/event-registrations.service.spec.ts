import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHmac } from "crypto";
import { EventRegistrationsService } from "./event-registrations.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("EventRegistrationsService", () => {
  const pilot = {
    organizationId: "org1",
    churchId: "church-rf1",
    organizationSlug: "igreja-de-deus",
    churchSlug: "riacho-fundo-1",
    churchName: "Riacho Fundo I (demo)",
  };

  const secretaria: AuthUser = {
    userId: "u-sec",
    personId: "p-sec",
    email: "ana.demo@example.test",
    grants: [
      {
        roleCode: "SECRETARIA",
        organizationId: "org1",
        churchId: "church-rf1",
      },
    ],
  };

  const now = new Date("2026-11-07T12:00:00Z");
  const event = {
    id: "e1",
    organizationId: pilot.organizationId,
    churchId: pilot.churchId,
    ministryId: "m-jovens" as string | null,
    name: "Retiro",
    slug: "retiro-demo",
    status: "PUBLISHED",
  };

  const modality = {
    id: "mod1",
    eventId: "e1",
    code: "individual",
    name: "Individual",
    kind: "INDIVIDUAL",
    capacity: 10,
    minPartySize: 1,
    maxPartySize: 1,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  };

  const lot = {
    id: "lot1",
    eventId: "e1",
    modalityId: "mod1",
    code: "lote1",
    name: "1º lote",
    capacity: 5,
    priceCents: 5000,
    currency: "BRL",
    opensAt: new Date("2026-01-01T00:00:00Z"),
    closesAt: new Date("2026-12-31T00:00:00Z"),
    status: "OPEN",
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  };

  const registration = {
    id: "reg1",
    organizationId: pilot.organizationId,
    churchId: pilot.churchId,
    eventId: "e1",
    modalityId: "mod1",
    lotId: "lot1",
    displayName: "Demo Participante",
    partySize: 1,
    isMinor: false,
    guardianDisplayName: null as string | null,
    status: "PENDING_PAYMENT",
    paymentStatus: "PENDING",
    checkInCode: "abc123def4567890",
    checkedInAt: null as Date | null,
    cancelledAt: null as Date | null,
    createdAt: now,
    updatedAt: now,
  };

  function withTx(tx: object) {
    return {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
  }

  it("creates modality and lot for staff", async () => {
    const tx = {
      eventModality: { create: jest.fn().mockResolvedValue(modality) },
      eventLot: { create: jest.fn().mockResolvedValue(lot) },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      portalEvent: { findFirst: jest.fn().mockResolvedValue(event) },
      eventModality: { findFirst: jest.fn().mockResolvedValue(modality) },
      ...withTx(tx),
    };
    const service = new EventRegistrationsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    const mod = await service.createModality(secretaria, "e1", {
      code: "individual",
      name: "Individual",
      kind: "INDIVIDUAL",
      capacity: 10,
    });
    expect(mod.code).toBe("individual");
    expect(mod.remaining).toBe(10);

    const createdLot = await service.createLot(secretaria, "e1", {
      code: "lote1",
      name: "1º lote",
      modalityId: "mod1",
      capacity: 5,
      priceCents: 5000,
      status: "OPEN",
    });
    expect(createdLot.paymentMode).toBe("MOCK_ONLY");
    expect(createdLot.priceCents).toBe(5000);
  });

  it("rejects public registration with real PII fields", async () => {
    const service = new EventRegistrationsService(
      {
        portalEvent: { findFirst: jest.fn().mockResolvedValue(event) },
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.createPublicRegistration("retiro-demo", {
        displayName: "Demo",
        modalityId: "mod1",
        lotId: "lot1",
        email: "real@example.com",
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("requires guardianDisplayName when isMinor", async () => {
    const prisma = {
      portalEvent: { findFirst: jest.fn().mockResolvedValue(event) },
      eventModality: { findFirst: jest.fn().mockResolvedValue(modality) },
      eventLot: { findFirst: jest.fn().mockResolvedValue(lot) },
      eventRegistration: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { partySize: 0 } }),
      },
    };
    const service = new EventRegistrationsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.createPublicRegistration("retiro-demo", {
        displayName: "Menor Demo",
        modalityId: "mod1",
        lotId: "lot1",
        isMinor: true,
      }),
    ).rejects.toThrow(/guardianDisplayName/);
  });

  it("creates paid registration as PENDING_PAYMENT with mock intent", async () => {
    const intent = {
      id: "pi1",
      status: "PENDING",
      amountCents: 5000,
    };
    const tx = {
      eventRegistration: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { partySize: 0 } }),
        create: jest.fn().mockResolvedValue(registration),
      },
      eventPaymentIntent: { create: jest.fn().mockResolvedValue(intent) },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      portalEvent: { findFirst: jest.fn().mockResolvedValue(event) },
      eventModality: { findFirst: jest.fn().mockResolvedValue(modality) },
      eventLot: { findFirst: jest.fn().mockResolvedValue(lot) },
      eventRegistration: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { partySize: 0 } }),
      },
      ...withTx(tx),
    };
    const service = new EventRegistrationsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.createPublicRegistration("retiro-demo", {
      displayName: "Demo Participante",
      modalityId: "mod1",
      lotId: "lot1",
      isMinor: false,
    });
    expect(result.status).toBe("PENDING_PAYMENT");
    expect(result.paymentIntent?.mode).toBe("MOCK_ONLY");
    expect(result.paymentIntent?.id).toBe("pi1");
  });

  it("confirms mock webhook and replays idempotently", async () => {
    const intentRow = {
      id: "pi1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      eventId: "e1",
      registrationId: "reg1",
      status: "PENDING",
      providerRef: "mock_x",
      registration: { ...registration },
    };
    const confirmedReg = {
      ...registration,
      status: "CONFIRMED",
      paymentStatus: "CONFIRMED_MOCK",
    };
    const tx = {
      eventPaymentWebhookReceipt: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      eventPaymentIntent: {
        update: jest.fn().mockResolvedValue({
          ...intentRow,
          status: "CONFIRMED_MOCK",
        }),
      },
      eventRegistration: {
        update: jest.fn().mockResolvedValue(confirmedReg),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      eventPaymentWebhookReceipt: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            paymentIntentId: "pi1",
            resultStatus: "CONFIRMED_MOCK",
          }),
      },
      eventPaymentIntent: {
        findFirst: jest.fn().mockResolvedValue(intentRow),
        findUnique: jest.fn().mockResolvedValue({
          ...intentRow,
          registration: confirmedReg,
        }),
      },
      ...withTx(tx),
    };
    const service = new EventRegistrationsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    const secret = "event-payment-mock-dev-secret";
    const idem = "idem-key-001";
    const status = "CONFIRMED_MOCK" as const;
    const canonical = `${idem}:pi1:${status}`;
    const signature = createHmac("sha256", secret)
      .update(canonical)
      .digest("hex");

    const first = await service.handleMockPaymentWebhook({
      signatureHeader: signature,
      idempotencyKey: idem,
      paymentIntentId: "pi1",
      status,
    });
    expect(first.idempotentReplay).toBe(false);
    expect(first.resultStatus).toBe("CONFIRMED_MOCK");
    expect(first.registration?.status).toBe("CONFIRMED");

    const replay = await service.handleMockPaymentWebhook({
      signatureHeader: signature,
      idempotencyKey: idem,
      paymentIntentId: "pi1",
      status,
    });
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.resultStatus).toBe("CONFIRMED_MOCK");
  });

  it("rejects webhook with bad signature", async () => {
    const service = new EventRegistrationsService(
      {} as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.handleMockPaymentWebhook({
        signatureHeader: "deadbeef",
        idempotencyKey: "idem-key-002",
        paymentIntentId: "pi1",
        status: "CONFIRMED_MOCK",
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("checks in confirmed registration and blocks pending payment", async () => {
    const confirmed = {
      ...registration,
      status: "CONFIRMED",
      paymentStatus: "CONFIRMED_MOCK",
    };
    const checked = {
      ...confirmed,
      status: "CHECKED_IN",
      checkedInAt: now,
    };
    const tx = {
      eventRegistration: { update: jest.fn().mockResolvedValue(checked) },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      eventRegistration: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(confirmed)
          .mockResolvedValueOnce(registration),
      },
      portalEvent: { findFirst: jest.fn().mockResolvedValue(event) },
      ...withTx(tx),
    };
    const service = new EventRegistrationsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const ok = await service.checkIn(secretaria, "reg1");
    expect(ok.status).toBe("CHECKED_IN");

    await expect(service.checkIn(secretaria, "reg1")).rejects.toThrow(
      /Pagamento pendente/,
    );
  });

  it("cancels registration and pending payment intents", async () => {
    const cancelled = {
      ...registration,
      status: "CANCELLED",
      paymentStatus: "CANCELLED",
      cancelledAt: now,
    };
    const tx = {
      eventRegistration: { update: jest.fn().mockResolvedValue(cancelled) },
      eventPaymentIntent: { updateMany: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      eventRegistration: { findFirst: jest.fn().mockResolvedValue(registration) },
      portalEvent: { findFirst: jest.fn().mockResolvedValue(event) },
      ...withTx(tx),
    };
    const service = new EventRegistrationsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.cancel(secretaria, "reg1");
    expect(result.status).toBe("CANCELLED");
    expect(tx.eventPaymentIntent.updateMany).toHaveBeenCalled();
  });

  it("returns 404 for unknown public event slug", async () => {
    const service = new EventRegistrationsService(
      {
        portalEvent: { findFirst: jest.fn().mockResolvedValue(null) },
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.createPublicRegistration("inexistente", {
        displayName: "X",
        modalityId: "mod1",
        lotId: "lot1",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("enforces modality capacity", async () => {
    const prisma = {
      portalEvent: { findFirst: jest.fn().mockResolvedValue(event) },
      eventModality: {
        findFirst: jest.fn().mockResolvedValue({ ...modality, capacity: 1 }),
      },
      eventLot: { findFirst: jest.fn().mockResolvedValue(lot) },
      eventRegistration: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { partySize: 1 } }),
      },
    };
    const service = new EventRegistrationsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.createPublicRegistration("retiro-demo", {
        displayName: "Demo",
        modalityId: "mod1",
        lotId: "lot1",
      }),
    ).rejects.toThrow(/capacidade da modalidade/);
  });
});
