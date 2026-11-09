/**
 * API local só com pessoas fictícias para o QA da frente A1.
 * Não lê .env, não conecta em banco e não aceita domínio real.
 */
import { createServer } from "node:http";

const port = Number(process.env.STUB_PORT ?? 4010);
const user = {
  userId: "u-sintetica",
  personId: "p-sintetica",
  email: "secretaria.sintetica@example.test",
  grants: [{ roleCode: "SECRETARIA", organizationId: null, churchId: null }],
};
const leader = {
  ...user,
  userId: "u-lider",
  personId: "p-lider",
  email: "lider.sintetico@example.test",
  grants: [{ roleCode: "LIDER_MINISTERIO", organizationId: null, churchId: null }],
};

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": res.req?.headers.origin ?? "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function accountFor(email) {
  if (email === leader.email) return leader;
  if (email === user.email) return user;
  return null;
}

const server = createServer((req, res) => {
  res.req = req;
  if (req.method === "OPTIONS") {
    send(res, 204, {});
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
        send(res, 401, { message: "401 credencial sintética apenas" });
        return;
      }
      if (email === "lento@example.test") {
        setTimeout(() => send(res, 401, { message: "401 tarde demais" }), 20_000);
        return;
      }
      if (email === "sem.permissao@example.test") {
        send(res, 403, { message: "403 sem permissão" });
        return;
      }
      if (body.password !== "sintetica-local") {
        send(res, 401, { message: "401 credencial" });
        return;
      }
      if (email === "expira@example.test") {
        send(res, 200, {
          accessToken: "expire-me", tokenType: "Bearer", expiresInSeconds: 3600,
          user: { ...user, email },
        });
        return;
      }
      const account = accountFor(email);
      if (!account) {
        send(res, 401, { message: "401 credencial" });
        return;
      }
      const token = account === leader ? "token-lider" : "token-secretaria";
      send(res, 200, { accessToken: token, tokenType: "Bearer", expiresInSeconds: 3600, user: account });
    });
    return;
  }
  const token = String(req.headers.authorization ?? "");
  if (!token.startsWith("Bearer ")) {
    send(res, 401, { message: "401 sessão ausente" });
    return;
  }
  if (token === "Bearer expire-me" && url.pathname !== "/auth/me") {
    send(res, 401, { message: "401 sessão encerrada" });
    return;
  }
  if (token !== "Bearer token-secretaria" && token !== "Bearer token-lider" && token !== "Bearer expire-me") {
    send(res, 401, { message: "401 sessão inválida" });
    return;
  }
  if (req.method === "GET" && url.pathname === "/auth/me") {
    send(res, 200, token === "Bearer token-lider" ? leader : user);
    return;
  }
  if (req.method === "GET" && (url.pathname === "/memberships" || url.pathname === "/admissions" || url.pathname === "/households")) {
    const key = url.pathname.slice(1);
    send(res, 200, { [key]: [] });
    return;
  }
  send(res, 404, { message: "404 rota não simulada" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`synthetic-auth-stub http://127.0.0.1:${port}`);
});
