import { HttpException } from "@nestjs/common";
import { SimpleRateLimitMiddleware } from "./simple-rate-limit.middleware";

describe("SimpleRateLimitMiddleware", () => {
  const prevMax = process.env.RATE_LIMIT_MAX;
  const prevWin = process.env.RATE_LIMIT_WINDOW_MS;
  const prevViviMax = process.env.VIVI_PUBLIC_RATE_MAX;
  const prevViviWin = process.env.VIVI_PUBLIC_RATE_WINDOW_MS;

  beforeEach(() => {
    process.env.RATE_LIMIT_MAX = "2";
    process.env.RATE_LIMIT_WINDOW_MS = "60000";
    process.env.VIVI_PUBLIC_RATE_MAX = "2";
    process.env.VIVI_PUBLIC_RATE_WINDOW_MS = "60000";
  });

  afterEach(() => {
    process.env.RATE_LIMIT_MAX = prevMax;
    process.env.RATE_LIMIT_WINDOW_MS = prevWin;
    process.env.VIVI_PUBLIC_RATE_MAX = prevViviMax;
    process.env.VIVI_PUBLIC_RATE_WINDOW_MS = prevViviWin;
  });

  it("allows under limit and blocks over", () => {
    const mw = new SimpleRateLimitMiddleware();
    const req = {
      ip: "127.0.0.1",
      method: "POST",
      path: "/auth/login",
      headers: {},
      socket: {},
    };
    const next = jest.fn();
    mw.use(req as never, {} as never, next);
    mw.use(req as never, {} as never, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(() => mw.use(req as never, {} as never, next)).toThrow(HttpException);
  });

  it("limits public vivi chat without trusting a spoofed X-Forwarded-For", () => {
    const mw = new SimpleRateLimitMiddleware();
    const next = jest.fn();
    const call = (forwarded: string) =>
      mw.use(
        {
          ip: "10.0.0.1",
          method: "POST",
          path: "/public/vivi/chat",
          headers: { "x-forwarded-for": forwarded },
          socket: {},
        } as never,
        {} as never,
        next,
      );
    call("203.0.113.50, 10.0.0.1");
    call("203.0.113.51, 10.0.0.1");
    expect(next).toHaveBeenCalledTimes(2);
    try {
      call("198.51.100.20");
      throw new Error("expected rate limit");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const body = (err as HttpException).getResponse() as { code: string };
      expect(body.code).toBe("VIVI_RATE_LIMITED");
    }
  });

  it("fails closed when the shared store is unavailable", async () => {
    const previous = process.env.RATE_LIMIT_STORE;
    process.env.RATE_LIMIT_STORE = "shared";
    try {
      const mw = new SimpleRateLimitMiddleware({
        hit: async () => {
          throw new Error("db down");
        },
      });
      const next = jest.fn();
      mw.use(
        {
          ip: "127.0.0.1",
          method: "POST",
          path: "/auth/login",
          headers: { "x-forwarded-for": "203.0.113.8" },
          socket: {},
        } as never,
        {} as never,
        next,
      );
      await new Promise((resolve) => setImmediate(resolve));
      expect(next).toHaveBeenCalledTimes(1);
      const error = next.mock.calls[0]?.[0] as HttpException;
      expect(error).toBeInstanceOf(HttpException);
      expect((error.getResponse() as { code: string }).code).toBe("RATE_LIMIT_UNAVAILABLE");
    } finally {
      if (previous === undefined) delete process.env.RATE_LIMIT_STORE;
      else process.env.RATE_LIMIT_STORE = previous;
    }
  });
});
