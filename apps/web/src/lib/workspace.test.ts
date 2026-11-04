import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(join(__dirname, "..", relativePath), "utf8");
}

const members = source("app/app/membros/page.tsx");
const secretary = source("app/app/secretaria/page.tsx");
const credentials = source("app/app/membros/carteirinha/page.tsx");
const login = source("components/DemoLogin.tsx");
const workspaceStyles = source("app/app/workspace.module.css");
const visualIdentity = source("../../IDENTIDADE_VISUAL.md");

describe("F2 visual workspace and real API boundaries", () => {
  it("reuses the same design language and official congregation photos", () => {
    for (const page of [members, secretary, credentials]) {
      expect(page).toContain("workspace.module.css");
      expect(page).toContain("heroImage");
      expect(page).toContain("heroShade");
      expect(page).toContain("app/demo/");
      expect(page).toContain("AppShell");
    }
    expect(workspaceStyles).toContain(".bigCard");
    expect(visualIdentity).toContain("#4A2612");
    expect(visualIdentity).toContain("#D4AF37");
  });

  it("does not bypass backend admissions approval in the Secretary UI", () => {
    expect(secretary).not.toContain("apiPost");
    expect(secretary).toContain("temporariamente indisponíveis");
    expect(secretary).toContain("aprovação pastoral");
  });

  it("keeps API login hidden on static Pages and never prepopulates its password", () => {
    expect(login).toContain('process.env.NODE_ENV === "development"');
    expect(login).toContain('useState("")');
    expect(login).toContain("apiConfigured");
    expect(login).toContain("/app/demo/");
  });

  it("renders membership data only after API authentication", () => {
    expect(members).toContain("!token ?");
    expect(members).toContain("apiGet<MembershipListResponse>");
    expect(members).toContain("rows.filter");
  });

  it("does not send the opaque credential token to an external QR service", () => {
    expect(credentials).toContain("containsSensitiveCredentialPayload");
    expect(credentials).toContain("token opaco");
    expect(credentials).not.toContain("api.qrserver.com");
    expect(credentials).not.toContain("chart.googleapis.com");
  });
});
