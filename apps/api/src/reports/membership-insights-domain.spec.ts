import { buildMembershipInsights, parseInsightsPeriod } from "./membership-insights-domain";

const date = (s: string) => new Date(s + "T12:00:00.000Z");
const person = (overrides: Record<string, unknown> = {}) => ({
  id: "p1",
  displayName: "Pessoa Exemplo",
  birthDate: date("1990-11-12"),
  baptismDate: date("2010-11-20"),
  weddingDate: date("2018-11-15"),
  firstAttendedOn: date("2005-01-10"),
  sex: "FEMALE",
  isMinor: false,
  createdAt: date("2026-11-04"),
  ...overrides,
});

describe("Membership Insights RF1", () => {
  it("valida períodos e rejeita calendário impossível", () => {
    expect(() => parseInsightsPeriod("2026-02-31", "2026-11-11")).toThrow();
    expect(() => parseInsightsPeriod("2026-11-12", "2026-11-11")).toThrow();
    expect(() => parseInsightsPeriod("2020-01-01", "2026-11-11")).toThrow();
    expect(parseInsightsPeriod("2026-11-01", "2026-11-11").from.toISOString()).toMatch(/^2026-11-01/);
  });
  it("não expõe nomes de menores e preserva as contagens", () => {
    const now = date("2026-11-11");
    const report = buildMembershipInsights({
      churchId: "church-rf1", churchName: "Riacho 1", now,
      period: parseInsightsPeriod("2026-01-01", "2026-11-11", now),
      memberships: [
        { id: "m1", status: "ACTIVE", joinedAt: date("2024-06-01"), leftAt: null, person: person() },
        { id: "m2", status: "ACTIVE", joinedAt: date("2026-02-01"), leftAt: null,
          person: person({id:"minor-1",displayName:"MENOR PROTEGIDO",birthDate:date("2015-11-12"),sex:"MALE",isMinor:true}) },
        { id: "m3", status: "INACTIVE", joinedAt: date("2022-01-10"), leftAt: date("2026-09-09"),
          person: person({id:"p3",displayName:"Pessoa Inativa",birthDate:null}) },
      ],
      transfers: [
        { status:"COMPLETED",fromChurchId:"other",toChurchId:"church-rf1",completedAt:date("2026-06-01") },
        { status:"COMPLETED",fromChurchId:"church-rf1",toChurchId:"other",completedAt:date("2026-06-04") },
      ],
      registeredPersons: 4, visitorsActive:1,
      recentPeople: [
        { id:"p1",displayName:"Pessoa Exemplo",createdAt:date("2026-11-04"),kind:"MEMBER" },
      ],
    });
    expect(report.totals.activeMembers).toBe(2);
    expect(report.totals.inactiveMembers).toBe(1);
    expect(report.ages.bands.reduce((sum,r)=>sum+r.count,0)).toBe(2);
    expect(report.bySex.FEMALE).toBe(1);
    expect(report.bySex.MALE).toBe(1);
    expect(report.occasions.some(o=>o.name==="MENOR PROTEGIDO")).toBe(false);
    expect(report.occasions.some(o=>o.name==="Pessoa Exemplo" && o.type==="birthday")).toBe(true);
    expect(report.movements.netTransfers).toBe(0);
    expect(report.growth.months.some(row=>row.label==="2026-09" && row.exits===1)).toBe(true);
    expect(report.recent.length).toBe(1);
    const staleMinor = buildMembershipInsights({
      churchId: "church-rf1", churchName: "Riacho 1", now,
      period: parseInsightsPeriod("2026-01-01", "2026-11-11", now),
      memberships: [{ id:"m4", status:"ACTIVE", joinedAt:date("2026-01-01"), leftAt:null,
        person:person({ id:"p4",displayName:"CRIANÇA SEM FLAG",isMinor:false,birthDate:date("2015-11-12") }) }],
      transfers:[],registeredPersons:1,visitorsActive:0,
      recentPeople:[{id:"p4",displayName:"CRIANÇA SEM FLAG",createdAt:date("2026-11-09"),kind:"MEMBER",isMinor:false,birthDate:date("2015-11-12")}],
    });
    expect(staleMinor.occasions).toEqual([]);
    expect(staleMinor.recent).toEqual([]);
  });
  it("expõe estado vazio sem inventar pessoas ou crescimento", () => {
    const now=date("2026-11-11");
    const report=buildMembershipInsights({memberships:[],transfers:[],recentPeople:[],registeredPersons:0,visitorsActive:0,churchId:"rf1",churchName:"RF1",now,period:parseInsightsPeriod(undefined,undefined,now)});
    expect(report.totals.registeredPersons).toBe(0);
    expect(report.coverage.activeTotal).toBe(0);
    expect(report.occasions).toEqual([]);
    expect(report.growth.months.length).toBe(12);
  });
});
