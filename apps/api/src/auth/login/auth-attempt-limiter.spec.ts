import { HttpException, ServiceUnavailableException } from "@nestjs/common";
import { AuthClock } from "../session/auth-clock";
import { PrismaAuthAttemptLimiter } from "./auth-attempt-limiter";
import { InMemoryAuthAttemptLimiter } from "./auth-attempt-limiter";

describe("InMemoryAuthAttemptLimiter", () => {
  it("blocks a key after the limit and resets it", async () => {
    const limiter = new InMemoryAuthAttemptLimiter(new AuthClock());
    await limiter.recordFailure("pw:abc", 60_000);
    await limiter.recordFailure("pw:abc", 60_000);
    await limiter.assertAllowed("pw:abc", 3, 60_000);
    await limiter.recordFailure("pw:abc", 60_000);
    await expect(limiter.assertAllowed("pw:abc", 3, 60_000)).rejects.toBeInstanceOf(HttpException);
    await limiter.reset("pw:abc");
    await expect(limiter.assertAllowed("pw:abc", 3, 60_000)).resolves.toBeUndefined();
  });
});

describe("PrismaAuthAttemptLimiter", () => {
  it("fails closed when the table is missing and blocks a full window", async () => {
    const broken = new PrismaAuthAttemptLimiter({
      $queryRaw: async () => {
        throw new Error("relation auth_attempt_windows does not exist");
      },
      $executeRaw: async () => 0,
    } as never);
    await expect(broken.assertAllowed("pw:abc", 3, 60_000)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    const rows = new Map<string, { failures: number; window_started_at: Date }>();
    const limiter = new PrismaAuthAttemptLimiter({
      $queryRaw: async (_strings: TemplateStringsArray, key: string) => {
        const row = rows.get(key);
        return row ? [row] : [];
      },
      $executeRaw: async () => 1,
    } as never);
    rows.set("pw:abc", { failures: 8, window_started_at: new Date() });
    await expect(limiter.assertAllowed("pw:abc", 8, 60_000)).rejects.toBeInstanceOf(HttpException);
  });
});
