import { DEFAULT_GEMINI_MODEL, GeminiViviProvider } from "./gemini.provider";
import { ManusViviProvider } from "./manus.provider";
import { MockViviProvider } from "./mock.provider";
import type { ViviLlmProvider } from "./vivi-provider";

export type ViviProviderMode = "manus" | "gemini" | "mock";

export type ResolvedViviProviderConfig = {
  mode: ViviProviderMode;
  /** Provider efetivo após fallback (mock se credenciais ausentes). */
  effectiveProvider: ViviProviderMode;
  model: string;
  manusUrlConfigured: boolean;
  manusKeyConfigured: boolean;
  geminiKeyConfigured: boolean;
  /** true quando o provider escolhido tem credenciais para chamar LLM real. */
  credentialsReady: boolean;
  usingMockFallback: boolean;
  configWarnings: string[];
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

/**
 * Valida env do provider Vivi e devolve avisos claros.
 * Em production, `assertViviProviderConfigForBoot` falha se VIVI_PROVIDER
 * explícito manus/gemini estiver sem key (evita HML “live” em mock silencioso).
 */
export function validateViviProviderConfig(): {
  mode: ViviProviderMode;
  effectiveProvider: ViviProviderMode;
  credentialsReady: boolean;
  usingMockFallback: boolean;
  configWarnings: string[];
} {
  const mode = resolveViviProviderMode();
  const explicit = env("VIVI_PROVIDER").toLowerCase();
  const manusUrl = resolveManusForgeUrl();
  const manusKey = resolveManusApiKey();
  const geminiKey = resolveGeminiApiKey();
  const warnings: string[] = [];

  let credentialsReady = false;

  if (mode === "manus") {
    if (manusUrl && manusKey) {
      credentialsReady = true;
    } else {
      const label = explicit === "manus" ? "VIVI_PROVIDER=manus" : "provider manus";
      if (!manusUrl) {
        warnings.push(
          `${label} sem MANUS_FORGE_URL (ou BUILT_IN_FORGE_API_URL) — usando mock`,
        );
      }
      if (!manusKey) {
        warnings.push(
          `${label} sem MANUS_API_KEY (ou BUILT_IN_FORGE_API_KEY) — usando mock`,
        );
      }
    }
  } else if (mode === "gemini") {
    if (geminiKey) {
      credentialsReady = true;
    } else {
      warnings.push(
        "VIVI_PROVIDER=gemini sem GEMINI_API_KEY — usando mock",
      );
    }
  } else if (!manusUrl && !manusKey && !geminiKey) {
    warnings.push(
      "Vivi em mock (sem MANUS_* / GEMINI_API_KEY). OK em DEV; HML live exige credenciais.",
    );
  }

  const effectiveProvider: ViviProviderMode =
    credentialsReady ? mode : "mock";

  return {
    mode,
    effectiveProvider,
    credentialsReady,
    usingMockFallback: !credentialsReady,
    configWarnings: warnings,
  };
}

/**
 * Fail-fast no boot HML/PRD quando provider explícito não tem key.
 * DEV/test: só registra avisos (não throw).
 */
export function assertViviProviderConfigForBoot(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): void {
  const validation = validateViviProviderConfig();
  const isProd = (nodeEnv ?? "").trim() === "production";
  const explicit = env("VIVI_PROVIDER").toLowerCase();

  for (const w of validation.configWarnings) {
    console.warn(`[vivi] ${w}`);
  }

  if (
    isProd &&
    (explicit === "manus" || explicit === "gemini") &&
    !validation.credentialsReady
  ) {
    throw new Error(
      `Vivi misconfig: VIVI_PROVIDER=${explicit} sem credenciais em NODE_ENV=production. ` +
        `Configure MANUS_FORGE_URL+MANUS_API_KEY ou GEMINI_API_KEY, ou use VIVI_PROVIDER=mock. ` +
        validation.configWarnings.join(" | "),
    );
  }
}

export function describeViviProviderConfig(): ResolvedViviProviderConfig {
  const validation = validateViviProviderConfig();
  const mode = validation.mode;
  const model =
    mode === "gemini"
      ? resolveGeminiModel()
      : mode === "manus"
        ? env("MANUS_MODEL") || "auto"
        : "mock-vivi-idbrf";

  return {
    mode,
    effectiveProvider: validation.effectiveProvider,
    model: validation.usingMockFallback && mode !== "mock"
      ? `mock-${mode}-fallback`
      : model,
    manusUrlConfigured: Boolean(resolveManusForgeUrl()),
    manusKeyConfigured: Boolean(resolveManusApiKey()),
    geminiKeyConfigured: Boolean(resolveGeminiApiKey()),
    credentialsReady: validation.credentialsReady,
    usingMockFallback: validation.usingMockFallback,
    configWarnings: validation.configWarnings,
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
