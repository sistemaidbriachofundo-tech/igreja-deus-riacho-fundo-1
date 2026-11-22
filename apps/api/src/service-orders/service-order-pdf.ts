import PDFDocument from "pdfkit";
import "pdfkit/standard-fonts/Helvetica";
import type { ServiceOrderDto } from "@idbrf/shared";

const when = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "full",
  timeStyle: "short",
});
const clock = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
});
const statusLabel = { DRAFT: "Rascunho", APPROVED: "Aprovada", PUBLISHED: "Publicada" };

/** PDF operacional. Não inclui e-mail, telefone, documento ou endereço. */
export function renderServiceOrderPdf(order: ServiceOrderDto): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: order.title, Author: "Ordem de culto" } });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fillColor("#8a651f").fontSize(10).text("ORDEM DE CULTO");
    doc.moveDown(0.4).fillColor("#171717").fontSize(22).text(order.title);
    doc.moveDown(0.3).fillColor("#3d4450").fontSize(11)
      .text(`${when.format(new Date(order.serviceAt))} · ${statusLabel[order.status]} · revisão ${order.revision ?? 1}`);
    if (order.notes) doc.moveDown(0.4).fillColor("#171717").fontSize(11).text(order.notes);
    doc.moveDown(0.8);
    for (const item of order.items) {
      if (doc.y > 740) doc.addPage();
      doc.fillColor("#171717").fontSize(13).text(`${item.position + 1}. ${item.title}`);
      const detail = [
        item.startsAt ? clock.format(new Date(item.startsAt)) : null,
        item.minutes ? `${item.minutes} min` : null,
        item.responsible ?? "A definir",
        item.equipment,
      ].filter(Boolean).join(" · ");
      doc.fillColor("#3d4450").fontSize(11).text(detail);
      if (item.notes) doc.fillColor("#3d4450").text(item.notes);
      if (item.alert) doc.fillColor("#8a3b12").text(item.alert);
      doc.moveDown(0.45);
    }
    doc.moveDown(0.6).fillColor("#6b7280").fontSize(9)
      .text("Leitura restrita a quem tem papel pastoral ou administrativo nesta congregação. Este arquivo não traz contato pessoal.");
    doc.end();
  });
}
