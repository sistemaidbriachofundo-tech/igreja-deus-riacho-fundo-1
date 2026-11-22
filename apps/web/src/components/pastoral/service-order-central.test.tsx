import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import uiStyles from "../ui/ui.module.css";
import orderStyles from "./service-order.module.css";
import { ServiceOrderCentral } from "./ServiceOrderDesk";

function scopeCss(file: string, sample: string) {
  const hash = sample.slice(sample.lastIndexOf("_") + 1);
  let css = readFileSync(file, "utf8");
  const names = [...new Set([...css.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((match) => match[1] ?? ""))]
    .sort((left, right) => right.length - left.length);
  for (const local of names) css = css.replaceAll(`.${local}`, `._${local}_${hash}`);
  return css;
}

const order = {
  id: "oc-1", updatedAt: "2027-01-01T12:00:00.000Z", title: "Culto de domingo — manhã",
  serviceAt: "2027-01-03T13:00:00.000Z", status: "DRAFT" as const, revision: 1, kind: "REGULAR" as const,
  items: [
    { title: "Direção do culto", minutes: 10, responsible: null, alert: "Direção do culto: A definir. Nenhuma pessoa confirmada e elegível.", startsAt: "2027-01-03T13:00:00.000Z" },
    { title: "Pregação", minutes: 35, responsible: "Ana Costa", responsiblePersonId: "pessoa-ana", startsAt: "2027-01-03T13:10:00.000Z" },
  ],
};
const policy = {
  minGapDays: 14, monthlyLimitPerPerson: 2, avoidDualDirectionAndPreaching: true, skipUnavailable: true,
  blessingRoleKey: "bencao", directionRoleKey: "direcao", preachingRoleKey: "pregacao",
  slots: [{ weekday: 4, time: "20:00", title: "Culto de quinta" }, { weekday: 0, time: "10:00", title: "Culto de domingo — manhã" }, { weekday: 0, time: "19:00", title: "Culto de domingo — noite" }],
  roles: [], pools: { pregacao: ["pessoa-ana"] },
};
const noop = () => undefined;

function januaryCells() {
  const cells: Array<number | null> = [...Array.from({ length: 5 }, () => null), ...Array.from({ length: 31 }, (_, index) => index + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function view(tab: "calendario" | "roteiro" | "regras" | "culto", canEdit: boolean) {
  return renderToStaticMarkup(<ServiceOrderCentral canEdit={canEdit} orders={[order]} policy={policy} preview={{
    month: "2027-01", alerts: ["07/01/2027 ficou de fora por exceção registrada"],
    services: [{ serviceAt: order.serviceAt, title: order.title, kind: "REGULAR", existing: false, alerts: ["A definir"], items: [{ title: "Direção do culto", responsible: null, alert: "A definir", roleKey: "direcao" }] }],
  }} briefing={{ roster: [{ roleLabel: "Louvor", displayName: "Caio Lima", status: "CONFIRMED" }], repertoire: [{ title: "Música fictícia", musicalKey: "G" }] }}
    exceptions={[{ id: "ex-1", serviceAt: "2027-01-07T23:00:00.000Z", kind: "SKIP", note: "Sem culto nesta quinta fictícia" }]}
    tab={tab} monthLabel="janeiro de 2027" cells={januaryCells()} selected={order}
    notice="" error="" busy={false} onTab={noop} onMonth={noop} onSelectDay={noop} onPreview={noop} onGenerate={noop}
    onEdit={noop} onDecision={noop} onRevise={noop} onPdf={noop} onSavePolicy={(event) => event.preventDefault()} onException={(event) => event.preventDefault()} />);
}

describe("central da ordem de culto", () => {
  it("mostra abas, prévia, A definir e leitura do administrador sem aprovação", () => {
    const calendar = view("calendario", true);
    expect(calendar).toContain("Calendário");
    expect(calendar).toContain("Roteiro");
    expect(calendar).toContain("Regras");
    expect(calendar).toContain("Modo Culto");
    expect(calendar).toContain("A definir");
    expect(calendar).toContain("Gravar rascunhos");
    const admin = view("roteiro", false);
    expect(admin).not.toContain("Aprovar roteiro");
    expect(admin).not.toContain("Publicar roteiro");
    expect(admin).toContain("Baixar PDF");
    expect(admin).toContain("Música fictícia");
    const rules = view("regras", false);
    expect(rules).toContain("Só a pastoral grava");
    expect(rules).toContain("bencao");
    expect(rules).not.toMatch(/\bbispo\b|\bpastora\b/i);
    const culto = view("culto", true);
    expect(culto).toContain("Modo culto");
    expect(culto).toContain("Próxima etapa");
    const folder = "/tmp/oc-central-preview";
    const here = dirname(fileURLToPath(import.meta.url));
    mkdirSync(folder, { recursive: true });
    const css = scopeCss(join(here, "../ui/ui.module.css"), uiStyles.workspacePrimary) + scopeCss(join(here, "service-order.module.css"), orderStyles.kicker);
    const page = (body: string) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}body{margin:0;background:#f6f7f8;font-family:Georgia,sans-serif}</style>${body}`;
    writeFileSync(join(folder, "ordem-culto-central.html"), page(calendar));
    writeFileSync(join(folder, "ordem-culto-modo.html"), page(culto));
  });
});
