import { ValidationPipe } from "@nestjs/common";
import { hashPassword } from "../auth/auth.service";
import { IS_PUBLIC_KEY } from "../auth/auth.constants";
import { InMemorySessionStore } from "../auth/session/session-store";
import { AuthClock } from "../auth/session/auth-clock";
import type { AuthUser } from "../auth/types/auth-user";
import { BusinessException } from "../common/business.exception";
import { jpegPortrait } from "../persons/person-photo";
import { AccountController, PatchAccountBody } from "./account.controller";
import { AccountService } from "./account.service";

const pilot = {
  organizationId: "org-rf1",
  churchId: "church-rf1",
  organizationSlug: "org",
  churchSlug: "riacho-fundo-1",
  churchName: "Riacho Fundo I",
};

const actor: AuthUser = {
  userId: "user-1",
  personId: "person-1",
  email: "ana.demo@example.test",
  churchId: pilot.churchId,
  organizationId: pilot.organizationId,
  grants: [{ roleCode: "MEMBRO", organizationId: pilot.organizationId, churchId: pilot.churchId }],
};

const other: AuthUser = {
  ...actor,
  userId: "user-2",
  personId: "person-2",
  email: "bruno.demo@example.test",
};

function personRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "person-1",
    displayName: "Ana Demo",
    phone: null as string | null,
    status: "ACTIVE",
    organizationId: pilot.organizationId,
    homeChurchId: pilot.churchId as string | null,
    photoStorageKey: null as string | null,
    photo: null as { personId: string } | null,
    ...overrides,
  };
}

