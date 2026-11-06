import {
  BadGatewayException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ManusViviProvider } from "./manus.provider";

describe("ManusViviProvider", () => {
  it("posts OpenAI-compatible chat completions", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "chatcmpl_1",
        model: "auto",
        choices: [{ message: { content: "  Olá da Forge  " } }],
        usage: { total_tokens: 12 },
      }),
    });

    const provider = new ManusViviProvider({
      baseUrl: "https://forge.manus.im///",
      apiKey: "k",
      fetchImpl: fetchImpl as never,
    });

    const result = await provider.chat({
      messages: [{ role: "user", content: "Oi" }],
    });

    expect(result.content).toBe("Olá da Forge");
    expect(result.provider).toBe("manus");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://forge.manus.im/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer k",
        }),
      }),
    );
  });

  it("throws on empty content", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "  " } }] }),
    });
    const provider = new ManusViviProvider({
      baseUrl: "https://forge.manus.im/v1",
      apiKey: "k",
      fetchImpl: fetchImpl as never,
    });
    await expect(
      provider.chat({ messages: [{ role: "user", content: "x" }] }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it("maps network and HTTP errors", async () => {
    const down = new ManusViviProvider({
      baseUrl: "https://forge.manus.im",
      apiKey: "k",
      fetchImpl: jest.fn().mockRejectedValue(new Error("timeout")) as never,
    });
    await expect(
      down.chat({ messages: [{ role: "user", content: "x" }] }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    const rejected = new ManusViviProvider({
      baseUrl: "https://forge.manus.im",
      apiKey: "k",
      fetchImpl: jest.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { message: "quota" } }),
      }) as never,
    });
    await expect(
      rejected.chat({ messages: [{ role: "user", content: "x" }] }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
