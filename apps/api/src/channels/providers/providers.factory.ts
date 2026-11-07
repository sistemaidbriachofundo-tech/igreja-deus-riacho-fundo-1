import type { ChannelProvider, ChannelProviders, CommChannel } from "./channel-provider";
import { FcmMockProvider, FcmNoopProvider } from "./fcm.provider";
import { MockChannelProvider } from "./mock.provider";
import { NoopChannelProvider } from "./noop.provider";

export type ProviderMode = "mock" | "noop";

function resolveMode(envKey: string, fallback: ProviderMode): ProviderMode {
  const raw = (process.env[envKey] ?? process.env.CHANNELS_PROVIDER ?? fallback)
    .trim()
    .toLowerCase();
  if (raw === "mock" || raw === "noop") return raw;
  // "fcm" / "live" / SMTP / WABA etc. → noop (live deliberadamente ausente)
  return fallback;
}

function buildChannel(name: string, mode: ProviderMode): ChannelProvider {
  return mode === "mock"
    ? new MockChannelProvider(name)
    : new NoopChannelProvider(name);
}

function buildFcm(mode: ProviderMode): ChannelProvider {
  return mode === "mock" ? new FcmMockProvider() : new FcmNoopProvider();
}

/** Monta adapters a partir do env. Live WABA/SMTP/FCM deliberadamente ausentes. */
export function createChannelProviders(): ChannelProviders {
  return {
    whatsapp: buildChannel(
      "whatsapp",
      resolveMode("WHATSAPP_PROVIDER", "noop"),
    ),
    email: buildChannel("email", resolveMode("EMAIL_PROVIDER", "noop")),
    /** Push sempre via stub FCM (mock|noop) — nunca Firebase live. */
    push: buildFcm(resolveMode("PUSH_PROVIDER", "noop")),
  };
}

export function pickProvider(
  providers: ChannelProviders,
  channel: CommChannel,
): ChannelProvider {
  if (channel === "WHATSAPP") return providers.whatsapp;
  if (channel === "EMAIL") return providers.email;
  return providers.push;
}
