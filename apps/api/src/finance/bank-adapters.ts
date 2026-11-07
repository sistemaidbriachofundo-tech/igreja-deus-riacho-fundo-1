import {
  BANK_IMPORT_ADAPTERS,
  type BankImportAdapterCode,
} from "@idbrf/shared";

export type BankAdapterMode = "file" | "mock";

export interface BankAdapterInfo {
  code: BankImportAdapterCode;
  mode: BankAdapterMode;
  live: false;
  note: string;
}

/**
 * Adapters bancários — **sem** conexão live Sicoob/BRB/Cora.
 * FILE = parse do `textContent` enviado; MOCK = mesmo caminho com rótulo explícito;
 * SICOOB/BRB/CORA = rótulos de arquivo (normalização futura) — nunca HTTP ao banco.
 *
 * `BLOB_READ_WRITE_TOKEN` / Vercel Blob (se presente) é só storage de mídia CMS —
 * não habilita API bancária.
 */
export function listBankAdapters(): BankAdapterInfo[] {
  const hasVercelBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
  const storageNote = hasVercelBlob
    ? "BLOB_READ_WRITE_TOKEN presente (CMS/mídia) — sem efeito em adapters bancários"
    : "sem BLOB_READ_WRITE_TOKEN — storage financeiro = STORAGE_ROOT local privado";

  return BANK_IMPORT_ADAPTERS.map((code) => {
    if (code === "FILE") {
      return {
        code,
        mode: "file" as const,
        live: false as const,
        note: `Importação de arquivo (CSV/OFX/PDF_META). ${storageNote}`,
      };
    }
    if (code === "MOCK") {
      return {
        code,
        mode: "mock" as const,
        live: false as const,
        note: "Adapter mock — mesmo parser de arquivo; para HML sem credencial bancária",
      };
    }
    return {
      code,
      mode: "mock" as const,
      live: false as const,
      note: `${code}: sem API live nesta fatia — envie OFX/CSV via textContent (arquivo). Credenciais bancárias não são lidas.`,
    };
  });
}

export function requireBankAdapter(raw?: string): BankImportAdapterCode {
  const code = (raw?.trim().toUpperCase() || "FILE") as BankImportAdapterCode;
  if (!BANK_IMPORT_ADAPTERS.includes(code)) {
    throw new Error(`INVALID_BANK_ADAPTER:${code}`);
  }
  return code;
}
