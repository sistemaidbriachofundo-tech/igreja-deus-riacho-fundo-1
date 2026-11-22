import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RosterModuleCatalog } from "./RosterModuleCatalog";

describe("configuração de regras da escala", () => {
  const modules = [{ id: "recepcao", name: "Recepção" }, { id: "ofertas", name: "Ofertas" }];
  const actions = { ministryId: "atmosfera", token: "teste", members: [], onRefresh() {}, onOpen() {} };

  it.each([[undefined, "Recepção"], ["ofertas", "Ofertas"]])(
    "abre o formulário do módulo correto com filtro %s", (initialId, name) => {
      const html = renderToStaticMarkup(<RosterModuleCatalog actions={actions} modules={modules}
        initialId={initialId} onRulesSaved={() => {}} />);
      expect(html).toContain("Módulo para editar");
      expect(html).toContain("Regras de " + name);
      expect(html).toContain("Salvar regras");
    },
  );
});
