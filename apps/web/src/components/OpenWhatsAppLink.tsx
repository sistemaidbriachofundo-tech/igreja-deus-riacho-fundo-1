"use client";

import type { CSSProperties, ReactNode } from "react";
import { buildWhatsAppUrl, rosterInviteWhatsAppText } from "@idbrf/shared";

type Props = {
  phone?: string | null;
  text?: string | null;
  /** Atalho para montar texto de convite de escala. */
  invite?: {
    personName?: string | null;
    ministryName?: string | null;
    serviceLabel?: string | null;
    roleLabel?: string | null;
  };
  children?: ReactNode;
  className?: string;
  /** Visual: botão verde padrão ou herda className do pai. */
  appearance?: "button" | "inherit";
};

/**
 * Abre o WhatsApp (app no celular / Desktop ou Web no computador).
 * Não chama a API de canais da plataforma.
 */
export function OpenWhatsAppLink({
  phone,
  text,
  invite,
  children = "Abrir WhatsApp",
  className,
  appearance = "button",
}: Props) {
  const message = text ?? (invite ? rosterInviteWhatsAppText(invite) : "");
  const href = buildWhatsAppUrl({ phone, text: message });
  const label = children;

  const buttonStyle: CSSProperties | undefined =
    appearance === "button" && !className
      ? {
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 40,
          padding: "0.45rem 0.85rem",
          borderRadius: 10,
          background: "#1f7a4d",
          color: "#fff",
          fontWeight: 700,
          fontSize: "0.86rem",
          textDecoration: "none",
        }
      : undefined;

  return (
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-contact-channel="whatsapp-deeplink"
      data-has-phone={phone ? "true" : "false"}
      aria-label={
        phone
          ? "Abrir conversa no WhatsApp"
          : "Abrir WhatsApp para escolher o contato e enviar a mensagem"
      }
      title={phone ? undefined : "Abre o WhatsApp; você escolhe o contato na lista"}
      style={buttonStyle}
    >
      {label}
    </a>
  );
}
