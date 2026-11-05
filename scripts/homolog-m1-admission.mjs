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

    const meta = await req("GET", "/meta");
    assert(meta.status === 200, `meta ${meta.status}`);
    assert(meta.json?.contractVersion, "contractVersion");
    log("GET /meta", true, meta.json.contractVersion);

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

    const hhList = await req("GET", "/households", { token: ana.accessToken });
    assert(hhList.status === 200 && Array.isArray(hhList.json.households), "list households");
    log("GET /households", true, `n=${hhList.json.households.length}`);

    const addMem = await req("POST", `/households/${hh.json.id}/members`, {
      token: ana.accessToken,
      body: { memberPersonIds: [created.json.personId] },
    });
    assert(addMem.status < 300, `add members ${addMem.status} ${JSON.stringify(addMem.json)}`);
    assert(
      addMem.json.memberPersonIds?.includes(created.json.personId),
      "member linked",
    );
    log("POST /households/:id/members", true, created.json.personId);

    const rmMem = await req(
      "DELETE",
      `/households/${hh.json.id}/members/${created.json.personId}`,
      { token: ana.accessToken },
    );
    assert(rmMem.status < 300, `remove member ${rmMem.status}`);
    assert(
      !rmMem.json.memberPersonIds?.includes(created.json.personId),
      "member removed",
    );
    log("DELETE /households/:id/members/:personId", true);

    const menor = await req("GET", "/persons/demoPersonMenor01", {
      token: ana.accessToken,
    });
    assert(menor.status === 200, `menor ${menor.status}`);
    assert(menor.json.isMinor === true, "seed menor");
    assert(menor.json.legalGuardianPersonId === "demoPersonRiacho01", "guardião Ana");
    log("GET seed menor+guardião", true, menor.json.displayName);

    const patchVisit = await req("PATCH", `/persons/${created.json.personId}`, {
      token: ana.accessToken,
      body: {
        isMinor: true,
        legalGuardianPersonId: "demoPersonRiacho01",
        householdId: hh.json.id,
      },
    });
    assert(patchVisit.status < 300, `patch person ${patchVisit.status} ${JSON.stringify(patchVisit.json)}`);
    assert(patchVisit.json.isMinor === true, "patched isMinor");
    log("PATCH /persons/:id (menor+guardião)", true);

    const dossier = await req("GET", `/persons/${created.json.personId}/dossier`, {
      token: ana.accessToken,
    });
    assert(dossier.status === 200, `dossier ${dossier.status}`);
    assert(Array.isArray(dossier.json.admissionHistory), "admissionHistory");
    log("GET /persons/:id/dossier", true, `admissions=${dossier.json.admissionHistory.length}`);

    const ownDenied = await req("GET", `/persons/${created.json.personId}/dossier`, {
      token: bruno.accessToken,
    });
    assert(ownDenied.status === 403, `membro alien dossier → ${ownDenied.status}`);
    log("MEMBRO dossier alheio → 403", true);

    const form = new FormData();
    form.append(
      "file",
      new Blob([Buffer.from("%PDF-FAKE-HOMOLOG")], { type: "application/pdf" }),
      "homolog-demo.pdf",
    );
    const upRes = await fetch(`${BASE}/admissions/${admissionId}/documents`, {
      method: "POST",
      headers: { authorization: `Bearer ${ana.accessToken}` },
      body: form,
    });
    const upJson = await upRes.json();
    assert(upRes.status < 300, `upload doc ${upRes.status} ${JSON.stringify(upJson)}`);
    log("POST /admissions/:id/documents", true, upJson.id);

    const listed = await req("GET", `/admissions/${admissionId}/documents`, {
      token: pastor.accessToken,
    });
    assert(listed.status === 200 && listed.json.documents?.length >= 1, "list docs");
    log("GET documents (pastor)", true, `n=${listed.json.documents.length}`);

    const dlRes = await fetch(
      `${BASE}/admissions/${admissionId}/documents/${upJson.id}`,
      { headers: { authorization: `Bearer ${pastor.accessToken}` } },
    );
    assert(dlRes.status === 200, `download ${dlRes.status}`);
    const dlBuf = Buffer.from(await dlRes.arrayBuffer());
    assert(dlBuf.includes(Buffer.from("%PDF-FAKE-HOMOLOG")), "download bytes");
    log("GET document download (pastor)", true, `bytes=${dlBuf.length}`);

    const audits = await req("GET", "/audit-logs?limit=5", {
      token: ana.accessToken,
    });
    assert(audits.status === 200, `audit ${audits.status}`);
    log("GET /audit-logs", true, `n=${audits.json.logs?.length ?? 0}`);

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
