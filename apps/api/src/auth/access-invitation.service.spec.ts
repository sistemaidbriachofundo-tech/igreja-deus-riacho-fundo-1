import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { AccessInvitationService, inviteEmailConfig, inviteTokenHash } from "./access-invitation.service";

const user = { id: "user-test", status: "DISABLED", passwordHash: null, email: "person@example.test" };
const token = "x".repeat(43);
const valid = () => ({
  id: "inv-1", userId: user.id, tokenHash: inviteTokenHash(token),
  email: user.email, user, purpose: "ACTIVATION", expiresAt: new Date(Date.now() + 3600000),
  sentAt: new Date(), consumedAt: null, revokedAt: null,
});
function setup(overrides: Record<string, unknown> = {}) {
  const tx = {
    accessInvitation: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    authSession: { updateMany: jest.fn() },
    mfaChallenge: { updateMany: jest.fn() },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const db = {
    accessInvitation: {
      findUnique: jest.fn().mockResolvedValue({ ...valid(), ...overrides }),
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(async (fn: (x: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { db, tx, service: new AccessInvitationService(db as never) };
}

describe("Convite de ativação de uso único", () => {
  it("gera segredo com 256 bits, armazena somente SHA-256 e expira em 24 horas", () => {
    const { service } = setup();
    const a = service.newToken();
    const b = service.newToken();
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.token).not.toEqual(b.token);
    expect(a.tokenHash).toEqual(inviteTokenHash(a.token));
    expect(a.tokenHash).not.toContain(a.token);
    expect(a.expiresAt.getTime() - Date.now()).toBeGreaterThan(23 * 3600000);
  });

  it("recusa convite expirado, não enviado, já consumido ou revogado", async () => {
    for (const overrides of [
      { expiresAt: new Date(Date.now()-1000) },
      { sentAt: null }, { consumedAt: new Date() }, { revokedAt: new Date() },
      { user: { ...user, status: "ACTIVE" } },
    ]) {
      const { db, service } = setup(overrides);
      await expect(service.accept({ token, password: "GardeRio-9931_Forte" })).rejects.toBeInstanceOf(BadRequestException);
      expect(db.$transaction).not.toHaveBeenCalled();
    }
  });

  it("consome convite e define senha em transação com auditoria, não deixa segredo em resposta", async () => {
    const { service, tx } = setup();
    const result = await service.accept({ token, password: "GardeRio-9931_Forte" });
    expect(result).toMatchObject({ activated: true });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(tx.accessInvitation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ consumedAt: null, revokedAt: null }),
      data: expect.objectContaining({ consumedAt: expect.any(Date) }),
    }));
    expect(tx.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "ACTIVE", passwordHash: expect.any(String), authzVersion: { increment: 1 } }),
    }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "access.activate" }),
    }));
  });

  it("redefine a senha, revoga sessões e desafios e preserva o segundo fator", async () => {
    const { db, service, tx } = setup({
      purpose: "PASSWORD_RESET",
      user: { ...user, status: "ACTIVE", passwordHash: "hash-anterior" },
    });
    const input = { token, password: "GardeRio-9931_Forte" };
    await expect(service.accept(input)).rejects.toBeInstanceOf(BadRequestException);
    expect(db.$transaction).not.toHaveBeenCalled();
    await expect(service.accept(input, "PASSWORD_RESET")).resolves.toMatchObject({ activated: true });
    expect(tx.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "ACTIVE", passwordHash: "hash-anterior" }),
    }));
    expect(tx.authSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "REVOKED" }),
    }));
    expect(tx.mfaChallenge.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: "REVOKED" },
    }));
  });

  it("usa o caminho do GitHub Pages nos links de homologação", async () => {
    const env = jest.replaceProperty(process, "env", {
      ...process.env,
      IDBRF_RUNTIME_STAGE: "hml",
      ACCESS_INVITE_DELIVERY: "preview",
      ACCESS_INVITE_WEB_ORIGIN: "https://church.github.io",
      ACCESS_INVITE_WEB_BASE_PATH: "/riacho",
    });
    try {
      const { service } = setup();
      await expect(service.deliver({
        inviteId: "inv-1", token, email: user.email, name: "Teste", purpose: "PASSWORD_RESET",
      })).resolves.toMatchObject({
        sent: false, previewUrl: "https://church.github.io/riacho/redefinir-senha/#token=" + token,
      });
    } finally { env.restore(); }
  });

  it("falha fechado quando não existe provedor de e-mail configurado", () => {
    const old = process.env.ACCESS_INVITE_RESEND_API_KEY;
    delete process.env.ACCESS_INVITE_RESEND_API_KEY;
    try { expect(() => inviteEmailConfig()).toThrow(ServiceUnavailableException); }
    finally { if (old !== undefined) process.env.ACCESS_INVITE_RESEND_API_KEY = old; }
  });
});
