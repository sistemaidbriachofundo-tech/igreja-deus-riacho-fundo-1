import "reflect-metadata";
import { UnauthorizedException } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import { IS_PUBLIC_KEY, ROLES_KEY } from "../auth/auth.constants";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CredentialsController } from "./credentials.controller";

describe("CredentialsController acesso", () => {
  const proto = CredentialsController.prototype;

  it("leitura, PDF e abertura exigem papel; só a conferência do QR é pública", () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, proto.verify)).toBe(true);
    for (const method of [
      proto.me,
      proto.getOne,
      proto.byMembership,
      proto.generatePdf,
      proto.downloadPdf,
      proto.issue,
      proto.revoke,
    ]) {
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, method)).toBeUndefined();
    }
    expect(Reflect.getMetadata(ROLES_KEY, proto.me)).toEqual(
      expect.arrayContaining([
        ROLE_CODES.MEMBRO,
        ROLE_CODES.SECRETARIA,
        ROLE_CODES.PLATFORM_ADMIN,
      ]),
    );
    expect(Reflect.getMetadata(ROLES_KEY, proto.getOne)).toEqual(
      expect.arrayContaining([ROLE_CODES.MEMBRO, ROLE_CODES.SECRETARIA]),
    );
    expect(Reflect.getMetadata(ROLES_KEY, proto.issue)).not.toContain(ROLE_CODES.MEMBRO);
  });

  it("sessão anônima recebe 401 antes de abrir a carteirinha", async () => {
    const guard = new JwtAuthGuard(
      { getAllAndOverride: () => false } as never,
      { verifyAccessToken: jest.fn() } as never,
    );
    const context = {
      getHandler: () => proto.getOne,
      getClass: () => CredentialsController,
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
    };
    await expect(guard.canActivate(context as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("Bearer inválido também é 401", async () => {
    const guard = new JwtAuthGuard(
      { getAllAndOverride: () => false } as never,
      {
        verifyAccessToken: jest.fn(() => {
          throw new Error("invalid");
        }),
      } as never,
    );
    const context = {
      getHandler: () => proto.me,
      getClass: () => CredentialsController,
      switchToHttp: () => ({
        getRequest: () => ({ headers: { authorization: "Bearer nao-e-jwt" } }),
      }),
    };
    await expect(guard.canActivate(context as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
