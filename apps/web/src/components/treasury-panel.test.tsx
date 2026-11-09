import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TreasuryPanel } from "./TreasuryPanel";

const original = process.env.NEXT_PUBLIC_HML_ENABLED;

beforeEach(() => {
  process.env.NEXT_PUBLIC_HML_ENABLED = "true";
});

afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_HML_ENABLED;
  else process.env.NEXT_PUBLIC_HML_ENABLED = original;
});

describe("TreasuryPanel", () => {
  it("mostra as quatro medidas separadas e a ilustração que não é saldo da igreja", () => {
    const html = renderToStaticMarkup(<TreasuryPanel />);
    expect(html).toContain("Receita recebida");
    expect(html).toContain("A receber");
    expect(html).toContain("Caixa liquidado");
    expect(html).toContain("Despesa comprometida");
    expect(html).toContain("não é saldo da igreja");
    expect(html).toContain(`R$\u00a0100,00`);
    expect(html).toContain(`R$\u00a080,00`);
    expect(html).toContain(`R$\u00a050,00`);
    expect(html).toContain(`R$\u00a0180,00`);
    expect(html).toContain("Banco, Pix e maquininha estão bloqueados");
    expect(html).toContain("PR #101");
    expect(html).not.toContain("saldo da igreja é");
    expect(html).toContain("Sem consulta");
  });

  it("não oferece gravação quando a homologação da interface está desligada", () => {
    process.env.NEXT_PUBLIC_HML_ENABLED = "false";
    const html = renderToStaticMarkup(<TreasuryPanel />);
    expect(html).toContain("gravação fica desligada");
    expect(html).toContain("disabled");
  });
});
