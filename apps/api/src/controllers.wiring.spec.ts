import { AdmissionsController } from "./admissions/admissions.controller";
import { AuthController } from "./auth/auth.controller";
import { CredentialsController } from "./credentials/credentials.controller";
import { HealthController } from "./health.controller";
import { HouseholdsController } from "./households/households.controller";
import { MembershipsController } from "./memberships/memberships.controller";
import { PersonsController } from "./persons/persons.controller";
import type { AuthUser } from "./auth/types/auth-user";

describe("controller wiring (delegates to services)", () => {
  const user: AuthUser = {
    userId: "u1",
    personId: "p1",
    email: "a@example.test",
    grants: [],
  };

  it("HealthController", async () => {
    const health = {
      getHello: jest.fn().mockReturnValue({ message: "ok" }),
      getHealth: jest.fn().mockReturnValue({ status: "ok" }),
    };
    const c = new HealthController(health as never);
    expect(c.getHello()).toEqual({ message: "ok" });
    expect(c.getHealth()).toEqual({ status: "ok" });
  });

  it("AuthController", async () => {
    const auth = {
      login: jest.fn().mockResolvedValue({ accessToken: "t" }),
    };
    const c = new AuthController(auth as never);
    await expect(c.login({ email: "a", password: "b" })).resolves.toEqual({
      accessToken: "t",
    });
    expect(c.me(user)).toBe(user);
    expect(c.rbacSmoke(user)).toMatchObject({ ok: true, personId: "p1" });
  });

  it("PersonsController", async () => {
    const persons = {
      search: jest.fn().mockResolvedValue({ hits: [] }),
      getById: jest.fn().mockResolvedValue({ id: "p1" }),
      getDossier: jest.fn().mockResolvedValue({ person: { id: "p1" } }),
      patch: jest.fn().mockResolvedValue({ id: "p1" }),
    };
    const c = new PersonsController(persons as never);
    await c.search(user, "an", "5");
    expect(persons.search).toHaveBeenCalledWith(user, "an", 5);
    await c.get(user, "p1");
    await c.dossier(user, "p1");
    await c.patch(user, "p1", { isMinor: false });
    expect(persons.getById).toHaveBeenCalledWith(user, "p1");
  });

  it("HouseholdsController", async () => {
    const households = {
      create: jest.fn().mockResolvedValue({ id: "h1" }),
      list: jest.fn().mockResolvedValue({ households: [] }),
      getById: jest.fn().mockResolvedValue({ id: "h1" }),
      addMembers: jest.fn().mockResolvedValue({ id: "h1" }),
      removeMember: jest.fn().mockResolvedValue({ id: "h1" }),
    };
    const c = new HouseholdsController(households as never);
    await c.create(user, { label: "x" });
    await c.list(user);
    await c.get(user, "h1");
    await c.addMembers(user, "h1", { memberPersonIds: ["p1"] });
    await c.removeMember(user, "h1", "p1");
    expect(households.create).toHaveBeenCalled();
    expect(households.list).toHaveBeenCalledWith(user);
    expect(households.getById).toHaveBeenCalledWith(user, "h1");
  });

  it("AdmissionsController", async () => {
    const admissions = {
      list: jest.fn(),
      getById: jest.fn(),
      create: jest.fn(),
      advance: jest.fn(),
    };
    const documents = {
      list: jest.fn(),
      upload: jest.fn(),
      download: jest.fn(),
    };
    const c = new AdmissionsController(admissions as never, documents as never);
    await c.list(user, "DRAFT");
    await c.get(user, "a1");
    await c.create(user, { displayName: "X" } as never);
    await c.advance(user, "a1", { completeStep: "documents" } as never);
    await c.listDocuments(user, "a1");
    expect(admissions.list).toHaveBeenCalledWith(user, "DRAFT");
    expect(admissions.advance).toHaveBeenCalled();
  });

  it("CredentialsController", async () => {
    const credentials = {
      getOwn: jest.fn(),
      issue: jest.fn(),
      reissue: jest.fn(),
      revoke: jest.fn(),
      lookupByOpaqueToken: jest.fn(),
    };
    const c = new CredentialsController(credentials as never);
    await c.me(user);
    await c.issue(user, "m1");
    await c.reissue(user, "m1");
    await c.revoke(user, "c1");
    await c.verify("token");
    expect(credentials.lookupByOpaqueToken).toHaveBeenCalledWith("token");
  });

  it("MembershipsController", async () => {
    const memberships = {
      listForPilot: jest.fn(),
      register: jest.fn(),
    };
    const c = new MembershipsController(memberships as never);
    await c.list(user);
    await c.register(user, { displayName: "X" });
    expect(memberships.register).toHaveBeenCalled();
  });
});
