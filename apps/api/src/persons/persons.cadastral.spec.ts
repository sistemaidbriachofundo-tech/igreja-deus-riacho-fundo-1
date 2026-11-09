import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { BusinessException } from "../common/business.exception";
import type { AuthUser } from "../auth/types/auth-user";
import { PersonsService } from "./persons.service";

describe("PersonsService cadastral patch", () => {
  const pilot = {
    organizationId: "org1",
    churchId: "church-rf1",
    organizationSlug: "igreja-de-deus",
    churchSlug: "riacho-fundo-1",
    churchName: "Riacho Fundo I (demo)",
  };
  const updatedAt = new Date("2026-11-01T00:00:00.000Z");

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

  function actor(roleCode: string, churchId = "church-rf1"): AuthUser {
    return {
      userId: `u-${roleCode}`,
      personId: `p-${roleCode}`,
      email: `${roleCode.toLowerCase()}@example.test`,
      grants: [{ roleCode, organizationId: "org1", churchId }],
    };
  }

  function row(overrides: Record<string, unknown> = {}) {
    return {
      id: "p1",
      displayName: "Ana Demo",
      email: "ana.demo@example.test",
      status: "ACTIVE",
      householdId: null,
      kind: "VISITOR",
      isMinor: false,
      legalGuardianPersonId: null,
      photoStorageKey: null,
      organizationId: "org1",
      updatedAt,
      ...overrides,
    };
  }

  function build() {
    const prisma = {
      person: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
      },
      household: { findFirst: jest.fn() },
      churchMembership: {
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: "audit-1" }) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
      fn(prisma),
    );
    const service = new PersonsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    return { service, prisma };
  }

  async function codeOf(run: Promise<unknown>) {
    const error = await run.then(
      () => null,
      (err) => err,
    );
    expect(error).toBeInstanceOf(BusinessException);
    return (error as BusinessException).getResponse() as { code: string; statusCode: number };
  }

  it("recusa quem não tem grant de secretaria no piloto", async () => {
    const { service, prisma } = build();
    const technicalAdmin: AuthUser = {
      userId: "u-tech",
      personId: "p-tech",
      email: "tech@example.test",
      grants: [],
    };
    await expect(
      service.patch(technicalAdmin, "p1", { displayName: "Ana Demo 2" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.patch(actor("PASTOR"), "p1", { displayName: "Ana Demo 2" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.patch(actor("TESOURARIA"), "p1", { displayName: "Ana Demo 2" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.patch(actor("SECRETARIA", "church-other"), "p1", {
        displayName: "Ana Demo 2",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.patch(actor("PLATFORM_ADMIN", "church-other"), "p1", {
        displayName: "Ana Demo 2",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.person.updateMany).not.toHaveBeenCalled();
  });

  it("grava nome e e-mail da pessoa sem mexer no vínculo", async () => {
    const { service, prisma } = build();
    prisma.person.findFirst
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce(
        row({
          displayName: "Ana Atual",
          email: "ana.atual@example.test",
          updatedAt: new Date("2026-11-01T00:00:02.000Z"),
        }),
      );

    const result = await service.patch(secretaria, "p1", {
      displayName: "  Ana   Atual ",
      email: "Ana.Atual@example.test",
      expectedUpdatedAt: updatedAt.toISOString(),
    });

    expect(result).toMatchObject({
      displayName: "Ana Atual",
      email: "ana.atual@example.test",
      status: "ACTIVE",
      kind: "VISITOR",
      dedupeAlerts: [],
    });
    expect(prisma.person.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "p1",
          organizationId: "org1",
          updatedAt,
        },
        data: {
          displayName: "Ana Atual",
          email: "ana.atual@example.test",
        },
      }),
    );
    expect(prisma.churchMembership.update).not.toHaveBeenCalled();
    expect(prisma.churchMembership.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "person.patch",
          actorUserId: "u-sec",
          metadata: expect.objectContaining({
            fields: ["displayName", "email"],
            before: {
              displayName: "Ana Demo",
              email: "ana.demo@example.test",
            },
            after: {
              displayName: "Ana Atual",
              email: "ana.atual@example.test",
            },
          }),
        }),
      }),
    );
  });

  it("aceita PLATFORM_ADMIN somente com grant neste piloto", async () => {
    const { service, prisma } = build();
    prisma.person.findFirst
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce(row({ displayName: "Ana Grant" }));
    await expect(
      service.patch(actor("PLATFORM_ADMIN"), "p1", { displayName: "Ana Grant" }),
    ).resolves.toMatchObject({ displayName: "Ana Grant" });
    expect(prisma.person.updateMany).toHaveBeenCalled();
  });

  it("responde 404 fora da organização e 409 quando a versão diverge", async () => {
    const { service, prisma } = build();
    prisma.person.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.patch(secretaria, "missing", { displayName: "Ana Demo" }),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.person.findFirst.mockResolvedValueOnce(row());
    const stale = await codeOf(
      service.patch(secretaria, "p1", {
        displayName: "Ana Nova",
        expectedUpdatedAt: "2026-12-01T00:00:00.000Z",
      }),
    );
    expect(stale).toMatchObject({ code: "PERSON_VERSION_CONFLICT", statusCode: 409 });

    prisma.person.findFirst.mockResolvedValueOnce(row());
    prisma.person.updateMany.mockResolvedValueOnce({ count: 0 });
    const lost = await codeOf(
      service.patch(secretaria, "p1", {
        displayName: "Ana Nova",
        expectedUpdatedAt: updatedAt.toISOString(),
      }),
    );
    expect(lost.code).toBe("PERSON_VERSION_CONFLICT");
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("recusa e-mail inválido e e-mail já usado por outra pessoa", async () => {
    const { service, prisma } = build();
    prisma.person.findFirst.mockResolvedValue(row());
    const invalid = await codeOf(
      service.patch(secretaria, "p1", { email: "nao-e-email" }),
    );
    expect(invalid).toMatchObject({ code: "PERSON_EMAIL_INVALID", statusCode: 400 });

    prisma.person.findMany.mockResolvedValueOnce([
      {
        id: "p2",
        displayName: "Outra Pessoa",
        email: "nova@example.test",
      },
    ]);
    const duplicate = await codeOf(
      service.patch(secretaria, "p1", { email: "Nova@example.test" }),
    );
    expect(duplicate.code).toBe("PERSON_EMAIL_DUPLICATE");
    expect(prisma.person.updateMany).not.toHaveBeenCalled();
    expect(prisma.person.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org1",
          id: { not: "p1" },
        }),
      }),
    );
  });

  it("limpa e-mail e alerta homônimo sem bloquear a gravação", async () => {
    const { service, prisma } = build();
    prisma.person.findFirst
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce(row({ email: null }));
    await expect(
      service.patch(secretaria, "p1", { email: null }),
    ).resolves.toMatchObject({ email: null, dedupeAlerts: [] });

    prisma.person.findFirst.mockResolvedValueOnce(row());
    await expect(
      service.patch(secretaria, "p1", { displayName: "Ana Demo" }),
    ).resolves.toMatchObject({ displayName: "Ana Demo", dedupeAlerts: [] });
    expect(prisma.person.findMany).not.toHaveBeenCalled();

    prisma.person.findFirst
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce(row({ displayName: "Bruno Demo" }));
    prisma.person.findMany.mockResolvedValueOnce([
      { id: "p9", displayName: "Bruno Demo", email: "outra@example.test" },
    ]);
    const collision = await service.patch(secretaria, "p1", {
      displayName: "Bruno Demo",
    });
    expect(collision.dedupeAlerts).toEqual([
      { personId: "p9", matchReasons: ["normalizedDisplayName"] },
    ]);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            dedupeAlertPersonIds: ["p9"],
          }),
        }),
      }),
    );
  });

  it("recusa situação, tipo e contatos sem coluna", async () => {
    const { service, prisma } = build();
    expect((await codeOf(service.patch(secretaria, "p1", { status: "INACTIVE" }))).code).toBe(
      "PERSON_STATUS_REGULATED",
    );
    expect((await codeOf(service.patch(secretaria, "p1", { kind: "MEMBER" }))).code).toBe(
      "PERSON_KIND_REGULATED",
    );
    expect((await codeOf(service.patch(secretaria, "p1", { phone: "61999999999" }))).code).toBe(
      "PERSON_CONTACT_UNSUPPORTED",
    );
    expect(
      (await codeOf(service.patch(secretaria, "p1", { address: "Rua 1" }))).code,
    ).toBe("PERSON_CONTACT_UNSUPPORTED");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("exige família da congregação piloto", async () => {
    const missing = build();
    missing.prisma.person.findFirst.mockResolvedValueOnce(row());
    missing.prisma.household.findFirst.mockResolvedValueOnce(null);
    await expect(
      missing.service.patch(secretaria, "p1", { householdId: "hh-other" }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(missing.prisma.person.updateMany).not.toHaveBeenCalled();

    const { service, prisma } = build();
    prisma.person.findFirst
      .mockResolvedValueOnce(row({ householdId: null }))
      .mockResolvedValueOnce(row({ householdId: "hh-1" }));
    prisma.household.findFirst.mockResolvedValueOnce({ id: "hh-1" });
    await expect(
      service.patch(secretaria, "p1", { householdId: "hh-1" }),
    ).resolves.toMatchObject({ householdId: "hh-1" });
    expect(prisma.household.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "hh-1",
          organizationId: "org1",
          churchId: "church-rf1",
        },
      }),
    );
  });

  it("impede ciclo de responsável, menor com dependentes e nome vazio", async () => {
    const direct = build();
    direct.prisma.person.findFirst
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce({ id: "adult", legalGuardianPersonId: "p1" });
    expect(
      (
        await codeOf(
          direct.service.patch(secretaria, "p1", { legalGuardianPersonId: "adult" }),
        )
      ).code,
    ).toBe("PERSON_GUARDIAN_CYCLE");

    const indirect = build();
    indirect.prisma.person.findFirst
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce({ id: "adult", legalGuardianPersonId: "mid" })
      .mockResolvedValueOnce({ legalGuardianPersonId: "p1" });
    expect(
      (
        await codeOf(
          indirect.service.patch(secretaria, "p1", {
            legalGuardianPersonId: "adult",
          }),
        )
      ).code,
    ).toBe("PERSON_GUARDIAN_CYCLE");

    const dependents = build();
    dependents.prisma.person.findFirst.mockResolvedValueOnce(
      row({ isMinor: false, legalGuardianPersonId: "adult" }),
    );
    dependents.prisma.person.count.mockResolvedValueOnce(2);
    expect(
      (await codeOf(dependents.service.patch(secretaria, "p1", { isMinor: true })))
        .code,
    ).toBe("PERSON_HAS_DEPENDENTS");

    const blank = build();
    blank.prisma.person.findFirst.mockResolvedValueOnce(row());
    expect(
      (await codeOf(blank.service.patch(secretaria, "p1", { displayName: " " }))).code,
    ).toBe("PERSON_NAME_INVALID");

    const self = build();
    self.prisma.person.findFirst.mockResolvedValueOnce(row());
    await expect(
      self.service.patch(secretaria, "p1", { legalGuardianPersonId: "p1" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(self.prisma.person.updateMany).not.toHaveBeenCalled();
  });

  it("devolve updatedAt na leitura para o cliente reenviar a versão", async () => {
    const { service, prisma } = build();
    prisma.person.findFirst.mockResolvedValueOnce(row());
    await expect(service.getById(secretaria, "p1")).resolves.toMatchObject({
      id: "p1",
      updatedAt: updatedAt.toISOString(),
    });
  });
});
