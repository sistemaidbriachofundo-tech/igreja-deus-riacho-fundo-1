import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PersonPicker,
  canSearchPersons,
  filterPersonOptions,
} from "./PersonPicker";

describe("Pesquisa de pessoas — política de acesso", () => {
  it("permite busca só a quem o backend aceita", () => {
    expect(canSearchPersons(["PASTOR"])).toBe(true);
    expect(canSearchPersons(["SECRETARIA"])).toBe(true);
    expect(canSearchPersons(["PLATFORM_ADMIN"])).toBe(true);
    expect(canSearchPersons(["LIDER_MINISTERIO"])).toBe(false);
    expect(canSearchPersons(["MEMBRO"])).toBe(false);
  });
  it("preserva a referência manual sem expor a busca global para líder não autorizado", () => {
    const html = renderToStaticMarkup(
      <PersonPicker
        token="token-falso"
        roles={["LIDER_MINISTERIO"]}
        label="Voluntário"
        value=""
        onChange={() => {}}
        required
      />,
    );
    expect(html).toContain("Código do cadastro");
    expect(html).not.toContain("Buscar pelo nome");
  });
  it("não mostra dados de terceiros no HTML estático para o pastor", () => {
    const html = renderToStaticMarkup(
      <PersonPicker
        token="token-falso"
        roles={["PASTOR"]}
        label="Pessoa atendida"
        value=""
        onChange={() => {}}
      />,
    );
    expect(html).toContain("Buscar pelo nome");
    expect(html).not.toContain("example.test");
  });
  it("reflete seleção pré-existente sem exibir token", () => {
    const html = renderToStaticMarkup(
      <PersonPicker
        token="token-ultrassecreto"
        roles={["SECRETARIA"]}
        label="Pessoa"
        value="person-test-01"
        onChange={() => {}}
      />,
    );
    expect(html).toContain("Selecionado");
    expect(html).not.toContain("token-ultrassecreto");
  });
});

describe("Seleção de responsáveis e integrantes", () => {
  const options = [
    { id: "adulto-1", displayName: "João da Silva", isMinor: false },
    { id: "menor-1", displayName: "Joana Santos", isMinor: true },
    { id: "adulto-2", displayName: "Joaquim Alves", isMinor: false },
  ];
  it("considera acentos, caixa e espaços na busca pelo nome", () => {
    expect(
      filterPersonOptions(options, "  JOAO  ").map((person) => person.id),
    ).toEqual(["adulto-1"]);
  });
  it("exclui a própria pessoa e menores na seleção de responsável", () => {
    expect(
      filterPersonOptions(options, "jo", ["adulto-1"], true).map(
        (person) => person.id,
      ),
    ).toEqual(["adulto-2"]);
  });
  it("mantém menores elegíveis para uma equipe quando não há restrição etária", () => {
    expect(
      filterPersonOptions(options, "jo", ["adulto-1"]).map(
        (person) => person.id,
      ),
    ).toEqual(["menor-1", "adulto-2"]);
  });
  it("permite seleção local por nome sem habilitar consulta global para líder", () => {
    const html = renderToStaticMarkup(
      <PersonPicker
        token="não-publicar"
        roles={["LIDER_MINISTERIO"]}
        label="Pessoa"
        value=""
        onChange={() => {}}
        options={options}
      />,
    );
    expect(html).toContain('role="combobox"');
    expect(html).not.toContain("Código do cadastro");
    expect(html).not.toContain("não-publicar");
  });
});
