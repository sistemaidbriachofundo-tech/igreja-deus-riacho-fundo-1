import sharp from "sharp";
import { jpegPortrait } from "../persons/person-photo";
import { detectProfileImage, normalizeProfilePhoto, PROFILE_PHOTO_MAX_INPUT_BYTES } from "./account-photo";

describe("foto de perfil", () => {
  it("recusa arquivo que não é imagem e arquivo acima de 5 MiB", async () => {
    await expect(normalizeProfilePhoto(Buffer.from("nao-e-imagem"))).rejects.toMatchObject({
      response: { code: "ACCOUNT_PHOTO_INVALID" },
    });
    const huge = Buffer.alloc(PROFILE_PHOTO_MAX_INPUT_BYTES + 1, 0xff);
    huge[0] = 0xff;
    huge[1] = 0xd8;
    huge[2] = 0xff;
    await expect(normalizeProfilePhoto(huge)).rejects.toMatchObject({
      response: { code: "ACCOUNT_PHOTO_TOO_LARGE" },
    });
  });

  it("normaliza PNG e WebP para o JPEG que a carteirinha já sabe ler", async () => {
    const png = await sharp({
      create: { width: 12, height: 8, channels: 3, background: { r: 20, g: 40, b: 60 } },
    }).png().toBuffer();
    const webp = await sharp({
      create: { width: 12, height: 8, channels: 3, background: { r: 9, g: 8, b: 7 } },
    }).webp().toBuffer();
    expect(detectProfileImage(png)).toBe("image/png");
    expect(detectProfileImage(webp)).toBe("image/webp");
    for (const source of [png, webp]) {
      const stored = await normalizeProfilePhoto(source);
      const issued = jpegPortrait(stored);
      expect(issued?.equals(stored)).toBe(true);
      expect(stored.includes(Buffer.from("Exif"))).toBe(false);
    }
  });
});
