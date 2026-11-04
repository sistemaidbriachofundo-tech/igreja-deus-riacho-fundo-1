#!/usr/bin/env node
/**
 * Homologação M1 contra API Nest + Postgres reais (dados fictícios do seed).
 * Uso: API_BASE=http://localhost:3001 node scripts/homolog-m1-admission.mjs
 */
const BASE = process.env.API_BASE ?? "http://localhost:3001";

async function req(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function login(email) {
  const r = await req("POST", "/auth/login", {
    body: { email, password: "admin" },
  });
  assert(r.status === 201 || r.status === 200, `login ${email} → ${r.status}`);
  assert(r.json?.accessToken, `token ausente para ${email}`);
  return r.json;
}

async function main() {
  const evidence = [];
  const log = (step, ok, detail) => {
    evidence.push({ step, ok, detail });
    console.log(`${ok ? "OK" : "FAIL"}  ${step}${detail ? ` — ${detail}` : ""}`);
  };

  try {
    const health = await req("GET", "/health");
    assert(health.status === 200, `health ${health.status}`);
    log("GET /health", true, JSON.stringify(health.json));

    const ana = await login("ana.demo@example.test");
    log("login SECRETARIA", true, ana.user?.email);
    const pastor = await login("pastor.demo@example.test");
    log("login PASTOR", true, pastor.user?.email);
    const bruno = await login("bruno.demo@example.test");
    log("login MEMBRO", true, bruno.user?.email);

    const deniedList = await req("GET", "/admissions", { token: bruno.accessToken });
    assert(deniedList.status === 403, `membro list admissions → ${deniedList.status}`);
    log("MEMBRO GET /admissions → 403", true);

    const created = await req("POST", "/admissions", {
      token: ana.accessToken,
      body: {
        displayName: "Homolog Visitante Demo",
        email: "homolog.visitante@example.test",
        modality: "BATISMO",
        notes: "caso homolog script",
      },
    });
    assert(created.status === 201 || created.status === 200, `create admission ${created.status} ${JSON.stringify(created.json)}`);
    const admissionId = created.json.id;
    const membershipId = created.json.membershipId;
    log("POST /admissions (BATISMO)", true, `${admissionId} status=${created.json.status}`);

    const dup = await req("POST", "/admissions", {
      token: ana.accessToken,
      body: { personId: created.json.personId, modality: "BATISMO" },
    });
    assert(
      dup.status === 409 || dup.json?.code === "ADMISSION_ALREADY_OPEN",
      `duplicate open → ${dup.status} ${JSON.stringify(dup.json)}`,
    );
    log("POST /admissions duplicado → 409 ADMISSION_ALREADY_OPEN", true);

    let adv = await req("POST", `/admissions/${admissionId}/advance`, {
      token: ana.accessToken,
      body: { completeStep: "documents" },
    });
    assert(adv.status < 300, `documents ${adv.status} ${JSON.stringify(adv.json)}`);
    log("advance documents", true, adv.json.status);

    const pastorEarly = await req("POST", `/admissions/${admissionId}/advance`, {
      token: pastor.accessToken,
      body: { completeStep: "pastor", decision: "APPROVE" },
    });
    assert(
      pastorEarly.status === 409 || pastorEarly.json?.code === "ADMISSION_STEP_LOCKED",
      `pastor early → ${pastorEarly.status}`,
    );
    log("PASTOR advance cedo → ADMISSION_STEP_LOCKED", true);

    adv = await req("POST", `/admissions/${admissionId}/advance`, {
      token: ana.accessToken,
      body: { completeStep: "secretaria", decision: "APPROVE" },
    });
    assert(adv.status < 300, `secretaria ${adv.status}`);
    log("advance secretaria APPROVE", true, adv.json.status);

    const memberPastor = await req("POST", `/admissions/${admissionId}/advance`, {
      token: bruno.accessToken,
      body: { completeStep: "pastor", decision: "APPROVE" },
    });
    assert(
      memberPastor.status === 403 || memberPastor.json?.code === "ADMISSION_ROLE_REQUIRED",
      `membro pastor → ${memberPastor.status}`,
    );
    log("MEMBRO pastor → ADMISSION_ROLE_REQUIRED", true);

    adv = await req("POST", `/admissions/${admissionId}/advance`, {
      token: pastor.accessToken,
      body: { completeStep: "pastor", decision: "APPROVE" },
    });
    assert(adv.status < 300, `pastor approve ${adv.status} ${JSON.stringify(adv.json)}`);
    assert(adv.json.status === "APPROVED", "status APPROVED");
    assert(adv.json.credentialEligible === true, "credentialEligible");
    log("advance pastor APPROVE", true, `eligible=${adv.json.credentialEligible}`);

    // Carteirinha: membership do visitante homolog (PENDING→ACTIVE)
    const issue = await req("POST", `/credentials/issue/${membershipId}`, {
      token: ana.accessToken,
    });
    assert(issue.status < 300, `issue ${issue.status} ${JSON.stringify(issue.json)}`);
    assert(issue.json.qrPayload && !/@|\d{3}\.\d{3}/.test(issue.json.qrPayload), "QR opaco");
    log("POST /credentials/issue", true, `id=${issue.json.id}`);

    const issueAgain = await req("POST", `/credentials/issue/${membershipId}`, {
      token: ana.accessToken,
    });
    assert(issueAgain.status === 409, `second issue → ${issueAgain.status}`);
    log("segunda emissão → 409", true);

    const search = await req("GET", `/persons/search?q=Homolog`, {
      token: ana.accessToken,
    });
    assert(search.status === 200, `search ${search.status}`);
    assert(search.json.autoMergeForbidden === true, "anti-merge");
    log("GET /persons/search", true, `hits=${search.json.hits?.length ?? 0}`);

    const hh = await req("POST", "/households", {
      token: ana.accessToken,
      body: { label: "Família Homolog Demo" },
    });
    assert(hh.status < 300, `household ${hh.status}`);
    log("POST /households", true, hh.json.id);

    const noAuth = await req("GET", "/admissions");
    assert(noAuth.status === 401, `no jwt → ${noAuth.status}`);
    log("GET /admissions sem JWT → 401", true);

    console.log("\n=== HOMOLOG M1 OK ===");
    console.log(JSON.stringify({ base: BASE, evidence }, null, 2));
    process.exit(0);
  } catch (err) {
    console.error("\n=== HOMOLOG M1 FAIL ===");
    console.error(err);
    console.error(JSON.stringify({ base: BASE, evidence }, null, 2));
    process.exit(1);
  }
}

main();
