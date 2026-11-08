import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AssetsBoard, canChangeAssetStatus } from "./AssetsBoard";
import { EducationBoard } from "./EducationBoard";

describe("Ensino/EBD — jornadas institucionais",()=>{
  it("não gera matrículas, certificado ou aulas sem curso e turma selecionados",()=>{
    const html=renderToStaticMarkup(<EducationBoard courses={[]} token="token-falso"
      roles={["SECRETARIA"]} refresh={()=>{}}/>);
    expect(html).toContain("Jornada de ensino e EBD");
    expect(html).toContain("0</strong>");
    expect(html).toContain("Selecione um curso");
    expect(html).not.toContain("Marcar presença");
    expect(html).not.toContain("Certificado emitido");
    expect(html).not.toContain("token-falso");
  });
  it("mostra só cursos fornecidos pela API, sem inserir nomes de pessoas",()=>{
    const html=renderToStaticMarkup(<EducationBoard courses={[
      {id:"c-01",name:"TESTE Curso de formação",status:"ACTIVE"},
    ]} token="token-falso" roles={["PASTOR"]} refresh={()=>{}}/>);
    expect(html).toContain("TESTE Curso de formação");
    expect(html).not.toContain("Nome de aluno real");
  });
});
describe("Patrimônio — governança e auditoria",()=>{
  it("exige motivo escrito para mudar status do bem",()=>{
    expect(canChangeAssetStatus("ACTIVE","LOST","")).toBe(false);
    expect(canChangeAssetStatus("ACTIVE","DISPOSED","curto")).toBe(false);
    expect(canChangeAssetStatus("ACTIVE","MAINTENANCE","Teste: revisão")).toBe(true);
    expect(canChangeAssetStatus("ACTIVE","ACTIVE","motivo longo")).toBe(false);
  });
  it("lista só os bens conhecidos da API e não renderiza histórico não buscado",()=>{
    const html=renderToStaticMarkup(<AssetsBoard assets={[
      {id:"a-01",name:"TESTE Cadeira auditório",status:"MAINTENANCE",location:"Sala fictícia"}
    ]} token="token-falso" roles={["TESOURARIA"]} refresh={()=>{}}/>);
    expect(html).toContain("TESTE Cadeira auditório");
    expect(html).toContain("Em manutenção");
    expect(html).toContain("Selecione um bem");
    expect(html).not.toContain("token-falso");
    expect(html).not.toContain("Histórico de alterações");
  });
});
