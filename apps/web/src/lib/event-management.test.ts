import { describe, expect, it } from "vitest";
import {
  canRecordPresence,
  countLines,
  participationQuery,
  publicationBlockReason,
  readParticipation,
  registrationLabel,
  toManagedRegistration,
} from "./event-management";

describe("gestão de eventos", () => {
  it("bloqueia publicação com contato e aceita data comum", () => {
    expect(publicationBlockReason({
      name: "Encontro",
      slug: "encontro",
      description: "Data 2026-11-15 no salão",
      locationText: "Salão",
    })).toBeNull();
    expect(publicationBlockReason({
      name: "Encontro",
      slug: "encontro",
      description: "escreva para ana@example.test",
      locationText: "",
    })).toMatch(/Publicação bloqueada/);
  });

  it("omite nome e código de menor e não oferece presença", () => {
    const row = toManagedRegistration({
      id: "r1",
      status: "CONFIRMED",
      partySize: 1,
      isMinor: true,
      displayName: "TESTE Menor",
      guardianDisplayName: "TESTE Responsavel",
      checkInCode: "abc123def4567890",
      paymentStatus: "CONFIRMED_MOCK",
    });
    expect(row?.displayName).toBe("");
    expect(row?.checkInCode).toBe("");
    expect(registrationLabel(row!)).toBe("Registro de menor omitido");
    expect(canRecordPresence(row!)).toBe(false);
    expect(JSON.stringify(row)).not.toContain("TESTE Menor");
    expect(JSON.stringify(row)).not.toContain("TESTE Responsavel");
  });

  it("monta a consulta e só lê contagens presentes na resposta", () => {
    expect(participationQuery({ eventId: "e1", status: "CHECKED_IN", from: "", to: "" }))
      .toBe("/reports/participation?eventId=e1&status=CHECKED_IN");
    expect(readParticipation({ ok: true })).toBeNull();
    const report = readParticipation({
      counts: {
        registrations: 2,
        checkedIn: 1,
        participants: 3,
        presentParticipants: 2,
        minorsOmitted: 1,
        cancelled: 0,
        pendingPayment: 0,
        confirmedAwaitingPresence: 1,
      },
      rows: [{ registrationId: "r1", syntheticLabel: "TESTE Adulto", status: "CHECKED_IN", partySize: 2, labelRedacted: false }],
    });
    expect(report?.counts.checkedIn).toBe(1);
    expect(report?.rows[0]?.syntheticLabel).toBe("TESTE Adulto");
  });

  it("mostra vínculo formal como bloqueado, sem transformar interesse em integrante", () => {
    const lines = countLines({
      formalMembership: { blocked: true, code: "MINISTRY_MEMBERSHIP_SCHEMA_BLOCKED", members: null },
      ministries: [{
        name: "Jovens",
        publishStatus: "PUBLISHED",
        eventsByStatus: { PUBLISHED: 1 },
        volunteerInterestsByStatus: { OPEN: 2 },
        formalMembers: null,
      }],
    });
    expect(lines).toContainEqual({ label: "Integrantes formais", value: "BLOCKED" });
    expect(lines).toContainEqual({ label: "Jovens · interesses OPEN", value: "2" });
    expect(lines).toContainEqual({ label: "Jovens · integrantes formais", value: "BLOCKED" });
    expect(lines.some((line) => line.value === "0" && line.label.includes("integrantes"))).toBe(false);
  });
});
