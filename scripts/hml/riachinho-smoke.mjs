#!/usr/bin/env node
/**
 * Smoke sintético HML — Riachinho (rotas /vivi/*).
 * Somente leitura/chat público com consentimento; sem credenciais staff; sem escrita CMS.
 *
 * Uso:
 *   API_BASE=https://id-riacho1-api-hml.vercel.app node scripts/hml/riachinho-smoke.mjs
 */
const base = process.env.API_BASE?.replace(/\/+$/, "");
if (!base) {
  console.error("Informe API_BASE da homologação");
  process.exit(2);
}
const parsed = new URL(base);
if (parsed.protocol !== "https:" || !/hml|localhost|127\.0\.0\.1/.test(parsed.hostname)) {
  console.error("Ambiente inválido: somente HML pode ser testada");
  process.exit(2);
}

let failures = 0;

async function check(label, fn) {
  try {
    await fn();
    console.log("OK " + label);
  } catch (err) {
    failures++;
    console.error("FALHOU " + label + ": " + (err instanceof Error ? err.message : String(err)));
  }
}

await check("GET /vivi/status", async () => {
  const res = await fetch(base + "/vivi/status", {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  });
  const body = await res.json();
  if (res.status !== 200) throw new Error("HTTP " + res.status);
  if (!["mock", "gemini", "manus"].includes(body.provider)) {
    throw new Error("provider inválido: " + body.provider);
  }
  if (body.assistant !== "vivi") throw new Error("assistant alias esperado=vivi");
  if (body.displayName && body.displayName !== "Riachinho") {
    throw new Error("displayName inesperado: " + body.displayName);
  }
  console.log(
    "  provider=" +
      body.provider +
      " model=" +
      body.model +
      " manusKey=" +
      Boolean(body.manusKeyConfigured) +
      " geminiKey=" +
      Boolean(body.geminiKeyConfigured) +
      " displayName=" +
      (body.displayName ?? "(ausente neste deploy)"),
  );
  if (body.provider === "mock") {
    console.log("  BLOQUEIO IA REAL: HML ainda em mock — configure GEMINI_API_KEY ou MANUS_* no Vercel");
  }
});

await check("POST /public/vivi/chat sem consent → 400", async () => {
  const res = await fetch(base + "/public/vivi/chat", {
    method: "POST",
    headers: { "content-type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "Oi" }] }),
    signal: AbortSignal.timeout(12000),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status !== 400) throw new Error("HTTP " + res.status);
  if (body?.code !== "VIVI_CONSENT_REQUIRED" && !String(body?.message ?? "").match(/consent/i)) {
    throw new Error("código de consentimento ausente");
  }
});

await check("POST /public/vivi/chat com consent (sintético)", async () => {
  const res = await fetch(base + "/public/vivi/chat", {
    method: "POST",
    headers: { "content-type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "Quais ministérios tem no portal?" }],
      consentAiProcessing: true,
      sessionId: "smoke-riachinho",
    }),
    signal: AbortSignal.timeout(20000),
  });
  const body = await res.json();
  if (![200, 201].includes(res.status)) throw new Error("HTTP " + res.status + " " + JSON.stringify(body));
  if (typeof body.reply !== "string" || !body.reply.trim()) throw new Error("reply vazio");
  if (!["mock", "gemini", "manus"].includes(body.provider)) throw new Error("provider inválido");
  console.log("  replySnippet=" + JSON.stringify(body.reply.slice(0, 120)));
});

await check("POST /vivi/chat sem JWT → bloqueado", async () => {
  const res = await fetch(base + "/vivi/chat", {
    method: "POST",
    headers: { "content-type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "teste" }],
      consentAiProcessing: true,
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (![401, 403].includes(res.status)) throw new Error("HTTP " + res.status);
});

if (failures) {
  console.error("Riachinho HML: " + failures + " verificações falharam");
  process.exitCode = 1;
} else {
  console.log("Riachinho HML: smoke sintético OK.");
}
