import type {
  ChannelProvider,
  ProviderSendInput,
  ProviderSendResult,
} from "./channel-provider";

/**
 * Stub FCM — simula entrega sem chamar Google/Firebase.
 * Live FCM deliberadamente ausente (RF-025).
 */
export class FcmMockProvider implements ChannelProvider {
  readonly name = "fcm";
  readonly mode = "mock" as const;

  async send(input: ProviderSendInput): Promise<ProviderSendResult> {
    const providerMessageId = `fcm_mock_${input.outboxId.slice(0, 8)}_${Date.now()}`;
    return {
      ok: true,
      providerMessageId,
      delivered: true,
      raw: {
        provider: this.name,
        mode: this.mode,
        live: false,
        to: input.toAddress,
        templateCode: input.templateCode ?? null,
        note: "FCM mock — sem envio live",
      },
    };
  }
}

/**
 * Stub FCM noop — aceita o envio sem side-effect externo.
 */
export class FcmNoopProvider implements ChannelProvider {
  readonly name = "fcm";
  readonly mode = "noop" as const;

  async send(input: ProviderSendInput): Promise<ProviderSendResult> {
    return {
      ok: true,
      providerMessageId: `fcm_noop_${input.outboxId.slice(0, 8)}`,
      delivered: false,
      raw: {
        provider: this.name,
        mode: this.mode,
        live: false,
        to: input.toAddress,
        note: "FCM noop — mensagem não enviada a Firebase",
      },
    };
  }
}
