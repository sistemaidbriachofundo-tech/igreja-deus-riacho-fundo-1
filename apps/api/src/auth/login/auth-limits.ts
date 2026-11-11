function boundedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const whole = Math.floor(parsed);
  if (whole < min || whole > max) {
    return fallback;
  }
  return whole;
}

export const authLimits = {
  loginFailures: () => boundedInt(process.env.AUTH_LOGIN_FAILURE_LIMIT, 8, 3, 30),
  loginWindowMs: () =>
    boundedInt(process.env.AUTH_LOGIN_WINDOW_MS, 15 * 60 * 1000, 60_000, 24 * 60 * 60 * 1000),
  mfaFailures: () => boundedInt(process.env.AUTH_MFA_FAILURE_LIMIT, 10, 3, 30),
  mfaWindowMs: () =>
    boundedInt(process.env.AUTH_MFA_WINDOW_MS, 15 * 60 * 1000, 60_000, 24 * 60 * 60 * 1000),
  challengeAttempts: () => boundedInt(process.env.AUTH_MFA_CHALLENGE_ATTEMPTS, 5, 3, 10),
  challengeTtlMs: () =>
    boundedInt(process.env.AUTH_MFA_CHALLENGE_TTL_MS, 5 * 60 * 1000, 30_000, 15 * 60 * 1000),
  enrollTtlMs: () =>
    boundedInt(process.env.AUTH_MFA_ENROLL_TTL_MS, 10 * 60 * 1000, 60_000, 20 * 60 * 1000),
  enrollReads: () => boundedInt(process.env.AUTH_MFA_ENROLL_READS, 5, 1, 10),
  accessTtlSeconds: () => boundedInt(process.env.JWT_EXPIRES_SECONDS, 3600, 60, 3600),
};
