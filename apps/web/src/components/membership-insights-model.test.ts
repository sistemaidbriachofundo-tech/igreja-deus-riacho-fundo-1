import { describe, expect, it } from "vitest";
import { formattedDate, makeCsv, makeLinePoints, type MembershipInsightsData } from "./membership-insights-model";

const sample: MembershipInsightsData = {
  generatedAt: "2026-11-11T12:00:00Z", church:{id:"rf1",name:"Riacho Fundo 1"},
  period:{from:"2026-01-01",to:"2026-11-11"},
  totals:{registeredPersons:3,membershipRecords:2,activeMembers:1,inactiveMembers:1,pendingAdmission:0,transferred:0,visitorsActive:1},
  byStatus:{ACTIVE:1,INACTIVE:1},
  bySex:{FEMALE:1,MALE:0,OTHER:0,UNKNOWN:0},
  ages:{bands:[{label:"21–30",count:1}],missing:0},
  tenure:{attending:[],member:[],missingFirstAttendance:0},
  growth:{months:[{label:"2026-11",newMemberships:1,exits:0}],years:[]},
  movements:{transfersIn:0,transfersOut:0,netTransfers:0},
  occasions:[],recent:[],coverage:{activeWithBirthDate:1,activeTotal:1},
  notes:["Contagens do banco"],
};
describe("Membresia — formato e privacidade",()=>{
  it("exporta somente dados agregados e usa separador compatível com Excel",()=>{
    const csv=makeCsv(sample);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"Membros ativos";"1"');
    expect(csv).not.toContain("personId");
  });
  it("protege células CSV de fórmulas",()=>{
    const csv=makeCsv({...sample,church:{id:"rf1",name:"=WEBSERVICE(1)"}});
    expect(csv).toContain('"\'=WEBSERVICE(1)"');
  });
  it("usa a mesma escala para séries comparáveis",()=>{
    const p1=makeLinePoints([0,10],660,204,20);
    const p2=makeLinePoints([0,20],660,204,20);
    expect(p2[1].y).toBeLessThan(p1[1].y);
    expect(formattedDate("2026-11-11")).toMatch(/nov/i);
  });
});
