import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { VolunteersService } from "./volunteers.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("VolunteersService", () => {
  const pilot = {
    organizationId: "org1",
    churchId: "church-rf1",
    organizationSlug: "igreja-de-deus",
    churchSlug: "riacho-fundo-1",
    churchName: "Riacho Fundo I (demo)",
  };

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

  const liderAtmosfera: AuthUser = {
    userId: "u-lider",
    personId: "p-lider",
    email: "lider.atmosfera@example.test",
    grants: [
      {
        roleCode: "LIDER_MINISTERIO",
        organizationId: "org1",
        churchId: "church-rf1",
        ministryId: "m-atmosfera",
      },
    ],
  };

  const now = new Date("2026-11-05T12:00:00Z");
  const interest = {
    id: "vi1",
    organizationId: pilot.organizationId,
    churchId: pilot.churchId,
    ministryId: "m-atmosfera",
    displayName: "Vol Demo",
    email: "vol@example.test",
    phone: null as string | null,
    message: "quero ajudar",
    personId: null as string | null,
    stage: "INTERESSE",
    status: "OPEN",
    notesInternal: null as string | null,
    rosterId: null as string | null,
    createdAt: now,
    updatedAt: now,
  };

  function withTx(tx: object) {
    return {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
  }

  it("public submit returns ack without email and defaults atmosfera", async () => {
    const tx = {
      volunteerInterest: { create: jest.fn().mockResolvedValue(interest) },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      ministry: {
        findFirst: jest.fn().mockResolvedValue({
          id: "m-atmosfera",
          slug: "atmosfera",
        }),
      },
      ...withTx(tx),
    };
    const service = new VolunteersService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.submitPublicInterest({
      displayName: " Vol Demo ",
      email: "Vol@Example.TEST",
      message: "oi",
    });
    expect(result).toEqual({
      received: true,
      id: "vi1",
      stage: "INTERESSE",
      ministrySlug: "atmosfera",
    });
    expect(result).not.toHaveProperty("email");
    expect(tx.volunteerInterest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "vol@example.test" }),
      }),
    );
  });

  it("rejects invalid email on public submit", async () => {
    const service = new VolunteersService(
      {
        ministry: { findFirst: jest.fn() },
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.submitPublicInterest({
        displayName: "X",
        email: "sem-arroba",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.submitPublicInterest({
        displayName: "Voluntario",
        email: "sem-arroba",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.submitPublicInterest({
        displayName: "Voluntario",
        email: `${"a".repeat(190)}@b.co`,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("advances journey one stage at a time and requires person/roster later", async () => {
    const tx = {
      volunteerInterest: {
        update: jest.fn().mockResolvedValue({
          ...interest,
          stage: "AVALIACAO",
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      volunteerInterest: { findFirst: jest.fn().mockResolvedValue(interest) },
      person: { findFirst: jest.fn() },
      roster: { findFirst: jest.fn() },
      ...withTx(tx),
    };
    const service = new VolunteersService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(
      service.advance(secretaria, "vi1", { stage: "AVALIACAO" }),
    ).resolves.toMatchObject({ stage: "AVALIACAO" });

    prisma.volunteerInterest.findFirst.mockResolvedValueOnce({
      ...interest,
      stage: "INTERESSE",
    });
    await expect(
      service.advance(secretaria, "vi1", { stage: "EQUIPE" }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.volunteerInterest.findFirst.mockResolvedValueOnce({
      ...interest,
      stage: "APROVACAO",
    });
    await expect(
      service.advance(secretaria, "vi1", { stage: "EQUIPE" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("LIDER only sees/manages own ministry interests", async () => {
    const other = { ...interest, ministryId: "m-jovens" };
    const prisma = {
      volunteerInterest: {
        findMany: jest.fn().mockResolvedValue([interest, other]),
        findFirst: jest.fn().mockResolvedValue(other),
      },
    };
    const service = new VolunteersService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const list = await service.listAdmin(liderAtmosfera);
    expect(list.interests).toHaveLength(1);
    expect(list.interests[0].ministryId).toBe("m-atmosfera");

    await expect(service.getAdmin(liderAtmosfera, "vi1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("404 missing interest", async () => {
    const service = new VolunteersService(
      {
        volunteerInterest: { findFirst: jest.fn().mockResolvedValue(null) },
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.getAdmin(secretaria, "x")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("covers public validation and EQUIPE/ESCALA requirements", async () => {
    const prismaMissing = {
      ministry: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const serviceMissing = new VolunteersService(
      prismaMissing as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      serviceMissing.submitPublicInterest({
        displayName: "A",
        email: "a@b.co",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      serviceMissing.submitPublicInterest({
        displayName: "Ab",
        email: "a@b.co",
        cpf: "000",
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    const prismaPhone = {
      ministry: {
        findFirst: jest.fn().mockResolvedValue({ id: "m-atmosfera" }),
      },
    };
    const servicePhone = new VolunteersService(
      prismaPhone as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      servicePhone.submitPublicInterest({
        displayName: "Ab",
        email: "a@b.co",
        phone: "x".repeat(50),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const tx = {
      volunteerInterest: {
        update: jest.fn().mockResolvedValue({
          ...interest,
          stage: "EQUIPE",
          personId: "p1",
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      volunteerInterest: {
        findFirst: jest.fn().mockResolvedValue({
          ...interest,
          stage: "APROVACAO",
        }),
        findMany: jest.fn().mockResolvedValue([interest]),
      },
      person: { findFirst: jest.fn().mockResolvedValue({ id: "p1" }) },
      roster: { findFirst: jest.fn().mockResolvedValue({ id: "r1" }) },
      ...withTx(tx),
    };
    const service = new VolunteersService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.advance(secretaria, "vi1", {
        stage: "EQUIPE",
        personId: "p1",
        status: "OPEN",
        notesInternal: "ok",
      }),
    ).resolves.toMatchObject({ stage: "EQUIPE" });

    prisma.volunteerInterest.findFirst.mockResolvedValueOnce({
      ...interest,
      stage: "DISPONIBILIDADE",
      personId: "p1",
    });
    tx.volunteerInterest.update.mockResolvedValueOnce({
      ...interest,
      stage: "ESCALA",
      personId: "p1",
      rosterId: "r1",
    });
    await expect(
      service.advance(secretaria, "vi1", {
        stage: "ESCALA",
        rosterId: "r1",
      }),
    ).resolves.toMatchObject({ stage: "ESCALA" });

    prisma.volunteerInterest.findFirst.mockResolvedValueOnce({
      ...interest,
      stage: "DISPONIBILIDADE",
      personId: "p1",
    });
    await expect(
      service.advance(secretaria, "vi1", { stage: "ESCALA" }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.person.findFirst.mockResolvedValueOnce(null);
    prisma.volunteerInterest.findFirst.mockResolvedValueOnce({
      ...interest,
      stage: "APROVACAO",
    });
    await expect(
      service.advance(secretaria, "vi1", {
        stage: "EQUIPE",
        personId: "missing",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const membro: AuthUser = {
      userId: "u-m",
      personId: "p-m",
      email: "m@test",
      grants: [
        {
          roleCode: "MEMBRO",
          organizationId: "org1",
          churchId: "church-rf1",
        },
      ],
    };
    await expect(service.listAdmin(membro)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    await expect(
      service.advance(secretaria, "vi1", { status: "NOPE" as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.advance(secretaria, "vi1", { stage: "NOPE" as never }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.volunteerInterest.findFirst.mockResolvedValueOnce({
      ...interest,
      stage: "ESCALA",
      personId: "p1",
      rosterId: "r1",
    });
    await expect(
      service.advance(secretaria, "vi1", { stage: "INTERESSE" }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.roster.findFirst.mockResolvedValueOnce(null);
    prisma.volunteerInterest.findFirst.mockResolvedValueOnce({
      ...interest,
      stage: "DISPONIBILIDADE",
      personId: "p1",
    });
    await expect(
      service.advance(secretaria, "vi1", {
        stage: "ESCALA",
        rosterId: "missing",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.volunteerInterest.findFirst.mockResolvedValueOnce({
      ...interest,
      stage: "AVALIACAO",
    });
    tx.volunteerInterest.update.mockResolvedValueOnce({
      ...interest,
      stage: "APROVACAO",
      status: "OPEN",
    });
    await expect(
      service.advance(secretaria, "vi1", { stage: "APROVACAO" }),
    ).resolves.toMatchObject({ stage: "APROVACAO" });

    const listScoped = await service.listAdmin(liderAtmosfera, "m-atmosfera");
    expect(listScoped.churchId).toBe(pilot.churchId);
    await expect(
      service.listAdmin(liderAtmosfera, "m-jovens"),
    ).rejects.toBeInstanceOf(ForbiddenException);

    prisma.volunteerInterest.findFirst.mockResolvedValueOnce(interest);
    await expect(service.getAdmin(secretaria, "vi1")).resolves.toMatchObject({
      id: "vi1",
    });
  });
});
