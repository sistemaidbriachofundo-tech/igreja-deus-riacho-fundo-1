import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from "@nestjs/common";
import type { AuthUser } from "../../auth/types/auth-user";
import { MinistryMembershipGateService } from "./ministry-membership-gate.service";
import {
  MINISTRY_AGENDA_MODEL_BLOCKED,
  MINISTRY_FINANCE_CONTRACT_BLOCKED,
  MINISTRY_INTEREST_CONVERSION_BLOCKED,
  MINISTRY_MEMBERSHIP_SCHEMA_BLOCKED,
  MINISTRY_REQUEST_MODEL_BLOCKED,
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
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    };
    const prisma = {
      ministry: { findFirst },
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
    const { service, volunteerInterest } = setup();
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

  it("no próprio ministério devolve 501 sem integrantes nem saldo", async () => {
    const { service, volunteerInterest, prisma } = setup();

    const membership = await capture(() =>
      service.readMemberships(liderHomens, homens.id),
    );
    const agenda = await capture(() =>
      service.readAgenda(liderHomens, homens.id),
    );
    const requests = await capture(() =>
      service.readRequests(liderHomens, homens.id),
    );
    const balance = await capture(() =>
      service.readCostCenterBalance(liderHomens, homens.id),
    );
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
    expect((agenda as HttpException).getResponse()).toMatchObject({
      blocked: true,
      code: MINISTRY_AGENDA_MODEL_BLOCKED,
      items: null,
      scheduleText: homens.scheduleText,
    });
    expect((requests as HttpException).getResponse()).toMatchObject({
      blocked: true,
      code: MINISTRY_REQUEST_MODEL_BLOCKED,
      requests: null,
    });
    expect((balance as HttpException).getResponse()).toMatchObject({
      blocked: true,
      code: MINISTRY_FINANCE_CONTRACT_BLOCKED,
      balance: null,
      dependency: "issue-96",
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
