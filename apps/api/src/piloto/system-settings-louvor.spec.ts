import { SystemSettingsService, settingBehavior } from "./system-settings.service";

describe("Gestão de regras reais do Louvor", () => {
  const scope = { organizationId: "org-a", churchId: "riacho" };
  function makeService(value: boolean) {
    const prisma = {
      ministry: { findFirst: jest.fn().mockResolvedValue({ id: "louvor-a" }) },
      systemSettingCatalog: { findUnique: jest.fn().mockResolvedValue({
        key: "rosters.louvor.week_block", scopeKind: "MINISTRY", devJson: true, valueType: "boolean",
      }) },
      systemSettingRevision: { findMany: jest.fn().mockResolvedValue([{
        id: "rev-a", valueJson: value, effectiveFrom: new Date("2026-11-01T00:00:00Z"), effectiveUntil: null,
      }]) },
    };
    const service = new SystemSettingsService(prisma as never, {} as never);
    return { prisma, service };
  }

  it("habilita como editável só uma regra com consumidor no backend", () => {
    expect(settingBehavior("rosters.louvor.week_block")).toBe("active");
    expect(settingBehavior("rosters.ceia.manual")).toBe("documentary");
    expect(settingBehavior("events.registration.session_required")).toBe("locked");
  });

  it("usa a revisão publicada na equipe da congregação autorizada", async () => {
    const { prisma, service } = makeService(false);
    const result = await service.getLouvorWeekBlock(scope, "louvor-a", new Date("2026-11-23T12:00:00Z"));
    expect(result).toBe(false);
    expect(prisma.ministry.findFirst).toHaveBeenCalledWith({
      where: { id: "louvor-a", organizationId: "org-a", churchId: "riacho", slug: { startsWith: "louvor" } },
      select: { id: true },
    });
    expect(prisma.systemSettingRevision.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ catalogKey: "rosters.louvor.week_block", scopeKind: "MINISTRY", scopeId: "louvor-a", organizationId: "org-a" }),
    });
  });

  it("nunca aplica uma configuração de outra congregação ou de ministério não Louvor", async () => {
    const { prisma, service } = makeService(false);
    prisma.ministry.findFirst.mockResolvedValueOnce(null);
    expect(await service.getLouvorWeekBlock(scope, "ministry-alheio")).toBe(true);
    expect(prisma.systemSettingRevision.findMany).not.toHaveBeenCalled();
  });
});
