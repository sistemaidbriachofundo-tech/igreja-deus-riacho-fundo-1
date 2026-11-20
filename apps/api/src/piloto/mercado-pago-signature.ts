import { createHmac, timingSafeEqual } from "node:crypto";

/** Manifesto oficial do Checkout Pro: id:<data.id>;request-id:<x-request-id>;ts:<ts>; */
export function mercadoPagoManifest(input: { dataId: string; requestId: string; ts: string }): string {
  return `id:${input.dataId};request-id:${input.requestId};ts:${input.ts};`;
}

export function signMercadoPagoManifest(secret: string, manifest: string): string {
  return createHmac("sha256", secret).update(manifest).digest("hex");
}

export function parseMercadoPagoSignature(header: string): { ts: string; v1: string } | null {
  const parts = new Map(header.split(",").map(part => {
    const separator = part.indexOf("=");
    if (separator < 0) return ["", ""] as const;
    return [part.slice(0, separator).trim(), part.slice(separator + 1).trim()] as const;
  }));
  const ts = parts.get("ts") ?? "";
  const v1 = parts.get("v1") ?? "";
  if (!/^\d+$/.test(ts) || !/^[a-f0-9]{64}$/i.test(v1)) return null;
  return { ts, v1 };
}

export function verifyMercadoPagoWebhook(input: {
  secret: string;
  signatureHeader: string;
  requestId: string;
  dataId: string;
}): boolean {
  const parsed = parseMercadoPagoSignature(input.signatureHeader ?? "");
  const dataId = input.dataId?.trim();
  const requestId = input.requestId?.trim();
  if (!parsed || !input.secret || !dataId || !requestId) return false;
  const expected = signMercadoPagoManifest(input.secret, mercadoPagoManifest({ dataId, requestId, ts: parsed.ts }));
  const left = Buffer.from(expected, "hex");
  const right = Buffer.from(parsed.v1, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}
