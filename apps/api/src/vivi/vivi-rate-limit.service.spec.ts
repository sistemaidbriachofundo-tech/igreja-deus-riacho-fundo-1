import { ViviRateLimitService } from "./vivi-rate-limit.service";

describe("ViviRateLimitService", () => {
  const prevPublic = process.env.VIVI_PUBLIC_RATE_MAX;
  const prevAdmin = process.env.VIVI_ADMIN_RATE_MAX;

  beforeEach(() => {
    process.env.VIVI_PUBLIC_RATE_MAX = "2";
    process.env.VIVI_ADMIN_RATE_MAX = "3";
  });

  afterEach(() => {
    process.env.VIVI_PUBLIC_RATE_MAX = prevPublic;
    process.env.VIVI_ADMIN_RATE_MAX = prevAdmin;
  });

  it("enforces strong public limit per key", () => {
    const svc = new ViviRateLimitService();
    expect(svc.tryConsume("public", "ip-1")).toBe(true);
    expect(svc.tryConsume("public", "ip-1")).toBe(true);
    expect(svc.tryConsume("public", "ip-1")).toBe(false);
    expect(svc.tryConsume("public", "ip-2")).toBe(true);
  });

  it("keeps admin bucket separate", () => {
    const svc = new ViviRateLimitService();
    expect(svc.tryConsume("admin", "u1")).toBe(true);
    expect(svc.tryConsume("admin", "u1")).toBe(true);
    expect(svc.tryConsume("admin", "u1")).toBe(true);
    expect(svc.tryConsume("admin", "u1")).toBe(false);
    const snap = svc.snapshot("admin", "u1");
    expect(snap.used).toBe(3);
    expect(snap.remaining).toBe(0);
  });
});
