/**
 * Deep links de contato — abrem o app nativo / web do usuário.
 * Não disparam WhatsApp Business API, SMTP nem push da plataforma.
 */

export type WhatsAppLinkInput = {
  /** Telefone em qualquer máscara BR/internacional. Opcional: sem número o WhatsApp pede o contato. */
  phone?: string | null;
  /** Texto pré-preenchido (convite de escala, lembrete, etc.). */
  text?: string | null;
};

export type MailtoLinkInput = {
  email?: string | null;
  subject?: string | null;
  body?: string | null;
};

/** Remove não-dígitos; aplica DDI 55 quando parece número BR local (10–11 dígitos). */
export function normalizeWhatsAppDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D+/g, "");
  if (digits.length < 8) return null;
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length >= 12) return digits;
  return null;
}

export function buildWhatsAppUrl(input: WhatsAppLinkInput): string {
  const digits = normalizeWhatsAppDigits(input.phone ?? null);
  const text = (input.text ?? "").trim();
  const base = digits ? `https://wa.me/${digits}` : "https://wa.me/";
  if (!text) return base;
  const sep = base.endsWith("/") ? "?" : "?";
  // wa.me aceita ?text= com ou sem número
  return `${base}${sep}text=${encodeURIComponent(text)}`;
}

export function buildMailtoUrl(input: MailtoLinkInput): string | null {
  const email = (input.email ?? "").trim();
  if (!email || !email.includes("@")) return null;
  const params = new URLSearchParams();
  const subject = (input.subject ?? "").trim();
  const body = (input.body ?? "").trim();
  if (subject) params.set("subject", subject);
  if (body) params.set("body", body);
  const query = params.toString();
  return query ? `mailto:${email}?${query}` : `mailto:${email}`;
}

/** Mensagem padrão de convite de escala (líder → voluntário). */
export function rosterInviteWhatsAppText(input: {
  personName?: string | null;
  ministryName?: string | null;
  serviceLabel?: string | null;
  roleLabel?: string | null;
}): string {
  const who = (input.personName ?? "").trim() || "irmão(ã)";
  const ministry = (input.ministryName ?? "").trim() || "nossa equipe";
  const when = (input.serviceLabel ?? "").trim();
  const role = (input.roleLabel ?? "").trim();
  const lines = [
    `Olá, ${who}! Paz do Senhor.`,
    `Gostaríamos de confirmar sua participação em ${ministry}.`,
  ];
  if (when) lines.push(`Culto/horário: ${when}.`);
  if (role) lines.push(`Função: ${role}.`);
  lines.push("Pode confirmar por aqui, por favor?");
  return lines.join("\n");
}

/** Detecta e-mail em texto livre sem revarrer o mesmo trecho. */
export function containsEmailAddress(text: string): boolean {
  for (const word of text.split(/\s+/)) {
    const parts = word.split("@");
    for (let i = 1; i < parts.length; i += 1) {
      const domain = parts[i]!;
      const dot = domain.indexOf(".", 1);
      if (parts[i - 1] && dot >= 1 && dot < domain.length - 1) return true;
    }
  }
  return false;
}
