import { describe, expect, it } from "vitest";
import {
  DAS_MODULES, canViewDasModule, dasError, formatChurchDate,
  readDasRows, readDasSummary, scalarLabel, shortStatus
} from "./das-operations";

describe("DAS — catálogo de módulos integrados",()=>{
  it("cobre os domínios sem exibir informações sensíveis sem autenticação",()=>{
    expect(DAS_MODULES.map(x=>x.id)).toEqual([
      "pastoral","discipulado","celulas","ministerios","escalas","financeiro","eventos","indicadores"
    ]);
    expect(DAS_MODULES.every(x=>x.endpoint.startsWith("/"))).toBe(true);
  });
  it("administrador não ganha direito implícito ao sigilo pastoral ou financeiro",()=>{
    expect(canViewDasModule(["PLATFORM_ADMIN"],["PASTOR"])).toBe(false);
    expect(canViewDasModule(["PLATFORM_ADMIN"],["TESOURARIA"])).toBe(false);
    expect(canViewDasModule(["PASTOR"],["PASTOR"])).toBe(true);
    expect(canViewDasModule(["TESOURARIA"],["TESOURARIA"])).toBe(true);
  });
  it("membro não acessa módulos sigilosos",()=>{
    expect(canViewDasModule(["MEMBRO"],["PASTOR"])).toBe(false);
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
