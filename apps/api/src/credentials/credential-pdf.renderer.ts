import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import {
  assertOpaqueCredentialPayload,
  containsSensitiveCredentialPayload,
} from "@idbrf/shared";

export interface CredentialPdfInput {
  displayName: string;
  churchName: string;
  opaqueToken: string;
  issuedAt: Date;
  credentialId: string;
}

/**
 * Gera PDF real da carteirinha (dados sintéticos/demo).
 * QR = token opaco apenas; CPF/telefone/e-mail proibidos no conteúdo.
 */
export async function renderCredentialPdf(
  input: CredentialPdfInput,
): Promise<Buffer> {
  assertOpaqueCredentialPayload(input.opaqueToken);
  assertPdfTextSafe(input.displayName, "displayName");
  assertPdfTextSafe(input.churchName, "churchName");

  const qrPng = await QRCode.toBuffer(input.opaqueToken, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 180,
  });

  const doc = new PDFDocument({
    size: [360, 220],
    margin: 24,
    info: {
      Title: "Carteirinha de Membro",
      Author: "IDBRF",
      Subject: "Credential card — opaque QR only",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc
    .fontSize(11)
    .fillColor("#4A2612")
    .text(input.churchName, { align: "left", width: 200 });
  doc.moveDown(0.4);
  doc.fontSize(16).fillColor("#1a1a1a").text(input.displayName, { width: 200 });
  doc.moveDown(0.3);
  doc
    .fontSize(9)
    .fillColor("#555555")
    .text(`Emitida: ${input.issuedAt.toISOString().slice(0, 10)}`, {
      width: 200,
    });
  doc.moveDown(0.2);
  doc
    .fontSize(8)
    .fillColor("#777777")
    .text("QR: token opaco (sem documento pessoal)", { width: 200 });

  doc.image(qrPng, 240, 40, { width: 96, height: 96 });

  doc.end();
  const pdf = await done;

  // Defesa em profundidade só no texto intencional (binário do QR/PDF gera falsos positivos).
  const intentionalText = [
    input.displayName,
    input.churchName,
    input.opaqueToken,
    "Carteirinha de Membro",
    "QR: token opaco (sem documento pessoal)",
  ].join("\n");
  if (containsSensitiveCredentialPayload(intentionalText)) {
    throw new Error("PDF da carteirinha não pode conter CPF, telefone ou PII");
  }
  if (!pdf.subarray(0, 4).equals(Buffer.from("%PDF"))) {
    throw new Error("Renderer não produziu PDF válido");
  }

  return pdf;
}

function assertPdfTextSafe(value: string, field: string): void {
  if (containsSensitiveCredentialPayload(value)) {
    throw new Error(`Campo ${field} contém dado sensível proibido no PDF`);
  }
}
