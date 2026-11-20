import { substitutionInviteLimit } from "./roster-substitution-invites";
import { evaluateCandidate } from "./preview-domain/eligibility";
import { DEFAULT_RULES, type Candidate, type ExistingAssignment, type SlotDemand } from "./preview-domain/types";

const ana: Candidate = {
  personId: "ana", active: true, churchIds: ["riacho"], ministryIds: ["louvor"],
  qualifiedPositionIds: ["Vocal"], approvedRoleTags: [], availability: [{ weekday: 0, startMinute: 0, endMinute: 1440 }],
};

const slot = (serviceAt: string, slotId: string): SlotDemand => ({
  slotId, rosterId: "culto", churchId: "riacho", ministryId: "louvor", positionId: "Vocal",
  serviceAt, serviceType: "sunday_morning", roleLabel: "Vocal",
});

describe("Louvor de segunda a domingo", () => {
  it("bloqueia outro culto na mesma semana e libera a semana seguinte", () => {
    const history: ExistingAssignment[] = [{
      assignmentId: "quinta", churchId: "riacho", ministryId: "louvor", positionId: "Vocal",
      rosterId: "culto", slotId: "quinta", serviceAt: "2026-11-05T23:00:00.000Z", status: "CONFIRMED", personId: "ana",
    }];
    const sunday = evaluateCandidate(ana, slot("2026-11-08T13:00:00.000Z", "domingo"), [ana], history, { ...DEFAULT_RULES, louvorWeekBlock: true, minIntervalDays: 0, respectAvailability: false });
    const next = evaluateCandidate(ana, slot("2026-11-12T23:00:00.000Z", "proxima"), [ana], history, { ...DEFAULT_RULES, louvorWeekBlock: true, minIntervalDays: 0, respectAvailability: false });
    expect(sunday.reasons).toContain("LOUVOR_WEEK");
    expect(next.eligible).toBe(true);
  });
});


describe("convites de substituição do Louvor", () => {
  it("chama uma pessoa por vaga e mantém a Ceia manual", () => {
    const assignment = { slot: { roleLabel: "Violão", roster: { ministry: { slug: "louvor" } } } };
    expect(substitutionInviteLimit(assignment as never, 0)).toBe(1);
    expect(substitutionInviteLimit(assignment as never, 5)).toBe(1);
    expect(substitutionInviteLimit({ slot: { ...assignment.slot, roleLabel: "Santa Ceia" } } as never, 5)).toBe(0);
  });
});
