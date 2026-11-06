import { ChannelRateLimitService } from "./channel-rate-limit.service";

describe("ChannelRateLimitService", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it("allows up to limit then rejects", () => {
    process.env.CHANNELS_EMAIL_RATE_MAX = "2";
    process.env.CHANNELS_EMAIL_RATE_WINDOW_MS = "60000";
    const svc = new ChannelRateLimitService();
    expect(svc.tryConsume("EMAIL", "church1")).toBe(true);
    expect(svc.tryConsume("EMAIL", "church1")).toBe(true);
    expect(svc.tryConsume("EMAIL", "church1")).toBe(false);
    const snap = svc.snapshot("EMAIL", "church1");
    expect(snap.used).toBe(2);
    expect(snap.remaining).toBe(0);
  });

  it("isolates buckets by church and channel", () => {
    process.env.CHANNELS_WHATSAPP_RATE_MAX = "1";
    const svc = new ChannelRateLimitService();
    expect(svc.tryConsume("WHATSAPP", "a")).toBe(true);
    expect(svc.tryConsume("WHATSAPP", "a")).toBe(false);
    expect(svc.tryConsume("WHATSAPP", "b")).toBe(true);
    expect(svc.tryConsume("EMAIL", "a")).toBe(true);
  });
});
