import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(__dirname, "..", path), "utf8");
describe("Church OS portal editorial contract", () => {
  it("connects real admin operations to existing NestJS endpoints", () => {
    const studio = read("components/EditorialStudio.tsx");
    const appShell = read("components/AppShell.tsx");
    expect(studio).toContain("apiLogin(");
    expect(studio).toContain('"/cms/contents"');
    expect(studio).toContain('"/events"');
    expect(studio).toContain('"/ministries"');
    expect(studio).toContain('"/volunteer-interests"');
    expect(studio).toContain('"voluntarios"');
    expect(studio).toContain("ACOMPANHAMENTO PRIVADO");
    expect(studio).toContain("secureImageUrl");
    expect(studio).toContain("galleryUrls");
    expect(studio).toContain("coverImageUrl");
    expect(studio).toContain('"/publish"');
    expect(studio).toContain('"/advance"');
    expect(studio).toContain("publicApiBase(process.env.NEXT_PUBLIC_API_URL)");
    expect(appShell).toContain("Estúdio editorial");
    expect(studio).not.toContain("localStorage");
    expect(studio).not.toContain("dangerouslySetInnerHTML");
  });
  it("preserves the backend authority over role and publication permissions", () => {
    const studio = read("components/EditorialStudio.tsx");
    expect(studio).toContain('Authorization:"Bearer "+token');
    expect(studio).toContain("credentials:\"omit\"");
    expect(studio).toContain("transitions");
    expect(studio).toContain('role="status"');
  });
});
