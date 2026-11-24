import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { MembershipsService } from "./memberships.service";
import { BusinessException } from "../common/business.exception";
import type { AuthUser } from "../auth/types/auth-user";

const pilot = {
  organizationId: "org1",
  churchId: "church-rf1",
  organizationSlug: "igreja-de-deus",
  churchSlug: "riacho-fundo-1",
  churchName: "Riacho Fundo I",
};

const secretaria: AuthUser = {
  userId: "u-sec",
  personId: "p-sec",
  email: "sec@example.test",
  grants: [{ roleCode: "SECRETARIA", organizationId: pilot.organizationId, churchId: pilot.churchId }],
};

const membro: AuthUser = {
  userId: "u-mem",
  personId: "p-mem",
  email: "mem@example.test",
  grants: [{ roleCode: "MEMBRO", organizationId: pilot.organizationId, churchId: pilot.churchId }],
};

function responseOf(error: unknown) {
  return (error as BusinessException).getResponse() as { code?: string; existing?: { id: string; status: string } };
}

describe("secretaria preventive identity", () => {
  const previousPepper = process.env.PERSON_IDENTITY_PEPPER;
  beforeAll(() => { process.env.PERSON_IDENTITY_PEPPER = "test-pepper-preventive"; });
  afterAll(() => { process.env.PERSON_IDENTITY_PEPPER = previousPepper; });

  function harness(people: Array<{ id: string; email: string | null; status: string; displayName: string; identityFingerprint?: string | null }> = []) {
    const created: string[] = [];
    const prisma = {
      person: {
        findFirst: jest.fn(async ({ where }: { where: { email?: { equals?: string }; identityFingerprint?: string; id?: string } }) => {
          if (where.id) return people.find((person) => person.id === where.id) ?? null;
          if (where.identityFingerprint) return people.find((person) => person.identityFingerprint === where.identityFingerprint) ?? null;
          if (where.email?.equals) return people.find((person) => person.email === where.email?.equals) ?? null;
          return null;
        }),
        findMany: jest.fn(async () => people.map((person) => ({ id: person.id, status: person.status, displayName: person.displayName }))),
        create: jest.fn(async ({ data }: { data: { email: string | null; displayName: string; identityFingerprint?: string | null } }) => {
          const row = { id: "p-new", email: data.email, status: "ACTIVE", displayName: data.displayName, identityFingerprint: data.identityFingerprint ?? null };
          people.push(row);
          return row;
        }),
      },
      household: { findFirst: jest.fn(), create: jest.fn() },
      churchMembership: {
        create: jest.fn(async ({ data }: { data: { personId: string } }) => {
          created.push(data.personId);
          return {
            id: "m-new", status: "PENDING_ADMISSION", joinedAt: new Date("2026-11-24T00:00:00.000Z"), notes: null,
            churchId: pilot.churchId, organizationId: pilot.organizationId,
            person: { id: data.personId, displayName: "Ana Souza", email: "ana@example.test", status: "ACTIVE", householdId: null, kind: "VISITOR", isMinor: false },
          };
        }),
      },
      auditLog: { create: jest.fn() },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn(),
    };
    let chain = Promise.resolve();
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      const run = chain.then(() => fn(prisma));
      chain = run.then(() => undefined, () => undefined);
      return run;
    });
    return { service: new MembershipsService(prisma as never, { getPilotChurch: async () => pilot } as never), created, prisma };
  }

  it("BLOCKED membro não cadastra pessoa", async () => {
    const { service, created } = harness();
    await expect(service.register(membro, { displayName: "Ana Souza" })).rejects.toBeInstanceOf(ForbiddenException);
    expect(created).toEqual([]);
  });

  it("FAIL secretaria com e-mail exato não recebe o e-mail da ficha existente", async () => {
    const { service, created } = harness([{ id: "p-ana", email: "ana@example.test", status: "ACTIVE", displayName: "Ana Souza" }]);
    await expect(service.register(secretaria, { displayName: "Outra Ana", email: "ana@example.test" })).rejects.toBeInstanceOf(BusinessException);
    try {
      await service.register(secretaria, { displayName: "Outra Ana", email: "ana@example.test" });
    } catch (error) {
      const body = responseOf(error);
      expect(body.code).toBe("PERSON_IDENTITY_EXACT");
      expect(body.existing).toEqual({ id: "p-ana", status: "ACTIVE" });
      expect(JSON.stringify(body)).not.toContain("ana@example.test");
    }
    expect(created).toEqual([]);
  });

  it("PASS secretaria confirma homônimo e o CPF inválido fica no campo sem ecoar o número", async () => {
    const { service, created } = harness([{ id: "p-hom", email: "outro@example.test", status: "ACTIVE", displayName: "Ana Souza" }]);
    await expect(service.register(secretaria, { displayName: "Ana Souza", email: "nova@example.test" })).rejects.toMatchObject({
      response: { code: "PERSON_POSSIBLE_HOMONYM" },
    });
    await expect(service.register(secretaria, {
      displayName: "Ana Souza", email: "nova@example.test", acknowledgeHomonym: true,
    })).resolves.toMatchObject({ id: "m-new" });
    expect(created).toEqual(["p-new"]);
    await expect(service.register(secretaria, { displayName: "Bruno", identityDocument: "11111111111" }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it("FAIL duas sessões com o mesmo e-mail criam uma única ficha", async () => {
    const { service } = harness();
    const results = await Promise.allSettled([
      service.register(secretaria, { displayName: "Ana Souza", email: "ana@example.test" }),
      service.register(secretaria, { displayName: "Ana Souza", email: "ana@example.test" }),
    ]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((item) => item.status === "rejected") as PromiseRejectedResult;
    expect(responseOf(rejected.reason).code).toBe("PERSON_IDENTITY_EXACT");
    expect(JSON.stringify(responseOf(rejected.reason))).not.toContain("ana@example.test");
  });
});
