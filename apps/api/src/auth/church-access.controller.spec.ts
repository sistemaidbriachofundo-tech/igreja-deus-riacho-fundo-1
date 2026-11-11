import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { ChurchAccessController } from "./church-access.controller";
import { verifyPassword } from "./auth.service";
import type { AuthUser } from "./types/auth-user";

const pilot = { organizationId: "org-rf1", churchId: "church-rf1" };
const admin: AuthUser = {
  userId: "admin-test", personId: "person-admin", email: "admin@example.test",
  grants: [{ roleCode: "PLATFORM_ADMIN", ...pilot }],
};

function setup() {
  const records = {
    person: { findFirst: jest.fn().mockResolvedValue({ id: "person-test", displayName: "Pessoa de teste" }) },
    ministry: { findFirst: jest.fn().mockResolvedValue(null) },
    role: { findUnique: jest.fn().mockResolvedValue({ id: "role-test" }) },
    user: { create: jest.fn().mockResolvedValue({ id: "user-test", email: "person@example.test", status: "ACTIVE" }), findMany: jest.fn().mockResolvedValue([]) },
    auditLog: { create: jest.fn() },
  };
  const db = { ...records, $transaction: jest.fn(async (work: (tx: typeof records) => Promise<unknown>) => work(records)) };
  return { db, controller: new ChurchAccessController(db as never, { getPilotChurch: async () => pilot } as never) };
}

describe("Acessos da congregação", () => {
  it("recusa a secretaria e a administração em outra congregação antes de consultar contas", async () => {
    const { db, controller } = setup();
    await expect(controller.list({ ...admin, grants: [{ roleCode: "SECRETARIA", ...pilot }] })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.list({ ...admin, churchId: "other" })).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it("cria conta, perfil e auditoria na mesma transação e guarda apenas o hash", async () => {
    const { db, controller } = setup();
    const password = "Fixture-14+-caracteres";
    const result = await controller.create(admin, { personId: "person-test", email: "PERSON@example.test", role: "MEMBRO", password });
    const create = db.user.create.mock.calls[0][0];
    expect(create.data.grants.create).toMatchObject({ ...pilot, roleId: "role-test" });
    expect(await verifyPassword(password, create.data.passwordHash)).toBe(true);
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ ...pilot, action: "access.create" });
    expect(JSON.stringify(result)).not.toContain("password");
  });

  it("recusa vincular a liderança a um ministério fora da congregação", async () => {
    const { db, controller } = setup();
    await expect(controller.create(admin, {
      personId: "person-test", email: "person@example.test", role: "LIDER_MINISTERIO",
      ministryId: "other-ministry", password: "Fixture-14+-caracteres",
    })).rejects.toBeInstanceOf(NotFoundException);
    expect(db.user.create).not.toHaveBeenCalled();
  });
});
