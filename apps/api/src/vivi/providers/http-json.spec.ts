import {
  BadGatewayException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  postJsonForProvider,
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
});
