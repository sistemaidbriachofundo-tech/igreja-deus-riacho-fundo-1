import type { ChannelProvider, ChannelProviders, CommChannel } from "./channel-provider";
import { MockChannelProvider } from "./mock.provider";
import { NoopChannelProvider } from "./noop.provider";

export type ProviderMode = "mock" | "noop";

function resolveMode(envKey: string, fallback: ProviderMode): ProviderMode {
  const raw = (process.env[envKey] ?? process.env.CHANNELS_PROVIDER ?? fallback)
    .trim()
    .toLowerCase();
  if (raw === "mock" || raw === "noop") return raw;
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
    push: build("push", resolveMode("PUSH_PROVIDER", "noop")),
  };
}

export function pickProvider(
  providers: ChannelProviders,
  channel: CommChannel,
): ChannelProvider {
  switch (channel) {
    case "WHATSAPP":
      return providers.whatsapp;
    case "EMAIL":
      return providers.email;
    case "PUSH":
      return providers.push;
    default: {
      const _exhaustive: never = channel;
      return _exhaustive;
    }
  }
}
