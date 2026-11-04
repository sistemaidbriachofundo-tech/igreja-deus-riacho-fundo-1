import { PrismaClient } from "@prisma/client";

export { PrismaClient } from "@prisma/client";
export type {
  Organization,
  Church,
  Person,
  User,
  Role,
  Grant,
  AuditLog,
  PersonStatus,
  UserStatus,
} from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

/** Singleton Prisma para DEV (evita esgotar conexões no hot-reload). */
export function createPrismaClient(): PrismaClient {
  return (
    globalForPrisma.prisma ??
    new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    })
  );
}

export const prisma = createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
