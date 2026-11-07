import {
  BadGatewayException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  postJsonForProvider,
  redactSecrets,
  requireNonEmptyText,
  stripTrailingSlashes,
} from "./http-json";

describe("vivi http-json helpers", () => {
  it("strips trailing slashes without regex", () => {
    expect(stripTrailingSlashes("https://forge.manus.im///")).toBe(
      "https://forge.manus.im",
    );
    expect(stripTrailingSlashes("https://forge.manus.im")).toBe(
      "https://forge.manus.im",
    );
  });

  it("maps network failure to ServiceUnavailable", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(
      postJsonForProvider(
        fetchImpl as never,
        "https://example.test/v1",
        { headers: {}, body: {} },
        {
          unavailableMessage: "down",
          unavailableCode: "UNAV",
          rejectMessage: "rej",
          rejectCode: "REJ",
        },
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("maps non-ok HTTP to BadGateway with custom detail", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: "quota" } }),
    });
    await expect(
      postJsonForProvider(
        fetchImpl as never,
        "https://example.test/v1",
        { headers: { Authorization: "Bearer x" }, body: { a: 1 } },
        {
          unavailableMessage: "down",
          unavailableCode: "UNAV",
          rejectMessage: "rej",
          rejectCode: "REJ",
          rejectDetail: (b) => b.error,
        },
      ),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it("returns body when ok even if json parse fails", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error("bad json");
      },
    });
    await expect(
      postJsonForProvider(
        fetchImpl as never,
        "https://example.test/v1",
        { headers: {}, body: {} },
        {
          unavailableMessage: "down",
          unavailableCode: "UNAV",
          rejectMessage: "rej",
          rejectCode: "REJ",
        },
      ),
    ).resolves.toEqual({});
  });

  it("requireNonEmptyText rejects blanks", () => {
    expect(requireNonEmptyText("  hi  ", "e", "C")).toBe("hi");
    expect(() => requireNonEmptyText("  ", "empty", "EMPTY")).toThrow(
      BadGatewayException,
    );
  });

  it("redacts API keys and bearer tokens from error details", () => {
    expect(
      redactSecrets(
        "fetch failed https://generativelanguage.googleapis.com/v1?key=SECRET123&x=1",
      ),
    ).toBe(
      "fetch failed https://generativelanguage.googleapis.com/v1?key=[REDACTED]&x=1",
    );
    expect(redactSecrets("Bearer sk-live-abc")).toBe("Bearer [REDACTED]");
    expect(
      redactSecrets({ authorization: "Bearer x", nested: { api_key: "z" } }),
    ).toEqual({ authorization: "[REDACTED]", nested: { api_key: "[REDACTED]" } });
  });

  it("redacts secrets in ServiceUnavailable detail", async () => {
    const fetchImpl = jest
      .fn()
      .mockRejectedValue(
        new Error("GET https://x.test/v1?key=LEAKED failed"),
      );
    try {
      await postJsonForProvider(
        fetchImpl as never,
        "https://example.test/v1",
        { headers: {}, body: {} },
        {
          unavailableMessage: "down",
          unavailableCode: "UNAV",
          rejectMessage: "rej",
          rejectCode: "REJ",
        },
      );
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceUnavailableException);
      const body = (err as ServiceUnavailableException).getResponse() as {
        detail: string;
      };
      expect(body.detail).toContain("key=[REDACTED]");
      expect(body.detail).not.toContain("LEAKED");
    }
  });
});
