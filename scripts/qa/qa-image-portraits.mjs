/**
 * Converte os retratos SVG de DEV em JPEG para person_photos.jpeg.
 * A API só aceita JPEG com assinatura FF D8 FF e no máximo 192 KiB.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const PORTRAIT_MAX_BYTES = 192 * 1024;
const moduleDir = dirname(fileURLToPath(import.meta.url));
const apiPackage = join(moduleDir, "../../apps/api/package.json");

export function assertJpegPortrait(bytes) {
  if (!bytes || bytes.length < 3 || bytes.length > PORTRAIT_MAX_BYTES) {
    throw new Error("JPEG de demonstração fora do limite da ficha");
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw new Error("O retrato não é um JPEG");
  }
  return bytes;
}

async function loadSharp() {
  const require = createRequire(apiPackage);
  try {
    return require("sharp");
  } catch {
    return createRequire(import.meta.url)("sharp");
  }
}

export async function renderQaPortrait(svgPath) {
  const svg = readFileSync(svgPath);
  if (!svg.subarray(0, 64).toString("utf8").includes("<svg")) {
    throw new Error("A origem do retrato não é SVG de demonstração");
  }
  const sharp = await loadSharp();
  let quality = 80;
  let size = 400;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const output = await sharp(svg, { density: 144, animated: false, limitInputPixels: 4_000_000 })
      .resize(size, size, { fit: "cover" })
      .jpeg({ quality, mozjpeg: false })
      .toBuffer();
    if (output.length <= PORTRAIT_MAX_BYTES && output[0] === 0xff && output[1] === 0xd8 && output[2] === 0xff) {
      return assertJpegPortrait(output);
    }
    quality = Math.max(40, quality - 10);
    size = Math.max(240, size - 40);
  }
  throw new Error("Não foi possível converter o retrato SVG dentro do limite");
}
