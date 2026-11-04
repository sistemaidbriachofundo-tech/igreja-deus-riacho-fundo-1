import { HttpException } from "@nestjs/common";
import { SimpleRateLimitMiddleware } from "./simple-rate-limit.middleware";

describe("SimpleRateLimitMiddleware", () => {
  const prevMax = process.env.RATE_LIMIT_MAX;
  const prevWin = process.env.RATE_LIMIT_WINDOW_MS;

  beforeEach(() => {
    process.env.RATE_LIMIT_MAX = "2";
    process.env.RATE_LIMIT_WINDOW_MS = "60000";
  });

  afterEach(() => {
    process.env.RATE_LIMIT_MAX = prevMax;
    process.env.RATE_LIMIT_WINDOW_MS = prevWin;
  });

  it("allows under limit and blocks over", () => {
    const mw = new SimpleRateLimitMiddleware();
    const req = {
      ip: "127.0.0.1",
      method: "POST",
      path: "/auth/login",
      socket: {},
    };
    const next = jest.fn();
    mw.use(req as never, {} as never, next);
    mw.use(req as never, {} as never, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(() => mw.use(req as never, {} as never, next)).toThrow(HttpException);
  });
});
