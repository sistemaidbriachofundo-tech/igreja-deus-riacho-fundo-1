import { createHash } from "node:crypto";

/**
 * Cadeia SHA-256 por congregação, calculada no processo aplicativo.
 * Um elo íntegro não prova que o banco é inviolável: quem reescreve a
 * linha e o hash junto apaga o rasto. Elo quebrado também não distingue
 * adulteração de defeito. Não há âncora externa nesta frente.
 */
export const AUDIT_CHAIN_VERSION = 1;
export const AUDIT_GENESIS_HASH = "a".repeat(64);
export const AUDIT_LEGACY_HASH = "b".repeat(64);

const CONTROL_KEYS = new Set([
  "prevId",
  "prevHash",
  "entryHash",
  "chainVersion",
  "outcome",
  "correlationId",
]);

export interface AuditChainLink {
  prevId: string | null;
  prevHash: string;
  entryHash: string;
}

export interface AuditChainInput {
  prevId: string | null;
  prevHash: string;
  actorUserId: string | null;
  organizationId: string;
  churchId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: string;
  correlationId: string | null;
  createdAt: Date;
  metadata: Record<string, unknown>;
}

export interface AuditChainRow {
  id: string;
  organizationId: string | null;
  churchId: string | null;
  createdAt: Date;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actorUserId: string | null;
  metadata: unknown;
}

export interface AuditChainReport {
  provesInviolability: false;
  intact: boolean;
  checked: number;
  legacy: number;
  brokenAt: string | null;
}

export function metadataForHash(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(metadata)) {
    if (!CONTROL_KEYS.has(key)) {
      out[key] = metadata[key];
    }
  }
  return out;
}

export function hashAuditEntry(input: AuditChainInput): string {
  const lines = [
    String(AUDIT_CHAIN_VERSION),
    input.prevId ?? "",
    input.prevHash,
    input.actorUserId ?? "",
    input.organizationId,
    input.churchId ?? "",
    input.action,
    input.resourceType,
    input.resourceId ?? "",
    input.outcome,
    input.correlationId ?? "",
    input.createdAt.toISOString(),
    canonical(metadataForHash(input.metadata)),
  ];
  return createHash("sha256").update(lines.join("\n"), "utf8").digest("hex");
}

export function linkFromPrevious(
  previous: { id: string; metadata: unknown } | null,
): Pick<AuditChainLink, "prevId" | "prevHash"> {
  if (!previous) {
    return { prevId: null, prevHash: AUDIT_GENESIS_HASH };
  }
  const entryHash = readHash(previous.metadata);
  return {
    prevId: previous.id,
    prevHash: entryHash ?? AUDIT_LEGACY_HASH,
  };
}

export function sealAuditMetadata(
  base: Record<string, unknown>,
  input: Omit<AuditChainInput, "metadata">,
): { metadata: Record<string, unknown>; entryHash: string } {
  const entryHash = hashAuditEntry({ ...input, metadata: base });
  return {
    entryHash,
    metadata: {
      ...base,
      outcome: input.outcome,
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      chainVersion: AUDIT_CHAIN_VERSION,
      prevHash: input.prevHash,
      entryHash,
      ...(input.prevId ? { prevId: input.prevId } : {}),
    },
  };
}

export function verifyAuditChain(
  rows: readonly AuditChainRow[],
): AuditChainReport {
  const streams = new Map<string, AuditChainRow[]>();
  for (const row of rows) {
    const key = `${row.organizationId ?? ""}\n${row.churchId ?? ""}`;
    const list = streams.get(key) ?? [];
    list.push(row);
    streams.set(key, list);
  }

  let checked = 0;
  let legacy = 0;
  let brokenAt: string | null = null;

  for (const list of streams.values()) {
    list.sort(
      (left, right) =>
        left.createdAt.getTime() - right.createdAt.getTime() ||
        (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    );
    for (let index = 0; index < list.length; index += 1) {
      const row = list[index];
      if (!row) {
        continue;
      }
      const meta = asRecord(row.metadata);
      const entryHash = typeof meta?.entryHash === "string" ? meta.entryHash : null;
      if (!entryHash) {
        legacy += 1;
        continue;
      }
      checked += 1;
      const outcome = typeof meta?.outcome === "string" ? meta.outcome : "";
      const correlationId =
        typeof meta?.correlationId === "string" ? meta.correlationId : null;
      const prevId = typeof meta?.prevId === "string" ? meta.prevId : null;
      const prevHash = typeof meta?.prevHash === "string" ? meta.prevHash : "";
      const expected = hashAuditEntry({
        prevId,
        prevHash,
        actorUserId: row.actorUserId,
        organizationId: row.organizationId ?? "",
        churchId: row.churchId,
        action: row.action,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        outcome,
        correlationId,
        createdAt: row.createdAt,
        metadata: meta ?? {},
      });
      if (expected !== entryHash || !linkMatches(list, index, prevId, prevHash)) {
        brokenAt = row.id;
        break;
      }
    }
    if (brokenAt) {
      break;
    }
  }

  return {
    provesInviolability: false,
    intact: brokenAt === null,
    checked,
    legacy,
    brokenAt,
  };
}

function linkMatches(
  list: readonly AuditChainRow[],
  index: number,
  prevId: string | null,
  prevHash: string,
): boolean {
  const previous = index > 0 ? list[index - 1] : undefined;
  if (!previous) {
    if (prevId === null) {
      return prevHash === AUDIT_GENESIS_HASH;
    }
    return true;
  }
  const previousHash = readHash(previous.metadata);
  if (!previousHash) {
    return prevId === previous.id && prevHash === AUDIT_LEGACY_HASH;
  }
  return prevId === previous.id && prevHash === previousHash;
}

function readHash(metadata: unknown): string | null {
  const record = asRecord(metadata);
  const value = record?.entryHash;
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    return null;
  }
  if (/^\d+$/.test(value)) {
    return null;
  }
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function canonical(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonical(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    // A ordem de código UTF-16 preserva o hash de registros já gravados.
    const keys = Object.keys(record).sort((left, right) => (left < right ? -1 : Number(left > right)));
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  return "null";
}
