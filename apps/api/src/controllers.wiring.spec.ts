import { BadRequestException } from "@nestjs/common";
import { AdmissionsController } from "./admissions/admissions.controller";
import { AssetsController } from "./assets/assets.controller";
import { AuditController } from "./audit/audit.controller";
import { AuthController } from "./auth/auth.controller";
import { MfaController } from "./auth/mfa/mfa.controller";
import { OidcController } from "./auth/oidc/oidc.controller";
import { CredentialsController } from "./credentials/credentials.controller";
import { CoursesController } from "./courses/courses.controller";
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
  RosterCoupleExceptionsController,
  RostersController,
  RosterSlotsController,
  VolunteerAvailabilityController,
  VolunteerImpedimentsController,
} from "./ministries/ministries.controller";
import { ChannelsController } from "./channels/channels.controller";
import { ChurchesController } from "./churches/churches.controller";
import { CmsController } from "./cms/cms.controller";
import {
  EventPaymentWebhookController,
  EventsController,
  RegistrationsController,
} from "./events/events.controller";
import { FinanceController } from "./finance/finance.controller";
import { IndicatorsController } from "./indicators/indicators.controller";
import { ReportsController } from "./reports/reports.controller";
import { PastoralController } from "./pastoral/pastoral.controller";
import { PersonsController } from "./persons/persons.controller";
import { PublicPortalController } from "./public-portal/public-portal.controller";
import { TransfersController } from "./transfers/transfers.controller";
import { VolunteersController } from "./volunteers/volunteers.controller";
import { ViviController } from "./vivi/vivi.controller";
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
      findCandidates: jest.fn().mockResolvedValue({
        hits: [],
        strongMatch: false,
        autoMergeForbidden: true,
      }),
      getById: jest.fn().mockResolvedValue({ id: "p1" }),
      getDossier: jest.fn().mockResolvedValue({ person: { id: "p1" } }),
      patch: jest.fn().mockResolvedValue({ id: "p1" }),
    };
    const c = new PersonsController(persons as never);
    await c.search(user, "an", "5");
    expect(persons.search).toHaveBeenCalledWith(user, "an", 5);
    await c.candidates(user, { displayName: "Ana Demo", email: "a@example.test" });
    expect(persons.findCandidates).toHaveBeenCalledWith(user, {
      displayName: "Ana Demo",
      email: "a@example.test",
    });
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
      cancel: jest.fn(),
    };
    const documents = {
      list: jest.fn(),
      upload: jest.fn(),
      download: jest.fn(),
      remove: jest.fn(),
    };
    const c = new AdmissionsController(admissions as never, documents as never);
    await c.list(user, "DRAFT");
    await c.get(user, "a1");
    await c.create(user, { displayName: "X" } as never);
    await c.advance(user, "a1", { completeStep: "documents" } as never);
    await c.cancel(user, "a1", { notes: "demo" });
    await c.listDocuments(user, "a1");
    await c.deleteDocument(user, "a1", "d1");
    expect(admissions.list).toHaveBeenCalledWith(user, "DRAFT");
    expect(admissions.advance).toHaveBeenCalled();
    expect(admissions.cancel).toHaveBeenCalledWith(user, "a1", "demo");
    expect(documents.remove).toHaveBeenCalledWith(user, "a1", "d1");
  });

  it("CredentialsController", async () => {
    const credentials = {
      getOwn: jest.fn(),
      issue: jest.fn(),
      reissue: jest.fn(),
      revoke: jest.fn(),
      generatePdf: jest.fn(),
      getPdfMeta: jest.fn(),
      downloadPdf: jest.fn().mockResolvedValue({
        contentType: "application/pdf",
        displayName: "carteirinha-c1.pdf",
        bytes: Buffer.from("%PDF"),
      }),
      lookupByOpaqueToken: jest.fn(),
    };
    const c = new CredentialsController(credentials as never);
    await c.me(user);
    await c.issue(user, "m1");
    await c.reissue(user, "m1");
    await c.revoke(user, "c1");
    await c.generatePdf(user, "c1");
    await c.pdfMeta(user, "c1");
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    };
    await c.downloadPdf(user, "c1", res as never);
    await c.verify("token");
    expect(credentials.lookupByOpaqueToken).toHaveBeenCalledWith("token");
    expect(credentials.generatePdf).toHaveBeenCalledWith(user, "c1");
    expect(res.send).toHaveBeenCalled();
  });

  it("MfaController + OidcController", async () => {
    const mfa = {
      getStatus: jest.fn(),
      enrollTotp: jest.fn(),
      confirmTotp: jest.fn(),
      disableTotp: jest.fn(),
    };
    const mfaC = new MfaController(mfa as never);
    await mfaC.status(user);
    await mfaC.enroll(user, {});
    await mfaC.confirm(user, { code: "123456" });
    await mfaC.disable(user, {});
    expect(mfa.getStatus).toHaveBeenCalledWith(user);

    const oidc = {
      getConfig: jest.fn(),
      upsertConfig: jest.fn(),
      getAuthorizeInterface: jest.fn().mockReturnValue({ liveIdp: false }),
      handleCallbackInterface: jest.fn(),
    };
    const oidcC = new OidcController(oidc as never);
    await oidcC.getConfig(user);
    await oidcC.putConfig(user, { status: "CONFIGURED" });
    await oidcC.postConfig(user, { status: "CONFIGURED" });
    expect(oidcC.authorize()).toEqual({ liveIdp: false });
    oidcC.callback("code", "state", undefined);
    expect(oidc.handleCallbackInterface).toHaveBeenCalledWith({
      code: "code",
      state: "state",
      error: undefined,
    });
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
    expect(audit.listRecent).toHaveBeenCalledWith(user, 10, {
      churchId: undefined,
      scope: undefined,
    });
    await c.list(user, undefined, undefined, "organization");
    expect(audit.listRecent).toHaveBeenCalledWith(user, 50, {
      churchId: undefined,
      scope: "organization",
    });
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
      generatePdf: jest.fn(),
      getPdfMeta: jest.fn(),
      downloadPdf: jest.fn().mockResolvedValue({
        contentType: "application/pdf",
        displayName: "carta-L1-v1.pdf",
        bytes: Buffer.from("%PDF"),
      }),
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
    await c.generatePdf(user, "L1");
    await c.pdfMeta(user, "L1");
    expect(letters.issue).toHaveBeenCalledWith(user, "L1");
    expect(letters.generatePdf).toHaveBeenCalledWith(user, "L1");
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
      getRetentionPolicy: jest.fn(),
      upsertRetentionPolicy: jest.fn(),
      applyRetention: jest.fn(),
      exportCases: jest.fn(),
    };
    const c = new PastoralController(pastoral as never);
    await c.create(user, { personId: "p1", kind: "VISITA", title: "x" });
    await c.list(user);
    await c.getRetentionPolicy(user);
    await c.upsertRetentionPolicy(user, { closedCaseRetentionDays: 365 });
    await c.applyRetention(user);
    await c.exportCases(user, { personId: "p1" }, undefined, undefined, undefined, undefined);
    await c.get(user, "pc1");
    await c.updateStatus(user, "pc1", { status: "DONE" });
    await c.assign(user, "pc1", { assignedToUserId: "u2" });
    await c.addTask(user, "pc1", { title: "task" });
    await c.updateTask(user, "pc1", "tk1", { done: true });
    expect(pastoral.updateTaskDone).toHaveBeenCalledWith(user, "pc1", "tk1", true);
    expect(pastoral.exportCases).toHaveBeenCalledWith(user, {
      personId: "p1",
      from: undefined,
      to: undefined,
      status: undefined,
    });
  });

  it("CoursesController", async () => {
    const courses = {
      createCourse: jest.fn(),
      listCourses: jest.fn(),
      createClass: jest.fn(),
      listClasses: jest.fn(),
      enroll: jest.fn(),
      listEnrollments: jest.fn(),
      completeEnrollment: jest.fn(),
      createSession: jest.fn(),
      listSessions: jest.fn(),
    };
    const c = new CoursesController(courses as never);
    await c.createCourse(user, { name: "EBD" });
    await c.listCourses(user, "ACTIVE");
    await c.listEnrollments(user, undefined, "p1", undefined);
    await c.completeEnrollment(user, "e1", { issueCertificate: true });
    await c.listClassEnrollments(user, "cl1", undefined);
    await c.enroll(user, "cl1", { personId: "p1" });
    await c.createSession(user, "cl1", {
      occurredAt: "2026-11-07T20:00:00Z",
      attendances: [{ personId: "p1" }],
    });
    await c.listSessions(user, "cl1");
    await c.createClass(user, "c1", { name: "Turma A" });
    await c.listClasses(user, "c1");
    expect(courses.completeEnrollment).toHaveBeenCalledWith(user, "e1", {
      issueCertificate: true,
    });
  });

  it("AssetsController", async () => {
    const assets = {
      create: jest.fn(),
      list: jest.fn(),
      getById: jest.fn(),
      update: jest.fn(),
      listHistory: jest.fn(),
      addNote: jest.fn(),
    };
    const c = new AssetsController(assets as never);
    await c.create(user, { name: "Projetor", location: "Sala 1" });
    await c.list(user, "ch1", "ACTIVE");
    await c.get(user, "a1");
    await c.update(user, "a1", { status: "MAINTENANCE" });
    await c.history(user, "a1");
    await c.addNote(user, "a1", { note: "ok" });
    expect(assets.list).toHaveBeenCalledWith(user, {
      churchId: "ch1",
      status: "ACTIVE",
    });
  });

  it("DiscipleshipController", async () => {
    const discipleship = {
      createTrack: jest.fn(),
      listTracks: jest.fn(),
      createStage: jest.fn(),
      listStages: jest.fn(),
      enroll: jest.fn(),
      listEnrollments: jest.fn(),
      updateEnrollmentStatus: jest.fn(),
      recordProgress: jest.fn(),
      getProgress: jest.fn(),
    };
    const c = new DiscipleshipController(discipleship as never);
    await c.createTrack(user, { name: "Fundamentos" });
    await c.listTracks(user);
    await c.createStage(user, "tr1", { title: "Intro" });
    await c.listStages(user, "tr1");
    await c.enroll(user, { trackId: "tr1", personId: "p1" });
    await c.listEnrollments(user, "tr1", undefined, "ACTIVE");
    await c.updateEnrollmentStatus(user, "e1", { status: "COMPLETED" });
    await c.recordProgress(user, "e1", { stageId: "s1", kind: "COMPLETED" });
    await c.getProgress(user, "e1");
    expect(discipleship.updateEnrollmentStatus).toHaveBeenCalledWith(
      user,
      "e1",
      "COMPLETED",
    );
    expect(discipleship.recordProgress).toHaveBeenCalledWith(user, "e1", {
      stageId: "s1",
      kind: "COMPLETED",
    });
  });

  it("GroupsController", async () => {
    const groups = {
      create: jest.fn(),
      list: jest.fn(),
      frequencyReport: jest.fn(),
      addMember: jest.fn(),
      createMeeting: jest.fn(),
    };
    const c = new GroupsController(groups as never);
    await c.create(user, { name: "Célula" });
    await c.list(user);
    await c.frequencyReport(
      user,
      "2026-11-01T00:00:00Z",
      "2026-11-30T00:00:00Z",
      "g1",
    );
    await c.addMember(user, "g1", { personId: "p1", role: "MEMBER" });
    await c.createMeeting(user, "g1", {
      occurredAt: "2026-11-05T20:00:00Z",
      attendance: [{ personId: "p1", present: true }],
    });
    expect(groups.createMeeting).toHaveBeenCalled();
    expect(groups.frequencyReport).toHaveBeenCalledWith(user, {
      from: "2026-11-01T00:00:00Z",
      to: "2026-11-30T00:00:00Z",
      groupId: "g1",
    });
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
      publishRoster: jest.fn(),
      closeRoster: jest.fn(),
      addSlot: jest.fn(),
      addAssignment: jest.fn(),
      confirmAssignment: jest.fn(),
      declineAssignment: jest.fn(),
      substituteAssignment: jest.fn(),
      resendAssignmentAlert: jest.fn(),
      createAvailability: jest.fn(),
      listAvailability: jest.fn(),
      deactivateAvailability: jest.fn(),
      createImpediment: jest.fn(),
      listImpediments: jest.fn(),
      deleteImpediment: jest.fn(),
      simulateCoupleException: jest.fn(),
      configureCoupleException: jest.fn(),
      listCoupleExceptions: jest.fn(),
      approveCoupleException: jest.fn(),
      rejectCoupleException: jest.fn(),
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
    await r.publish(user, "ro1");
    await r.close(user, "ro1");
    await r.addSlot(user, "ro1", { roleLabel: "Vocal" });
    const s = new RosterSlotsController(ministries as never);
    await s.addAssignment(user, "sl1", { personId: "p1" });
    const a = new RosterAssignmentsController(ministries as never);
    await a.confirm(user, "as1");
    await a.decline(user, "as1");
    await a.substitute(user, "as1", { personId: "p2" });
    await a.resendAlert(user, "as1", { kind: "confirm" });
    const av = new VolunteerAvailabilityController(ministries as never);
    await av.create(user, {
      personId: "p1",
      weekday: 0,
      startMinute: 0,
      endMinute: 60,
    });
    await av.list(user, "p1");
    await av.deactivate(user, "av1");
    const im = new VolunteerImpedimentsController(ministries as never);
    await im.create(user, {
      personId: "p1",
      startsAt: "2026-11-09T00:00:00Z",
      endsAt: "2026-11-10T00:00:00Z",
    });
    await im.list(user, "p1");
    await im.remove(user, "imp1");
    const ce = new RosterCoupleExceptionsController(ministries as never);
    await ce.simulate(user, { personId: "p1", reason: "solo" });
    await ce.configure(user, { personId: "p1", reason: "solo" });
    await ce.list(user, "APPROVED", "p1");
    await ce.approve(user, "ex1");
    await ce.reject(user, "ex1");
    expect(ministries.publishRoster).toHaveBeenCalledWith(user, "ro1");
    expect(ministries.closeRoster).toHaveBeenCalledWith(user, "ro1");
    expect(ministries.substituteAssignment).toHaveBeenCalled();
    expect(ministries.resendAssignmentAlert).toHaveBeenCalled();
    expect(ministries.simulateCoupleException).toHaveBeenCalled();
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
    const registrations = {
      createModality: jest.fn(),
      listModalities: jest.fn(),
      createLot: jest.fn(),
      listLots: jest.fn(),
      createLodgingOption: jest.fn(),
      listLodgingOptions: jest.fn(),
      createMealOption: jest.fn(),
      listMealOptions: jest.fn(),
      createTransportOption: jest.fn(),
      listTransportOptions: jest.fn(),
      listRegistrations: jest.fn(),
      createStaffRegistration: jest.fn(),
      checkIn: jest.fn(),
      cancel: jest.fn(),
      setGuardianAuthorization: jest.fn(),
      handleMockPaymentWebhook: jest.fn(),
    };
    const c = new EventsController(events as never, registrations as never);
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
    await c.createModality(user, "e1", { code: "ind", name: "Individual" });
    await c.listModalities(user, "e1");
    await c.createLot(user, "e1", { code: "l1", name: "Lote 1", priceCents: 0 });
    await c.listLots(user, "e1");
    await c.createLodgingOption(user, "e1", {
      code: "familia",
      name: "Quarto família",
      kind: "FAMILY",
    });
    await c.listLodgingOptions(user, "e1");
    await c.createMealOption(user, "e1", {
      code: "full",
      name: "Pensão completa",
      kind: "FULL_BOARD",
    });
    await c.listMealOptions(user, "e1");
    await c.createTransportOption(user, "e1", {
      code: "bus",
      name: "Ônibus",
      kind: "EVENT_BUS",
    });
    await c.listTransportOptions(user, "e1");
    await c.listRegistrations(user, "e1");
    await c.createRegistration(user, "e1", {
      displayName: "Demo",
      modalityId: "mod1",
    });
    expect(events.archive).toHaveBeenCalledWith(user, "e1");
    expect(registrations.createStaffRegistration).toHaveBeenCalled();
    expect(registrations.createLodgingOption).toHaveBeenCalled();

    const r = new RegistrationsController(registrations as never);
    await r.checkIn(user, "reg1", {});
    await r.cancel(user, "reg1");
    await r.setGuardianAuthorization(user, "reg1", { status: "AUTHORIZED" });
    expect(registrations.checkIn).toHaveBeenCalledWith(user, "reg1", undefined);
    expect(registrations.setGuardianAuthorization).toHaveBeenCalled();

    const wh = new EventPaymentWebhookController(registrations as never);
    await wh.mockConfirm("sig", "idem-12345678", {
      paymentIntentId: "pi1",
      status: "CONFIRMED_MOCK",
    });
    expect(registrations.handleMockPaymentWebhook).toHaveBeenCalled();
  });

  it("PublicPortalController", async () => {
    const portal = {
      home: jest.fn().mockResolvedValue({ ministries: [] }),
      listMinistries: jest.fn(),
      getMinistryBySlug: jest.fn(),
      listEvents: jest.fn(),
      getEventBySlug: jest.fn().mockResolvedValue({ id: "e1", slug: "encontro-jovens-demo" }),
      getContentBySlug: jest.fn(),
    };
    const registrations = {
      publicCatalogForEvent: jest.fn().mockResolvedValue({
        modalities: [],
        lots: [],
        lodgingOptions: [],
        mealOptions: [],
        transportOptions: [],
        paymentMode: "MOCK_ONLY",
        rf022LodgingPending: false,
        requiresLodgingOption: false,
        requiresMealOption: false,
        requiresTransportOption: false,
        requiresGuardianAuthorizationForMinors: true,
      }),
      createPublicRegistration: jest.fn(),
      getPublicRegistrationStatus: jest.fn(),
    };
    const c = new PublicPortalController(
      portal as never,
      { published: jest.fn() } as never,
      registrations as never,
    );
    await c.publishedSiteLayout();
    await c.home();
    await c.listMinistries();
    await c.getMinistry("jovens");
    await c.listEvents();
    await c.getEvent("encontro-jovens-demo");
    await c.createRegistration("encontro-jovens-demo", {
      displayName: "Demo",
      modalityId: "mod1",
      lotId: "lot1",
    });
    await c.registrationStatus("abc123code");
    await c.getContent("sobre-nos");
    expect(portal.getContentBySlug).toHaveBeenCalledWith("sobre-nos");
    expect(registrations.createPublicRegistration).toHaveBeenCalled();
  });

  it("CmsController", async () => {
    const cms = {
      create: jest.fn(),
      list: jest.fn(),
      get: jest.fn(),
      patch: jest.fn(),
    };
    const c = new CmsController(cms as never);
    await c.create(user, { kind: "PAGE", slug: "sobre", title: "Sobre" });
    await c.list(user, "PAGE");
    await c.get(user, "c1");
    await c.patch(user, "c1", { status: "REVISAO" });
    await c.advance(user, "c1", { toStatus: "APROVADO" });
    expect(cms.patch).toHaveBeenCalled();
  });

  it("VolunteersController", async () => {
    const volunteers = {
      submitPublicInterest: jest.fn(),
      listAdmin: jest.fn(),
      getAdmin: jest.fn(),
      advance: jest.fn(),
    };
    const c = new VolunteersController(volunteers as never);
    await c.submitPublic({
      displayName: "Vol",
      email: "vol@example.test",
    });
    await c.list(user, "m1");
    await c.get(user, "vi1");
    await c.advance(user, "vi1", { stage: "AVALIACAO" });
    expect(volunteers.advance).toHaveBeenCalled();
  });

  it("FinanceController", async () => {
    const finance = {
      listBankAdapters: jest.fn(),
      listAccounts: jest.fn(),
      createAccount: jest.fn(),
      getAccount: jest.fn(),
      patchAccount: jest.fn(),
      listFunds: jest.fn(),
      createFund: jest.fn(),
      patchFund: jest.fn(),
      listCostCenters: jest.fn(),
      createCostCenter: jest.fn(),
      patchCostCenter: jest.fn(),
      listEntries: jest.fn(),
      createEntry: jest.fn(),
      getEntry: jest.fn(),
      submitEntry: jest.fn(),
      approveEntry: jest.fn(),
      rejectEntry: jest.fn(),
      reverseEntry: jest.fn(),
      listAttachments: jest.fn(),
      uploadAttachment: jest.fn(),
      downloadAttachment: jest.fn(),
      removeAttachment: jest.fn(),
      listImports: jest.fn(),
      createImport: jest.fn(),
      getImport: jest.fn(),
      listBudgets: jest.fn(),
      createBudget: jest.fn(),
      getBudget: jest.fn(),
      patchBudget: jest.fn(),
      addBudgetLine: jest.fn(),
      listPeriods: jest.fn(),
      openPeriod: jest.fn(),
      closePeriod: jest.fn(),
      listReconciliations: jest.fn(),
      createReconciliation: jest.fn(),
      getReconciliation: jest.fn(),
      submitReconciliation: jest.fn(),
      approveReconciliation: jest.fn(),
      closeReconciliation: jest.fn(),
      matchBankLine: jest.fn(),
      unmatchBankLine: jest.fn(),
    };
    const c = new FinanceController(finance as never);
    c.listBankAdapters();
    await c.listAccounts(user);
    await c.createAccount(user, {
      code: "1.1.01",
      name: "Caixa",
      type: "ASSET",
    });
    await c.getAccount(user, "a1");
    await c.patchAccount(user, "a1", { active: false });
    await c.listFunds(user);
    await c.createFund(user, { code: "MISSOES", name: "Missões" });
    await c.patchFund(user, "f1", { active: true });
    await c.listCostCenters(user);
    await c.createCostCenter(user, { code: "ADM", name: "Admin" });
    await c.patchCostCenter(user, "cc1", { name: "Adm" });
    await c.listEntries(user, "DRAFT");
    await c.createEntry(user, {
      entryDate: "2026-11-01",
      description: "Oferta",
      lines: [
        { accountId: "a1", side: "DEBIT", amountCents: 100 },
        { accountId: "a2", side: "CREDIT", amountCents: 100 },
      ],
    });
    await c.getEntry(user, "e1");
    await c.submitEntry(user, "e1");
    await c.approveEntry(user, "e1");
    await c.rejectEntry(user, "e1", { reason: "x" });
    await c.reverseEntry(user, "e1");
    await c.listAttachments(user, "e1");
    await c.uploadAttachment(user, "e1", {
      originalname: "recibo.pdf",
      mimetype: "application/pdf",
      buffer: Buffer.from("%PDF"),
      size: 4,
    } as never);
    finance.downloadAttachment.mockResolvedValue({
      bytes: Buffer.from("%PDF"),
      contentType: "application/pdf",
      displayName: "recibo.pdf",
    });
    const res = { setHeader: jest.fn() };
    await c.downloadAttachment(user, "e1", "att1", res as never);
    await c.removeAttachment(user, "e1", "att1");
    expect(() => c.uploadAttachment(user, "e1", undefined)).toThrow(
      BadRequestException,
    );
    await c.listImports(user);
    await c.createImport(user, { format: "OFX", filename: "x.ofx" });
    await c.getImport(user, "b1");
    await c.listBudgets(user, "2026");
    await c.createBudget(user, { year: 2026, title: "Orc" });
    await c.getBudget(user, "b1");
    await c.patchBudget(user, "b1", { status: "ACTIVE" });
    await c.addBudgetLine(user, "b1", {
      accountId: "a1",
      plannedCents: 1000,
    });
    await c.listPeriods(user);
    await c.openPeriod(user, { year: 2026, month: 11 });
    await c.closePeriod(user, "p1");
    await c.listReconciliations(user);
    await c.createReconciliation(user, {
      title: "Nov",
      periodStart: "2026-11-01",
      periodEnd: "2026-11-30",
    });
    await c.getReconciliation(user, "r1");
    await c.submitReconciliation(user, "r1");
    await c.approveReconciliation(user, "r1");
    await c.closeReconciliation(user, "r1");
    await c.matchBankLine(user, "bl1", {
      entryId: "e1",
      reconciliationId: "r1",
    });
    await c.unmatchBankLine(user, "bl1");
    expect(finance.closeReconciliation).toHaveBeenCalledWith(user, "r1");
    expect(finance.matchBankLine).toHaveBeenCalledWith(user, "bl1", {
      entryId: "e1",
      reconciliationId: "r1",
    });
    expect(finance.unmatchBankLine).toHaveBeenCalledWith(user, "bl1");
    expect(finance.createFund).toHaveBeenCalled();
    expect(finance.openPeriod).toHaveBeenCalled();
  });

  it("ChannelsController", async () => {
    const channels = {
      providerModes: jest.fn().mockReturnValue({ liveWaba: false, liveFcm: false }),
      rateLimitStatus: jest.fn(),
      createTemplate: jest.fn(),
      listTemplates: jest.fn(),
      patchTemplate: jest.fn(),
      getConsent: jest.fn(),
      upsertConsent: jest.fn(),
      registerDeviceToken: jest.fn(),
      listDeviceTokens: jest.fn(),
      revokeDeviceToken: jest.fn(),
      enqueue: jest.fn(),
      enqueuePushFanout: jest.fn(),
      listOutbox: jest.fn(),
      getOutbox: jest.fn(),
      dispatchOne: jest.fn(),
      dispatchPending: jest.fn(),
      resendOutbox: jest.fn(),
    };
    const c = new ChannelsController(channels as never);
    c.providers();
    await c.rateLimits(user);
    await c.createTemplate(user, {
      channel: "EMAIL",
      code: "welcome",
      name: "Boas-vindas",
      body: "Olá",
    });
    await c.listTemplates(user, "EMAIL");
    await c.patchTemplate(user, "t1", { active: false });
    await c.getMyConsent(user);
    await c.upsertMyConsent(user, { pushOptIn: true });
    await c.getConsent(user, "p1");
    await c.upsertConsent(user, "p1", { emailOptIn: true });
    await c.registerDeviceToken(user, {
      token: "fcm-token-wiring-01",
      platform: "ANDROID",
    });
    await c.listDeviceTokens(user, undefined, undefined);
    await c.revokeDeviceToken(user, "dt1");
    await c.enqueue(user, {
      channel: "EMAIL",
      toAddress: "a@example.test",
      body: "oi",
      skipConsentCheck: true,
    });
    await c.enqueuePushFanout(user, { personId: "p1", body: "push" });
    await c.listOutbox(user, "PENDING", "EMAIL", "10");
    await c.getOutbox(user, "o1");
    await c.dispatchOne(user, "o1");
    await c.dispatchPending(user, { limit: 5 });
    await c.resendOutbox(user, {
      sourceType: "roster_assignment",
      sourceId: "a1:confirm",
    });
    expect(channels.dispatchPending).toHaveBeenCalledWith(user, 5);
    expect(channels.resendOutbox).toHaveBeenCalled();
    expect(channels.registerDeviceToken).toHaveBeenCalled();
    expect(channels.revokeDeviceToken).toHaveBeenCalledWith(user, "dt1");
    expect(channels.enqueuePushFanout).toHaveBeenCalled();
  });



  it("ChurchesController", async () => {
    const churches = {
      listAccessible: jest.fn().mockResolvedValue({ churches: [] }),
    };
    const c = new ChurchesController(churches as never);
    await c.list(user);
    expect(churches.listAccessible).toHaveBeenCalledWith(user);
  });

  it("IndicatorsController", async () => {
    const indicators = {
      summary: jest.fn().mockResolvedValue({ stub: false }),
      membership: jest.fn().mockResolvedValue({ stub: false }),
    };
    const c = new IndicatorsController(indicators as never);
    await c.summary(user, "ch1", undefined);
    await c.membership(user, "ch1");
    expect(indicators.summary).toHaveBeenCalledWith(user, {
      churchId: "ch1",
      scope: undefined,
    });
    expect(indicators.membership).toHaveBeenCalledWith(user, "ch1");
  });

  it("ReportsController", async () => {
    const reports = {
      participation: jest.fn().mockResolvedValue({ counts: { registrations: 0 } }),
      membership: jest.fn().mockResolvedValue({ byStatus: {} }),
      ministries: jest.fn().mockResolvedValue({
        formalMembership: { blocked: true, members: null },
      }),
    };
    const c = new ReportsController(reports as never);
    await c.participation(user, "e1", "CHECKED_IN", "m1", "2026-11-01", "2026-11-30");
    await c.membership(user);
    await c.ministries(user, "m1");
    expect(reports.participation).toHaveBeenCalledWith(user, {
      eventId: "e1",
      status: "CHECKED_IN",
      ministryId: "m1",
      from: "2026-11-01",
      to: "2026-11-30",
    });
    expect(reports.membership).toHaveBeenCalledWith(user, {
      from: undefined,
      to: undefined,
    });
    expect(reports.ministries).toHaveBeenCalledWith(user, "m1", {
      from: undefined,
      to: undefined,
    });
  });

  it("ViviController", async () => {
    const vivi = {
      getStatus: jest.fn().mockReturnValue({ assistant: "vivi" }),
      chatPublic: jest.fn().mockResolvedValue({ reply: "oi" }),
      chatAdmin: jest.fn().mockResolvedValue({ reply: "oi" }),
    };
    const c = new ViviController(vivi as never);
    expect(c.status()).toEqual({ assistant: "vivi" });
    await c.chatPublic(
      {
        messages: [{ role: "user", content: "Oi" }],
        consentAiProcessing: true,
      },
      { ip: "127.0.0.1", headers: {}, socket: {} } as never,
    );
    expect(vivi.chatPublic).toHaveBeenCalled();
    await c.chatAdmin(user, {
      messages: [{ role: "user", content: "Oi" }],
    });
    expect(vivi.chatAdmin).toHaveBeenCalledWith(user, {
      messages: [{ role: "user", content: "Oi" }],
    });
  });
});
