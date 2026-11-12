import { Prisma } from "@prisma/client";

// The auth tables store timestamp without time zone, with UTC as their convention.
export function utcTimestamp(value: Date | null) {
  return Prisma.sql`timezone('UTC', ${value?.toISOString() ?? null}::timestamptz)`;
}
