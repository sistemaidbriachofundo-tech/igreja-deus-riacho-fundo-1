import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(__dirname, "..", path), "utf8");
describe("Church OS portal editorial contract", () => {
  it("mantém agenda e capa como ações do portal", () => {
    const studio = read("components/EditorialStudio.tsx");
    const appShell = read("components/AppShell.tsx");
    expect(studio).toContain('"/cms/contents"');
    expect(studio).toContain('"/events"');
    expect(studio).toContain('"/ministries"');
    expect(studio).toContain('href="/app/site/#capa"');
    expect(studio).not.toContain('"/volunteer-interests"');
    expect(studio).not.toContain("Notícias e páginas");
    expect(studio).toContain('"/publish"');
    expect(studio).toContain("publicApiBase(process.env.NEXT_PUBLIC_API_URL)");
    expect(appShell).toContain('aria-label="Módulos"');
    expect(studio).not.toContain("localStorage");
    expect(studio).not.toContain("dangerouslySetInnerHTML");
  });
  it("preserves the backend authority over role and publication permissions", () => {
    const studio = read("components/EditorialStudio.tsx");
    expect(studio).toContain('Authorization:"Bearer "+token');
    expect(studio).toContain("credentials:\"omit\"");
    expect(studio).toContain("mayPublishRecord(canPublish, currentEvent.status)");
    expect(studio).toContain("permissions?.canPublish === true");
    expect(studio).toContain('role="status"');
  });
});
