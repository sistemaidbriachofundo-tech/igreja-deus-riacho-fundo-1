import {
  buildOtpAuthUri,
  currentTotpCode,
  generateTotpSecret,
  verifyTotpCode,
} from "./totp.util";
import { decryptTotpSecret, encryptTotpSecret } from "./mfa-crypto.util";

describe("TOTP util", () => {
  it("round-trips encrypt/decrypt and verifies current code", () => {
    const secret = generateTotpSecret();
    const cipher = encryptTotpSecret(secret);
    expect(cipher.startsWith("v1:")).toBe(true);
    expect(decryptTotpSecret(cipher)).toBe(secret);

    const now = Date.now();
    const code = currentTotpCode(secret, now);
    expect(verifyTotpCode(secret, code, now)).toBe(true);
    expect(verifyTotpCode(secret, "000000", now)).toBe(false);
  });

  it("builds otpauth URI", () => {
    const uri = buildOtpAuthUri({
      secret: "JBSWY3DPEHPK3PXP",
      accountName: "ana.demo@example.test",
      issuer: "IDBRF",
    });
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
  });

  it("rejects non-digit codes and invalid Base32 (incl. padding strip)", () => {
    expect(verifyTotpCode("JBSWY3DPEHPK3PXP", "12ab56")).toBe(false);
    expect(verifyTotpCode("JBSWY3DPEHPK3PXP", "12345")).toBe(false);
    expect(() => verifyTotpCode("NOT!VALID", "123456")).toThrow(/Base32/);
    // Trailing '=' padding must be stripped without regex backtracking.
    const now = Date.now();
    const padded = "JBSWY3DPEHPK3PXP====";
    const code = currentTotpCode(padded, now);
    expect(verifyTotpCode(padded, code, now)).toBe(true);
  });
});
