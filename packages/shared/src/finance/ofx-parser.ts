/** Parser OFX/SGML mínimo (STMTTRN) — sem rede, sem dados bancários reais. */

export interface OfxParsedLine {
  postedAt: string;
  amountCents: number;
  description: string;
  externalRef: string | null;
}

export interface OfxParseResult {
  ok: boolean;
  lines: OfxParsedLine[];
  reason?: string;
}

/**
 * Extrai lançamentos de um extrato OFX (SGML clássico ou XML-ish).
 * Aceita tags `<STMTTRN>…</STMTTRN>`; valores em unidades (ex. 123.45 → 12345 cents).
 */
export function parseOfxLines(text: string): OfxParseResult {
  const raw = text?.trim() ?? "";
  if (!raw) {
    return { ok: false, lines: [], reason: "EMPTY_OFX" };
  }

  const blocks = extractStmtTrnBlocks(raw);
  if (!blocks.length) {
    return { ok: false, lines: [], reason: "NO_STMTTRN" };
  }

  const lines: OfxParsedLine[] = [];
  for (const block of blocks) {
    const amountRaw = tagValue(block, "TRNAMT");
    const dateRaw = tagValue(block, "DTPOSTED") ?? tagValue(block, "DTUSER");
    if (!amountRaw || !dateRaw) {
      continue;
    }
    const amountCents = parseOfxAmountToCents(amountRaw);
    if (amountCents === null || amountCents === 0) {
      continue;
    }
    const postedAt = parseOfxDate(dateRaw);
    if (!postedAt) {
      continue;
    }
    const name = tagValue(block, "NAME") ?? "";
    const memo = tagValue(block, "MEMO") ?? "";
    const description =
      [name, memo].map((s) => s.trim()).filter(Boolean).join(" — ") ||
      "OFX sem descrição";
    const fitid = tagValue(block, "FITID");
    const checknum = tagValue(block, "CHECKNUM");
    const externalRef = (fitid || checknum || null)?.trim() || null;
    lines.push({ postedAt, amountCents, description, externalRef });
  }

  if (!lines.length) {
    return { ok: false, lines: [], reason: "NO_VALID_TRN" };
  }
  return { ok: true, lines };
}

function extractStmtTrnBlocks(text: string): string[] {
  const blocks: string[] = [];
  const re = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    blocks.push(m[1] ?? "");
  }
  return blocks;
}

/** OFX SGML: `<TAG>value` ou `<TAG>value</TAG>`. */
function tagValue(block: string, tag: string): string | null {
  const closed = new RegExp(`<${tag}>([^<]*)</${tag}>`, "i").exec(block);
  if (closed?.[1] !== undefined) {
    return closed[1].trim();
  }
  const open = new RegExp(`<${tag}>([^\\n<]*)`, "i").exec(block);
  if (open?.[1] !== undefined) {
    return open[1].trim();
  }
  return null;
}

export function parseOfxAmountToCents(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return null;
  }
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) {
    return null;
  }
  return Math.round(n * 100);
}

/** YYYYMMDD[HHMMSS…] → ISO date (UTC midnight of calendar day). */
export function parseOfxDate(raw: string): string | null {
  // Descarta timezone bracket `[…]` sem regex com backtracking (S8786).
  const trimmed = raw.trim();
  const bracket = trimmed.indexOf("[");
  const withoutTz = bracket >= 0 ? trimmed.slice(0, bracket) : trimmed;
  const digits = withoutTz.replace(/\D/g, "");
  if (digits.length < 8) {
    return null;
  }
  const y = digits.slice(0, 4);
  const mo = digits.slice(4, 6);
  const d = digits.slice(6, 8);
  const iso = `${y}-${mo}-${d}`;
  const dt = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(dt.getTime())) {
    return null;
  }
  return iso;
}
