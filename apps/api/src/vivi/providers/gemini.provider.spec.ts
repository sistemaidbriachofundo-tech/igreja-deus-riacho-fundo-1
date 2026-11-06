import { BadGatewayException } from "@nestjs/common";
import {
  DEFAULT_GEMINI_MODEL,
  GeminiViviProvider,
} from "./gemini.provider";

describe("GeminiViviProvider", () => {
  it("defaults to flash-lite model id", () => {
    expect(DEFAULT_GEMINI_MODEL).toBe("gemini-2.5-flash-lite");
    const p = new GeminiViviProvider({ apiKey: "x" });
    expect(p.model).toBe("gemini-2.5-flash-lite");
  });

  it("calls generateContent REST and maps roles", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: { parts: [{ text: "Bem-vindo à IDBRF" }] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: { totalTokenCount: 20 },
      }),
    });

    const provider = new GeminiViviProvider({
      apiKey: "gk",
      model: "gemini-2.5-flash-lite",
      fetchImpl: fetchImpl as never,
    });

    const result = await provider.chat({
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "Horários?" },
        { role: "assistant", content: "…" },
        { role: "user", content: "E ministérios?" },
      ],
    });

    expect(result.content).toBe("Bem-vindo à IDBRF");
    expect(result.provider).toBe("gemini");
    expect(result.model).toBe("gemini-2.5-flash-lite");

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("models/gemini-2.5-flash-lite:generateContent");
    expect(url).toContain("key=gk");
    const body = JSON.parse(String(init.body)) as {
      systemInstruction: { parts: Array<{ text: string }> };
      contents: Array<{ role: string }>;
    };
    expect(body.systemInstruction.parts[0]?.text).toBe("sys");
    expect(body.contents.map((c) => c.role)).toEqual([
      "user",
      "model",
      "user",
    ]);
  });

  it("throws when candidate empty", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [] } }] }),
    });
    const provider = new GeminiViviProvider({
      apiKey: "gk",
      fetchImpl: fetchImpl as never,
    });
    await expect(
      provider.chat({ messages: [{ role: "user", content: "oi" }] }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
