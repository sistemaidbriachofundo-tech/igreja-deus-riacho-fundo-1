import { ApiRequestError } from "../../lib/api";

/** Cartão devolvido pela API. Campos extras são opcionais para não criar outra fonte. */
export type CredentialCard = {
  id: string;
  status: string;
  displayName: string;
  churchName: string;
  qrPayload: string;
  issuedAt: string;
  revokedAt: string | null;
  personId: string;
  membershipId: string;
  /** URL temporária autorizada, quando o serviço de fotos estiver disponível. */
  photoUrl?: string | null;
  pdf?: {
    hasFile: boolean;
    contentType: string | null;
    byteSize: number | null;
    generatedAt: string | null;
  } | null;
  ministryName?: string | null;
  qrSvg?: string | null;
};

/** Linha vinda de GET /memberships — a mesma membresia, sem cadastro paralelo. */
export type CredentialMembershipRow = {
  membershipId: string;
  personId: string;
  displayName: string;
  membershipStatus: string;
  activeCredentialId: string | null;
};

export type QrCheck = {
  state: "valid" | "revoked" | "unknown";
  label: string;
};

export type JourneyResult = {
  pass: boolean;
  blockedAt: "open" | "download" | "revoke" | "verify" | null;
  qrValid: boolean | null;
};

export function registrationLabel(membershipId: string): string {
  const compact = membershipId.replace(/[^A-Za-z0-9]/g, "");
  if (!compact) return "—";
  if (compact.length <= 14) return compact;
  return `${compact.slice(0, 4)}·${compact.slice(-6)}`;
}

export function avatarLabel(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = [words[0]?.[0], words.length > 1 ? words.at(-1)?.[0] : ""]
    .filter((letter): letter is string => Boolean(letter))
    .join("")
    .toLocaleUpperCase("pt-BR");
  return letters.slice(0, 2) || "•";
}

export function credentialStatusLabel(status: string | null | undefined): string {
  if (status === "ACTIVE") return "Ativa";
  if (status === "REVOKED") return "Revogada";
  return "Não emitida";
}

export function rowStatus(activeCredentialId: string | null): string {
  return activeCredentialId ? "Ativa" : "Sem credencial ativa";
}

export function formatCredentialDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/** Aceita só o SVG do QR. Rejeita marcação que possa executar código. */
export function safeQrSvg(svg: string | null | undefined): string | null {
  if (!svg) return null;
  const trimmed = svg.trim().replace(/^\uFEFF/, "");
  const start = trimmed.indexOf("<svg");
  if (start < 0) return null;
  const slice = trimmed.slice(start);
  if (!slice.endsWith("</svg>")) return null;
  if (/<script|on\w+=|javascript:|foreignObject/i.test(slice)) return null;
  return slice;
}

export function credentialFailure(error: unknown): { status: number | null; message: string } {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) {
      return { status: 401, message: "Sua sessão expirou. Entre novamente." };
    }
    if (error.status === 403) {
      return { status: 403, message: "Seu perfil não pode abrir esta carteirinha." };
    }
    if (error.status === 404) {
      return { status: 404, message: "Não há carteirinha disponível para esta matrícula." };
    }
    if (error.status === 409) {
      if (/CREDENTIAL_NOT_ELIGIBLE|credentialEligible=false/i.test(error.message)) {
        return { status: 409, message: "A admissão precisa da aprovação pastoral antes da emissão." };
      }
      if (/já existe carteirinha ativa/i.test(error.message)) {
        return { status: 409, message: "Já existe uma carteirinha ativa para esta matrícula." };
      }
      return { status: 409, message: "A carteirinha foi alterada. Atualize a lista antes de tentar novamente." };
    }
    const status = error.status ?? null;
    return {
      status,
      message: "Não foi possível concluir a solicitação agora. Tente novamente.",
    };
  }
  return { status: null, message: "Não foi possível contactar o serviço de carteirinhas." };
}

export function interpretQr(status: string, valid?: boolean): QrCheck {
  if (valid === false || status === "REVOKED") {
    return { state: "revoked", label: "QR revogado. Esta credencial não é válida." };
  }
  if (valid === true || status === "ACTIVE") {
    return { state: "valid", label: "QR confirmado. Credencial ativa." };
  }
  return { state: "unknown", label: "O QR não confirmou uma credencial ativa." };
}

/**
 * Jornada abrir → baixar → imprimir → revogar → QR inválido.
 * `pass` só fecha quando a revogação e a conferência real concordam.
 * Download diferente de 200 interrompe sem declarar sucesso.
 */
export async function runCredentialJourney(ports: {
  open: () => Promise<{ id: string; qrPayload: string; status: string }>;
  download: (id: string) => Promise<{ status: number }>;
  print: () => void;
  revoke: (id: string) => Promise<{ status: string }>;
  verify: (qrPayload: string) => Promise<{ status: string; valid?: boolean }>;
}): Promise<JourneyResult> {
  let opened: { id: string; qrPayload: string; status: string };
  try {
    opened = await ports.open();
  } catch {
    return { pass: false, blockedAt: "open", qrValid: null };
  }
  let downloaded: { status: number };
  try {
    downloaded = await ports.download(opened.id);
  } catch {
    return { pass: false, blockedAt: "download", qrValid: null };
  }
  if (downloaded.status !== 200) {
    return { pass: false, blockedAt: "download", qrValid: null };
  }
  ports.print();
  let revoked: { status: string };
  try {
    revoked = await ports.revoke(opened.id);
  } catch {
    return { pass: false, blockedAt: "revoke", qrValid: null };
  }
  if (revoked.status !== "REVOKED") {
    return { pass: false, blockedAt: "revoke", qrValid: null };
  }
  try {
    const check = await ports.verify(opened.qrPayload);
    const qrValid = check.valid === true || (check.valid !== false && check.status === "ACTIVE");
    if (qrValid) return { pass: false, blockedAt: "verify", qrValid: true };
    return { pass: true, blockedAt: null, qrValid: false };
  } catch {
    return { pass: false, blockedAt: "verify", qrValid: null };
  }
}
