import { clientAddress } from "./client-address";

describe("clientAddress", () => {
  it("uses the address already resolved by the HTTP adapter", () => {
    expect(clientAddress({ ip: "203.0.113.10" })).toBe("203.0.113.10");
    expect(clientAddress({ socket: { remoteAddress: "192.0.2.8" } })).toBe("192.0.2.8");
  });

  it("drops values that are not a single IP", () => {
    expect(clientAddress({ ip: "203.0.113.10, 198.51.100.4" })).toBe("unknown");
    expect(clientAddress({ ip: "not an ip" })).toBe("unknown");
    expect(clientAddress({})).toBe("unknown");
  });
});
