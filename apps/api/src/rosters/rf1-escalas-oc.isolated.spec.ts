/**
 * Prova de janeiro/2027 em Postgres local e descartável.
 * Só roda com RUN_RF1_ISOLATED_DB=1 e banco local idbrf_rf1_isolated (ou o Postgres efêmero do CI, usuário idbrf_ci).
 * Não usa Neon, QA compartilhada, HML nem produção. Não envia e-mail nem WhatsApp.
 */
import { PILOT_CHURCH_SLUG, PILOT_ORG_SLUG, ROLE_CODES } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { MinistriesService } from "../ministries/ministries.service";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";
import { ServiceOrderPlannerService } from "../service-orders/service-order-planner.service";
import { ServiceOrdersService } from "../service-orders/service-orders.service";
import { churchDayKey } from "./church-day";
import { PersonalRosterService } from "./personal-roster.service";
import { substitutionInviteLimit } from "./roster-substitution-invites";

const MONTH = "2027-01";
const LOUVOR_COUNT = 34;

function isolatedTarget(): "wipe" | null {
  if (process.env.RUN_RF1_ISOLATED_DB !== "1") return null;
  const raw = process.env.DATABASE_URL ?? "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) return null;
  if (/neon\.tech|vercel|hostinger|amazonaws|supabase|render\.com/i.test(raw)) return null;
  const name = url.pathname.replace(/^\//, "");
  if (name === "idbrf_rf1_isolated") return "wipe";
  if (name === "idbrf" && url.username === "idbrf_ci") return "wipe";
  return null;
}

const enabled = isolatedTarget() !== null;

type Preview = {
  revision: string;
  rosters: Array<{
    id: string;
    moduleId: string;
    moduleName: string;
    serviceAt: string;
    positions: Array<{ roleLabel: string; personId: string | null; reasons: string[] }>;
  }>;
};

function actor(userId: string, personId: string, role: string, ministryId?: string): AuthUser {
  return {
    userId,
    personId,
    email: `${userId}@example.test`,
    organizationId: "rf1iso_org",
    churchId: "rf1iso_church",
    grants: [{
      roleCode: role,
      organizationId: "rf1iso_org",
      churchId: "rf1iso_church",
      ...(ministryId ? { ministryId } : {}),
    }],
  };
}

function httpOf(error: unknown): { status: number; code?: string } {
  if (typeof error === "object" && error && "getStatus" in error && typeof error.getStatus === "function") {
    const body = "getResponse" in error && typeof error.getResponse === "function" ? error.getResponse() : undefined;
    const code = body && typeof body === "object" && "code" in body ? String(body.code) : undefined;
    return { status: error.getStatus(), code };
  }
  throw error;
}

async function expectHttp(work: Promise<unknown>, status: number, code?: string) {
  try {
    await work;
  } catch (error) {
    const http = httpOf(error);
    expect(http.status).toBe(status);
    if (code) expect(http.code).toBe(code);
    return;
  }
  throw new Error(`esperava HTTP ${status}`);
}

(enabled ? describe : describe.skip)("RF1 isolado — escalas e ordem do culto", () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaService();
  const pilot = new PilotService(prisma);
  const rosters = new PersonalRosterService(prisma, pilot);
  const ministries = new MinistriesService(prisma, pilot);
  const orders = new ServiceOrdersService(prisma, pilot);
  const planner = new ServiceOrderPlannerService(prisma, pilot);

  const louvorLeader = actor("rf1iso_u_louvor_lider", "rf1iso_p_louvor_lider", ROLE_CODES.LIDER_MINISTERIO, "rf1iso_min_louvor");
  const atmosferaLeader = actor("rf1iso_u_atm_lider", "rf1iso_p_atm_lider", ROLE_CODES.LIDER_MINISTERIO, "rf1iso_min_atm");
  const moduleLeader = actor("rf1iso_u_mod_recepcao", "rf1iso_p_mod_recepcao", ROLE_CODES.LIDER_MINISTERIO, "rf1iso_min_atm");
  const admin = actor("rf1iso_u_admin", "rf1iso_p_admin", ROLE_CODES.PLATFORM_ADMIN);
  const pastor = actor("rf1iso_u_pastor", "rf1iso_p_pastor", ROLE_CODES.PASTOR);
  const member = actor("rf1iso_u_l01", "rf1iso_p_l01", ROLE_CODES.MEMBRO);
  const media = actor("rf1iso_u_media", "rf1iso_p_media", ROLE_CODES.MEMBRO);
  const louvorIds = Array.from({ length: LOUVOR_COUNT }, (_, index) => `rf1iso_p_l${String(index + 1).padStart(2, "0")}`);

  beforeAll(async () => {
    process.env.EKLESIA_ENABLE_ROSTER_NOTIFICATIONS = "false";
    delete process.env.ROSTER_WHATSAPP_DEV_APPROVED;
    delete process.env.WHATSAPP_PROVIDER;
    await prisma.$connect();
    await prisma.$executeRawUnsafe(`
      DO $$ DECLARE r RECORD;
      BEGIN
        FOR r IN (
          SELECT tablename FROM pg_tables
          WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
        ) LOOP
          EXECUTE 'TRUNCATE TABLE public.' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;
      END $$;
    `);

    await prisma.organization.create({ data: { id: "rf1iso_org", name: "Organização sintética RF1", slug: PILOT_ORG_SLUG } });
    await prisma.church.create({ data: { id: "rf1iso_church", organizationId: "rf1iso_org", name: "Congregação sintética", slug: PILOT_CHURCH_SLUG } });
    await prisma.role.createMany({ data: [
      { id: "rf1iso_role_admin", code: ROLE_CODES.PLATFORM_ADMIN, name: "Admin" },
      { id: "rf1iso_role_pastor", code: ROLE_CODES.PASTOR, name: "Pastor" },
      { id: "rf1iso_role_lider", code: ROLE_CODES.LIDER_MINISTERIO, name: "Líder" },
      { id: "rf1iso_role_membro", code: ROLE_CODES.MEMBRO, name: "Membro" },
    ] });

    const people = [
      ["rf1iso_p_louvor_lider", "Líder Louvor sintético"],
      ["rf1iso_p_atm_lider", "Líder Atmosfera sintético"],
      ["rf1iso_p_mod_recepcao", "Líder Módulo Recepção sintético"],
      ["rf1iso_p_admin", "Admin sintético"],
      ["rf1iso_p_pastor", "Pastor sintético"],
      ["rf1iso_p_media", "Mídia sintética"],
      ...louvorIds.map((id, index) => [id, `Voluntário Louvor ${String(index + 1).padStart(2, "0")}`] as [string, string]),
      ...["01", "02", "03", "04", "05"].map(n => [`rf1iso_p_recepcao_${n}`, `Voluntário Recepção ${n}`] as [string, string]),
      ...["01", "02", "03", "04"].map(n => [`rf1iso_p_conexao_${n}`, `Voluntário Conexão ${n}`] as [string, string]),
      ...["01", "02", "03", "04"].map(n => [`rf1iso_p_ceia_${n}`, `Voluntário Ceia ${n}`] as [string, string]),
    ];
    await prisma.person.createMany({ data: people.map(([id, displayName]) => ({
      id, organizationId: "rf1iso_org", homeChurchId: "rf1iso_church", displayName, kind: "MEMBER", status: "ACTIVE",
    })) });
    await prisma.user.createMany({ data: people.map(([id]) => ({
      id: id.replace("rf1iso_p_", "rf1iso_u_"), personId: id, email: `${id}@example.test`, status: "ACTIVE",
    })) });
    await prisma.churchMembership.createMany({ data: ["rf1iso_p_pastor", "rf1iso_p_media"].map(personId => ({
      id: `rf1iso_cm_${personId}`, personId, churchId: "rf1iso_church", organizationId: "rf1iso_org", status: "ACTIVE",
      ecclesiasticalRoles: personId.endsWith("pastor") ? ["PASTOR"] : [],
    })) });

    await prisma.ministry.createMany({ data: [
      { id: "rf1iso_min_louvor", organizationId: "rf1iso_org", churchId: "rf1iso_church", name: "Louvor sintético", slug: "louvor", leaderPersonId: "rf1iso_p_louvor_lider" },
      { id: "rf1iso_min_atm", organizationId: "rf1iso_org", churchId: "rf1iso_church", name: "Atmosfera sintética", slug: "atmosfera", leaderPersonId: "rf1iso_p_atm_lider" },
    ] });

    const equipe = [{ label: "Equipe de Louvor", count: 7, couple: false }];
    const manha = [{ label: "Bateria", count: 1, couple: false, qualification: "bateria" }, { label: "Equipe de Louvor", count: 6, couple: false }];
    await prisma.ministryRosterModule.create({ data: {
      id: "rf1iso_mod_louvor", ministryId: "rf1iso_min_louvor", name: "Louvor", nameKey: "louvor",
      rules: {
        positions: { thursday_evening: equipe, sunday_morning: manha, sunday_evening: equipe },
        qualifications: { bateria: ["rf1iso_p_l01"] }, couples: [],
        minIntervalDays: 7, maxMonthlyAssignments: 4, substituteInviteLimit: 0,
      },
    } });
    await prisma.ministryRosterModule.createMany({ data: [
      { id: "rf1iso_mod_recepcao", ministryId: "rf1iso_min_atm", name: "Recepção", nameKey: "recepcao", rules: {} },
      { id: "rf1iso_mod_conexao", ministryId: "rf1iso_min_atm", name: "Conexão", nameKey: "conexao", rules: {} },
      { id: "rf1iso_mod_ceia", ministryId: "rf1iso_min_atm", name: "Santa Ceia", nameKey: "ceia", rules: { communionStages: 1 } },
    ] });

    const memberships = [
      ...louvorIds.map(personId => ({ personId, ministryId: "rf1iso_min_louvor", moduleId: "rf1iso_mod_louvor" })),
      { personId: "rf1iso_p_mod_recepcao", ministryId: "rf1iso_min_atm", moduleId: "rf1iso_mod_recepcao" },
      ...["01", "02", "03", "04", "05"].map(n => ({ personId: `rf1iso_p_recepcao_${n}`, ministryId: "rf1iso_min_atm", moduleId: "rf1iso_mod_recepcao" })),
      ...["01", "02", "03", "04"].map(n => ({ personId: `rf1iso_p_conexao_${n}`, ministryId: "rf1iso_min_atm", moduleId: "rf1iso_mod_conexao" })),
      ...["01", "02", "03", "04"].map(n => ({ personId: `rf1iso_p_ceia_${n}`, ministryId: "rf1iso_min_atm", moduleId: "rf1iso_mod_ceia" })),
    ];
    await prisma.ministryMembership.createMany({ data: memberships.map(item => ({
      id: `rf1iso_mm_${item.personId}`, organizationId: "rf1iso_org", churchId: "rf1iso_church",
      ministryId: item.ministryId, personId: item.personId, role: "APOIO", status: "ATIVO",
    })) });
    await prisma.ministryRosterModuleMembership.createMany({ data: memberships.map(item => ({
      id: `rf1iso_link_${item.personId}`, organizationId: "rf1iso_org", churchId: "rf1iso_church",
      ministryId: item.ministryId, moduleId: item.moduleId, membershipId: `rf1iso_mm_${item.personId}`, personId: item.personId, status: "ATIVO",
    })) });
    await prisma.ministryRosterModuleLeader.create({ data: {
      id: "rf1iso_lead_recepcao", organizationId: "rf1iso_org", churchId: "rf1iso_church",
      ministryId: "rf1iso_min_atm", moduleId: "rf1iso_mod_recepcao", personId: "rf1iso_p_mod_recepcao",
    } });

    await prisma.grant.createMany({ data: [
      { id: "rf1iso_g_admin", userId: "rf1iso_u_admin", roleId: "rf1iso_role_admin", organizationId: "rf1iso_org", churchId: "rf1iso_church" },
      { id: "rf1iso_g_pastor", userId: "rf1iso_u_pastor", roleId: "rf1iso_role_pastor", organizationId: "rf1iso_org", churchId: "rf1iso_church" },
      { id: "rf1iso_g_media", userId: "rf1iso_u_media", roleId: "rf1iso_role_membro", organizationId: "rf1iso_org", churchId: "rf1iso_church" },
      { id: "rf1iso_g_louvor", userId: "rf1iso_u_louvor_lider", roleId: "rf1iso_role_lider", organizationId: "rf1iso_org", churchId: "rf1iso_church", ministryId: "rf1iso_min_louvor" },
      { id: "rf1iso_g_atm", userId: "rf1iso_u_atm_lider", roleId: "rf1iso_role_lider", organizationId: "rf1iso_org", churchId: "rf1iso_church", ministryId: "rf1iso_min_atm" },
      { id: "rf1iso_g_mod", userId: "rf1iso_u_mod_recepcao", roleId: "rf1iso_role_lider", organizationId: "rf1iso_org", churchId: "rf1iso_church", ministryId: "rf1iso_min_atm" },
      ...louvorIds.map(personId => ({
        id: `rf1iso_g_${personId}`, userId: personId.replace("rf1iso_p_", "rf1iso_u_"), roleId: "rf1iso_role_membro",
        organizationId: "rf1iso_org", churchId: "rf1iso_church",
      })),
    ] });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("gera janeiro/2027 do Louvor com 34 integrantes, 14 cultos e qualificação, sem timeout", async () => {
    await expectHttp(rosters.monthlySimulation(member, "rf1iso_min_louvor", { month: MONTH }), 403, "MINISTRY_SCOPE_FORBIDDEN");
    const started = Date.now();
    const preview = await rosters.monthlySimulation(louvorLeader, "rf1iso_min_louvor", { month: MONTH }) as Preview;
    expect(Date.now() - started).toBeLessThan(8_000);
    expect(preview.rosters).toHaveLength(14);
    expect(preview.rosters.every(roster => roster.positions.length === 7)).toBe(true);
    expect(preview.rosters.every(roster => roster.positions.some(position => position.personId))).toBe(true);
    const sundays = new Map<string, string[]>();
    for (const roster of preview.rosters) {
      const day = churchDayKey(new Date(roster.serviceAt));
      if (new Date(roster.serviceAt).getUTCDay() === 0 || roster.positions.some(position => position.roleLabel === "Bateria")) {
        const ids = roster.positions.flatMap(position => position.personId ? [position.personId] : []);
        sundays.set(day, [...(sundays.get(day) ?? []), ...ids]);
      }
      for (const position of roster.positions.filter(item => item.roleLabel === "Bateria" && item.personId)) {
        expect(position.personId).toBe("rf1iso_p_l01");
      }
    }
    expect(preview.rosters.some(roster => roster.positions.some(position => position.roleLabel === "Bateria" && position.personId === "rf1iso_p_l01"))).toBe(true);
    for (const ids of sundays.values()) expect(new Set(ids).size).toBe(ids.length);
    const counts = new Map<string, number>();
    for (const roster of preview.rosters) {
      for (const position of roster.positions) {
        if (!position.personId) continue;
        counts.set(position.personId, (counts.get(position.personId) ?? 0) + 1);
      }
    }
    for (const count of counts.values()) expect(count).toBeLessThanOrEqual(4);
    expect(counts.size).toBeGreaterThan(0);

    const settled = await Promise.allSettled([
      rosters.saveMonth(louvorLeader, "rf1iso_min_louvor", MONTH, { fingerprint: preview.revision }),
      rosters.saveMonth(louvorLeader, "rf1iso_min_louvor", MONTH, { fingerprint: preview.revision }),
    ]);
    expect(settled.some(item => item.status === "fulfilled")).toBe(true);
    const again = await rosters.saveMonth(louvorLeader, "rf1iso_min_louvor", MONTH, { fingerprint: preview.revision });
    expect(again.savedRosters).toBe(0);
    const drafts = await prisma.roster.findMany({
      where: { ministryId: "rf1iso_min_louvor" },
      include: { slots: { include: { assignments: true } } },
    });
    expect(drafts).toHaveLength(14);
    expect(drafts.every(roster => roster.status === "DRAFT")).toBe(true);
    for (const roster of drafts) {
      for (const slot of roster.slots) {
        expect(slot.assignments.filter(item => item.status === "PENDING" || item.status === "CONFIRMED")).toHaveLength(Math.min(1, slot.assignments.length));
        expect(slot.assignments.filter(item => item.status === "PENDING" || item.status === "CONFIRMED").length).toBeLessThanOrEqual(1);
      }
    }

    const slot = drafts.flatMap(roster => roster.slots)[0];
    const edited = await ministries.editRosterSlot(louvorLeader, slot.rosterId, slot.id, slot.roleLabel, {
      sector: "SETOR-ISO-282", zone: "ZONA-ISO", side: "LADO-ISO",
    });
    expect(edited.sector).toBe("SETOR-ISO-282");
    expect(edited.zone).toBe("ZONA-ISO");
    expect(edited.side).toBe("LADO-ISO");

    const published = await ministries.publishRosterMonth(louvorLeader, "rf1iso_min_louvor", MONTH);
    expect(published.publishedRosters).toBe(14);
    expect(await prisma.roster.count({ where: { ministryId: "rf1iso_min_louvor", status: "PUBLISHED" } })).toBe(14);
    const notices = await prisma.rosterNotice.count();
    expect(notices).toBeGreaterThan(0);
    expect(await prisma.communicationOutbox.count()).toBe(0);
    expect(await prisma.rosterNoticeDelivery.count({ where: { channel: "WHATSAPP", status: "RECORDED" } })).toBe(0);

    const pdf = await ministries.rosterPdf(louvorLeader, slot.rosterId);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.byteLength).toBeGreaterThan(1000);

    const assignment = await prisma.rosterAssignment.findFirst({
      where: { status: "PENDING", personId: { not: "rf1iso_p_l01" }, slot: { roster: { ministryId: "rf1iso_min_louvor" } } },
    });
    const confirmed = await prisma.rosterAssignment.findFirst({
      where: { status: "PENDING", personId: "rf1iso_p_l01", slot: { roster: { ministryId: "rf1iso_min_louvor" } } },
    });
    expect(assignment && confirmed).toBeTruthy();
    const volunteer = actor(assignment!.personId.replace("rf1iso_p_", "rf1iso_u_"), assignment!.personId, ROLE_CODES.MEMBRO);
    await rosters.decline(volunteer, assignment!.id);
    await rosters.confirm(member, confirmed!.id);
    expect(await prisma.rosterAssignment.findUnique({ where: { id: assignment!.id } })).toMatchObject({ status: "DECLINED" });
    expect(await prisma.rosterAssignment.findUnique({ where: { id: confirmed!.id } })).toMatchObject({ status: "CONFIRMED" });

    await prisma.ministryMembership.update({ where: { id: "rf1iso_mm_rf1iso_p_l34" }, data: { status: "ENCERRADO", endedAt: new Date() } });
    await prisma.ministryRosterModuleMembership.updateMany({
      where: { personId: "rf1iso_p_l34" }, data: { status: "ENCERRADO", endedAt: new Date() },
    });
    const february = await rosters.monthlySimulation(louvorLeader, "rf1iso_min_louvor", { month: "2027-02" }) as Preview;
    expect(february.rosters.length).toBeGreaterThan(0);
    const februaryPeople = february.rosters.flatMap(roster => roster.positions.flatMap(position => position.personId ? [position.personId] : []));
    expect(februaryPeople).not.toContain("rf1iso_p_l34");
  });

  it("restringe o líder de módulo, mantém a Ceia manual e recusa gente de outro módulo", async () => {
    await prisma.ministryMembership.update({ where: { id: "rf1iso_mm_rf1iso_p_recepcao_05" }, data: { status: "ENCERRADO", endedAt: new Date() } });
    await prisma.ministryRosterModuleMembership.updateMany({
      where: { personId: "rf1iso_p_recepcao_05" }, data: { status: "ENCERRADO", endedAt: new Date() },
    });

    await expectHttp(rosters.monthlySimulation(moduleLeader, "rf1iso_min_atm", { month: MONTH }), 403, "ROSTER_MONTH_LEADERSHIP_REQUIRED");
    await expectHttp(ministries.publishRosterMonth(moduleLeader, "rf1iso_min_atm", MONTH), 403, "ROSTER_MONTH_LEADERSHIP_REQUIRED");

    const started = Date.now();
    const preview = await rosters.monthlySimulation(atmosferaLeader, "rf1iso_min_atm", { month: MONTH }) as Preview;
    expect(Date.now() - started).toBeLessThan(8_000);
    expect(preview.rosters.filter(roster => roster.moduleName === "Santa Ceia").length).toBe(14);
    const ceiaPeople = preview.rosters.filter(roster => roster.moduleName === "Santa Ceia")
      .flatMap(roster => roster.positions.flatMap(position => position.personId ? [position.personId] : []));
    expect(ceiaPeople).toEqual([]);
    expect(preview.rosters.filter(roster => roster.moduleName === "Santa Ceia").every(roster =>
      roster.positions.every(position => position.reasons.includes("MANUAL_SUBSTITUTION")))).toBe(true);
    expect(preview.rosters.filter(roster => roster.moduleName === "Recepção").some(roster =>
      roster.positions.some(position => position.reasons.includes("MONTHLY_UNANSWERED")))).toBe(true);
    const assigned = preview.rosters.flatMap(roster => roster.positions.flatMap(position => position.personId ? [position.personId] : []));
    expect(assigned).not.toContain("rf1iso_p_recepcao_05");
    expect(substitutionInviteLimit({
      slot: { manualFill: false, roleLabel: "Ceia · etapa 1", roster: { module: { name: "Santa Ceia" }, ministry: { slug: "atmosfera" } } },
    } as never, 5)).toBe(0);

    const saved = await rosters.saveMonth(atmosferaLeader, "rf1iso_min_atm", MONTH, { fingerprint: preview.revision });
    expect(saved.savedRosters).toBeGreaterThan(0);
    const ceiaAssignments = await prisma.rosterAssignment.count({
      where: { slot: { roster: { moduleId: "rf1iso_mod_ceia" } }, status: { in: ["PENDING", "CONFIRMED"] } },
    });
    expect(ceiaAssignments).toBe(0);

    const visibleToModule = await rosters.listMinistry(moduleLeader, "rf1iso_min_atm");
    expect(visibleToModule.permissions.manageRosterMonth).toBe(false);
    expect(visibleToModule.permissions.scope).toBe("modules");
    expect(visibleToModule.modules.map(module => module.id)).toEqual(["rf1iso_mod_recepcao"]);
    expect(visibleToModule.rosters.every(roster => roster.moduleId === "rf1iso_mod_recepcao")).toBe(true);

    const visibleToMinistry = await rosters.listMinistry(atmosferaLeader, "rf1iso_min_atm");
    expect(visibleToMinistry.permissions.manageRosterMonth).toBe(true);
    expect(visibleToMinistry.permissions.scope).toBe("ministry");
    expect(visibleToMinistry.modules.map(module => module.id).sort()).toEqual(["rf1iso_mod_ceia", "rf1iso_mod_conexao", "rf1iso_mod_recepcao"]);
    const adminView = await rosters.listMinistry(admin, "rf1iso_min_atm");
    expect(adminView.permissions.manageRosterMonth).toBe(true);
    expect(adminView.modules).toHaveLength(3);

    const other = visibleToMinistry.rosters.find(roster => roster.moduleId === "rf1iso_mod_conexao");
    expect(other).toBeTruthy();
    await expectHttp(ministries.editRosterSlot(moduleLeader, other!.id, other!.slots[0].id, other!.slots[0].roleLabel, {
      sector: "FORA", zone: "FORA", side: "FORA",
    }), 403, "ROSTER_MODULE_FORBIDDEN");

    const draftRosters = await prisma.roster.findMany({
      where: { ministryId: "rf1iso_min_atm", status: "DRAFT" }, select: { id: true, moduleId: true },
    });
    const rosterIds = (moduleId: string) => draftRosters.filter(roster => roster.moduleId === moduleId).map(roster => roster.id);
    const answered = [
      ...["rf1iso_p_mod_recepcao", "rf1iso_p_recepcao_01", "rf1iso_p_recepcao_02", "rf1iso_p_recepcao_03", "rf1iso_p_recepcao_04"]
        .map(personId => ({ churchId: "rf1iso_church", personId, month: MONTH, rosterIds: rosterIds("rf1iso_mod_recepcao") })),
      ...["01", "02", "03", "04"].map(suffix => ({
        churchId: "rf1iso_church", personId: `rf1iso_p_conexao_${suffix}`, month: MONTH, rosterIds: rosterIds("rf1iso_mod_conexao"),
      })),
    ];
    await prisma.rosterAvailabilityResponse.createMany({ data: answered });
    const filled = await rosters.monthlySimulation(atmosferaLeader, "rf1iso_min_atm", { month: MONTH }) as Preview;
    expect(filled.rosters.some(roster => roster.moduleName === "Recepção" && roster.positions.some(position => position.personId))).toBe(true);
    expect(filled.rosters.filter(roster => roster.moduleName === "Santa Ceia").every(roster => roster.positions.every(position => !position.personId))).toBe(true);
    await rosters.saveMonth(atmosferaLeader, "rf1iso_min_atm", MONTH, { fingerprint: filled.revision });

    const published = await ministries.publishRosterMonth(atmosferaLeader, "rf1iso_min_atm", MONTH);
    expect(published.publishedRosters).toBeGreaterThan(0);
    const recepcaoAssignment = await prisma.rosterAssignment.findFirst({
      where: { status: "PENDING", slot: { roster: { moduleId: "rf1iso_mod_recepcao", status: "PUBLISHED" } } },
    });
    expect(recepcaoAssignment).toBeTruthy();
    await expectHttp(rosters.substitute(atmosferaLeader, recepcaoAssignment!.id, { personId: "rf1iso_p_conexao_01" }), 409, "ROSTER_MODULE_TEAM_REQUIRED");
    expect(await prisma.communicationOutbox.count()).toBe(0);
  });

  it("grava rascunho fictício da ordem do culto, aprova com o pastor e não promove tag a papel", async () => {
    const pastorGrantsBefore = await prisma.grant.count({ where: { role: { code: ROLE_CODES.PASTOR } } });
    await expectHttp(orders.list(member), 403);
    await expectHttp(orders.create(admin, {
      title: "OC-SINTETICO-282", serviceAt: "2027-01-07T20:00:00-03:00",
      items: [{ title: "Acolhida", minutes: 5 }],
    }), 403);
    await expectHttp(planner.saveTeamMember(pastor, "rf1iso_p_media", ["pastor"]), 400);

    const tagged = await planner.saveTeamMember(pastor, "rf1iso_p_media", ["media"]);
    expect(tagged.roles).toEqual(["media"]);
    expect(await prisma.grant.count({ where: { role: { code: ROLE_CODES.PASTOR } } })).toBe(pastorGrantsBefore);
    expect(await prisma.grant.count({ where: { userId: "rf1iso_u_media", role: { code: ROLE_CODES.PASTOR } } })).toBe(0);
    const pastoral = await planner.saveTeamMember(pastor, "rf1iso_p_pastor", ["pastor", "preacher"]);
    expect(pastoral.roles).toEqual(expect.arrayContaining(["pastor", "preacher"]));
    expect(await prisma.grant.count({ where: { role: { code: ROLE_CODES.PASTOR } } })).toBe(pastorGrantsBefore);

    const created = await orders.create(pastor, {
      title: "OC-SINTETICO-282",
      serviceAt: "2027-01-07T20:00:00-03:00",
      notes: "Rascunho fictício. Sem publicação externa.",
      items: [{ title: "Acolhida", minutes: 5, responsible: "Equipe sintética" }, { title: "Mensagem", minutes: 25 }],
    });
    expect(created.status).toBe("DRAFT");
    const edited = await orders.update(pastor, created.id, {
      title: "OC-SINTETICO-282",
      serviceAt: "2027-01-07T20:00:00-03:00",
      notes: "Roteiro editado no rascunho.",
      expectedUpdatedAt: created.updatedAt,
      items: [{ title: "Acolhida revista", minutes: 8, responsible: "Equipe sintética" }, { title: "Mensagem", minutes: 25 }],
    });
    await expectHttp(orders.approve(admin, edited.id, edited.updatedAt), 403);
    const approved = await orders.approve(pastor, edited.id, edited.updatedAt);
    expect(approved.status).toBe("APPROVED");
    const published = await orders.publish(pastor, approved.id, approved.updatedAt);
    expect(published.status).toBe("PUBLISHED");
    await expectHttp(orders.create(pastor, {
      title: "Duplicada", serviceAt: "2027-01-07T20:00:00-03:00", items: [{ title: "Outra" }],
    }), 409, "SERVICE_ORDER_DUPLICATE");
    const pdf = await orders.pdf(admin, published.id);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.byteLength).toBeGreaterThan(1000);
    expect(published.title).toBe("OC-SINTETICO-282");
    const listed = await orders.list(admin);
    expect(listed.orders.map(order => order.id)).toContain(published.id);
    await expectHttp(orders.list(member), 403);
  });
});
