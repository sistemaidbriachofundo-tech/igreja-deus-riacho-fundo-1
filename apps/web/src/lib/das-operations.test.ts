import { describe, expect, it } from "vitest";
import {
  DAS_MODULES, DAS_RESOURCE_TABS, canViewDasModule, dasError, formatChurchDate,
  parseAmountCents, formatBRL, churchLocalToISO,
  readDasRows, readDasSummary, scalarLabel, shortStatus
} from "./das-operations";

describe("DAS — catálogo de módulos integrados",()=>{
  it("cobre os domínios sem exibir informações sensíveis sem autenticação",()=>{
    expect(DAS_MODULES.map(x=>x.id)).toEqual([
      "pastoral","discipulado","celulas","ministerios","escalas","financeiro","eventos","educacao","patrimonio","indicadores"
    ]);
    expect(DAS_MODULES.every(x=>x.endpoint.startsWith("/"))).toBe(true);
    expect(DAS_RESOURCE_TABS.financeiro?.map(v=>v.envelope)).toEqual([
      "accounts","entries","batches","reconciliations"
    ]);
    expect(DAS_RESOURCE_TABS.indicadores?.map(v=>v.dataKind)).toEqual([
      "summary","summary"
    ]);
  });
  it("administrador não ganha direito implícito ao sigilo pastoral ou financeiro",()=>{
    expect(canViewDasModule(["PLATFORM_ADMIN"],["PASTOR"])).toBe(false);
    expect(canViewDasModule(["PLATFORM_ADMIN"],["TESOURARIA"])).toBe(false);
    expect(canViewDasModule(["PASTOR"],["PASTOR"])).toBe(true);
    expect(canViewDasModule(["TESOURARIA"],["TESOURARIA"])).toBe(true);
  });
  it("ensino e patrimônio só aparecem para papéis do contrato NestJS",()=>{
    const education=DAS_MODULES.find(m=>m.id==="educacao")!;
    const assets=DAS_MODULES.find(m=>m.id==="patrimonio")!;
    expect(education.endpoint).toBe("/courses");
    expect(assets.endpoint).toBe("/assets");
    expect(education.envelope).toBe("courses");
    expect(assets.envelope).toBe("assets");
    for(const role of ["PASTOR","SECRETARIA","LIDER_MINISTERIO","PLATFORM_ADMIN"]){
      expect(canViewDasModule([role],education.allowedRoles)).toBe(true);
    }
    expect(canViewDasModule(["TESOURARIA"],education.allowedRoles)).toBe(false);
    for(const role of ["PASTOR","SECRETARIA","TESOURARIA","PLATFORM_ADMIN"]){
      expect(canViewDasModule([role],assets.allowedRoles)).toBe(true);
    }
    expect(canViewDasModule(["LIDER_MINISTERIO"],assets.allowedRoles)).toBe(false);
    expect(canViewDasModule(["MEMBRO"],assets.allowedRoles)).toBe(false);
    expect(readDasRows({courses:[]},"courses")).toEqual([]);
    expect(readDasRows({assets:[]},"assets")).toEqual([]);
    expect(()=>readDasRows({data:[]},"assets")).toThrow();
  });
  it("membro não acessa módulos sigilosos",()=>{
    expect(canViewDasModule(["MEMBRO"],["PASTOR"])).toBe(false);
    // GET /rosters é exclusivo de equipe autorizada. MEMBRO só confirma por ID.
    const roster=DAS_MODULES.find(module=>module.id==="escalas")!;
    expect(canViewDasModule(["MEMBRO"],roster.allowedRoles)).toBe(false);
    expect(canViewDasModule(["LIDER_MINISTERIO"],roster.allowedRoles)).toBe(true);
    expect(canViewDasModule(["MEMBRO"],["TESOURARIA"])).toBe(false);
  });
});

describe("DAS — respostas de API",()=>{
  it("lê envelope oficial em vez de fabricar valores",()=>{
    expect(readDasRows({rosters:[{id:"r1",title:"Culto de teste"}]},"rosters"))
      .toEqual([{id:"r1",title:"Culto de teste"}]);
    expect(readDasRows({groups:[]},"groups")).toEqual([]);
  });
  it("rejeita estrutura inválida em vez de mostrar lista vazia",()=>{
    expect(()=>readDasRows({other:[]},"rosters")).toThrow(/Formato inesperado/);
    expect(()=>readDasRows({rosters:[null]},"rosters")).toThrow(/Registro inválido/);
    expect(()=>readDasRows({rosters:"fake"},"rosters")).toThrow();
    expect(()=>readDasSummary(null)).toThrow();
    expect(readDasSummary({stub:true,persons:4})).toEqual({stub:true,persons:4});
  });
  it("não insere objetos, anotações ou datas inválidas como títulos de listagens",()=>{
    expect(scalarLabel({name:{x:"confidencial"},title:"Escala de teste"},["name","title"]))
      .toBe("Escala de teste");
    expect(scalarLabel({notes:"Segredo"},["title","name"])).toBe("Registro");
    expect(shortStatus({status:"PENDING_APPROVAL"})).toBe("PENDING APPROVAL");
    expect(shortStatus({status:"<script>"})).toBe("Sem estado público");
    expect(formatChurchDate("data inválida")).toBe("Data não informada");
  });
  it("não exibe mensagens técnicas da API nas telas",()=>{
    expect(dasError(new Error("GET /pastoral-cases falhou (403)"))).toMatch(/autorização/);
    expect(dasError(new Error("POST /rosters falhou (409)"))).toMatch(/Conflito/);
    expect(dasError(new Error("sensitive internal connection url"))).not.toContain("internal connection");
  });
});

describe("Tesouraria — valores sem arredondamento",()=>{
  it.each([
    ["1",100],["1,5",150],["1,05",105],["1234,56",123456],
    ["1.234,56",123456],["1234.56",123456],["10.000",1000000],
  ])("converte %s exatamente para %i centavos",(amount,expected)=>{
    expect(parseAmountCents(amount)).toBe(expected);
  });
  it.each(["","0","0,00","-12,50","1,234","1,2,3","R$ 10,00","1e3","1.2.3","NaN","Infinity"])(
    "rejeita valor inválido %s",value=>expect(parseAmountCents(value)).toBeNull()
  );
  it("exibe BRL correto sem ponto flutuante de entrada",()=> {
    expect(formatBRL(123456)).toContain("1.234,56");
  });
});

describe("Datas da igreja — fuso de São Paulo independente do usuário",()=>{
  it.each([
    ["2026-11-07T18:00","2026-11-07T21:00:00.000Z"],
    ["2027-01-01T09:30","2027-01-01T12:30:00.000Z"],
    ["2026-12-31T23:30","2027-01-01T02:30:00.000Z"],
  ])("converte %s para %s", (local,utc)=>{
    expect(churchLocalToISO(local)).toBe(utc);
  });
  it.each(["2026-02-30T12:00","2026-11-07T24:00","2026-11-07T18:60","2026-11-07","nunca"])(
    "rejeita horário inválido %s",value=>expect(churchLocalToISO(value)).toBeNull()
  );
});
