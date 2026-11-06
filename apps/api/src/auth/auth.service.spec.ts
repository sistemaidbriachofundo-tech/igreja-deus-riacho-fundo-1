import { createHmac } from "node:crypto";
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
  const service = new AuthService(prismaStub);

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
