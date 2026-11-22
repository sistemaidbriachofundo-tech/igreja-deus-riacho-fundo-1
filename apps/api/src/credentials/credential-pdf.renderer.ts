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

  doc.rect(0, 0, 360, 220).fill("#f6f6f7");
  doc.rect(0, 0, 224, 220).fill("#171717");
  doc.rect(0, 207, 224, 13).fill("#c9a76b");
  const portrait = validJpegPortrait(input.photo);
  doc.fontSize(9).fillColor("#f0d7a2").text("CARTEIRINHA DE MEMBRO", 22, 24, { width: 180, lineBreak: false });
  doc.fontSize(11).fillColor("#ffffff").text(input.churchName, 22, 42, { width: 180, height: 40, ellipsis: true });
  doc.fontSize(17).fillColor("#ffffff").text(input.displayName, 88, 90, {
    width: 115, height: 68, ellipsis: true,
  });
  doc.fontSize(9).fillColor("#dce0e4").text(`Emitida em ${input.issuedAt.toISOString().slice(0, 10).split("-").reverse().join("/")}`,
    22, 181, { width: 180, lineBreak: false });

  doc.roundedRect(22, 88, 56, 69, 6).fill("#e9eaec");
  if (portrait) {
    doc.image(portrait, 23, 89, { fit: [54, 67], align: "center", valign: "center" });
  } else {
    doc.fontSize(16).fillColor("#171717").text(portraitInitials(input.displayName), 22, 112, {
      width: 56, align: "center", lineBreak: false,
    });
  }

  doc.fontSize(10).fillColor("#171717").text("VERIFICAÇÃO", 236, 24, { width: 112, align: "center" });
  doc.image(qrPng, 242, 49, { width: 100, height: 100 });
  doc.fontSize(8).fillColor("#59616b").text("Escaneie para verificar a carteirinha.", 234, 162, {
    width: 116, align: "center",
  });

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

function validJpegPortrait(photo?: Buffer): Buffer | undefined {
  if (!photo || photo.length < 3 || photo.length > 192 * 1024) return undefined;
  if (photo[0] !== 0xff || photo[1] !== 0xd8 || photo[2] !== 0xff) return undefined;
  return photo;
}

function portraitInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return [words[0]?.charAt(0), words.length > 1 ? words.at(-1)?.charAt(0) : ""]
    .filter(Boolean).join("").toLocaleUpperCase("pt-BR") || "ID";
}

function assertPdfTextSafe(value: string, field: string): void {
  if (containsSensitiveCredentialPayload(value)) {
    throw new Error(`Campo ${field} contém dado sensível proibido no PDF`);
  }
}
