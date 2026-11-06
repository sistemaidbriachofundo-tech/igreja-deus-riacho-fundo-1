import {
  hashPassword,
  hashPasswordLegacySha256,
  verifyPassword,
  resolveJwtSecret,
  AuthService,
} from "./auth.service";
import {
  JWT_DEV_FALLBACK_SECRET,
  JWT_SECRET_MIN_LENGTH,
} from "./auth.constants";
import { createHmac } from "node:crypto";

describe("AuthService password helpers", () => {
  it("hashes and verifies Argon2id passwords", async () => {
    const hash = await hashPassword("admin");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword("admin", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("still verifies legacy sha256 demo hashes", async () => {
    const hash = hashPasswordLegacySha256("admin");
    expect(hash.startsWith("sha256:")).toBe(true);
    expect(await verifyPassword("admin", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("rejects missing or unknown hash schemes", async () => {
    expect(await verifyPassword("admin", null)).toBe(false);
    expect(await verifyPassword("admin", "bcrypt:xyz")).toBe(false);
  });

  it("rejects malformed argon2 and truncated sha256 hashes", async () => {
    expect(await verifyPassword("admin", "$argon2id$not-a-valid-phc")).toBe(
      false,
    );
    expect(await verifyPassword("admin", "sha256:abcd")).toBe(false);
  });
});

describe("resolveJwtSecret", () => {
  it("accepts strong secrets in any env", () => {
    const secret = "a".repeat(JWT_SECRET_MIN_LENGTH);
    expect(resolveJwtSecret(secret, "production")).toBe(secret);
    expect(resolveJwtSecret(secret, "development")).toBe(secret);
  });

  it("falls back in non-production when secret is missing or short", () => {
    expect(resolveJwtSecret(undefined, "development")).toBe(
      JWT_DEV_FALLBACK_SECRET,
    );
    expect(resolveJwtSecret("short", "test")).toBe(JWT_DEV_FALLBACK_SECRET);
  });

  it("rejects weak or missing secrets in production", () => {
    expect(() => resolveJwtSecret(undefined, "production")).toThrow(
      /JWT_SECRET/,
    );
    expect(() => resolveJwtSecret("short", "production")).toThrow(/JWT_SECRET/);
    expect(() =>
      resolveJwtSecret(JWT_DEV_FALLBACK_SECRET, "production"),
    ).toThrow(/desenvolvimento/);
  });
});

describe("AuthService JWT helpers", () => {
  const prismaStub = {} as ConstructorParameters<typeof AuthService>[0];
  const pilotStub = { getPilotChurch: jest.fn() } as never;
  const service = new AuthService(prismaStub, pilotStub);

  beforeAll(() => {
    process.env.JWT_SECRET = "unit-test-jwt-secret-32chars-ok!!";
    process.env.NODE_ENV = "test";
  });

  it("signs and verifies token with personId", () => {
    const token = service.signAccessToken({
      sub: "user01",
      personId: "demoPersonRiacho01",
      email: "ana.demo@example.test",
      grants: [
        {
          roleCode: "SECRETARIA",
          organizationId: "org1",
          churchId: "ch1",
        },
      ],
    });

    const user = service.verifyAccessToken(token);
    expect(user.personId).toBe("demoPersonRiacho01");
    expect(user.email).toBe("ana.demo@example.test");
    expect(user.grants[0]?.roleCode).toBe("SECRETARIA");
  });

  it("rejects expired and non-expiring JWTs even with a valid HMAC signature", () => {
    const valid = service.signAccessToken({
      sub: "user01", personId: "demoPersonRiacho01",
      email: "ana.demo@example.test", grants: [],
    });
    const [head, rawBody] = valid.split(".");
    const original = JSON.parse(Buffer.from(rawBody, "base64url").toString("utf8")) as Record<string, unknown>;
    const forge = (claims: Record<string, unknown>, encodedHead = head) => {
      const encodedBody = Buffer.from(JSON.stringify(claims)).toString("base64url");
      const value = encodedHead + "." + encodedBody;
      const signature = createHmac("sha256", process.env.JWT_SECRET!).update(value).digest("base64url");
      return value + "." + signature;
    };
    const noExpiration = { ...original };
    delete noExpiration.exp;
    expect(() => service.verifyAccessToken(forge(noExpiration))).toThrow(/expiração/);
    expect(() => service.verifyAccessToken(forge({ ...original, exp: 1 }))).toThrow(/expiração/);
    const noneHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    expect(() => service.verifyAccessToken(forge(original, noneHeader))).toThrow(/Algoritmo/);
  });

  it("rejects tampered token", () => {
    const token = service.signAccessToken({
      sub: "user01",
      personId: "demoPersonRiacho01",
      email: "ana.demo@example.test",
      grants: [],
    });
    expect(() => service.verifyAccessToken(`${token}x`)).toThrow();
  });
});

describe("AuthService login MFA hint", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = "unit-test-jwt-secret-32chars-ok!!";
    process.env.NODE_ENV = "test";
  });

  it("returns mfa challengeRequired when required+enabled", async () => {
    const hash = await hashPassword("admin");
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "u1",
          email: "ana.demo@example.test",
          personId: "demoPersonRiacho01",
          passwordHash: hash,
          status: "ACTIVE",
          mfaRequired: true,
          mfaFactors: [{ id: "f1" }],
          person: { id: "demoPersonRiacho01" },
          grants: [
            {
              organizationId: "org1",
              churchId: "ch1",
              ministryId: null,
              role: { code: "SECRETARIA" },
            },
          ],
        }),
      },
    };
    const service = new AuthService(prisma as never, { getPilotChurch: jest.fn().mockResolvedValue({ organizationId: "org1", churchId: "ch1", organizationSlug: "igreja-de-deus", churchSlug: "riacho-fundo-1", churchName: "RF1" }) } as never);
    const result = await service.login({
      email: "ana.demo@example.test",
      password: "admin",
    });
    expect(result.mfa).toBeDefined();
    expect(result.mfa).toEqual({
      enabled: true,
      required: true,
      challengeRequired: true,
      oidcLive: false,
    });
    expect(result.accessToken).toBeTruthy();
  });

  it("returns challengeRequired false when MFA not required", async () => {
    const hash = await hashPassword("admin");
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "u1",
          email: "bruno.demo@example.test",
          personId: "demoPersonBruno01",
          passwordHash: hash,
          status: "ACTIVE",
          mfaRequired: false,
          mfaFactors: [],
          person: { id: "demoPersonBruno01" },
          grants: [
            {
              organizationId: "org1",
              churchId: "ch1",
              ministryId: null,
              role: { code: "MEMBRO" },
            },
          ],
        }),
      },
    };
    const service = new AuthService(prisma as never, { getPilotChurch: jest.fn().mockResolvedValue({ organizationId: "org1", churchId: "ch1", organizationSlug: "igreja-de-deus", churchSlug: "riacho-fundo-1", churchName: "RF1" }) } as never);
    const result = await service.login({
      email: "bruno.demo@example.test",
      password: "admin",
    });
    expect(result.mfa).toBeDefined();
    expect(result.mfa!.challengeRequired).toBe(false);
    expect(result.mfa!.enabled).toBe(false);
  });
});

