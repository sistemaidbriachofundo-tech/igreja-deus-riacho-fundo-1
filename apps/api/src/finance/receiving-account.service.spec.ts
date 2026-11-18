import { ConflictException, ForbiddenException } from "@nestjs/common";
import type { AuthUser } from "../auth/types/auth-user";
import { ReceivingAccountController } from "./receiving-account.controller";
import {
  ReceivingAccountService,
  assertPilotPixKey,
  isChurchBankAccount,
} from "./receiving-account.service";

const pilot = { organizationId: "org-rf1", churchId: "church-rf1" };
const treasury: AuthUser = {
  userId: "tes",
  personId: "p-tes",
  email: "tesouraria.demo@example.test",
  churchId: pilot.churchId,
  organizationId: pilot.organizationId,
  grants: [{ roleCode: "TESOURARIA", ...pilot }],
};
const bank = { id: "bank-1", type: "ASSET", code: "1.1.01", active: true, name: "Conta corrente" };

function setup(ledger: unknown = bank) {
  const db = {
    ledgerAccount: { findFirst: jest.fn().mockResolvedValue(ledger) },
    churchReceivingAccount: {
      create: jest.fn().mockResolvedValue({
        id: "recv-1", displayName: "Conta da igreja", ledgerAccountId: "bank-1", active: true,
      }),
      findMany: jest.fn().mockResolvedValue([{
        id: "recv-1",
        displayName: "Conta da igreja",
        ledgerAccountId: "bank-1",
        active: true,
        ledgerAccount: { code: "1.1.01", name: "Conta corrente" },
      }]),
    },
    auditLog: { create: jest.fn() },
  };
  const service = new ReceivingAccountService(db as never, { getPilotChurch: async () => pilot } as never);
  return { db, service };
}

describe("conta que recebe o Pix", () => {
  it("aceita chave de teste e recusa documento solto", () => {
    expect(assertPilotPixKey(" Evento.Teste@example.test ")).toBe("evento.teste@example.test");
    expect(assertPilotPixKey("123e4567-e12b-12d1-a456-426655440000")).toBe("123e4567-e12b-12d1-a456-426655440000");
    expect(assertPilotPixKey("(61) 99999-0000")).toBe("+5561999990000");
    expect(() => assertPilotPixKey("chave-real")).toThrow(/PIX_KEY_NOT_ALLOWED|e-mail/);
    expect(isChurchBankAccount(bank)).toBe(true);
    expect(isChurchBankAccount({ ...bank, type: "EXPENSE", active: false })).toBe(false);
  });

  it("vincula somente conta bancária ativa e não grava a chave na auditoria", async () => {
    const { db, service } = setup();
    const created = await service.create(treasury, {
      ledgerAccountId: "bank-1",
      displayName: "  Conta da igreja  ",
      pixKey: "evento.teste@example.test",
    });
    expect(created).toMatchObject({ id: "recv-1", ledgerCode: "1.1.01" });
    expect(db.churchReceivingAccount.create.mock.calls[0][0].data.merchantCity).toBe("Brasilia");
    expect(JSON.stringify(db.auditLog.create.mock.calls)).not.toContain("evento.teste");
    await expect(service.create(treasury, {
      ledgerAccountId: "bank-1", displayName: "x", pixKey: "evento.teste@example.test",
    })).rejects.toMatchObject({ response: { code: "RECEIVING_ACCOUNT_INVALID" } });
    const expense = setup({ ...bank, type: "EXPENSE" });
    await expect(expense.service.create(treasury, {
      ledgerAccountId: "bank-1", displayName: "Conta da igreja", pixKey: "evento.teste@example.test",
    })).rejects.toMatchObject({ response: { code: "RECEIVING_ACCOUNT_INVALID" } });
  });

  it("informa conflito quando a conta já recebe Pix e esconde a chave na lista", async () => {
    const { db, service } = setup();
    db.churchReceivingAccount.create.mockRejectedValue({ code: "P2002" });
    await expect(service.create(treasury, {
      ledgerAccountId: "bank-1", displayName: "Conta da igreja", pixKey: "evento.teste@example.test", merchantCity: " ",
    })).rejects.toBeInstanceOf(ConflictException);
    db.churchReceivingAccount.create.mockRejectedValue(new Error("banco"));
    await expect(service.create(treasury, {
      ledgerAccountId: "bank-1", displayName: "Conta da igreja", pixKey: "evento.teste@example.test",
    })).rejects.toThrow("banco");
    const listed = await service.listForEvents({ ...treasury, grants: [{ roleCode: "SECRETARIA", ...pilot }] });
    expect(listed.accounts[0]).toMatchObject({ ledgerCode: "1.1.01" });
    expect(JSON.stringify(listed)).not.toContain("pixKey");
    await expect(service.listForEvents({ ...treasury, churchId: "outra" })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.create({ ...treasury, grants: [{ roleCode: "SECRETARIA", ...pilot }] }, {
      ledgerAccountId: "bank-1", displayName: "Conta da igreja", pixKey: "evento.teste@example.test",
    })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("o controller só encaminha a Tesouraria ao serviço", async () => {
    const accounts = { create: jest.fn().mockResolvedValue({ id: "recv-1" }) };
    const controller = new ReceivingAccountController(accounts as never);
    await controller.create(treasury, {
      ledgerAccountId: "bank-1",
      displayName: "Conta da igreja",
      pixKey: "evento.teste@example.test",
    });
    expect(accounts.create).toHaveBeenCalledWith(treasury, expect.objectContaining({ ledgerAccountId: "bank-1" }));
  });
});
