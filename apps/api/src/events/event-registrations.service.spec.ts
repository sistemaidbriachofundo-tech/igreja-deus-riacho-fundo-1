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

  function basePrisma(overrides: Record<string, unknown> = {}) {
    return {
      portalEvent: { findFirst: jest.fn().mockResolvedValue(event) },
      eventModality: { findFirst: jest.fn().mockResolvedValue(modality) },
      eventLot: { findFirst: jest.fn().mockResolvedValue(lot) },
      eventRegistration: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { partySize: 0 } }),
        findMany: jest.fn().mockResolvedValue([registration]),
        findFirst: jest.fn().mockResolvedValue(registration),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      ...overrides,
    };
  }

  it("rejects createModality validation errors", async () => {
    const prisma = basePrisma();
    const service = new EventRegistrationsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.createModality(secretaria, "e1", { code: "", name: "X" }),
    ).rejects.toThrow(/code e name/);
    await expect(
      service.createModality(secretaria, "e1", {
        code: "x",
        name: "X",
        kind: "NOPE" as never,
      }),
    ).rejects.toThrow(/kind inválido/);
    await expect(
      service.createModality(secretaria, "e1", {
        code: "x",
        name: "X",
        minPartySize: 3,
        maxPartySize: 1,
      }),
    ).rejects.toThrow(/party size/);
    await expect(
      service.createModality(secretaria, "e1", {
        code: "x",
        name: "X",
        capacity: 0,
      }),
    ).rejects.toThrow(/capacity/);
  });

  it("lists modalities and lots with remaining capacity", async () => {
    const prisma = {
      portalEvent: { findFirst: jest.fn().mockResolvedValue(event) },
      eventModality: { findMany: jest.fn().mockResolvedValue([modality]) },
      eventLot: { findMany: jest.fn().mockResolvedValue([lot]) },
      eventRegistration: {
        groupBy: jest
          .fn()
          .mockResolvedValueOnce([
            { modalityId: "mod1", _sum: { partySize: 2 } },
          ])
          .mockResolvedValueOnce([{ lotId: "lot1", _sum: { partySize: 1 } }])
          .mockResolvedValueOnce([
            { modalityId: "mod1", _sum: { partySize: 2 } },
          ])
          .mockResolvedValueOnce([{ lotId: "lot1", _sum: { partySize: 1 } }]),
      },
    };
    const service = new EventRegistrationsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const mods = await service.listModalities(secretaria, "e1");
    expect(mods.modalities[0].occupied).toBe(2);
    expect(mods.modalities[0].remaining).toBe(8);
    const lots = await service.listLots(secretaria, "e1");
    expect(lots.lots[0].occupied).toBe(1);
    expect(lots.lots[0].remaining).toBe(4);
  });

  it("rejects createLot validation errors", async () => {
    const prisma = basePrisma({
      eventModality: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    const service = new EventRegistrationsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.createLot(secretaria, "e1", { code: "", name: "L" }),
    ).rejects.toThrow(/code e name/);
    await expect(
      service.createLot(secretaria, "e1", {
        code: "l",
        name: "L",
        priceCents: -1,
      }),
    ).rejects.toThrow(/priceCents/);
    await expect(
      service.createLot(secretaria, "e1", {
        code: "l",
        name: "L",
        capacity: 0,
      }),
    ).rejects.toThrow(/capacity/);
    await expect(
      service.createLot(secretaria, "e1", {
        code: "l",
        name: "L",
        modalityId: "missing",
      }),
    ).rejects.toThrow(/modalityId inválido/);
    await expect(
      service.createLot(secretaria, "e1", {
        code: "l",
        name: "L",
        status: "WEIRD" as never,
      }),
    ).rejects.toThrow(/status inválido/);
  });

  it("lists registrations for staff", async () => {
    const prisma = {
      portalEvent: { findFirst: jest.fn().mockResolvedValue(event) },
      eventRegistration: {
        findMany: jest.fn().mockResolvedValue([registration]),
      },
    };
    const service = new EventRegistrationsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const listed = await service.listRegistrations(secretaria, "e1");
    expect(listed.registrations).toHaveLength(1);
    expect(listed.registrations[0].id).toBe("reg1");
  });

  it("creates staff registration and rejects cancelled event", async () => {
    const freeLot = { ...lot, priceCents: 0 };
    const confirmed = {
      ...registration,
      status: "CONFIRMED",
      paymentStatus: "CONFIRMED_MOCK",
    };
    const tx = {
      eventRegistration: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { partySize: 0 } }),
        create: jest.fn().mockResolvedValue(confirmed),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      portalEvent: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ ...event, status: "CANCELLED" })
          .mockResolvedValueOnce(event),
      },
      eventModality: { findFirst: jest.fn().mockResolvedValue(modality) },
      eventLot: { findFirst: jest.fn().mockResolvedValue(freeLot) },
      eventRegistration: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { partySize: 0 } }),
      },
      ...withTx(tx),
    };
    const service = new EventRegistrationsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.createStaffRegistration(secretaria, "e1", {
        displayName: "Demo",
        modalityId: "mod1",
        lotId: "lot1",
      }),
    ).rejects.toThrow(/não aceita inscrição/);
    const ok = await service.createStaffRegistration(secretaria, "e1", {
      displayName: "Demo",
      modalityId: "mod1",
      lotId: "lot1",
    });
    expect(ok.status).toBe("CONFIRMED");
    expect(ok.paymentIntent).toBeNull();
  });

  it("returns public registration status and validates code", async () => {
    const prisma = {
      eventRegistration: {
        findFirst: jest.fn().mockResolvedValue({
          ...registration,
          event: { slug: "retiro-demo", name: "Retiro" },
        }),
      },
    };
    const service = new EventRegistrationsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.getPublicRegistrationStatus("short")).rejects.toThrow(
      /checkInCode/,
    );
    const status = await service.getPublicRegistrationStatus(
      "abc123def4567890",
    );
    expect(status.eventSlug).toBe("retiro-demo");
    expect(status).not.toHaveProperty("displayName");

    const missing = new EventRegistrationsService(
      {
        eventRegistration: { findFirst: jest.fn().mockResolvedValue(null) },
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      missing.getPublicRegistrationStatus("abc123def4567890"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("check-in edges: cancelled, already checked-in, bad code", async () => {
    const cancelled = { ...registration, status: "CANCELLED" };
    const already = {
      ...registration,
      status: "CHECKED_IN",
      paymentStatus: "CONFIRMED_MOCK",
      checkedInAt: now,
    };
    const confirmed = {
      ...registration,
      status: "CONFIRMED",
      paymentStatus: "CONFIRMED_MOCK",
    };
    const prisma = {
      eventRegistration: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(cancelled)
          .mockResolvedValueOnce(already)
          .mockResolvedValueOnce(confirmed),
      },
      portalEvent: { findFirst: jest.fn().mockResolvedValue(event) },
      ...withTx({}),
    };
    const service = new EventRegistrationsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.checkIn(secretaria, "reg1")).rejects.toThrow(
      /cancelada/,
    );
    const again = await service.checkIn(secretaria, "reg1");
    expect(again.status).toBe("CHECKED_IN");
    await expect(
      service.checkIn(secretaria, "reg1", "wrong-code"),
    ).rejects.toThrow(/não confere/);
  });

  it("cancel is idempotent when already cancelled", async () => {
    const cancelled = {
      ...registration,
      status: "CANCELLED",
      paymentStatus: "CANCELLED",
      cancelledAt: now,
    };
    const prisma = {
      eventRegistration: { findFirst: jest.fn().mockResolvedValue(cancelled) },
      portalEvent: { findFirst: jest.fn().mockResolvedValue(event) },
    };
    const service = new EventRegistrationsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.cancel(secretaria, "reg1");
    expect(result.status).toBe("CANCELLED");
  });

  it("webhook rejects missing key/signature/status and unknown intent", async () => {
    const service = new EventRegistrationsService(
      {
        eventPaymentIntent: { findFirst: jest.fn().mockResolvedValue(null) },
        eventPaymentWebhookReceipt: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.handleMockPaymentWebhook({
        signatureHeader: "x",
        idempotencyKey: "short",
        paymentIntentId: "pi1",
        status: "CONFIRMED_MOCK",
      }),
    ).rejects.toThrow(/Idempotency-Key/);
    await expect(
      service.handleMockPaymentWebhook({
        signatureHeader: undefined,
        idempotencyKey: "idem-key-003",
        paymentIntentId: "pi1",
        status: "CONFIRMED_MOCK",
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.handleMockPaymentWebhook({
        signatureHeader: "x",
        idempotencyKey: "idem-key-003",
        paymentIntentId: "pi1",
        status: "PENDING" as never,
      }),
    ).rejects.toThrow(/status mock/);

    const secret = "event-payment-mock-dev-secret";
    const idem = "idem-key-404";
    const status = "FAILED_MOCK" as const;
    const signature = createHmac("sha256", secret)
      .update(`${idem}:pi-missing:${status}`)
      .digest("hex");
    await expect(
      service.handleMockPaymentWebhook({
        signatureHeader: signature,
        idempotencyKey: idem,
        paymentIntentId: "pi-missing",
        status,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("webhook FAILED_MOCK keeps registration pending payment", async () => {
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
    const failedReg = {
      ...registration,
      paymentStatus: "FAILED_MOCK",
      status: "PENDING_PAYMENT",
    };
    const tx = {
      eventPaymentWebhookReceipt: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      eventPaymentIntent: {
        update: jest.fn().mockResolvedValue({
          ...intentRow,
          status: "FAILED_MOCK",
        }),
      },
      eventRegistration: {
        update: jest.fn().mockResolvedValue(failedReg),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      eventPaymentWebhookReceipt: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      eventPaymentIntent: {
        findFirst: jest.fn().mockResolvedValue(intentRow),
      },
      ...withTx(tx),
    };
    const service = new EventRegistrationsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const secret = "event-payment-mock-dev-secret";
    const idem = "idem-fail-001";
    const status = "FAILED_MOCK" as const;
    const signature = createHmac("sha256", secret)
      .update(`${idem}:pi1:${status}`)
      .digest("hex");
    const result = await service.handleMockPaymentWebhook({
      signatureHeader: signature,
      idempotencyKey: idem,
      paymentIntentId: "pi1",
      status,
      providerRef: "mock_fail",
    });
    expect(result.resultStatus).toBe("FAILED_MOCK");
    expect(result.registration?.status).toBe("PENDING_PAYMENT");
  });

  it("builds public catalog filtering closed window lots", async () => {
    const futureLot = {
      ...lot,
      id: "lot-future",
      opensAt: new Date("2099-01-01T00:00:00Z"),
      closesAt: null,
    };
    const pastLot = {
      ...lot,
      id: "lot-past",
      opensAt: new Date("2020-01-01T00:00:00Z"),
      closesAt: new Date("2020-02-01T00:00:00Z"),
    };
    const prisma = {
      eventModality: { findMany: jest.fn().mockResolvedValue([modality]) },
      eventLot: {
        findMany: jest.fn().mockResolvedValue([lot, futureLot, pastLot]),
      },
      eventRegistration: {
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new EventRegistrationsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const catalog = await service.publicCatalogForEvent("e1");
    expect(catalog.paymentMode).toBe("MOCK_ONLY");
    expect(catalog.rf022LodgingPending).toBe(true);
    expect(catalog.lots.map((l) => l.id)).toEqual(["lot1"]);
    expect(catalog.modalities[0].remaining).toBe(10);
  });

  it("rejects guardian on adult and partySize out of range", async () => {
    const prisma = basePrisma();
    const service = new EventRegistrationsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.createPublicRegistration("retiro-demo", {
        displayName: "Adulto",
        modalityId: "mod1",
        lotId: "lot1",
        isMinor: false,
        guardianDisplayName: "Alguém",
      }),
    ).rejects.toThrow(/só é permitido para menores/);
    await expect(
      service.createPublicRegistration("retiro-demo", {
        displayName: "Demo",
        modalityId: "mod1",
        lotId: "lot1",
        partySize: 5,
      }),
    ).rejects.toThrow(/partySize/);
  });

  it("enforces lot capacity and closed/unavailable lots", async () => {
    const closedLot = { ...lot, status: "CLOSED" };
    const fullLot = { ...lot, capacity: 1 };
    const prismaClosed = basePrisma({
      eventLot: { findFirst: jest.fn().mockResolvedValue(closedLot) },
    });
    const serviceClosed = new EventRegistrationsService(
      prismaClosed as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      serviceClosed.createPublicRegistration("retiro-demo", {
        displayName: "Demo",
        modalityId: "mod1",
        lotId: "lot1",
      }),
    ).rejects.toThrow(/lote fechado|indisponível/);

    const prismaFull = basePrisma({
      eventLot: { findFirst: jest.fn().mockResolvedValue(fullLot) },
      eventRegistration: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { partySize: 1 } }),
      },
    });
    const serviceFull = new EventRegistrationsService(
      prismaFull as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      serviceFull.createPublicRegistration("retiro-demo", {
        displayName: "Demo",
        modalityId: "mod1",
        lotId: "lot1",
      }),
    ).rejects.toThrow(/capacidade do lote|capacidade da modalidade/);
  });

  it("requires lotId for public registration and rejects bad modality", async () => {
    const prisma = basePrisma({
      eventModality: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    const service = new EventRegistrationsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.createPublicRegistration("retiro-demo", {
        displayName: "Demo",
        modalityId: "mod1",
      }),
    ).rejects.toThrow(/modalidade inválida|lotId/);

    const prismaLot = basePrisma();
    const serviceLot = new EventRegistrationsService(
      prismaLot as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      serviceLot.createPublicRegistration("retiro-demo", {
        displayName: "Demo",
        modalityId: "mod1",
        lotId: undefined,
      }),
    ).rejects.toThrow(/lotId é obrigatório/);
  });

  it("404 when event missing for staff modality create", async () => {
    const service = new EventRegistrationsService(
      {
        portalEvent: { findFirst: jest.fn().mockResolvedValue(null) },
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.createModality(secretaria, "missing", {
        code: "x",
        name: "X",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects invalid displayName/modalityId and lot window", async () => {
    const prisma = basePrisma({
      eventLot: {
        findFirst: jest.fn().mockResolvedValue({
          ...lot,
          opensAt: new Date("2099-01-01T00:00:00Z"),
        }),
      },
    });
    const service = new EventRegistrationsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.createPublicRegistration("retiro-demo", {
        displayName: "A",
        modalityId: "mod1",
        lotId: "lot1",
      }),
    ).rejects.toThrow(/displayName/);
    await expect(
      service.createPublicRegistration("retiro-demo", {
        displayName: "Demo",
        lotId: "lot1",
      }),
    ).rejects.toThrow(/modalityId/);
    await expect(
      service.createPublicRegistration("retiro-demo", {
        displayName: "Demo",
        modalityId: "mod1",
        lotId: "lot1",
      }),
    ).rejects.toThrow(/ainda não abriu/);
  });

  it("rejects invalid lot opensAt and mismatched modality on lot", async () => {
    const prisma = basePrisma({
      eventLot: {
        findFirst: jest.fn().mockResolvedValue({
          ...lot,
          modalityId: "other-mod",
        }),
      },
    });
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
    ).rejects.toThrow(/não pertence à modalidade/);

    const badDate = {
      ...basePrisma(),
      ...withTx({
        eventLot: { create: jest.fn() },
        auditLog: { create: jest.fn() },
      }),
    };
    const svcDate = new EventRegistrationsService(
      badDate as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      svcDate.createLot(secretaria, "e1", {
        code: "l2",
        name: "L2",
        opensAt: "not-a-date",
      }),
    ).rejects.toThrow(/opensAt inválido/);
  });

  it("404 when registration or parent event missing on check-in", async () => {
    const missingReg = new EventRegistrationsService(
      {
        eventRegistration: { findFirst: jest.fn().mockResolvedValue(null) },
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      missingReg.checkIn(secretaria, "missing"),
    ).rejects.toBeInstanceOf(NotFoundException);

    const missingEvent = new EventRegistrationsService(
      {
        eventRegistration: {
          findFirst: jest.fn().mockResolvedValue(registration),
        },
        portalEvent: { findFirst: jest.fn().mockResolvedValue(null) },
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      missingEvent.checkIn(secretaria, "reg1"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("creates couple modality defaults and free public registration", async () => {
    const couple = {
      ...modality,
      id: "mod-couple",
      code: "casal",
      kind: "COUPLE",
      minPartySize: 2,
      maxPartySize: 2,
      capacity: null,
    };
    const freeLot = {
      ...lot,
      modalityId: "mod-couple",
      priceCents: 0,
      capacity: null,
    };
    const confirmed = {
      ...registration,
      modalityId: "mod-couple",
      partySize: 2,
      status: "CONFIRMED",
      paymentStatus: "CONFIRMED_MOCK",
    };
    const txCreate = {
      eventModality: {
        create: jest.fn().mockResolvedValue({
          ...couple,
          minPartySize: 2,
          maxPartySize: 2,
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const prismaCreate = {
      portalEvent: { findFirst: jest.fn().mockResolvedValue(event) },
      ...withTx(txCreate),
    };
    const serviceCreate = new EventRegistrationsService(
      prismaCreate as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const mod = await serviceCreate.createModality(secretaria, "e1", {
      code: "casal",
      name: "Casal",
      kind: "COUPLE",
    });
    expect(mod.minPartySize).toBe(2);
    expect(mod.maxPartySize).toBe(2);
    expect(mod.remaining).toBeNull();

    const txReg = {
      eventRegistration: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { partySize: 0 } }),
        create: jest.fn().mockResolvedValue(confirmed),
      },
      auditLog: { create: jest.fn() },
    };
    const prismaReg = {
      portalEvent: { findFirst: jest.fn().mockResolvedValue(event) },
      eventModality: { findFirst: jest.fn().mockResolvedValue(couple) },
      eventLot: { findFirst: jest.fn().mockResolvedValue(freeLot) },
      eventRegistration: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { partySize: 0 } }),
      },
      ...withTx(txReg),
    };
    const serviceReg = new EventRegistrationsService(
      prismaReg as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await serviceReg.createPublicRegistration("retiro-demo", {
      displayName: "Casal Demo",
      modalityId: "mod-couple",
      lotId: "lot1",
      partySize: 2,
    });
    expect(result.status).toBe("CONFIRMED");
    expect(result.paymentIntent).toBeNull();
  });
});
