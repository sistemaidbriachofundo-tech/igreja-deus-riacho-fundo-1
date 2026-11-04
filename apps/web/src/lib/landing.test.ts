import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const homePage = readFileSync(join(__dirname, "../app/page.tsx"), "utf8");
const statusPage = readFileSync(
  join(__dirname, "../app/status/page.tsx"),
  "utf8",
);
const globalsCss = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
const publicImages = join(__dirname, "../../public/images");

describe("public landing", () => {
  it("keeps a single-congregation Portuguese hero with CTAs", () => {
    expect(homePage).toContain("Igreja de Deus");
    expect(homePage).toContain("no Riacho Fundo I");
    expect(homePage).toContain("Uma igreja para Deus, pelas famílias");
    expect(homePage).toContain("Nossos cultos");
    expect(homePage).toContain("@idbriacho_");
    expect(homePage).toContain("https://www.instagram.com/idbriacho_/");
    expect(homePage).not.toMatch(/multi-?igreja|trocar congregação|church switcher/i);
  });

  it("uses full-bleed photo hero instead of empty placeholders", () => {
    expect(homePage).toContain("hero-worship.jpg");
    expect(homePage).toContain("welcome-gathering.jpg");
    expect(homePage).toContain("culto-light.jpg");
    expect(homePage).not.toContain("Em breve");
    expect(homePage).not.toContain("service-placeholder");
    expect(homePage).not.toContain("hero-glow");
    expect(globalsCss).toContain(".hero-photo");
    expect(globalsCss).toContain("ken-burns");
    expect(existsSync(join(publicImages, "hero-worship.jpg"))).toBe(true);
    expect(existsSync(join(publicImages, "welcome-gathering.jpg"))).toBe(true);
    expect(existsSync(join(publicImages, "culto-light.jpg"))).toBe(true);
  });

  it("moves engineering status off the homepage", () => {
    expect(homePage).not.toContain("Skeleton F1-SEC");
    expect(homePage).toContain('href="/status/"');
    expect(statusPage).toContain("Status do bootstrap");
    expect(statusPage).toContain("CI: lint → typecheck → test → build");
  });
});
