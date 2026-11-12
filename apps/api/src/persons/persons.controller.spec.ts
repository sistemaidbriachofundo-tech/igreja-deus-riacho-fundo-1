import "reflect-metadata";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { ROLES_KEY } from "../auth/auth.constants";
import { PatchPersonBody, PersonsController } from "./persons.controller";

async function validate(body: object) {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  return pipe.transform(body, { type: "body", metatype: PatchPersonBody });
}

describe("PatchPersonBody", () => {
  it("aceita nome, e-mail e versão e recusa telefone", async () => {
    await expect(
      validate({
        displayName: "Ana Demo",
        email: "ana.demo@example.test",
        expectedUpdatedAt: "2026-11-01T00:00:00.000Z",
        isMinor: false,
      }),
    ).resolves.toMatchObject({ displayName: "Ana Demo" });

    await expect(validate({ email: null, householdId: null })).resolves.toMatchObject({
      email: null,
      householdId: null,
    });
    await expect(validate({ phone: "61999999999" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(validate({ address: "Rua 1" })).resolves.toMatchObject({ address: "Rua 1" });
    await expect(validate({ address: "x".repeat(501) })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(validate({ email: "sem-arroba" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("não acrescenta papel além de secretaria e platform admin", () => {
    const roles = Reflect.getMetadata(ROLES_KEY, PersonsController.prototype.patch);
    expect(roles).toEqual([ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN]);
  });

  it("encaminha o corpo ao service", async () => {
    const persons = { patch: jest.fn().mockResolvedValue({ id: "p1" }) };
    const controller = new PersonsController(persons as never);
    await controller.patch(
      { userId: "u1", personId: "p1", email: "a@example.test", grants: [] },
      "p1",
      { displayName: "Ana Demo", email: "ana@example.test" },
    );
    expect(persons.patch).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1" }),
      "p1",
      { displayName: "Ana Demo", email: "ana@example.test" },
    );
  });
});
