import { NotFoundException } from "@nestjs/common";
import { PilotService } from "./pilot.service";

describe("PilotService", () => {
  it("resolves org + church piloto", async () => {
    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          id: "org1",
          slug: "igreja-de-deus",
        }),
      },
      church: {
        findUnique: jest.fn().mockResolvedValue({
          id: "church-rf1",
          slug: "riacho-fundo-1",
          name: "Riacho Fundo I (demo)",
        }),
      },
    };
    const service = new PilotService(prisma as never);
    const [first, second] = await Promise.all([service.getPilotChurch(), service.getPilotChurch()]);
    expect(first).toEqual({
      organizationId: "org1",
      churchId: "church-rf1",
      organizationSlug: "igreja-de-deus",
      churchSlug: "riacho-fundo-1",
      churchName: "Riacho Fundo I (demo)",
    });
    first.churchName = "alterado pelo chamador";
    expect(second.churchName).toBe("Riacho Fundo I (demo)");
    expect(await service.getPilotChurch()).toEqual(second);
    expect(prisma.organization.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.church.findUnique).toHaveBeenCalledTimes(1);
  });

  it("throws when org missing", async () => {
    const service = new PilotService({
      organization: { findUnique: jest.fn().mockResolvedValue(null) },
      church: { findUnique: jest.fn() },
    } as never);
    await expect(service.getPilotChurch()).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("throws when church missing", async () => {
    const service = new PilotService({
      organization: {
        findUnique: jest.fn().mockResolvedValue({ id: "org1", slug: "igreja-de-deus" }),
      },
      church: { findUnique: jest.fn().mockResolvedValue(null) },
    } as never);
    await expect(service.getPilotChurch()).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
