import { Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditImmutableError } from "./audit-command";

const FORBIDDEN_ACTIONS = [
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "upsert",
] as const;

/**
 * Sombra update/delete no delegate deste processo.
 * Não é privilégio de banco e não torna a trilha inviolável.
 */
export function lockAuditDelegate(delegate: Record<string, unknown>): void {
  for (const action of FORBIDDEN_ACTIONS) {
    Object.defineProperty(delegate, action, {
      configurable: true,
      enumerable: false,
      writable: true,
      value: () => Promise.reject(new AuditImmutableError()),
    });
  }
}

@Injectable()
export class AuditAppendOnlyGuard implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    try {
      const delegate = this.prisma.auditLog as unknown as Record<string, unknown>;
      if (delegate && typeof delegate === "object") {
        lockAuditDelegate(delegate);
      }
    } catch {
      return;
    }
  }
}
