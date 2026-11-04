import { describe, expect, it } from "vitest";
import { APP_SLUG } from "@idbrf/shared";

describe("web brand", () => {
  it("uses shared slug", () => {
    expect(APP_SLUG).toBe("igreja-deus-riacho-fundo-1");
  });
});
