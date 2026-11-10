import { Test } from "@nestjs/testing";
import { PilotService } from "../../pilot/pilot.service";
import { PrismaService } from "../../prisma/prisma.service";
import { MinistryMembershipGateService } from "./ministry-membership-gate.service";

describe("Nest DI: ministry membership service bootstrap", () => {
  it("resolves the module provider without an optional test repository", async () => {
    const prisma = { $queryRawUnsafe: jest.fn() };
    const pilot = { getPilotChurch: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        MinistryMembershipGateService,
        { provide: PrismaService, useValue: prisma },
        { provide: PilotService, useValue: pilot },
      ],
    }).compile();
    expect(module.get(MinistryMembershipGateService)).toBeInstanceOf(
      MinistryMembershipGateService,
    );
    await module.close();
  });
});
