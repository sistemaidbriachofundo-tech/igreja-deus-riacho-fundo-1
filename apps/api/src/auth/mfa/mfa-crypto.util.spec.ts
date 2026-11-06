import { decryptTotpSecret, encryptTotpSecret } from "./mfa-crypto.util";

describe("mfa-crypto", () => {
  it("rejects malformed ciphertext", () => {
    expect(() => decryptTotpSecret("bad")).toThrow(/Formato/);
    expect(() => decryptTotpSecret("v2:a:b:c")).toThrow(/Formato/);
  });

  it("uses MFA_ENCRYPTION_KEY when set", () => {
    const prev = process.env.MFA_ENCRYPTION_KEY;
    process.env.MFA_ENCRYPTION_KEY = "dedicated-mfa-key-for-unit-tests-32!";
    const cipher = encryptTotpSecret("SECRETBASE32VALUE");
    expect(decryptTotpSecret(cipher)).toBe("SECRETBASE32VALUE");
    if (prev === undefined) delete process.env.MFA_ENCRYPTION_KEY;
    else process.env.MFA_ENCRYPTION_KEY = prev;
  });
});
