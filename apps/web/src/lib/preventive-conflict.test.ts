import { describe, expect, it } from "vitest";
import { ApiRequestError } from "./api";
import { readPreventiveConflict } from "./preventive-conflict";

const conflict = (value: unknown, status = 409) => new ApiRequestError(JSON.stringify(value), status, "http");

describe("preventive conflict reader", () => {
  it("keeps an exact identity pointer without contact or document", () => {
    expect(readPreventiveConflict(conflict({
      code: "PERSON_IDENTITY_EXACT",
      blocking: true,
      existing: { id: "p1", status: "ACTIVE", email: "ana@example.test", identityDocument: "52998224725" },
    }))).toEqual({
      code: "PERSON_IDENTITY_EXACT",
      title: "Cadastro já existente",
      message: expect.stringContaining("Nenhum contato"),
      action: "Abrir ficha",
      cancel: "Voltar",
      existing: { id: "p1", status: "ACTIVE" },
      blocking: true,
      acknowledgeField: undefined,
      ledger: undefined,
    });
  });

  it("allows a homonym to continue and a blocked schedule conflict to stop", () => {
    expect(readPreventiveConflict(conflict({ code: "PERSON_POSSIBLE_HOMONYM", existing: { id: "p2", status: "ACTIVE" } }))?.acknowledgeField)
      .toBe("acknowledgeHomonym");
    expect(readPreventiveConflict(conflict({
      code: "SERVICE_ORDER_SCHEDULE_CONFLICT",
      blocking: true,
      existing: { id: "r1", status: "PUBLISHED" },
    }))?.acknowledgeField).toBeUndefined();
  });

  it("does not treat forbidden, malformed or event registration conflicts as this contract", () => {
    expect(readPreventiveConflict(conflict({ code: "PERSON_IDENTITY_EXACT", existing: { id: "p1", status: "ACTIVE" } }, 403))).toBeNull();
    expect(readPreventiveConflict(conflict({ code: "EVENT_REGISTRATION_DUPLICATE", existing: { id: "r1", status: "CONFIRMED" } }))).toBeNull();
    expect(readPreventiveConflict(conflict({ code: "PERSON_IDENTITY_EXACT", existing: {} }))?.existing).toBeUndefined();
    expect(readPreventiveConflict(new Error("duplicate"))).toBeNull();
  });
});
