import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import {
  blockedResult,
  contrastSeverity,
  targetSeverity,
  verdictFromFindings,
  worstSeverity,
} from "./classify.mjs";
import { contrastMinimum, rgbToHex } from "./contrast.mjs";
import { cases, readFoundationTokens } from "./inventory.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const evidenceDir = join(here, "../evidence");
const reportDir = join(here, "../reports");
const chromePath = process.env.CHROME_PATH || "/usr/local/bin/google-chrome";

const VIEWPORTS = [
  { name: "360", width: 360, height: 780 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 900 },
  { name: "1440", width: 1440, height: 900 },
  { name: "1920", width: 1920, height: 1080 },
];

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const base = arg("--base", "http://127.0.0.1:3000").replace(/\/$/, "");
const mode = arg("--mode", "publication");

function shotName(id, label) {
  return `${id.toLowerCase()}-${label}.jpg`;
}

async function shoot(page, id, label, fullPage = false) {
  mkdirSync(evidenceDir, { recursive: true });
  const file = shotName(id, label);
  await page.screenshot({
    path: join(evidenceDir, file),
    type: "jpeg",
    quality: 62,
    fullPage,
  });
  return `qa/ux-personas/evidence/${file}`;
}

function probeSource() {
  return `(() => {
    function parse(color) {
      const match = String(color).match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/);
      if (!match) return null;
      return { r: +match[1], g: +match[2], b: +match[3], a: match[4] === undefined ? 1 : +match[4] };
    }
    function visible(el) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }
    function background(el) {
      let node = el;
      while (node) {
        const style = getComputedStyle(node);
        const image = style.backgroundImage;
        const color = parse(style.backgroundColor);
        if (image && image !== "none" && (!color || color.a < 0.98)) return null;
        if (color && color.a >= 0.98) return color;
        node = node.parentElement;
      }
      return null;
    }
    function overMedia(el) {
      const rect = el.getBoundingClientRect();
      const stack = document.elementsFromPoint(rect.left + Math.min(rect.width / 2, 80), rect.top + Math.min(rect.height / 2, 12));
      return stack.some((node) => node.tagName === "IMG");
    }
    function roleOf(el) {
      const tag = el.tagName;
      if (/^H[1-3]$/.test(tag)) return "heading";
      if (tag === "BUTTON" || el.closest("button")) return "button";
      if (tag === "LABEL" || el.closest("label")) return "label";
      if (tag === "A" || el.closest("a")) return "link";
      if (tag === "P" || tag === "LI") return "body";
      return "meta";
    }
    const contrasts = [];
    const seen = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    let scanned = 0;
    while ((node = walker.nextNode()) && scanned < 500) {
      const text = node.textContent.replace(/\\s+/g, " ").trim();
      if (text.length < 2) continue;
      const el = node.parentElement;
      if (!el || !visible(el)) continue;
      if (el.closest("[aria-hidden='true'], script, style, nextjs-portal")) continue;
      scanned += 1;
      const style = getComputedStyle(el);
      const fg = parse(style.color);
      const bg = background(el);
      if (!fg || !bg || fg.a < 0.9) continue;
      if (overMedia(el) && bg && el.parentElement && getComputedStyle(el).backgroundColor === "rgba(0, 0, 0, 0)") continue;
      const size = Number.parseFloat(style.fontSize);
      const weight = Number.parseInt(style.fontWeight, 10) || 400;
      const key = [fg.r, fg.g, fg.b, bg.r, bg.g, bg.b, size < 18 ? "s" : "l", roleOf(el)].join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      contrasts.push({
        text: text.slice(0, 70),
        color: fg,
        background: bg,
        fontSize: size,
        fontWeight: weight,
        role: roleOf(el),
      });
      if (contrasts.length >= 80) break;
    }
    function nameOf(el) {
      if (el.getAttribute("aria-label")) return el.getAttribute("aria-label");
      if (el.labels && el.labels.length) return el.labels[0].innerText.trim();
      const wrapped = el.closest("label");
      if (wrapped) return wrapped.innerText.trim();
      return "";
    }
    const fields = [...document.querySelectorAll("input, select, textarea")].filter(visible).map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        id: el.id || "",
        type: el.getAttribute("type") || el.tagName.toLowerCase(),
        name: nameOf(el).slice(0, 80),
        disabled: el.disabled,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    });
    const controls = [...document.querySelectorAll("button, input, select, summary, a")].filter(visible).slice(0, 120).map((el) => {
      const rect = el.getBoundingClientRect();
      const tag = el.tagName.toLowerCase();
      return {
        kind: tag === "a" ? "link" : tag,
        name: (el.getAttribute("aria-label") || el.innerText || el.id || tag).replace(/\\s+/g, " ").trim().slice(0, 60),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    });
    const headings = [...document.querySelectorAll("h1,h2,h3,h4")].filter(visible).map((el) => el.tagName);
    return {
      title: document.title,
      lang: document.documentElement.lang,
      h1: document.querySelectorAll("h1").length,
      headings,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      skip: Boolean(document.querySelector("a[href='#conteudo']")),
      main: Boolean(document.querySelector("main")),
      alerts: [...document.querySelectorAll("[role='alert']")].map((el) => el.innerText.trim().slice(0, 180)),
      statuses: [...document.querySelectorAll("[role='status']")].map((el) => el.innerText.trim().slice(0, 180)),
      bodyText: document.body.innerText.replace(/\\s+/g, " ").trim().slice(0, 500),
      fields,
      controls,
      contrasts,
      tables: [...document.querySelectorAll("table")].map((table) => ({
        rows: [...table.querySelectorAll("tbody tr")].length,
      })),
    };
  })()`;
}

