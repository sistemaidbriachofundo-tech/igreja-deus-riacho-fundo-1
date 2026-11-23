import PDFDocument from "pdfkit";
import "pdfkit/standard-fonts/Helvetica";
import { sanitizeStatementText } from "@idbrf/shared";

export interface StatementExportRow {
  date: string;
  description: string;
  amountCents: number;
  status: string;
  costCenterId: string | null;
}

function money(cents: number) {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  return `${sign}${(absolute / 100).toFixed(2).replace(".", ",")}`;
}

function xml(value: string) {
  return sanitizeStatementText(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
}

export function renderStatementPdf(rows: readonly StatementExportRow[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(16).text("Extrato da tesouraria");
    doc.moveDown(0.4);
    doc.fontSize(10).text("Lançamentos da congregação. Nenhuma conta bancária foi consultada.");
    doc.moveDown();
    if (!rows.length) doc.text("Nenhum lançamento no extrato.");
    for (const row of rows) {
      doc.text(`${row.date}  ${sanitizeStatementText(row.description, "Lançamento")}  ${money(row.amountCents)}  ${row.status}`);
    }
    doc.end();
  });
}

export function renderStatementSheet(rows: readonly StatementExportRow[]): string {
  const body = rows.map(row => `<Row>
    <Cell><Data ss:Type="String">${xml(row.date)}</Data></Cell>
    <Cell><Data ss:Type="String">${xml(row.description)}</Data></Cell>
    <Cell><Data ss:Type="Number">${row.amountCents}</Data></Cell>
    <Cell><Data ss:Type="String">${xml(row.status)}</Data></Cell>
    <Cell><Data ss:Type="String">${xml(row.costCenterId ?? "")}</Data></Cell>
  </Row>`).join("");
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Extrato"><Table>
<Row>
  <Cell><Data ss:Type="String">Data</Data></Cell>
  <Cell><Data ss:Type="String">Descricao</Data></Cell>
  <Cell><Data ss:Type="String">Centavos</Data></Cell>
  <Cell><Data ss:Type="String">Situacao</Data></Cell>
  <Cell><Data ss:Type="String">Centro de custo</Data></Cell>
</Row>
${body}
</Table></Worksheet></Workbook>`;
}
