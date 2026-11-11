import {
  AUDIT_REDACTED,
  redactAuditMetadata,
} from "./audit-metadata.redactor";

const RELIGIOUS_PII = "Pedido sintetico de oracao pela familia Exemplo";
const MINOR_NAME = "Menor Sintetico";
const MINOR_BIRTH = "2014-03-03";
const PIX_EMAIL = "pix.sintetico@example.test";
const PIX_PHONE = "+5561999990000";
const PIX_CPF = "000.000.000-00";
const PIX_EVP = "11111111-1111-4111-8111-111111111111";
const API_KEY = "sk_test_sintetico_nao_usar";
const PASSWORD = "senha-sintetica";
const JWT = "eyJhbGciOiJub25lIn0.eyJzdWIiOiJzaW50ZXRpY28ifQ.assinatura";
const FINGERPRINT = "ab".repeat(16);

function serialized(value: unknown): string {
  return JSON.stringify(value);
}

describe("redactAuditMetadata", () => {
  it("returns null for empty metadata and masks raw blobs", () => {
    expect(redactAuditMetadata("person.patch", null)).toBeNull();
    expect(redactAuditMetadata("person.patch", undefined)).toBeNull();
    expect(redactAuditMetadata("person.patch", RELIGIOUS_PII)).toBe(
      AUDIT_REDACTED,
    );
    expect(redactAuditMetadata("person.patch", [PIX_EMAIL])).toBe(
      AUDIT_REDACTED,
    );
  });

  it("masks religious PII, minor data, Pix material and secrets", () => {
    const metadata = {
      personId: "person-sintetico",
      kind: "VISITA",
      testimony: "Testemunho sintetico de conversao",
      prayerRequest: RELIGIOUS_PII,
      counselingNotes: "Aconselhamento sintetico sem dado real",
      childName: MINOR_NAME,
      birthDate: MINOR_BIRTH,
      isMinor: true,
      hasGuardian: true,
      legalGuardianPersonId: "guardian-sintetico",
      school: "Escola Sintetica",
      pixKey: PIX_EMAIL,
      pixPhone: PIX_PHONE,
      pixCpf: PIX_CPF,
      pixEvp: PIX_EVP,
      agency: "0001",
      account: "123456",
      apiKey: API_KEY,
      password: PASSWORD,
      accessToken: JWT,
      tokenSuffix: "abc123",
    };
    const redacted = redactAuditMetadata("pastoral.case.create", metadata);
    const text = serialized(redacted);
    for (const secret of [
      RELIGIOUS_PII,
      "Testemunho sintetico de conversao",
      "Aconselhamento sintetico sem dado real",
      MINOR_NAME,
      MINOR_BIRTH,
      "guardian-sintetico",
      "Escola Sintetica",
      PIX_EMAIL,
      PIX_PHONE,
      PIX_CPF,
      PIX_EVP,
      "0001",
      "123456",
      API_KEY,
      PASSWORD,
      JWT,
      "abc123",
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(redacted).toMatchObject({
      personId: "person-sintetico",
      kind: "VISITA",
      testimony: AUDIT_REDACTED,
      prayerRequest: AUDIT_REDACTED,
      counselingNotes: AUDIT_REDACTED,
      childName: AUDIT_REDACTED,
      birthDate: AUDIT_REDACTED,
      isMinor: AUDIT_REDACTED,
      hasGuardian: AUDIT_REDACTED,
      legalGuardianPersonId: AUDIT_REDACTED,
      school: AUDIT_REDACTED,
      pixKey: AUDIT_REDACTED,
      apiKey: AUDIT_REDACTED,
      password: AUDIT_REDACTED,
      accessToken: AUDIT_REDACTED,
      tokenSuffix: AUDIT_REDACTED,
    });
  });

  it("keeps safe identifiers and masks values smuggled into allowlisted fields", () => {
    const redacted = redactAuditMetadata("ledger.account.create", {
      code: PIX_CPF,
      type: "ASSET",
      costCenterId: "cc-sintetico",
      name: `Celula ${PIX_EMAIL}`,
    });
    expect(redacted).toEqual({
      code: AUDIT_REDACTED,
      type: "ASSET",
      costCenterId: "cc-sintetico",
      name: AUDIT_REDACTED,
    });
  });

  it("keeps an operational label only on the event that declares it", () => {
    expect(
      redactAuditMetadata("ministry.create", {
        name: "Louvor Sintetico",
        slug: "louvor-sintetico",
      }),
    ).toEqual({
      name: "Louvor Sintetico",
      slug: "louvor-sintetico",
    });
    expect(
      redactAuditMetadata("ministry.create", {
        name: RELIGIOUS_PII,
        slug: "louvor-sintetico",
      }),
    ).toEqual({
      name: AUDIT_REDACTED,
      slug: "louvor-sintetico",
    });
    expect(
      redactAuditMetadata("pastoral.case.create", {
        name: "Louvor Sintetico",
        personId: "person-sintetico",
      }),
    ).toEqual({
      name: AUDIT_REDACTED,
      personId: "person-sintetico",
    });
  });

  it("keeps public lot price and withholds ledger amounts", () => {
    expect(
      redactAuditMetadata("event_lot.create", {
        eventId: "event-sintetico",
        code: "LOTE-A",
        priceCents: 2500,
        status: "OPEN",
      }),
    ).toEqual({
      eventId: "event-sintetico",
      code: "LOTE-A",
      priceCents: 2500,
      status: "OPEN",
    });
    expect(
      redactAuditMetadata("ledger.entry.create", {
        amountCents: 15000,
        fundId: "fund-sintetico",
        costCenterId: "cc-sintetico",
        competenceYear: 2026,
        competenceMonth: 11,
      }),
    ).toEqual({
      amountCents: AUDIT_REDACTED,
      fundId: "fund-sintetico",
      costCenterId: "cc-sintetico",
      competenceYear: 2026,
      competenceMonth: 11,
    });
    expect(
      redactAuditMetadata("ledger.budget.create", {
        year: 2026,
        title: "Orcamento sintetico da familia Exemplo",
      }),
    ).toEqual({
      year: 2026,
      title: AUDIT_REDACTED,
    });
  });

  it("keeps auth fingerprints and enum reasons, not free text or raw email", () => {
    expect(
      redactAuditMetadata("auth.login_failed", {
        reason: "invalid_password",
        emailFingerprint: FINGERPRINT,
      }),
    ).toEqual({
      reason: "invalid_password",
      emailFingerprint: FINGERPRINT,
    });
    expect(
      redactAuditMetadata("auth.login", {
        emailFingerprint: PIX_EMAIL,
        mfaEnabled: true,
        mfaRequired: false,
      }),
    ).toEqual({
      emailFingerprint: AUDIT_REDACTED,
      mfaEnabled: true,
      mfaRequired: false,
    });
    expect(
      redactAuditMetadata("admission.reject", {
        step: "PASTOR",
        reason: RELIGIOUS_PII,
      }),
    ).toEqual({
      step: "PASTOR",
      reason: AUDIT_REDACTED,
    });
  });

  it("keeps field names and export filters without nested narrative", () => {
    expect(
      redactAuditMetadata("person.patch", {
        fields: ["fullName", "birthDate"],
        isMinor: true,
        hasGuardian: false,
      }),
    ).toEqual({
      fields: ["fullName", "birthDate"],
      isMinor: AUDIT_REDACTED,
      hasGuardian: AUDIT_REDACTED,
    });
    expect(
      redactAuditMetadata("person.patch", {
        fields: ["fullName", PIX_CPF],
      }),
    ).toEqual({
      fields: AUDIT_REDACTED,
    });
    expect(
      redactAuditMetadata("pastoral.export", {
        count: 1,
        caseIds: ["case-sintetico"],
        purpose: "pastoral_care_export",
        filters: {
          personId: "person-sintetico",
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-11-09T00:00:00.000Z",
          status: "OPEN",
          summary: RELIGIOUS_PII,
        },
      }),
    ).toEqual({
      count: 1,
      caseIds: ["case-sintetico"],
      purpose: "pastoral_care_export",
      filters: {
        personId: "person-sintetico",
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-11-09T00:00:00.000Z",
        status: "OPEN",
        summary: AUDIT_REDACTED,
      },
    });
  });

  it("keeps a phone presence flag and masks the number itself", () => {
    expect(
      redactAuditMetadata("volunteer_interest.create_public", {
        ministrySlug: "louvor",
        hasPhone: true,
      }),
    ).toEqual({
      ministrySlug: "louvor",
      hasPhone: true,
    });
    expect(
      redactAuditMetadata("volunteer_interest.create_public", {
        hasPhone: PIX_PHONE,
      }),
    ).toEqual({
      hasPhone: AUDIT_REDACTED,
    });
  });

  it("does not log the payload it redacts", () => {
    const debug = jest.spyOn(console, "debug").mockImplementation(() => {});
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      redactAuditMetadata("pastoral.case.create", {
        prayerRequest: RELIGIOUS_PII,
        pixKey: PIX_EMAIL,
        apiKey: API_KEY,
      });
      expect(debug).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally {
      debug.mockRestore();
      log.mockRestore();
      error.mockRestore();
    }
  });

  it("masks nested secrets, unicode tricks and prototype keys", () => {
    const nested = redactAuditMetadata("pastoral.case.create", {
      filters: {
        status: "OPEN",
        filters: {
          personId: "person-sintetico",
          filters: {
            password: PASSWORD,
            email: PIX_EMAIL,
          },
        },
      },
    });
    const deep = redactAuditMetadata("pastoral.case.create", {
      filters: {
        filters: {
          filters: {
            filters: {
              password: PASSWORD,
              summary: RELIGIOUS_PII,
            },
          },
        },
      },
    });
    const cyrillicSenha = `Louvor s${"\u0435"}nha`;
    const proto = redactAuditMetadata(
      "admission.advance",
      JSON.parse(
        '{"status":"OPEN","__proto__":{"polluted":"yes"},"password":"senha-sintetica"}',
      ),
    );
    const text = serialized({
      nested,
      deep,
      homoglyph: redactAuditMetadata("ministry.create", {
        name: cyrillicSenha,
        slug: "louvor-sintetico",
      }),
      zeroWidth: redactAuditMetadata("ministry.create", {
        name: "Louvor\u200bsenha",
        slug: "louvor-sintetico",
      }),
      fullwidthCpf: redactAuditMetadata("ministry.create", {
        name: "０００．０００．０００－００",
      }),
      accent: redactAuditMetadata("ministry.create", {
        name: "Louvor Sintético",
      }),
      numericHash: redactAuditMetadata("auth.login", {
        emailFingerprint: "1".repeat(32),
      }),
    });
    for (const secret of [
      PASSWORD,
      PIX_EMAIL,
      RELIGIOUS_PII,
      cyrillicSenha,
      "Louvor\u200bsenha",
      "０００．０００．０００－００",
      "1".repeat(32),
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(JSON.stringify(proto)).not.toContain("polluted");
    expect(proto).toEqual({ status: "OPEN", password: AUDIT_REDACTED });
    expect(nested).toMatchObject({
      filters: {
        status: "OPEN",
        filters: { personId: "person-sintetico" },
      },
    });
    expect(
      redactAuditMetadata("ministry.create", { name: "Louvor Sintético" }),
    ).toEqual({ name: "Louvor Sintético" });
    const circular: Record<string, unknown> = { status: "OPEN" };
    circular.filters = circular;
    expect(() => redactAuditMetadata("admission.advance", circular)).not.toThrow();
  });
});
