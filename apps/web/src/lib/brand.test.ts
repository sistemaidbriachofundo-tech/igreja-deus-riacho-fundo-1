import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_SLUG } from "@idbrf/shared";
import { brandColors, brandCssVars, brandFonts, officialLogoAsset } from "./brand";

const globalsCss = readFileSync(
  join(__dirname, "../app/globals.css"),
  "utf8",
);

describe("web brand", () => {
  it("uses the approved SVG without rasterized checkerboard or clipping surfaces", () => {
    expect(officialLogoAsset).toBe("/images/idb-riacho-oficial-transparente.svg");
    const svg = readFileSync(join(__dirname, "../../public", officialLogoAsset.slice(1)), "utf8");
    expect(svg).toContain('viewBox="286 96 1664 1832"');
    expect(svg).toContain('fill="#ff5700"');
    expect(svg).toMatch(/<path\\b/);
    expect(svg).not.toMatch(/<(?:rect|image|pattern|foreignObject)\\b/i);
    expect(svg).not.toMatch(/<(?:script|style)\\b/i);
    for (const filename of [
      "LoginScreen.tsx", "AppShell.tsx", "PublicPortal.tsx",
      "SiteManager.tsx", "ViviEditorialAssistant.tsx",
    ]) {
      const component = readFileSync(join(__dirname, "../components", filename), "utf8");
      expect(component).toContain("officialLogoAsset");
      expect(component).not.toContain("idb-riacho-oficial-2026.webp");
      expect(component).not.toContain("logo-igreja-aprovada.webp");
    }
    const shellCss = readFileSync(join(__dirname, "../components/app-shell.module.css"), "utf8");
    expect(shellCss).not.toMatch(/\\.brandEmblem\\s*\\{[^}]*background-size:\\s*cover/s);
    const loginCss = readFileSync(join(__dirname, "../components/login-screen.module.css"), "utf8");
    expect(loginCss).toMatch(/\\.brand img\\s*\\{[^}]*object-fit:\\s*contain/s);
    expect(loginCss).toMatch(/\\.brand img\\s*\\{[^}]*background:\\s*transparent/s);
  });

  it("uses shared slug", () => {
    expect(APP_SLUG).toBe("igreja-deus-riacho-fundo-1");
  });

  it("exposes official brand color tokens", () => {
    expect(brandColors).toEqual({
      dourado: "#D4AF37",
      marrom: "#4A2612",
      creme: "#F7EDE0",
      bronze: "#B8742D",
      terracota: "#C6583E",
      laranja: "#FF5700",
      preto: "#000000",
    });
  });

  it("maps CSS variable names for the design tokens", () => {
    expect(brandCssVars["--color-dourado"]).toBe("#D4AF37");
    expect(brandCssVars["--color-marrom"]).toBe("#4A2612");
    expect(brandCssVars["--color-creme"]).toBe("#F7EDE0");
    expect(brandCssVars["--color-bronze"]).toBe("#B8742D");
    expect(brandCssVars["--color-terracota"]).toBe("#C6583E");
  });

  it("locks Montserrat for titles and Inter for body", () => {
    expect(brandFonts.title).toBe("Montserrat");
    expect(brandFonts.body).toBe("Inter");
  });

  it("declares the brand tokens in globals.css", () => {
    for (const [name, value] of Object.entries(brandCssVars)) {
      expect(globalsCss).toContain(`${name}: ${value.toLowerCase()};`);
    }
    expect(globalsCss).toContain("--font-title:");
    expect(globalsCss).toContain("--font-body:");
    expect(globalsCss).toContain("Montserrat");
    expect(globalsCss).toContain("Inter");
  });
});
