import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseOfxAmountToCents,
  parseOfxDate,
  parseOfxLines,
} from "./ofx-parser";

describe("ofx-parser", () => {
  it("parses STMTTRN blocks with FITID and signed amounts", () => {
    const ofx = `
OFXHEADER:100
DATA:OFXSGML
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261102
<TRNAMT>250.00
<FITID>SYN-OFX-001
<NAME>TED OFERTA DEMO
<MEMO>culto domingo
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261103
<TRNAMT>-45.00
<FITID>SYN-OFX-002
<NAME>TARIFA
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

    const result = parseOfxLines(ofx);
    assert.equal(result.ok, true);
    assert.equal(result.lines.length, 2);
    assert.equal(result.lines[0]?.amountCents, 25000);
    assert.equal(result.lines[0]?.externalRef, "SYN-OFX-001");
    assert.equal(result.lines[0]?.postedAt, "2026-11-02");
    assert.match(result.lines[0]?.description ?? "", /TED OFERTA DEMO/);
    assert.equal(result.lines[1]?.amountCents, -4500);
  });

  it("rejects empty or STMTTRN-less payloads", () => {
    assert.equal(parseOfxLines("").ok, false);
    assert.equal(parseOfxLines("<OFX></OFX>").reason, "NO_STMTTRN");
  });

  it("parses amount and date helpers", () => {
    assert.equal(parseOfxAmountToCents("12.34"), 1234);
    assert.equal(parseOfxAmountToCents("-1,5"), -150);
    assert.equal(parseOfxAmountToCents("x"), null);
    assert.equal(parseOfxDate("20261115"), "2026-11-15");
    assert.equal(parseOfxDate("20261115120000[-3:BRT]"), "2026-11-15");
    assert.equal(parseOfxDate("bad"), null);
  });
});
