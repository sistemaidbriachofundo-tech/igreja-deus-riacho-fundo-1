import { ServiceUnavailableException } from "@nestjs/common";
import { AuthClock } from "./auth-clock";
import {
  InMemorySessionStore,
  PrismaSessionStore,
  digestPresentedId,
} from "./session-store";
import { InMemoryMfaChallengeStore } from "../mfa/mfa-challenge.store";

describe("session and challenge stores", () => {
  it("keeps only the hash of the session id and revokes a family on demand", async () => {
    const store = new InMemorySessionStore(new AuthClock());
    const created = await store.create({
      userId: "user-1",
      familyId: "family-1",
      authzVersion: "v1",
      mfaSatisfied: true,
      expiresAtMs: Date.now() + 60_000,
    });
    const loaded = await store.get(created.sessionId);
    expect(loaded?.userId).toBe("user-1");
    expect(created.sessionId).not.toBe(digestPresentedId(created.sessionId));
    await store.revoke(created.sessionId, created.sessionId);
    expect((await store.get(created.sessionId))?.replacedById).toBe(
      digestPresentedId(created.sessionId),
    );
    await store.revokeFamily("family-1");
    expect((await store.get(created.sessionId))?.revokedAtMs).toBeTruthy();
  });

  it("burns a challenge on the second consume", async () => {
    const store = new InMemoryMfaChallengeStore(new AuthClock());
    const created = await store.create({
      userId: "user-1",
      purpose: "totp",
      expiresAtMs: Date.now() + 60_000,
    });
    expect(await store.consume(created.challengeId)).toBe("ok");
    expect(await store.consume(created.challengeId)).toBe("replay");
  });

  it("persists the session hash and hides database errors", async () => {
    const calls: string[] = [];
    const store = new PrismaSessionStore({
      $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        calls.push(`${strings.join(" ")} ${values.join(" ")}`);
        return 1;
      },
      $queryRaw: async () => [],
    } as never, new AuthClock());
    const created = await store.create({
      userId: "user-1",
      familyId: "family-1",
      authzVersion: "v1",
      mfaSatisfied: false,
      expiresAtMs: Date.now() + 1000,
    });
    expect(calls[0]).toContain("auth_sessions");
    expect(calls[0]).toContain(digestPresentedId(created.sessionId));
    expect(calls[0]).not.toContain(created.sessionId);
    expect(await store.get(created.sessionId)).toBeNull();

    const broken = new PrismaSessionStore({
      $executeRaw: async () => {
        throw new Error("relation auth_sessions does not exist password=leak otpauth://totp/secret");
      },
    } as never);
    await expect(
      broken.create({
        userId: "user-1",
        familyId: "family-1",
        authzVersion: "v1",
        mfaSatisfied: true,
        expiresAtMs: Date.now() + 1000,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