function findingsFromProbe(probe, viewport, surface) {
  const findings = [];
  if (probe.lang !== "pt-BR") {
    findings.push({
      severity: "P1",
      viewport,
      message: `Idioma do documento é "${probe.lang || "vazio"}" em ${surface}.`,
      recommendation: "Manter html lang=\"pt-BR\" em todas as rotas.",
    });
  }
  if (probe.overflow > 1) {
    findings.push({
      severity: "P1",
      viewport,
      message: `Rolagem horizontal de ${probe.overflow} px em ${surface} a ${viewport} px.`,
      recommendation: "Deixar o conteúdo refluir dentro da largura, sem corte lateral.",
    });
  }
  if (!probe.main) {
    findings.push({
      severity: "P1",
      viewport,
      message: `${surface} não tem elemento main.`,
      recommendation: "Marcar o conteúdo principal com main.",
    });
  }
  if (probe.h1 !== 1) {
    findings.push({
      severity: probe.h1 === 0 ? "P1" : "P2",
      viewport,
      message: `${surface} tem ${probe.h1} títulos h1 em ${viewport} px.`,
      recommendation: "Usar um único h1 por tela.",
    });
  }
  let previous = 0;
  for (const tag of probe.headings) {
    const level = Number(tag.slice(1));
    if (previous && level > previous + 1) {
      findings.push({
        severity: "P2",
        viewport,
        message: `Hierarquia pula de h${previous} para h${level} em ${surface}.`,
        recommendation: "Não saltar níveis de título.",
      });
      break;
    }
    previous = level;
  }
  for (const field of probe.fields) {
    if (!field.name) {
      findings.push({
        severity: "P0",
        viewport,
        message: `Campo ${field.type || "de formulário"} sem nome acessível em ${surface}.`,
        recommendation: "Associar label visível ou aria-label a cada campo.",
      });
    }
    const severity = targetSeverity(Math.min(field.width, field.height), "input");
    if (severity) {
      findings.push({
        severity,
        viewport,
        message: `Campo "${field.name || field.id}" mede ${field.width}×${field.height} px em ${surface}.`,
        recommendation: "Campos e botões principais precisam de pelo menos 44 px no lado menor.",
      });
    }
  }
  for (const control of probe.controls) {
    if (control.kind === "link") continue;
    const severity = targetSeverity(Math.min(control.width, control.height), control.kind);
    if (!severity) continue;
    findings.push({
      severity,
      viewport,
      message: `Controle "${control.name}" mede ${control.width}×${control.height} px em ${surface} a ${viewport} px.`,
      recommendation: severity === "P1"
        ? "Aumentar o alvo para pelo menos 24 px; a fundação #102 pede 44 px."
        : "A fundação #102 pede alvo de 44 px. Este controle fica abaixo disso.",
    });
  }
  for (const sample of probe.contrasts) {
    const hexFg = rgbToHex(sample.color);
    const hexBg = rgbToHex(sample.background);
    const minimum = contrastMinimum(sample.fontSize, sample.fontWeight);
    const ratio = contrastRatioLocal(hexFg, hexBg);
    const severity = contrastSeverity({ ratio, minimum, role: sample.role });
    if (!severity) continue;
    findings.push({
      severity,
      viewport,
      message: `Contraste ${ratio.toFixed(2)} (${hexFg} sobre ${hexBg}, ${Math.round(sample.fontSize)} px) em “${sample.text}”. Limiar ${minimum}.`,
      recommendation: "Escurecer o texto até 4,5 sobre o fundo claro. O cinza #67797E e o bronze #B48850 não chegam nesse limiar.",
    });
  }
  return dedupe(findings);
}

