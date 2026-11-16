import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  blockedCases,
  hasFoundationComponents,
  pageRoutes,
  repoRoot,
} from "./inventory.mjs";

test("o portal público e os fluxos de login estão na árvore de rotas", () => {
  const routes = pageRoutes();
  for (const route of ["/", "/a-igreja/", "/eventos/", "/login/", "/ativar-acesso/", "/redefinir-senha/"]) {
    assert.ok(routes.includes(route), route);
  }
});

test("o painel tem rotas para Secretaria, Tesouraria, ministérios e voluntariado", () => {
  const routes = pageRoutes();
  for (const route of [
    "/app/", "/app/secretaria/", "/app/tesouraria/", "/app/ministerios/", "/app/servir/meu-espaco/",
  ]) {
    assert.ok(routes.includes(route), route);
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

test("os componentes da fundação usam os tokens e o alvo mínimo de toque", () => {
  assert.ok(hasFoundationComponents());
  const tokens = readFileSync(join(repoRoot, "apps/web/src/components/ui/tokens.ts"), "utf8");
  assert.match(tokens, /#D4AF37/i);
  assert.match(tokens, /touchTarget: "2\.75rem"/);
  assert.match(tokens, /Ouro sobre creme/);
});
