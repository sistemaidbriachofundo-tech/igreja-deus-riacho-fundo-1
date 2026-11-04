import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_SLUG } from "@idbrf/shared";
import { brandColors, brandCssVars, brandFonts } from "./brand";

const globalsCss = readFileSync(
  join(__dirname, "../app/globals.css"),
  "utf8",
);

describe("web brand", () => {
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
