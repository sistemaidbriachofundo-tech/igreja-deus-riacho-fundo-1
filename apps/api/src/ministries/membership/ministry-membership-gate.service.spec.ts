import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from "@nestjs/common";
import type { AuthUser } from "../../auth/types/auth-user";
import { MinistryMembershipGateService } from "./ministry-membership-gate.service";
import {
  MINISTRY_INTEREST_CONVERSION_BLOCKED,
  MINISTRY_MEMBERSHIP_SCHEMA_BLOCKED,
  MINISTRY_SCOPE_FORBIDDEN,
} from "./ministry-membership.contract";

describe("MinistryMembershipGateService", () => {
  const pilot = {
    organizationId: "org1",
    churchId: "church-rf1",
    organizationSlug: "igreja-de-deus",
    churchSlug: "riacho-fundo-1",
    churchName: "Riacho Fundo I (sintético)",
  };

  const homens = {
    id: "min-homens",
    organizationId: pilot.organizationId,
    churchId: pilot.churchId,
    name: "Homens",
    slug: "homens",
    leaderPersonId: "per-lider-homens",
    scheduleText: "Sábado, 16h — encontro sintético",
  };

  const mulheres = {
    id: "min-mulheres",
    organizationId: pilot.organizationId,
    churchId: pilot.churchId,
    name: "Mulheres",
    slug: "mulheres",
    leaderPersonId: "per-lider-mulheres",
    scheduleText: "Quinta, 19h",
  };

  const liderHomens: AuthUser = {
    userId: "usr-lider-homens",
    personId: "per-lider-homens",
    email: "lider.homens.sintetico@example.test",
    grants: [
      {
        roleCode: "LIDER_MINISTERIO",
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        ministryId: "min-homens",
      },
    ],
  };

  const secretaria: AuthUser = {
    userId: "usr-secretaria",
    personId: "per-secretaria",
    email: "secretaria.sintetica@example.test",
    grants: [
      {
        roleCode: "SECRETARIA",
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    ],
  };

  const tesouraria: AuthUser = {
    userId: "usr-tesouraria",
    personId: "per-tesouraria",
    email: "tesouraria.sintetica@example.test",
    grants: [
      {
        roleCode: "TESOURARIA",
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    ],
  };

  function setup() {
    const findFirst = jest.fn(async ({ where }: { where: { id: string } }) => {
      if (where.id === homens.id) return homens;
      if (where.id === mulheres.id) return mulheres;
      return null;
    });
    const volunteerInterest = {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    };
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      ministry: { findFirst },
      portalEvent: { findMany: jest.fn().mockResolvedValue([]) },
      volunteerInterest,
      ledgerEntry: { findMany: jest.fn() },
      costCenter: { findMany: jest.fn() },
    };
    const service = new MinistryMembershipGateService(
      prisma as never,
      { getPilotChurch: async () => pilot } as never,
    );
    return { service, prisma, volunteerInterest };
  }

  async function capture(run: () => Promise<unknown>) {
    try {
      await run();
    } catch (error) {
      return error;
    }
    throw new Error("a chamada deveria falhar");
  }

  it("devolve o caixa autorizado pelo centro do próprio ministério", async () => {
    const { service, prisma } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([{ balanceCents: 4500, incomeCents: 6000, expenseCents: 1500 }]);
    await expect(service.readCostCenterBalance(liderHomens, homens.id))
      .resolves.toEqual({ ministryId: homens.id, currency: "BRL", configured: true, balanceCents: 4500, incomeCents: 6000, expenseCents: 1500 });
    expect(prisma.$queryRaw).toHaveBeenCalledWith(expect.anything(), pilot.organizationId, pilot.churchId, "MIN:" + homens.id, homens.slug);
    await expect(service.readCostCenterBalance(secretaria, homens.id)).rejects.toBeInstanceOf(HttpException);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("responde 403 quando o líder dos Homens consulta Mulheres", async () => {
    const { service, prisma, volunteerInterest } = setup();

    const error = await capture(() =>
      service.readMemberships(liderHomens, mulheres.id),
    );

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getStatus()).toBe(403);
    expect((error as ForbiddenException).getResponse()).toMatchObject({
      code: MINISTRY_SCOPE_FORBIDDEN,
    });
    expect(volunteerInterest.findMany).not.toHaveBeenCalled();
    expect(volunteerInterest.update).not.toHaveBeenCalled();
    expect(prisma.ledgerEntry.findMany).not.toHaveBeenCalled();
    expect(prisma.costCenter.findMany).not.toHaveBeenCalled();
  });

  it("nega agenda, solicitações, saldo e conversão cruzada com 403", async () => {
    const { service, volunteerInterest, prisma } = setup();
    const calls = [
      () => service.readAgenda(liderHomens, mulheres.id),
      () => service.readRequests(liderHomens, mulheres.id),
      () => service.readCostCenterBalance(liderHomens, mulheres.id),
      () => service.convertInterest(liderHomens, mulheres.id, "int-sint-01"),
    ];

    for (const call of calls) {
      const error = await capture(call);
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getStatus()).toBe(403);
    }
    expect(prisma.portalEvent.findMany).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(volunteerInterest.findMany).not.toHaveBeenCalled();
    expect(volunteerInterest.findFirst).not.toHaveBeenCalled();
    expect(volunteerInterest.update).not.toHaveBeenCalled();
  });

  it("nega tesouraria no catálogo do ministério", async () => {
    const { service } = setup();
    const error = await capture(() =>
      service.readMemberships(tesouraria, homens.id),
    );
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getStatus()).toBe(403);
  });

  it("consulta agenda e solicitações no próprio ministério, mesmo sem tabela de vínculos", async () => {
    const { service, volunteerInterest, prisma } = setup();
    const scope = { organizationId: pilot.organizationId, churchId: pilot.churchId, ministryId: homens.id };
    const event = { id: "evento-1", ministryId: homens.id, name: "Encontro", startsAt: new Date(), status: "DRAFT", locationText: null };
    const interest = { id: "int-sint-01", displayName: "Voluntário fictício", stage: "INTERESSE", status: "OPEN" };
    prisma.portalEvent.findMany.mockResolvedValueOnce([event]);
    volunteerInterest.findMany.mockResolvedValueOnce([interest]);

    await expect(service.readAgenda(liderHomens, homens.id)).resolves.toEqual({
      blocked: false, scheduleText: homens.scheduleText, items: [event],
    });
    await expect(service.readRequests(liderHomens, homens.id)).resolves.toEqual({ blocked: false, requests: [interest] });
    expect(prisma.portalEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: scope,
      select: { id: true, name: true, ministryId: true, startsAt: true, status: true, locationText: true },
    }));
    expect(volunteerInterest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: scope, select: { id: true, displayName: true, stage: true, status: true },
    }));
    await expect(service.readCostCenterBalance(liderHomens, homens.id)).resolves.toEqual({
      ministryId: homens.id, currency: "BRL", configured: false, balanceCents: null, incomeCents: null, expenseCents: null,
    });

    const membership = await capture(() => service.readMemberships(liderHomens, homens.id));
    const conversion = await capture(() =>
      service.convertInterest(liderHomens, homens.id, "int-sint-01"),
    );

    expect(membership).toBeInstanceOf(HttpException);
    expect((membership as HttpException).getStatus()).toBe(501);
    expect((membership as HttpException).getResponse()).toMatchObject({
      blocked: true,
      code: MINISTRY_MEMBERSHIP_SCHEMA_BLOCKED,
      members: null,
    });
    expect((conversion as HttpException).getResponse()).toMatchObject({
      blocked: true,
      code: MINISTRY_INTEREST_CONVERSION_BLOCKED,
      createdMembership: null,
      volunteerInterestId: "int-sint-01",
    });
    expect(volunteerInterest.update).not.toHaveBeenCalled();
    expect(volunteerInterest.create).not.toHaveBeenCalled();
    expect(prisma.ledgerEntry.findMany).not.toHaveBeenCalled();
  });

  it("secretaria passa do escopo e continua bloqueada pelo schema", async () => {
    const { service } = setup();
    const error = await capture(() =>
      service.readMemberships(secretaria, mulheres.id),
    );
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(501);
    expect((error as HttpException).getResponse()).toMatchObject({
      code: MINISTRY_MEMBERSHIP_SCHEMA_BLOCKED,
      members: null,
    });
  });

  it("não converte interesse vazio nem ministério ausente", async () => {
    const { service } = setup();
    const missing = await capture(() =>
      service.readMemberships(liderHomens, "min-inexistente"),
    );
    expect(missing).toBeInstanceOf(NotFoundException);

    const empty = await capture(() =>
      service.convertInterest(liderHomens, homens.id, "   "),
    );
    expect(empty).toBeInstanceOf(BadRequestException);
  });
});
