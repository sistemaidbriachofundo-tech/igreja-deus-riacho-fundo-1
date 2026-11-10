import { afterEach, describe, expect, it, vi } from "vitest";
import { clearPanelReads, readPanel } from "./panel-read";

afterEach(() => {
  clearPanelReads();
  vi.useRealTimers();
});

describe("leituras do painel", () => {
  it("une chamadas simultâneas do mesmo caminho", async () => {
    let calls = 0;
    const load = () => {
      calls += 1;
      return Promise.resolve({ ministries: ["Homens"] });
    };
    const [a, b] = await Promise.all([
      readPanel("token", "/ministries", load),
      readPanel("token", "/ministries", load),
    ]);
    expect(calls).toBe(1);
    expect(a).toEqual(b);
  });

  it("não guarda falha, para 401 e 403 voltarem a ser perguntados", async () => {
    let calls = 0;
    const load = () => {
      calls += 1;
      return Promise.reject(new Error("403"));
    };
    await expect(readPanel("token", "/indicators/summary", load)).rejects.toThrow("403");
    await expect(readPanel("token", "/indicators/summary", load)).rejects.toThrow("403");
    expect(calls).toBe(2);
  });

  it("reutiliza o sucesso por um instante e o botão atualizar pede de novo", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-10T12:00:00.000Z"));
    let calls = 0;
    const load = () => {
      calls += 1;
      return Promise.resolve(calls);
    };
    await readPanel("token", "/events", load);
    await readPanel("token", "/events", load);
    expect(calls).toBe(1);
    await readPanel("token", "/events", load, { fresh: true });
    expect(calls).toBe(2);
    vi.setSystemTime(new Date("2026-11-10T12:00:16.000Z"));
    await readPanel("token", "/events", load);
    expect(calls).toBe(3);
  });
});
