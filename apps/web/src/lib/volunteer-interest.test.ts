import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(__dirname, "../components/VolunteerInterestForm.tsx"), "utf8");
const publicMinistryPage = join(__dirname, "../app/ministerios/[slug]/page.tsx");

describe("segurança do interesse de voluntariado", () => {
  it("não solicita dados sem API, consentimento e aviso de privacidade", () => {
    expect(src).toContain("NEXT_PUBLIC_VOLUNTEER_INTAKE_ENABLED");
    expect(src).toContain("NEXT_PUBLIC_PORTAL_LIVE_ENABLED");
    expect(src).toContain("NEXT_PUBLIC_PRIVACY_URL");
    expect(src).toContain("if(!base||!enabled||!validPolicy)return null");
    expect(src).toContain('ministrySlug:"atmosfera"');
    expect(src).toContain('credentials:"omit"');
    expect(src).toContain("consent");
    expect(src).toContain("adult");
    expect(src).not.toContain("localStorage");
    expect(src).not.toContain("cpf");
  });

  it("não expõe a antiga página ministerial no site institucional", () => {
    expect(existsSync(publicMinistryPage)).toBe(false);
    expect(existsSync(join(__dirname, "../app/app/ministerios/page.tsx"))).toBe(true);
  });
});
