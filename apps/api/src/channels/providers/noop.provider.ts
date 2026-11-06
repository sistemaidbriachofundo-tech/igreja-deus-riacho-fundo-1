import type {
  ChannelProvider,
  ProviderSendInput,
  ProviderSendResult,
} from "./channel-provider";

/**
 * Aceita o envio e registra como "não enviado" (sem side-effect).
 * Útil quando chaves de provider ainda não existem.
 */
export class NoopChannelProvider implements ChannelProvider {
  readonly mode = "noop" as const;

  constructor(readonly name: string) {}

  async send(input: ProviderSendInput): Promise<ProviderSendResult> {
    return {
      ok: true,
      providerMessageId: `noop_${input.channel.toLowerCase()}_${input.outboxId.slice(0, 8)}`,
      delivered: false,
      raw: {
        provider: this.name,
        mode: this.mode,
        note: "Noop — mensagem não enviada a provedor externo",
        to: input.toAddress,
      },
    };
  }
}
