import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "./api";
import {
  accountProblem, changeMyPassword, newPasswordProblem, profilePhotoProblem, PROFILE_PHOTO_LIMIT,
  readMyAccount, readMyPhoto, saveMyPhone, saveMyPhoto,
} from "./my-account";

const profile = {
  name: "Pessoa Teste",
  email: "pessoa@example.test",
  phone: null,
  photoPath: "/account/me/photo",
  canEditProfilePhoto: true,
};

const image = new File(["fixture"], "foto.jpg", { type: "image/jpeg" });

describe("Minha conta", () => {
  const fetch = vi.fn<typeof globalThis.fetch>();

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
    vi.stubGlobal("fetch", fetch);
    fetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("altera somente o telefone da conta autenticada e permite limpá-lo", async () => {
    fetch.mockImplementation(async () => Response.json(profile));
    await expect(readMyAccount("test-session")).resolves.toEqual(profile);
    await saveMyPhone("test-session", " (61) 99999-9999 ");
    await saveMyPhone("test-session", " ");
    expect(fetch).toHaveBeenNthCalledWith(1, "https://api.example.test/account/me", expect.objectContaining({
      method: "GET", cache: "no-store", credentials: "omit", headers: { Authorization: "Bearer test-session" },
    }));
    expect(fetch).toHaveBeenNthCalledWith(2, "https://api.example.test/account/me", expect.objectContaining({
      method: "PATCH", body: JSON.stringify({ phone: "(61) 99999-9999" }),
    }));
    expect(fetch.mock.calls[2][1]?.body).toBe(JSON.stringify({ phone: null }));
  });

  it("envia as duas senhas somente no corpo e trata a resposta sem conteúdo", async () => {
    fetch.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(changeMyPassword("test-session", "OldFixture", "UmaChaveLonga123")).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith("https://api.example.test/account/me/password", expect.objectContaining({
      method: "POST", body: JSON.stringify({ currentPassword: "OldFixture", newPassword: "UmaChaveLonga123" }),
    }));
  });

  it("não envia o token a uma rota de foto indicada por um terceiro", async () => {
    for (const path of ["https://example.test/photo", "//example.test/photo", "/account/me/photo?other=1"]) {
      await expect(readMyPhoto("test-session", path)).rejects.toThrow("Rota de foto inválida.");
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("faz o upload multipart com sessão e lê apenas uma resposta de imagem", async () => {
    fetch.mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(new Response(image));
    await saveMyPhoto("test-session", image);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.example.test/account/me/photo");
    expect(init).toMatchObject({ method: "PUT", headers: { Authorization: "Bearer test-session" } });
    expect((init?.body as FormData).get("photo")).toEqual(image);
    await expect(readMyPhoto("test-session", profile.photoPath)).resolves.toMatchObject({ type: "image/jpeg" });
  });

  it("reduz uma imagem aceita antes que ultrapasse o limite do servidor", async () => {
    const close = vi.fn();
    const drawImage = vi.fn();
    const canvas = {
      width: 0, height: 0,
      getContext: () => ({ fillRect: vi.fn(), drawImage }),
      toBlob: (done: (blob: Blob) => void) => done(image),
    };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 3200, height: 2400, close }));
    vi.stubGlobal("document", { createElement: () => canvas });
    fetch.mockResolvedValue(new Response(null, { status: 204 }));
    const largePhoto = new File([new Uint8Array(4_850_000)], "camera.png", { type: "image/png" });
    await saveMyPhoto("test-session", largePhoto);
    expect([canvas.width, canvas.height]).toEqual([1600, 1200]);
    expect(drawImage).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    const sent = (fetch.mock.calls[0][1]?.body as FormData).get("photo") as File;
    expect(sent.type).toBe("image/jpeg");
    expect(sent.size).toBe(image.size);
  });

  it("bloqueia imagens vazias, grandes ou em formatos que não são aceitos", async () => {
    expect(profilePhotoProblem(new Blob([], { type: "image/jpeg" }))).toContain("vazia");
    expect(profilePhotoProblem(new Blob([new Uint8Array(PROFILE_PHOTO_LIMIT + 1)], { type: "image/png" }))).toContain("5 MB");
    await expect(saveMyPhoto("test-session", new File(["<svg/>"], "foto.svg", { type: "image/svg+xml" }))).rejects.toThrow("JPG");
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockResolvedValue(new Response("<svg/>", { headers: { "content-type": "image/svg+xml" } }));
    await expect(readMyPhoto("test-session", profile.photoPath)).rejects.toThrow("JPG");
  });

  it("valida os campos da senha e protege detalhes internos em erros", () => {
    const next = "UmaChaveLonga123";
    expect(newPasswordProblem("", next, next)).toContain("senha atual");
    expect(newPasswordProblem("atual", "curta", "curta")).toContain("14");
    expect(newPasswordProblem("atual", "uma chave longa 123", "uma chave longa 123")).toContain("sem espaços");
    expect(newPasswordProblem(next, next, next)).toContain("diferente");
    expect(newPasswordProblem("atual", next, "outra")).toContain("confirmação");
    expect(newPasswordProblem("atual", next, next)).toBeNull();
    expect(accountProblem(new ApiRequestError("private backend error", 403, "forbidden"), "photo")).not.toContain("private");
  });
});
