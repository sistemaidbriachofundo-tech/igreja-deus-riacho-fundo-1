/**
 * Helpers de dedupe assistida (RF-001).
 * Nunca faz merge automático — só normalização + score para UI/candidatos.
 */

export type PersonDedupeMatchReason =
  | "displayName"
  | "email"
  | "exactEmail"
  | "normalizedDisplayName"
  | "tokenOverlap";

export interface PersonDedupeCandidateInput {
  id: string;
  displayName: string;
  email: string | null;
}

/** Normaliza nome/e-mail para comparação (minúsculas, sem acento, espaços colapsados). */
export function normalizePersonSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9@._+\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizePersonName(value: string): string[] {
  return normalizePersonSearchText(value)
    .split(/[\s._+-]+/)
    .filter((t) => t.length >= 2);
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const t of setA) {
    if (setB.has(t)) inter += 1;
  }
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Score 0–1 e razões de match entre query e candidato.
 * exactEmail / nome normalizado exato → score alto (alerta forte).
 */
export function scorePersonDedupeMatch(
  query: { displayName?: string; email?: string; q?: string },
  candidate: PersonDedupeCandidateInput,
): { score: number; matchReasons: PersonDedupeMatchReason[] } {
  const reasons: PersonDedupeMatchReason[] = [];
  let score = 0;

  const qEmail = query.email?.trim().toLowerCase() || null;
  const candEmail = candidate.email?.trim().toLowerCase() || null;
  if (qEmail && candEmail) {
    if (qEmail === candEmail) {
      reasons.push("exactEmail", "email");
      score = Math.max(score, 0.99);
    } else if (candEmail.includes(qEmail) || qEmail.includes(candEmail)) {
      reasons.push("email");
      score = Math.max(score, 0.8);
    }
  }

  const freeQ = (query.q ?? query.displayName ?? "").trim();
  if (freeQ.length >= 2) {
    const qNorm = normalizePersonSearchText(freeQ);
    const nameNorm = normalizePersonSearchText(candidate.displayName);
    const qLower = freeQ.toLowerCase();
    const nameLower = candidate.displayName.toLowerCase();

    if (nameLower === qLower || nameNorm === qNorm) {
      reasons.push("normalizedDisplayName", "displayName");
      score = Math.max(score, 0.95);
    } else if (nameNorm.includes(qNorm) || qNorm.includes(nameNorm)) {
      reasons.push("displayName");
      if (!reasons.includes("normalizedDisplayName") && nameNorm === qNorm) {
        reasons.push("normalizedDisplayName");
      }
      score = Math.max(score, nameNorm === qNorm ? 0.95 : 0.78);
    } else {
      const overlap = jaccard(tokenizePersonName(freeQ), tokenizePersonName(candidate.displayName));
      if (overlap >= 0.5) {
        reasons.push("tokenOverlap");
        score = Math.max(score, 0.55 + overlap * 0.35);
      } else if (nameLower.includes(qLower) || qLower.includes(nameLower)) {
        reasons.push("displayName");
        score = Math.max(score, 0.7);
      }
    }

    if (candEmail && (candEmail.includes(qLower) || candEmail.includes(qNorm))) {
      if (!reasons.includes("email") && !reasons.includes("exactEmail")) {
        reasons.push("email");
        score = Math.max(score, 0.75);
      }
    }
  }

  if (reasons.length === 0) {
    return { score: 0, matchReasons: [] };
  }

  // Dual signal bump (nome + e-mail)
  const hasName = reasons.some((r) =>
    r === "displayName" || r === "normalizedDisplayName" || r === "tokenOverlap",
  );
  const hasEmail = reasons.some((r) => r === "email" || r === "exactEmail");
  if (hasName && hasEmail && score < 0.99) {
    score = Math.min(0.97, Math.max(score, 0.88));
  }

  return {
    score: Math.round(score * 1000) / 1000,
    matchReasons: [...new Set(reasons)],
  };
}

/** True quando o score indica alerta forte (FE deve bloquear create sem personId). */
export function isStrongPersonDedupeMatch(score: number, reasons: PersonDedupeMatchReason[]): boolean {
  if (reasons.includes("exactEmail")) return true;
  if (reasons.includes("normalizedDisplayName") && score >= 0.95) return true;
  return score >= 0.95;
}
