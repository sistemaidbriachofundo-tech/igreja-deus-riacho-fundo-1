import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  credentialColorRule,
  decideTicketScan,
  effectiveSettingValue,
  eventCoversLocalDay,
  isBeforeConfiguredHour,
  normalizeResumeEventSlug,
  officeDocumentKind,
  paymentSettlement,
  publicPasswordResetBody,
  sameLouvorWeek,
  scopeCovers,
  windowsOverlap,
} from "./piloto-pacote";

describe("pacote de DEV", () => {
  it("responde a recuperação de senha sempre do mesmo jeito", () => {
    assert.deepEqual(publicPasswordResetBody(), publicPasswordResetBody());
    assert.equal(publicPasswordResetBody().accepted, true);
  });

  it("aceita somente o slug publicado do evento para retomar a inscrição", () => {
    assert.equal(normalizeResumeEventSlug(" So-Para-Mocas "), "so-para-mocas");
    assert.equal(normalizeResumeEventSlug("../admin"), null);
    assert.equal(normalizeResumeEventSlug("evento com espaço"), null);
  });

  it("distingue a cor da carteira pela situação e pelo cargo", () => {
    assert.equal(credentialColorRule({ status: "ACTIVE", roles: ["PASTOR"] }).rule, "pastoral");
    assert.equal(credentialColorRule({ status: "ACTIVE", roles: ["DEACON"] }).rule, "lideranca");
    assert.equal(credentialColorRule({ status: "ACTIVE", roles: [] }).rule, "membro");
    assert.equal(credentialColorRule({ status: "PENDING_ADMISSION" }).rule, "pendente");
    assert.equal(credentialColorRule({ status: "INACTIVE" }).rule, "inativa");
  });

  it("aceita DOC e DOCX somente quando o tipo e a assinatura conferem", () => {
    const doc = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    const docx = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    assert.equal(officeDocumentKind(doc, "application/msword"), "doc");
    assert.equal(officeDocumentKind(docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), "docx");
    assert.equal(officeDocumentKind(docx, "application/msword"), null);
    assert.equal(officeDocumentKind(doc, "application/pdf"), null);
  });

  it("restringe módulo, grupo e trilha quando o grant tem vínculo e preserva a igreja sem vínculo", () => {
    const bindings = [{ kind: "TRACK" as const, scopeId: "trilha-a" }];
    assert.equal(scopeCovers({ bindings, kind: "TRACK", scopeId: "trilha-a" }), true);
    assert.equal(scopeCovers({ bindings, kind: "TRACK", scopeId: "trilha-b" }), false);
    assert.equal(scopeCovers({ bindings, kind: "GROUP", scopeId: "grupo-1" }), true);
  });

  it("mantém o valor de DEV quando não há revisão vigente e não sobrepõe janelas", () => {
    const dev = effectiveSettingValue({
      devValue: "08:00",
      revisions: [{ id: "futura", value: "09:00", effectiveFrom: "2026-12-01T00:00:00.000Z", effectiveUntil: null }],
      at: "2026-11-20T12:00:00.000Z",
    });
    assert.deepEqual(dev, { source: "DEV", value: "08:00", revisionId: null });
    const published = effectiveSettingValue({
      devValue: "08:00",
      revisions: [{ id: "vigente", value: "07:30", effectiveFrom: "2026-11-01T00:00:00.000Z", effectiveUntil: "2026-12-01T00:00:00.000Z" }],
      at: "2026-11-20T12:00:00.000Z",
    });
    assert.equal(published.revisionId, "vigente");
    assert.equal(windowsOverlap(
      { from: "2026-11-01T00:00:00.000Z", until: "2026-12-01T00:00:00.000Z" },
      { from: "2026-11-20T00:00:00.000Z", until: null },
    ), true);
  });

  it("usa o relógio de Brasília e bloqueia Louvor na semana do culto", () => {
    const before = new Date("2026-11-20T10:59:00.000Z");
    const ready = new Date("2026-11-20T11:00:00.000Z");
    assert.equal(isBeforeConfiguredHour(before, "08:00"), true);
    assert.equal(isBeforeConfiguredHour(ready, "08:00"), false);
    const thursday = new Date("2026-11-05T23:00:00.000Z");
    const sunday = new Date("2026-11-08T13:00:00.000Z");
    const nextMonday = new Date("2026-11-09T13:00:00.000Z");
    assert.equal(sameLouvorWeek(thursday, sunday), true);
    assert.equal(sameLouvorWeek(sunday, nextMonday), false);
  });

  it("separa bruto, taxa e líquido", () => {
    assert.deepEqual(paymentSettlement(10_000, 390), { grossCents: 10_000, feeCents: 390, netCents: 9_610 });
  });

  it("não confirma ingresso de outro evento, sem pagamento ou já lido", () => {
    assert.equal(decideTicketScan({
      found: true, ticketEventId: "outro", requestedEventId: "mocas", paymentStatus: "CONFIRMED_GATEWAY",
      registrationStatus: "CONFIRMED", onEventDay: true, now: "2026-11-20T15:00:00.000Z",
    }).result, "WRONG_EVENT");
    assert.equal(decideTicketScan({
      found: true, ticketEventId: "mocas", requestedEventId: "mocas", paymentStatus: "PENDING",
      registrationStatus: "PENDING_PAYMENT", onEventDay: true, now: "2026-11-20T15:00:00.000Z",
    }).result, "UNPAID");
    assert.equal(decideTicketScan({
      found: true, ticketEventId: "mocas", requestedEventId: "mocas", paymentStatus: "CONFIRMED_PIX",
      registrationStatus: "CONFIRMED", onEventDay: true, checkedInAt: "2026-11-20T15:00:00.000Z",
      scannedByUserId: "lider", now: "2026-11-20T15:05:00.000Z",
    }).result, "ALREADY_READ");
    const start = new Date("2026-11-20T15:00:00.000Z");
    assert.equal(eventCoversLocalDay(start, null, new Date("2026-11-20T18:00:00.000Z")), true);
    assert.equal(eventCoversLocalDay(start, null, new Date("2026-11-21T15:00:00.000Z")), false);
  });
});
