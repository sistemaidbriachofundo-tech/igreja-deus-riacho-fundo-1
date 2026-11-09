import { ForbiddenException } from "@nestjs/common";
import { IndicatorsService } from "./indicators.service";
import type { AuthUser } from "../auth/types/auth-user";

/**
 * Issue #109 — redação de pastoralOpen em GET /indicators/summary.
 * Contrato usado: canAccessPastoralCare (já em main). Não importa a matriz
 * do PR #101. Dados só sintéticos. Cada caso marca o efeito esperado.
 */
describe("IndicatorsService pastoralOpen", () => {
  const pilot = {
    organizationId: "org1",
    churchId: "church-rf1",
    organizationSlug: "igreja-de-deus",
    churchSlug: "riacho-fundo-1",
    churchName: "Riacho Fundo I (demo)",
  };

  function actor(
    roleCode: string,
    churchId: string | null = "church-rf1",
    extraGrants: AuthUser["grants"] = [],
  ): AuthUser {
    const grants =
      roleCode === ""
        ? extraGrants
        : [
            {
              roleCode,
              organizationId: "org1",
              churchId,
            },
            ...extraGrants,
          ];
    return {
      userId: `u-${roleCode || "visitante"}`,
      personId: `p-${roleCode || "visitante"}`,
      email: `${roleCode || "visitante"}.sintetico@example.test`,
      organizationId: "org1",
      churchId: churchId ?? "church-rf1",
      grants,
    };
  }

  function prismaStub() {
    return {
      churchMembership: {
        count: jest.fn().mockResolvedValue(2),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      person: { count: jest.fn().mockResolvedValue(4) },
      admissionProtocol: { count: jest.fn().mockResolvedValue(1) },
      membershipTransfer: { count: jest.fn().mockResolvedValue(0) },
      pastoralCase: { count: jest.fn().mockResolvedValue(7) },
      ministry: {
        count: jest.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(3),
      },
      portalEvent: {
        count: jest.fn().mockResolvedValueOnce(6).mockResolvedValueOnce(2),
      },
      roster: {
        count: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2),
      },
      rosterAssignment: { count: jest.fn().mockResolvedValue(3) },
    };
  }

  function serviceFor(prisma: ReturnType<typeof prismaStub>) {
    return new IndicatorsService(prisma as never, {
      getPilotChurch: jest.fn().mockResolvedValue(pilot),
    } as never);
  }

  function expectGeneralCounts(result: {
    counts: Record<string, number>;
    scope: string;
  }) {
    expect(result.scope).toBe("church");
    expect(result.counts.membershipsActive).toBe(2);
    expect(result.counts.visitorsActive).toBe(4);
    expect(result.counts.admissionsOpen).toBe(1);
    expect(result.counts.ministriesPublished).toBe(3);
    expect(result.counts.eventsPublishedUpcoming).toBe(2);
    expect(result.counts.rosterAssignmentsPending).toBe(3);
  }

  function expectPastoralHidden(
    result: {
      counts: Record<string, number>;
      redacted: string[];
    },
    prisma: ReturnType<typeof prismaStub>,
  ) {
    expect(result.counts).not.toHaveProperty("pastoralOpen");
    expect(result.redacted).toEqual(["pastoralOpen"]);
    expect(prisma.pastoralCase.count).not.toHaveBeenCalled();
  }

  it("PASS pastor da congregação recebe pastoralOpen e as contagens gerais", async () => {
    const prisma = prismaStub();
    const result = await serviceFor(prisma).summary(actor("PASTOR"));
    expectGeneralCounts(result);
    expect(result.counts.pastoralOpen).toBe(7);
    expect(result.redacted).toEqual([]);
    expect(prisma.pastoralCase.count).toHaveBeenCalledWith({
      where: {
        organizationId: "org1",
        churchId: "church-rf1",
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
    });
  });

  it("PASS pastor de outra congregação não lê o resumo nem a contagem pastoral", async () => {
    const prisma = prismaStub();
    const pastor = actor("PASTOR", "church-other");
    await expect(
      serviceFor(prisma).summary(pastor, { churchId: "church-rf1" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.pastoralCase.count).not.toHaveBeenCalled();
    expect(prisma.churchMembership.count).not.toHaveBeenCalled();
  });

  it.each([
    ["SECRETARIA", "secretaria"],
    ["LIDER_MINISTERIO", "líder"],
    ["MEMBRO", "membro"],
    ["TESOURARIA", "tesouraria"],
    ["EDITOR_SITE", "editor"],
    ["PUBLICADOR_SITE", "publicador"],
    ["PLATFORM_ADMIN", "admin técnico"],
    ["VISITANTE", "visitante"],
  ])(
    "PASS %s (%s) mantém estatísticas gerais e não recebe pastoralOpen",
    async (roleCode) => {
      const prisma = prismaStub();
      const churchId = roleCode === "PLATFORM_ADMIN" ? null : "church-rf1";
      const result = await serviceFor(prisma).summary(
        actor(roleCode, churchId),
      );
      expectGeneralCounts(result);
      expectPastoralHidden(result, prisma);
    },
  );

  it("PASS admin técnico no escopo da organização não agrega pastoralOpen", async () => {
    const prisma = prismaStub();
    const result = await serviceFor(prisma).summary(
      actor("PLATFORM_ADMIN", null),
      { scope: "organization" },
    );
    expect(result.scope).toBe("organization");
    expect(result.churchId).toBeNull();
    expect(result.counts.membershipsActive).toBe(2);
    expect(result.counts.visitorsActive).toBe(4);
    expectPastoralHidden(result, prisma);
  });

  it("PASS visitante sem grant não lê indicadores nem dispara a contagem pastoral", async () => {
    const prisma = prismaStub();
    const visitante = actor("");
    await expect(serviceFor(prisma).summary(visitante)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.pastoralCase.count).not.toHaveBeenCalled();
  });

  it("PASS pastor explícito no mesmo token de admin técnico lê só a própria congregação", async () => {
    const prisma = prismaStub();
    const user = actor("PLATFORM_ADMIN", null, [
      {
        roleCode: "PASTOR",
        organizationId: "org1",
        churchId: "church-rf1",
      },
    ]);
    const own = await serviceFor(prisma).summary(user, {
      churchId: "church-rf1",
    });
    expect(own.counts.pastoralOpen).toBe(7);
    expect(prisma.pastoralCase.count).toHaveBeenCalledTimes(1);

    const otherPrisma = prismaStub();
    const other = await serviceFor(otherPrisma).summary(user, {
      churchId: "church-other",
    });
    expectGeneralCounts(other);
    expectPastoralHidden(other, otherPrisma);
  });
});
