import { listBankAdapters, requireBankAdapter } from "./bank-adapters";

describe("bank-adapters", () => {
  const prev = process.env.BLOB_READ_WRITE_TOKEN;

  afterEach(() => {
    if (prev === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = prev;
  });

  it("lists adapters without live bank APIs", () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const list = listBankAdapters();
    expect(list.every((a) => a.live === false)).toBe(true);
    expect(list.map((a) => a.code)).toEqual([
      "FILE",
      "MOCK",
      "SICOOB",
      "BRB",
      "CORA",
    ]);
    expect(list.find((a) => a.code === "FILE")?.mode).toBe("file");
    expect(list.find((a) => a.code === "SICOOB")?.mode).toBe("mock");
  });

  it("mentions blob token when present without enabling live banks", () => {
    process.env.BLOB_READ_WRITE_TOKEN = "x";
    const file = listBankAdapters().find((a) => a.code === "FILE");
    expect(file?.note).toMatch(/BLOB_READ_WRITE_TOKEN/);
    expect(file?.live).toBe(false);
  });

  it("defaults adapter to FILE", () => {
    expect(requireBankAdapter()).toBe("FILE");
    expect(requireBankAdapter("mock")).toBe("MOCK");
    expect(requireBankAdapter("SICOOB")).toBe("SICOOB");
  });

  it("rejects unknown adapter codes", () => {
    expect(() => requireBankAdapter("LIVE")).toThrow(/INVALID_BANK_ADAPTER/);
  });
});
