import { NotificationsService } from "./notifications.service";

describe("NotificationsService", () => {
  const scope = { churchId: "riacho", organizationId: "church-org" };
  const volunteer = { userId: "user-me", personId: "me", email: "user@example.test", ...scope, grants: [{ roleCode: "MEMBRO", ...scope }] };

  function fixture() {
    const roster = { list: jest.fn().mockResolvedValue({ notices: [{
      id: "published:assignment:me", kind: "published", title: "Nova escala", body: "Consulte a escala",
      path: "/app/servir/meu-espaco/", createdAt: new Date(),
    }] }) };
    const groups = { inbox: jest.fn().mockResolvedValue([]) };
    const readAt = new Date();
    const seen = { findMany: jest.fn().mockResolvedValue([{ noticeId: "published:assignment:me", readAt }]),
      createMany: jest.fn().mockResolvedValue({ count: 1 }) };
    const ministries = { findMany: jest.fn().mockResolvedValue([{ id: "atmosfera", leaderPersonId: "defined-leader" }, { id: "other" }]) };
    const assignments = { findMany: jest.fn().mockResolvedValue([{
      id: "declined", declinedAt: new Date(), slot: { id: "entry", roleLabel: "Entrada",
        roster: { id: "r1", ministryId: "atmosfera", title: "Culto 10h", serviceAt: new Date(Date.now() + 3600000), status: "PUBLISHED", module: { name: "Recepção" } },
        assignments: [{ status: "CONFIRMED" }],
      },
    }]) };
    const ledger = { findMany: jest.fn() };
    const admissionProtocol = { findMany: jest.fn().mockResolvedValue([]) };
    const auditLog = { findMany: jest.fn().mockResolvedValue([]) };
    const db = { workspaceNotificationRead: seen, ministry: ministries, rosterAssignment: assignments, ledgerEntry: ledger, admissionProtocol, auditLog };
    return { service: new NotificationsService(db as never, { getPilotChurch: async () => scope } as never, roster as never, groups as never),
      seen, roster, ministries, ledger, assignments, admissionProtocol, readAt };
  }

  it("opens the volunteer's exact assignment and uses account-scoped read receipts", async () => {
    const { service, seen, ledger, ministries, readAt } = fixture();
    const result = await service.list(volunteer);
    expect(result).toMatchObject({ unread: 0, items: [{ href: "/app/servir/meu-espaco/#escala-assignment", readAt }] });
    expect(seen.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      userId: volunteer.userId, churchId: scope.churchId, noticeId: { in: ["published:assignment:me"] },
    } }));
    expect(ledger.findMany).not.toHaveBeenCalled();
    expect(ministries.findMany).not.toHaveBeenCalled();
  });

  it("rejects read receipts for unrelated notices and suppresses duplicate receipts", async () => {
    const { service, seen } = fixture();
    expect(await service.markRead(volunteer, ["published:assignment:me", "decline:another-church", "published:assignment:me"])).toEqual({ marked: 1 });
    expect(seen.createMany).toHaveBeenCalledWith({ skipDuplicates: true, data: [{
      userId: volunteer.userId, churchId: scope.churchId, noticeId: "published:assignment:me",
    }] });
  });

  it("does not open the feed across congregations", async () => {
    const { service, roster } = fixture();
    expect(await service.list({ ...volunteer, churchId: "another" })).toEqual({ items: [], unread: 0 });
    expect(roster.list).not.toHaveBeenCalled();
  });

  it("shows a filled vacancy to the assigned leader with the original notice ID", async () => {
    const { service, assignments } = fixture();
    const leader = { ...volunteer, grants: [{ ...scope, roleCode: "LIDER_MINISTERIO", ministryId: "atmosfera" }] };
    const result = await service.list(leader);
    expect(result.items).toEqual(expect.arrayContaining([expect.objectContaining({
      id: "decline:declined", state: "Vaga preenchida", href: "/app/ministerios/?ministry=atmosfera&aba=escalas&escala=r1#posto-entry",
    })]));
    expect(assignments.findMany.mock.calls[0][0].where.slot.roster.ministryId.in).toEqual(["atmosfera"]);
  });

  it("links pastoral decisions to their own queues", async () => {
    const { service, ministries, ledger, admissionProtocol } = fixture();
    const pastor = { ...volunteer, grants: [{ ...scope, roleCode: "PASTOR" }] };
    const now = new Date();
    ministries.findMany.mockResolvedValue([]);
    ledger.findMany.mockResolvedValue([{
      id: "expense-1", description: "Material", amountCents: 1500, status: "PENDING_APPROVAL",
      createdByUserId: "treasurer", firstApprovedAt: now, rejectedAt: null, secondApprovedAt: null,
    }]);
    admissionProtocol.findMany.mockResolvedValueOnce([{
      id: "admission-1", status: "AWAITING_PASTOR", updatedAt: now, person: { displayName: "Pessoa de teste" },
    }]);
    const result = await service.priorities(pastor, now);
    expect(result.pending).toEqual(expect.arrayContaining([
      expect.objectContaining({ href: "/app/pastoral/despesas/?despesa=expense-1" }),
      expect.objectContaining({ href: "/app/pastoral/admissoes/?protocolo=admission-1" }),
    ]));
  });
});
