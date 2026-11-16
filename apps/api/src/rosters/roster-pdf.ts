import PDFDocument from "pdfkit";
import "pdfkit/standard-fonts/Helvetica";

type RosterPdf = {
  title: string;
  serviceAt: Date;
  status: string;
  ministry: { name: string } | null;
  module: { name: string } | null;
  slots: {
    roleLabel: string;
    sector: string | null;
    zone: string | null;
    side: string | null;
    assignments: { status: string; person: { displayName: string }; partner: { displayName: string } | null }[];
  }[];
};

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", dateStyle: "full", timeStyle: "short",
});
const statusLabels: Record<string, string> = { DRAFT: "Rascunho", PUBLISHED: "Publicada", CLOSED: "Encerrada" };

export function renderRosterPdf(roster: RosterPdf): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 42, info: { Title: roster.title } });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const margin = 42;
    const columns = [
      { label: "Posição", width: 145 }, { label: "Setor", width: 97 }, { label: "Zona", width: 88 },
      { label: "Lado", width: 78 }, { label: "Voluntários", width: 223 }, { label: "Situação", width: 125 },
    ];
    const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
    const cellOptions = (index: number) => ({ width: columns[index].width - 14, lineGap: 2 });
    function heading() {
      doc.fillColor("#a13813").fontSize(10).text("IGREJA DE DEUS · RIACHO FUNDO I", margin, margin);
      doc.moveDown(0.65).fillColor("#192537").fontSize(24).text(roster.title);
      const detail = [roster.ministry?.name, roster.module?.name, statusLabels[roster.status]].filter(Boolean).join(" · ");
      doc.moveDown(0.45).fontSize(11).text(detail).text(dateTime.format(roster.serviceAt));
      const y = doc.y + 17;
      doc.rect(margin, y, tableWidth, 24).fill("#25354a");
      let x = margin;
      columns.forEach((column, index) => {
        doc.fillColor("#ffffff").fontSize(10).text(column.label, x + 7, y + 7, cellOptions(index));
        x += column.width;
      });
      return y + 24;
    }

    let y = heading();
    if (!roster.slots.length) doc.fillColor("#475569").fontSize(10).text("Nenhuma posição cadastrada.", margin + 7, y + 10);
    let rowNumber = 0;
    for (const slot of roster.slots) {
      const rows = slot.assignments.length ? slot.assignments : [null];
      for (const assignment of rows) {
        const people = assignment ? [assignment.person.displayName, assignment.partner?.displayName].filter(Boolean).join(" e ") : "—";
        const status = assignment ? (assignment.status === "CONFIRMED" ? "Confirmado" : "Aguardando resposta") : "Vaga livre";
        const values = [slot.roleLabel, slot.sector ?? "—", slot.zone ?? "—", slot.side ?? "—", people, status];
        doc.fontSize(10);
        const height = Math.max(...values.map((value, index) => doc.heightOfString(value, cellOptions(index)))) + 14;
        if (y + height > doc.page.height - margin) {
          doc.addPage();
          y = heading();
        }
        if (rowNumber++ % 2 === 0) doc.rect(margin, y, tableWidth, height).fill("#f1f4f8");
        let x = margin;
        values.forEach((value, index) => {
          doc.fillColor("#192537").fontSize(10).text(value, x + 7, y + 7, cellOptions(index));
          x += columns[index].width;
        });
        y += height;
      }
    }
    doc.end();
  });
}