function setup(person = personRow()) {
  const records = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: actor.userId,
        email: actor.email,
        personId: actor.personId,
        passwordHash: "hash",
        person,
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    person: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    personPhoto: {
      upsert: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    authSession: { updateMany: jest.fn() },
    mfaChallenge: { updateMany: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const db = {
    ...records,
    $transaction: jest.fn(async (work: (tx: typeof records) => Promise<unknown>) => work(records)),
  };
  const storage = {
    buildPersonPhotoKey: jest.fn().mockReturnValue("persons/org-rf1/person-1/photo/id.jpg"),
    put: jest.fn(),
    get: jest.fn(),
    remove: jest.fn(),
  };
  const attempts = {
    assertAllowed: jest.fn(),
    recordFailure: jest.fn(),
    reset: jest.fn(),
  };
  const sessions = new InMemorySessionStore(new AuthClock());
  const revoke = jest.spyOn(sessions, "revokeAllForUser");
  const service = new AccountService(
    db as never,
    { getPilotChurch: async () => pilot } as never,
    storage as never,
    sessions,
    attempts,
  );
  return { db, storage, attempts, revoke, service };
}

describe("Minha Conta", () => {
  it("não publica as rotas", () => {
    for (const method of ["me", "patch", "password", "upload", "photo"] as const) {
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, AccountController.prototype[method])).toBeUndefined();
    }
  });

  it("devolve o perfil da sessão e esconde telefone e foto quando não há vínculo na congregação", async () => {
    const linked = setup();
    await expect(linked.service.getProfile(actor)).resolves.toEqual({
      name: "Ana Demo",
      email: actor.email,
      phone: null,
      photoPath: null,
      canEditProfilePhoto: true,
    });

    const foreign = setup(personRow({ homeChurchId: "outra-igreja" }));
    await expect(foreign.service.getProfile(actor)).resolves.toEqual({
      name: null,
      email: actor.email,
      phone: null,
      photoPath: null,
      canEditProfilePhoto: false,
    });
    await expect(foreign.service.updatePhone(actor, "(61) 99999-0000")).rejects.toBeInstanceOf(BusinessException);
    expect(foreign.db.person.updateMany).not.toHaveBeenCalled();
  });

  it("grava só o telefone da pessoa da sessão e não ecoa o número na auditoria", async () => {
    const { db, service } = setup();
    db.person.updateMany.mockImplementation(async ({ data }: { data: { phone: string | null } }) => {
      const row = await db.user.findUnique();
      row.person.phone = data.phone;
      return { count: 1 };
    });
    await expect(service.updatePhone(actor, "(61) 99999-0000")).resolves.toMatchObject({
      phone: "+5561999990000",
      email: actor.email,
    });
    expect(db.person.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "person-1", organizationId: pilot.organizationId, homeChurchId: pilot.churchId },
      data: { phone: "+5561999990000" },
    }));
    expect(JSON.stringify(db.auditLog.create.mock.calls)).not.toContain("99999");
    expect(db.user.findUnique.mock.calls[0][0].where).toEqual({ id: actor.userId });
  });

  it("recusa e-mail, personId e campo desconhecido no PATCH", async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    const meta = { type: "body" as const, metatype: PatchAccountBody };
    await expect(pipe.transform({ phone: "(61) 99999-0000", email: "outra@example.test" }, meta)).rejects.toThrow();
    await expect(pipe.transform({ phone: null, personId: "person-2" }, meta)).rejects.toThrow();
    await expect(pipe.transform({ phone: null }, meta)).resolves.toEqual({ phone: null });
  });

  it("não altera a senha quando a atual está errada e limita as tentativas", async () => {
    const { db, attempts, service } = setup();
    db.user.findUnique.mockResolvedValue({
      id: actor.userId,
      email: actor.email,
      personId: actor.personId,
      passwordHash: await hashPassword("SenhaAtual-9931"),
    });
    await expect(service.changePassword(actor, "errada", "OutraSenha-9931")).rejects.toMatchObject({
      response: { code: "ACCOUNT_PASSWORD_CURRENT_INVALID" },
    });
    expect(db.user.updateMany).not.toHaveBeenCalled();
    expect(attempts.recordFailure).toHaveBeenCalledWith(expect.stringContaining(actor.userId), expect.any(Number));
    attempts.assertAllowed.mockRejectedValueOnce(Object.assign(new Error("limite"), { status: 429 }));
    await expect(service.changePassword(actor, "SenhaAtual-9931", "OutraSenha-9931")).rejects.toThrow(/limite/);
  });

  it("troca a senha, revoga sessões e não grava a senha na auditoria", async () => {
    const { db, revoke, attempts, service } = setup();
    const passwordHash = await hashPassword("SenhaAtual-9931");
    db.user.findUnique.mockResolvedValue({
      id: actor.userId,
      email: actor.email,
      personId: actor.personId,
      passwordHash,
    });
    await service.changePassword(actor, "SenhaAtual-9931", "GardeRio-9931_Forte");
    const data = db.user.updateMany.mock.calls[0][0].data;
    expect(data.passwordHash).not.toContain("GardeRio");
    expect(data.authzVersion).toEqual({ increment: 1 });
    expect(db.authSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "REVOKED", revokeReason: "password_change" }),
    }));
    expect(revoke).toHaveBeenCalledWith(actor.userId);
    expect(attempts.reset).toHaveBeenCalled();
    expect(JSON.stringify(db.auditLog.create.mock.calls)).not.toContain("GardeRio");
    expect(JSON.stringify(db.auditLog.create.mock.calls)).not.toContain("SenhaAtual");
  });

  it("lê a foto já gravada e não aceita a foto de outra pessoa pelo id da sessão", async () => {
    const existing = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x11]);
    const { db, service } = setup(personRow({ photo: { personId: "person-1" } }));
    db.personPhoto.findUnique.mockImplementation(async ({ where }: { where: { personId: string } }) =>
      where.personId === actor.personId ? { jpeg: existing } : { jpeg: Buffer.from([0xff, 0xd8, 0xff, 0x99]) },
    );
    const bytes = await service.readPhoto(actor);
    expect(jpegPortrait(bytes)?.equals(existing)).toBe(true);
    db.user.findUnique.mockResolvedValue({
      id: other.userId,
      email: other.email,
      personId: other.personId,
      person: personRow({ id: "person-2", homeChurchId: "outra-igreja" }),
    });
    await expect(service.readPhoto(other)).rejects.toMatchObject({
      response: { code: "ACCOUNT_PERSON_UNLINKED" },
    });
  });
});
