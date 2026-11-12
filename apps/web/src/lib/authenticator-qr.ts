/**
 * Gera o QR do TOTP localmente: nada é enviado a terceiros.
 * A URI otpauth contém o segredo e não deve ser registrada em logs,
 * analytics, cache remoto ou serviços de imagens externos.
 */
export async function generateAuthenticatorQr(otpauthUri: string): Promise<string> {
  if (!otpauthUri.startsWith("otpauth://totp/") || otpauthUri.length > 2048) {
    throw new Error("URI de autenticador inválida");
  }
  const parsed = new URL(otpauthUri);
  if (parsed.protocol !== "otpauth:" || parsed.hostname !== "totp" ||
      !parsed.pathname.slice(1) || !parsed.searchParams.get("secret")) {
    throw new Error("URI de autenticador inválida");
  }
  const qrcode = await import("qrcode");
  return qrcode.toDataURL(otpauthUri, {
    errorCorrectionLevel: "M",
    width: 220,
    margin: 2,
    color: { dark: "#102b23", light: "#ffffff" },
  });
}
