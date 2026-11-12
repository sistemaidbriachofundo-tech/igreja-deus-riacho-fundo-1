import { deriveClientIp, parseTrustedProxies } from "./client-ip";
import { loadObservabilityConfig } from "./config";
import { redactText } from "./redaction";
import { isSafeRequestId, resolveRequestId } from "./request-id";
import { normalizeRoute } from "./route";

const SENTINELS = [
  "ana@igreja.org",
  "123.456.789-09",
  "52998224725",
  "s3cret-db-pass",
  "hunter2-senha",
  "sigsecretvalue",
  "db.internal",
];

describe("observability redaction and request identity", () => {
  it("strips email, cpf, token, password, sql and connection strings", () => {
    const raw = [
      "user ana@igreja.org",
      "cpf 123.456.789-09",
      "doc 52998224725",
      "postgres://idbrf:s3cret-db-pass@db.internal:5432/app",
      "authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sigsecretvalue",
      "password=hunter2-senha",
      "SELECT email, cpf FROM users WHERE id = 1",
    ].join(" ");
    const masked = redactText(raw);
    for (const secret of SENTINELS) expect(masked).not.toContain(secret);
    expect(masked).toContain("[redacted]");
    expect(masked).not.toMatch(/\bselect\b/i);
  });

  it("accepts a safe request id and rejects jwt, cpf and injection", () => {
    expect(isSafeRequestId("req_ok_abcd")).toBe(true);
    const rejected = [
      "short",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sigsecretvalue",
      "123.456.789-09",
      "52998224725",
      "req_ok\nset",
      "req id value",
      "a".repeat(130),
    ];
    for (const value of rejected) {
      const resolved = resolveRequestId(value);
      expect(resolved.generated).toBe(true);
      expect(resolved.id.startsWith("req_")).toBe(true);
      expect(resolved.id).not.toContain("\n");
      expect(isSafeRequestId(value)).toBe(false);
    }
  });

  it("keeps a valid incoming id, including when the header is an array", () => {
    expect(resolveRequestId(["req_from_proxy", "other"]).id).toBe("req_from_proxy");
  });

  it("normalizes ids and query secrets out of the route", () => {
    expect(normalizeRoute("/persons?email=ana@igreja.org&cpf=123.456.789-09")).toBe("/persons");
    expect(normalizeRoute("/credentials/verify/super-secret-token")).toBe("/credentials/verify/:id");
    expect(normalizeRoute("/persons/11111111-1111-4111-8111-111111111111")).toBe("/persons/:id");
    expect(normalizeRoute("/persons/ana@igreja.org")).toBe("/persons/:id");
    expect(normalizeRoute("/public/vivi/chat")).toBe("/public/vivi/chat");
  });

  it("ignores a forged X-Forwarded-For when the peer is not a trusted proxy", () => {
    const options = { trustedProxies: ["10.0.0.0/8"], trustedHops: 1 };
    expect(deriveClientIp({
      remoteAddress: "203.0.113.9",
      forwardedFor: "198.51.100.10, 203.0.113.50",
    }, options)).toBe("203.0.113.9");
  });

  it("uses the rightmost untrusted hop when the peer is a trusted proxy", () => {
    const options = { trustedProxies: ["10.0.0.0/8"], trustedHops: 1 };
    expect(deriveClientIp({
      remoteAddress: "::ffff:10.0.0.5",
      forwardedFor: ["1.2.3.4, 203.0.113.50"],
    }, options)).toBe("203.0.113.50");
    expect(deriveClientIp({
      remoteAddress: "10.0.0.5",
      forwardedFor: "1.2.3.4, 203.0.113.50, 10.0.0.8",
    }, { trustedProxies: ["10.0.0.0/8"], trustedHops: 2 })).toBe("203.0.113.50");
  });

  it("does not treat a match-all proxy list or too many hops as trust", () => {
    expect(parseTrustedProxies("0.0.0.0/0, *, 127.0.0.1")).toEqual(["127.0.0.1"]);
    const config = loadObservabilityConfig({
      OBSERVABILITY_TRUSTED_PROXIES: "0.0.0.0/0",
      OBSERVABILITY_TRUSTED_HOPS: "99",
    });
    expect(config.trustedProxies).toEqual([]);
    expect(config.trustedHops).toBe(0);
    expect(deriveClientIp({
      remoteAddress: "203.0.113.9",
      forwardedFor: "198.51.100.10",
    }, { trustedProxies: config.trustedProxies, trustedHops: config.trustedHops })).toBe("203.0.113.9");
  });
});
