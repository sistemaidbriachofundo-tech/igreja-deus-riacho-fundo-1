import {describe,expect,it} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {ViviEditorialAssistant} from "../components/ViviEditorialAssistant";
import {SiteTeamManager} from "../components/SiteTeamManager";
import {SiteMediaUploader} from "../components/SiteMediaUploader";
describe("Vivi + site management public-safe UI",()=>{
  it("makes mock status, consent and human approval explicit",()=>{
    const html=renderToStaticMarkup(<ViviEditorialAssistant token="synthetic" onApply={()=>{}}/>);
    expect(html).toContain("Vivi");
    expect(html).toContain("não salva");
    expect(html).toContain("Concordo em enviar");
    expect(html).toContain("Pedir sugestão");
  });
  it("restricts the team panel to signed-in component and only existing accounts",()=>{
    const html=renderToStaticMarkup(<SiteTeamManager token="synthetic"/>);
    expect(html).toContain("Equipe de comunicação");
    expect(html).toContain("contas que já existem");
  });
  it("requires rights confirmation for uploads",()=>{
    const html=renderToStaticMarkup(<SiteMediaUploader token="synthetic" onSelect={()=>{}}/>);
    expect(html).toContain("autorização de uso");
    expect(html).toContain('type="file"');
  });
});
