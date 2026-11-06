import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
const src=readFileSync(join(__dirname,"../components/VolunteerInterestForm.tsx"),"utf8");
const page=readFileSync(join(__dirname,"../app/ministerios/[slug]/page.tsx"),"utf8");
describe("Atmosfera interest safety gates",()=>{
  it("does not request data unless API, opt-in and privacy notice are configured",()=>{
    expect(src).toContain('NEXT_PUBLIC_VOLUNTEER_INTAKE_ENABLED');
    expect(src).toContain('NEXT_PUBLIC_PORTAL_LIVE_ENABLED');
    expect(src).toContain('NEXT_PUBLIC_PRIVACY_URL');
    expect(src).toContain('if(!base||!enabled||!validPolicy)return null');
    expect(src).toContain('ministrySlug:"atmosfera"');
    expect(src).toContain('credentials:"omit"');
    expect(src).toContain("consent");
    expect(src).toContain("adult");
    expect(src).not.toContain("localStorage");
    expect(src).not.toContain("cpf");
    expect(page).toContain('ministry.slug === "atmosfera"');
  });
});
