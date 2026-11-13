/** Pix estático (BR Code) da conta da igreja. Não há gateway nem Mercado Pago. */

function field(id: string, value: string): string {
  if (!/^\d{2}$/.test(id) || value.length > 99) {
    throw new Error("Campo Pix inválido");
  }
  return id + String(value.length).padStart(2, "0") + value;
}

function ascii(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim();
}

/** CRC-16/CCITT-FALSE, o checksum do BR Code. */
export function pixCrc16(payload: string): string {
  let crc = 0xffff;
  for (let index = 0; index < payload.length; index += 1) {
    crc ^= payload.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function buildPixCopiaECola(input: {
  pixKey: string;
  merchantName: string;
  merchantCity: string;
  amountCents: number;
  txid: string;
}): string {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("Valor Pix inválido");
  }
  const merchant = field("00", "br.gov.bcb.pix") + field("01", input.pixKey.trim());
  const txid = input.txid.replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "EVENTO";
  const body =
    field("00", "01") +
    field("26", merchant) +
    field("52", "0000") +
    field("53", "986") +
    field("54", (input.amountCents / 100).toFixed(2)) +
    field("58", "BR") +
    field("59", (ascii(input.merchantName).slice(0, 25) || "IGREJA")) +
    field("60", (ascii(input.merchantCity).slice(0, 15) || "BRASILIA")) +
    field("62", field("05", txid)) +
    "6304";
  return body + pixCrc16(body);
}
