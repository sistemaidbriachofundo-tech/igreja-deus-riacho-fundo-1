import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const homePage = readFileSync(join(__dirname, "../app/page.tsx"), "utf8");
const statusPage = readFileSync(
  join(__dirname, "../app/status/page.tsx"),
  "utf8",
);

describe("public landing", () => {
  it("keeps a single-congregation Portuguese hero with CTAs", () => {
    expect(homePage).toContain("Igreja de Deus");
    expect(homePage).toContain("no Riacho Fundo I");
    expect(homePage).toContain("Uma casa de fé, família e comunhão");
    expect(homePage).toContain("Próximo culto");
    expect(homePage).toContain("Fale conosco");
    expect(homePage).not.toMatch(/multi-?igreja|trocar congregação|church switcher/i);
  });

  it("moves engineering status off the homepage", () => {
    expect(homePage).not.toContain("Skeleton F1-SEC");
    expect(homePage).toContain('href="/status/"');
    expect(statusPage).toContain("Status do bootstrap");
    expect(statusPage).toContain("CI: lint → typecheck → test → build");
  });
});
