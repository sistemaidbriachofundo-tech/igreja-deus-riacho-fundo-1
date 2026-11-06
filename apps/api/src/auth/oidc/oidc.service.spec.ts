import { ForbiddenException, NotImplementedException } from "@nestjs/common";
import { OidcService } from "./oidc.service";
import type { AuthUser } from "../types/auth-user";

describe("OidcService", () => {
  const pilot = {
    organizationId: "org1",
    churchId: "church-rf1",
    churchName: "Riacho Fundo I (demo)",
    churchSlug: "riacho-fundo-1",
    organizationSlug: "igreja-de-deus",
  };

  const admin: AuthUser = {
    userId: "u-admin",
    personId: "p-admin",
    email: "admin@example.test",
    grants: [
      {
        roleCode: "PLATFORM_ADMIN",
        organizationId: "org1",
        churchId: "church-rf1",
      },
    ],
  };

  const secretaria: AuthUser = {
    userId: "u-sec",
    personId: "p-sec",
    email: "ana.demo@example.test",
    grants: [
      {
        roleCode: "SECRETARIA",
        organizationId: "org1",
        churchId: "church-rf1",
      },
    ],
  };

  it("upserts config for PLATFORM_ADMIN without exposing secrets", async () => {
    const prisma = {
      oidcProviderConfig: {
        findUnique: jest.fn(),
        upsert: jest.fn().mockResolvedValue({
          id: "oidc1",
          status: "CONFIGURED",
          displayName: "Demo IdP",
          issuerUrl: "https://idp.example.test",
          clientId: "client-demo",
          clientSecretRef: "OIDC_CLIENT_SECRET",
          redirectUri: "http://localhost:3001/auth/oidc/callback",
          scopes: "openid profile email",
          updatedAt: new Date("2026-11-06T12:00:00Z"),
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const service = new OidcService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    const result = await service.upsertConfig(admin, {
      displayName: "Demo IdP",
      issuerUrl: "https://idp.example.test",
      clientId: "client-demo",
      status: "CONFIGURED",
    });
    expect(result.liveIdp).toBe(false);
    expect(result.config?.clientSecret).toBeNull();
    expect(result.config?.clientSecretRef).toBe("OIDC_CLIENT_SECRET");
  });

  it("denies SECRETARIA from managing OIDC", async () => {
    const service = new OidcService(
      { oidcProviderConfig: {}, auditLog: { create: jest.fn() } } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.getConfig(secretaria)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("authorize interface is not live; callback throws OIDC_NOT_LIVE", () => {
    const service = new OidcService(
      {} as never,
      { getPilotChurch: jest.fn() } as never,
    );
    expect(service.getAuthorizeInterface()).toMatchObject({
      liveIdp: false,
      status: "not_live",
    });
    expect(() => service.handleCallbackInterface({ code: "x" })).toThrow(
      NotImplementedException,
    );
  });
});
