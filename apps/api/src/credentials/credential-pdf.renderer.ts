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
  /** Identificador real da matrícula. Ausente não vira número inventado. */
  membershipId?: string | null;
  status?: string | null;
  /** Só entra no PDF quando o cadastro tem expiração. */
  expiresAt?: Date | null;
}

const DOCUMENT_TITLE = "CARTEIRINHA DE MEMBRO";

export function credentialDocumentCopy(input: Pick<
  CredentialPdfInput,
  "displayName" | "churchName" | "membershipId" | "status" | "issuedAt" | "expiresAt"
>): string[] {
  const lines = [DOCUMENT_TITLE, input.churchName, input.displayName];
  const membership = formatMembership(input.membershipId);
  if (membership) lines.push(`Matrícula ${membership}`);
  const status = statusLabel(input.status);
  if (status) lines.push(`Situação ${status}`);
  lines.push(`Emitida em ${formatIssued(input.issuedAt)}`);
  lines.push(input.expiresAt ? `Validade ${formatIssued(input.expiresAt)}` : "Sem validade cadastrada");
  lines.push("Escaneie para verificar a carteirinha.");
  return lines;
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
  if (input.membershipId) assertPdfTextSafe(input.membershipId, "membershipId");
  const copy = credentialDocumentCopy(input);
  for (const line of copy) assertPdfTextSafe(line, "documento");

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

  doc.rect(0, 0, 360, 220).fill("#f7f4ee");
  doc.rect(0, 0, 232, 220).fill("#111111");
  doc.rect(0, 0, 232, 8).fill("#c9a76b");
  doc.rect(0, 208, 232, 12).fill("#c9a76b");
  doc.circle(34, 32, 13).lineWidth(1.2).stroke("#c9a76b");
  doc.fontSize(8).fillColor("#f0d7a2").text("ID", 22, 28, { width: 24, align: "center", lineBreak: false });
  const portrait = validJpegPortrait(input.photo);
  doc.fontSize(8).fillColor("#f0d7a2").text(copy[0] ?? DOCUMENT_TITLE, 52, 20, { width: 168, lineBreak: false });
  doc.fontSize(9).fillColor("#ffffff").text(input.churchName, 52, 34, { width: 168, height: 22, ellipsis: true });
  doc.roundedRect(16, 64, 52, 64, 6).fill("#f4efe6");
  if (portrait) {
    doc.image(portrait, 18, 66, { fit: [48, 60], align: "center", valign: "center" });
  } else {
    doc.fontSize(14).fillColor("#111111").text(portraitInitials(input.displayName), 16, 86, {
      width: 52, align: "center", lineBreak: false,
    });
  }
  doc.fontSize(12).fillColor("#ffffff").text(input.displayName, 76, 66, {
    width: 144, height: 32, ellipsis: true,
  });
  const detail = copy.slice(3).filter((line) => !line.startsWith("Escaneie"));
  detail.forEach((line, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    doc.fontSize(7).fillColor("#f0d7a2").text(line, 16 + column * 108, 136 + row * 22, {
      width: 102, height: 20, ellipsis: true,
    });
  });

  doc.fontSize(8).fillColor("#7a6240").text("VERIFICAÇÃO", 244, 18, { width: 104, align: "center" });
  doc.image(qrPng, 250, 36, { width: 92, height: 92 });
  doc.fontSize(7).fillColor("#5c5348").text("Escaneie para verificar a carteirinha.", 238, 136, {
    width: 112, align: "center",
  });
  const situation = copy.find((line) => line.startsWith("Situação "));
  if (situation) {
    doc.fontSize(8).fillColor("#111111").text(situation, 238, 168, { width: 112, align: "center" });
  }
  if (input.status === "REVOKED") {
    doc.fontSize(11).fillColor("#8a6230").text("REVOGADA", 246, 78, { width: 100, align: "center" });
  }

  doc.end();
  const pdf = await done;

  // Defesa em profundidade só no texto intencional (binário do QR/PDF gera falsos positivos).
  const intentionalText = [...copy, input.opaqueToken].join("\n");
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

function formatIssued(value: Date): string {
  return value.toISOString().slice(0, 10).split("-").reverse().join("/");
}

function formatMembership(membershipId?: string | null): string | null {
  const compact = (membershipId ?? "").replace(/[^A-Za-z0-9]/g, "");
  if (!compact) return null;
  if (compact.length <= 14) return compact;
  return `${compact.slice(0, 4)}-${compact.slice(-6)}`;
}

function statusLabel(status?: string | null): string | null {
  if (status === "ACTIVE") return "Ativa";
  if (status === "REVOKED") return "Revogada";
  if (!status) return null;
  return null;
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
