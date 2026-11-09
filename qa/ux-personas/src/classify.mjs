/**
 * P0 impede o uso do fluxo principal.
 * P1 quebra contraste, foco, reflow ou alvo mínimo de 24 px num controle principal.
 * P2 é atrito de hierarquia, alvo entre 24 e 44 px, ou texto miúdo.
 */

const STATUS = new Set(["PASS", "FAIL", "BLOCKED"]);

export function assertVerdict(status) {
  if (!STATUS.has(status)) throw new Error(`Veredito inválido: ${status}`);
  return status;
}

export function verdictFromFindings(findings) {
  if (findings.some((item) => item.severity === "P0" || item.severity === "P1")) return "FAIL";
  return "PASS";
}

export function worstSeverity(findings) {
  if (findings.some((item) => item.severity === "P0")) return "P0";
  if (findings.some((item) => item.severity === "P1")) return "P1";
  if (findings.some((item) => item.severity === "P2")) return "P2";
  return null;
}

export function contrastSeverity({ ratio, minimum, role }) {
  if (ratio >= minimum) return null;
  const primary = role === "heading" || role === "label" || role === "button" || role === "body" || role === "link";
  if (ratio < 3 && primary) return "P1";
  if (ratio < minimum && primary) return "P1";
  return "P2";
}

export function targetSeverity(minSide, kind) {
  if (minSide >= 44) return null;
  if (minSide < 24 && (kind === "button" || kind === "input" || kind === "summary")) return "P1";
  if (minSide < 44 && (kind === "button" || kind === "input" || kind === "summary")) return "P2";
  return null;
}

export function blockedResult(spec) {
  return {
    id: spec.id,
    area: spec.area,
    surface: spec.surface,
    profile: spec.profile,
    route: spec.route,
    status: "BLOCKED",
    severity: null,
    reason: spec.reason,
    recommendation: spec.reason,
    findings: [],
    evidence: [],
  };
}
