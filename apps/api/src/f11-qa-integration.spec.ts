import { assertDeployedAuthState, usesDurableAuthState } from "./auth/session/auth-state.tokens";
import { mfaBlockingEnabled, requiresStepUpMfa } from "./auth/privileged-roles";
import { assertDeployedRateLimit, usesSharedRateLimit } from "./common/simple-rate-limit.middleware";

const pastor = [{ roleCode: "PASTOR", organizationId: "org", churchId: "ch" }];

describe("integração F1.1 na QA", () => {
  it("não bloqueia o JWT privilegiado enquanto a flag está desligada", () => {
    const env = { F11_MFA_BLOCKING: "false" } as NodeJS.ProcessEnv;
    expect(mfaBlockingEnabled(env)).toBe(false);
    expect(requiresStepUpMfa(pastor, false, env)).toBe(false);
  });

  it("exige desafio para papel privilegiado quando a flag ou a produção ligam o bloqueio", () => {
    const flagged = { F11_MFA_BLOCKING: "true" } as NodeJS.ProcessEnv;
    const production = { IDBRF_RUNTIME_STAGE: "production", F11_MFA_BLOCKING: "false" } as NodeJS.ProcessEnv;
    expect(requiresStepUpMfa(pastor, false, flagged)).toBe(true);
    expect(requiresStepUpMfa(pastor, false, production)).toBe(true);
    expect(requiresStepUpMfa(
      [{ roleCode: "MEMBRO", organizationId: "org", churchId: "ch" }],
      false,
      flagged,
    )).toBe(false);
    expect(requiresStepUpMfa(pastor, true, { F11_MFA_BLOCKING: "false" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("recusa sessão em memória na Vercel e usa Prisma quando o ambiente tem várias instâncias", () => {
    expect(usesDurableAuthState({} as NodeJS.ProcessEnv)).toBe(false);
    expect(usesDurableAuthState({ VERCEL: "1" } as NodeJS.ProcessEnv)).toBe(true);
    expect(usesDurableAuthState({ AUTH_STATE_STORE: "prisma" } as NodeJS.ProcessEnv)).toBe(true);
    expect(() => assertDeployedAuthState({
      VERCEL: "1",
      AUTH_STATE_STORE: "memory",
    } as NodeJS.ProcessEnv)).toThrow(/memória/);
  });

  it("usa limite compartilhado na Vercel e recusa o modo só em memória", () => {
    expect(usesSharedRateLimit({} as NodeJS.ProcessEnv)).toBe(false);
    expect(usesSharedRateLimit({ VERCEL: "1" } as NodeJS.ProcessEnv)).toBe(true);
    expect(usesSharedRateLimit({ RATE_LIMIT_STORE: "shared" } as NodeJS.ProcessEnv)).toBe(true);
    expect(() => assertDeployedRateLimit({
      IDBRF_RUNTIME_STAGE: "production",
      RATE_LIMIT_STORE: "memory",
    } as NodeJS.ProcessEnv)).toThrow(/memória/);
  });
});
