import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RiachinhoPublicChat } from "../components/RiachinhoPublicChat";
import {
  parseRiachinhoAnswer, parseRiachinhoStatus, prepareRiachinhoPublicRequest,
  requestRiachinhoPublicAnswer,
  riachinhoProviderReady, riachinhoPublicEnabled, riachinhoPublicError,
} from "./riachinho-public-api";

const geminiStatus = {
  assistant: "vivi",
  displayName: "Riachinho",
  provider: "gemini",
  model: "gemini-3.5-flash-lite",
  geminiKeyConfigured: true,
  manusKeyConfigured: false,
  manusUrlConfigured: false,
  lgpdNotice: "Não compartilhe dados pessoais",
  notes: [],
} as const;

describe("Riachinho — visitor chat", () => {
  it("is explicitly opt-in and never fetches an unconfigured or insecure API", () => {
    expect(riachinhoPublicEnabled(undefined, undefined)).toBe(false);
    expect(riachinhoPublicEnabled("false", "https://id-riacho1-api-hml.vercel.app")).toBe(false);
    expect(riachinhoPublicEnabled("true", "http://not-secure.example")).toBe(false);
    expect(riachinhoPublicEnabled("true", "https://id-riacho1-api-hml.vercel.app")).toBe(true);
  });

  it("recognizes Gemini status without pretending that mock mode is real AI", () => {
    const parsed = parseRiachinhoStatus(geminiStatus);
    expect(parsed?.displayName).toBe("Riachinho");
    const legacyStatus = Object.fromEntries(Object.entries(geminiStatus).filter(([key]) => key !== "displayName"));
    expect(parseRiachinhoStatus(legacyStatus)?.displayName).toBe("Riachinho");
    expect(riachinhoProviderReady(parsed)).toBe(true);
    expect(riachinhoProviderReady(parseRiachinhoStatus({...geminiStatus,provider:"mock"}))).toBe(false);
    expect(riachinhoProviderReady(parseRiachinhoStatus({...geminiStatus,geminiKeyConfigured:false}))).toBe(false);
    expect(parseRiachinhoStatus({provider:"gemini"})).toBeNull();
  });

  it("requires explicit consent before sending a public request", () => {
    expect(() => prepareRiachinhoPublicRequest([], "Olá", "visitor-demo", false)).toThrow("consentimento");
    expect(prepareRiachinhoPublicRequest([], "Ministérios?", "visitor-demo", true)).toEqual({
      messages: [{role:"user",content:"Ministérios?"}],
      consentAiProcessing:true,
      sessionId:"visitor-demo",
    });
    expect(() => prepareRiachinhoPublicRequest([], "x".repeat(1801), "visitor-demo", true)).toThrow();
  });

  it("trims conversation history within the backend message budget and rejects system messages", () => {
    const history = Array.from({length:16}, (_,i)=>({
      role: i===0?"system":i%2?"assistant":"user",
      content:"A".repeat(1700),
    })) as Array<{role:"user"|"assistant"|"system";content:string}>;
    const payload = prepareRiachinhoPublicRequest(history, "Pergunta", "visitor", true);
    expect(payload.messages.length).toBeLessThanOrEqual(10);
    expect(payload.messages[payload.messages.length-1]).toEqual({role:"user",content:"Pergunta"});
    expect(payload.messages.every(m=>m.role!=="system")).toBe(true);
    expect(payload.messages.reduce((n,m)=>n+m.content.length,0)).toBeLessThanOrEqual(7200);
  });

  it("accepts only structured answer bodies and translates rate-limit errors", () => {
    const valid = {reply:"Veja a seção de Ministérios.",provider:"gemini",model:"gemini-3.5-flash-lite",refused:false,lgpdNotice:"LGPD",usage:{inputChars:10,outputChars:31,messageCount:1,latencyMs:100}};
    expect(parseRiachinhoAnswer(valid)?.reply).toBe(valid.reply);
    expect(parseRiachinhoAnswer({...valid,reply:""})).toBeNull();
    expect(parseRiachinhoAnswer({reply:"Sem estrutura"})).toBeNull();
    expect(riachinhoPublicError(429,{code:"VIVI_RATE_LIMITED"})).toContain("Aguarde");
    expect(riachinhoPublicError(400,{code:"VIVI_CONSENT_REQUIRED"})).toContain("autorizar");
  });

  it("renders a visible accessible launcher only when explicitly enabled for HML", () => {
    const prevFlag = process.env.NEXT_PUBLIC_RIACHINHO_PUBLIC_ENABLED;
    const prevApi = process.env.NEXT_PUBLIC_API_URL;
    try {
      process.env.NEXT_PUBLIC_RIACHINHO_PUBLIC_ENABLED = "true";
      process.env.NEXT_PUBLIC_API_URL = "https://id-riacho1-api-hml.vercel.app";
      const html = renderToStaticMarkup(<RiachinhoPublicChat/>);
      expect(html).toContain("Pergunte ao Riachinho");
      expect(html).toContain("aria-expanded");
      expect(html).not.toContain("GEMINI_API_KEY");
      expect(html).not.toContain("Bearer ");
      process.env.NEXT_PUBLIC_RIACHINHO_PUBLIC_ENABLED = "false";
      expect(renderToStaticMarkup(<RiachinhoPublicChat/>)).toBe("");
    } finally {
      if (prevFlag === undefined) delete process.env.NEXT_PUBLIC_RIACHINHO_PUBLIC_ENABLED;
      else process.env.NEXT_PUBLIC_RIACHINHO_PUBLIC_ENABLED = prevFlag;
      if (prevApi === undefined) delete process.env.NEXT_PUBLIC_API_URL;
      else process.env.NEXT_PUBLIC_API_URL = prevApi;
    }
  });
  it("posts to the public endpoint only, never sends auth headers or browser credentials", async () => {
    const request = prepareRiachinhoPublicRequest([], "Como visitar?", "session-test", true);
    const answer = { reply: "Confira a página Primeira visita.", provider: "gemini", model: "gemini-test", refused: false, lgpdNotice: "LGPD" };
    const fetcher = vi.fn(async () => new Response(JSON.stringify(answer), { status: 201 }));
    const result = await requestRiachinhoPublicAnswer("https://id-riacho1-api-hml.vercel.app", request, fetcher);
    expect(result.reply).toBe(answer.reply);
    expect(fetcher).toHaveBeenCalledWith(
      "https://id-riacho1-api-hml.vercel.app/public/vivi/chat",
      expect.objectContaining({
        method: "POST",
        mode: "cors",
        credentials: "omit",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(request),
      }),
    );
  });

  it("blocks public requests without explicit consent before calling the network", async () => {
    const request = { ...prepareRiachinhoPublicRequest([], "Olá", "sessao", true), consentAiProcessing: false };
    const fetcher = vi.fn(async () => new Response("{}"));
    await expect(requestRiachinhoPublicAnswer("https://example.org", request, fetcher))
      .rejects.toThrow("consentimento");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("never exposes a simulated response as Gemini output", async () => {
    const request = prepareRiachinhoPublicRequest([], "Olá", "sessao", true);
    const mockAnswer = { reply: "Texto sintético", provider: "mock", model: "demo", refused: false, lgpdNotice: "LGPD" };
    await expect(requestRiachinhoPublicAnswer("https://example.org", request, async () =>
      new Response(JSON.stringify(mockAnswer), { status: 201 }),
    )).rejects.toThrow("simulação");
  });

  it("distinguishes rate limit, transport failure and invalid successful bodies", async () => {
    const request = prepareRiachinhoPublicRequest([], "Olá", "sessao", true);
    await expect(requestRiachinhoPublicAnswer("https://example.org", request, async () =>
      new Response(JSON.stringify({ code: "VIVI_RATE_LIMITED" }), { status: 429 }),
    )).rejects.toThrow("Aguarde");
    await expect(requestRiachinhoPublicAnswer("https://example.org", request, async () => {
      throw new Error("network unavailable");
    })).rejects.toThrow("preservada");
    await expect(requestRiachinhoPublicAnswer("https://example.org", request, async () =>
      new Response("<html>not json</html>", { status: 201 }),
    )).rejects.toThrow("válida");
  });

  it("refuses insecure API URLs outside local development", async () => {
    const request = prepareRiachinhoPublicRequest([], "Olá", "sessao", true);
    const fetcher = vi.fn(async () => new Response("{}"));
    await expect(requestRiachinhoPublicAnswer("http://invalid.example", request, fetcher))
      .rejects.toThrow("segura");
    expect(fetcher).not.toHaveBeenCalled();
  });

});
