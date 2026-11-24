/**
 * API local só com pessoas fictícias para o QA da frente A1.
 * Não lê .env, não conecta em banco e não aceita domínio real.
 * A senha vem de STUB_PASSWORD (mínimo 16). O processo não embute senha nem token previsível.
 */
import { createServer } from "node:http";
import { assertStubPassword, corsHeaders, createSessionToken } from "./synthetic-auth-policy.mjs";

const port = Number(process.env.STUB_PORT ?? 4010);
let password;
try {
  password = assertStubPassword(process.env.STUB_PASSWORD);
} catch (error) {
  console.error(error instanceof Error ? error.message : "STUB_PASSWORD inválido");
  process.exit(1);
}

function syntheticPersona(id, email, roleCode, canManageConnection = false) {
  return {
    userId: "u-" + id,
    personId: "p-" + id,
    email,
    canManageConnection,
    grants: [{ roleCode, organizationId: null, churchId: null }],
  };
}
const user = syntheticPersona("sintetica", "secretaria.sintetica@example.test", "SECRETARIA");
const leader = syntheticPersona("lider", "lider.sintetico@example.test", "LIDER_MINISTERIO", true);
const personas = [
  user, leader,
  syntheticPersona("admin", "admin.sintetico@example.test", "PLATFORM_ADMIN", true),
  syntheticPersona("pastor", "pastor.sintetico@example.test", "PASTOR", true),
  syntheticPersona("tesouraria", "tesouraria.sintetica@example.test", "TESOURARIA"),
  syntheticPersona("membro", "membro.sintetico@example.test", "MEMBRO"),
  syntheticPersona("convidado", "convidado.sintetico@example.test", "CONVIDADO"),
  syntheticPersona("editor", "editor.sintetico@example.test", "EDITOR_SITE"),
];

const sessions = new Map();

function send(req, res, status, body) {
  const payload = status === 204 ? "" : JSON.stringify(body);
  res.writeHead(status, {
    ...(status === 204 ? {} : { "Content-Type": "application/json" }),
    ...corsHeaders(req.headers.origin),
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function accountFor(email) {
  return personas.find(person => person.email === email) ?? null;
}

const server = createServer((req, res) => {
  if (req.method === "OPTIONS") {
    send(req, res, 204, {});
    return;
  }
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (req.method === "POST" && url.pathname === "/auth/login") {
    let raw = "";
    req.on("data", chunk => { raw += chunk; });
    req.on("end", () => {
      let body = {};
      try { body = JSON.parse(raw || "{}"); } catch { body = {}; }
      const email = String(body.email ?? "");
      if (!email.endsWith("@example.test")) {
        send(req, res, 401, { message: "401 credencial sintética apenas" });
        return;
      }
      if (email === "lento@example.test") {
        setTimeout(() => send(req, res, 401, { message: "401 tarde demais" }), 20_000);
        return;
      }
      if (email === "sem.permissao@example.test") {
        send(req, res, 403, { message: "403 sem permissão" });
        return;
      }
      if (body.password !== password) {
        send(req, res, 401, { message: "401 credencial" });
        return;
      }
      const account = accountFor(email);
      if (!account && email !== "expira@example.test") {
        send(req, res, 401, { message: "401 credencial" });
        return;
      }
      const token = createSessionToken();
      const sessionUser = account ?? { ...user, email };
      sessions.set(token, { user: sessionUser, expireAfterMe: email === "expira@example.test" });
      send(req, res, 200, {
        accessToken: token,
        tokenType: "Bearer",
        expiresInSeconds: 3600,
        user: sessionUser,
      });
    });
    return;
  }
  const header = String(req.headers.authorization ?? "");
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const session = sessions.get(token);
  if (!session) {
    send(req, res, 401, { message: "401 sessão inválida" });
    return;
  }
  if (session.expireAfterMe && url.pathname !== "/auth/me") {
    send(req, res, 401, { message: "401 sessão encerrada" });
    return;
  }
  if (req.method === "GET" && url.pathname === "/auth/me") {
    send(req, res, 200, session.user);
    return;
  }
  // Isolated, read-only fixture for the real ministry roster page visual regression.
  if (req.method === "GET" && session.user.grants.some(grant => grant.roleCode === "PLATFORM_ADMIN")) {
    const ministryId = "qa-visual-louvor";
    const scope = "/ministry-scope/" + ministryId;
    if (url.pathname === "/ministries") {
      send(req, res, 200, { ministries: [{ id: ministryId, name: "Louvor (sintético)", slug: "louvor" }] });
      return;
    }
    if (url.pathname === scope + "/formal-memberships") { send(req, res, 200, { members: [] }); return; }
    if (url.pathname === scope + "/agenda") { send(req, res, 200, { blocked: false, items: [] }); return; }
    if (url.pathname === scope + "/requests") { send(req, res, 200, { blocked: false, requests: [] }); return; }
    if (url.pathname === scope + "/cost-center-balance") { send(req, res, 200, { currency: "BRL", configured: false, balanceCents: null }); return; }
    if (url.pathname === "/rosters/by-ministry/" + ministryId) {
      const month = new Intl.DateTimeFormat("sv-SE", {timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit"}).format(new Date());
      send(req, res, 200, {
        ministryId, modules: [{ id: "qa-visual-equipe", name: "Equipe sintética" }],
        permissions: { scope: "ministry", manageRosterMonth: true, manageModuleMemberships: true },
        rosters: [{ id: "qa-visual-culto", ministryId, moduleId: "qa-visual-equipe", title: "Culto sintético", serviceAt: month + "-15T13:00:00.000Z", status: "DRAFT", slots: [{ id: "qa-visual-slot", roleLabel: "Voz", assignments: [] }] }],
      }); return;
    }
  }
  if (req.method === "GET" && (url.pathname === "/memberships" || url.pathname === "/admissions" || url.pathname === "/households")) {
    const key = url.pathname.slice(1);
    send(req, res, 200, { [key]: [] });
    return;
  }
  send(req, res, 404, { message: "404 rota não simulada" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`synthetic-auth-stub http://127.0.0.1:${port}`);
});
