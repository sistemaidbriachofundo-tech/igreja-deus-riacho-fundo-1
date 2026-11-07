import type { ChannelProvider, ChannelProviders, CommChannel } from "./channel-provider";
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

function build(name: string, mode: ProviderMode): ChannelProvider {
  return mode === "mock"
    ? new MockChannelProvider(name)
    : new NoopChannelProvider(name);
}

/** Monta adapters a partir do env. Live WABA/SMTP/FCM deliberadamente ausentes. */
export function createChannelProviders(): ChannelProviders {
  return {
    whatsapp: build(
      "whatsapp",
      resolveMode("WHATSAPP_PROVIDER", "noop"),
    ),
    email: build("email", resolveMode("EMAIL_PROVIDER", "noop")),
    /** Push = stub FCM (adapter name "fcm"); nunca Firebase live. */
    push: build("fcm", resolveMode("PUSH_PROVIDER", "noop")),
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
