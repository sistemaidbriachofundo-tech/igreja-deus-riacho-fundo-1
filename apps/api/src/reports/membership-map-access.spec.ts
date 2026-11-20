import { ForbiddenException } from "@nestjs/common";
import { MembershipInsightsService } from "./membership-insights.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("mapa da membresia no serviço", () => {
  const pilot = {
    organizationId: "org1", churchId: "church-rf1",
    organizationSlug: "igreja-de-deus", churchSlug: "riacho-fundo-1", churchName: "Riacho Fundo I (demo)",
  };
  const secretary: AuthUser = {
    userId: "u-sec", personId: "p-sec", email: "secretaria.demo@example.test",
    grants: [{ roleCode: "SECRETARIA", organizationId: "org1", churchId: "church-rf1" }],
  };
  const member: AuthUser = {
    userId: "u-mem", personId: "p-mem", email: "membro.demo@example.test",
    grants: [{ roleCode: "MEMBRO", organizationId: "org1", churchId: "church-rf1" }],
  };
  const otherChurch: AuthUser = {
    ...secretary, userId: "u-outra",
    grants: [{ roleCode: "SECRETARIA", organizationId: "org1", churchId: "outra" }],
  };

  it("agrega volume por região, isola a congregação e não devolve endereço", async () => {
    const rows = [
      ...Array.from({ length: 200 }, (_, index) => ({
        status: "ACTIVE", person: { address: `Quadra fictícia ${index}, Riacho Fundo I, DF` },
      })),
      ...Array.from({ length: 4 }, () => ({ status: "ACTIVE", person: { address: "Guará II, DF" } })),
      { status: "ACTIVE", person: { address: "Rua de Exemplo, Gama, GO" } },
      { status: "PENDING_ADMISSION", person: { address: "Recanto das Emas" } },
      { status: "INACTIVE", person: { address: null } },
    ];
    const findMany = jest.fn().mockResolvedValue(rows);
    const service = new MembershipInsightsService(
      { churchMembership: { findMany } } as never,
      { getPilotChurch: async () => pilot } as never,
    );
    const report = await service.map(secretary);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: "org1", churchId: "church-rf1",
        status: { in: ["ACTIVE", "INACTIVE", "PENDING_ADMISSION"] },
      }),
      select: { status: true, person: { select: { address: true } } },
    }));
    expect(report.ACTIVE.regions).toEqual([
      expect.objectContaining({ id: 17, name: "Riacho Fundo I", count: 200 }),
    ]);
    expect(report.ACTIVE.grouped).toBe(4);
    expect(report.ACTIVE.pending).toBe(1);
    expect(report.PENDING_ADMISSION.grouped).toBe(1);
    expect(report.INACTIVE.pending).toBe(1);
    expect(JSON.stringify(report)).not.toMatch(/Quadra fictícia|Guará|Gama|Recanto/);

    const blocked = new MembershipInsightsService(
      { churchMembership: { findMany } } as never,
      { getPilotChurch: async () => pilot } as never,
    );
    await expect(blocked.map(member)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(blocked.map(otherChurch)).rejects.toBeInstanceOf(ForbiddenException);
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});