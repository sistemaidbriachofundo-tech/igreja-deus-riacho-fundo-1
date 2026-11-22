import { describe, expect, it } from "@jest/globals";
import { BadRequestException } from "@nestjs/common";
import { RF1_SERVICE_ORDER_DEFAULTS as p, brasiliaInstant, buildServiceMoments, chooseRoleCandidate, exceptionFor, monthServiceDates, parseOrderRules } from "./service-order-planning.domain";

describe("OC: regras e prévia mensal", () => {
  it("gera 13 cultos no mês em Brasília, com domingo manhã/noite e quinta", () => {
    const rows = monthServiceDates(2026, 12, p);
    expect(rows).toHaveLength(13);
    expect(rows[0].serviceAt).toBe("2026-12-03T23:00:00.000Z");
    expect(rows[1].serviceAt).toBe("2026-12-06T13:00:00.000Z");
    expect(rows[2].serviceAt).toBe("2026-12-06T22:00:00.000Z");
  });
  it("não aceita datas e parâmetros inválidos",()=>{
    expect(()=>monthServiceDates(2026,13,p)).toThrow();
    expect(()=>parseOrderRules({...p,maxMonthlyAssignments:0})).toThrow(BadRequestException);
    expect(()=>parseOrderRules({...p,services:[p.services[0],p.services[0]]})).toThrow();
    expect(brasiliaInstant(2026,12,6,"10:00")).toBe("2026-12-06T13:00:00.000Z");
  });
  it("não atribui pessoa indisponível ou sem confirmação e mantém função vazia",()=>{
    const c=[{personId:"p1",displayName:"Pessoa QA",rosterId:"r1",roleLabel:"Dirigente",status:"PENDING" as const}];
    expect(chooseRoleCandidate("director","2026-12-06T13:00:00Z",c,[],new Set(),p,()=>true)).toBeNull();
    expect(buildServiceMoments(null,null,null,null,p)[6].responsible).toBe("A definir");
  });
  it("participações futuras não interferem no histórico anterior",()=>{
    const c=[{personId:"p1",displayName:"Pessoa QA",rosterId:"r1",roleLabel:"Dirigente",status:"CONFIRMED" as const}];
    const future=[{personId:"p1",serviceAt:"2027-01-31T13:00:00Z",role:"director"}];
    expect(chooseRoleCandidate("director","2026-12-03T23:00:00Z",c,future,new Set(),p,()=>true)?.personId).toBe("p1");
  });
  it("não repete diretor como pregador no mesmo culto nem supera teto mensal",()=>{
    const c=[{personId:"p1",displayName:"Pessoa QA",rosterId:"r1",roleLabel:"Dirigente e Pregador",status:"CONFIRMED" as const}];
    expect(chooseRoleCandidate("preacher","2026-12-06T13:00:00Z",c,[],new Set(["p1"]),p,()=>true)).toBeNull();
    const history=[{personId:"p1",serviceAt:"2026-12-01T13:00:00Z",role:"director"},{personId:"p1",serviceAt:"2026-12-03T13:00:00Z",role:"director"}];
    expect(chooseRoleCandidate("director","2026-12-20T13:00:00Z",c,history,new Set(),p,()=>true)).toBeNull();
  });
  it("conta o teto no mês de Brasília mesmo quando o instante UTC cai no mês seguinte", () => {
    const late = brasiliaInstant(2027, 1, 31, "22:00");
    expect(late.startsWith("2027-02-01")).toBe(true);
    const person = { personId: "p1", displayName: "Pessoa QA", rosterId: "r1", roleLabel: "Dirigente", status: "CONFIRMED" as const };
    const history = [
      { personId: "p1", serviceAt: brasiliaInstant(2027, 1, 3, "10:00"), role: "director" },
      { personId: "p1", serviceAt: brasiliaInstant(2027, 1, 17, "10:00"), role: "director" },
    ];
    expect(chooseRoleCandidate("director", late, [person], history, new Set(), { ...p, minIntervalDays: 0 }, () => true)).toBeNull();
  });
  it("continua o rodízio por pessoa e registra exceção sem nome fixo", () => {
    const experienced = { personId: "id-aaa", displayName: "Ana", rosterId: "r1", roleLabel: "Dirigente", status: "CONFIRMED" as const };
    const fresh = { ...experienced, personId: "id-zzz", displayName: "Bia" };
    const prior = [1, 2, 3].map((day) => ({ personId: "id-aaa", serviceAt: brasiliaInstant(2026, 10, day, "10:00"), role: "director" }));
    const open = { ...p, minIntervalDays: 0, maxMonthlyAssignments: 8 };
    expect(chooseRoleCandidate("director", "2026-12-03T23:00:00.000Z", [experienced, fresh], prior, new Set(), open, () => true)?.personId).toBe("id-zzz");
    const rules = parseOrderRules({ ...p, exceptions: [{ serviceAt: "2026-12-03", kind: "SKIP", note: "Congresso fora do templo" }] });
    expect(exceptionFor(rules, "2026-12-03T23:00:00.000Z")?.kind).toBe("SKIP");
    expect(() => parseOrderRules({ ...p, exceptions: [{ serviceAt: "2026-12-03", kind: "SPECIAL", note: "Bispo Fulano" }] })).toThrow(BadRequestException);
  });
});
