import assert from "node:assert/strict";
import test from "node:test";
import { scanInventory } from "./inventory.mjs";

test("inventário marca o editor simulado, a IA pública e o fallback local", () => {
  const inventory = scanInventory();
  const studio = inventory.routes.find((route) => route.route === "/w1-estudio/");
  const design = inventory.routes.find((route) => route.route === "/design-system/");
  const operation = inventory.routes.find((route) => route.route === "/app/operacao/");
  assert.equal(studio.classification, "EDITOR_SIMULADO");
  assert.equal(design.classification, "FERRAMENTA_ENGENHARIA");
  assert.equal(operation.classification, "SUPERFICIE_REJEITADA");
  assert.equal(inventory.flags.publicAiMounted, true);
  assert.equal(inventory.flags.publicAiEnabledOnMain, true);
  assert.equal(inventory.flags.hmlEnabledOnMain, true);
  assert.equal(inventory.flags.simulatedRole, true);
  assert.equal(inventory.flags.individualAccessCopy, true);
  assert.equal(inventory.flags.operationLabel, true);
  assert.equal(inventory.flags.meuEspacoInAdminMenu, true);
  assert.equal(inventory.flags.localStorageFallback, true);
  assert.equal(inventory.flags.internalAssistant, true);
  assert.equal(inventory.flags.hmlCombinedCta, true);
  assert.equal(inventory.flags.hmlSeparateCtas, false);
  assert.equal(inventory.flags.overviewUsesPersonaHome, true);
  const chat = inventory.components.find((item) => item.file.endsWith("RiachinhoPublicChat.tsx"));
  const internal = inventory.components.find((item) => item.file.endsWith("ViviEditorialAssistant.tsx"));
  assert.ok(chat.importers.some((file) => file.endsWith("PublicPortal.tsx")));
  assert.ok(internal.importers.some((file) => file.endsWith("SiteManager.tsx")));
});
