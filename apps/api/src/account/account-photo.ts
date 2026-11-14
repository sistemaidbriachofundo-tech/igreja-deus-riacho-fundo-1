import sharp from "sharp";
import { BusinessException } from "../common/business.exception";
import { jpegPortrait } from "../persons/person-photo";

/** O mesmo teto de `person_photos.jpeg` e de `jpegPortrait`. */
export const PROFILE_PHOTO_MAX_STORED_BYTES = 192 * 1024;
export const PROFILE_PHOTO_MAX_INPUT_BYTES = 5 * 1024 * 1024;

export type ProfileImageKind = "image/jpeg" | "image/png" | "image/webp";

export function detectProfileImage(bytes: Uint8Array): ProfileImageKind | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (Buffer.from(bytes.subarray(0, 8)).equals(png)) return "image/png";
  const header = Buffer.from(bytes.subarray(0, 12)).toString("ascii");
  if (header.startsWith("RIFF") && header.endsWith("WEBP")) return "image/webp";
  return null;
}

/**
 * Confere o formato pelos bytes, aplica a orientação e grava JPEG sem metadados.
 * A ficha e a carteirinha leem esse JPEG por `jpegPortrait`.
 */
export async function normalizeProfilePhoto(bytes: Buffer): Promise<Buffer> {
  if (!bytes?.length) {
    throw new BusinessException(
      "Envie a foto no campo photo.",
      "ACCOUNT_PHOTO_REQUIRED",
      400,
    );
  }
  if (bytes.length > PROFILE_PHOTO_MAX_INPUT_BYTES) {
    throw new BusinessException("A foto passa de 5 MiB.", "ACCOUNT_PHOTO_TOO_LARGE", 400);
  }
  if (!detectProfileImage(bytes)) {
    throw new BusinessException(
      "Use uma imagem JPEG, PNG ou WebP.",
      "ACCOUNT_PHOTO_INVALID",
      400,
    );
  }
  let quality = 82;
  let width = 1200;
  try {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const output = await sharp(bytes, {
        failOn: "error",
        animated: false,
        limitInputPixels: 20_000_000,
      })
        .rotate()
        .resize({ width, height: width, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality, mozjpeg: false })
        .toBuffer();
      const portrait = jpegPortrait(output);
      if (portrait && portrait.length <= PROFILE_PHOTO_MAX_STORED_BYTES) {
        return portrait;
      }
      quality = Math.max(40, quality - 12);
      width = Math.max(320, Math.floor(width * 0.75));
    }
  } catch (error) {
    if (error instanceof BusinessException) throw error;
    throw new BusinessException(
      "Não foi possível ler a imagem enviada.",
      "ACCOUNT_PHOTO_INVALID",
      400,
    );
  }
  throw new BusinessException(
    "Não foi possível normalizar a foto dentro do limite da ficha.",
    "ACCOUNT_PHOTO_TOO_LARGE",
    400,
  );
}
