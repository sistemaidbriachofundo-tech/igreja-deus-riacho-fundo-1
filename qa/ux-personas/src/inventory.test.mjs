import assert from "node:assert/strict";
import test from "node:test";
import {
  blockedCases,
  designSystemIsOnMain,
  pageRoutes,
  readFoundationTokens,
} from "./inventory.mjs";

test("o portal público e o login estão na árvore de rotas", () => {
  const routes = pageRoutes();
  for (const route of ["/", "/a-igreja/", "/eventos/", "/login/", "/app/", "/app/secretaria/", "/app/operacao/"]) {
    assert.ok(routes.includes(route), route);
  }
});

test("não existem dashboards dedicados de pastor, admin, tesouraria, líder ou membro", () => {
  const routes = pageRoutes();
  for (const route of ["/app/pastor/", "/app/admin/", "/app/tesouraria/", "/app/lider/", "/app/membro/", "/design-system/"]) {
    assert.equal(routes.includes(route), false, route);
  }
});

test("casos bloqueados trazem motivo e não são apresentados como prontos", () => {
  const blocked = blockedCases();
  assert.ok(blocked.length >= 7);
  for (const item of blocked) {
    assert.equal(item.kind, "blocked");
    assert.ok(item.reason.length > 40, item.id);
  }
  const ids = blocked.map((item) => item.id);
  for (const id of ["UX-07", "UX-08", "UX-09", "UX-10", "UX-11", "UX-12", "UX-13"]) {
    assert.ok(ids.includes(id), id);
  }
});

test("a fundação #102 não está aplicada na main", () => {
  assert.equal(designSystemIsOnMain(), false);
  const foundation = readFoundationTokens();
  if (!foundation.available) return;
  assert.match(foundation.text, /#D4AF37/);
  assert.match(foundation.text, /touchTarget: "2\.75rem"/);
  assert.match(foundation.text, /Ouro sobre creme/);
});
