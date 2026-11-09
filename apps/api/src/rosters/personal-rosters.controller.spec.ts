import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { ROLE_CODES } from "@idbrf/shared";
import { ACCESS_POLICY_KEY, ROLES_KEY } from "../auth/auth.constants";
import type { AuthUser } from "../auth/types/auth-user";
import { RostersController } from "../ministries/ministries.controller";
import { MinistriesService } from "../ministries/ministries.service";
import { PersonalRosterService } from "./personal-roster.service";
import { PersonalRostersController } from "./personal-rosters.controller";

describe("PersonalRostersController", () => {
  const membro: AuthUser = {
    userId: "usr-membro",
    personId: "per-membro",
    email: "membro.sintetico@example.test",
    grants: [],
  };

  it("GET /rosters/me usa ministries.respond para o membro e ignora personId externo", async () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      PersonalRostersController.prototype.me,
    ) as string[];
    const access = Reflect.getMetadata(
      ACCESS_POLICY_KEY,
      PersonalRostersController.prototype.me,
    );
    expect(roles).toContain(ROLE_CODES.MEMBRO);
    expect(access).toEqual({ resource: "ministries", action: "respond" });

    const listMine = jest.fn().mockResolvedValue({
      personId: membro.personId,
      assignments: [],
    });
    const controller = new PersonalRostersController({ listMine } as never);
    await controller.me(membro);
    expect(listMine).toHaveBeenCalledWith(membro);
    expect(listMine.mock.calls[0]).toHaveLength(1);
  });

  it("a listagem por ministério não autoriza MEMBRO", () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      PersonalRostersController.prototype.byMinistry,
    ) as string[];
    expect(roles).not.toContain(ROLE_CODES.MEMBRO);
    expect(roles).toContain(ROLE_CODES.LIDER_MINISTERIO);
  });

  it("confirmar e recusar também ficam em respond, e a substituição não", () => {
    const confirm = Reflect.getMetadata(
      ACCESS_POLICY_KEY,
      PersonalRostersController.prototype.confirm,
    );
    const decline = Reflect.getMetadata(
      ACCESS_POLICY_KEY,
      PersonalRostersController.prototype.decline,
    );
    const substituteRoles = Reflect.getMetadata(
      ROLES_KEY,
      PersonalRostersController.prototype.substitute,
    ) as string[];
    expect(confirm).toEqual({ resource: "ministries", action: "respond" });
    expect(decline).toEqual({ resource: "ministries", action: "respond" });
    expect(substituteRoles).not.toContain(ROLE_CODES.MEMBRO);
  });

  it("GET /rosters/me não cai na listagem da congregação", async () => {
    const listRosters = jest.fn();
    const listMine = jest.fn().mockResolvedValue({
      personId: "per-membro",
      source: "jwt",
      notified: false,
      assignments: [{ id: "asg-1", title: "Louvor domingo" }],
    });
    const moduleRef = await Test.createTestingModule({
      controllers: [RostersController, PersonalRostersController],
      providers: [
        { provide: MinistriesService, useValue: { listRosters } },
        { provide: PersonalRosterService, useValue: { listMine } },
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    app.use((req: { user?: AuthUser }, _res: unknown, next: () => void) => {
      req.user = membro;
      next();
    });
    await app.listen(0);
    try {
      const address = app.getHttpServer().address();
      const port = typeof address === "object" && address ? address.port : 0;
      const response = await fetch(`http://127.0.0.1:${port}/rosters/me`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as { personId: string; assignments: unknown[] };
      expect(body.personId).toBe("per-membro");
      expect(body.assignments).toHaveLength(1);
      expect(listMine).toHaveBeenCalledWith(membro);
      expect(listRosters).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
