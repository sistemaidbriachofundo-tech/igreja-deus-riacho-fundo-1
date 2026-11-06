export type CommChannel = "WHATSAPP" | "EMAIL" | "PUSH";

export type ProviderSendInput = {
  outboxId: string;
  channel: CommChannel;
  toAddress: string;
  subject?: string | null;
  body: string;
  templateCode?: string | null;
  providerTemplateName?: string | null;
  payload?: Record<string, unknown> | null;
};

export type ProviderSendResult = {
  ok: boolean;
  providerMessageId?: string;
  /** Mock providers may mark as delivered immediately. */
  delivered?: boolean;
  raw?: Record<string, unknown>;
  errorMessage?: string;
};

export interface ChannelProvider {
  readonly name: string;
  readonly mode: "mock" | "noop";
  send(input: ProviderSendInput): Promise<ProviderSendResult>;
}

export type ChannelProviders = {
  whatsapp: ChannelProvider;
  email: ChannelProvider;
  push: ChannelProvider;
};
