export interface StatementLineIdentity {
  postedAt: string;
  amountCents: number;
  description: string;
  externalRef: string | null;
}

/** Texto de extrato importado: sem controle, sem marcação e sem fórmula de planilha. */
export function sanitizeStatementText(value: string, fallback = "Movimento importado"): string {
  let cleaned = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    cleaned += code <= 31 || code === 127 || char === "<" || char === ">" ? " " : char;
  }
  cleaned = cleaned.replace(/\s+/g, " ").trim().slice(0, 180);
  if (!cleaned) return fallback;
  return /^[=+\-@]/.test(cleaned) ? `'${cleaned}` : cleaned;
}

export function statementIdentity(line: Pick<StatementLineIdentity, "postedAt" | "amountCents" | "description">): string {
  const day = line.postedAt.slice(0, 10);
  const description = sanitizeStatementText(line.description).toLocaleLowerCase("pt-BR");
  return `${day}|${line.amountCents}|${description}`;
}

/** Remove repetição no arquivo e contra linhas já gravadas da mesma conta. */
export function dedupeStatementLines<T extends StatementLineIdentity>(incoming: readonly T[], existing: readonly StatementLineIdentity[] = []): { kept: T[]; skipped: number } {
  const refs = new Set(existing.flatMap(line => line.externalRef ? [line.externalRef] : []));
  const identities = new Set(existing.map(statementIdentity));
  const kept: T[] = [];
  for (const line of incoming) {
    const description = sanitizeStatementText(line.description);
    const normalized = { ...line, description };
    const identity = statementIdentity(normalized);
    if ((normalized.externalRef && refs.has(normalized.externalRef)) || identities.has(identity)) continue;
    if (normalized.externalRef) refs.add(normalized.externalRef);
    identities.add(identity);
    kept.push(normalized);
  }
  return { kept, skipped: incoming.length - kept.length };
}
