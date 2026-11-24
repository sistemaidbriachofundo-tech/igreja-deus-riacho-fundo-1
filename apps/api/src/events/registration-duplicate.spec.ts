import { ConflictException } from "@nestjs/common";
import type { AuthUser } from "../auth/types/auth-user";
import { EventRegistrationsService } from "./event-registrations.service";
import {
  classifyParticipationOverlap,
  participationIdentityKeys,
  participationStillBlocks,
} from "./participation-identity";

describe("identidade da participação", () => {
  it("não bloqueia homônimo nem separa filhos, e ignora o lote", () => {
    const ana = participationIdentityKeys({
      registrantPersonId: "guardian", isMinor: false, partySize: 2,
      participants: [{ email: "Ana@example.test" }, { email: "bia@example.test" }],
    });
    const homonym = participationIdentityKeys({
      registrantPersonId: "outra-familia", isMinor: false, partySize: 1, displayName: "Ana",
      notificationEmail: "outra.ana@example.test",
    });
    expect(ana).toEqual(["email:ana@example.test", "email:bia@example.test"]);
    expect(homonym.some(key => ana.includes(key))).toBe(false);
    expect(participationIdentityKeys({
      registrantPersonId: "membro", isMinor: false, partySize: 1, notificationEmail: "membro@example.test",
    })).toEqual(["email:membro@example.test", "person:membro"]);
    expect(participationIdentityKeys({
      registrantPersonId: "guardian", isMinor: true, partySize: 1, displayName: "  Ana   Clara ",
    })).toEqual(["dependent:guardian:ana clara"]);
    expect(participationIdentityKeys({
      registrantPersonId: "outro", isMinor: true, partySize: 1, displayName: "Ana Clara",
    })).not.toEqual(["dependent:guardian:ana clara"]);
  });

  it("classifica repetição total, sobreposição parcial e histórico encerrado", () => {
    const held = [{
      registrationId: "reg-1", registrantPersonId: "membro", status: "CONFIRMED",
      keys: ["email:ana@example.test", "email:bia@example.test"],
    }];
    expect(classifyParticipationOverlap(["email:ana@example.test", "email:bia@example.test"], held).kind).toBe("full");
    expect(classifyParticipationOverlap(["email:bia@example.test", "email:caio@example.test"], held).kind).toBe("partial");
    expect(classifyParticipationOverlap(["email:caio@example.test"], held).kind).toBe("none");
    expect(participationStillBlocks({ status: "CANCELLED", paymentStatus: "CANCELLED" })).toBe(false);
    expect(participationStillBlocks({ status: "CONFIRMED", paymentStatus: "REFUNDED" })).toBe(false);
    expect(participationStillBlocks({ status: "PENDING_PAYMENT", paymentStatus: "PENDING", eventStatus: "ARCHIVED" })).toBe(false);
    expect(participationStillBlocks({ status: "PENDING_PAYMENT", paymentStatus: "FAILED_MOCK" })).toBe(true);
  });
});

