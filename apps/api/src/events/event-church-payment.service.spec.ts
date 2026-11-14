import { ForbiddenException } from "@nestjs/common";
import type { AuthUser } from "../auth/types/auth-user";
import { EventChurchPaymentService } from "./event-church-payment.service";

const pilot = { organizationId: "org-rf1", churchId: "church-rf1" };
const treasury: AuthUser = {
  userId: "tesoureiro",
  personId: "p-tes",
  email: "tesouraria.demo@example.test",
  churchId: pilot.churchId,
  organizationId: pilot.organizationId,
  grants: [{ roleCode: "TESOURARIA", ...pilot }],
};
const secretaria: AuthUser = {
  ...treasury,
  userId: "sec",
  grants: [{ roleCode: "SECRETARIA", ...pilot }],
};

function intent(overrides: Record<string, unknown> = {}) {
  return {
    id: "pi1",
    status: "PENDING",
    amountCents: 2500,
    registrationId: "reg1",
    eventId: "evt1",
    receivingAccountId: "acc1",
    ledgerEntryId: null as string | null,
    registration: {
      id: "reg1",
      status: "PENDING_PAYMENT",
      notificationEmail: "inscrito@example.test",
      checkInCode: "a".repeat(32),
    },
    event: { id: "evt1", name: "So para Mocas" },
    receivingAccount: {
      id: "acc1",
      active: true,
      ledgerAccountId: "bank",
      ledgerAccount: { id: "bank", active: true },
    },
    ...overrides,
  };
}

describe("conciliação Pix do evento", () => {
  it("nega secretaria, outra congregação e crédito não confirmado", async () => {
    const service = new EventChurchPaymentService(
      {} as never,
      { getPilotChurch: async () => pilot } as never,
    );
    await expect(service.reconcile(secretaria, "pi1", true)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.reconcile({ ...treasury, churchId: "outra" }, "pi1", true)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.reconcile(treasury, "pi1", false)).rejects.toMatchObject({
      response: { code: "BANK_CREDIT_NOT_CONFIRMED" },
    });
  });

  it("grava o lançamento uma vez e reaproveita o mesmo id na repetição", async () => {
    const row = intent();
    const created: Array<{ amountCents: number; lines: { create: unknown[] } }> = [];
    const tx = {
      eventPaymentIntent: {
        findUnique: jest.fn(async () => ({ ...row })),
        updateMany: jest.fn(async ({ data }: { data: { ledgerEntryId?: string; status?: string } }) => {
          if (data.ledgerEntryId) row.ledgerEntryId = data.ledgerEntryId;
          if (data.status) row.status = data.status;
          return { count: row.ledgerEntryId && data.ledgerEntryId && data.status ? 0 : 1 };
        }),
      },
      ledgerEntry: {
        create: jest.fn(async ({ data }: { data: { amountCents: number; lines: { create: unknown[] } } }) => {
          created.push(data);
          return { id: "entry-1" };
        }),
      },
      eventRegistration: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: jest.fn() },
    };
    tx.eventPaymentIntent.updateMany.mockImplementation(async ({ data }: { data: { ledgerEntryId?: string; status?: string } }) => {
      if (data.ledgerEntryId) {
        if (row.ledgerEntryId) return { count: 0 };
        row.ledgerEntryId = data.ledgerEntryId;
        return { count: 1 };
      }
      if (row.status !== "PENDING" && !(row.status === "CONFIRMED_PIX" && !row.ledgerEntryId)) return { count: 0 };
      row.status = data.status ?? row.status;
      return { count: 1 };
    });
    const db = {
      eventPaymentIntent: { findFirst: jest.fn(async () => ({ ...row, ledgerEntryId: row.ledgerEntryId, status: row.status })) },
      ledgerAccount: { findFirst: jest.fn().mockResolvedValue({ id: "revenue", active: true, type: "REVENUE" }) },
      $transaction: jest.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)),
    };
    const mail = { deliverOnce: jest.fn().mockResolvedValue({ status: "SENT", idempotentReplay: false }) };
    const service = new EventChurchPaymentService(db as never, { getPilotChurch: async () => pilot } as never, mail as never);
    const first = await service.reconcile(treasury, "pi1", true);
    const second = await service.reconcile(treasury, "pi1", true);
    expect(first.ledgerEntryId).toBe("entry-1");
    expect(second).toMatchObject({ idempotentReplay: true, ledgerEntryId: "entry-1" });
    expect(created).toHaveLength(1);
    expect(created[0].amountCents).toBe(2500);
    expect(created[0].lines.create).toHaveLength(2);
    expect(mail.deliverOnce).toHaveBeenCalledTimes(2);
    expect(mail.deliverOnce.mock.calls[0][0].idempotencyKey).toBe("event-checkin:reg1");
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain("inscrito@example.test");
  });
});
