import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyAltSuggestion, gateRiachinhoPrompt } from "./riachinho-gate";
import { DEPENDENCY_REPORT } from "./dependencies";
import {
  dispatch,
  EXAMPLE_DRAFT,
  initialStudio,
  pagePiece,
  publicNavListsMinistries,
  visibleVersion,
  type Studio,
} from "./workflow";

const studioFiles = ["W1PortalStudio.tsx", "workflow.ts", "riachinho-gate.ts", "dependencies.ts"];

function journey(): Studio {
  let studio = initialStudio();
  const created = dispatch(studio, "editor", { type: "create", id: "encontro", input: EXAMPLE_DRAFT });
  expect(created.ok).toBe(true);
  studio = created.studio;
  studio = dispatch(studio, "editor", { type: "submit", id: "encontro" }).studio;
  studio = dispatch(studio, "publisher", { type: "approve", id: "encontro" }).studio;
  const preview = dispatch(studio, "publisher", { type: "preview" });
  expect(preview.ok).toBe(true);
  return preview.studio;
}

describe("prévia W1 do portal", () => {
  it("mantém a navegação pública em quatro destinos, sem ministérios", () => {
    expect(publicNavListsMinistries()).toBe(false);
    const publicStudio = join(__dirname, "../app/w1-estudio/page.tsx");
    expect(existsSync(publicStudio)).toBe(false);
    const studio = studioFiles.map((file) => readFileSync(join(__dirname, file), "utf8")).join("\n");
    expect(studio).not.toContain("AppShell");
    expect(studio).not.toContain("LoginScreen");
    expect(studio).not.toContain("HmlPhaseOne");
    expect(studio).not.toContain("schema.prisma");
    expect(DEPENDENCY_REPORT.filter((item) => item.state === "BLOCKED")).toHaveLength(2);
    expect(DEPENDENCY_REPORT.some((item) => item.state === "ISOLATED")).toBe(true);
  });

  it("percorre editor, revisão, aprovação, prévia, publicação simulada e rollback", () => {
    const preview = journey();
    expect(visibleVersion(preview, "publicado").pieces.some((piece) => piece.title === EXAMPLE_DRAFT.title)).toBe(false);
    expect(visibleVersion(preview, "previa").pieces.some((piece) => piece.title === EXAMPLE_DRAFT.title)).toBe(true);
    expect(pagePiece(visibleVersion(preview, "previa"), "inicio")?.title).toBe("Igreja de Deus no Riacho Fundo I");

    const denied = dispatch(preview, "editor", { type: "publish" });
    expect(denied.ok).toBe(false);
    expect(denied.studio.versions).toHaveLength(1);

    const published = dispatch(preview, "publisher", { type: "publish" });
    expect(published.ok).toBe(true);
    expect(published.studio.officialSiteActivated).toBe(false);
    expect(published.studio.preview).toBeNull();
    expect(visibleVersion(published.studio, "publicado").pieces.some((piece) => piece.title === EXAMPLE_DRAFT.title)).toBe(true);

    const restored = dispatch(published.studio, "publisher", { type: "rollback" });
    expect(restored.ok).toBe(true);
    expect(restored.studio.officialSiteActivated).toBe(false);
    expect(visibleVersion(restored.studio, "publicado").pieces.some((piece) => piece.title === EXAMPLE_DRAFT.title)).toBe(false);
    expect(restored.studio.drafts.find((draft) => draft.id === "encontro")?.status).toBe("aprovado");
  });

  it("recusa publicação sem prévia, mídia sem cessão e dado pessoal no rascunho", () => {
    const studio = initialStudio();
    expect(dispatch(studio, "publisher", { type: "publish" }).ok).toBe(false);
    const created = dispatch(studio, "editor", { type: "create", id: "item", input: EXAMPLE_DRAFT });
    const blockedMedia = dispatch(created.studio, "editor", {
      type: "attach-media",
      id: "item",
      mediaId: "sem-cessao",
      rightsAcknowledged: true,
    });
    expect(blockedMedia.ok).toBe(false);
    const personal = dispatch(studio, "editor", {
      type: "create",
      id: "pessoal",
      input: { ...EXAMPLE_DRAFT, body: "Escreva para pessoa@example.com sobre a agenda." },
    });
    expect(personal.ok).toBe(false);
    expect(personal.message).toContain("e-mail");
  });

  it("não envia pergunta ao Riachinho e preserva Alts não citados", () => {
    const sensitive = gateRiachinhoPrompt("Qual o CPF 123.456.789-09 do membro?");
    expect(sensitive.sent).toBe(false);
    expect(sensitive.reason).toContain("não será enviada");

    const mock = gateRiachinhoPrompt("Sugira um título curto para o encontro de domingo.");
    expect(mock.sent).toBe(false);
    expect(mock.reason).toContain("Nada foi enviado");

    const ready = gateRiachinhoPrompt("Sugira um título curto para o encontro de domingo.", {
      provider: "gemini",
      credentialsReady: true,
    });
    expect(ready.sent).toBe(false);
    expect(ready.reason).toContain("Nada foi transmitido");

    const current = ["Louvor", "Oração", "Palavra", "Juventude"];
    const applied = applyAltSuggestion(current, "Alt 2: Comunidade em oração — imagem ilustrativa");
    expect(applied.alts).toEqual([
      "Louvor",
      "Comunidade em oração — imagem ilustrativa",
      "Palavra",
      "Juventude",
    ]);
    expect(applied.applied).toBe(1);
  });
});
