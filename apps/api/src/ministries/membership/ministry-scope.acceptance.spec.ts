import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { AuthUser } from "../../auth/types/auth-user";
import { MinistryMembershipGateService } from "./ministry-membership-gate.service";
import { MemoryMinistryMembershipRepository } from "./ministry-membership.repository";
import {
  MINISTRY_AGENDA_MODEL_BLOCKED,
  MINISTRY_FINANCE_CONTRACT_BLOCKED,
  MINISTRY_MEMBERSHIP_SCHEMA_BLOCKED,
  MINISTRY_REQUEST_MODEL_BLOCKED,
  MINISTRY_SCOPE_FORBIDDEN,
} from "./ministry-membership.contract";
import type { StoredMembership } from "./ministry-membership.model";
import { MinistryTeamService } from "./ministry-team.service";
import type { MinistryMembershipRepository } from "./ministry-membership.repository";

const pilot = {
  organizationId: "org1",
  churchId: "church-rf1",
  organizationSlug: "igreja-de-deus",
  churchSlug: "riacho-fundo-1",
  churchName: "Riacho Fundo I (sintético)",
};

const jovens = {
  id: "min-jovens",
  organizationId: pilot.organizationId,
  churchId: pilot.churchId,
  name: "Jovens",
  slug: "jovens",
  leaderPersonId: "per-lider-jovens",
  scheduleText: "Domingo, 9h — encontro sintético",
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

function user(partial: Omit<AuthUser, "email"> & { email?: string }): AuthUser {
  return {
    email: "pessoa.sintetica@example.test",
    ...partial,
  };
}

const liderJovens = user({
  userId: "usr-lider-jovens",
  personId: "per-lider-jovens",
  grants: [
    {
      roleCode: "LIDER_MINISTERIO",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      ministryId: jovens.id,
    },
  ],
});

const liderHomens = user({
  userId: "usr-lider-homens",
  personId: "per-lider-homens",
  grants: [
    {
      roleCode: "LIDER_MINISTERIO",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      ministryId: homens.id,
    },
  ],
});

const membro = user({
  userId: "usr-membro",
  personId: "per-membro",
  grants: [
    {
      roleCode: "MEMBRO",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
    },
  ],
});

const secretaria = user({
  userId: "usr-secretaria",
  personId: "per-secretaria",
  grants: [
    {
      roleCode: "SECRETARIA",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
    },
  ],
});

function setup(repository = new MemoryMinistryMembershipRepository()) {
  const ministries = [jovens, homens, mulheres];
  const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
    ministry: {
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) => {
        return ministries.find((item) => item.id === where.id) ?? null;
      }),
    },
    volunteerInterest: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    ledgerEntry: { findMany: jest.fn() },
    costCenter: { findMany: jest.fn() },
    grant: { create: jest.fn() },
  };
  const service = new MinistryMembershipGateService(
    prisma as never,
    { getPilotChurch: async () => pilot } as never,
    repository,
  );
  return { service, prisma, repository };
}

async function capture(run: () => Promise<unknown>) {
  try {
    return { ok: true as const, value: await run() };
  } catch (error) {
    return { ok: false as const, error };
  }
}

function seedPeople(repository: MemoryMinistryMembershipRepository) {
  repository.people.push(
    {
      id: "per-jovem",
      displayName: "Jovem Sintético",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      ministryId: jovens.id,
    },
    {
      id: "per-homem",
      displayName: "Homem Sintético",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      ministryId: homens.id,
    },
    {
      id: "per-outra-igreja",
      displayName: "Pessoa de outra congregação",
      organizationId: "org-outra",
      churchId: "church-outra",
      ministryId: jovens.id,
    },
  );
  repository.interests.push({
    id: "int-jovens",
    organizationId: pilot.organizationId,
    churchId: pilot.churchId,
    ministryId: jovens.id,
    personId: "per-jovem",
    stage: "EQUIPE",
    status: "OPEN",
  });
  repository.interests.push({
    id: "int-sem-pessoa",
    organizationId: pilot.organizationId,
    churchId: pilot.churchId,
    ministryId: jovens.id,
    personId: null,
    stage: "EQUIPE",
    status: "OPEN",
  });
}