function contrastRatioLocal(foreground, background) {
  const lum = (hex) => {
    const parts = [1, 3, 5].map((index) => {
      const value = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2];
  };
  const lighter = Math.max(lum(foreground), lum(background));
  const darker = Math.min(lum(foreground), lum(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function dedupe(findings) {
  const seen = new Set();
  return findings.filter((item) => {
    const key = `${item.severity}|${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function openPage(page, route) {
  const response = await page.goto(`${base}${route}`, { waitUntil: "networkidle0", timeout: 45000 });
  await new Promise((resolve) => setTimeout(resolve, 250));
  return response ? response.status() : 0;
}

async function probe(page) {
  return page.evaluate((source) => (0, eval)(source), probeSource());
}

async function focusTrace(page, steps) {
  await page.keyboard.press("Tab");
  const trace = [];
  for (let index = 0; index < steps; index += 1) {
    if (index > 0) await page.keyboard.press("Tab");
    const current = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement) return null;
      if (el.tagName === "NEXTJS-PORTAL" || el.closest("nextjs-portal")) return null;
      const style = getComputedStyle(el);
      const name = (el.getAttribute("aria-label") || el.innerText || el.id || el.tagName || "").replace(/\s+/g, " ").trim();
      return {
        name: name.slice(0, 80),
        tag: el.tagName,
        outline: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth) || 0,
        shadow: style.boxShadow,
      };
    });
    if (current) trace.push(current);
  }
  return trace;
}

function focusFindings(trace, surface) {
  if (trace.length === 0) {
    return [{
      severity: "P0",
      viewport: "teclado",
      message: `Tab não alcançou nenhum controle em ${surface}.`,
      recommendation: "Garantir ordem de tabulação até o formulário e os links.",
    }];
  }
  const weak = trace.filter((item) => {
    const outlined = item.outline !== "none" && item.outlineWidth >= 2;
    const alpha = item.shadow.match(/rgba?\([^)]*?,\s*([\d.]+)\s*\)\s*$/);
    const strongShadow = item.shadow !== "none" && (!alpha || Number(alpha[1]) >= 0.45);
    return !outlined && !strongShadow;
  });
  if (weak.length === 0) return [];
  return [{
    severity: "P1",
    viewport: "teclado",
    message: `Foco pouco visível em ${surface}: ${weak.slice(0, 3).map((item) => item.name || item.tag).join(", ")}.`,
    recommendation: "Usar contorno sólido de 3 px, como na fundação #102, e não só um brilho translúcido.",
  }];
}

function caseShell(spec) {
  return {
    id: spec.id,
    area: spec.area,
    surface: spec.surface,
    profile: spec.profile,
    route: spec.route,
    status: "BLOCKED",
    severity: null,
    reason: "",
    recommendation: "",
    findings: [],
    evidence: [],
  };
}

function finish(result) {
  const actionable = result.findings.filter((item) => item.severity === "P0" || item.severity === "P1");
  result.status = verdictFromFindings(result.findings);
  result.severity = worstSeverity(result.findings);
  if (result.status === "FAIL") {
    result.recommendation = actionable[0]?.recommendation || result.findings[0]?.recommendation || "Corrigir os achados P0/P1 antes de tratar a tela como pronta.";
    result.reason = actionable[0]?.message || result.findings[0]?.message;
  } else {
    result.recommendation = result.findings.length
      ? "Os P2 não bloqueiam o fluxo. A correção fica com a frente dona da tela."
      : "Nenhum P0 ou P1 neste passe.";
    result.reason = "";
  }
  return result;
}

async function auditVisual(page, spec, widths) {
  const result = caseShell(spec);
  const interesting = new Set(["360", "1440"]);
  for (const viewport of VIEWPORTS) {
    await page.setViewport(viewport);
    const status = await openPage(page, spec.route);
    const data = await probe(page);
    result.http = status;
    if (interesting.has(viewport.name) || spec.id === "UX-01" || spec.id === "UX-04") {
      result.evidence.push(await shoot(page, spec.id, viewport.name, viewport.name === "1440" || viewport.name === "360"));
    }
    result.findings.push(...findingsFromProbe(data, viewport.name, spec.surface));
    if (viewport.name === "1440") result.sample = data.bodyText;
    if (spec.id === "UX-03" && viewport.name === "1440") {
      const empty = /Programação em atualização|Consultando eventos publicados/i.test(data.bodyText);
      result.emptyState = empty ? "observado" : "ausente";
      if (!empty) {
        result.findings.push({
          severity: "P1",
          viewport: "1440",
          message: "A agenda não mostrou o estado vazio nem a consulta quando não há API pública.",
          recommendation: "Manter a mensagem de programação em atualização, sem inventar eventos.",
        });
      }
    }
    if (spec.id === "UX-04" && viewport.name === "1440") {
      const warning = data.statuses.some((text) => /não está habilitado/i.test(text));
      const submit = data.controls.find((item) => /Entrar no painel/i.test(item.name));
      if (!warning) {
        result.findings.push({
          severity: "P1",
          viewport: "1440",
          message: "A publicação sem HML não explica que o acesso está desligado.",
          recommendation: "Conservar o aviso de que nenhuma credencial será enviada.",
        });
      }
      if (submit && data.fields.some((field) => field.type === "email" && !field.name)) {
        result.findings.push({
          severity: "P0",
          viewport: "1440",
          message: "O e-mail do login não tem nome acessível.",
          recommendation: "Manter o label E-mail associado ao campo.",
        });
      }
    }
    if (spec.id === "UX-05" && viewport.name === "1440") {
      if (/Protocolos de admissão|Painel HML/i.test(data.bodyText)) {
        result.findings.push({
          severity: "P0",
          viewport: "1440",
          message: "A secretaria apareceu sem sessão.",
          recommendation: "Manter o gate até /auth/me autorizar.",
        });
      }
    }
  }
  if (spec.id === "UX-01" || spec.id === "UX-04") {
    await page.setViewport({ width: 1440, height: 900 });
    await openPage(page, spec.route);
    const trace = await focusTrace(page, spec.id === "UX-04" ? 6 : 5);
    result.findings.push(...focusFindings(trace, spec.surface));
    result.evidence.push(await shoot(page, spec.id, "foco", false));
    // 200% numa janela de 360 px equivale à largura CSS de 180 px.
    await page.setViewport({ width: 180, height: 640 });
    await openPage(page, spec.route);
    const zoomed = await probe(page);
    if (zoomed.overflow > 1) {
      result.findings.push({
        severity: "P1",
        viewport: "zoom-200",
        message: `Zoom 200% sobre 360 px deixa ${spec.surface} ${zoomed.overflow} px mais larga que a tela.`,
        recommendation: "Quebrar títulos grandes, como “encontros.”, para a largura CSS de 180 px.",
      });
    }
    if (spec.id === "UX-01") {
      await page.evaluate(() => {
        const el = [...document.querySelectorAll("h2")].find((node) => /Próximos/i.test(node.textContent));
        el?.scrollIntoView({ block: "center", behavior: "instant" });
      });
    }
    result.evidence.push(await shoot(page, spec.id, "zoom-200", false));
    await page.setViewport(VIEWPORTS[3]);
  }
  if (spec.id === "UX-01") {
    await page.setViewport(VIEWPORTS[0]);
    await openPage(page, spec.route);
    const menu = await page.$("summary[aria-label='Abrir menu']");
    if (!menu) {
      result.findings.push({
        severity: "P1",
        viewport: "360",
        message: "O menu mobile não está presente a 360 px.",
        recommendation: "Expor Início, Quem somos e Agenda no menu compacto.",
      });
    } else {
      await menu.click();
      result.evidence.push(await shoot(page, spec.id, "menu-360", false));
      await page.focus("summary[aria-label='Fechar menu'], summary[aria-label='Abrir menu']");
      await page.keyboard.press("Escape");
      const stillOpen = await page.evaluate(() => {
        const summary = [...document.querySelectorAll("summary")].find((el) => /menu/i.test(el.getAttribute("aria-label") || ""));
        return Boolean(summary?.closest("details")?.open);
      });
      if (stillOpen) {
        result.findings.push({
          severity: "P1",
          viewport: "360",
          message: "Escape não fecha o menu mobile.",
          recommendation: "Fechar o menu no Escape e devolver o foco ao botão.",
        });
      }
    }
    if (!widths) void widths;
  }
  const rank = { P0: 0, P1: 1, P2: 2 };
  result.findings = dedupe(result.findings)
    .sort((a, b) => rank[a.severity] - rank[b.severity])
    .slice(0, 24);
  return finish(result);
}

async function auditHml(page) {
  const spec = cases.find((item) => item.id === "UX-06");
  const result = caseShell(spec);
  await page.setViewport(VIEWPORTS[1]);
  await openPage(page, "/login/");
  const before = await probe(page);
  const enabled = before.fields.some((field) => field.type === "email" && !field.disabled);
  if (!enabled) {
    result.status = "BLOCKED";
    result.reason = "O servidor deste passe não estava com o acesso HML ligado. O erro de credencial não foi exercitado.";
    result.recommendation = result.reason;
    return result;
  }
  await page.type("#church-email", "qa.sintetico@example.test");
  await page.type("#church-password", "auditoria-sintetica");
  await page.click("button[type='submit']");
  await page.waitForSelector("[role='alert']", { timeout: 8000 }).catch(() => null);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const after = await probe(page);
  result.evidence.push(await shoot(page, "UX-06", "erro-390", false));
  await page.setViewport(VIEWPORTS[3]);
  result.evidence.push(await shoot(page, "UX-06", "erro-1440", true));
  const alert = after.alerts.join(" ");
  if (!alert) {
    result.findings.push({
      severity: "P1",
      viewport: "390",
      message: "A credencial sintética recusada não produziu alerta.",
      recommendation: "Anunciar o erro em role=alert, sem repetir a senha.",
    });
  } else if (/auditoria-sintetica/i.test(alert)) {
    result.findings.push({
      severity: "P0",
      viewport: "390",
      message: "O alerta de login ecoou a senha digitada.",
      recommendation: "Não incluir a senha na mensagem de erro.",
    });
  }
  await page.goto(`${base}/app/secretaria/`, { waitUntil: "networkidle0", timeout: 45000 });
  const gate = await probe(page);
  if (/Protocolos de admissão|diretório de membros/i.test(gate.bodyText)) {
    result.findings.push({
      severity: "P0",
      viewport: "1440",
      message: "Com HML ligado e sem sessão, a secretaria mostrou dados.",
      recommendation: "Não renderizar o workspace antes da sessão.",
    });
  }
  result.evidence.push(await shoot(page, "UX-06", "gate-secretaria", false));
  result.findings.push(...findingsFromProbe(before, "390", spec.surface));
  result.findings = dedupe(result.findings).slice(0, 16);
  return finish(result);
}

function markdown(report) {
  const lines = [
    "# Auditoria visual por perfil",
    "",
    `Gerada em ${report.generatedAt}. Base ${report.base}. Fundação #102: ${report.foundation}.`,
    "",
    "Nenhuma tela bloqueada foi simulada. Achados P2 não reprovam o caso.",
    "",
    "| Caso | Perfil | Superfície | Veredito | Severidade |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const item of report.cases) {
    lines.push(`| ${item.id} | ${item.profile} | ${item.surface} | ${item.status} | ${item.severity || "—"} |`);
  }
  lines.push("", "## Achados", "");
  for (const item of report.cases) {
    lines.push(`### ${item.id} — ${item.status}`, "", item.reason || item.recommendation, "");
    if (item.evidence.length) lines.push(`Evidência: ${item.evidence.join(", ")}`, "");
    for (const finding of item.findings) {
      lines.push(`- ${finding.severity} (${finding.viewport}): ${finding.message}`);
    }
    if (item.findings.length) lines.push("");
  }
  return lines.join("\n");
}

async function withBrowser(run) {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(20000);
    return await run(page);
  } finally {
    await browser.close();
  }
}

function loadReport() {
  try {
    return JSON.parse(readFileSync(join(reportDir, "matriz.json"), "utf8"));
  } catch {
    return null;
  }
}

function writeReport(report) {
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(join(reportDir, "matriz.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(reportDir, "matriz.md"), markdown(report));
}

async function main() {
  const foundation = readFoundationTokens();
  if (mode === "hml") {
    const previous = loadReport();
    if (!previous) throw new Error("Rode primeiro --mode publication.");
    const result = await withBrowser((page) => auditHml(page));
    previous.cases = previous.cases.map((item) => item.id === "UX-06" ? result : item);
    previous.hmlBase = base;
    writeReport(previous);
    console.log(`${result.id} ${result.status} ${result.severity || ""}`);
    return;
  }

  const visual = cases.filter((item) => item.kind === "visual");
  const audited = await withBrowser(async (page) => {
    const results = [];
    for (const spec of visual) results.push(await auditVisual(page, spec));
    await page.setViewport(VIEWPORTS[3]);
    const status = await openPage(page, "/design-system/");
    await shoot(page, "UX-13", "ausente-1440", false);
    return { results, designStatus: status };
  });

  const merged = cases.map((spec) => {
    if (spec.kind === "blocked") {
      const result = blockedResult(spec);
      if (spec.id === "UX-13") result.evidence = ["qa/ux-personas/evidence/ux-13-ausente-1440.jpg"];
      return result;
    }
    if (spec.kind === "visual-hml") {
      return {
        ...caseShell(spec),
        status: "BLOCKED",
        reason: "O erro de credencial é medido no passe com NEXT_PUBLIC_HML_ENABLED=true, sem banco e sem senha real.",
        recommendation: "Rodar o modo hml contra o Next local. Não apontar para API de produção.",
      };
    }
    return audited.results.find((item) => item.id === spec.id);
  });

  const report = {
    generatedAt: new Date().toISOString(),
    base,
    foundation: foundation.available ? "ref lido; componentes ausentes na main" : "ref ausente neste checkout",
    designSystemHttp: audited.designStatus,
    cases: merged,
  };
  writeReport(report);
  for (const item of merged) console.log(`${item.id} ${item.status} ${item.severity || ""}`.trim());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
