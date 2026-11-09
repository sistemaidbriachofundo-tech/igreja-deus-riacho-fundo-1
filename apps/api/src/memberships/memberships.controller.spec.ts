import "reflect-metadata";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { ROLES_KEY } from "../auth/auth.constants";
import {
  MembershipsController,
  PatchMembershipBody,
} from "./memberships.controller";

async function validate(body: object) {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  return pipe.transform(body, { type: "body", metatype: PatchMembershipBody });
}

describe("PatchMembershipBody", () => {
  it("aceita observação e recusa campos de pessoa", async () => {
    await expect(
      validate({
        notes: "Família conferida",
        expectedUpdatedAt: "2026-11-02T00:00:00.000Z",
        status: "ACTIVE",
      }),
    ).resolves.toMatchObject({ notes: "Família conferida", status: "ACTIVE" });
    await expect(validate({ notes: null })).resolves.toMatchObject({ notes: null });
    await expect(validate({ displayName: "Ana" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(validate({ email: "ana@example.test" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(validate({ leftAt: "2026-11-02T00:00:00.000Z" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("mantém os mesmos papéis do cadastro de membresia", () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      MembershipsController.prototype.patch,
    );
    expect(roles).toEqual([ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN]);
  });

  it("encaminha o corpo ao service", async () => {
    const memberships = { patch: jest.fn().mockResolvedValue({ id: "m1" }) };
    const controller = new MembershipsController(memberships as never);
    await controller.patch(
      { userId: "u1", personId: "p1", email: "a@example.test", grants: [] },
      "m1",
      { notes: "ok" },
    );
    expect(memberships.patch).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1" }),
      "m1",
      { notes: "ok" },
    );
  });
});
