import { AdmissionsController } from "./admissions/admissions.controller";
import { AuditController } from "./audit/audit.controller";
import { AuthController } from "./auth/auth.controller";
import { CredentialsController } from "./credentials/credentials.controller";
import { DiscipleshipController } from "./discipleship/discipleship.controller";
import { GroupsController } from "./groups/groups.controller";
import { HealthController } from "./health.controller";
import { HouseholdsController } from "./households/households.controller";
import { LettersController } from "./letters/letters.controller";
import { MembershipsController } from "./memberships/memberships.controller";
import { MetaController } from "./meta/meta.controller";
import {
  MinistriesController,
  RosterAssignmentsController,
  RostersController,
  RosterSlotsController,
} from "./ministries/ministries.controller";
import { EventsController } from "./events/events.controller";
import { PastoralController } from "./pastoral/pastoral.controller";
import { PersonsController } from "./persons/persons.controller";
import { PublicPortalController } from "./public-portal/public-portal.controller";
import { TransfersController } from "./transfers/transfers.controller";
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

  it("MetaController", () => {
    const c = new MetaController();
    const meta = c.getMeta();
    expect(meta).toMatchObject({
      contractVersion: expect.any(String),
      apiPathPrefix: "",
      pilot: true,
      endpoints: expect.any(Object),
    });
    expect(meta.endpoints["GET /meta"]).toBe("implemented");
    expect(meta.endpoints["GET /households"]).toBe("implemented");
  });

  it("AuditController", async () => {
    const audit = {
      listRecent: jest.fn().mockResolvedValue({ logs: [] }),
    };
    const c = new AuditController(audit as never);
    await c.list(user, "10");
    expect(audit.listRecent).toHaveBeenCalledWith(user, 10);
    await c.list(user);
    expect(audit.listRecent).toHaveBeenCalledWith(user, 50);
  });

  it("TransfersController", async () => {
    const transfers = {
      list: jest.fn(),
      getById: jest.fn(),
      create: jest.fn(),
      advance: jest.fn(),
    };
    const c = new TransfersController(transfers as never);
    await c.list(user);
    await c.get(user, "t1");
    await c.create(user, { personId: "p1", toChurchId: "c2" });
    await c.advance(user, "t1", { decision: "APPROVE" });
    expect(transfers.advance).toHaveBeenCalledWith(user, "t1", {
      decision: "APPROVE",
    });
  });

  it("LettersController", async () => {
    const letters = {
      list: jest.fn(),
      create: jest.fn(),
      issue: jest.fn(),
      revoke: jest.fn(),
    };
    const c = new LettersController(letters as never);
    await c.list(user, "p1");
    await c.create(user, {
      personId: "p1",
      letterType: "MEMBRESIA",
      title: "t",
      bodyText: "b",
    });
    await c.issue(user, "L1");
    await c.revoke(user, "L1");
    expect(letters.issue).toHaveBeenCalledWith(user, "L1");
  });

  it("PastoralController", async () => {
    const pastoral = {
      create: jest.fn(),
      list: jest.fn(),
      getById: jest.fn(),
      updateStatus: jest.fn(),
      assign: jest.fn(),
      addTask: jest.fn(),
      updateTaskDone: jest.fn(),
    };
    const c = new PastoralController(pastoral as never);
    await c.create(user, { personId: "p1", kind: "VISITA", title: "x" });
    await c.list(user);
    await c.get(user, "pc1");
    await c.updateStatus(user, "pc1", { status: "DONE" });
    await c.assign(user, "pc1", { assignedToUserId: "u2" });
    await c.addTask(user, "pc1", { title: "task" });
    await c.updateTask(user, "pc1", "tk1", { done: true });
    expect(pastoral.updateTaskDone).toHaveBeenCalledWith(user, "pc1", "tk1", true);
  });

  it("DiscipleshipController", async () => {
    const discipleship = {
      createTrack: jest.fn(),
      listTracks: jest.fn(),
      enroll: jest.fn(),
      updateEnrollmentStatus: jest.fn(),
    };
    const c = new DiscipleshipController(discipleship as never);
    await c.createTrack(user, { name: "Fundamentos" });
    await c.listTracks(user);
    await c.enroll(user, { trackId: "tr1", personId: "p1" });
    await c.updateEnrollmentStatus(user, "e1", { status: "COMPLETED" });
    expect(discipleship.updateEnrollmentStatus).toHaveBeenCalledWith(
      user,
      "e1",
      "COMPLETED",
    );
  });

  it("GroupsController", async () => {
    const groups = {
      create: jest.fn(),
      list: jest.fn(),
      addMember: jest.fn(),
      createMeeting: jest.fn(),
    };
    const c = new GroupsController(groups as never);
    await c.create(user, { name: "Célula" });
    await c.list(user);
    await c.addMember(user, "g1", { personId: "p1", role: "MEMBER" });
    await c.createMeeting(user, "g1", {
      occurredAt: "2026-11-05T20:00:00Z",
      attendance: [{ personId: "p1", present: true }],
    });
    expect(groups.createMeeting).toHaveBeenCalled();
  });

  it("Ministries/Rosters controllers", async () => {
    const ministries = {
      createMinistry: jest.fn(),
      listMinistries: jest.fn(),
      getMinistry: jest.fn(),
      patchMinistry: jest.fn(),
      publishMinistry: jest.fn(),
      archiveMinistry: jest.fn(),
      createRoster: jest.fn(),
      listRosters: jest.fn(),
      addSlot: jest.fn(),
      addAssignment: jest.fn(),
      confirmAssignment: jest.fn(),
      declineAssignment: jest.fn(),
      substituteAssignment: jest.fn(),
    };
    const m = new MinistriesController(ministries as never);
    await m.create(user, { name: "Louvor", slug: "louvor" });
    await m.list(user);
    await m.get(user, "m1");
    await m.patch(user, "m1", { description: "x" });
    await m.publish(user, "m1");
    await m.archive(user, "m1");
    const r = new RostersController(ministries as never);
    await r.create(user, {
      title: "Culto",
      serviceAt: "2026-11-09T10:00:00Z",
    });
    await r.list(user);
    await r.addSlot(user, "ro1", { roleLabel: "Vocal" });
    const s = new RosterSlotsController(ministries as never);
    await s.addAssignment(user, "sl1", { personId: "p1" });
    const a = new RosterAssignmentsController(ministries as never);
    await a.confirm(user, "as1");
    await a.decline(user, "as1");
    await a.substitute(user, "as1", { personId: "p2" });
    expect(ministries.substituteAssignment).toHaveBeenCalled();
  });

  it("EventsController", async () => {
    const events = {
      create: jest.fn(),
      list: jest.fn(),
      get: jest.fn(),
      patch: jest.fn(),
      publish: jest.fn(),
      cancel: jest.fn(),
      archive: jest.fn(),
    };
    const c = new EventsController(events as never);
    await c.create(user, {
      name: "Encontro",
      slug: "encontro",
      startsAt: "2026-11-15T22:00:00Z",
    });
    await c.list(user);
    await c.get(user, "e1");
    await c.patch(user, "e1", { featuredOnHome: true });
    await c.publish(user, "e1");
    await c.cancel(user, "e1");
    await c.archive(user, "e1");
    expect(events.archive).toHaveBeenCalledWith(user, "e1");
  });

  it("PublicPortalController", async () => {
    const portal = {
      home: jest.fn().mockResolvedValue({ ministries: [] }),
      listMinistries: jest.fn(),
      getMinistryBySlug: jest.fn(),
      listEvents: jest.fn(),
      getEventBySlug: jest.fn(),
    };
    const c = new PublicPortalController(portal as never);
    await c.home();
    await c.listMinistries();
    await c.getMinistry("jovens");
    await c.listEvents();
    await c.getEvent("encontro-jovens-demo");
    expect(portal.getEventBySlug).toHaveBeenCalledWith("encontro-jovens-demo");
  });
});
