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

  it("uses VIVI_PUBLIC_RATE_MAX and X-Forwarded-For for public vivi chat", () => {
    const mw = new SimpleRateLimitMiddleware();
    const req = {
      ip: "10.0.0.1",
      method: "POST",
      path: "/public/vivi/chat",
      headers: { "x-forwarded-for": "203.0.113.50, 10.0.0.1" },
      socket: {},
    };
    const next = jest.fn();
    mw.use(req as never, {} as never, next);
    mw.use(req as never, {} as never, next);
    expect(next).toHaveBeenCalledTimes(2);
    try {
      mw.use(req as never, {} as never, next);
      throw new Error("expected rate limit");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const body = (err as HttpException).getResponse() as { code: string };
      expect(body.code).toBe("VIVI_RATE_LIMITED");
    }
  });

  it("accepts X-Forwarded-For as array header value", () => {
    const mw = new SimpleRateLimitMiddleware();
    const req = {
      ip: "10.0.0.9",
      method: "POST",
      path: "/auth/login",
      headers: { "x-forwarded-for": ["198.51.100.10, 10.0.0.9"] },
      socket: {},
    };
    const next = jest.fn();
    mw.use(req as never, {} as never, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
