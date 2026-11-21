import { ConflictException } from "@nestjs/common";
import type { AuthUser } from "../auth/types/auth-user";
import { ReceivingAccountService } from "./receiving-account.service";

const scope = { organizationId: "org-rf1", churchId: "church-rf1" };
const treasurer: AuthUser = {
  userId: "tesoureiro",
  personId: "person-tesoureiro",
  email: "tesoureiro@example.test",
  grants: [{ roleCode: "TESOURARIA", ...scope }],
  ...scope,
};

function service(pending: number, current: { mercadoPagoEnabled: boolean; mercadoPagoCollectorId: string | null }) {
  const prisma = {
    churchReceivingAccount: {
      findFirst: async () => ({ id: "acc", ...current }),
      updateMany: async () => ({ count: 1 }),
    },
    eventPaymentIntent: { count: async () => pending },
    auditLog: { create: async () => ({}) },
  };
  const pilot = { getPilotChurch: async () => scope };
  return new ReceivingAccountService(prisma as never, pilot as never);
}

describe("conta de recebimento com pagamento pendente", () => {
  it("recusa trocar o recebedor enquanto existe pagamento pendente", async () => {
    const svc = service(1, { mercadoPagoEnabled: false, mercadoPagoCollectorId: null });
    await expect(svc.enableMercadoPago(treasurer, "acc", { enabled: true, collectorId: "collector-1" }))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it("aceita repetir a mesma configuração com pagamento pendente", async () => {
    const svc = service(1, { mercadoPagoEnabled: true, mercadoPagoCollectorId: "collector-1" });
    await expect(svc.enableMercadoPago(treasurer, "acc", { enabled: true, collectorId: "collector-1" }))
      .resolves.toMatchObject({ mercadoPagoEnabled: true, mercadoPagoCollectorId: "collector-1" });
  });

  it("permite alterar a conta quando não há pagamento pendente", async () => {
    const svc = service(0, { mercadoPagoEnabled: false, mercadoPagoCollectorId: null });
    await expect(svc.enableMercadoPago(treasurer, "acc", { enabled: true, collectorId: "collector-1" }))
      .resolves.toMatchObject({ mercadoPagoEnabled: true, mercadoPagoCollectorId: "collector-1" });
  });
});
