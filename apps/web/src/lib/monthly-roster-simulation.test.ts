import { describe, expect, it } from "vitest";
import {
  monthlyDecisions, monthlySlotChoice, monthlyVacancyMessage, nextRosterMonth,
  type MonthlyPreview,
} from "./monthly-roster-simulation";

const preview: MonthlyPreview = {
  month: "2026-12", revision: "rev-1", responses: 4, members: 5,
  rosters: [
    { id: "draft", title: "Rascunho", serviceAt: "2026-12-06T13:00:00Z", status: "DRAFT", positions: [
      { slotId: "fixed", roleLabel: "Recepção", personId: "a", personName: "Ana", locked: true },
      { slotId: "pair", roleLabel: "Ofertas", requiresCouple: true },
      { slotId: "removed", roleLabel: "Apoio", personId: "b", personName: "Bruno" },
      { slotId: "protected", roleLabel: "Apoio", readOnly: true, personId: "c", personName: "Carla" },
    ] },
    { id: "published", title: "Publicada", serviceAt: "2026-12-10T23:00:00Z", status: "PUBLISHED", positions: [
      { slotId: "published-slot", roleLabel: "Recepção", personId: "a", personName: "Ana" },
    ] },
  ],
};

describe("simulação mensal de escalas", () => {
  it("preserva escolhas fixadas, representa a vaga liberada e deixa cultos publicados fora da gravação", () => {
    const decisions = monthlyDecisions(preview, {
      pair: { choice: { personId: "d", personName: "Davi", partnerPersonId: "e", partnerName: "Eva" }, locked: true },
      removed: { choice: null, locked: true },
      "published-slot": { choice: null, locked: false },
    });
    expect(decisions).toEqual([
      { slotId: "fixed", personId: "a", locked: true },
      { slotId: "pair", personId: "d", partnerPersonId: "e", locked: true },
      { slotId: "removed", personId: null, locked: false },
    ]);
  });

  it("lembra as escolhas fixadas retornadas pelo backend após recalcular", () => {
    expect(monthlySlotChoice(preview.rosters[0].positions[0], {})).toMatchObject({ choice: { personId: "a" }, locked: true });
  });

  it("distingue pesquisa sem resposta de indisponibilidade declarada", () => {
    expect(monthlyVacancyMessage({ slotId: "x", roleLabel: "Apoio", reasons: ["MONTHLY_UNANSWERED"] })).toMatch(/ainda não informada/);
    expect(monthlyVacancyMessage({ slotId: "x", roleLabel: "Apoio", reasons: ["MONTHLY_NOT_AVAILABLE"] })).toMatch(/Indisponibilidade informada/);
  });

  it("sugere o próximo mês pela data de Brasília", () => {
    expect(nextRosterMonth(new Date("2027-01-01T00:05:00Z"))).toBe("2027-01");
  });
});
