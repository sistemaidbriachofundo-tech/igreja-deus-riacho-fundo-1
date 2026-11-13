import { BadRequestException, ForbiddenException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ChurchAccessController, CHURCH_ADMINISTRATIVE_ROLE } from "./church-access.controller";
import type { AuthUser } from "./types/auth-user";

const pilot = { organizationId: "org-rf1", churchId: "church-rf1" };
const admin: AuthUser = {
  userId: "admin-test", personId: "person-admin", email: "admin@example.test",
  grants: [{ roleCode: "PLATFORM_ADMIN", ...pilot }],
};

function setup() {
  const records = {
    person: { findFirst: jest.fn().mockResolvedValue({ id: "person-test", displayName: "Pessoa de teste", email: "person@example.test" }) },
    ministry: { findFirst: jest.fn().mockResolvedValue(null) },
    role: { findUnique: jest.fn().mockResolvedValue({ id: "role-test" }) },
    user: {
      create: jest.fn().mockResolvedValue({ id: "user-test", email: "person@example.test", status: "DISABLED" }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
    },
    accessInvitation: {
      create: jest.fn().mockResolvedValue({ id: "invite-test" }),
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn(),
    },
    auditLog: { create: jest.fn() },
  };
  const db = { ...records, $transaction: jest.fn(async (work: (tx: typeof records) => Promise<unknown>) => work(records)) };
  const invitations = {
    newToken: jest.fn().mockReturnValue({
      token: "x".repeat(43), tokenHash: "hashed-only", expiresAt: new Date("2026-11-13T12:00:00Z"),
    }),
    deliver: jest.fn().mockResolvedValue({ sent: true, email: "person@example.test", expiresInHours: 24 }),
  };
  return {
    db, invitations,
    controller: new ChurchAccessController(db as never, { getPilotChurch: async () => pilot } as never, invitations as never),
  };
}

describe("Acessos da congregação — convite ao titular", () => {
  beforeEach(() => {
    delete process.env.EMAIL_TRANSPORT;
    process.env.ACCESS_INVITE_RESEND_API_KEY = "qa-mock-api-key";
    process.env.ACCESS_INVITE_FROM_EMAIL = "convites@example.test";
    process.env.ACCESS_INVITE_WEB_ORIGIN = "https://hml.example.test";
  });
  afterEach(() => {
    delete process.env.ACCESS_INVITE_RESEND_API_KEY;
    delete process.env.ACCESS_INVITE_FROM_EMAIL;
    delete process.env.ACCESS_INVITE_WEB_ORIGIN;
  });

  it("nega a secretaria e a administração em outra congregação", async () => {
    const { db, controller } = setup();
    await expect(controller.list({ ...admin, grants: [{ roleCode: "SECRETARIA", ...pilot }] })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.list({ ...admin, churchId: "other" })).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it("cria somente conta desativada e hash de convite na mesma transação, nunca senha do administrador", async () => {
    const { db, controller, invitations } = setup();
    const result = await controller.create(admin, { personId: "person-test", email: "PERSON@example.test", role: "MEMBRO" });
    const created = db.user.create.mock.calls[0][0].data;
    expect(created.grants.create).toMatchObject({ ...pilot, roleId: "role-test" });
    expect(created.status).toBe("DISABLED");
    expect(created.passwordHash).toBeNull();
    expect(db.accessInvitation.create.mock.calls[0][0].data).toMatchObject({
      userId: "user-test", tokenHash: "hashed-only", email: "person@example.test",
    });
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ ...pilot, action: "access.invite.create" });
    expect(invitations.deliver).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("hashed-only");
    expect(JSON.stringify(result)).not.toContain("x".repeat(43));
  });

  it("recusa e-mail diferente do cadastro e liderança de outra congregação", async () => {
    const { db, controller } = setup();
    await expect(controller.create(admin, {
      personId: "person-test", email: "outro@example.test", role: "MEMBRO",
    })).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.create(admin, {
      personId: "person-test", email: "person@example.test", role: "LIDER_MINISTERIO",
      ministryId: "other-ministry",
    })).rejects.toBeInstanceOf(NotFoundException);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("falha fechado sem provedor de e-mail, sem tocar na base", async () => {
    delete process.env.ACCESS_INVITE_RESEND_API_KEY;
    const { db, controller } = setup();
    await expect(controller.create(admin, {
      personId: "person-test", email: "person@example.test", role: "MEMBRO",
    })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("convida a pessoa já cadastrada para o perfil administrativo e registra autor e escopo", async () => {
    const { db, controller } = setup();
    await controller.create(admin, {
      personId: "person-test",
      email: "person@example.test",
      role: CHURCH_ADMINISTRATIVE_ROLE,
    });
    expect(CHURCH_ADMINISTRATIVE_ROLE).toBe("SECRETARIA");
    expect(db.auditLog.create.mock.calls.at(-1)[0].data).toMatchObject({
      actorUserId: admin.userId,
      action: "access.invite.create",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      metadata: expect.objectContaining({ role: "SECRETARIA" }),
    });
    await expect(controller.create(admin, {
      personId: "person-test",
      email: "person@example.test",
      role: "PLATFORM_ADMIN" as never,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("recusa reenvio repetido dentro de um minuto e permite o seguinte", async () => {
    const { db, controller, invitations } = setup();
    db.user.findFirst = jest.fn().mockResolvedValue({
      id: "user-test",
      email: "person@example.test",
      status: "DISABLED",
      passwordHash: null,
      person: { displayName: "Pessoa de teste", email: "person@example.test" },
    });
    db.accessInvitation.findFirst = jest.fn()
      .mockResolvedValueOnce({ id: "recente" })
      .mockResolvedValueOnce(null);
    await expect(controller.resend(admin, "user-test")).rejects.toThrow(/minuto/);
    await expect(controller.resend(admin, "user-test")).resolves.toMatchObject({ sent: true });
    expect(invitations.deliver).toHaveBeenCalledTimes(1);
    expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        actorUserId: admin.userId,
        action: "access.invite.resend",
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      }),
    }));
  });
});
