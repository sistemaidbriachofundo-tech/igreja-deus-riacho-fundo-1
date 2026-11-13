import PDFDocument from "pdfkit";
// PDFKit loads Helvetica through a dynamic import that the serverless tracer misses.
import "pdfkit/standard-fonts/Helvetica";
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
  photo?: Buffer;
  verificationBaseUrl?: string;
}

/**
 * Gera PDF real da carteirinha (dados sintéticos/demo).
 * QR = token opaco apenas; CPF/telefone/e-mail proibidos no conteúdo.
 */
export function credentialPdfQrPayload(opaqueToken: string, base?: string): string {
  assertOpaqueCredentialPayload(opaqueToken);
  if (!base) return opaqueToken;
  const url = new URL(base.endsWith("/") ? base : base + "/");
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username || url.password || url.search || url.hash) {
    throw new Error("CREDENTIAL_VERIFICATION_WEB_URL inválida");
  }
  const verification = new URL("validar-carteirinha/", url);
  verification.hash = opaqueToken;
  return verification.href;
}

export async function renderCredentialPdf(
  input: CredentialPdfInput,
): Promise<Buffer> {
  assertOpaqueCredentialPayload(input.opaqueToken);
  assertPdfTextSafe(input.displayName, "displayName");
  assertPdfTextSafe(input.churchName, "churchName");

  const qrPng = await QRCode.toBuffer(credentialPdfQrPayload(input.opaqueToken, input.verificationBaseUrl), {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 4,
    width: 384,
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
    .text("Escaneie para verificar a carteirinha.", { width: 200 });

  doc.image(qrPng, 240, 40, { width: 96, height: 96 });
  if (input.photo) doc.image(input.photo, 24, 112, { fit: [80, 83] });

  doc.end();
  const pdf = await done;

  // Defesa em profundidade só no texto intencional (binário do QR/PDF gera falsos positivos).
  const intentionalText = [
    input.displayName,
    input.churchName,
    input.opaqueToken,
    "Carteirinha de Membro",
    "Escaneie para verificar a carteirinha.",
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
