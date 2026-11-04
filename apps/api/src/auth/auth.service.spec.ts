import {
  hashPasswordDemo,
  verifyPassword,
  AuthService,
} from "./auth.service";

describe("AuthService password helpers", () => {
  it("hashes and verifies demo passwords", () => {
    const hash = hashPasswordDemo("admin");
    expect(hash.startsWith("sha256:")).toBe(true);
    expect(verifyPassword("admin", hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
  });

  it("rejects missing or unknown hash schemes", () => {
    expect(verifyPassword("admin", null)).toBe(false);
    expect(verifyPassword("admin", "argon2:xyz")).toBe(false);
  });
});

describe("AuthService JWT helpers", () => {
  const prismaStub = {} as ConstructorParameters<typeof AuthService>[0];
  const service = new AuthService(prismaStub);

  beforeAll(() => {
    process.env.JWT_SECRET = "unit-test-jwt-secret";
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