describe("matriz frente B — ministérios", () => {
  it("PASS: líder de Jovens lê somente Jovens quando a persistência está disponível", async () => {
    const repository = new MemoryMinistryMembershipRepository();
    seedPeople(repository);
    const { service } = setup(repository);

    const admitted = await service.admit(liderJovens, jovens.id, "per-jovem", "INTEGRANTE");
    expect(admitted).toMatchObject({
      blocked: false,
      code: "MINISTRY_MEMBERSHIP_CREATED",
      createdMembership: {
        personId: "per-jovem",
        displayName: "Jovem Sintético",
        role: "INTEGRANTE",
        status: "ATIVO",
      },
    });

    repository.members.push({
      id: "mmb-mulheres",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      ministryId: mulheres.id,
      personId: "per-mulher",
      displayName: "Mulher Sintética",
      role: "INTEGRANTE",
      status: "ATIVO",
      source: "DIRETO",
      volunteerInterestId: null,
      startedAt: "2026-11-01T00:00:00.000Z",
      endedAt: null,
    });

    const listed = await service.readMemberships(liderJovens, jovens.id);
    expect(listed.blocked).toBe(false);
    expect(listed.members).toHaveLength(1);
    expect(listed.members?.[0]).toMatchObject({ displayName: "Jovem Sintético" });
    expect(JSON.stringify(listed)).not.toContain("Mulher Sintética");
    expect(JSON.stringify(listed)).not.toContain("@");
    expect(repository.listCalls.every((call) => call.ministryId === jovens.id)).toBe(true);
  });

  it("PASS: líder dos Homens recebe 403 em Mulheres e a lista não é consultada", async () => {
    const repository = new MemoryMinistryMembershipRepository();
    seedPeople(repository);
    const { service, prisma } = setup(repository);

    const error = await capture(() => service.readMemberships(liderHomens, mulheres.id));
    expect(error.ok).toBe(false);
    if (error.ok) return;
    expect(error.error).toBeInstanceOf(ForbiddenException);
    expect((error.error as ForbiddenException).getResponse()).toMatchObject({
      code: MINISTRY_SCOPE_FORBIDDEN,
    });
    expect(repository.listCalls).toHaveLength(0);
    expect(repository.audits).toHaveLength(0);
    expect(prisma.volunteerInterest.findFirst).not.toHaveBeenCalled();
    expect(prisma.ledgerEntry.findMany).not.toHaveBeenCalled();
  });

  it("PASS: membro não vê a lista de nenhum ministério", async () => {
    const repository = new MemoryMinistryMembershipRepository();
    seedPeople(repository);
    const { service } = setup(repository);

    for (const ministryId of [jovens.id, homens.id, mulheres.id]) {
      const error = await capture(() => service.readMemberships(membro, ministryId));
      expect(error.ok).toBe(false);
      if (error.ok) return;
      expect(error.error).toBeInstanceOf(ForbiddenException);
      expect((error.error as ForbiddenException).getStatus()).toBe(403);
    }
    expect(repository.listCalls).toHaveLength(0);
  });

  it("PASS: inclusão e encerramento gravam auditoria sem contato", async () => {
    const repository = new MemoryMinistryMembershipRepository();
    seedPeople(repository);
    const { service, prisma } = setup(repository);

    const created = await service.admit(secretaria, homens.id, "per-homem", "APOIO");
    expect(created.auditId).toEqual(expect.any(String));
    const membershipId = created.createdMembership?.id ?? "";
    const ended = await service.endMembership(secretaria, homens.id, membershipId);

    expect(ended).toMatchObject({
      blocked: false,
      code: "MINISTRY_MEMBERSHIP_ENDED",
      member: { id: membershipId, status: "ENCERRADO", role: "APOIO" },
    });
    expect(repository.audits.map((entry) => entry.action)).toEqual([
      "ministry_membership.admit",
      "ministry_membership.end",
    ]);
    const serialized = JSON.stringify(repository.audits);
    expect(serialized).not.toContain("@");
    expect(serialized).not.toContain("phone");
    expect(serialized).not.toContain("notes");
    expect(prisma.grant.create).not.toHaveBeenCalled();
    expect(repository.stageWrites).toBe(0);
    expect(repository.peopleCreated).toBe(0);
  });

  it("PASS: conversão grava integrante e não avança a etapa do interesse", async () => {
    const repository = new MemoryMinistryMembershipRepository();
    seedPeople(repository);
    const { service } = setup(repository);
    const before = repository.interests.find((item) => item.id === "int-jovens");

    const created = await service.convertInterest(liderJovens, jovens.id, "int-jovens");
    expect(created).toMatchObject({
      blocked: false,
      createdMembership: {
        personId: "per-jovem",
        role: "INTEGRANTE",
        status: "ATIVO",
      },
    });
    expect(before).toMatchObject({ stage: "EQUIPE", status: "OPEN" });
    expect(repository.stageWrites).toBe(0);
    expect(repository.peopleCreated).toBe(0);
    expect(repository.audits[0]).toMatchObject({
      action: "ministry_membership.convert_interest",
      metadata: { source: "CONVERSAO_INTERESSE", volunteerInterestId: "int-jovens" },
    });
  });

  it("PASS: etapa EQUIPE sem pessoa não cria integrante", async () => {
    const repository = new MemoryMinistryMembershipRepository();
    seedPeople(repository);
    const { service } = setup(repository);

    const error = await capture(() =>
      service.convertInterest(liderJovens, jovens.id, "int-sem-pessoa"),
    );
    expect(error.ok).toBe(false);
    if (error.ok) return;
    expect(error.error).toBeInstanceOf(UnprocessableEntityException);
    expect(repository.members).toHaveLength(0);
    expect(repository.audits).toHaveLength(0);
    expect(repository.peopleCreated).toBe(0);
  });

  it("PASS: pessoa de outra congregação não entra na equipe", async () => {
    const repository = new MemoryMinistryMembershipRepository();
    seedPeople(repository);
    const { service } = setup(repository);
    const error = await capture(() =>
      service.admit(liderJovens, jovens.id, "per-outra-igreja", "INTEGRANTE"),
    );
    expect(error.ok).toBe(false);
    if (error.ok) return;
    expect(error.error).toBeInstanceOf(NotFoundException);
    expect(repository.members).toHaveLength(0);
  });

  it("PASS: a mesma pessoa pode ter vínculo em dois ministérios, não dois abertos no mesmo", async () => {
    const repository = new MemoryMinistryMembershipRepository();
    seedPeople(repository);
    const { service } = setup(repository);

    await service.admit(secretaria, jovens.id, "per-jovem", "INTEGRANTE");
    await service.admit(secretaria, homens.id, "per-jovem", "APOIO");
    const duplicate = await capture(() =>
      service.admit(secretaria, jovens.id, "per-jovem", "COORDENADOR"),
    );

    expect(repository.members).toHaveLength(2);
    expect(duplicate.ok).toBe(false);
    if (duplicate.ok) return;
    expect(duplicate.error).toBeInstanceOf(ConflictException);
  });

  it("PASS: encerrar pelo ministério errado não altera o vínculo", async () => {
    const repository = new MemoryMinistryMembershipRepository();
    seedPeople(repository);
    const { service } = setup(repository);
    const created = await service.admit(secretaria, jovens.id, "per-jovem", "INTEGRANTE");
    const membershipId = created.createdMembership?.id ?? "";

    const error = await capture(() =>
      service.endMembership(secretaria, homens.id, membershipId),
    );
    expect(error.ok).toBe(false);
    if (error.ok) return;
    expect(error.error).toBeInstanceOf(NotFoundException);
    expect(repository.members[0]?.status).toBe("ATIVO");
  });

  it("BLOCKED: sem tabela, Jovens autorizado continua 501 e nada é gravado", async () => {
    const repository = new MemoryMinistryMembershipRepository();
    repository.probeState = "schema_blocked";
    seedPeople(repository);
    const { service, prisma } = setup(repository);

    const listed = await capture(() => service.readMemberships(liderJovens, jovens.id));
    const admitted = await capture(() =>
      service.admit(liderJovens, jovens.id, "per-jovem", "INTEGRANTE"),
    );
    const converted = await capture(() =>
      service.convertInterest(liderJovens, jovens.id, "int-jovens"),
    );
    const agenda = await capture(() => service.readAgenda(liderJovens, jovens.id));
    const requests = await capture(() => service.readRequests(liderJovens, jovens.id));
    const balance = await capture(() =>
      service.readCostCenterBalance(liderJovens, jovens.id),
    );

    expect(listed.ok).toBe(false);
    expect(admitted.ok).toBe(false);
    expect(converted.ok).toBe(false);
    if (listed.ok || admitted.ok || converted.ok || agenda.ok || requests.ok || balance.ok) {
      return;
    }
    expect((listed.error as HttpException).getStatus()).toBe(501);
    expect((listed.error as HttpException).getResponse()).toMatchObject({
      blocked: true,
      code: MINISTRY_MEMBERSHIP_SCHEMA_BLOCKED,
      members: null,
    });
    expect((admitted.error as HttpException).getResponse()).toMatchObject({
      blocked: true,
      createdMembership: null,
    });
    expect((converted.error as HttpException).getResponse()).toMatchObject({
      blocked: true,
      createdMembership: null,
    });
    expect((agenda.error as HttpException).getResponse()).toMatchObject({
      code: MINISTRY_AGENDA_MODEL_BLOCKED,
      items: null,
      scheduleText: jovens.scheduleText,
    });
    expect((requests.error as HttpException).getResponse()).toMatchObject({
      code: MINISTRY_REQUEST_MODEL_BLOCKED,
      requests: null,
    });
    expect((balance.error as HttpException).getResponse()).toMatchObject({
      code: MINISTRY_FINANCE_CONTRACT_BLOCKED,
      balance: null,
    });
    expect(repository.members).toHaveLength(0);
    expect(repository.audits).toHaveLength(0);
    expect(repository.interestReads).toBe(0);
    expect(prisma.volunteerInterest.update).not.toHaveBeenCalled();
    expect(prisma.ledgerEntry.findMany).not.toHaveBeenCalled();
  });

  it("descarta linha de outro ministério e campo de contato devolvidos por um repositório hostil", async () => {
    const leaked = {
      id: "mmb-vazou",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      ministryId: mulheres.id,
      personId: "per-mulher",
      displayName: "Mulher Sintética",
      role: "INTEGRANTE",
      status: "ATIVO",
      source: "DIRETO",
      volunteerInterestId: null,
      startedAt: "2026-11-01T00:00:00.000Z",
      endedAt: null,
      email: "vazou@example.test",
    };
    const own: StoredMembership = {
      id: "mmb-jovem",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      ministryId: jovens.id,
      personId: "per-jovem",
      displayName: "Jovem Sintético",
      role: "LIDER",
      status: "ATIVO",
      source: "DIRETO",
      volunteerInterestId: null,
      startedAt: "2026-11-01T00:00:00.000Z",
      endedAt: null,
    };
    const hostile: MinistryMembershipRepository = {
      probe: async () => "ready",
      list: async () => [own, leaked as StoredMembership],
      findById: async () => null,
      findByPerson: async () => null,
      save: async () => null,
      findPerson: async () => null,
      findInterest: async () => null,
      recordAudit: async () => ({ id: "aud-1" }),
    };
    const team = new MinistryTeamService(hostile);
    const result = await team.read({
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      ministryId: jovens.id,
    });
    expect(result).toEqual({
      outcome: "ok",
      members: [
        {
          id: "mmb-jovem",
          personId: "per-jovem",
          displayName: "Jovem Sintético",
          role: "LIDER",
          status: "ATIVO",
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("example.test");
    expect(JSON.stringify(result)).not.toContain("Mulher");
  });

  it("o adaptador de produção não atualiza voluntariado, ledger nem grant", () => {
    const source = readFileSync(
      join(__dirname, "prisma-ministry-membership.repository.ts"),
      "utf8",
    );
    expect(source).toContain("ministry_memberships");
    expect(source).not.toContain("volunteerInterest.update");
    expect(source).not.toContain("ledgerEntry");
    expect(source).not.toContain("grant.create");
    expect(source).not.toContain("schema.prisma");
  });
});
