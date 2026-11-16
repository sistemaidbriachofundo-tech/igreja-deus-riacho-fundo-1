import { ConflictException } from "@nestjs/common";
import webPush from "web-push";
import type { AuthUser } from "../auth/types/auth-user";
import type { PilotService } from "../pilot/pilot.service";
import type { PrismaService } from "../prisma/prisma.service";
import { RosterNoticesService } from "./roster-notices.service";
import * as invites from "./roster-substitution-invites";

const now = new Date("2026-11-25T13:00:00Z");
const churchId = "riacho";
const organizationId = "igreja";
const actor = { personId: "p1", userId: "u1", grants: [{ churchId, organizationId, roleCode: "MEMBRO" }] } as AuthUser;

function fixture() {
  const history: { personId: string; expiresAt: Date }[] = [];
  const serviceAt = new Date(+now + 86_400_000);
  const source = { id: "assignment", status: "DECLINED", slot: { roster: {
    title: "Culto de domingo", serviceAt, organizationId, module: { rules: { substituteInviteLimit: 2, substituteInviteHours: 1 } },
  } } };
  const write = jest.fn(async (data: { data: { personId: string; expiresAt: Date }[] }) => {
    history.push(...data.data.filter(item => item.expiresAt));
    return { count: data.data.length };
  });
  const db = {
    rosterNotice: {
      findFirst: jest.fn(), findMany: jest.fn(async () => history), createMany: write,
    },
    roster: { findMany: jest.fn(async () => [{ ministryId: "m", module: { rules: { volunteerIds: ["p1"] } } }]) },
    ministryMembership: { findMany: jest.fn(async () => [{ personId: "p1", ministryId: "m" }, { personId: "p2", ministryId: "m" }]) },
    rosterAssignment: {
      findMany: jest.fn().mockImplementation(async ({ where }) => where.status === "DECLINED"
        ? [{ id: source.id }]
        : [{ id: "confirmed", personId: "p2", partnerPersonId: null, status: "CONFIRMED", slot: { roster: { serviceAt } } }]),
      findFirst: jest.fn().mockImplementation(async ({ where }) => where.substituteForId ? null : source),
    },
    rosterPushSubscription: { findFirst: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn().mockImplementation(fn => fn(db)),
  };
  const pilot = { getPilotChurch: async () => ({ churchId, organizationId }) } as PilotService;
  return { service: new RosterNoticesService(db as unknown as PrismaService, pilot), db, source, history, write };
}

afterEach(() => jest.restoreAllMocks());

it("abre a pesquisa no dia 25, gera o lembrete de 24 h e avança a rodada após o vencimento", async () => {
  const { service, history, write } = fixture();
  jest.spyOn(invites, "substitutionCandidates").mockResolvedValue(["p1", "p2", "p3"]);
  await expect(service.run(now)).resolves.toMatchObject({ invitations: 2 });
  expect(history.map(item => item.personId)).toEqual(["p1", "p2"]);
  expect(history[0].expiresAt).toEqual(new Date(+now + 3_600_000));
  expect(write.mock.calls.flatMap(([call]) => call.data)).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "survey:riacho:2026-12:p1" }),
    expect.objectContaining({ id: "reminder:confirmed:" + (+now + 86_400_000) + ":p2" }),
  ]));
  await expect(service.run(new Date(+now + 15 * 60_000))).resolves.toMatchObject({ invitations: 0 });
  await expect(service.run(new Date(+now + 3_600_000))).resolves.toMatchObject({ invitations: 1 });
  expect(history.map(item => item.personId)).toEqual(["p1", "p2", "p3"]);
});

it("rejeita o convite no instante de vencimento e mantém o primeiro aceite idempotente", async () => {
  const { service, db } = fixture();
  db.rosterNotice.findFirst.mockResolvedValue({ expiresAt: now });
  const accept = jest.spyOn(invites, "acceptSubstitute");
  await expect(service.acceptInvite(actor, "assignment", now)).rejects.toThrow(ConflictException);
  expect(accept).not.toHaveBeenCalled();

  db.rosterNotice.findFirst.mockResolvedValue({ expiresAt: new Date(+now + 60_000) });
  accept.mockResolvedValue({ id: "replacement" } as Awaited<ReturnType<typeof invites.acceptSubstitute>>);
  await expect(service.acceptInvite(actor, "assignment", now)).resolves.toEqual({ assignmentId: "replacement", confirmed: true });
  db.rosterAssignment.findFirst.mockResolvedValueOnce({ id: "assignment" }).mockResolvedValueOnce({ id: "replacement" });
  await expect(service.acceptInvite(actor, "assignment", new Date(+now + 60_000))).resolves.toEqual({ assignmentId: "replacement", confirmed: true });
  expect(accept).toHaveBeenCalledTimes(1);
});

it("envia push de teste somente à inscrição do próprio voluntário", async () => {
  const saved = { ...process.env };
  Object.assign(process.env, {
    ROSTER_PUSH_ENABLED: "true", ROSTER_PUSH_TEST_ENABLED: "true",
    ROSTER_VAPID_PUBLIC_KEY: "public", ROSTER_VAPID_PRIVATE_KEY: "private", ROSTER_VAPID_SUBJECT: "mailto:test@example.test",
  });
  try {
    const { service, db } = fixture();
    const endpoint = "https://fcm.googleapis.com/fcm/send/qa";
    const send = jest.spyOn(webPush, "sendNotification").mockResolvedValue({ statusCode: 201 } as Awaited<ReturnType<typeof webPush.sendNotification>>);
    await expect(service.testDevice(actor, endpoint)).rejects.toThrow("Ative os avisos");
    expect(send).not.toHaveBeenCalled();
    db.rosterPushSubscription.findFirst.mockResolvedValue({ churchId, personId: "p1", endpoint, p256dh: "key", auth: "auth" });
    await expect(service.testDevice(actor, endpoint)).resolves.toEqual({ accepted: true });
    expect(db.rosterPushSubscription.findFirst).toHaveBeenLastCalledWith({ where: { churchId, personId: "p1", endpoint } });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ endpoint }), expect.stringContaining("Teste de notificação"), expect.objectContaining({ TTL: 120 }));
  } finally {
    process.env = saved;
  }
});


it("aceita um administrador da organização na igreja ativa e recusa outro escopo", async () => {
  const { service } = fixture();
  const admin = { ...actor, churchId, organizationId, grants: [{
    roleCode: "PLATFORM_ADMIN", organizationId, churchId: null,
  }] } as AuthUser;
  await expect(service.list(admin, now)).resolves.toMatchObject({ notices: [] });
  await expect(service.list({ ...admin, churchId: "outra-igreja" }, now)).rejects.toMatchObject({ status: 403 });
});
