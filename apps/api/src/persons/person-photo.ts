/** O retrato é carregado somente depois que o chamador tem acesso à pessoa. */
export function jpegPortrait(bytes: Uint8Array | undefined): Buffer | undefined {
  if (!bytes || bytes.length < 3 || bytes.length > 192 * 1024 ||
      bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return undefined;
  return Buffer.from(bytes);
}

export function portraitDataUrl(bytes: Uint8Array | undefined): string | null {
  const portrait = jpegPortrait(bytes);
  return portrait ? "data:image/jpeg;base64," + portrait.toString("base64") : null;
}
