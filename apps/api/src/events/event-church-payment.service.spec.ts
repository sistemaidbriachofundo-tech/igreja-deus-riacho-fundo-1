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

  it("recusa pedido ausente, status encerrado, conta inativa e plano sem receita", async () => {
    const db = {
      eventPaymentIntent: { findFirst: jest.fn() },
      ledgerAccount: { findFirst: jest.fn() },
    };
    const service = new EventChurchPaymentService(db as never, { getPilotChurch: async () => pilot } as never);
    db.eventPaymentIntent.findFirst.mockResolvedValueOnce(null);
    await expect(service.reconcile(treasury, "pi1", true)).rejects.toThrow(/não encontrado/);
    db.eventPaymentIntent.findFirst.mockResolvedValueOnce(intent({ status: "CANCELLED" }));
    await expect(service.reconcile(treasury, "pi1", true)).rejects.toMatchObject({
      response: { code: "PAYMENT_NOT_PENDING" },
    });
    db.eventPaymentIntent.findFirst.mockResolvedValueOnce(intent({
      receivingAccount: { id: "acc1", active: false, ledgerAccountId: "bank", ledgerAccount: { active: true } },
    }));
    await expect(service.reconcile(treasury, "pi1", true)).rejects.toMatchObject({
      response: { code: "RECEIVING_ACCOUNT_INACTIVE" },
    });
    db.eventPaymentIntent.findFirst.mockResolvedValueOnce(intent());
    db.ledgerAccount.findFirst.mockResolvedValueOnce(null);
    await expect(service.reconcile(treasury, "pi1", true)).rejects.toMatchObject({
      response: { code: "REVENUE_ACCOUNT_MISSING" },
    });
    expect(service.pixFor({
      pixKey: "evento.teste@example.test",
      merchantName: "Igreja",
      merchantCity: "Brasilia",
      amountCents: 1000,
    }).copiaECola).toContain("evento.teste@example.test");
  });

  it("não cria segundo lançamento se a corrida já gravou o crédito", async () => {
    const row = intent({ status: "CONFIRMED_PIX" });
    const tx = {
      eventPaymentIntent: {
        findUnique: jest.fn().mockResolvedValue({ ledgerEntryId: "entry-pronta" }),
        updateMany: jest.fn(),
      },
      ledgerEntry: { create: jest.fn() },
      eventRegistration: { updateMany: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const db = {
      eventPaymentIntent: { findFirst: jest.fn().mockResolvedValue(row) },
      ledgerAccount: { findFirst: jest.fn().mockResolvedValue({ id: "revenue" }) },
      $transaction: jest.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)),
    };
    const service = new EventChurchPaymentService(db as never, { getPilotChurch: async () => pilot } as never);
    await expect(service.reconcile(treasury, "pi1", true)).resolves.toMatchObject({
      idempotentReplay: true,
      ledgerEntryId: "entry-pronta",
    });
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
    tx.eventPaymentIntent.findUnique.mockResolvedValue({ ledgerEntryId: null, status: "PENDING" });
    tx.eventPaymentIntent.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.reconcile(treasury, "pi1", true)).rejects.toMatchObject({
      response: { code: "PAYMENT_ALREADY_RECORDED" },
    });
  });
});
