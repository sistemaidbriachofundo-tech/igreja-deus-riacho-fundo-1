import PDFDocument from "pdfkit";
import { containsSensitiveCredentialPayload } from "@idbrf/shared";

export interface LetterPdfInput {
  churchName: string;
  letterType: string;
  title: string;
  bodyText: string;
  displayName: string;
  version: number;
  letterId: string;
  issuedAt: Date | null;
}

const LETTER_TYPE_LABEL: Record<string, string> = {
  TRANSFERENCIA: "Carta de transferência",
  RECOMENDACAO: "Carta de recomendação",
  MEMBRESIA: "Carta de membresia",
  OUTRO: "Carta oficial",
};

/**
 * PDF auditável de carta oficial (RF-006).
 * Não inclui e-mail, CPF, telefone nem storageKey — só campos de carta + nome de exibição.
 */
export async function renderLetterPdf(input: LetterPdfInput): Promise<Buffer> {
  assertStructuredFieldSafe(input.churchName, "churchName");
  assertStructuredFieldSafe(input.displayName, "displayName");
  assertStructuredFieldSafe(input.title, "title");
  assertNoCpfInBody(input.bodyText);

  const typeLabel = LETTER_TYPE_LABEL[input.letterType] ?? "Carta oficial";
  const issuedLabel = input.issuedAt
    ? input.issuedAt.toISOString().slice(0, 10)
    : "rascunho";

  const doc = new PDFDocument({
    size: "A4",
    margin: 56,
    info: {
      Title: input.title,
      Author: "IDBRF",
      Subject: `Church letter v${input.version} — audit PDF`,
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc
    .fontSize(12)
    .fillColor("#4A2612")
    .text(input.churchName, { align: "left" });
  doc.moveDown(0.4);
  doc.fontSize(10).fillColor("#555555").text(typeLabel);
  doc.moveDown(0.8);
  doc.fontSize(16).fillColor("#1a1a1a").text(input.title, { align: "left" });
  doc.moveDown(0.5);
  doc
    .fontSize(11)
    .fillColor("#333333")
    .text(`Destinatário: ${input.displayName}`);
  doc.moveDown(0.3);
  doc
    .fontSize(9)
    .fillColor("#666666")
    .text(
      `Versão ${input.version} · Emitida: ${issuedLabel} · Ref: ${input.letterId}`,
    );
  doc.moveDown(1);
  doc.fontSize(11).fillColor("#1a1a1a").text(input.bodyText, {
    align: "justify",
    lineGap: 3,
  });
  doc.moveDown(1.5);
  doc
    .fontSize(8)
    .fillColor("#888888")
    .text(
      "Documento gerado pelo sistema piloto IDBRF — sem e-mail, CPF ou telefone no layout.",
      { align: "left" },
    );

  doc.end();
  const pdf = await done;

  const intentionalText = [
    input.churchName,
    input.displayName,
    input.title,
    typeLabel,
    `Versão ${input.version}`,
    issuedLabel,
    input.letterId,
  ].join("\n");
  if (containsSensitiveCredentialPayload(intentionalText)) {
    throw new Error("PDF da carta não pode conter CPF, telefone ou e-mail nos campos estruturados");
  }
  if (!pdf.subarray(0, 4).equals(Buffer.from("%PDF"))) {
    throw new Error("Renderer não produziu PDF válido");
  }

  return pdf;
}

function assertStructuredFieldSafe(value: string, field: string): void {
  if (containsSensitiveCredentialPayload(value)) {
    throw new Error(`Campo ${field} contém dado sensível proibido no PDF da carta`);
  }
}

/** Bloqueia CPF no corpo; e-mail/telefone no bodyText ficam a cargo da secretaria (texto livre). */
function assertNoCpfInBody(bodyText: string): void {
  if (/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(bodyText) || /\bcpf\b/i.test(bodyText)) {
    throw new Error("Corpo da carta não pode conter CPF");
  }
}
