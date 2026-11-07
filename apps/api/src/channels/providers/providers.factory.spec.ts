import {
  createChannelProviders,
  pickProvider,
} from "./providers.factory";

describe("providers.factory", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it("defaults to noop when unset", () => {
    delete process.env.CHANNELS_PROVIDER;
    delete process.env.WHATSAPP_PROVIDER;
    delete process.env.EMAIL_PROVIDER;
    delete process.env.PUSH_PROVIDER;
    const providers = createChannelProviders();
    expect(providers.whatsapp.mode).toBe("noop");
    expect(providers.email.mode).toBe("noop");
    expect(providers.push.mode).toBe("noop");
    expect(providers.push.name).toBe("fcm");
  });

  it("honors per-channel override and picks by channel", () => {
    process.env.CHANNELS_PROVIDER = "noop";
    process.env.WHATSAPP_PROVIDER = "mock";
    process.env.PUSH_PROVIDER = "mock";
    const providers = createChannelProviders();
    expect(providers.whatsapp.mode).toBe("mock");
    expect(pickProvider(providers, "EMAIL").name).toBe("email");
    expect(pickProvider(providers, "PUSH").name).toBe("fcm");
    expect(pickProvider(providers, "PUSH").mode).toBe("mock");
  });

  it("falls back to noop on invalid/live provider mode strings", () => {
    process.env.WHATSAPP_PROVIDER = "live-waba";
    process.env.EMAIL_PROVIDER = "smtp";
    process.env.PUSH_PROVIDER = "fcm";
    const providers = createChannelProviders();
    expect(providers.whatsapp.mode).toBe("noop");
    expect(providers.email.mode).toBe("noop");
    expect(providers.push.mode).toBe("noop");
    expect(providers.push.name).toBe("fcm");
  });

  it("push stub never marks live FCM (mock/noop only)", async () => {
    process.env.PUSH_PROVIDER = "mock";
    const mockPush = createChannelProviders().push;
    const mockResult = await mockPush.send({
      outboxId: "outbox-12345678",
      channel: "PUSH",
      toAddress: "fcm-token-abc",
      body: "olá",
    });
    expect(mockResult.ok).toBe(true);
    expect(mockResult.delivered).toBe(true);
    expect(mockResult.raw?.provider).toBe("fcm");

    process.env.PUSH_PROVIDER = "noop";
    const noopPush = createChannelProviders().push;
    const noopResult = await noopPush.send({
      outboxId: "outbox-abcdefgh",
      channel: "PUSH",
      toAddress: "fcm-token-xyz",
      body: "noop",
    });
    expect(noopResult.ok).toBe(true);
    expect(noopResult.delivered).toBe(false);
    expect(noopResult.raw?.provider).toBe("fcm");
  });
});
