import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PersonPicker, canSearchPersons } from "./PersonPicker";

describe("Pesquisa de pessoas — política de acesso",()=>{
  it("permite busca só a quem o backend aceita",()=>{
    expect(canSearchPersons(["PASTOR"])).toBe(true);
    expect(canSearchPersons(["SECRETARIA"])).toBe(true);
    expect(canSearchPersons(["PLATFORM_ADMIN"])).toBe(true);
    expect(canSearchPersons(["LIDER_MINISTERIO"])).toBe(false);
    expect(canSearchPersons(["MEMBRO"])).toBe(false);
  });
  it("não dispara busca e pede ID de cadastro para líder não autorizado",()=>{
    const html=renderToStaticMarkup(<PersonPicker token="token-falso" roles={["LIDER_MINISTERIO"]}
      label="Voluntário" value="" onChange={()=>{}} required/>);
    expect(html).toContain("ID do cadastro fictício");
    expect(html).not.toContain("Buscar pessoa fictícia");
  });
  it("não mostra dados de terceiros no HTML estático para o pastor",()=>{
    const html=renderToStaticMarkup(<PersonPicker token="token-falso" roles={["PASTOR"]}
      label="Pessoa atendida" value="" onChange={()=>{}}/>);
    expect(html).toContain("Buscar pessoa fictícia");
    expect(html).not.toContain("example.test");
  });
  it("reflete seleção pré-existente sem exibir token",()=>{
    const html=renderToStaticMarkup(<PersonPicker token="token-ultrassecreto" roles={["SECRETARIA"]}
      label="Pessoa" value="person-test-01" onChange={()=>{}}/>);
    expect(html).toContain("Selecionado");
    expect(html).not.toContain("token-ultrassecreto");
  });
});