describe("AuthService refresh and switchChurch", () => {
  const pilot = {
    organizationId: "org1",
    churchId: "ch1",
    organizationSlug: "igreja-de-deus",
    churchSlug: "riacho-fundo-1",
    churchName: "Riacho Fundo I",
  };

  beforeAll(() => {
    process.env.JWT_SECRET = "unit-test-jwt-secret-32chars-ok!!";
    process.env.NODE_ENV = "test";
  });

  it("refresh reloads grants and keeps active church when covered", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "user01",
          personId: "demoPersonRiacho01",
          email: "ana.demo@example.test",
          status: "ACTIVE",
          grants: [
            {
              organizationId: "org1",
              churchId: "ch1",
              ministryId: null,
              role: { code: "SECRETARIA" },
            },
            {
              organizationId: "org1",
              churchId: "ch2",
              ministryId: null,
              role: { code: "SECRETARIA" },
            },
          ],
        }),
      },
    };
    const service = new AuthService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const pair = await service.refresh({
      userId: "user01",
      personId: "demoPersonRiacho01",
      email: "ana.demo@example.test",
      organizationId: "org1",
      churchId: "ch2",
      grants: [],
    });
    expect(pair.user.churchId).toBe("ch2");
    expect(pair.user.grants).toHaveLength(2);
    expect(pair.accessToken).toBeTruthy();
  });

  it("switchChurch denies church without grant", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "user01",
          personId: "demoPersonRiacho01",
          email: "ana.demo@example.test",
          status: "ACTIVE",
          grants: [
            {
              organizationId: "org1",
              churchId: "ch1",
              ministryId: null,
              role: { code: "SECRETARIA" },
            },
          ],
        }),
      },
      church: {
        findUnique: jest.fn().mockResolvedValue({
          id: "ch2",
          organizationId: "org1",
        }),
      },
    };
    const service = new AuthService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.switchChurch(
        {
          userId: "user01",
          personId: "demoPersonRiacho01",
          email: "ana.demo@example.test",
          organizationId: "org1",
          churchId: "ch1",
          grants: [
            {
              roleCode: "SECRETARIA",
              organizationId: "org1",
              churchId: "ch1",
            },
          ],
        },
        "ch2",
      ),
    ).rejects.toThrow(/grant/);
  });

  it("switchChurch issues new claims when grant covers target", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "user01",
          personId: "demoPersonRiacho01",
          email: "platform.demo@example.test",
          status: "ACTIVE",
          grants: [
            {
              organizationId: "org1",
              churchId: null,
              ministryId: null,
              role: { code: "PLATFORM_ADMIN" },
            },
          ],
        }),
      },
      church: {
        findUnique: jest.fn().mockResolvedValue({
          id: "ch2",
          organizationId: "org1",
        }),
      },
    };
    const service = new AuthService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const pair = await service.switchChurch(
      {
        userId: "user01",
        personId: "demoPersonRiacho01",
        email: "platform.demo@example.test",
        organizationId: "org1",
        churchId: "ch1",
        grants: [
          {
            roleCode: "PLATFORM_ADMIN",
            organizationId: "org1",
            churchId: null,
          },
        ],
      },
      "ch2",
    );
    expect(pair.user.churchId).toBe("ch2");
    expect(pair.user.organizationId).toBe("org1");
  });
});