describe("EventRegistrationsService duplicidade", () => {
  const pilot = { organizationId: "org1", churchId: "church-rf1" };
  const member: AuthUser = {
    userId: "u-membro", personId: "p-membro", email: "membro@example.test",
    grants: [{ roleCode: "MEMBRO", ...pilot }],
  };
  const staff: AuthUser = {
    userId: "u-sec", personId: "p-sec", email: "sec@example.test",
    grants: [{ roleCode: "SECRETARIA", ...pilot }],
  };
  const event = {
    id: "e1", ...pilot, ministryId: "m1", name: "Retiro", slug: "retiro-demo",
    status: "PUBLISHED", ticketPolicy: "REGISTRATION",
  };
  const modality = { id: "mod1", eventId: "e1", minPartySize: 1, maxPartySize: 8, capacity: 10 };
  const lot = {
    id: "lot1", eventId: "e1", modalityId: "mod1", status: "OPEN", priceCents: 5000,
    currency: "BRL", capacity: 1, opensAt: null, closesAt: null,
  };

  function harness(options?: { ticketPolicy?: string }) {
    const keys: Array<{ registrationId: string; identityKey: string }> = [];
    const registrations = new Map<string, {
      id: string; status: string; paymentStatus: string; registrantPersonId: string | null;
    }>();
    const mail = { deliverOnce: jest.fn() };
    let creates = 0;
    let tail = Promise.resolve();
    const db = {
      person: { findFirst: jest.fn().mockResolvedValue({ id: member.personId, isMinor: false, displayName: "Membro" }) },
      portalEvent: { findFirst: jest.fn(async () => ({ ...event, ticketPolicy: options?.ticketPolicy ?? event.ticketPolicy })) },
      eventModality: { findFirst: jest.fn().mockResolvedValue(modality) },
      eventLot: { findFirst: jest.fn().mockResolvedValue(lot) },
      eventLodgingOption: { findMany: jest.fn().mockResolvedValue([]) },
      eventMealOption: { findMany: jest.fn().mockResolvedValue([]) },
      eventTransportOption: { findMany: jest.fn().mockResolvedValue([]) },
      eventRegistration: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { partySize: 0 } }),
        create: jest.fn().mockImplementation(async () => {
          creates += 1;
          const now = new Date("2026-11-24T00:00:00.000Z");
          const row = {
            id: `reg-${creates}`, eventId: "e1", modalityId: "mod1", lotId: "lot1",
            lodgingOptionId: null, mealOptionId: null, transportOptionId: null,
            status: "PENDING_PAYMENT", paymentStatus: "PENDING",
            registrantPersonId: member.personId, checkInCode: "c".repeat(32), partySize: 1,
            guardianAuthStatus: "NOT_REQUIRED", guardianDisplayName: null, isMinor: false,
            displayName: "Membro", checkedInAt: null, cancelledAt: null, createdAt: now, updatedAt: now,
          };
          registrations.set(row.id, row);
          return row;
        }),
        findMany: jest.fn().mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => (
          where.id.in.flatMap(id => {
            const row = registrations.get(id);
            return row ? [row] : [];
          })
        )),
      },
      eventParticipationKey: {
        findMany: jest.fn().mockImplementation(async ({ where }: { where: { identityKey: { in: string[] } } }) => (
          keys.filter(key => where.identityKey.in.includes(key.identityKey))
        )),
        createMany: jest.fn().mockImplementation(async ({ data }: { data: Array<{ registrationId: string; identityKey: string }> }) => {
          for (const row of data) {
            if (keys.some(key => key.identityKey === row.identityKey)) {
              throw Object.assign(new Error("unique"), { code: "P2002", meta: { target: ["event_id", "identity_key"] } });
            }
            keys.push(row);
          }
        }),
        deleteMany: jest.fn().mockImplementation(async ({ where }: { where: { registrationId: string | { in: string[] } } }) => {
          const ids = new Set(typeof where.registrationId === "string" ? [where.registrationId] : where.registrationId.in);
          for (let index = keys.length - 1; index >= 0; index -= 1) {
            if (ids.has(keys[index].registrationId)) keys.splice(index, 1);
          }
        }),
      },
      eventPaymentIntent: { create: jest.fn().mockResolvedValue({ id: "pi1", status: "PENDING", amountCents: 5000 }) },
      auditLog: { create: jest.fn() },
      $executeRaw: jest.fn(),
      $transaction: jest.fn(),
    };
    db.$transaction.mockImplementation(async (work: (client: typeof db) => Promise<unknown>) => {
      const previous = tail;
      let release = () => {};
      tail = new Promise<void>(resolve => { release = resolve; });
      await previous;
      try {
        return await work(db);
      } finally {
        release();
      }
    });
    const service = new EventRegistrationsService(db as never, { getPilotChurch: async () => pilot } as never, mail as never);
    return { service, db, mail, keys, registrations, created: () => creates };
  }

  const input = {
    displayName: "Membro Demo", modalityId: "mod1", lotId: "lot1", notificationEmail: "membro@example.test",
  };

  it("recupera a inscrição do titular mesmo com o lote lotado e não cobra de novo", async () => {
    const { service, db, mail, keys, created } = harness();
    db.eventRegistration.aggregate.mockRejectedValue(new Error("capacidade não deveria ser consultada"));
    keys.push({ registrationId: "reg-antiga", identityKey: "person:p-membro" });
    db.eventRegistration.findMany.mockResolvedValue([{
      id: "reg-antiga", status: "CONFIRMED", paymentStatus: "CONFIRMED_PIX", registrantPersonId: "p-membro",
    }]);
    await expect(service.createMemberRegistration(member, "retiro-demo", input)).rejects.toMatchObject({
      response: {
        code: "EVENT_REGISTRATION_DUPLICATE", overlap: "FULL",
        existing: { id: "reg-antiga", status: "CONFIRMED" },
      },
    });
    expect(created()).toBe(0);
    expect(db.eventPaymentIntent.create).not.toHaveBeenCalled();
    expect(db.eventRegistration.aggregate).not.toHaveBeenCalled();
    expect(mail.deliverOnce).not.toHaveBeenCalled();
  });

  it("não revela inscrição alheia para a equipe e permite homônimo", async () => {
    const { service, db, keys, created } = harness();
    keys.push({ registrationId: "reg-alheia", identityKey: "email:pessoa@example.test" });
    db.eventRegistration.findMany.mockResolvedValue([{
      id: "reg-alheia", status: "PENDING_PAYMENT", paymentStatus: "PENDING", registrantPersonId: "outra-pessoa",
    }]);
    const error = await service.createStaffRegistration(staff, "e1", {
      ...input, displayName: "Pessoa Homônima", notificationEmail: "pessoa@example.test",
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConflictException);
    const body = (error as ConflictException).getResponse() as Record<string, unknown>;
    expect(body).toMatchObject({ code: "EVENT_REGISTRATION_DUPLICATE", overlap: "FULL" });
    expect(body.existing).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/checkIn|pix|ticket/i);
    expect(created()).toBe(0);

    keys.length = 0;
    db.eventRegistration.findMany.mockImplementation(async () => []);
    await expect(service.createMemberRegistration({ ...member, personId: "outra-pessoa" }, "retiro-demo", {
      ...input, displayName: "Pessoa Homônima", notificationEmail: "homonimo@example.test",
    })).resolves.toMatchObject({ status: "PENDING_PAYMENT" });
    expect(created()).toBe(1);
  });

  it("pede só os participantes novos quando a família se sobrepõe", async () => {
    const { service, db, mail, keys, created } = harness({ ticketPolicy: "PARTICIPANT" });
    keys.push({ registrationId: "reg-familia", identityKey: "email:ana@example.test" });
    db.eventRegistration.findMany.mockResolvedValue([{
      id: "reg-familia", status: "PENDING_PAYMENT", paymentStatus: "PENDING", registrantPersonId: member.personId,
    }]);
    const error = await service.createMemberRegistration(member, "retiro-demo", {
      ...input,
      participants: [
        { name: "Ana", email: "ana@example.test" },
        { name: "Caio", email: "caio@example.test" },
      ],
    }).catch((caught: unknown) => caught);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: "EVENT_REGISTRATION_PARTIAL_OVERLAP",
      overlap: "PARTIAL",
      existing: { id: "reg-familia", status: "PENDING_PAYMENT" },
    });
    expect(created()).toBe(0);
    expect(mail.deliverOnce).not.toHaveBeenCalled();
  });

  it("duas sessões concorrentes deixam uma inscrição e devolvem a primeira", async () => {
    const { service, mail, created } = harness();
    const results = await Promise.allSettled([
      service.createMemberRegistration(member, "retiro-demo", input),
      service.createMemberRegistration(member, "retiro-demo", input),
    ]);
    const succeeded = results.find(result => result.status === "fulfilled");
    const rejected = results.find(result => result.status === "rejected");
    expect(succeeded?.status).toBe("fulfilled");
    expect(created()).toBe(1);
    expect(mail.deliverOnce).not.toHaveBeenCalled();
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status === "rejected") {
      expect((rejected.reason as ConflictException).getResponse()).toMatchObject({
        code: "EVENT_REGISTRATION_DUPLICATE",
        existing: { id: succeeded?.status === "fulfilled" ? succeeded.value.id : "" },
      });
    }
  });

  it("libera a chave de inscrição cancelada sem apagar o histórico", async () => {
    const { service, keys, registrations, created } = harness();
    registrations.set("reg-cancelada", {
      id: "reg-cancelada", status: "CANCELLED", paymentStatus: "CANCELLED", registrantPersonId: member.personId,
    });
    keys.push({ registrationId: "reg-cancelada", identityKey: "person:p-membro" });
    await expect(service.createMemberRegistration(member, "retiro-demo", input)).resolves.toMatchObject({ status: "PENDING_PAYMENT" });
    expect(created()).toBe(1);
    expect(keys.some(key => key.registrationId === "reg-cancelada")).toBe(false);
    expect(registrations.get("reg-cancelada")?.status).toBe("CANCELLED");
  });
});
