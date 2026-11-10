import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readSourceSha } from "./source-sha";

const SHA = "ca00a4fd2c5d1f87cca815c3822a35cb9a92c3c2";

describe("readSourceSha", () => {
  it("aceita SOURCE_SHA completo", () => {
    assert.equal(readSourceSha({ SOURCE_SHA: SHA.toUpperCase() }), SHA);
  });

  it("usa o SHA da Vercel quando SOURCE_SHA não veio", () => {
    assert.equal(readSourceSha({ VERCEL_GIT_COMMIT_SHA: SHA }), SHA);
  });

  it("ignora SHA curto, vazio e o GITHUB_SHA do Pages", () => {
    assert.equal(readSourceSha({ SOURCE_SHA: SHA.slice(0, 7) }), null);
    assert.equal(readSourceSha({ SOURCE_SHA: "main" }), null);
    assert.equal(readSourceSha({ GITHUB_SHA: SHA }), null);
    assert.equal(readSourceSha({}), null);
  });
});
