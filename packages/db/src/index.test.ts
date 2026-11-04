import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPrismaClient } from "./index";

describe("db package", () => {
  it("exports createPrismaClient", () => {
    assert.equal(typeof createPrismaClient, "function");
  });
});
