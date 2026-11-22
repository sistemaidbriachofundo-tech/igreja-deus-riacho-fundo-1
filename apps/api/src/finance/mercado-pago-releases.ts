import { BadRequestException } from "@nestjs/common";
import { parseString } from "@fast-csv/parse";
import { createHash } from "node:crypto";

const columns = ["DATE", "RECORD_TYPE", "SOURCE_ID", "NET_CREDIT_AMOUNT", "NET_DEBIT_AMOUNT"];
const balanceRows = new Set(["initial_available_balance", "available_balance", "total"]);
const maxLines = 20_000;

function cents(text = ""): number {
  const value = text.trim().replace(",", ".");
  if (!value) return 0;
  if (!/^\d{1,11}(?:\.\d{1,2})?$/.test(value)) throw new Error("amount");
  const [whole, decimal = ""] = value.split(".");
  return Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
}

export async function parseMercadoPagoReleases(content: string) {
  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  const parser = parseString<Record<string, string>, Record<string, string>>(content, {
    delimiter: firstLine.includes(";") ? ";" : ",",
    headers: names => names.map(name => (name ?? "").trim().toUpperCase()),
    ignoreEmpty: true,
    strictColumnHandling: true,
    trim: true,
  });
  let compatibleHeader = false;
  parser.on("headers", (headers: string[]) => { compatibleHeader = columns.every(name => headers.includes(name)); });
  parser.on("data-invalid", () => parser.destroy(new Error("row")));
  const movements: { postedAt: string; amountCents: number; description: string; externalRef: string }[] = [];
  try {
    for await (const input of parser) {
      const row = input as Record<string, string>;
      if (!compatibleHeader) throw new Error("header");
      const recordType = (row.RECORD_TYPE ?? "").toLowerCase();
      if (balanceRows.has(recordType)) continue;
      if (recordType !== "release") throw new Error("record");
      const currency = row.CURRENCY?.trim().toUpperCase();
      if (currency && currency !== "BRL") throw new Error("currency");
      const credit = cents(row.NET_CREDIT_AMOUNT);
      const debit = cents(row.NET_DEBIT_AMOUNT);
      if (credit === 0 && debit === 0) continue;
      const amountCents = credit - debit;
      if (!amountCents || (credit && debit) || Math.abs(amountCents) > 2_147_483_647) throw new Error("amount");
      const date = (row.DATE ?? "").trim();
      const timestamp = Date.parse(date);
      const sourceId = row.SOURCE_ID;
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:?\d{2})$/.test(date) ||
          !Number.isFinite(timestamp) || !sourceId || sourceId.length > 100 || movements.length >= maxLines) {
        throw new Error("movement");
      }
      const postedAt = new Date(timestamp).toISOString();
      const category = row.DESCRIPTION?.slice(0, 120) || "Liberação";
      const identity = JSON.stringify([sourceId, postedAt, amountCents, category]);
      const fingerprint = createHash("sha256").update(identity).digest("hex").slice(0, 24);
      movements.push({
        postedAt, amountCents,
        description: `Mercado Pago · ${category} · ${sourceId}`,
        externalRef: `mercado-pago:${sourceId}:${fingerprint}`,
      });
    }
    if (!compatibleHeader || !movements.length) throw new Error("empty");
    return movements;
  } catch {
    throw new BadRequestException("Envie o relatório de liberações do Mercado Pago em CSV, com valores em reais e identificação das operações.");
  }
}
