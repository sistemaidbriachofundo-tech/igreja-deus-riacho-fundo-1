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
  revokedAt?: Date | null;
  credentialId: string;
  membershipId?: string;
  status?: string;
  ministryName?: string | null;
  photo?: Buffer;
  verificationBaseUrl?: string;
}

/** Mesma matrícula exibida na carteirinha digital. */
export function credentialPdfRegistration(membershipId: string | undefined, credentialId: string): string {
  const compact = (membershipId ?? credentialId).replace(/[^A-Za-z0-9]/g, "");
  if (!compact) return "-";
  if (compact.length <= 14) return compact;
  return `${compact.slice(0, 4)}·${compact.slice(-6)}`;
}

/** Mesma data da tela, no fuso da congregação. */
export function credentialPdfDate(value: Date | null | undefined): string {
  if (!value || Number.isNaN(value.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
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
  const ministry = input.ministryName?.trim() ?? "";
  if (ministry) assertPdfTextSafe(ministry, "ministryName");

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

  // Design oficial RF1: faixa preta, base branca, onda dourada e foto do titular.
  // Somente dados da credencial. Não inferir validade ou cargo administrativo.
  const active = input.status !== "REVOKED";
  const registration = credentialPdfRegistration(input.membershipId, input.credentialId);
  const issued = credentialPdfDate(input.issuedAt);
  const revoked = credentialPdfDate(input.revokedAt);
  const portrait = validJpegPortrait(input.photo);
  doc.rect(0, 0, 360, 220).fill("#FFFFFF");
  doc.rect(0, 0, 360, 80).fill("#171717");
  doc.save().moveTo(0, 74).bezierCurveTo(95, 112, 205, 46, 360, 82)
    .lineTo(360, 96).bezierCurveTo(200, 60, 95, 125, 0, 87).closePath().fill("#C9A76B").restore();
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#FFFFFF")
    .text("IGREJA DE DEUS", 122, 24, { width: 217, lineBreak: false });
  doc.font("Helvetica").fontSize(8).fillColor("#EEEEEE")
    .text("RIACHO FUNDO I", 123, 43, { width: 180, lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#E8D2A4")
    .text("ID", 24, 26, { width: 28 });
  doc.font("Helvetica").fontSize(7).fillColor("#E8D2A4")
    .text("DOCUMENTO DE MEMBRO", 188, 58, { width: 150, align: "right", lineBreak: false });
  doc.lineWidth(3).strokeColor("#FFFFFF").moveTo(45, 15).lineTo(45, 49).stroke();
  doc.moveTo(31, 28).lineTo(58, 28).stroke();
  doc.roundedRect(24, 89, 77, 89, 7).fill("#E7E7E7");
  if (portrait) {
    doc.image(portrait, 25, 90, { fit: [75, 87], align: "center", valign: "center" });
  } else {
    doc.font("Helvetica-Bold").fontSize(27).fillColor("#171717")
      .text(portraitInitials(input.displayName), 25, 116, { width: 75, align: "center" });
  }
  doc.font("Helvetica-Bold").fontSize(16).fillColor("#171717")
    .text(input.displayName, 112, 102, { width: 145, height: ministry ? 34 : 42, ellipsis: true });
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#8C6C36")
    .text("Membro", 113, ministry ? 138 : 147, { width: 145, lineBreak: false });
  if (ministry) {
    doc.font("Helvetica").fontSize(8).fillColor("#505966")
      .text(ministry, 113, 150, { width: 145, height: 12, ellipsis: true });
  }
  doc.roundedRect(113, 166, 78, 18, 8).fill(active ? "#D7EEDB" : "#F8E0E3");
  doc.font("Helvetica-Bold").fontSize(8).fillColor(active ? "#286B52" : "#9C3041")
    .text(active ? "Ativa" : "Revogada", 121, 171, { width: 64, lineBreak: false });
  doc.image(qrPng, 269, 102, { width: 76, height: 76 });
  doc.font("Helvetica").fontSize(7).fillColor("#59616B")
    .text("VERIFICAR QR", 267, 184, { width: 80, align: "center" });
  doc.lineWidth(0.7).strokeColor("#DDE1E5").moveTo(23, 195).lineTo(340, 195).stroke();
  doc.font("Helvetica").fontSize(8).fillColor("#59616B")
    .text("MATRÍCULA", 23, 203, { width: 64, lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#171717")
    .text(registration, 92, 203, { width: 104, lineBreak: false });
  doc.font("Helvetica").fontSize(8).fillColor("#59616B")
    .text("EMITIDA EM", 208, 203, { width: 62, lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#171717")
    .text(issued, 274, 203, { width: 70, lineBreak: false });

  doc.addPage({ size: [360, 220], margin: 18 });
  doc.rect(0, 0, 360, 220).fill("#FFFFFF");
  doc.rect(0, 0, 360, 12).fill("#C9A76B");
  doc.font("Helvetica").fontSize(8).fillColor("#59616B")
    .text("VERIFICACAO", 24, 28, { width: 160, lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#171717")
    .text(input.churchName, 24, 42, { width: 200, height: 36, ellipsis: true });
  doc.image(qrPng, 236, 28, { width: 96, height: 96 });
  doc.font("Helvetica").fontSize(7).fillColor("#59616B")
    .text("VERIFICAR QR", 236, 128, { width: 96, align: "center", lineBreak: false });
  doc.lineWidth(0.7).strokeColor("#DDE1E5").moveTo(24, 156).lineTo(336, 156).stroke();
  doc.font("Helvetica").fontSize(8).fillColor("#59616B")
    .text("EMITIDA", 24, 170, { width: 80, lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#171717")
    .text(issued, 24, 184, { width: 110, lineBreak: false });
  doc.font("Helvetica").fontSize(8).fillColor("#59616B")
    .text("REVOGACAO", 180, 170, { width: 100, lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#171717")
    .text(input.revokedAt ? revoked : "-", 180, 184, { width: 110, lineBreak: false });
  doc.font("Helvetica").fontSize(8).fillColor("#59616B")
    .text(active ? "A leitura deste QR consulta a situacao da credencial." : "QR revogado. Esta credencial nao e valida.", 24, 202, { width: 312, lineBreak: false });

  doc.end();
  const pdf = await done;

  // Defesa em profundidade só no texto intencional (binário do QR/PDF gera falsos positivos).
  const intentionalText = [
    input.displayName,
    input.churchName,
    ministry,
    input.opaqueToken,
    registration,
    "Carteirinha de Membro",
    "Membro",
    active ? "Ativa" : "Revogada",
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
