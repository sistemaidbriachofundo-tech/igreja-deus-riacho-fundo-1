import { timingSafeEqual } from "node:crypto";

/** Comparação em tempo constante. Token curto ou ausente nunca autoriza. */
export function metricsTokenMatches(
  expected: string | null,
  presented: string | string[] | undefined,
): boolean {
  if (!expected || expected.length < 16) return false;
  const raw = Array.isArray(presented) ? presented[0] : presented;
  const got = Buffer.from(raw ?? "", "utf8");
  const exp = Buffer.from(expected, "utf8");
  if (got.length !== exp.length) {
    timingSafeEqual(exp, exp);
    return false;
  }
  return timingSafeEqual(exp, got);
}
