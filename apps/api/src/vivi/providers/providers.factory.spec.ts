import {
  createViviProvider,
  describeViviProviderConfig,
  resolveViviProviderMode,
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
  });

  it("prefers manus when forge url+key present", () => {
    process.env.MANUS_FORGE_URL = "https://forge.manus.im";
    process.env.MANUS_API_KEY = "secret";
    expect(resolveViviProviderMode()).toBe("manus");
    expect(createViviProvider().name).toBe("manus");
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
});
