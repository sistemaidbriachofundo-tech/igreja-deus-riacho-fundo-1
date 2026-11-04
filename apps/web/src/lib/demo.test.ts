import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const demo = readFileSync(join(__dirname, "../app/app/demo/page.tsx"), "utf8");
const home = readFileSync(join(__dirname, "../app/page.tsx"), "utf8");
const overview = readFileSync(join(__dirname, "../app/app/page.tsx"), "utf8");

describe("F2 GitHub Pages demonstration – static contract checks", () => {
  it("makes the demo discoverable in the institutional portal and overview", () => {
    expect(home).toContain('withBasePath("/app/demo/")');
    expect(overview).toContain('withBasePath("/app/demo/")');
  });
  it("clearly distinguishes fictitious demonstration from real authentication", () => {
    expect(demo).toContain("Dados 100% fictícios");
    expect(demo).toContain("a seleção de perfis não é login");
    expect(demo).not.toContain("apiLogin(");
    expect(demo).not.toContain("apiPost(");
  });
  it("reflects proposed F2 admissions steps and keeps credential issuance gated", () => {
    expect(demo).toContain('["modality", "documents", "secretaria", "pastor"]');
    expect(demo).toContain('status === "ACTIVE" && STEP_ORDER.every');
    expect(demo).toContain('step === "pastor" ? role !== "PASTOR"');
    expect(demo).toContain('if (!p || (value === "ACTIVE" && !isEligible(p)))');
  });
  it("limits the member's displayed list to their fictitious person", () => {
    expect(demo).toContain('people.filter((p) => p.id === "p-002")');
    expect(demo).toContain('tabs.filter((t) => isStaff');
  });
});
