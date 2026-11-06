import {
  assertViviProviderConfigForBoot,
  createViviProvider,
  describeViviProviderConfig,
  resolveViviProviderMode,
  validateViviProviderConfig,
} from "./providers.factory";

describe("vivi providers.factory", () => {
  const keys = [
    "VIVI_PROVIDER",
    "MANUS_FORGE_URL",
    "MANUS_API_KEY",
    "BUILT_IN_FORGE_API_URL",
    "BUILT_IN_FORGE_API_KEY",
    "GEMINI_API_KEY",
    "GEMINI_MODEL",
  ] as const;
  const backup: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of keys) {
      backup[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of keys) {
      if (backup[k] === undefined) delete process.env[k];
      else process.env[k] = backup[k];
    }
  });

  it("defaults to mock when no credentials", () => {
    expect(resolveViviProviderMode()).toBe("mock");
    expect(createViviProvider().name).toBe("mock");
    const v = validateViviProviderConfig();
    expect(v.credentialsReady).toBe(false);
    expect(v.effectiveProvider).toBe("mock");
    expect(v.configWarnings.some((w) => /mock/i.test(w))).toBe(true);
  });

  it("prefers manus when forge url+key present", () => {
    process.env.MANUS_FORGE_URL = "https://forge.manus.im";
    process.env.MANUS_API_KEY = "secret";
    expect(resolveViviProviderMode()).toBe("manus");
    expect(createViviProvider().name).toBe("manus");
    expect(validateViviProviderConfig().credentialsReady).toBe(true);
  });

  it("accepts BUILT_IN_FORGE_* aliases", () => {
    process.env.BUILT_IN_FORGE_API_URL = "https://forge.manus.im";
    process.env.BUILT_IN_FORGE_API_KEY = "secret";
    expect(resolveViviProviderMode()).toBe("manus");
  });

  it("uses gemini when only GEMINI_API_KEY set", () => {
    process.env.GEMINI_API_KEY = "gk-test";
    process.env.GEMINI_MODEL = "gemini-2.5-flash-lite";
    expect(resolveViviProviderMode()).toBe("gemini");
    const p = createViviProvider();
    expect(p.name).toBe("gemini");
    expect(p.model).toBe("gemini-2.5-flash-lite");
  });

  it("honors explicit VIVI_PROVIDER=mock", () => {
    process.env.VIVI_PROVIDER = "mock";
    process.env.GEMINI_API_KEY = "gk-test";
    expect(resolveViviProviderMode()).toBe("mock");
    expect(describeViviProviderConfig().mode).toBe("mock");
  });

  it("falls back to mock when manus/gemini requested without credentials", () => {
    process.env.VIVI_PROVIDER = "manus";
    expect(createViviProvider().name).toBe("mock");
    const manus = validateViviProviderConfig();
    expect(manus.credentialsReady).toBe(false);
    expect(manus.usingMockFallback).toBe(true);
    expect(manus.configWarnings.length).toBeGreaterThan(0);

    process.env.VIVI_PROVIDER = "gemini";
    expect(createViviProvider().name).toBe("mock");
    const gemini = validateViviProviderConfig();
    expect(gemini.configWarnings.some((w) => /GEMINI_API_KEY/i.test(w))).toBe(
      true,
    );
  });

  it("describes gemini model when mode is gemini", () => {
    process.env.GEMINI_API_KEY = "gk";
    process.env.GEMINI_MODEL = "gemini-2.5-flash-lite";
    const cfg = describeViviProviderConfig();
    expect(cfg.mode).toBe("gemini");
    expect(cfg.effectiveProvider).toBe("gemini");
    expect(cfg.model).toBe("gemini-2.5-flash-lite");
    expect(cfg.geminiKeyConfigured).toBe(true);
    expect(cfg.credentialsReady).toBe(true);
  });

  it("throws in production when explicit provider lacks credentials", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    process.env.VIVI_PROVIDER = "manus";
    expect(() => assertViviProviderConfigForBoot("production")).toThrow(
      /Vivi misconfig/,
    );
    process.env.VIVI_PROVIDER = "gemini";
    expect(() => assertViviProviderConfigForBoot("production")).toThrow(
      /GEMINI_API_KEY|Vivi misconfig/,
    );
    warn.mockRestore();
  });

  it("does not throw in production for explicit mock or ready manus", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    process.env.VIVI_PROVIDER = "mock";
    expect(() => assertViviProviderConfigForBoot("production")).not.toThrow();

    process.env.VIVI_PROVIDER = "manus";
    process.env.MANUS_FORGE_URL = "https://forge.manus.im";
    process.env.MANUS_API_KEY = "secret";
    expect(() => assertViviProviderConfigForBoot("production")).not.toThrow();
    warn.mockRestore();
  });

  it("does not throw in development when manus lacks credentials", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    process.env.VIVI_PROVIDER = "manus";
    expect(() => assertViviProviderConfigForBoot("development")).not.toThrow();
    warn.mockRestore();
  });
});
