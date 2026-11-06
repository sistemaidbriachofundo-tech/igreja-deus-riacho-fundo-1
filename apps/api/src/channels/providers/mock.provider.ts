import type {
  ChannelProvider,
  ProviderSendInput,
  ProviderSendResult,
} from "./channel-provider";

/** Simula entrega bem-sucedida sem chamar rede externa. */
export class MockChannelProvider implements ChannelProvider {
  readonly mode = "mock" as const;

  constructor(readonly name: string) {}

  async send(input: ProviderSendInput): Promise<ProviderSendResult> {
    const providerMessageId = `mock_${input.channel.toLowerCase()}_${input.outboxId.slice(0, 8)}_${Date.now()}`;
    return {
      ok: true,
      providerMessageId,
      delivered: true,
      raw: {
        provider: this.name,
        mode: this.mode,
        to: input.toAddress,
        subject: input.subject ?? null,
        templateCode: input.templateCode ?? null,
      },
    };
  }
}
