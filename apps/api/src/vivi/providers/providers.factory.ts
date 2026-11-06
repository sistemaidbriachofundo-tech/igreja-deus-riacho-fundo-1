import { DEFAULT_GEMINI_MODEL, GeminiViviProvider } from "./gemini.provider";
import { ManusViviProvider } from "./manus.provider";
import { MockViviProvider } from "./mock.provider";
import type { ViviLlmProvider } from "./vivi-provider";

export type ViviProviderMode = "manus" | "gemini" | "mock";

export type ResolvedViviProviderConfig = {
  mode: ViviProviderMode;
  model: string;
  manusUrlConfigured: boolean;
  geminiKeyConfigured: boolean;
};

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

/** Resolve URL Manus: preferência `MANUS_FORGE_URL`, alias plataforma. */
export function resolveManusForgeUrl(): string {
  return (
    env("MANUS_FORGE_URL") ||
    env("BUILT_IN_FORGE_API_URL") ||
    env("MANUS_FORGE_API_URL")
  );
}

/** Resolve chave Manus: preferência `MANUS_API_KEY`, alias plataforma. */
export function resolveManusApiKey(): string {
  return (
    env("MANUS_API_KEY") ||
    env("BUILT_IN_FORGE_API_KEY") ||
    env("MANUS_FORGE_API_KEY")
  );
}

export function resolveGeminiApiKey(): string {
  return env("GEMINI_API_KEY");
}

export function resolveGeminiModel(): string {
  return env("GEMINI_MODEL") || DEFAULT_GEMINI_MODEL;
}

/**
 * Escolhe provider:
 * 1. `VIVI_PROVIDER` explícito (manus|gemini|mock)
 * 2. Senão: manus se URL+key Manus set; gemini se GEMINI_API_KEY; senão mock
 */
export function resolveViviProviderMode(): ViviProviderMode {
  const explicit = env("VIVI_PROVIDER").toLowerCase();
  if (explicit === "manus" || explicit === "gemini" || explicit === "mock") {
    return explicit;
  }

  const manusUrl = resolveManusForgeUrl();
  const manusKey = resolveManusApiKey();
  if (manusUrl && manusKey) return "manus";
  if (resolveGeminiApiKey()) return "gemini";
  return "mock";
}

export function describeViviProviderConfig(): ResolvedViviProviderConfig {
  const mode = resolveViviProviderMode();
  const model =
    mode === "gemini"
      ? resolveGeminiModel()
      : mode === "manus"
        ? env("MANUS_MODEL") || "auto"
        : "mock-vivi-idbrf";

  return {
    mode,
    model,
    manusUrlConfigured: Boolean(resolveManusForgeUrl()),
    geminiKeyConfigured: Boolean(resolveGeminiApiKey()),
  };
}

export function createViviProvider(
  fetchImpl?: typeof fetch,
): ViviLlmProvider {
  const mode = resolveViviProviderMode();

  if (mode === "manus") {
    const baseUrl = resolveManusForgeUrl();
    const apiKey = resolveManusApiKey();
    if (!baseUrl || !apiKey) {
      // Fallback seguro em DEV quando VIVI_PROVIDER=manus sem credenciais
      return new MockViviProvider("mock-manus-fallback");
    }
    return new ManusViviProvider({
      baseUrl,
      apiKey,
      model: env("MANUS_MODEL") || "auto",
      fetchImpl,
    });
  }

  if (mode === "gemini") {
    const apiKey = resolveGeminiApiKey();
    if (!apiKey) {
      return new MockViviProvider("mock-gemini-fallback");
    }
    return new GeminiViviProvider({
      apiKey,
      model: resolveGeminiModel(),
      fetchImpl,
    });
  }

  return new MockViviProvider();
}
