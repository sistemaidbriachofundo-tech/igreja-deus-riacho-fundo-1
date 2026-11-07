import { FcmMockProvider, FcmNoopProvider } from "./fcm.provider";

describe("Fcm providers (RF-025 stub)", () => {
  it("mock marks delivered without live Firebase", async () => {
    const provider = new FcmMockProvider();
    expect(provider.name).toBe("fcm");
    expect(provider.mode).toBe("mock");
    const result = await provider.send({
      outboxId: "outbox-12345678",
      channel: "PUSH",
      toAddress: "fcm-token-abc",
      body: "olá",
      templateCode: "push_alert",
    });
    expect(result.ok).toBe(true);
    expect(result.delivered).toBe(true);
    expect(result.providerMessageId).toMatch(/^fcm_mock_/);
    expect(result.raw?.live).toBe(false);
  });

  it("noop accepts without marking delivered", async () => {
    const provider = new FcmNoopProvider();
    expect(provider.name).toBe("fcm");
    expect(provider.mode).toBe("noop");
    const result = await provider.send({
      outboxId: "outbox-abcdefgh",
      channel: "PUSH",
      toAddress: "fcm-token-xyz",
      body: "noop",
    });
    expect(result.ok).toBe(true);
    expect(result.delivered).toBe(false);
    expect(result.providerMessageId).toMatch(/^fcm_noop_/);
    expect(result.raw?.live).toBe(false);
  });
});
