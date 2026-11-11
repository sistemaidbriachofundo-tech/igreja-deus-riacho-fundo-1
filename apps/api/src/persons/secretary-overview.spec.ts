import { buildSecretaryOverview, secretaryPeriod } from "./secretary-overview";
import { normalizeProfileDate } from "./cadastral-patch";

const date = (value: string) => new Date(value);
const now = date("2026-11-12T01:00:00Z");
const base = {
  id: "p", displayName: "Pessoa de teste", kind: "VISITOR", status: "ACTIVE",
  birthDate: null, baptismDate: null, weddingDate: null, firstAttendedOn: null,
  sex: null, memberships: [],
  createdAt: date("2026-11-01T11:00:00Z"), updatedAt: date("2026-11-05T12:00:00Z"),
};

describe("Painel da Secretaria", () => {
  it("conta pessoas sem vínculo e separa pendências, transferidos e inativos", () => {
    const person = (id: string, status: string) => ({
      ...base, id, kind: "MEMBER", memberships: [{ status, joinedAt: date("2023-11-09") }],
    });
    const data = buildSecretaryOverview([
      { ...base, birthDate: date("1990-11-11"), firstAttendedOn: date("2023-11-10"), sex: "FEMALE" },
      person("active", "ACTIVE"),
      person("pending", "PENDING_ADMISSION"),
      person("inactive", "INACTIVE"),
      person("transfer", "TRANSFERRED"),
    ], [], secretaryPeriod(undefined, undefined, now));
    expect(data.today).toBe("2026-11-11");
    expect(data.byCategory).toEqual({ membros: 1, nao_membros: 1, inativos: 1, em_admissao: 1, transferidos: 1 });
    expect(data.demographics.missingBirthDate).toBe(2);
    expect(data.demographics.age.find(row => row.label === "31 a 40 anos")?.count).toBe(1);
    expect(data.celebrations.birth).toEqual([{ id: "p", name: "Pessoa de teste", date: "2026-11-11" }]);
  });

  it("só contabiliza no filtro os eventos dentro do dia civil de Brasília", () => {
    const period = secretaryPeriod("2026-11-11", "2026-11-11", now);
    const data = buildSecretaryOverview([], [
      { at: date("2026-11-11T02:59:59Z"), type: "admissoes" },
      { at: date("2026-11-11T03:00:00Z"), type: "transferenciasEntrada" },
      { at: now, type: "transferenciasSaida" },
    ], period);
    expect(data.movements.period).toEqual({ admissoes: 0, transferenciasEntrada: 1, transferenciasSaida: 1 });
    expect(data.movements.byMonth["2026-11"].admissoes).toBe(1);
    expect(() => secretaryPeriod("2026-11-31", undefined, now)).toThrow("datas válidas");
    expect(() => normalizeProfileDate("2026-02-30")).toThrow("data válida");
  });
});
