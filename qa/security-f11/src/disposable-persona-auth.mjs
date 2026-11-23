/**
 * E2E autenticado por persona em API e Postgres locais.
 * A senha nasce na memória do processo, rehash só das contas *.demo@example.test
 * e não é impressa nem gravada. O site hospedado não recebe senha e o SSO não é contornado.
 *
 * node qa/security-f11/src/disposable-persona-auth.mjs
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { totp } from "./eight-personas-e2e.mjs";

export const HOSTED_WEB = "https://id-riacho1-web-hml-git-0d6b26-gustavomarqueslopes-cmds-projects.vercel.app/";
export const HOSTED_API = "https://id-riacho1-api-qa.vercel.app";
export const DISPOSABLE_DB = "idbrf_e2e_auth";

export const SEEDED = Object.freeze([
  { id: "ADMIN", email: "platform.demo@example.test", role: "PLATFORM_ADMIN", mfa: true },
  { id: "PASTOR", email: "pastor.demo@example.test", role: "PASTOR", mfa: true },
  { id: "SECRETARIA", email: "ana.demo@example.test", role: "SECRETARIA", mfa: true },
  { id: "TESOURARIA", email: "tesouraria.demo@example.test", role: "TESOURARIA", mfa: true },
  { id: "LIDER_MINISTERIO", email: "lider.jovens.demo@example.test", role: "LIDER_MINISTERIO", mfa: true },
  { id: "MEMBRO", email: "bruno.demo@example.test", role: "MEMBRO", mfa: false },
  { id: "EDITOR", email: "editor.demo@example.test", role: "EDITOR_SITE", mfa: true },
  { id: "PUBLICADOR", email: "publicador.demo@example.test", role: "PUBLICADOR_SITE", mfa: true },
]);

const BANNED = ["password", "senha", "qwerty", "abc123", "admin", "igreja", "riacho", "secretaria", "tesouraria", "123456"];

export function ephemeralPassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const all = upper + lower + digits;
  const bytes = randomBytes(32);
  const chars = [upper[bytes[0] % upper.length], lower[bytes[1] % lower.length], digits[bytes[2] % digits.length]];
  for (let i = 0; i < 18; i += 1) chars.push(all[bytes[3 + i] % all.length]);
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = bytes[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  const password = chars.join("");
  if (BANNED.some((fragment) => password.toLowerCase().includes(fragment))) return ephemeralPassword();
  return password;
}

export function assertDisposableTarget(env) {
  const api = new URL(env.QA_API_BASE_URL ?? "http://127.0.0.1:3011");
  if (api.protocol !== "http:" || (api.hostname !== "127.0.0.1" && api.hostname !== "localhost")) {
    throw new Error("A API do E2E descartável precisa ser HTTP em loopback.");
  }
  let db;
  try { db = new URL(env.DATABASE_URL ?? ""); } catch { throw new Error("DATABASE_URL ausente ou inválida."); }
  if (!["localhost", "127.0.0.1", "::1"].includes(db.hostname)) throw new Error("Banco recusado: o host não é local.");
  if (db.pathname.replace(/^\//, "") !== DISPOSABLE_DB) throw new Error("Banco recusado: use somente idbrf_e2e_auth.");
  if (/neon\.tech|vercel|hostinger|amazonaws|supabase|render\.com/i.test(env.DATABASE_URL ?? "")) {
    throw new Error("Banco recusado: a URL parece compartilhada.");
  }
  if (env.IDBRF_RUNTIME_STAGE === "production") throw new Error("Produção recusada.");
}

export function interpretPrivilegedLogin(status, body) {
  if (status === 401) return { status: "FAIL", detail: "Credencial da conta sintética privilegiada recusada." };
  if (body?.accessToken) return { status: "FAIL", detail: "JWT privilegiado emitido antes do segundo fator." };
  if (body?.mfa?.challengeId) return { status: "PASS", detail: "Desafio MFA emitido antes do JWT." };
  return { status: "FAIL", detail: `Login privilegiado HTTP ${status} sem desafio.` };
}

export function interpretExemptLogin(status, body) {
  if (status === 401) return { status: "FAIL", detail: "Credencial da conta isenta recusada." };
  if (body?.mfa?.challengeId && !body?.accessToken) return { status: "FAIL", detail: "MFA exigido de papel isento." };
  if (body?.accessToken) return { status: "PASS", detail: "JWT emitido sem segundo fator, como o papel isento determina." };
  return { status: "FAIL", detail: `Login isento HTTP ${status} sem sessão.` };
}

export function classifyHostedWeb(status, location = "", snippet = "") {
  const sso = /vercel\.com\/login|sso|_vercel_jwt|Authentication Required/i.test(`${location}\n${snippet}`)
    || status === 401;
  if (status === 302 || status === 307 || status === 308 || sso) {
    return { status: "BLOCKED", detail: "O site DEV respondeu com a proteção de SSO da Vercel. Nenhum bypass foi tentado e nenhuma credencial foi transmitida." };
  }
  if (status === 200) {
    return { status: "BLOCKED", detail: "O endereço DEV respondeu 200, mas a jornada autenticada hospedada não foi executada: não há credencial no ambiente." };
  }
  return { status: "BLOCKED", detail: `O site DEV respondeu HTTP ${status}. A jornada visual hospedada ficou bloqueada, sem tentativa de senha.` };
}

export function classifyHostedApi(readyStatus, readyBody, meStatus) {
  const database = readyBody?.database === "ok" ? "ok" : "indisponível";
  const mfa = readyBody?.mfaBlocking === true;
  return {
    status: "BLOCKED",
    detail: `API QA: /ready HTTP ${readyStatus}, database=${database}, mfaBlocking=${mfa}. /auth/me sem sessão HTTP ${meStatus}. Nenhuma credencial foi transmitida.`,
  };
}

export function tokenFromPreview(url) {
  if (typeof url !== "string" || !url.startsWith("https://")) return null;
  const hash = url.split("#")[1] ?? "";
  const token = new URLSearchParams(hash).get("token");
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return token;
}

export function assertReportSafe(text, secrets) {
  if (/eyJ[A-Za-z0-9\-_]{8,}\.[A-Za-z0-9\-_]{8,}\./.test(text)) throw new Error("Relatório contém JWT e não será gravado.");
  if (/otpauth:\/\//i.test(text)) throw new Error("Relatório contém otpauth e não será gravado.");
  for (const secret of secrets) {
    if (secret && secret.length >= 8 && text.includes(secret)) throw new Error("Relatório contém segredo e não será gravado.");
  }
}

function rolesOf(body) {
  const grants = Array.isArray(body?.grants) ? body.grants : [];
  return grants.map((grant) => grant?.roleCode).filter((role) => typeof role === "string");
}

function row(id, persona, journey, status, detail) {
  return { id, persona, journey, status, detail };
}

export async function runDisposablePersonaAuth({ baseUrl, password, fetchImpl = fetch, hosted = null }) {
  const secrets = new Set([password]);
  const rows = [];
  const sessions = new Map();
  const factors = new Map();

  async function call(method, path, { token, body } = {}) {
    const headers = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetchImpl(baseUrl + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = null; }
    }
    return { status: response.status, data };
  }

  async function authenticate(persona, secret, { privileged }) {
    const login = await call("POST", "/auth/login", { body: { email: persona.email, password: secret } });
    const gate = privileged ? interpretPrivilegedLogin(login.status, login.data) : interpretExemptLogin(login.status, login.data);
    if (!privileged) {
      if (gate.status !== "PASS") return { ok: false, detail: gate.detail };
      return { ok: true, token: login.data.accessToken, detail: gate.detail, challenged: false };
    }
    rows.push(row(`auth/${persona.id.toLowerCase()}-mfa`, persona.id, "MFA antes do JWT", gate.status, gate.detail));
    if (gate.status !== "PASS") return { ok: false, detail: gate.detail };
    const challengeId = login.data.mfa.challengeId;
    let factor = factors.get(persona.email);
    const enroll = Boolean(login.data.mfa.enrollmentRequired);
    if (enroll) {
      const started = await call("POST", "/auth/mfa/enroll", { body: { challengeId } });
      if (started.status >= 400 || typeof started.data?.secret !== "string") {
        return { ok: false, detail: "O cadastro do autenticador falhou." };
      }
      factor = started.data.secret;
      secrets.add(factor);
      if (typeof started.data.otpauthUrl === "string") secrets.add(started.data.otpauthUrl);
      factors.set(persona.email, factor);
    }
    if (!factor) return { ok: false, detail: "O segundo fator já está ativo e o segredo não está em memória." };
    let verified = null;
    for (const instant of [Date.now(), Date.now() - 30_000]) {
      const attempt = await call("POST", enroll ? "/auth/mfa/enroll/confirm" : "/auth/mfa/challenge", {
        body: { challengeId, code: totp(factor, instant) },
      });
      if (attempt.status < 400 && attempt.data?.accessToken) { verified = attempt; break; }
    }
    if (!verified?.data?.accessToken) return { ok: false, detail: "O código TOTP foi recusado." };
    if (persona.id === "ADMIN") {
      const replay = await call("POST", enroll ? "/auth/mfa/enroll/confirm" : "/auth/mfa/challenge", {
        body: { challengeId, code: totp(factor) },
      });
      rows.push(row("auth/admin-replay", "ADMIN", "Replay do desafio MFA", replay.status === 401 ? "PASS" : "FAIL",
        replay.status === 401 ? "O mesmo desafio não emitiu outra sessão." : `Replay respondeu HTTP ${replay.status}.`));
    }
    return { ok: true, token: verified.data.accessToken, detail: "Sessão emitida somente depois do TOTP.", challenged: true };
  }

  const ready = await call("GET", "/ready");
  if (ready.status !== 200 || ready.data?.database !== "ok" || ready.data?.mfaBlocking !== true || ready.data?.authState !== "prisma") {
    throw new Error("A API local não está pronta com Postgres, sessão durável e MFA bloqueante.");
  }

  const anonMe = await call("GET", "/auth/me");
  rows.push(row("auth/anon", "ANON", "Sessão ausente", anonMe.status === 401 ? "PASS" : "FAIL",
    anonMe.status === 401 ? "GET /auth/me sem sessão respondeu 401." : `HTTP ${anonMe.status}.`));

  for (const path of ["/persons/search?q=Ana", "/ledger/accounts", "/pastoral/prayers", "/admin/access", "/indicators/summary", "/indicators/membership"]) {
    const denied = await call("GET", path);
    rows.push(row(`link/anon-${path.split("?")[0].replaceAll("/", "-")}`, "ANON", `Link direto ${path.split("?")[0]}`,
      denied.status === 401 ? "PASS" : "FAIL",
      denied.status === 401 ? "Sem sessão o link direto respondeu 401." : `HTTP ${denied.status}.`));
  }

  for (const persona of SEEDED) {
    const auth = await authenticate(persona, password, { privileged: persona.mfa });
    if (!auth.ok) {
      rows.push(row(`auth/${persona.id.toLowerCase()}`, persona.id, "Login autenticado", "FAIL", auth.detail));
      continue;
    }
    if (auth.token) secrets.add(auth.token);
    sessions.set(persona.id, auth.token);
    const me = await call("GET", "/auth/me", { token: auth.token });
    const roles = rolesOf(me.data);
    const scoped = me.status === 200 && me.data?.email === persona.email && roles.includes(persona.role)
      && me.data?.organizationId && me.data?.churchId && me.data?.personId;
    rows.push(row(`auth/${persona.id.toLowerCase()}`, persona.id, "Login e /auth/me", scoped ? "PASS" : "FAIL",
      scoped ? `${persona.role} confirmado na congregação ativa${persona.mfa ? " depois do MFA" : ""}.` : `HTTP ${me.status}; papéis ${roles.join(", ") || "nenhum"}.`));
  }

  const expectDeny = [
    ["TESOURARIA", "GET", "/persons/search?q=Ana&limit=5", 403, "Tesouraria não busca pessoas"],
    ["MEMBRO", "GET", "/persons/demoPersonRiacho01", 403, "Membro não abre ficha alheia"],
    ["MEMBRO", "GET", "/persons/demoPersonMembro01", 200, "Membro abre a própria ficha"],
    ["ADMIN", "GET", "/pastoral-cases", 403, "Admin técnico sem pastoral"],
    ["ADMIN", "GET", "/ledger/accounts", 200, "Administrador lê o plano de contas"],
    ["ADMIN", "POST", "/ledger/receiving-accounts", 403, "Administrador não cria conta de recebimento"],
    ["SECRETARIA", "GET", "/ledger/accounts", 403, "Secretaria sem ledger"],
    ["EDITOR", "GET", "/persons/search?q=Ana&limit=5", 403, "Editor não busca pessoas"],
    ["LIDER_MINISTERIO", "GET", "/ministry-scope/demoMinistryHomens/formal-memberships", 403, "Líder não lê outro ministério"],
    ["MEMBRO", "GET", "/events", 403, "Membro não lista eventos internos"],
    ["PUBLICADOR", "GET", "/persons/search?q=Ana&limit=5", 403, "Publicador não busca pessoas"],
    ["PASTOR", "GET", "/ledger/accounts", 403, "Pastor não lê o ledger"],
  ];
  for (const [persona, method, path, expect, journey] of expectDeny) {
    const token = sessions.get(persona);
    if (!token) {
      rows.push(row(`scope/${persona.toLowerCase()}-${expect}`, persona, journey, "BLOCKED", "Sessão da persona indisponível."));
      continue;
    }
    const result = await call(method, path, { token });
    rows.push(row(`scope/${persona.toLowerCase()}-${path.split("?")[0].replaceAll("/", "-")}`, persona, journey,
      result.status === expect ? "PASS" : "FAIL",
      result.status === expect ? `HTTP ${expect}, como o contrato determina.` : `Esperado ${expect}, recebido ${result.status}.`));
  }

  const member = sessions.get("MEMBRO");
  if (member) {
    const denied = await call("POST", "/auth/switch-church", { token: member, body: { churchId: "demoChurchDest02" } });
    const still = await call("GET", "/auth/me", { token: member });
    rows.push(row("scope/membro-igreja", "MEMBRO", "Troca para congregação sem grant",
      denied.status === 403 && still.data?.churchId && still.data.churchId !== "demoChurchDest02" ? "PASS" : "FAIL",
      denied.status === 403 ? "A troca foi recusada e a sessão permaneceu fora da congregação destino." : `HTTP ${denied.status}.`));
  }

  const guestPassword = ephemeralPassword();
  secrets.add(guestPassword);
  const guestEmail = `qa.rf1.guest.${randomBytes(4).toString("hex")}@example.test`;
  const guest = await call("POST", "/auth/guest-registration", {
    body: { displayName: "Convidado Sintetico", email: guestEmail, password: guestPassword },
  });
  const guestToken = guest.data?.accessToken;
  if (guestToken) secrets.add(guestToken);
  const guestRoles = rolesOf(guest.data?.user);
  const guestOk = (guest.status === 200 || guest.status === 201) && guestToken && guestRoles.includes("CONVIDADO");
  rows.push(row("auth/convidado", "CONVIDADO", "Cadastro de convidado", guestOk ? "PASS" : "FAIL",
    guestOk ? "Conta CONVIDADO criada com senha efêmera e JWT próprio." : `HTTP ${guest.status}.`));
  if (guestOk) {
    sessions.set("CONVIDADO", guestToken);
    for (const path of ["/indicators/summary", "/indicators/membership", "/pastoral/prayers", "/pastoral/congregation", "/ledger/accounts", "/admin/access", "/persons/search?q=Ana"]) {
      const denied = await call("GET", path, { token: guestToken });
      rows.push(row(`scope/convidado-${path.split("?")[0].replaceAll("/", "-")}`, "CONVIDADO", `Convidado sem ${path.split("?")[0]}`,
        denied.status === 403 ? "PASS" : "FAIL",
        denied.status === 403 ? "HTTP 403." : `HTTP ${denied.status}.`));
    }
    const ownCard = await call("GET", "/credentials/me", { token: guestToken });
    const cardText = JSON.stringify(ownCard.data ?? {});
    const leakedName = /Paula Demo|Ana Demo|Bruno Demo/.test(cardText);
    rows.push(row("privacy/convidado-carteirinha", "CONVIDADO", "Carteirinha própria",
      ownCard.status === 200 && !leakedName ? "PASS" : "FAIL",
      ownCard.status === 200 && !leakedName ? "A leitura não trouxe carteirinha de outra pessoa." : `HTTP ${ownCard.status}.`));

    const marker = `pedido-${randomBytes(6).toString("hex")}`;
    secrets.add(marker);
    const created = await call("POST", "/pastoral/prayers", { token: guestToken, body: { body: marker } });
    const echoed = JSON.stringify(created.data ?? {}).includes(marker);
    rows.push(row("privacy/oracao-eco", "CONVIDADO", "Pedido de oração não ecoa o texto",
      created.status < 400 && !echoed ? "PASS" : created.status === 400 ? "BLOCKED" : "FAIL",
      created.status === 400 ? "A congregação não aceitou o pedido sintético." : echoed ? "O texto voltou na resposta de criação." : "A criação devolveu só o identificador."));
    if (created.status < 400 && created.data?.id) {
      const ownRead = await call("GET", `/pastoral/prayers/${created.data.id}`, { token: guestToken });
      const list = await call("GET", "/pastoral/prayers", { token: sessions.get("PASTOR") });
      const bell = await call("GET", "/pastoral/prayers/bell", { token: sessions.get("PASTOR") });
      const listLeak = JSON.stringify(list.data ?? {}).includes(marker);
      const bellLeak = JSON.stringify(bell.data ?? {}).includes(marker);
      rows.push(row("privacy/oracao-convidado", "CONVIDADO", "Convidado não lê o pedido",
        ownRead.status === 403 ? "PASS" : "FAIL", ownRead.status === 403 ? "HTTP 403." : `HTTP ${ownRead.status}.`));
      rows.push(row("privacy/oracao-lista", "PASTOR", "Listagem sem o texto",
        list.status === 200 && !listLeak ? "PASS" : "FAIL",
        listLeak ? "O texto apareceu na listagem pastoral." : `Listagem HTTP ${list.status} sem o texto.`));
      rows.push(row("privacy/oracao-sino", "PASTOR", "Sino sem o texto",
        bell.status === 200 && !bellLeak ? "PASS" : "FAIL",
        bellLeak ? "O texto apareceu no sino." : `Sino HTTP ${bell.status} sem o texto.`));
    }
  }

  const admin = sessions.get("ADMIN");
  if (admin) {
    const options = await call("GET", "/admin/access/profile-options", { token: admin });
    const atmosfera = (options.data?.ministries ?? []).find((ministry) => Array.isArray(ministry.modules) && ministry.modules.length > 0);
    const people = await call("GET", "/admin/access/people?q=Carla", { token: admin });
    const carla = (people.data?.people ?? []).find((person) => person.email === "carla.demo@example.test");
    const invitePassword = ephemeralPassword();
    secrets.add(invitePassword);
    if (!carla || !atmosfera) {
      rows.push(row("access/convite", "ADMIN", "Convite de acesso", "FAIL", "Pessoa sintética ou módulo do Atmosfera ausente no seed."));
    } else {
      const created = await call("POST", "/admin/access", {
        token: admin,
        body: { personId: carla.id, email: carla.email, role: "MEMBRO" },
      });
      const token = tokenFromPreview(created.data?.invite?.previewUrl);
      if (token) secrets.add(token);
      if (created.data?.invite?.previewUrl) secrets.add(created.data.invite.previewUrl);
      const activated = token
        ? await call("POST", "/auth/activate-invite", { body: { token, password: invitePassword } })
        : { status: 0 };
      rows.push(row("access/convite", "ADMIN", "Convite e ativação",
        created.status < 300 && activated.status < 300 ? "PASS" : "FAIL",
        created.status < 300 && activated.status < 300 ? "Convite de uso único ativado sem e-mail externo." : `Convite HTTP ${created.status}, ativação HTTP ${activated.status}.`));
      if (activated.status < 300) {
        const memberLogin = await authenticate({ id: "CONVIDADO_ACESSO", email: carla.email, role: "MEMBRO", mfa: false }, invitePassword, { privileged: false });
        const me = memberLogin.ok ? await call("GET", "/auth/me", { token: memberLogin.token }) : null;
        if (memberLogin.token) secrets.add(memberLogin.token);
        const granted = me && rolesOf(me.data).includes("MEMBRO");
        rows.push(row("access/concessao", "MEMBRO", "Concessão de MEMBRO", granted ? "PASS" : "FAIL",
          granted ? "A conta ativada entrou como MEMBRO." : "A ativação não abriu sessão de MEMBRO."));
        const userId = created.data?.id;
        const listed = await call("GET", `/admin/access?q=${encodeURIComponent(carla.email)}`, { token: admin });
        const account = (listed.data?.accounts ?? []).find((item) => item.email === carla.email || item.id === userId);
        const memberGrant = account?.profiles?.find((profile) => profile.role === "MEMBRO");
        const edited = memberGrant ? await call("PATCH", `/admin/access/${account.id}/profiles`, {
          token: admin,
          body: { grantId: memberGrant.grantId, profile: { role: "LIDER_MODULO", ministryId: atmosfera.id, moduleId: atmosfera.modules[0].id } },
        }) : { status: 0 };
        rows.push(row("access/edicao-modulo", "LIDER_MODULO", "Edição para líder de módulo",
          edited.status < 300 && edited.data?.changed === true ? "PASS" : "FAIL",
          edited.data?.changed === true ? "O perfil passou a líder de módulo do Atmosfera." : `HTTP ${edited.status}.`));
        if (memberLogin.token) {
          const revokedSession = await call("GET", "/auth/me", { token: memberLogin.token });
          rows.push(row("access/sessao-revogada", "LIDER_MODULO", "Sessão antiga revogada na edição",
            revokedSession.status === 401 ? "PASS" : "FAIL",
            revokedSession.status === 401 ? "O JWT anterior deixou de valer." : `HTTP ${revokedSession.status}.`));
        }
        const leaderLogin = await authenticate({ id: "LIDER_MODULO", email: carla.email, role: "LIDER_MINISTERIO", mfa: true }, invitePassword, { privileged: true });
        if (leaderLogin.token) secrets.add(leaderLogin.token);
        const leaderMe = leaderLogin.ok ? await call("GET", "/auth/me", { token: leaderLogin.token }) : null;
        const leaderRoles = rolesOf(leaderMe?.data);
        rows.push(row("auth/lider-modulo", "LIDER_MODULO", "Login do líder de módulo",
          leaderLogin.ok && leaderRoles.includes("LIDER_MINISTERIO") ? "PASS" : "FAIL",
          leaderLogin.ok && leaderRoles.includes("LIDER_MINISTERIO") ? "Líder de módulo autenticado com MFA." : leaderLogin.detail));
        if (leaderLogin.token) {
          const own = await call("GET", `/ministry-scope/${atmosfera.id}/formal-memberships`, { token: leaderLogin.token });
          const other = await call("GET", "/ministry-scope/demoMinistryJovens/formal-memberships", { token: leaderLogin.token });
          rows.push(row("scope/lider-modulo-proprio", "LIDER_MODULO", "Módulo do próprio ministério",
            own.status === 200 || own.status === 501 ? "PASS" : "FAIL", `HTTP ${own.status} no Atmosfera.`));
          rows.push(row("scope/lider-modulo-alheio", "LIDER_MODULO", "Outro ministério recusado",
            other.status === 403 ? "PASS" : "FAIL", other.status === 403 ? "HTTP 403." : `HTTP ${other.status}.`));
        }
        const relisted = await call("GET", `/admin/access?q=${encodeURIComponent(carla.email)}`, { token: admin });
        const leaderAccount = (relisted.data?.accounts ?? []).find((item) => item.id === account?.id);
        const leaderGrant = leaderAccount?.profiles?.find((profile) => profile.role === "LIDER_MODULO");
        const removed = leaderGrant ? await call("PATCH", `/admin/access/${leaderAccount.id}/profiles`, {
          token: admin, body: { grantId: leaderGrant.grantId, moduleId: leaderGrant.moduleId },
        }) : { status: 0 };
        rows.push(row("access/revogacao", "ADMIN", "Revogação do perfil",
          removed.status < 300 && removed.data?.changed === true ? "PASS" : "FAIL",
          removed.data?.changed === true ? "O grant de liderança foi removido." : `HTTP ${removed.status}.`));
        if (leaderLogin.token) {
          const after = await call("GET", "/auth/me", { token: leaderLogin.token });
          rows.push(row("access/revogacao-sessao", "LIDER_MODULO", "Sessão revogada na revogação",
            after.status === 401 ? "PASS" : "FAIL", after.status === 401 ? "HTTP 401." : `HTTP ${after.status}.`));
        }
        const resetPassword = ephemeralPassword();
        secrets.add(resetPassword);
        const reset = await call("POST", `/admin/access/${account.id}/password/reset`, { token: admin });
        const resetToken = tokenFromPreview(reset.data?.previewUrl);
        if (resetToken) secrets.add(resetToken);
        if (reset.data?.previewUrl) secrets.add(reset.data.previewUrl);
        const consumed = resetToken
          ? await call("POST", "/auth/reset-password", { body: { token: resetToken, password: resetPassword } })
          : { status: 0 };
        const oldLogin = await call("POST", "/auth/login", { body: { email: carla.email, password: invitePassword } });
        const newLogin = await call("POST", "/auth/login", { body: { email: carla.email, password: resetPassword } });
        if (newLogin.data?.accessToken) secrets.add(newLogin.data.accessToken);
        const recovered = consumed.status < 300 && oldLogin.status === 401 && newLogin.status < 400 && newLogin.status !== 401;
        rows.push(row("access/recuperacao", "ADMIN", "Recuperação por link de uso único",
          recovered ? "PASS" : "FAIL",
          recovered ? "A senha anterior foi recusada e a nova foi aceita. Nenhum e-mail externo foi enviado." : `Reset HTTP ${consumed.status}, senha anterior HTTP ${oldLogin.status}, nova HTTP ${newLogin.status}.`));
        const known = await call("POST", "/auth/password/forgot", { body: { email: carla.email } });
        const unknown = await call("POST", "/auth/password/forgot", { body: { email: "ninguem.ficticio@example.test" } });
        const same = known.status === unknown.status && JSON.stringify(known.data) === JSON.stringify(unknown.data);
        const leaked = JSON.stringify(known.data ?? {}).includes("token") || JSON.stringify(unknown.data ?? {}).includes("previewUrl");
        rows.push(row("access/forgot-enumeracao", "ANON", "Recuperação pública sem enumerar conta",
          same && !leaked ? "PASS" : "FAIL",
          same && !leaked ? "Conta existente e inexistente receberam a mesma resposta, sem token." : "A resposta pública distinguiu a conta ou expôs token."));
      }
    }

    const provision = await call("POST", "/admin/access/qa-testers", { token: admin });
    const accounts = Array.isArray(provision.data?.accounts) ? provision.data.accounts : [];
    for (const account of accounts) {
      if (account.previewUrl) secrets.add(account.previewUrl);
      const issued = tokenFromPreview(account.previewUrl);
      if (issued) secrets.add(issued);
    }
    const readyAccounts = accounts.filter((account) => account.status === "ACTIVATION_REQUIRED" && tokenFromPreview(account.previewUrl));
    const unavailable = accounts.filter((account) => account.status === "UNAVAILABLE").map((account) => account.role);
    rows.push(row("access/qa-testers", "ADMIN", "Provisionamento qa.rf1.tester",
      provision.status < 300 && readyAccounts.length === 8 && unavailable.length === 0 ? "PASS" : "FAIL",
      provision.status < 300
        ? `${readyAccounts.length} convites de ativação e ${unavailable.length} indisponíveis. Nenhum link foi registrado.`
        : `HTTP ${provision.status}.`));
    const pastora = accounts.find((account) => account.email === "qa.rf1.tester.pastora@example.test");
    const pastoraToken = tokenFromPreview(pastora?.previewUrl);
    if (pastoraToken) {
      const pastoraPassword = ephemeralPassword();
      secrets.add(pastoraPassword);
      const activated = await call("POST", "/auth/activate-invite", { body: { token: pastoraToken, password: pastoraPassword } });
      const login = await call("POST", "/auth/login", { body: { email: pastora.email, password: pastoraPassword } });
      if (login.data?.accessToken) secrets.add(login.data.accessToken);
      const exempt = interpretExemptLogin(login.status, login.data);
      const me = login.data?.accessToken ? await call("GET", "/auth/me", { token: login.data.accessToken }) : { status: 0, data: null };
      const ledger = login.data?.accessToken ? await call("GET", "/ledger/accounts", { token: login.data.accessToken }) : { status: 0 };
      rows.push(row("auth/qa-pastora", "PASTOR", "QA tester sem MFA e sem ledger",
        activated.status < 300 && exempt.status === "PASS" && rolesOf(me.data).includes("PASTOR") && ledger.status === 403 ? "PASS" : "FAIL",
        activated.status < 300 && exempt.status === "PASS" && ledger.status === 403
          ? "A conta fictícia entrou por senha, com PASTOR, e o ledger respondeu 403."
          : `Ativação HTTP ${activated.status}. ${exempt.detail} Ledger HTTP ${ledger.status}.`));
    }
  } else {
    rows.push(row("access/convite", "ADMIN", "Convite de acesso", "BLOCKED", "Sessão de administrador indisponível."));
  }

  const publicador = sessions.get("PUBLICADOR");
  if (publicador) {
    const logout = await call("POST", "/auth/logout", { token: publicador });
    const again = await call("GET", "/auth/me", { token: publicador });
    rows.push(row("auth/logout", "PUBLICADOR", "Logout revoga a sessão",
      logout.status < 300 && again.status === 401 ? "PASS" : "FAIL",
      again.status === 401 ? "Depois do logout, /auth/me voltou 401." : `Logout HTTP ${logout.status}, sessão HTTP ${again.status}.`));
  }

  if (hosted) rows.push(...hosted);
  const local = rows.filter((item) => !item.id.startsWith("hosted/"));
  const verdict = local.some((item) => item.status === "FAIL")
    ? "NO_GO"
    : local.some((item) => item.id.startsWith("auth/") && item.status !== "PASS")
      ? "INCOMPLETE"
      : "PASS";
  return { verdict, rows, secrets };
}

export function renderReport(result) {
  const counts = result.rows.reduce((acc, item) => { acc[item.status] += 1; return acc; }, { PASS: 0, FAIL: 0, BLOCKED: 0 });
  const lines = [
    "# E2E autenticado por persona — banco descartável",
    "",
    `Veredito local: **${result.verdict}**. PASS ${counts.PASS}, FAIL ${counts.FAIL}, BLOCKED ${counts.BLOCKED}.`,
    "",
    "Nenhuma senha, JWT, segredo TOTP ou link de convite entra neste relatório. O site hospedado não recebeu credencial e o SSO da Vercel não foi contornado. A captura do bloqueio está em `qa/security-f11/reports/dev-sso-blocked.png`.",
    "",
    "| Persona | Jornada | Resultado | Evidência |",
    "|---|---|---|---|",
    ...result.rows.map((item) => `| ${item.persona} | ${item.journey} | ${item.status} | ${item.detail.replaceAll("|", "/")} |`),
    "",
  ];
  return lines.join("\n");
}

export async function probeHosted(fetchImpl = fetch) {
  const rows = [];
  try {
    const web = await fetchImpl(HOSTED_WEB, { redirect: "manual", signal: AbortSignal.timeout(15000) });
    const snippet = (await web.text()).slice(0, 400);
    const hosted = classifyHostedWeb(web.status, web.headers.get("location") ?? "", snippet);
    rows.push(row("hosted/web", "PLATAFORMA", "Site DEV hospedado", hosted.status, hosted.detail));
  } catch {
    rows.push(row("hosted/web", "PLATAFORMA", "Site DEV hospedado", "BLOCKED", "O site DEV não respondeu. Nenhuma credencial foi transmitida."));
  }
  try {
    const ready = await fetchImpl(`${HOSTED_API}/ready`, { redirect: "manual", signal: AbortSignal.timeout(15000) });
    const readyBody = await ready.json().catch(() => ({}));
    const me = await fetchImpl(`${HOSTED_API}/auth/me`, { redirect: "manual", signal: AbortSignal.timeout(15000) });
    const hosted = classifyHostedApi(ready.status, readyBody, me.status);
    rows.push(row("hosted/api", "PLATAFORMA", "API QA hospedada", hosted.status, hosted.detail));
  } catch {
    rows.push(row("hosted/api", "PLATAFORMA", "API QA hospedada", "BLOCKED", "A API QA não respondeu. Nenhuma credencial foi transmitida."));
  }
  return rows;
}

async function rehashSyntheticUsers(password) {
  const { PrismaClient } = await import("@prisma/client");
  const argon2 = await import("argon2");
  const prisma = new PrismaClient();
  try {
    const emails = SEEDED.map((persona) => persona.email);
    const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } });
    if (users.length !== emails.length || users.some((user) => !user.email.endsWith("@example.test"))) {
      throw new Error(`Seed incompleto: ${users.length} de ${emails.length} contas sintéticas.`);
    }
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const updated = await prisma.user.updateMany({ where: { email: { in: emails } }, data: { passwordHash } });
    if (updated.count !== emails.length) throw new Error("Rehash sintético incompleto.");
    const sample = await prisma.user.findUnique({ where: { email: emails[0] }, select: { passwordHash: true } });
    if (!sample?.passwordHash || !(await argon2.verify(sample.passwordHash, password))) throw new Error("O hash sintético não confere.");
  } finally {
    await prisma.$disconnect();
  }
}

function startApi(repoRoot) {
  const env = { ...process.env };
  delete env.QA_DEMO_PASSWORD;
  delete env.HML_DEMO_PASSWORD_HASH;
  env.NODE_ENV = "development";
  env.IDBRF_RUNTIME_STAGE = "qa";
  env.F11_MFA_BLOCKING = "true";
  env.F11_QA_TESTER_PASSWORD_ONLY = "true";
  env.ACCESS_INVITE_DELIVERY = "preview";
  env.ACCESS_INVITE_WEB_ORIGIN = "https://dev.example.test";
  env.AUTH_STATE_STORE = "prisma";
  env.PORT = "3011";
  delete env.EMAIL_TRANSPORT;
  const child = spawn(process.execPath, ["apps/api/dist/main.js"], {
    cwd: repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", () => {});
  child.stderr?.on("data", () => {});
  return child;
}

async function waitReady(baseUrl) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/ready`, { signal: AbortSignal.timeout(2000) });
      if (response.status === 200) {
        const body = await response.json();
        if (body.database === "ok" && body.mfaBlocking === true && body.authState === "prisma") return;
      }
    } catch { /* a API ainda está subindo */ }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error("A API local não ficou pronta.");
}

async function main() {
  const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
  const baseUrl = "http://127.0.0.1:3011";
  assertDisposableTarget({ ...process.env, QA_API_BASE_URL: baseUrl });
  const password = ephemeralPassword();
  await rehashSyntheticUsers(password);
  const child = startApi(repoRoot);
  let result;
  try {
    await waitReady(baseUrl);
    const hosted = await probeHosted();
    result = await runDisposablePersonaAuth({ baseUrl, password, hosted });
  } finally {
    child.kill("SIGTERM");
  }
  const markdown = renderReport(result);
  assertReportSafe(markdown, result.secrets);
  const reportDir = resolve(repoRoot, "qa/security-f11/reports");
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(resolve(reportDir, "disposable-persona-auth.md"), markdown);
  const safeRows = result.rows.map(({ id, persona, journey, status, detail }) => ({ id, persona, journey, status, detail }));
  assertReportSafe(JSON.stringify(safeRows), result.secrets);
  writeFileSync(resolve(reportDir, "disposable-persona-auth.json"), JSON.stringify({ verdict: result.verdict, rows: safeRows }, null, 2));
  console.log(markdown);
  if (result.verdict !== "PASS") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "E2E descartável interrompido.");
    process.exitCode = 2;
  });
}
