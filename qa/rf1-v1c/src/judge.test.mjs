import assert from "node:assert/strict";
import test from "node:test";
import { assertReportSafe, judge, summarize } from "./judge.mjs";
import { scanInventory } from "./inventory.mjs";

function baseObservation() {
  return {
    pagesSha: "6c43aea96ad3fe24ec1ed2c09f717963fb289c62",
    apiSha: "6c43aea96ad3fe24ec1ed2c09f717963fb289c62",
    apiHealth: 200,
    sessionOpened: false,
    preview: { url: "https://id-riacho1-web-hml.vercel.app/", status: 503, marker: "DEPLOYMENT_PAUSED" },
    pages: {
      home: {
        http: 200,
        navHrefs: ["/", "/a-igreja/", "/eventos/", "/login/"],
        hasQuemSomosAnchor: true,
        hasAgendaAnchor: true,
        riachinho: true,
        worstContrast: { ratio: 1.48, minimum: 4.5, text: "IMAGEM ILUSTRATIVA" },
        overflow: [],
      },
      "a-igreja": { http: 200, riachinho: true },
      eventos: { http: 200, riachinho: true },
      ministerios: { http: 200 },
      novidades: { http: 200 },
      visita: { http: 200 },
      contato: { http: 200 },
      login: { http: 200, hasEmail: true, hasPassword: true, title: "Login", individualAccess: true, echo: false, loginHttp: 401, alertExcerpt: "E-mail ou senha não autorizados." },
      "w1-estudio": { http: 200, simulated: true, title: "Prévia isolada do portal" },
      "design-system": { http: 200, title: "Fundação visual" },
      status: { http: 200, title: "Status do projeto", engineering: false },
      "app/editorial": { http: 200, title: "Estúdio Editorial — Church OS" },
      "app/operacao": { http: 200, title: "Operação integrada — DAS" },
    },
    logins: [
      { persona: "ADMIN", email: "platform.demo@example.test", http: 401, opened: false },
      { persona: "SECRETARIA", email: "ana.demo@example.test", http: 401, opened: false },
    ],
    anonymous: [
      { path: "/auth/me", http: 401 },
      { path: "/persons/search", http: 401 },
    ],
    timings: [{ path: "/", ttfbMs: 90, loadMs: 120, requests: 10 }],
    source: scanInventory(),
    authenticated: null,
  };
}

test("sem sessão não promove jornada autenticada a PASS", () => {
  const rows = judge(baseObservation());
  const byId = Object.fromEntries(rows.map((item) => [item.id, item.result]));
  assert.equal(byId["RF1-SHA"], "PASS");
  assert.equal(byId["RF1-PREVIEW"], "BLOCKED");
  assert.equal(byId["RF1-HOME-IA"], "FAIL");
  assert.equal(byId["RF1-HOME-PAGINA"], "FAIL");
  assert.equal(byId["RF1-LOGIN-TEXTO"], "FAIL");
  assert.equal(byId["RF1-LOGIN-ECO"], "PASS");
  assert.equal(byId["RF1-AUTH"], "BLOCKED");
  assert.equal(byId["RF1-CRD-ABRIR"], "BLOCKED");
  assert.equal(byId["RF1-ADM-VISUAL"], "BLOCKED");
  assert.equal(byId["RF1-PES-CTA"], "FAIL");
  assert.equal(byId["RF1-MBR-MENU"], "FAIL");
  assert.equal(byId["RF1-EDI-SIMULADO"], "FAIL");
  assert.equal(byId["RF1-EDI-INTERNO"], "PASS");
  assert.equal(rows.find((item) => item.id === "RF1-AUTH").result, "BLOCKED");
  const summary = summarize(rows);
  assert.ok(summary.blocked > 0);
  assert.ok(summary.pass > 0);
});

test("SHA divergente e prévia pronta mudam o veredito", () => {
  const obs = baseObservation();
  obs.pagesSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  obs.preview = { url: "https://preview.example/", status: 200, marker: "READY" };
  obs.sessionOpened = false;
  const rows = judge(obs);
  assert.equal(rows.find((item) => item.id === "RF1-SHA").result, "FAIL");
  assert.equal(rows.find((item) => item.id === "RF1-PREVIEW").result, "PASS");
});

test("relatório rejeita token e senha longa", () => {
  assert.doesNotThrow(() => assertReportSafe("platform.demo@example.test HTTP 401", "admin"));
  assert.throws(() => assertReportSafe('{"accessToken":"abc"}', "admin"));
  assert.throws(() => assertReportSafe("senha super-secreta-de-teste", "super-secreta-de-teste"));
});
