import PDFDocument from "pdfkit";
import type { ParticipationCounts, ParticipationRow } from "./participation";

export interface ParticipationFileInput {
  generatedAt: string;
  churchId: string;
  counts: ParticipationCounts;
  rows: ParticipationRow[];
}

export interface CountFileInput {
  title: string;
  generatedAt: string;
  churchId: string;
  lines: Array<{ label: string; value: string }>;
  note: string;
}

export function participationCsv(input: ParticipationFileInput): string {
  const header = [
    "evento_id",
    "evento",
    "inscricao_id",
    "situacao",
    "pessoas",
    "presenca_em",
    "rotulo_sintetico",
  ];
  const lines = [header.join(",")];
  for (const row of input.rows) {
    lines.push(
      [
        row.eventId,
        row.eventName,
        row.registrationId,
        row.status,
        row.partySize,
        row.checkedInAt ?? "",
        row.labelRedacted ? "" : (row.syntheticLabel ?? ""),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  lines.push(
    [
      "# contagens",
      String(input.counts.registrations),
      String(input.counts.checkedIn),
      String(input.counts.participants),
      String(input.counts.presentParticipants),
      String(input.counts.minorsOmitted),
      input.generatedAt,
    ]
      .map(csvCell)
      .join(","),
  );
  return `${lines.join("\n")}\n`;
}

export function countsCsv(input: CountFileInput): string {
  const lines = ["rotulo,valor", ...input.lines.map((line) =>
    [csvCell(line.label), csvCell(line.value)].join(","),
  )];
  lines.push(["# gerado_em", csvCell(input.generatedAt)].join(","));
  return `${lines.join("\n")}\n`;
}

export function renderParticipationPdf(
  input: ParticipationFileInput,
): Promise<Buffer> {
  const lines = [
    `Congregação ${input.churchId}`,
    `Gerado em ${input.generatedAt}`,
    `Inscrições ${input.counts.registrations}`,
    `Presenças ${input.counts.checkedIn}`,
    `Participantes ${input.counts.participants}`,
    `Presentes ${input.counts.presentParticipants}`,
    `Menores omitidos ${input.counts.minorsOmitted}`,
    "Nomes de menores e códigos de check-in não entram neste arquivo.",
    ...input.rows.map((row) => {
      const label = row.labelRedacted
        ? "rótulo omitido"
        : (row.syntheticLabel ?? "sem rótulo");
      return `${row.eventName} · ${row.status} · ${row.partySize} · ${label}`;
    }),
  ];
  return renderTextPdf("Relatório de participação", lines);
}

export function renderCountsPdf(input: CountFileInput): Promise<Buffer> {
  return renderTextPdf(input.title, [
    `Congregação ${input.churchId}`,
    `Gerado em ${input.generatedAt}`,
    input.note,
    ...input.lines.map((line) => `${line.label}: ${line.value}`),
  ]);
}

function csvCell(value: string | number): string {
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function renderTextPdf(title: string, lines: string[]): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 56,
    compress: false,
    info: { Title: title, Author: "IDBRF", Subject: title },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc.fontSize(16).text(title);
  doc.moveDown(0.6);
  doc.fontSize(11);
  for (const line of lines) {
    doc.text(line);
    doc.moveDown(0.2);
  }
  doc.end();
  return done;
}
