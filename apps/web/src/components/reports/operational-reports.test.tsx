import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { formatBRL } from "../../lib/das-operations";
import { OperationalReports, type MinistryCostReport, type Slot } from "./operational-reports";

const noop = () => undefined;
const idle = <T,>(): Slot<T> => ({ state: "loading" });

function view(cost: Slot<MinistryCostReport>) {
  return renderToStaticMarkup(
    <OperationalReports
      membership={idle()}
      ministries={idle()}
      participation={{
        state: "ready",
        data: {
          counts: {
            registrations: 1,
            cancelled: 0,
            checkedIn: 0,
            pendingPayment: 0,
            confirmedAwaitingPresence: 1,
            unclassified: 0,
            minorsOmitted: 1,
          },
          rows: [{
            registrationId: "r1",
            eventName: "Encontro",
            status: "CONFIRMED",
            partySize: 1,
            syntheticLabel: "ana@example.test",
            labelRedacted: false,
          }],
        },
      }}
      cost={cost}
      from=""
      to=""
      ministryId=""
      status=""
      busy={false}
      onFrom={noop}
      onTo={noop}
      onMinistry={noop}
      onStatus={noop}
      onApply={noop}
      onDownload={noop}
    />,
  );
}

describe("relatórios operacionais", () => {
  it("omite rótulo pessoal e não desenha custo quando a consulta falha", () => {
    const html = view({ state: "error", message: "A consulta de custo falhou." });
    expect(html).toContain("Rótulo omitido");
    expect(html).not.toContain("ana@example.test");
    expect(html).toContain("Nenhum número foi colocado no lugar da consulta");
    expect(html).not.toContain(formatBRL(0));
  });

  it("não transforma ministério sem vínculo em zero", () => {
    const html = view({
      state: "ready",
      data: {
        note: "Sem vínculo o valor fica ausente.",
        seriesMatch: true,
        series: [],
        rows: [{
          ministryId: "m-jovens",
          name: "Jovens",
          attributed: false,
          expenseCents: null,
          approvedEntries: null,
          note: "O custo não foi calculado.",
        }],
      },
    });
    expect(html).toContain("Custo não calculado");
    expect(html).not.toContain("R$");
  });

  it("mostra o zero somente quando o ledger vinculou o ministério", () => {
    const html = view({
      state: "ready",
      data: {
        note: "Custo consultado.",
        seriesMatch: true,
        series: [{ label: "Jovens", expenseCents: 0 }],
        rows: [{
          ministryId: "m-jovens",
          name: "Jovens",
          attributed: true,
          expenseCents: 0,
          approvedEntries: 0,
          note: "Despesa líquida aprovada.",
        }],
      },
    });
    expect(html).toContain(formatBRL(0));
    expect(html).toContain("Lançamentos aprovados");
  });
});
