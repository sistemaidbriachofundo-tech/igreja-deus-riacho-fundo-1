import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("catálogo formal nos cortes 360, 768 e 1440", () => {
  const css = readFileSync(join(__dirname, "ministry-membership-catalog.module.css"), "utf8");

  it("empilha a equipe em 360 e 768 e limita a largura em 1440", () => {
    expect(css).toContain("@media (max-width: 768px)");
    expect(css).toContain("@media (max-width: 360px)");
    expect(css).toContain("@media (min-width: 1440px)");
    const mobile = css.slice(css.indexOf("@media (max-width: 360px)"));
    expect(mobile).toContain("grid-template-columns: 1fr");
    expect(mobile).toContain("width: 100%");
    expect(css).toContain("min-height: 48px");
    expect(css).toContain("outline: 3px solid");
  });
});
